import { NextResponse } from "next/server";
import { rpcUrl } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC pass-through so the browser (wallet adapter, launch
 * flow) uses the server's RPC without ever seeing its key. Reads and
 * transaction sends only — the allowlist below is what the site's own client
 * code needs.
 */
const ALLOW = new Set([
  "getLatestBlockhash", "getSlot", "getAccountInfo", "getMultipleAccounts", "getBalance",
  "getSignatureStatuses", "sendTransaction", "simulateTransaction", "getAddressLookupTable",
  "getTransaction", "getMinimumBalanceForRentExemption", "getTokenAccountBalance", "getBlockHeight",
  "getFeeForMessage", "getRecentPrioritizationFees", "getVersion", "getHealth", "getEpochInfo",
  "getTokenAccountsByOwner", "getSignaturesForAddress", "getParsedAccountInfo",
]);

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) {
    if (!c || typeof c.method !== "string" || !ALLOW.has(c.method)) {
      return NextResponse.json({ jsonrpc: "2.0", id: c?.id ?? null, error: { code: -32601, message: "method not allowed here" } }, { status: 403 });
    }
  }
  const r = await fetch(rpcUrl(), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  return new NextResponse(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
