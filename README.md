# GOAT — Gorecki Offline Asset Tracker

A small, self-hosted app for tracking multifaceted investments — index funds,
unlisted startup shares, cash positions — entirely on your own NAS. No cloud,
no external APIs, no accounts: one Node process and one JSON file.

## What it does

- **Investments** of any kind: funds, startup shares, cash, other. Each one
  carries notes, contact people (phone/email), and references to contracts or
  documents stored on the NAS.
- **Money in / out ledger** — record every contribution or withdrawal with a
  date and note, so you can see exactly what you have paid in over time.
- **Manual valuation snapshots** instead of live market feeds. Whenever you
  learn what a position is worth (annual statement, funding round, bank depot
  overview), record it. The app carries each investment at its latest
  valuation plus any money moved in/out since, and shows a freshness badge
  (fresh / months old / years old) so you always know how trustworthy the
  number is. Positions with no valuation yet are carried at cost.
- **Groups** — tag investments with an advisor (e.g. "Sopra Advice"), a theme,
  or anything else, and see paid-in vs. value vs. gain per group.
- **Dashboard** — portfolio value, net paid in, gain, allocation by type, and
  which valuations need updating.
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

Configuration via environment variables: `PORT` (default 8420), `DATA_DIR`
(default `./data`).

> The app has no login — it is meant for a trusted home LAN. Don't expose the
> port to the internet.
