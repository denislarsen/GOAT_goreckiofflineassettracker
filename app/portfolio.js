// Portfolio definition and bundled offline demo data.
// Loaded before app.js; PORTFOLIO and DEMO_SERIES are shared top-level bindings.

const PORTFOLIO = [
  {
    id: 'em',
    name: 'Emerging Markets Stocks',
    allocation: 50,
    tickers: [
      { symbol: 'EEM', label: 'iShares MSCI Emerging Markets ETF' },
    ],
  },
  {
    id: 'metals',
    name: 'Gold & Silver',
    allocation: 20,
    tickers: [
      { symbol: 'GLD', label: 'Gold (SPDR Gold Shares)' },
      { symbol: 'SLV', label: 'Silver (iShares Silver Trust)' },
    ],
  },
  {
    id: 'cash',
    name: 'Cash',
    allocation: 20,
    tickers: [],
  },
  {
    id: 'developed',
    name: 'Developed Market Stocks',
    allocation: 10,
    tickers: [
      { symbol: 'EFA', label: 'iShares MSCI EAFE ETF' },
    ],
  },
];

// Builds a closing-price series from a starting price and a list of daily % changes.
function buildSeries(startPrice, pctChanges) {
  const closes = [startPrice];
  let price = startPrice;
  for (const pct of pctChanges) {
    price = price * (1 + pct / 100);
    closes.push(Math.round(price * 100) / 100);
  }
  return closes;
}

// Turns a plain array of closes into {date, close} points ending "today".
function toDatedSeries(closes) {
  const points = [];
  const today = new Date();
  for (let i = 0; i < closes.length; i++) {
    const daysAgo = closes.length - 1 - i;
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    points.push({ date: d.toISOString().slice(0, 10), close: closes[i] });
  }
  return points;
}

// Mild, steady drift with small day-to-day noise -- used for "healthy" demo assets.
const STABLE_UPTREND = [
  0.3, -0.1, 0.2, 0.4, -0.2, 0.3, 0.1, -0.3, 0.5, 0.2,
  -0.1, 0.3, 0.2, -0.2, 0.4, 0.1, -0.1, 0.3, 0.2, -0.3,
  0.4, 0.1, 0.2, -0.1, 0.3, 0.2, -0.2, 0.3, 0.1, -0.1,
  0.2, 0.3, -0.1, 0.2,
];

// Same base drift, then a mild pullback in the final week -- used for a "watch" demo asset.
const MILD_PULLBACK = [
  0.3, -0.1, 0.2, 0.4, -0.2, 0.3, 0.1, -0.3, 0.5, 0.2,
  -0.1, 0.3, 0.2, -0.2, 0.4, 0.1, -0.1, 0.3, 0.2, -0.3,
  0.4, 0.1, 0.2, -0.1,
  0.0, -0.1, 0.1, -0.2, -0.3, -0.2, -0.4, -0.3, -0.5, -0.4,
];

// Same base drift, then an accelerating sell-off -- used for an "alert" demo asset.
const SHARP_DECLINE = [
  0.3, -0.1, 0.2, 0.4, -0.2, 0.3, 0.1, -0.3, 0.5, 0.2,
  -0.1, 0.3, 0.2, -0.2, 0.4, 0.1, -0.1, 0.3, 0.2, -0.3,
  0.4, 0.1, 0.2, -0.1,
  -1.0, -1.3, -1.1, -1.6, -1.8, -1.3, -2.0, -1.5, -3.0, -1.8,
];

const DEMO_SERIES = {
  EEM: toDatedSeries(buildSeries(42.00, SHARP_DECLINE)),
  GLD: toDatedSeries(buildSeries(215.00, STABLE_UPTREND)),
  SLV: toDatedSeries(buildSeries(27.50, MILD_PULLBACK)),
  EFA: toDatedSeries(buildSeries(78.00, STABLE_UPTREND)),
};
