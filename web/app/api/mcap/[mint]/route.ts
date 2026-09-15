import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { conn, bondingCurve, decodeCurve } from "@/lib/chain";
import { mapLimit } from "@/lib/data";

export const dynamic = "force-dynamic";

/** One pump trade on the coin's curve, as the chart needs it. */
export interface McapPoint {
  t: number;        // unix seconds
  slot: number;
  mcap: number;     // SOL
  sol: number;      // SOL moved in this trade
  buy: boolean;
  sig: string;
}

// sha256("event:TradeEvent")[..8]
const TRADE = "bddb7fd34ee661ee";
const FRESH_MS = 8_000;
/** Deepest first read; later calls only fetch what is newer than the last signature seen. */
const FIRST_READ = 300;

interface Cached { points: McapPoint[]; newest: string | null; supply: bigint; at: number; inflight: Promise<void> | null }
const cache = new Map<string, Cached>();

function decodeTrades(logs: string[], supply: bigint, slot: number, sig: string, blockTime: number | null): McapPoint[] {
  const out: McapPoint[] = [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    const b = Buffer.from(l.slice("Program data: ".length), "base64");
    if (b.length < 113 || b.subarray(0, 8).toString("hex") !== TRADE) continue;
    const vSol = b.readBigUInt64LE(97), vTok = b.readBigUInt64LE(105);
    if (vTok === 0n) continue;
    out.push({
      t: Number(b.readBigInt64LE(89)) || blockTime || 0, slot, sig,
      mcap: Number((supply * vSol) / vTok) / 1e9,
      sol: Number(b.readBigUInt64LE(40)) / 1e9,
      buy: b[56] === 1,
    });
  }
  return out;
}

async function refresh(mint: string, entry: Cached) {
  const c = conn();
  const curveAddr = bondingCurve(new PublicKey(mint));
  if (entry.supply === 0n) {
    const info = await c.getAccountInfo(curveAddr);
    if (!info) throw new Error("no bonding curve for this mint");
    entry.supply = decodeCurve(info.data as Buffer).tokenTotalSupply;
  }
  const sigs = await c.getSignaturesForAddress(curveAddr,
    entry.newest ? { until: entry.newest, limit: 1000 } : { limit: FIRST_READ }, "confirmed");
  const fresh = sigs.filter((s) => !s.err);
  if (fresh.length) {
    const txs = await mapLimit(fresh, 6, (s) =>
      c.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }));
    const pts: McapPoint[] = [];
    fresh.forEach((s, i) => pts.push(...decodeTrades(txs[i]?.meta?.logMessages ?? [], entry.supply, s.slot, s.signature, s.blockTime ?? null)));
    entry.points = [...entry.points, ...pts].sort((a, b) => a.slot - b.slot || a.t - b.t);
    entry.newest = sigs[0].signature;
  }
  entry.at = Date.now();
}

export async function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  try { new PublicKey(mint); } catch { return NextResponse.json({ error: "bad mint" }, { status: 400 }); }
  let entry = cache.get(mint);
  if (!entry) { entry = { points: [], newest: null, supply: 0n, at: 0, inflight: null }; cache.set(mint, entry); }
  try {
    if (Date.now() - entry.at > FRESH_MS) {
      // one refresh at a time per coin, however many tabs are polling
      entry.inflight ??= refresh(mint, entry).finally(() => { entry!.inflight = null; });
      await entry.inflight;
    }
    return NextResponse.json({ points: entry.points, supply: entry.supply.toString(), at: entry.at });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e), points: entry.points }, { status: entry.points.length ? 200 : 500 });
  }
}
