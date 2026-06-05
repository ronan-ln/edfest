#!/usr/bin/env python3
"""Fetch performance availability for every event slug in offers_all.json."""

import argparse
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

OFFERS_FILE = "/Users/ronan/perso/edfest/offers_all.json"
OUTPUT_DIR = "/Users/ronan/perso/edfest/data"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "availability.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0",
    "Accept": "*/*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Referer": "https://edfest.com/offers",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}


def load_offers(path):
    with open(path) as f:
        return json.load(f)


def load_existing(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Warning: could not load existing {path}: {e}", file=sys.stderr)
        return {}


def save_results(path, results):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(results, f, indent=2)
    os.replace(tmp, path)


def fetch_performances(session, slug):
    url = f"https://edfest.com/api/projects/{slug}/performances"
    resp = session.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_performance_detail(session, slug, perf_id):
    """Fetch individual performance for live availability."""
    url = f"https://edfest.com/api/projects/{slug}/performances/{perf_id}"
    resp = session.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_perf_with_logging(session, slug, perf):
    """Fetch individual performance detail and log results. Only save if it has TIMESGIVEAWAY."""
    perf_id = perf.get("id")
    datetime_str = perf.get("datetime")
    try:
        detail = fetch_performance_detail(session, slug, perf_id)
        remaining = detail.get("prices", [{}])[0].get("concessions", [])
        remaining_value = next((c.get("remainingLimitValue") for c in remaining if c.get("code") == "TIMESGIVEAWAY"), None)
        if remaining_value is not None:
            print(f"  • {datetime_str} (id: {perf_id}) - slots: {remaining_value}")
            return detail
        return None
    except requests.RequestException as e:
        print(f"  • {datetime_str} (id: {perf_id}) - ERROR: {e}", file=sys.stderr)
        return None


def is_within_date_range(datetime_str):
    """Check if datetime is between Aug 5-12 inclusive."""
    try:
        dt = datetime.fromisoformat(datetime_str.replace(' ', 'T'))
        return dt.month == 8 and 5 <= dt.day <= 12
    except (ValueError, AttributeError):
        return False


TIMESGIVEAWAY_CODE = "TIMESGIVEAWAY"


def has_timesgiveaway_concession(performance):
    """Return True if the performance has any concession with code == TIMESGIVEAWAY."""
    for price in performance.get("prices") or []:
        for conc in price.get("concessions") or []:
            if (conc.get("code") or "") == TIMESGIVEAWAY_CODE:
                return True
    return False


def filter_timesgiveaway_performances(performances):
    """Keep all performances (filter by actual TIMESGIVEAWAY in individual fetches)."""
    return performances or []


def count_timesgiveaway_available(performances):
    """Count performances whose TIMESGIVEAWAY concession still has stock."""
    count = 0
    for perf in performances or []:
        for price in perf.get("prices") or []:
            stop = False
            for conc in price.get("concessions") or []:
                if (conc.get("code") or "") != TIMESGIVEAWAY_CODE:
                    continue
                remaining = conc.get("remainingLimitValue")
                if remaining is None or (isinstance(remaining, (int, float)) and remaining > 0):
                    count += 1
                    stop = True
                    break
            if stop:
                break
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--slug', help='Process a specific event slug')
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = load_existing(OUTPUT_FILE)

    if args.slug:
        slugs = [args.slug]
        print(f"Processing single slug: {args.slug}")
    else:
        offers = load_offers(OFFERS_FILE)
        slugs = []
        seen = set()
        skipped_offer_code = 0
        skipped_duplicate = 0
        for offer in offers:
            slug = offer.get("slug")
            if not slug:
                continue
            if (offer.get("offer_code") or "") != TIMESGIVEAWAY_CODE:
                skipped_offer_code += 1
                continue
            if slug in seen:
                skipped_duplicate += 1
                continue
            seen.add(slug)
            slugs.append(slug)

        print(f"Total records in offers_all.json: {len(offers)}")
        print(f"Skipped (offer_code != {TIMESGIVEAWAY_CODE}): {skipped_offer_code}")
        print(f"Skipped (duplicate slug): {skipped_duplicate}")

    total = len(slugs)
    already = sum(1 for s in slugs if s in results)
    todo = total - already

    print(f"Unique slugs to crawl: {total}")
    print(f"Already fetched: {already}")
    print(f"Remaining: {todo}")

    # Shuffle so each run visits events in a different order
    remaining = [s for s in slugs if s not in results]
    random.shuffle(remaining)

    session = requests.Session()
    save_every = 25
    processed_since_save = 0

    for idx, slug in enumerate(remaining, start=already + 1):
        if slug in results:
            continue

        try:
            data = fetch_performances(session, slug)
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else "?"
            print(f"{slug} ({idx}/{total}) - HTTP {status}, skipping")
            results[slug] = {
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "error": f"HTTP {status}",
                "performances": [],
            }
        except requests.RequestException as e:
            print(f"{slug} ({idx}/{total}) - request error: {e}, will retry next run")
            time.sleep(random.uniform(0.5, 2.0))
            continue
        else:
            raw = data.get("cache", []) if isinstance(data, dict) else []
            filtered = filter_timesgiveaway_performances(raw)
            filtered = [p for p in filtered if is_within_date_range(p.get("datetime", ""))]
            print(f"{slug} ({idx}/{total}) - fetched {len(raw)} performances, checking {len(filtered)} for TIMESGIVEAWAY (Aug 5-12)")

            # Fetch individual performance details in parallel
            detailed = []
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = {executor.submit(fetch_perf_with_logging, session, slug, perf): perf for perf in filtered}
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        detailed.append(result)

            available = count_timesgiveaway_available(detailed)
            results[slug] = {
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "performances": detailed,
            }
            print(f"  ✓ {available} performances still have availability")

        processed_since_save += 1

        if processed_since_save >= save_every:
            save_results(OUTPUT_FILE, results)
            processed_since_save = 0

        time.sleep(random.uniform(0.5, 2.0))

    save_results(OUTPUT_FILE, results)

    total_events = 0
    total_performances = 0
    total_available = 0
    for entry in results.values():
        if entry.get("error"):
            continue
        perfs = entry.get("performances") or []
        total_events += 1
        total_performances += len(perfs)
        total_available += count_timesgiveaway_available(perfs)

    print()
    print("=== Summary ===")
    print(f"Saved {len(results)} entries to {OUTPUT_FILE}")
    print(f"Total events fetched (no error): {total_events}")
    print(f"Total TIMESGIVEAWAY performances saved: {total_performances}")
    print(f"Total TIMESGIVEAWAY performances with stock: {total_available}")


if __name__ == "__main__":
    main()
