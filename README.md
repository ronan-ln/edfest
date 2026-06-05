# EdFest Times Giveaway Browser

A personal web app for browsing Edinburgh Fringe 2026 shows that are part of the Times 20k Giveaway offer, checking live ticket availability, and adding tickets directly to your edfest.com basket.

## Project structure

```
edfest/
├── edfest-browser/          # Next.js web app
│   ├── app/
│   │   ├── api/
│   │   │   ├── performances/  # Proxies edfest.com performances endpoint + updates cache
│   │   │   ├── basket/        # Proxies edfest.com basket (GET + POST)
│   │   │   └── cached-availability/  # Serves availability.json to the frontend
│   │   ├── components/
│   │   │   ├── EventCard.tsx  # Show card with cached promo badge
│   │   │   ├── EventModal.tsx # Show detail + live availability + add to basket
│   │   │   ├── FilterBar.tsx  # Search, category filter, promo-only toggle
│   │   │   └── CookieSetup.tsx # Cookie management UI
│   │   ├── lib/
│   │   │   └── availability.ts # Read/write availability.json
│   │   └── public/
│   │       └── offers.json    # All 422 unique shows (static, bundled with deploy)
│   └── data/
│       └── availability.json  # Crawled availability cache (committed as seed)
├── fetch_offers.py            # Scrapes all shows from edfest.com API → offers_all.json
├── fetch_availability.py      # Crawls performance availability for all 422 slugs
└── offers_all.json            # Raw output from fetch_offers.py (2765 records, 422 unique slugs)
```

## Data pipeline

### 1. Fetch shows
```bash
EDFEST_COOKIES="access_token=..." python3 fetch_offers.py
```
Writes `offers_all.json`. The offers endpoint requires authentication — paste your cookie string from DevTools.

### 2. Crawl availability
```bash
python3 fetch_availability.py
```
Reads `offers_all.json`, crawls all 422 unique slugs at the edfest.com performances API (no auth required), writes `edfest-browser/data/availability.json`. Resumes from where it left off. Random 3–7s delay between requests. Takes ~25–50 minutes for a full run.

### 3. Run the app
```bash
cd edfest-browser
npm install
npm run dev
```

## Web app features

- **Event grid** — 422 unique shows, filterable by category, search, and "promo only" toggle
- **Promo badges** — cards show how many performance dates still have TIMESGIVEAWAY available (from cached data)
- **Live availability modal** — clicking a show fetches fresh availability from edfest.com and displays all promo-eligible dates with seat counts
- **Add to basket** — once you've connected your edfest.com session (see below), each available date gets a "+ Basket" button that adds 2 tickets directly
- **Checkout link** — after adding tickets, a "Checkout (N tickets)" button links to `https://edfest.com/checkout`
- **Back button** — browser back button closes the modal correctly

## Connecting your edfest.com session

To enable one-click "Add to basket":

1. Open [edfest.com](https://edfest.com) and log in to your account
2. Open DevTools (F12 / Cmd+Option+I) → Network tab
3. Reload the page, click any request, find the `Cookie` request header
4. Copy the full value
5. In the app, click **⚙ Connect to edfest.com** (top right) and paste it

The cookie is stored in your browser's `localStorage` — it never leaves your browser except to proxy to edfest.com. Cookies expire periodically; if adding to basket stops working, repeat the process.

## Railway deployment

The app is deployed on Railway with the root directory set to `edfest-browser/`.

**Environment variables:**
- `DATA_PATH=/data/availability.json` — path to the availability cache on the persistent volume

**Volume:**
- Mount a Railway volume at `/data` — the app reads and writes availability data here

**Updating data:**
1. Run `fetch_availability.py` locally to refresh `edfest-browser/data/availability.json`
2. Commit and push — Railway redeploys with fresh seed data
3. The volume file takes over as it gets updated by live modal fetches
