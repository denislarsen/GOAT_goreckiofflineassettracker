// GOAT — fund prices.
// Looks up funds by ISIN, keeps a small price history per fund in
// DATA_DIR/prices.json and refreshes it once a day (and on demand).
//
// Price sources are interchangeable "providers". Each one knows how to:
//   resolve(isin, token, opts)    -> { ref, name, currency, symbol }  (or throws)
//     opts.ticker: optional ticker from the bank statement (e.g. "IUSN")
//     opts.prefer: the currency we would like the price in (EUR)
//   history(ref, fromDate, token) -> [[ 'YYYY-MM-DD', close ], ...]  (oldest first)
// Add a new source by adding an entry to PROVIDERS. Tokens never live in the
// code: they are typed into Settings and kept in DATA_DIR/price-settings.json
// on the NAS, and are never sent back to the browser.

const fsp = require('fs/promises');
const path = require('path');

const UA = 'Mozilla/5.0 (GOAT asset tracker)';
// Every value in GOAT is in euro; prices are converted to this.
const BASE = 'EUR';
// Yahoo exchange suffixes that quote in euro, best first (Xetra, then others).
const EUR_SUFFIXES = ['DE', 'MI', 'PA', 'AS', 'F'];
const TIMEOUT_MS = 20000;

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

// ISIN = 2 letters + 9 alphanumerics + 1 check digit (Luhn over letters-as-numbers).
function isValidIsin(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits = isin.split('').map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const PROVIDERS = {
  // Nasdaq Nordic — Danish (and other Nordic) listed investment funds and ETFs.
  // No token. Prices are the exchange's daily closes in the fund's currency.
  nasdaq: {
    label: 'Nasdaq Nordic',
    needsToken: false,
    note: 'Danish and Nordic listed funds. No token needed.',
    async resolve(isin) {
      const json = await getJson(`https://api.nasdaq.com/api/nordic/search?searchText=${encodeURIComponent(isin)}`);
      for (const group of json?.data || []) {
        for (const ins of group.instruments || []) {
          if (ins.isin === isin) {
            return {
              ref: { id: ins.orderbookId, assetClass: ins.assetClass },
              name: ins.fullName, currency: ins.currency, symbol: ins.symbol,
            };
          }
        }
      }
      throw new Error('not found');
    },
    async history(ref, from) {
      const url = `https://api.nasdaq.com/api/nordic/instruments/${encodeURIComponent(ref.id)}/chart`
        + `?assetClass=${encodeURIComponent(ref.assetClass)}&fromDate=${from}&toDate=${isoDay(new Date())}&lang=en`;
      const json = await getJson(url);
      return (json?.data?.CP || [])
        .map((p) => [p?.z?.dateTime, num(p?.y ?? p?.z?.close)])
        .filter(([d, c]) => d && c);
    },
  },

  // Yahoo Finance — broad coverage (international ETFs and many mutual funds).
  // No token, but an unofficial interface that can change without notice.
  yahoo: {
    label: 'Yahoo Finance',
    needsToken: false,
    note: 'International funds and ETFs. No token needed, but unofficial.',
    // Many ETFs are listed on several exchanges in different currencies, and
    // a search by ISIN often returns only one of them (e.g. London, in USD).
    // So we also try the same ticker on euro exchanges, and the ticker from
    // the bank statement if one was given, and prefer a listing in euro.
    async resolve(isin, token, opts = {}) {
      const tried = new Set();
      let fallback = null;
      const check = async (symbol, mustMatchName) => {
        if (!symbol || tried.has(symbol)) return null;
        tried.add(symbol);
        try {
          const chart = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
          const meta = chart?.chart?.result?.[0]?.meta;
          if (!meta || !meta.regularMarketPrice) return null;
          const name = meta.longName || meta.shortName || symbol;
          if (mustMatchName && firstWord(name) !== firstWord(mustMatchName)) return null;
          const hit = { ref: { symbol }, name, currency: meta.currency || null, symbol };
          if (!fallback) fallback = hit;
          return hit.currency === opts.prefer ? hit : null;
        } catch { return null; }
      };
      const withSuffixes = async (root, mustMatchName) => {
        for (const sfx of EUR_SUFFIXES) {
          const hit = await check(`${root}.${sfx}`, mustMatchName);
          if (hit) return hit;
        }
        return null;
      };

      // 1) What a search for the ISIN finds directly, if it is in euro.
      const json = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`);
      const quotes = (json?.quotes || []).filter((q) => q.symbol && q.isYahooFinance !== false);
      for (const q of quotes) {
        const hit = await check(q.symbol);
        if (hit) return hit;
      }
      // 2) The ticker from the bank statement, on a euro exchange.
      const ticker = String(opts.ticker || '').trim().toUpperCase();
      if (ticker) {
        const hit = ticker.includes('.') ? await check(ticker) : await withSuffixes(ticker);
        if (hit) return hit;
      }
      // 3) The found ticker on a euro exchange — only if clearly the same fund.
      for (const q of quotes) {
        const root = q.symbol.split('.')[0];
        if (!root.startsWith('0P')) {
          const alt = await withSuffixes(root, q.longname || q.shortname);
          if (alt) return alt;
        }
      }
      if (fallback) return fallback;
      throw new Error('not found');
    },
    async history(ref, from) {
      const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000);
      const p2 = Math.floor(Date.now() / 1000) + 86400;
      const json = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ref.symbol)}?period1=${p1}&period2=${p2}&interval=1d`);
      const r = json?.chart?.result?.[0];
      if (!r) throw new Error(json?.chart?.error?.description || 'no data');
      const ts = r.timestamp || [];
      const closes = r.indicators?.quote?.[0]?.close || [];
      const offset = (r.meta?.gmtoffset || 0) * 1000;
      return ts.map((t, i) => [isoDay(new Date(t * 1000 + offset)), num(closes[i])]).filter(([, c]) => c);
    },
  },

  // EOD Historical Data — paid/free-tier API that needs a token.
  // Included so a token-based source can be switched on from Settings.
  eodhd: {
    label: 'EODHD (token)',
    needsToken: true,
    note: 'Needs an API token from eodhd.com, typed in below.',
    async resolve(isin, token) {
      const json = await getJson(`https://eodhd.com/api/search/${encodeURIComponent(isin)}?api_token=${encodeURIComponent(token)}&fmt=json`);
      const hit = (Array.isArray(json) ? json : []).find((h) => h.Code && h.Exchange);
      if (!hit) throw new Error('not found');
      return {
        ref: { ticker: `${hit.Code}.${hit.Exchange}` },
        name: hit.Name, currency: hit.Currency || null, symbol: `${hit.Code}.${hit.Exchange}`,
      };
    },
    async history(ref, from, token) {
      const json = await getJson(`https://eodhd.com/api/eod/${encodeURIComponent(ref.ticker)}?api_token=${encodeURIComponent(token)}&fmt=json&from=${from}`);
      return (Array.isArray(json) ? json : []).map((p) => [p.date, num(p.close)]).filter(([d, c]) => d && c);
    },
  },
};

// Exchange rates (Yahoo, no token), to express every fund's price in the
// portfolio currency. Returns [[date, rate]] where price_in_base = price * rate.
async function fxHistory(from, to, start) {
  if (from === to) return null;
  const p1 = Math.floor(new Date(start + 'T00:00:00Z').getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const sym = `${from}${to}=X`;
  const json = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`);
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || [];
  const out = ts.map((t, i) => [isoDay(new Date(t * 1000)), num(closes[i])]).filter(([, c]) => c);
  if (!out.length) throw new Error(`no exchange rate ${from}→${to}`);
  return out;
}

// Convert a price history into `base` currency. London quotes in pence
// ("GBp") are turned into pounds first.
async function toBaseCurrency(history, currency, base) {
  let cur = currency;
  let h = history;
  if (cur === 'GBp' || cur === 'GBX') { h = h.map(([d, c]) => [d, c / 100]); cur = 'GBP'; }
  if (!cur || !base || cur === base) return { history: h, currency: cur || base, converted: false };
  const fx = await fxHistory(cur, base, h[0][0]);
  let j = 0;
  const out = [];
  for (const [d, c] of h) {
    while (j + 1 < fx.length && fx[j + 1][0] <= d) j++;
    if (fx[j][0] <= d || j === 0) out.push([d, c * fx[j][1]]);
  }
  return { history: out, currency: base, converted: true };
}

function firstWord(name) {
  return String(name || '').trim().split(/[\s(-]+/)[0].toLowerCase();
}

// "auto" tries the token-free sources in this order.
const AUTO_ORDER = ['nasdaq', 'yahoo'];

function createPriceService({ dataDir, readState }) {
  const PRICES_FILE = path.join(dataDir, 'prices.json');
  const SETTINGS_FILE = path.join(dataDir, 'price-settings.json');

  async function readJson(file, fallback) {
    try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
  }
  async function writeJson(file, obj, mode) {
    const tmp = file + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), mode ? { mode } : undefined);
    await fsp.rename(tmp, file);
  }

  const loadSettings = () => readJson(SETTINGS_FILE, { source: 'auto', tokens: {} });
  const loadPrices = () => readJson(PRICES_FILE, { lastRunAt: null, entries: {} });

  function providerOrder(settings) {
    const src = settings.source || 'auto';
    if (src === 'auto') {
      const order = [...AUTO_ORDER];
      if (settings.tokens?.eodhd) order.push('eodhd');
      return order;
    }
    return PROVIDERS[src] ? [src] : AUTO_ORDER;
  }

  // Find the fund with the first provider that knows it. Returns the result
  // plus a list of what each provider said (for the "Test code" button).
  // A source that has the fund in euro wins; otherwise the first source that
  // has it at all (its price is then converted to euro).
  async function lookup(isin, settings, from, opts = {}) {
    const tried = [];
    let fallback = null;
    for (const id of providerOrder(settings)) {
      const p = PROVIDERS[id];
      const token = settings.tokens?.[id];
      if (p.needsToken && !token) { tried.push({ provider: id, error: 'no token set' }); continue; }
      try {
        const info = await p.resolve(isin, token, { ticker: opts.ticker, prefer: BASE });
        const history = await p.history(info.ref, from, token);
        if (!history.length) throw new Error('found, but no prices');
        tried.push({ provider: id, ok: true, currency: info.currency });
        const result = { provider: id, ...info, history, tried };
        if (info.currency === BASE) return result;
        if (!fallback) fallback = result;
      } catch (err) {
        tried.push({ provider: id, error: err.message });
      }
    }
    if (fallback) return fallback;
    const e = new Error(tried.map((t) => `${PROVIDERS[t.provider].label}: ${t.error}`).join(' · '));
    e.tried = tried;
    throw e;
  }

  // Oldest date we need a price for, per ISIN: the latest manual valuation of
  // each fund holding it (the projection's starting point), with a week of
  // slack for weekends/holidays, and at least a year back for context.
  function neededFrom(state) {
    const out = {};
    const tickers = {};
    const yearAgo = isoDay(new Date(Date.now() - 365 * 86400000));
    for (const inv of state.investments || []) {
      const isin = normIsin(inv.isin);
      if (!isin) continue;
      const vals = (state.valuations || []).filter((v) => v.investmentId === inv.id).map((v) => v.date).sort();
      const anchor = vals.length ? vals[vals.length - 1] : yearAgo;
      const from = isoDay(new Date(new Date(anchor + 'T00:00:00Z').getTime() - 7 * 86400000));
      const min = from < yearAgo ? from : yearAgo;
      out[isin] = out[isin] && out[isin] < min ? out[isin] : min;
      if (inv.ticker) tickers[isin] = String(inv.ticker).trim();
    }
    return { from: out, tickers };
  }

  let running = null;

  // Refresh every fund ISIN in the data (or just `only`). A failure keeps the
  // last good price and records the error, so the app falls back gracefully.
  function refresh(only) {
    if (running) return running;
    running = (async () => {
      const [state, settings, prices] = await Promise.all([readState(), loadSettings(), loadPrices()]);
      const { from: needed, tickers } = neededFrom(state);
      const base = BASE;
      const isins = Object.keys(needed).filter((i) => !only || only.includes(i));
      const now = new Date().toISOString();
      for (const isin of isins) {
        const old = prices.entries[isin] || { isin };
        try {
          const r = await lookup(isin, settings, needed[isin], { ticker: tickers[isin] });
          const nativeLast = r.history[r.history.length - 1];
          const conv = await toBaseCurrency(r.history, r.currency, base);
          const last = conv.history[conv.history.length - 1];
          prices.entries[isin] = {
            isin, provider: r.provider, name: r.name, symbol: r.symbol,
            currency: conv.currency, nativeCurrency: r.currency, nativePrice: nativeLast[1],
            converted: conv.converted,
            history: conv.history, price: last[1], priceDate: last[0],
            fetchedAt: now, error: null, errorAt: null,
          };
        } catch (err) {
          prices.entries[isin] = { ...old, isin, error: err.message, errorAt: now };
        }
      }
      // Forget funds no longer in the data.
      for (const isin of Object.keys(prices.entries)) if (!needed[isin]) delete prices.entries[isin];
      // A run counts as done when something came through (or there was nothing
      // to fetch). If everything failed — e.g. no internet — the hourly check
      // simply tries again.
      const anyOk = isins.some((i) => !prices.entries[i]?.error);
      if (!only && (anyOk || !isins.length)) prices.lastRunAt = now;
      prices.lastAttemptAt = now;
      await writeJson(PRICES_FILE, prices);
      return prices;
    })().finally(() => { running = null; });
    return running;
  }

  async function test(isin, ticker) {
    isin = normIsin(isin);
    if (!isin) return { ok: false, error: 'That is not a valid ISIN (12 characters, e.g. DK0060747905).' };
    const settings = await loadSettings();
    const from = isoDay(new Date(Date.now() - 14 * 86400000));
    try {
      const r = await lookup(isin, settings, from, { ticker });
      const last = r.history[r.history.length - 1];
      return {
        ok: true, isin, provider: r.provider, providerLabel: PROVIDERS[r.provider].label,
        name: r.name, currency: r.currency, symbol: r.symbol, price: last[1], priceDate: last[0],
      };
    } catch (err) {
      return { ok: false, isin, error: err.message };
    }
  }

  // For checking coverage: ask every provider separately.
  async function testAll(isin, ticker) {
    isin = normIsin(isin);
    const settings = await loadSettings();
    const from = isoDay(new Date(Date.now() - 14 * 86400000));
    const results = {};
    for (const id of Object.keys(PROVIDERS)) {
      try {
        const r = await lookup(isin, { ...settings, source: id }, from, { ticker });
        const last = r.history[r.history.length - 1];
        results[id] = { ok: true, name: r.name, currency: r.currency, symbol: r.symbol, price: last[1], priceDate: last[0] };
      } catch (err) {
        results[id] = { ok: false, error: err.message };
      }
    }
    return { isin, results };
  }

  async function publicSettings() {
    const s = await loadSettings();
    return {
      source: s.source || 'auto',
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({
        id, label: p.label, needsToken: p.needsToken, note: p.note, hasToken: !!s.tokens?.[id],
      })),
    };
  }

  async function updateSettings(body) {
    const s = await loadSettings();
    s.tokens = s.tokens || {};
    if (body.source && (body.source === 'auto' || PROVIDERS[body.source])) s.source = body.source;
    if (body.token && PROVIDERS[body.token.provider]) {
      const v = String(body.token.value || '').trim();
      if (v) s.tokens[body.token.provider] = v; else delete s.tokens[body.token.provider];
    }
    await writeJson(SETTINGS_FILE, s, 0o600);
    // A different source may resolve funds differently: drop cached prices.
    const prices = await loadPrices();
    prices.entries = {};
    prices.lastRunAt = null;
    await writeJson(PRICES_FILE, prices);
    return publicSettings();
  }

  // Once a day: after 19:00 Copenhagen time (Danish fund prices are settled by
  // then), or straight away if the last run is more than a day old.
  function startSchedule() {
    const tick = async () => {
      try {
        const prices = await loadPrices();
        const last = prices.lastRunAt ? new Date(prices.lastRunAt) : null;
        const now = new Date();
        const cphHour = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Copenhagen' }).format(now);
        const cphDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(d);
        const overdue = !last || now - last > 26 * 3600000;
        const evening = cphHour >= 19 && (!last || cphDay(last) !== cphDay(now) || +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Copenhagen' }).format(last) < 19);
        if (overdue || evening) {
          const r = await refresh();
          const n = Object.keys(r.entries).length;
          const bad = Object.values(r.entries).filter((e) => e.error).length;
          console.log(`prices refreshed: ${n} fund(s)${bad ? `, ${bad} failed` : ''}`);
        }
      } catch (err) {
        console.error('price refresh failed:', err.message);
      }
    };
    setTimeout(tick, 30 * 1000);
    setInterval(tick, 60 * 60 * 1000);
  }

  return { loadPrices, refresh, test, testAll, publicSettings, updateSettings, startSchedule };
}

function normIsin(s) {
  const isin = String(s || '').replace(/\s+/g, '').toUpperCase();
  return isValidIsin(isin) ? isin : null;
}

module.exports = { createPriceService, isValidIsin, normIsin, PROVIDERS };
