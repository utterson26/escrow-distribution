import { NextResponse } from "next/server";
import { fetchFeed } from "@/lib/data";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await fetchFeed(30));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
