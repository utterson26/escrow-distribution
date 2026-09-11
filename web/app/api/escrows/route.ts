import { NextResponse } from "next/server";
import { buildRows } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await buildRows();
    return NextResponse.json(JSON.parse(JSON.stringify(rows,
      (_, v) => (typeof v === "bigint" ? v.toString() : v))));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
