import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { conn, network, PUMP, DEFAULT_MAX_LOCKED_VALUE_LAMPORTS, DEFAULT_MIN_POSITION_LAMPORTS } from "@/lib/chain";
import { fetchConfig, memo } from "@/lib/data";

export const dynamic = "force-dynamic";

/** The pump `global` account: curve parameters and fee recipients the launch instruction needs. */
async function pumpGlobal() {
  const addr = PublicKey.findProgramAddressSync([Buffer.from("global")], PUMP)[0];
  const info = await conn().getAccountInfo(addr);
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
  return { feeRecipient, initialVirtualTokenReserves, initialVirtualSolReserves, tokenTotalSupply, feeBps, creatorFeeBps, buybackFeeRecipient };
}

export async function GET() {
  try {
    const [pump, cfg] = await Promise.all([memo("pumpGlobal", 60_000, pumpGlobal), fetchConfig()]);
    return NextResponse.json({
      network: network().name,
      pump,
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
