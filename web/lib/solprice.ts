/** SOL/USD for the charts: Jupiter's price API, CoinGecko as fallback, cached 60 s in-process. */
const WSOL = "So11111111111111111111111111111111111111112";
let cache: { usd: number; at: number; source: string } | null = null;

export async function solPriceUsd(): Promise<{ usd: number; at: number; source: string }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const sources: [string, () => Promise<number>][] = [
    ["jupiter", async () => {
      const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      return Number(j?.[WSOL]?.usdPrice);
    }],
    ["coingecko", async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      return Number(j?.solana?.usd);
    }],
  ];
  for (const [source, fn] of sources) {
    try {
      const usd = await fn();
      if (usd > 0) { cache = { usd, at: Date.now(), source }; return cache; }
    } catch { /* next source */ }
  }
  if (cache) return cache; // stale beats nothing
  throw new Error("no SOL price source reachable");
}
