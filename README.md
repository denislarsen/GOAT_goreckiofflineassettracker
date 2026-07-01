# GOAT_goreckiofflineassettracker

## Portfolio Early-Warning Dashboard

A single-page dashboard for a portfolio allocated 50% Emerging Markets stocks,
20% Gold & Silver, 20% Cash, and 10% Developed Market stocks. Each asset class
gets a green/yellow/red early-warning light so problems are visible at a
glance.

**Run it:** open `app/index.html` in a browser (or serve the `app/` folder
with any static file server). It works immediately using bundled offline
demo data — no setup needed.

**Live prices (optional):** click the gear icon and add a free
[Alpha Vantage](https://www.alphavantage.co) API key to pull live daily
prices for EEM (Emerging Markets), GLD/SLV (Gold/Silver), and EFA (Developed
Markets). The key is stored only in your browser. If a live fetch fails or
you don't set a key, the dashboard falls back to cached or demo data
automatically.

**How the warning light for each asset class is decided:** for every ticker,
four indicators are computed from its recent daily closes — drawdown from its
20-day high, the 10-day vs 30-day moving-average trend, 5-day momentum, and a
volatility spike on down days. Each indicator is green/yellow/red on its own;
an asset class turns red if any single indicator is a confirmed alert, or if
three or more indicators are flashing yellow at once. Cash carries no market
price risk and is always shown as stable.