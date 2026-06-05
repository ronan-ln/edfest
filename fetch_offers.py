#!/usr/bin/env python3
"""Fetch all pages from edfest.com offers API and save to JSON."""

import json
import random
import time
import sys
import requests

OFFER_TYPE = "the-times-20k-giveaway"
LIMIT = 100
OUTPUT_FILE = "offers_all.json"

# Cookies loaded from environment — set EDFEST_COOKIES as a semicolon-separated string
# e.g. EDFEST_COOKIES="access_token=Fe26...; refresh_token=Fe26..."
# Leave empty if the API works without auth (the offers endpoint requires login)
import os as _os
_raw_cookies = _os.environ.get("EDFEST_COOKIES", "")
COOKIES = dict(
    pair.strip().split("=", 1)
    for pair in _raw_cookies.split(";")
    if "=" in pair.strip()
) if _raw_cookies else {}

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


def fetch_page(session, page):
    url = "https://edfest.com/api/projects/offers"
    params = {"page": page, "limit": LIMIT, "offer_types": OFFER_TYPE}
    resp = session.get(url, headers=HEADERS, cookies=COOKIES, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    session = requests.Session()
    all_items = []
    page = 1

    print(f"Fetching offer_type: {OFFER_TYPE}")

    total_pages = None

    while True:
        print(f"  Page {page}/{total_pages or '?'}...", end=" ", flush=True)
        data = fetch_page(session, page)

        meta = data.get("meta", {})
        if total_pages is None:
            total_pages = meta.get("totalPages")

        items = data.get("data", [])

        if not items:
            print("empty — done.")
            break

        all_items.extend(items)
        print(f"got {len(items)} items (total so far: {len(all_items)})")

        if total_pages is not None and page >= total_pages:
            print(f"Reached last page ({total_pages}) — done.")
            break

        page += 1
        time.sleep(random.uniform(1.5, 4.0))

    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_items, f, indent=2)

    print(f"\nSaved {len(all_items)} items to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
