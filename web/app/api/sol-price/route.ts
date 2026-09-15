import { NextResponse } from "next/server";
import { solPriceUsd } from "@/lib/solprice";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await solPriceUsd()); }
  catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 }); }
}
