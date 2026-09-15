import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { conn, network, PUMP, DEFAULT_MAX_LOCKED_VALUE_LAMPORTS, DEFAULT_MIN_POSITION_LAMPORTS } from "@/lib/chain";
import { fetchConfig, memo } from "@/lib/data";
import { solPriceUsd } from "@/lib/solprice";
import { Connection } from "@solana/web3.js";

/**
 * pump's fee_config tiers the creator fee by market cap; a fresh coin is in
 * tier 0, which charges 0.30% (seen on every launch TradeEvent:
 * creator_fee_basis_points = 30), not the 0.05% legacy field in `global`.
 */
const CREATOR_FEE_BPS_TIER0 = "30";
/** mainnet curve parameters, if the public RPC answers; the known values otherwise */
const MAINNET_FALLBACK = {
  feeRecipient: "", initialVirtualTokenReserves: "1073000000000000", initialVirtualSolReserves: "30000000000",
  tokenTotalSupply: "1000000000000000", feeBps: "95", creatorFeeBps: CREATOR_FEE_BPS_TIER0, buybackFeeRecipient: "",
};

export const dynamic = "force-dynamic";

/** The pump `global` account: curve parameters and fee recipients the launch instruction needs. */
async function pumpGlobal(c = conn()) {
  const addr = PublicKey.findProgramAddressSync([Buffer.from("global")], PUMP)[0];
  const info = await c.getAccountInfo(addr);
  if (!info) throw new Error("pump global account not found on this cluster");
  const d = info.data as Buffer;
  let o = 8 + 1 + 32; // disc, initialized, authority
  const key = () => { const k = new PublicKey(d.subarray(o, o + 32)).toBase58(); o += 32; return k; };
  const u64 = () => { const v = d.readBigUInt64LE(o); o += 8; return v.toString(); };
  const feeRecipient = key();
  const initialVirtualTokenReserves = u64(), initialVirtualSolReserves = u64();
  u64(); // initial_real_token_reserves
  const tokenTotalSupply = u64(), feeBps = u64();
  o += 32 + 1 + 8; // withdraw_authority, enable_migrate, pool_migration_fee
  const creatorFeeBps = u64();
  o += 7 * 32 + 32 + 32 + 1 + 32 + 32 + 1 + 7 * 32 + 1; // fee_recipients … is_cashback_enabled
  const buybackFeeRecipient = key();
  void creatorFeeBps;
  return { feeRecipient, initialVirtualTokenReserves, initialVirtualSolReserves, tokenTotalSupply, feeBps, creatorFeeBps: CREATOR_FEE_BPS_TIER0, buybackFeeRecipient };
}
const mainnetGlobal = () => memo("pumpGlobal:mainnet", 10 * 60_000, () =>
  pumpGlobal(new Connection("https://api.mainnet-beta.solana.com", "confirmed")).catch(() => MAINNET_FALLBACK));

export async function GET() {
  try {
    const [pump, cfg, mainnet, price] = await Promise.all([
      memo("pumpGlobal", 60_000, () => pumpGlobal()), fetchConfig(),
      network().name === "mainnet" ? Promise.resolve(null) : mainnetGlobal(), solPriceUsd().catch(() => null),
    ]);
    return NextResponse.json({
      network: network().name,
      pump, mainnet, solUsd: price?.usd ?? null,
      config: cfg ? {
        paused: cfg.paused ?? false,
        platformFeeBps: cfg.platformFeeBps,
        maxLockedValueLamports: (cfg.maxLockedValueLamports ?? DEFAULT_MAX_LOCKED_VALUE_LAMPORTS).toString(),
        minPositionLamports: (cfg.minPositionLamports ?? DEFAULT_MIN_POSITION_LAMPORTS).toString(),
      } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
