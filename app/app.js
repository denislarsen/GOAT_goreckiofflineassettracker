// Early-warning logic + rendering for the portfolio dashboard.
// Relies on PORTFOLIO and DEMO_SERIES from portfolio.js.

const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';
const CACHE_KEY = 'pw_cache_v1';
const API_KEY_STORAGE = 'pw_api_key';
const REQUEST_SPACING_MS = 1200;
const REFRESH_COOLDOWN_MS = 30000;

const SEVERITY = { GREEN: 0, YELLOW: 1, RED: 2 };
const SEVERITY_NAME = ['green', 'yellow', 'red'];
const SEVERITY_LABEL = ['Stable', 'Watch', 'Alert'];

// ---- Indicator math -------------------------------------------------------

function dailyReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
  }
  return returns;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeIndicators(series) {
  const closes = series.map((p) => p.close);
  const n = closes.length;
  const today = closes[n - 1];

  // 1. Drawdown from the recent (up to 20-session) high.
  const lookback20 = closes.slice(Math.max(0, n - 20));
  const recentHigh = Math.max(...lookback20);
  const drawdownPct = ((recentHigh - today) / recentHigh) * 100;
  let drawdownSeverity = SEVERITY.GREEN;
  if (drawdownPct > 7) drawdownSeverity = SEVERITY.RED;
  else if (drawdownPct > 3) drawdownSeverity = SEVERITY.YELLOW;

  // 2. 10-day vs 30-day moving-average trend.
  const sma10 = average(closes.slice(Math.max(0, n - 10)));
  const sma30 = average(closes.slice(Math.max(0, n - 30)));
  const maDiffPct = ((sma10 - sma30) / sma30) * 100;
  let trendSeverity = SEVERITY.GREEN;
  if (maDiffPct < -2) trendSeverity = SEVERITY.RED;
  else if (maDiffPct < 0) trendSeverity = SEVERITY.YELLOW;

  // 3. 5-day momentum (rate of change).
  const roc5Base = closes[Math.max(0, n - 6)];
  const roc5Pct = ((today - roc5Base) / roc5Base) * 100;
  let momentumSeverity = SEVERITY.GREEN;
  if (roc5Pct < -5) momentumSeverity = SEVERITY.RED;
  else if (roc5Pct < -2) momentumSeverity = SEVERITY.YELLOW;

  // 4. Volatility spike on a down day (today's move vs its typical size).
  const returns = dailyReturns(closes);
  const todayReturn = returns[returns.length - 1];
  const priorReturns = returns.slice(Math.max(0, returns.length - 21), returns.length - 1);
  const avgAbsReturn = average(priorReturns.map(Math.abs));
  const volRatio = avgAbsReturn > 0 ? Math.abs(todayReturn) / avgAbsReturn : 0;
  let volSeverity = SEVERITY.GREEN;
  if (todayReturn < 0) {
    if (volRatio >= 2.5) volSeverity = SEVERITY.RED;
    else if (volRatio >= 1.5) volSeverity = SEVERITY.YELLOW;
  }

  const indicators = [
    { key: 'drawdown', label: '20-day drawdown', value: `-${drawdownPct.toFixed(1)}%`, severity: drawdownSeverity,
      detail: `Down ${drawdownPct.toFixed(1)}% from its recent 20-session high of ${recentHigh.toFixed(2)}.` },
    { key: 'trend', label: '10/30-day trend', value: `${maDiffPct >= 0 ? '+' : ''}${maDiffPct.toFixed(1)}%`, severity: trendSeverity,
      detail: `10-day average is ${maDiffPct.toFixed(1)}% vs the 30-day average (negative = short-term downtrend).` },
    { key: 'momentum', label: '5-day momentum', value: `${roc5Pct >= 0 ? '+' : ''}${roc5Pct.toFixed(1)}%`, severity: momentumSeverity,
      detail: `Price moved ${roc5Pct.toFixed(1)}% over the last 5 sessions.` },
    { key: 'volatility', label: 'Volatility spike', value: `${volRatio.toFixed(1)}x`, severity: volSeverity,
      detail: todayReturn < 0
        ? `Today's drop is ${volRatio.toFixed(1)}x the recent average daily move.`
        : `No down-day volatility spike (today's move was flat or positive).` },
  ];

  let overallSeverity = Math.max(...indicators.map((i) => i.severity));
  const yellowOrWorseCount = indicators.filter((i) => i.severity >= SEVERITY.YELLOW).length;
  if (overallSeverity === SEVERITY.YELLOW && yellowOrWorseCount >= 3) {
    overallSeverity = SEVERITY.RED; // multiple simultaneous warning signs = confirmed risk
  }

  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const dayChangePct = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;

  return {
    price: latest.close,
    date: latest.date,
    dayChangePct,
    indicators,
    severity: overallSeverity,
  };
}

// ---- Data access (live fetch + offline cache + demo fallback) -------------

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function allSymbols() {
  const symbols = [];
  for (const cls of PORTFOLIO) {
    for (const t of cls.tickers) symbols.push(t.symbol);
  }
  return symbols;
}

async function fetchLiveSeries(symbol, apiKey) {
  const url = `${ALPHA_VANTAGE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json['Note'] || json['Information']) throw new Error('rate-limited');
  const raw = json['Time Series (Daily)'];
  if (!raw) throw new Error(json['Error Message'] || 'unexpected response');
  const series = Object.keys(raw)
    .sort()
    .map((date) => ({ date, close: parseFloat(raw[date]['4. close']) }));
  return series;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetches (or falls back to cache/demo data for) every symbol used by the portfolio.
async function loadAllSeries(onProgress) {
  const apiKey = getApiKey();
  const symbols = allSymbols();
  const result = {};
  const notes = {};

  if (!apiKey) {
    for (const symbol of symbols) result[symbol] = DEMO_SERIES[symbol];
    return { series: result, notes, mode: 'demo' };
  }

  const cache = readCache();
  let anyLive = false;

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    if (onProgress) onProgress(symbol, i + 1, symbols.length);
    try {
      const series = await fetchLiveSeries(symbol, apiKey);
      result[symbol] = series;
      cache[symbol] = { series, fetchedAt: new Date().toISOString() };
      anyLive = true;
    } catch (err) {
      const cached = cache[symbol];
      if (cached) {
        result[symbol] = cached.series;
        notes[symbol] = `Live fetch failed (${err.message}) — showing cached data from ${new Date(cached.fetchedAt).toLocaleString()}.`;
      } else {
        result[symbol] = DEMO_SERIES[symbol];
        notes[symbol] = `Live fetch failed (${err.message}) — showing offline demo data.`;
      }
    }
    if (i < symbols.length - 1) await sleep(REQUEST_SPACING_MS);
  }

  writeCache(cache);
  return { series: result, notes, mode: anyLive ? 'live' : 'demo-fallback' };
}

// ---- Rendering --------------------------------------------------------

function severityDotHtml(severity, extraClass) {
  return `<span class="dot status-${SEVERITY_NAME[severity]} ${extraClass || ''}"></span>`;
}

function renderOverallBadge(severity) {
  const badge = document.getElementById('overallBadge');
  const text = document.getElementById('overallBadgeText');
  badge.className = `overall-badge status-${SEVERITY_NAME[severity]}`;
  text.textContent = severity === SEVERITY.GREEN ? 'All Clear'
    : severity === SEVERITY.YELLOW ? 'Some Caution'
    : 'Action Needed';
}

function renderSummaryBar({ dataModeLabel, lastUpdated, atRiskPct }) {
  document.getElementById('dataModeText').textContent = dataModeLabel;
  document.getElementById('lastUpdatedText').textContent = lastUpdated;
  document.getElementById('atRiskText').textContent = `${atRiskPct}% of allocation flagged`;
}

function tickerRowHtml(ticker, computed, note) {
  const changeClass = computed.dayChangePct >= 0 ? 'positive' : 'negative';
  const changeSign = computed.dayChangePct >= 0 ? '+' : '';
  const indicatorsHtml = computed.indicators
    .map((ind) => `
      <div class="indicator" title="${ind.detail}">
        ${severityDotHtml(ind.severity)}
        <span class="indicator-label">${ind.label}</span>
        <span class="indicator-value">${ind.value}</span>
      </div>`)
    .join('');

  return `
    <div class="ticker-row">
      <div class="ticker-header">
        ${severityDotHtml(computed.severity)}
        <span class="ticker-symbol">${ticker.symbol}</span>
        <span class="ticker-label">${ticker.label}</span>
        <span class="ticker-price">$${computed.price.toFixed(2)}</span>
        <span class="ticker-change ${changeClass}">${changeSign}${computed.dayChangePct.toFixed(2)}%</span>
      </div>
      <div class="indicators">${indicatorsHtml}</div>
      ${note ? `<div class="ticker-note">${note}</div>` : ''}
    </div>`;
}

function cashCardHtml(cls) {
  return `
    <article class="card status-green">
      <header class="card-header">
        ${severityDotHtml(SEVERITY.GREEN)}
        <h3>${cls.name}</h3>
        <span class="card-allocation">${cls.allocation}%</span>
      </header>
      <p class="cash-note">Cash carries no market price risk, so it is always shown as stable. Its main long-term risk is inflation eroding purchasing power, which this dashboard does not track live.</p>
    </article>`;
}

function assetCardHtml(cls, seriesBySymbol, notes) {
  let classSeverity = SEVERITY.GREEN;
  const rows = cls.tickers.map((ticker) => {
    const series = seriesBySymbol[ticker.symbol];
    const computed = computeIndicators(series);
    classSeverity = Math.max(classSeverity, computed.severity);
    return tickerRowHtml(ticker, computed, notes[ticker.symbol]);
  });

  return `
    <article class="card status-${SEVERITY_NAME[classSeverity]}">
      <header class="card-header">
        ${severityDotHtml(classSeverity)}
        <h3>${cls.name}</h3>
        <span class="card-allocation">${cls.allocation}%</span>
        <span class="card-status-label">${SEVERITY_LABEL[classSeverity]}</span>
      </header>
      ${rows.join('')}
    </article>`;
}

function render({ seriesBySymbol, notes, dataModeLabel, lastUpdated }) {
  const grid = document.getElementById('cardsGrid');
  let overallSeverity = SEVERITY.GREEN;
  let atRiskAllocation = 0;

  const cardsHtml = PORTFOLIO.map((cls) => {
    if (cls.id === 'cash') return cashCardHtml(cls);

    let classSeverity = SEVERITY.GREEN;
    for (const ticker of cls.tickers) {
      const computed = computeIndicators(seriesBySymbol[ticker.symbol]);
      classSeverity = Math.max(classSeverity, computed.severity);
    }
    overallSeverity = Math.max(overallSeverity, classSeverity);
    if (classSeverity >= SEVERITY.YELLOW) atRiskAllocation += cls.allocation;

    return assetCardHtml(cls, seriesBySymbol, notes);
  }).join('');

  grid.innerHTML = cardsHtml;
  renderOverallBadge(overallSeverity);
  renderSummaryBar({ dataModeLabel, lastUpdated, atRiskPct: atRiskAllocation });
}

// ---- Controller ---------------------------------------------------------

let refreshInFlight = false;

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.disabled = true;
  const originalText = refreshBtn.textContent;
  refreshBtn.textContent = 'Refreshing…';

  try {
    const { series, notes, mode } = await loadAllSeries((symbol, i, total) => {
      refreshBtn.textContent = `Refreshing ${symbol} (${i}/${total})…`;
    });

    const dataModeLabel = mode === 'demo'
      ? 'Offline demo data'
      : mode === 'live'
        ? 'Live (Alpha Vantage)'
        : 'Offline demo data (live fetch failed)';

    render({
      seriesBySymbol: series,
      notes,
      dataModeLabel,
      lastUpdated: new Date().toLocaleString(),
    });
  } finally {
    refreshInFlight = false;
    refreshBtn.textContent = originalText;
    const cooldown = getApiKey() ? REFRESH_COOLDOWN_MS : 0;
    if (cooldown > 0) {
      setTimeout(() => { refreshBtn.disabled = false; }, cooldown);
    } else {
      refreshBtn.disabled = false;
    }
  }
}

function wireSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const apiKeyInput = document.getElementById('apiKeyInput');

  document.getElementById('settingsBtn').addEventListener('click', () => {
    apiKeyInput.value = getApiKey();
    modal.classList.remove('hidden');
  });
  document.getElementById('closeSettingsBtn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    setApiKey(apiKeyInput.value.trim());
    modal.classList.add('hidden');
    refresh();
  });
  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    setApiKey('');
    apiKeyInput.value = '';
    modal.classList.add('hidden');
    refresh();
  });
}

function init() {
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  wireSettingsModal();
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
