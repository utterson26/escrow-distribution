import { NextResponse } from "next/server";
import { claimableFor } from "@/lib/claimable";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  const wallet = new URL(req.url).searchParams.get("wallet");
  const escrow = new URL(req.url).searchParams.get("escrow");
  if (!wallet || !escrow) {
    return NextResponse.json({ error: "wallet and escrow are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await claimableFor(mint, escrow, wallet));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
