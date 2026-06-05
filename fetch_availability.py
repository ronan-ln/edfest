#!/usr/bin/env python3
"""Fetch performance availability for every event slug in offers_all.json."""

import json
import os
import random
import sys
import time
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


TIMESGIVEAWAY_CODE = "TIMESGIVEAWAY"


def has_timesgiveaway_concession(performance):
    """Return True if the performance has any concession with code == TIMESGIVEAWAY."""
    for price in performance.get("prices") or []:
        for conc in price.get("concessions") or []:
            if (conc.get("code") or "") == TIMESGIVEAWAY_CODE:
                return True
    return False


def filter_timesgiveaway_performances(performances):
    """Keep only performances that contain at least one TIMESGIVEAWAY concession."""
    return [p for p in (performances or []) if has_timesgiveaway_concession(p)]


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
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    offers = load_offers(OFFERS_FILE)
    results = load_existing(OUTPUT_FILE)

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

    total = len(slugs)
    already = sum(1 for s in slugs if s in results)
    todo = total - already

    print(f"Total records in offers_all.json: {len(offers)}")
    print(f"Skipped (offer_code != {TIMESGIVEAWAY_CODE}): {skipped_offer_code}")
    print(f"Skipped (duplicate slug): {skipped_duplicate}")
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
            time.sleep(random.uniform(2.0, 5.0))
            continue
        else:
            raw = data.get("cache", []) if isinstance(data, dict) else []
            filtered = filter_timesgiveaway_performances(raw)
            print(f"{slug} ({idx}/{total}) - fetched {len(raw)} performances, {len(filtered)} with TIMESGIVEAWAY")

            # Fetch individual performance details for each with TIMESGIVEAWAY
            detailed = []
            for perf in filtered:
                try:
                    detail = fetch_performance_detail(session, slug, perf.get("id"))
                    remaining = detail.get("prices", [{}])[0].get("concessions", [])
                    remaining = next((c.get("remainingLimitValue") for c in remaining if c.get("code") == "TIMESGIVEAWAY"), None)
                    print(f"  • {perf.get('datetime')} (id: {perf.get('id')}) - slots: {remaining}")
                    detailed.append(detail)
                    time.sleep(random.uniform(0.5, 1.5))
                except requests.RequestException as e:
                    print(f"  • {perf.get('datetime')} (id: {perf.get('id')}) - ERROR: {e}", file=sys.stderr)
                    detailed.append(perf)

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

        time.sleep(random.uniform(2.0, 5.0))

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
