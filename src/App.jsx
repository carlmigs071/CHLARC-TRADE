import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import HudRing from "./HudRing.jsx";
import Candles from "./Candles.jsx";
import {
  DEFAULT_WATCHLIST, INTERVALS, fetchMarketsByIds, searchCoins, fetchChartData,
  bucketToCandles, computeSignal, quickTone, computePlan, usdt, fmtBig,
} from "./market.js";

const MARKET_REFRESH_MS = 45000;
const CHART_REFRESH_MS = 60000;
const SEARCH_DEBOUNCE_MS = 350;

function CoinIcon({ coin, size = 22 }) {
  if (coin?.image) {
    return <img src={coin.image} alt="" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: "#1e2933", color: "#7eecff",
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
      fontSize: size * 0.4, flexShrink: 0,
    }}>{(coin?.symbol || "??").slice(0, 2).toUpperCase()}</div>
  );
}

export default function App() {
  const [watchIds, setWatchIds] = useState(DEFAULT_WATCHLIST);
  const [markets, setMarkets] = useState([]);
  const [marketsStatus, setMarketsStatus] = useState("loading");

  const [selectedId, setSelectedId] = useState(null);
  const [tf, setTf] = useState(INTERVALS[4]); // default 1h
  const [candles, setCandles] = useState([]);
  const [volume, setVolume] = useState([]);
  const [chartStatus, setChartStatus] = useState("loading");

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const [amount, setAmount] = useState("");
  const [view, setView] = useState("list"); // list | detail | guide
  const [now, setNow] = useState(new Date());

  const [journal, setJournal] = useState([]);
  const [showJournal, setShowJournal] = useState(false);

  const [messages, setMessages] = useState([{
    role: "chlarc",
    text: "C.H.L.A.R.C. online. Pick a coin, or search for any other one. I'll read RSI, trend, volume, volatility, and multi-timeframe agreement, and give you a BUY/SELL/HOLD signal with a confidence score. Guidance only — you place every trade yourself on Binance.",
  }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const messagesRef = useRef([]);
  const ctxRef = useRef({});
  const chatEndRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  const selected = useMemo(() => markets.find((c) => c.id === selectedId) || null, [markets, selectedId]);
  const ind = useMemo(() => computeSignal(candles), [candles]);

  const loadMarkets = useCallback(async (ids) => {
    try {
      const data = await fetchMarketsByIds(ids);
      setMarkets((prev) => {
        const byId = new Map(data.map((d) => [d.id, d]));
        const merged = prev.filter((p) => !byId.has(p.id));
        return [...data, ...merged];
      });
      setMarketsStatus("online");
    } catch {
      setMarketsStatus("offline");
    }
  }, []);

  useEffect(() => {
    loadMarkets(watchIds);
    const id = setInterval(() => loadMarkets(watchIds), MARKET_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchIds.join(",")]);

  const loadChart = useCallback(async (coinId, interval) => {
    if (!coinId) return;
    setChartStatus("loading");
    try {
      const { prices, volumes } = await fetchChartData(coinId, interval.days);
      const c = bucketToCandles(prices, volumes, interval.bucketMin, 90);
      setCandles(c);
      setVolume(c.map((x) => x.v));
      setChartStatus(c.length >= 2 ? "online" : "offline");
    } catch {
      setChartStatus("offline");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadChart(selectedId, tf);
    const id = setInterval(() => loadChart(selectedId, tf), CHART_REFRESH_MS);
    return () => clearInterval(id);
  }, [selectedId, tf, loadChart]);

  const [mtf, setMtf] = useState({ lowerLabel: "", higherLabel: "", lowerTone: "hold", higherTone: "hold", aligned: false, mixed: false });
  useEffect(() => {
    if (!selectedId || !ind) return;
    let cancelled = false;
    const idx = INTERVALS.findIndex((t) => t.label === tf.label);
    const lowerTf = INTERVALS[Math.max(0, idx - 3)];
    const higherTf = INTERVALS[Math.min(INTERVALS.length - 1, idx + 3)];
    const run = async () => {
      try {
        const [lowerData, higherData] = await Promise.all([
          lowerTf.label === tf.label ? null : fetchChartData(selectedId, lowerTf.days),
          higherTf.label === tf.label ? null : fetchChartData(selectedId, higherTf.days),
        ]);
        if (cancelled) return;
        const lowerTone = lowerTf.label === tf.label
          ? ind.tone
          : quickTone(bucketToCandles(lowerData.prices, lowerData.volumes, lowerTf.bucketMin, 60));
        const higherTone = higherTf.label === tf.label
          ? ind.tone
          : quickTone(bucketToCandles(higherData.prices, higherData.volumes, higherTf.bucketMin, 60));
        const aligned = ind.tone !== "hold" && lowerTone === ind.tone && higherTone === ind.tone;
        const mixed = !aligned && ind.tone !== "hold" && (lowerTone !== ind.tone || higherTone !== ind.tone);
        setMtf({ lowerLabel: lowerTf.label, higherLabel: higherTf.label, lowerTone, higherTone, aligned, mixed });
      } catch {
        // non-critical; leave mtf as-is
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tf.label, ind?.tone]);

  const plan = useMemo(() => {
    if (!selected || !ind) return null;
    return computePlan(amount, selected.current_price, ind);
  }, [amount, selected, ind]);

  useEffect(() => {
    if (!selected || !ind) return;
    ctxRef.current = {
      coin: selected.name, symbol: (selected.symbol || "").toUpperCase(),
      price: selected.current_price, chg: selected.price_change_percentage_24h,
      timeframe: tf.label,
      rsi: ind.rsi, ma7: ind.ma7last, ma25: ind.ma25last,
      signal: ind.signal, support: ind.support, resistance: ind.resistance,
      bull: ind.bull, bear: ind.bear, confidence: ind.confidence,
      volumeConfirmed: ind.volumeConfirmed, volumeWeak: ind.volumeWeak, volatilityPct: ind.volatilityPct,
      mtfAligned: mtf.aligned, mtfMixed: mtf.mixed,
      mtfLowerLabel: mtf.lowerLabel, mtfLowerTone: mtf.lowerTone,
      mtfHigherLabel: mtf.higherLabel, mtfHigherTone: mtf.higherTone,
    };
  }, [selected, tf, ind, mtf]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchCoins(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => searchTimer.current && clearTimeout(searchTimer.current);
  }, [query]);

  const openCoin = useCallback(async (id) => {
    if (!watchIds.includes(id)) {
      setWatchIds((p) => [...p, id]);
      try {
        const snap = await fetchMarketsByIds([id]);
        if (snap.length) setMarkets((p) => [...p.filter((m) => m.id !== id), snap[0]]);
      } catch { /* will pick up on next refresh */ }
    }
    setSelectedId(id);
    setView("detail");
    setQuery(""); setSearchResults([]);
  }, [watchIds]);

  const removeFromWatch = (id, e) => {
    e.stopPropagation();
    if (DEFAULT_WATCHLIST.includes(id)) return;
    setWatchIds((p) => p.filter((x) => x !== id));
    setMarkets((p) => p.filter((x) => x.id !== id));
  };

  const localRead = (c, p) => {
    if (c.rsi == null) {
      return `Still gathering enough candles on ${c.coin || "this coin"} (${c.timeframe}) to read indicators reliably — try again shortly or pick another interval.`;
    }
    const rt = c.rsi >= 70
      ? `RSI ${c.rsi.toFixed(1)} (overbought) — stretched high, watch for selling pressure.`
      : c.rsi <= 30
      ? `RSI ${c.rsi.toFixed(1)} (oversold) — stretched low, some watch this as a buy.`
      : `RSI ${c.rsi.toFixed(1)} (neutral).`;
    const volTxt = c.volumeConfirmed ? " Volume is confirming this move." : c.volumeWeak ? " Volume is light, so this move may lack conviction." : "";
    const mtfTxt = c.mtfAligned ? ` ${c.mtfLowerLabel} and ${c.mtfHigherLabel} timeframes both agree, which strengthens this read.` : c.mtfMixed ? ` ${c.mtfLowerLabel} and ${c.mtfHigherLabel} timeframes don't fully agree — treat this with extra caution.` : "";
    const volaTxt = c.volatilityPct != null ? ` Volatility (ATR) is about ${c.volatilityPct.toFixed(2)}% per candle.` : "";
    const base = `On ${c.coin} (${c.timeframe}): signal is ${c.signal} at roughly ${c.confidence}% confidence. ${rt}${volTxt}${mtfTxt}${volaTxt} Buy zone (support) near ${usdt(c.support)} 🟢, sell zone (resistance) near ${usdt(c.resistance)} 🔴.`;
    if (p) {
      return `${base} With ${usdt(p.amt)}, that's roughly ${p.unitsAtEntry.toFixed(6)} ${c.symbol} near entry ${usdt(p.entry)}. Take-profit near ${usdt(p.takeProfit)} (+${usdt(p.potentialGain)}, ${p.potentialGainPct.toFixed(1)}%), stop-loss near ${usdt(p.stopLoss)} (-${usdt(p.potentialLoss)}, ${p.potentialLossPct.toFixed(1)}%). Check the news before acting. Guidance only — crypto is volatile, the call is yours on Binance.`;
    }
    return `${base} Guidance only — crypto is volatile, the decision is yours.`;
  };

  const send = useCallback(async (textArg) => {
    const text = (textArg ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    const um = { role: "user", text };
    setMessages((p) => [...p, um]);
    setThinking(true);
    const c = ctxRef.current;
    const p = plan;
    try {
      const history = [...messagesRef.current, um].map((m) => ({ role: m.role === "chlarc" ? "assistant" : "user", content: m.text }));
      const planLine = p
        ? `Budget ${p.amt.toFixed(2)} USDT. Entry ${usdt(p.entry)} (~${p.unitsAtEntry.toFixed(6)} ${c.symbol}). Take-profit ${usdt(p.takeProfit)} (+${usdt(p.potentialGain)}, +${p.potentialGainPct.toFixed(1)}%). Stop-loss ${usdt(p.stopLoss)} (-${usdt(p.potentialLoss)}, -${p.potentialLossPct.toFixed(1)}%). ${p.rrRatio ? `R:R ~${p.rrRatio.toFixed(2)}:1.` : ""}`
        : "No budget entered yet.";
      const mtfLine = c.mtfAligned
        ? `Multi-timeframe: ${c.mtfLowerLabel} & ${c.mtfHigherLabel} agree with ${c.timeframe} — reinforced.`
        : c.mtfMixed
        ? `Multi-timeframe: ${c.mtfLowerLabel}=${c.mtfLowerTone}, ${c.mtfHigherLabel}=${c.mtfHigherTone} vs ${c.timeframe} — mixed, lower conviction.`
        : "Multi-timeframe: not strongly conflicting.";
      const system =
        "You are C.H.L.A.R.C., the user's personal crypto trading-guide AI (Iron Man's JARVIS vibe). Composed, precise, courteous, lightly witty. Always reply in English, 4-7 sentences max. " +
        "The user trades manually on Binance — you NEVER execute trades, you only explain the read, synthesizing RSI/MA trend, volume confirmation, volatility (ATR), and multi-timeframe agreement into one honest read with the given confidence score. If signals are mixed or volume is weak, say so plainly. Remind the user to check news/announcements, since none of this sees headlines. " +
        "NEVER give a flat guaranteed order or promise profit. ALWAYS end reminding crypto is volatile and the decision is the user's own. " +
        `Focus: ${c.coin || "no coin"} (${c.symbol || ""}) ${c.timeframe}. Price ${usdt(c.price)}, 24h ${c.chg?.toFixed ? c.chg.toFixed(2) : c.chg}%. SIGNAL=${c.signal}, CONFIDENCE=${c.confidence}%. Support ${usdt(c.support)}, resistance ${usdt(c.resistance)}. RSI=${c.rsi != null ? c.rsi.toFixed(1) : "n/a"}. Volatility=${c.volatilityPct != null ? c.volatilityPct.toFixed(2) + "%" : "n/a"}. Volume: ${c.volumeConfirmed ? "confirming" : c.volumeWeak ? "weak" : "normal"}. ${mtfLine} ${planLine}`;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, system, messages: history }),
      });
      if (!resp.ok) throw new Error("AI backend not configured");
      const data = await resp.json();
      const reply = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim() || localRead(c, p);
      setMessages((p2) => [...p2, { role: "chlarc", text: reply }]);
    } catch {
      setMessages((p2) => [...p2, { role: "chlarc", text: localRead(c, plan) }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, plan]);

  useEffect(() => { chatEndRef.current && chatEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking, view]);

  const askForRead = () => {
    const c = ctxRef.current;
    if (plan) send(`I have a budget of ${plan.amt.toFixed(2)} USDT for ${c.coin}. How much should I buy/sell, and what's your read (${c.timeframe})?`);
    else send(`Give me your current buy/sell read on ${c.coin} (${c.timeframe}).`);
  };

  const logSignal = useCallback(() => {
    const c = ctxRef.current;
    if (!c.coin) return;
    const entry = {
      id: `${c.symbol}-${Date.now()}`,
      t: Date.now(),
      coin: c.coin, symbol: c.symbol, timeframe: c.timeframe,
      price: c.price, signal: c.signal, confidence: c.confidence,
      mtfAligned: c.mtfAligned, mtfMixed: c.mtfMixed,
      amount: plan ? plan.amt : null,
    };
    setJournal((p) => [entry, ...p].slice(0, 100));
    setMessages((p) => [...p, { role: "chlarc", text: `📝 Logged: ${entry.symbol} ${entry.signal} at ${usdt(entry.price)} (${entry.timeframe}, ${entry.confidence}% confidence).` }]);
  }, [plan]);

  const ringTone = ind?.tone === "buy" ? "buy" : ind?.tone === "sell" ? "sell" : "idle";
  const distSup = ind && selected ? ((ind.support - selected.current_price) / selected.current_price) * 100 : 0;
  const distRes = ind && selected ? ((ind.resistance - selected.current_price) / selected.current_price) * 100 : 0;

  return (
    <div className="app-root">
      <GlobalStyle />

      <div className="topbar">
        {view === "detail" || view === "guide" ? (
          <button className="backbtn" onClick={() => setView("list")}>‹</button>
        ) : (
          <HudRing size={30} label="" tone="idle" />
        )}
        <div className="title">
          {view === "list" && "C.H.L.A.R.C."}
          {view === "detail" && selected && `${selected.symbol?.toUpperCase()}/USDT`}
          {view === "guide" && "Guide"}
        </div>
        <div className={`status ${marketsStatus}`}>
          <span className="dot" />{marketsStatus === "online" ? "LIVE" : marketsStatus === "offline" ? "OFFLINE" : "···"}
        </div>
      </div>

      {view === "list" && (
        <div className="screen">
          <div className="search-wrap">
            <div className="search-box">
              <span className="icon">🔍</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any crypto…" />
              {query && <button className="search-clear" onClick={() => setQuery("")}>✕</button>}
            </div>
            {query.trim() && (
              <div className="search-dropdown">
                {searching && <div className="search-empty">Searching…</div>}
                {!searching && searchResults.length === 0 && <div className="search-empty">No matches for "{query}"</div>}
                {!searching && searchResults.map((c) => (
                  <div key={c.id} className="search-row" onClick={() => openCoin(c.id)}>
                    <CoinIcon coin={c} size={20} />
                    <div><div className="sname">{(c.symbol || "").toUpperCase()}</div><div className="ssub">{c.name}</div></div>
                    {!watchIds.includes(c.id) && <span className="search-add">+ add</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {marketsStatus === "offline" && (
            <div className="banner-warn">⚠ Can't reach live prices right now. Pull to retry or check your connection.</div>
          )}

          <div className="list">
            {markets.length === 0 && marketsStatus === "loading" && (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="row skeleton" />)
            )}
            {watchIds.map((id) => {
              const c = markets.find((m) => m.id === id);
              if (!c) return <div key={id} className="row skeleton" />;
              const up = (c.price_change_percentage_24h || 0) >= 0;
              return (
                <div key={c.id} className="row" onClick={() => openCoin(c.id)}>
                  <CoinIcon coin={c} size={34} />
                  <div className="row-main">
                    <div className="row-name">{c.symbol?.toUpperCase()}</div>
                    <div className="row-sub">{c.name}</div>
                  </div>
                  <div className="row-right">
                    <div className="row-price">{usdt(c.current_price)}</div>
                    <div className={`row-chg ${up ? "pos" : "neg"}`}>{up ? "+" : ""}{(c.price_change_percentage_24h || 0).toFixed(2)}%</div>
                  </div>
                  {!DEFAULT_WATCHLIST.includes(id) && (
                    <button className="row-x" onClick={(e) => removeFromWatch(id, e)} title="Remove">✕</button>
                  )}
                  <div className="chev">›</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "detail" && selected && (
        <div className="screen">
          <div className="price-hero">
            <div className={`big ${selected.price_change_percentage_24h >= 0 ? "pos" : "neg"}`}>{usdt(selected.current_price)}</div>
            <div className="hero-row">
              <span className={selected.price_change_percentage_24h >= 0 ? "pos" : "neg"}>
                {selected.price_change_percentage_24h >= 0 ? "▲" : "▼"} {Math.abs(selected.price_change_percentage_24h || 0).toFixed(2)}% · 24h
              </span>
              <span className="muted">Vol {fmtBig(selected.total_volume)} USDT</span>
            </div>
          </div>

          <div className="tf-scroll">
            {INTERVALS.map((t) => (
              <button key={t.label} className={tf.label === t.label ? "on" : ""} onClick={() => setTf(t)}>{t.label}</button>
            ))}
          </div>

          <div className="chart-card">
            {chartStatus === "offline" ? (
              <div className="chart-empty">⚠ Couldn't load chart for this interval — try another timeframe.</div>
            ) : (
              <Candles candles={candles} ma7={ind?.ma7} ma25={ind?.ma25} intraday={tf.intraday} volume={volume} />
            )}
            <div className="legend-row">
              <span><i className="sw" style={{ background: "#ffb14d" }} />MA7</span>
              <span><i className="sw" style={{ background: "#a78bfa" }} />MA25</span>
              <span>bars = volume</span>
            </div>
          </div>

          {ind && (
            <>
              <div className={`signal-banner ${ind.tone}`}>
                <span className="sig-emoji">{ind.tone === "buy" ? "🟢" : ind.tone === "sell" ? "🔴" : "⚪"}</span>
                <div className="sig-text">
                  <div className="sig-main">{ind.signal} SIGNAL</div>
                  <div className="sig-sub">{ind.bull} bullish · {ind.bear} bearish — {tf.label}</div>
                </div>
                <span className="confidence-badge">{ind.confidence}% confidence</span>
              </div>

              <div className={`mtf-row ${mtf.aligned ? "aligned" : mtf.mixed ? "mixed" : ""}`}>
                <span className="mtf-label">{mtf.lowerLabel}</span>
                <span className={`mtf-tone ${mtf.lowerTone}`}>{mtf.lowerTone}</span>
                <span className="mtf-arrow">→</span>
                <span className="mtf-label on">{tf.label}</span>
                <span className={`mtf-tone ${ind.tone}`}>{ind.tone}</span>
                <span className="mtf-arrow">→</span>
                <span className="mtf-label">{mtf.higherLabel}</span>
                <span className={`mtf-tone ${mtf.higherTone}`}>{mtf.higherTone}</span>
              </div>
              {(mtf.aligned || mtf.mixed) && (
                <div className={`mtf-verdict ${mtf.aligned ? "pos" : "neg"}`}>
                  {mtf.aligned ? "✓ Aligned across timeframes" : "⚠ Mixed — lower conviction"}
                </div>
              )}

              <div className="zones">
                <div className="zone buy">
                  <div className="lab">🟢 Buy zone</div>
                  <div className="val pos">{usdt(ind.support)}</div>
                  <div className="dist">{Math.abs(distSup).toFixed(2)}% below</div>
                </div>
                <div className="zone sell">
                  <div className="lab">🔴 Sell zone</div>
                  <div className="val neg">{usdt(ind.resistance)}</div>
                  <div className="dist">{Math.abs(distRes).toFixed(2)}% above</div>
                </div>
                <div className="zone">
                  <div className="lab">RSI(14)</div>
                  <div className="val">{ind.rsi != null ? ind.rsi.toFixed(1) : "--"}</div>
                </div>
                <div className="zone">
                  <div className="lab">Trend</div>
                  <div className="val" style={{ color: ind.ma7last > ind.ma25last ? "#0ecb81" : "#f6465d" }}>
                    {ind.ma7last > ind.ma25last ? "Up" : "Down"}
                  </div>
                </div>
                <div className="zone">
                  <div className="lab">Volume</div>
                  <div className="val" style={{ color: ind.volumeConfirmed ? "#0ecb81" : ind.volumeWeak ? "#f6465d" : "inherit" }}>
                    {ind.volumeConfirmed ? "Confirming" : ind.volumeWeak ? "Weak" : "Normal"}
                  </div>
                </div>
                <div className="zone">
                  <div className="lab">Volatility</div>
                  <div className="val">{ind.volatilityPct != null ? ind.volatilityPct.toFixed(2) + "%" : "--"}</div>
                </div>
              </div>

              <div className="news-reminder">📰 Check for breaking news on {selected.name} before acting — indicators don't see headlines.</div>

              <div className="amount-wrap">
                <div className="amount-lab">💰 How much do you want to trade?</div>
                <div className="amount-box">
                  <span className="amount-cur">USDT</span>
                  <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount (e.g. 500)" />
                  {amount && <button className="amount-clear" onClick={() => setAmount("")}>✕</button>}
                </div>
                {plan && (
                  <div className="plan-card">
                    <div className="plan-row plan-head"><span>≈ {plan.units.toFixed(6)} {selected.symbol?.toUpperCase()}</span><span className="muted">at current price</span></div>
                    <div className="plan-grid">
                      <div className="plan-cell">
                        <div className="plan-k">Entry</div><div className="plan-v">{usdt(plan.entry)}</div>
                        <div className="plan-sub">≈ {plan.unitsAtEntry.toFixed(6)} {selected.symbol?.toUpperCase()}</div>
                      </div>
                      <div className="plan-cell buy">
                        <div className="plan-k">🟢 Take-profit</div><div className="plan-v pos">{usdt(plan.takeProfit)}</div>
                        <div className="plan-sub pos">+{usdt(plan.potentialGain)} ({plan.potentialGainPct.toFixed(1)}%)</div>
                      </div>
                      <div className="plan-cell sell">
                        <div className="plan-k">🔴 Stop-loss</div><div className="plan-v neg">{usdt(plan.stopLoss)}</div>
                        <div className="plan-sub neg">-{usdt(plan.potentialLoss)} ({plan.potentialLossPct.toFixed(1)}%)</div>
                      </div>
                    </div>
                    {plan.rrRatio && <div className="plan-rr">Reward : Risk ≈ <b>{plan.rrRatio.toFixed(2)} : 1</b></div>}
                    <div className="plan-disc">Calculation only — not a guarantee. You place the order on Binance.</div>
                  </div>
                )}
              </div>
            </>
          )}

          <button className="guidebtn" onClick={() => { setView("guide"); askForRead(); }}>
            💬 Ask C.H.L.A.R.C. about {selected.symbol?.toUpperCase()}
          </button>
        </div>
      )}

      {view === "guide" && (
        <div className="screen chat-screen">
          <div className="hero-ring"><HudRing size={88} label="C.H.L.A.R.C." tone={ringTone} /></div>

          <div className="chat-log">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === "chlarc" && <div className="who">CHLARC</div>}
                <div className="body">{m.text}</div>
              </div>
            ))}
            {thinking && (
              <div className="msg chlarc"><div className="who">CHLARC</div><div className="typing"><span /><span /><span /></div></div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="quick">
            <button className="logbtn" onClick={logSignal} disabled={!selected}>📝 Log signal</button>
            <button className="logbtn ghost" onClick={() => setShowJournal((v) => !v)}>{showJournal ? "Hide" : "📓 Journal"} {journal.length > 0 && `(${journal.length})`}</button>
          </div>
          {showJournal && (
            <div className="journal-panel">
              {journal.length === 0 && <div className="journal-empty">No logged signals yet. Tap "Log signal" to track a read and compare it later against what happened.</div>}
              {journal.map((j) => (
                <div key={j.id} className="journal-row">
                  <div className="journal-top">
                    <span className={`journal-sig ${j.signal.toLowerCase().includes("buy") ? "pos" : j.signal.toLowerCase().includes("sell") ? "neg" : ""}`}>{j.signal}</span>
                    <span className="journal-sym">{j.symbol}</span>
                    <span className="journal-tf">{j.timeframe}</span>
                    <span className="journal-time">{new Date(j.t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="journal-bottom">
                    <span>{usdt(j.price)}</span><span>conf {j.confidence}%</span>
                    {j.mtfAligned && <span className="pos">✓ aligned</span>}
                    {j.mtfMixed && <span className="neg">⚠ mixed</span>}
                    {j.amount && <span>budget {j.amount.toFixed(0)} USDT</span>}
                  </div>
                </div>
              ))}
              {journal.length > 0 && <button className="journal-clear" onClick={() => setJournal([])}>Clear journal</button>}
            </div>
          )}

          <div className="composer">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={selected ? `Ask about ${selected.symbol?.toUpperCase()}…` : "Ask C.H.L.A.R.C.…"} />
            <button className="sendbtn" onClick={() => send()} disabled={thinking}>Send</button>
          </div>
        </div>
      )}

      <div className="bottomnav">
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><span className="icon">📊</span><span>Markets</span></button>
        <button className={view === "detail" ? "on" : ""} onClick={() => selected && setView("detail")} disabled={!selected}><span className="icon">🕯️</span><span>Chart</span></button>
        <button className={view === "guide" ? "on" : ""} onClick={() => setView("guide")}><span className="icon">💬</span><span>Guide</span></button>
      </div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Share+Tech+Mono&display=swap');
      :root{
        --bg:#070b12; --panel:#0d1521; --panel2:#121d2c; --line:rgba(63,216,240,.14);
        --acc:#3fd8f0; --acc2:#7eecff; --amber:#ffb14d; --green:#0ecb81; --red:#f6465d;
        --text:#d8eefc; --muted:#5d7a92;
      }
      *{ box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
      .app-root{
        min-height:100vh; min-height:100dvh; font-family:'Inter',system-ui,sans-serif;
        background:radial-gradient(900px 600px at 80% -10%, rgba(63,216,240,.07), transparent 60%), var(--bg);
        color:var(--text); display:flex; flex-direction:column;
        padding-top:env(safe-area-inset-top); padding-bottom:env(safe-area-inset-bottom);
        font-variant-numeric:tabular-nums; max-width:480px; margin:0 auto; position:relative;
      }
      .topbar{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(7,11,18,.92); backdrop-filter:blur(6px); z-index:10; }
      .backbtn{ background:var(--panel2); border:1px solid var(--line); color:var(--acc2); width:32px; height:32px; border-radius:8px; font-size:18px; }
      .title{ font-family:'Share Tech Mono',monospace; letter-spacing:1px; font-size:14px; font-weight:600; }
      .status{ margin-left:auto; display:flex; align-items:center; gap:6px; font-size:10px; letter-spacing:1px; color:var(--muted); }
      .status .dot{ width:7px; height:7px; border-radius:50%; background:var(--muted); }
      .status.online .dot{ background:var(--green); box-shadow:0 0 7px var(--green); } .status.online{ color:var(--green); }
      .status.offline .dot{ background:var(--red); } .status.offline{ color:var(--red); }

      .screen{ flex:1; overflow-y:auto; padding:12px 14px 90px; }
      .banner-warn{ background:rgba(246,70,93,.1); border:1px solid var(--red); color:var(--red); font-size:12px; padding:10px 12px; border-radius:8px; margin-bottom:10px; }

      .search-wrap{ position:relative; margin-bottom:10px; }
      .search-box{ display:flex; align-items:center; gap:8px; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
      .search-box input{ flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:13px; font-family:inherit; }
      .search-box input::placeholder{ color:var(--muted); }
      .search-clear{ background:none; border:none; color:var(--muted); cursor:pointer; font-size:14px; }
      .search-dropdown{ position:absolute; left:0; right:0; top:48px; background:var(--panel2); border:1px solid var(--acc); border-radius:8px; max-height:280px; overflow-y:auto; z-index:30; box-shadow:0 8px 24px rgba(0,0,0,.5); }
      .search-row{ display:flex; align-items:center; gap:9px; padding:9px 11px; cursor:pointer; border-bottom:1px solid rgba(63,216,240,.06); }
      .search-row:hover{ background:rgba(63,216,240,.08); }
      .search-row .sname{ font-size:12px; font-weight:600; } .search-row .ssub{ font-size:10px; color:var(--muted); }
      .search-empty{ padding:14px; text-align:center; color:var(--muted); font-size:12px; }
      .search-add{ margin-left:auto; font-size:9px; color:var(--acc); border:1px solid var(--acc); border-radius:10px; padding:2px 7px; }

      .list{ display:flex; flex-direction:column; gap:6px; }
      .row{ display:flex; align-items:center; gap:11px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
      .row.skeleton{ height:58px; opacity:.35; }
      .row-main{ flex:1; min-width:0; } .row-name{ font-size:14px; font-weight:700; } .row-sub{ font-size:11px; color:var(--muted); }
      .row-right{ text-align:right; } .row-price{ font-size:13px; font-weight:600; } .row-chg{ font-size:11px; }
      .row-x{ background:none; border:none; color:var(--muted); font-size:13px; opacity:.5; }
      .row-x:hover{ opacity:1; color:var(--red); }
      .chev{ color:var(--muted); font-size:16px; }
      .pos{ color:var(--green); } .neg{ color:var(--red); }

      .price-hero{ text-align:center; padding:10px 0 4px; }
      .price-hero .big{ font-size:30px; font-weight:800; font-family:'Share Tech Mono',monospace; }
      .hero-row{ display:flex; justify-content:center; gap:14px; font-size:12px; margin-top:4px; }
      .muted{ color:var(--muted); }

      .tf-scroll{ display:flex; gap:6px; overflow-x:auto; padding:10px 0; }
      .tf-scroll button{ flex-shrink:0; background:var(--panel2); border:1px solid var(--line); color:var(--muted); font-size:12px; padding:6px 13px; border-radius:16px; }
      .tf-scroll button.on{ background:var(--acc); color:#04222a; border-color:var(--acc); font-weight:700; }

      .chart-card{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; }
      .chart-empty{ padding:50px 10px; text-align:center; color:var(--muted); font-size:12px; }
      .chart-zoom-wrap{ position:relative; }
      .candles{ width:100%; display:block; }
      .zoom-controls{ position:absolute; top:6px; right:6px; display:flex; align-items:center; gap:4px; background:rgba(7,11,18,.78); border:1px solid var(--line); border-radius:7px; padding:4px 6px; }
      .zoom-controls button{ background:var(--panel2); border:1px solid var(--line); color:var(--acc); width:22px; height:22px; border-radius:5px; font-size:13px; font-weight:700; padding:0; }
      .zoom-controls .zoom-pct{ font-size:9px; color:var(--muted); font-family:'Share Tech Mono'; min-width:30px; text-align:center; }
      .zoom-controls .zoom-reset{ width:auto; font-size:11px; padding:0 5px; }
      .grid-line{ stroke:var(--line); stroke-width:.6; } .axis-text{ fill:var(--muted); font-size:9px; font-family:'Share Tech Mono'; }
      .candle.up .wick,.candle.up .body{ stroke:var(--green); fill:var(--green); }
      .candle.down .wick,.candle.down .body{ stroke:var(--red); fill:var(--red); }
      .wick{ stroke-width:1; } .body{ stroke-width:.5; } .ma{ stroke-width:1.3; } .ma7{ stroke:var(--amber); } .ma25{ stroke:#a78bfa; }
      .vol-bar.up{ fill:rgba(14,203,129,.55); } .vol-bar.down{ fill:rgba(246,70,93,.55); }
      .legend-row{ display:flex; gap:14px; justify-content:center; font-size:10px; color:var(--muted); padding-top:4px; }
      .legend-row .sw{ display:inline-block; width:12px; height:2px; vertical-align:middle; margin-right:4px; }

      .signal-banner{ display:flex; align-items:center; gap:12px; padding:13px 14px; border-radius:10px; margin-top:12px; flex-wrap:wrap; }
      .signal-banner.buy{ background:rgba(14,203,129,.12); border:1px solid var(--green); }
      .signal-banner.sell{ background:rgba(246,70,93,.12); border:1px solid var(--red); }
      .signal-banner.hold{ background:rgba(132,142,156,.12); border:1px solid var(--muted); }
      .sig-emoji{ font-size:24px; } .sig-text{ flex:1; min-width:0; } .sig-main{ font-weight:800; font-size:14px; }
      .signal-banner.buy .sig-main{ color:var(--green); } .signal-banner.sell .sig-main{ color:var(--red); } .signal-banner.hold .sig-main{ color:var(--muted); }
      .sig-sub{ font-size:11px; color:var(--muted); }
      .confidence-badge{ font-size:10px; font-weight:700; background:rgba(0,0,0,.25); padding:4px 9px; border-radius:12px; white-space:nowrap; }

      .mtf-row{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:10px; color:var(--muted); padding:8px 2px 0; }
      .mtf-label{ font-family:'Share Tech Mono',monospace; } .mtf-label.on{ color:var(--acc); font-weight:700; }
      .mtf-tone{ text-transform:uppercase; font-weight:700; font-size:9px; padding:2px 6px; border-radius:4px; }
      .mtf-tone.buy{ color:var(--green); background:rgba(14,203,129,.12); } .mtf-tone.sell{ color:var(--red); background:rgba(246,70,93,.12); } .mtf-tone.hold{ color:var(--muted); background:rgba(132,142,156,.1); }
      .mtf-arrow{ color:var(--muted); }
      .mtf-verdict{ font-size:11px; font-weight:600; padding:2px; } .mtf-verdict.pos{ color:var(--green); } .mtf-verdict.neg{ color:var(--amber); }

      .zones{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
      .zone{ background:var(--panel2); border:1px solid var(--line); border-radius:9px; padding:11px; }
      .zone.buy{ border-left:3px solid var(--green); } .zone.sell{ border-left:3px solid var(--red); }
      .zone .lab{ font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
      .zone .val{ font-size:16px; font-weight:700; margin-top:3px; font-family:'Share Tech Mono',monospace; }
      .zone .dist{ font-size:10px; color:var(--muted); margin-top:2px; }

      .news-reminder{ margin-top:12px; background:rgba(255,177,77,.08); border:1px solid var(--amber); color:var(--amber); font-size:11px; padding:9px 12px; border-radius:7px; line-height:1.4; }

      .amount-wrap{ margin-top:14px; }
      .amount-lab{ font-size:12px; font-weight:600; margin-bottom:8px; }
      .amount-box{ display:flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:9px 12px; }
      .amount-cur{ color:var(--acc); font-weight:700; font-size:13px; }
      .amount-box input{ flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:15px; font-family:'Share Tech Mono',monospace; }
      .amount-box input::placeholder{ color:var(--muted); font-family:'Inter'; font-size:13px; }
      .amount-clear{ background:none; border:none; color:var(--muted); cursor:pointer; }
      .plan-card{ margin-top:12px; background:var(--panel2); border:1px solid var(--acc); border-radius:9px; padding:13px; }
      .plan-row.plan-head{ display:flex; justify-content:space-between; font-size:13px; font-weight:700; color:var(--acc2); margin-bottom:10px; }
      .plan-grid{ display:flex; flex-direction:column; gap:8px; }
      .plan-cell{ background:var(--bg); border:1px solid var(--line); border-radius:7px; padding:9px; }
      .plan-cell.buy{ border-left:3px solid var(--green); } .plan-cell.sell{ border-left:3px solid var(--red); }
      .plan-k{ font-size:9px; color:var(--muted); text-transform:uppercase; } .plan-v{ font-size:15px; font-weight:700; margin-top:3px; font-family:'Share Tech Mono',monospace; }
      .plan-sub{ font-size:11px; color:var(--muted); margin-top:2px; }
      .plan-rr{ text-align:center; font-size:12px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
      .plan-disc{ font-size:10px; color:var(--muted); margin-top:9px; text-align:center; }

      .guidebtn{ width:100%; margin-top:16px; background:var(--acc); color:#04222a; border:none; font-weight:700; font-size:13px; padding:13px; border-radius:10px; }

      .chat-screen{ display:flex; flex-direction:column; padding-bottom:84px; }
      .hero-ring{ display:flex; justify-content:center; padding:8px 0 4px; }
      .chat-log{ flex:1; display:flex; flex-direction:column; gap:10px; padding:8px 2px; }
      .msg{ font-size:13px; line-height:1.5; max-width:90%; }
      .msg.user{ align-self:flex-end; background:var(--acc); color:#04222a; padding:8px 12px; border-radius:10px 10px 2px 10px; font-weight:500; }
      .msg.chlarc{ align-self:flex-start; }
      .msg.chlarc .who{ font-size:10px; color:var(--acc); font-weight:700; letter-spacing:1px; margin-bottom:3px; }
      .msg.chlarc .body{ background:var(--panel2); padding:9px 12px; border-radius:2px 10px 10px 10px; border:1px solid var(--line); }
      .typing{ display:inline-flex; gap:5px; padding:11px; background:var(--panel2); border-radius:8px; }
      .typing span{ width:6px; height:6px; border-radius:50%; background:var(--acc); animation:bl 1.2s infinite; }
      .typing span:nth-child(2){animation-delay:.2s} .typing span:nth-child(3){animation-delay:.4s}
      @keyframes bl{0%,100%{opacity:.25}50%{opacity:1}}

      .quick{ display:flex; gap:8px; padding:6px 2px; }
      .logbtn{ flex:1; background:var(--panel2); color:var(--acc2); border:1px solid var(--line); font-weight:600; font-size:12px; padding:9px; border-radius:7px; }
      .logbtn.ghost{ color:var(--muted); }
      .journal-panel{ background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:10px; max-height:200px; overflow-y:auto; margin:0 2px; }
      .journal-empty{ font-size:11px; color:var(--muted); line-height:1.5; padding:6px; }
      .journal-row{ border-bottom:1px solid rgba(63,216,240,.08); padding:7px 2px; }
      .journal-row:last-child{ border-bottom:none; }
      .journal-top{ display:flex; gap:7px; align-items:center; font-size:11px; flex-wrap:wrap; }
      .journal-sig{ font-weight:700; font-size:10px; padding:1px 6px; border-radius:4px; background:rgba(132,142,156,.15); }
      .journal-sym{ font-weight:700; } .journal-tf{ color:var(--muted); } .journal-time{ margin-left:auto; color:var(--muted); font-size:10px; }
      .journal-bottom{ display:flex; gap:10px; font-size:10px; color:var(--muted); margin-top:3px; flex-wrap:wrap; }
      .journal-clear{ width:100%; margin-top:8px; background:transparent; border:1px solid var(--red); color:var(--red); font-size:11px; padding:7px; border-radius:6px; }

      .composer{ display:flex; gap:7px; padding:8px 2px; position:sticky; bottom:0; background:var(--bg); }
      .composer input{ flex:1; background:var(--panel); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:11px; font-size:13px; outline:none; }
      .composer input:focus{ border-color:var(--acc); }
      .sendbtn{ background:var(--acc); color:#04222a; border:none; font-weight:700; padding:0 16px; border-radius:8px; font-size:13px; }

      .bottomnav{ position:fixed; bottom:0; left:0; right:0; max-width:480px; margin:0 auto; display:flex; background:rgba(13,21,33,.95); backdrop-filter:blur(8px); border-top:1px solid var(--line); padding:8px 0 calc(8px + env(safe-area-inset-bottom)); z-index:20; }
      .bottomnav button{ flex:1; background:transparent; border:none; color:var(--muted); display:flex; flex-direction:column; align-items:center; gap:2px; font-size:10px; }
      .bottomnav button.on{ color:var(--acc); } .bottomnav .icon{ font-size:18px; }

      .hud-ring{ stroke:var(--acc); opacity:.55; transform-origin:100px 100px; }
      .hud-tick{ stroke:var(--acc); stroke-width:1; opacity:.4; } .hud-tick.long{ stroke-width:1.6; opacity:.7; }
      .hud-ticks{ transform-origin:100px 100px; }
      .hud-thin{ stroke:var(--acc); stroke-width:.8; opacity:.3; }
      .hud-arc{ stroke:var(--acc2); stroke-width:3; opacity:.9; transform-origin:100px 100px; filter:drop-shadow(0 0 4px var(--acc)); }
      .hud-arc-amber{ stroke:var(--amber); stroke-width:3; opacity:.9; transform-origin:100px 100px; }
      .hud-thin2{ stroke:var(--acc); stroke-width:1; opacity:.5; transform-origin:100px 100px; }
      .hud-core{ fill:rgba(63,216,240,.06); stroke:var(--acc); stroke-width:1; opacity:.6; }
      .hud-label{ fill:var(--acc2); font-family:'Share Tech Mono',monospace; font-size:13px; letter-spacing:1.5px; filter:drop-shadow(0 0 5px var(--acc)); }
      .spin-cw{ animation:spinc 14s linear infinite; } .spin-ccw{ animation:spinc 10s linear infinite reverse; }
      @keyframes spinc{ to{ transform:rotate(360deg); } }
      .hud-buy .hud-arc,.hud-buy .hud-core,.hud-buy .hud-label{ stroke:var(--green); fill:var(--green); }
      .hud-sell .hud-arc,.hud-sell .hud-core,.hud-sell .hud-label{ stroke:var(--red); fill:var(--red); }
    `}</style>
  );
}
