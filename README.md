# GOAT — Gorecki Offline Asset Tracker

A small, self-hosted app for tracking multifaceted investments — index funds,
unlisted startup shares, cash positions — entirely on your own NAS. No cloud,
no accounts, no npm packages: one Node process and one JSON file. All your
data stays on the NAS; the only thing that goes out is a daily price lookup
for funds, which sends just the funds' ISIN codes (see *Fund prices* below).
All amounts are in euro.

## What it does

- **Investments** of any kind: funds, startup shares, cash, other. Each one
  carries notes, contact people (phone/email), and references to contracts or
  documents stored on the NAS.
- **Money in / out ledger** — record every contribution or withdrawal with a
  date and note, so you can see exactly what you have paid in over time.
- **Manual valuation snapshots** as the foundation. Whenever you
  learn what a position is worth (annual statement, funding round, bank depot
  overview), record it. The app carries each investment at its latest
  valuation plus any money moved in/out since, and shows a freshness badge
  (fresh / months old / years old) so you always know how trustworthy the
  number is. Positions with no valuation yet are carried at cost. Funds with
  an ISIN code go one step further and follow their market price (below).
- **Groups** — tag investments with an advisor (e.g. "Torpe Advice"), a theme,
  or anything else, and see paid-in vs. value vs. gain per group.
- **Liquidity tiers** — every investment is *liquid* (sellable within days),
  *fixed term* (locked, but with a known release year — e.g. an 8-year
  alternatives fund), or *illiquid* (startups & unlisted: money only at an
  exit). The dashboard leads with what you could actually get your hands on.
- **Dashboard** — a liquidity staircase (available now / locked with a known
  horizon / until an exit) for the managed portfolio, with cornerstone
  positions shown separately as "sources of wealth" so one big hypothetical
  valuation doesn't drown the operational numbers. A cornerstone can also be
  marked to count in the staircase (e.g. cash at a bank): it then appears in
  both places, but only once in the grand total. Plus allocation by type and
  which valuations need updating.
- **One-tap value refresh** — an "↻ Value" button on every portfolio row:
  confirm the current value unchanged as of today, or type the new number,
  without leaving the dashboard.
- **Fund prices** — give a fund its ISIN code (typed in, or picked up
  automatically from the fund's notes) and its value follows the fund's
  price from the latest manual valuation onwards; money added later follows
  the price from its own date. Prices come from Nasdaq Nordic (Danish funds)
  and Yahoo Finance (international), with OpenFIGI used to find an ETF's
  euro listing — none of them needs a token. Prices in other currencies are
  converted to euro. They are fetched once a day in the evening and with the
  "↻ Update prices" button, stored in `data/prices.json`, and always shown
  with their date. If a price can't be fetched, the last known one is used;
  with no price at all, the manual valuation is. Sources live in `prices.js`
  and are interchangeable; a token-based source (EODHD) can be switched on
  under Settings, with the token kept only in `data/price-settings.json` on
  the NAS. Only ISIN codes are sent out — never names or amounts.
- **Home-screen icon** — served with `apple-touch-icon` and a web manifest, so
  "Add to Home Screen" on an iPad/iPhone (or Android) gets a proper GOAT icon.
  If you saved a shortcut before this existed, remove it and add it again to
  pick up the icon.
- **Safety** — every save keeps the last 30 versions in `data/backups/`, plus
  one-click JSON export/import from Settings.

## Running it

Requires Node 18+ (no npm packages at all):

```
node server.js
```

Then open `http://<nas-address>:8420`. Data is stored in `data/goat-data.json`.

Or with Docker (Synology/QNAP container managers work fine):

```
docker compose up -d
```

For the Synology NAS there is a self-updating setup — GitHub Actions builds
an image on every push to `main`, and Watchtower on the NAS pulls new
versions automatically. See **[DEPLOY.md](DEPLOY.md)** for the walkthrough
(in Danish) and `docker-compose.nas.yml` for the compose file it uses.

Configuration via environment variables: `PORT` (default 8420), `DATA_DIR`
(default `./data`), `PRICE_REFRESH=off` to turn off the daily price fetch.

> The app has no login — it is meant for a trusted home LAN. Don't expose the
> port to the internet.
