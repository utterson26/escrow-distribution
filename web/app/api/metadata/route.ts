import { NextResponse } from "next/server";
import { deflateSync } from "zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A 256×256 solid PNG in the brand accent, for launches that bring no image. */
function placeholderPng(): Buffer {
  const w = 256, h = 256, rgb = Buffer.from([0x2d, 0xd4, 0xbf]);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, rgb)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Uploads the coin's metadata JSON (and image) to pump.fun's IPFS endpoint,
 * which is what pump's own site does; the returned URI goes into `launch`.
 * Proxied here because the endpoint does not answer cross-origin requests.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const symbol = String(form.get("symbol") ?? "").trim();
    if (!name || !symbol) return NextResponse.json({ error: "name and symbol are required" }, { status: 400 });
    const out = new FormData();
    out.set("name", name); out.set("symbol", symbol);
    out.set("description", String(form.get("description") ?? ""));
    for (const k of ["twitter", "telegram", "website"]) { const v = String(form.get(k) ?? "").trim(); if (v) out.set(k, v); }
    out.set("showName", "true");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "image must be 4 MB or smaller" }, { status: 400 });
      out.set("file", file, file.name);
    } else {
      out.set("file", new Blob([new Uint8Array(placeholderPng())], { type: "image/png" }), "drop-chain.png");
    }
    const r = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: out });
    const text = await r.text();
    if (!r.ok) return NextResponse.json({ error: `metadata upload failed (${r.status}): ${text.slice(0, 200)}` }, { status: 502 });
    const j = JSON.parse(text);
    return NextResponse.json({ uri: j.metadataUri, image: j.metadata?.image ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
