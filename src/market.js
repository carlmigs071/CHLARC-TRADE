// ---------------------------------------------------------------------------
// market.js — live data fetching + technical indicator math
// Free, no-API-key CoinGecko endpoints.
// ---------------------------------------------------------------------------

export const DEFAULT_WATCHLIST = [
  "bitcoin", "ethereum", "binancecoin", "solana", "ripple",
  "cardano", "dogecoin", "avalanche-2", "tron", "chainlink",
];

// All requests are routed through our own Vercel serverless proxy
// (/api/coingecko) instead of hitting api.coingecko.com directly from the
// browser. Several CoinGecko endpoints (notably market_chart) reject
// cross-origin browser requests with CORS, which silently breaks chart
// loading. The proxy runs server-side, where CORS doesn't apply.
function proxyUrl(path, params) {
  const qs = new URLSearchParams({ path, ...params });
  return `/api/coingecko?${qs.toString()}`;
}

export const INTERVALS = [
  // label, CoinGecko `days` param, intraday flag (controls axis label format)
  { label: "1m",  days: 1,   intraday: true,  bucketMin: 1   },
  { label: "5m",  days: 1,   intraday: true,  bucketMin: 5   },
  { label: "15m", days: 1,   intraday: true,  bucketMin: 15  },
  { label: "30m", days: 2,   intraday: true,  bucketMin: 30  },
  { label: "1h",  days: 7,   intraday: true,  bucketMin: 60  },
  { label: "2h",  days: 14,  intraday: true,  bucketMin: 120 },
  { label: "4h",  days: 30,  intraday: true,  bucketMin: 240 },
  { label: "8h",  days: 30,  intraday: true,  bucketMin: 480 },
  { label: "12h", days: 90,  intraday: true,  bucketMin: 720 },
  { label: "1D",  days: 90,  intraday: false, bucketMin: 1440 },
  { label: "1W",  days: 365, intraday: false, bucketMin: 1440 * 7 },
  { label: "1M",  days: "max", intraday: false, bucketMin: 1440 * 30 },
];

// ---------------------------------------------------------------------------
// Live fetching
// ---------------------------------------------------------------------------

export async function fetchMarkets(ids) {
  const list = ids && ids.length ? ids : DEFAULT_WATCHLIST;
  const url = proxyUrl("/coins/markets", { vs_currency: "usd", ids: list.join(","), order: "market_cap_desc", price_change_percentage: "24h" });
  const r = await fetch(url);
  if (!r.ok) throw new Error("markets fetch failed: " + r.status);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("bad markets payload");
  return data;
}

// Search any coin on CoinGecko (thousands of listings, not just the watchlist)
export async function searchCoins(query) {
  const q = query.trim();
  if (!q) return [];
  const url = proxyUrl("/search", { query: q });
  const r = await fetch(url);
  if (!r.ok) throw new Error("search failed: " + r.status);
  const data = await r.json();
  return (data.coins || []).slice(0, 15).map((c) => ({
    id: c.id, symbol: c.symbol, name: c.name, image: c.thumb,
  }));
}

// Fetch live market snapshot (price, 24h change, high/low, volume) for any
// arbitrary set of coin ids — used both for the watchlist and for coins
// pulled in via search.
export async function fetchMarketsByIds(ids) {
  if (!ids || !ids.length) return [];
  const url = proxyUrl("/coins/markets", { vs_currency: "usd", ids: ids.join(","), order: "market_cap_desc", price_change_percentage: "24h" });
  const r = await fetch(url);
  if (!r.ok) throw new Error("markets fetch failed: " + r.status);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("bad markets payload");
  return data;
}

// CoinGecko market_chart returns raw [timestamp, price] pairs, and (for
// most days ranges) a parallel total_volumes series. We bucket those into
// OHLC + volume candles ourselves so any interval (1m..1M) can be
// approximated from the same source.
export async function fetchChartData(id, days) {
  const url = proxyUrl(`/coins/${id}/market_chart`, { vs_currency: "usd", days: String(days) });
  const r = await fetch(url);
  if (!r.ok) throw new Error("chart fetch failed: " + r.status);
  const data = await r.json();
  if (!data || !Array.isArray(data.prices)) throw new Error("bad chart payload");
  return { prices: data.prices, volumes: data.total_volumes || [] };
}

export function bucketToCandles(prices, volumes, bucketMin, maxCandles = 90) {
  if (!prices || prices.length < 2) return [];
  const bucketMs = bucketMin * 60 * 1000;
  const priceBuckets = new Map();
  for (const [ts, price] of prices) {
    const key = Math.floor(ts / bucketMs) * bucketMs;
    if (!priceBuckets.has(key)) priceBuckets.set(key, []);
    priceBuckets.get(key).push(price);
  }
  const volBuckets = new Map();
  for (const [ts, vol] of volumes || []) {
    const key = Math.floor(ts / bucketMs) * bucketMs;
    volBuckets.set(key, vol); // CoinGecko volume is already cumulative-ish per point; take latest in bucket
  }
  const keys = Array.from(priceBuckets.keys()).sort((a, b) => a - b);
  const candles = keys.map((k) => {
    const vals = priceBuckets.get(k);
    return {
      t: k,
      o: vals[0],
      c: vals[vals.length - 1],
      h: Math.max(...vals),
      l: Math.min(...vals),
      v: volBuckets.get(k) ?? null,
    };
  });
  return candles.slice(-maxCandles);
}

// ---------------------------------------------------------------------------
// Indicator math
// ---------------------------------------------------------------------------

export function smaSeries(vals, period) {
  const out = new Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

// Average True Range — volatility measure, used to judge whether stops need
// more room and whether a move is unusually large.
export function atr(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Main signal computation: RSI + MA trend + support/resistance + volume
// confirmation + a confidence score. Pure function of one candle series.
export function computeSignal(candles) {
  if (!candles || candles.length < 15) return null;
  const closes = candles.map((c) => c.c);
  const ma7 = smaSeries(closes, 7);
  const ma25 = smaSeries(closes, 25);
  const r = rsi(closes, 14);
  const last = closes[closes.length - 1];
  const m7 = ma7[ma7.length - 1];
  const m25 = ma25[ma25.length - 1];
  const look = candles.slice(-20);
  const support = Math.min(...look.map((c) => c.l));
  const resistance = Math.max(...look.map((c) => c.h));
  const theAtr = atr(candles, 14);
  const volatilityPct = theAtr != null ? (theAtr / last) * 100 : null;

  // volume confirmation (only meaningful if the feed actually returned volumes)
  const vols = candles.map((c) => c.v).filter((v) => v != null);
  let volumeConfirmed = false, volumeWeak = false;
  if (vols.length >= 5) {
    const recentVol = vols.slice(-10);
    const avgVol = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
    const lastVol = vols[vols.length - 1];
    volumeConfirmed = lastVol > avgVol * 1.15;
    volumeWeak = lastVol < avgVol * 0.7;
  }

  let bull = 0, bear = 0;
  const checks = [];
  if (m7 != null) {
    if (last > m7) { bull++; checks.push(["bull", "Price above MA7"]); }
    else { bear++; checks.push(["bear", "Price below MA7"]); }
  }
  if (m7 != null && m25 != null) {
    if (m7 > m25) { bull++; checks.push(["bull", "Uptrend (MA7 > MA25)"]); }
    else { bear++; checks.push(["bear", "Downtrend (MA7 < MA25)"]); }
  }
  if (r != null) {
    if (r >= 70) { bear++; checks.push(["bear", "RSI overbought (>70)"]); }
    else if (r <= 30) { bull++; checks.push(["bull", "RSI oversold (<30)"]); }
    else { checks.push(["neutral", "RSI neutral (30–70)"]); }
  }
  if (volumeConfirmed) checks.push(["neutral", "Volume confirms the latest move"]);
  if (volumeWeak) checks.push(["neutral", "Volume is weak — move may lack conviction"]);

  const diff = bull - bear;
  let signal = "HOLD", tone = "hold";
  if (diff >= 2) { signal = "BUY"; tone = "buy"; }
  else if (diff === 1) { signal = "BUY (weak)"; tone = "buy"; }
  else if (diff === -1) { signal = "SELL (weak)"; tone = "sell"; }
  else if (diff <= -2) { signal = "SELL"; tone = "sell"; }

  const totalChecks = bull + bear;
  let confidence = totalChecks > 0 ? Math.round((Math.max(bull, bear) / totalChecks) * 100) : 50;
  if (tone !== "hold") {
    if (volumeConfirmed) confidence = Math.min(100, confidence + 10);
    if (volumeWeak) confidence = Math.max(10, confidence - 15);
  } else {
    confidence = Math.round(confidence * 0.6);
  }

  return {
    ma7, ma25, rsi: r, ma7last: m7, ma25last: m25, last, bull, bear, signal, tone, checks,
    support, resistance, atr: theAtr, volatilityPct, volumeConfirmed, volumeWeak, confidence,
  };
}

// Lightweight version of the same logic, used for the multi-timeframe
// confirmation check (only needs the directional tone, not the full object).
export function quickTone(candles) {
  if (!candles || candles.length < 15) return "hold";
  const closes = candles.map((c) => c.c);
  const ma7 = smaSeries(closes, 7), ma25 = smaSeries(closes, 25), r = rsi(closes, 14);
  const last = closes[closes.length - 1];
  const m7 = ma7[ma7.length - 1], m25 = ma25[ma25.length - 1];
  let bull = 0, bear = 0;
  if (m7 != null) last > m7 ? bull++ : bear++;
  if (m7 != null && m25 != null) m7 > m25 ? bull++ : bear++;
  if (r != null) { if (r >= 70) bear++; else if (r <= 30) bull++; }
  const d = bull - bear;
  return d >= 1 ? "buy" : d <= -1 ? "sell" : "hold";
}

// Spike/drop detector: compares the most recent candle's % move against the
// recent average move size. Returns null, or an alert object.
export function detectSpike(candles, threshold = 2.5) {
  if (!candles || candles.length < 8) return null;
  const moves = candles.slice(-9, -1).map((c) => Math.abs((c.c - c.o) / c.o) * 100);
  const avgMove = moves.reduce((a, b) => a + b, 0) / moves.length || 0.5;
  const lastCandle = candles[candles.length - 1];
  const lastMovePct = ((lastCandle.c - lastCandle.o) / lastCandle.o) * 100;
  const magnitude = Math.abs(lastMovePct);
  if (magnitude > Math.max(threshold, avgMove * 2.2)) {
    return {
      direction: lastMovePct > 0 ? "up" : "down",
      pct: lastMovePct,
      price: lastCandle.c,
      t: lastCandle.t,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Position sizing — pure arithmetic on a user-entered USDT amount
// ---------------------------------------------------------------------------

export function computePlan(amountUsdt, price, signal) {
  const amt = parseFloat(amountUsdt);
  if (!amt || amt <= 0 || !price || !signal) return null;
  const units = amt / price;
  const entry = Math.min(price, signal.support * 1.01);
  const unitsAtEntry = amt / entry;
  const takeProfit = signal.resistance;
  const stopLoss = signal.support * 0.97;
  const potentialGain = unitsAtEntry * (takeProfit - entry);
  const potentialGainPct = ((takeProfit - entry) / entry) * 100;
  const potentialLoss = unitsAtEntry * (entry - stopLoss);
  const potentialLossPct = ((entry - stopLoss) / entry) * 100;
  const rrRatio = potentialLoss > 0 ? potentialGain / potentialLoss : null;
  return {
    amt, price, units, entry, unitsAtEntry, takeProfit, stopLoss,
    potentialGain, potentialGainPct, potentialLoss, potentialLossPct, rrRatio,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export const fmt = (p) => {
  if (p == null || isNaN(p)) return "--";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
};

export const usdt = (p) => `${fmt(p)} USDT`;

export const fmtBig = (n) => {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
};
