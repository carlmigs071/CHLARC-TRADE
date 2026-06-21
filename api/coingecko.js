// Vercel serverless function: proxies requests to CoinGecko so the browser
// never talks to api.coingecko.com directly (which blocks cross-origin
// requests with CORS on several endpoints, including market_chart).
//
// Usage from the frontend: fetch("/api/coingecko?path=/coins/bitcoin/market_chart&vs_currency=usd&days=7")
// The "path" query param is the CoinGecko path (after /api/v3); every other
// query param is forwarded as-is to CoinGecko.

export default async function handler(req, res) {
  const { path, ...rest } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Missing 'path' query parameter" });
    return;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value != null) params.append(key, String(value));
  }

  const url = `https://api.coingecko.com/api/v3${path}?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    const body = await upstream.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: "Upstream fetch failed", detail: String(e) });
  }
}
