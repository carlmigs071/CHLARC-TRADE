# C.H.L.A.R.C. — Crypto Trade Guide (PWA)

A mobile-installable web app that watches live crypto prices and gives you
BUY / SELL / HOLD signals plus a confidence score, multi-timeframe
confirmation, volume/volatility context, and a trade journal. **It does not
place trades for you** — you keep using your Binance app for that. C.H.L.A.R.C.
only tells you what the chart is doing.

## What's inside
- `src/market.js` — live price + chart fetching (CoinGecko, free, no API key), coin search (any listed coin, not just the watchlist), and all the indicator math: RSI, moving averages, support/resistance, ATR/volatility, volume confirmation, a confidence score, multi-timeframe tone checking, spike detection, and position-size (entry/take-profit/stop-loss) arithmetic.
- `src/App.jsx` — the mobile UI: Markets list (with search) → Coin detail (zoomable chart with volume, signal banner, multi-timeframe row, zones, amount input + position plan, news reminder) → Guide (chat with C.H.L.A.R.C. + trade journal).
- `src/Candles.jsx` — candlestick chart with pinch/scroll zoom, drag-to-pan, and a volume sub-panel.
- `src/HudRing.jsx` — the JARVIS-style animated HUD ring.
- `vite.config.js` — configures this as an installable PWA (app icon, offline shell, "Add to Home Screen").

## Features at a glance
- **Search any crypto** — not limited to the default watchlist; search hits CoinGecko's full coin list.
- **12 intervals** — 1m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1D, 1W, 1M.
- **Zoomable chart** — pinch (touch) or scroll wheel (desktop) to zoom, drag to pan, with a reset button.
- **BUY/SELL/HOLD signal** with a **confidence score** (how many signals agree, adjusted for volume).
- **Multi-timeframe confirmation** — checks a shorter and longer interval against your current one and flags whether they agree or conflict.
- **Volume bars + confirmation** — flags whether the latest move has above-average volume behind it.
- **Volatility (ATR)** — tells you whether the current move is normal or stretched, useful for sizing stops.
- **Buy/sell zone (support/resistance) calculator** — type a USDT amount and get a suggested entry, take-profit, stop-loss, potential gain/loss, and reward:risk ratio.
- **News reminder** — a standing nudge to check headlines, since none of the above sees news.
- **Trade journal** — log any signal you want to track, review it later in the Guide tab.

## Run it locally (to try it on your laptop first)
You need [Node.js](https://nodejs.org) installed (version 18+).

```bash
cd chlarc
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). On your phone, if
it's on the same Wi-Fi, you can also open `http://<your-computer-IP>:5173`.

## Put it on your phone for real (free, ~10 minutes)
This is the part that makes it "an app you carry around."

### Option A — Vercel (recommended, easiest)
1. Go to https://vercel.com and sign up (free, can use GitHub/Google/email).
2. Install their CLI tool, or just drag-and-drop:
   - Easiest: create a free GitHub account, upload this `chlarc` folder as a new repository.
   - On vercel.com, click **"Add New → Project"**, import that GitHub repo.
   - Framework preset: it should auto-detect **Vite**. Click **Deploy**.
3. After ~1 minute you'll get a live URL like `https://chlarc-trade.vercel.app`.
4. Open that URL **on your phone's browser** (Chrome on Android, Safari on iPhone).
5. **Add to Home Screen:**
   - **Android (Chrome):** tap the ⋮ menu → "Add to Home screen" / "Install app".
   - **iPhone (Safari):** tap the Share icon → "Add to Home Screen".
6. It now opens full-screen with its own icon, like a real app.

### Option B — Netlify (just as easy)
1. Go to https://netlify.com, sign up free.
2. Drag the **built** `dist` folder onto their dashboard (after running `npm run build` locally), or connect your GitHub repo the same way as Vercel.
3. Same "Add to Home Screen" steps as above once you have the live URL.

### Turning it into an installable APK (optional)
Once it's deployed and you have a live URL, you can wrap it as a real Android
APK with **PWABuilder** (free, made by Microsoft, no coding required):
1. Go to https://www.pwabuilder.com
2. Paste your deployed URL (the Vercel/Netlify link)
3. Click **"Package for Stores" → Android**
4. Download the generated APK and install it on your phone

## Notes on accuracy & limits
- Price/chart data comes from CoinGecko's free public API. It updates every
  45–60 seconds — close to real-time, not tick-by-tick.
- Very short intervals (1m, 5m) are approximated by bucketing CoinGecko's
  available price points; they're indicative, not exchange-grade tick data.
- Volume data depends on what CoinGecko returns for the chosen `days` range;
  on some very short or very long ranges it may be sparse, in which case the
  "Volume" indicator will just show "Normal" rather than confirming/weak.
- The BUY/SELL/HOLD signal and confidence score are a simple, transparent
  rule set (RSI + moving average trend + support/resistance + volume +
  multi-timeframe agreement) — not a black box, and not a guarantee. Treat
  it as a second opinion, not an order.
- The chat ("Guide" tab) calls the Anthropic API for natural-language
  explanations. If you deploy this yourself, that call has no API key wired
  in on purpose — see the note in `src/App.jsx`'s `send()` function. Until
  you set up your own backend proxy with a key, the call will simply fail
  and the app falls back to a plain-math explanation (`localRead`), which
  needs no setup and always works — so the core signals, zones, journal,
  and position-sizing all work with zero extra configuration regardless.
- The trade journal is stored only in memory (component state) — it resets
  if you refresh the page. If you want it to persist between sessions,
  the next upgrade would be to save it to `localStorage` or a small backend.

## Safety reminder
This app is a **guide only**. It does not hold funds, does not place
orders, and does not connect to your Binance account. Every buy/sell you
make, you make yourself, on Binance, with your own judgment. Crypto is
highly volatile — please don't trade more than you can afford to lose.

