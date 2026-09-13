import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  conn, PROGRAM_ID, anchorDisc, decodeEscrow, decodeRound, decodeCurve,
  bondingCurve, ata, marketCap, short, Escrow, Round, Curve, MAX_SHARE_BPS,
} from "./chain";

/** Name and symbol from the mint's Token-2022 metadata extension (pump writes it at create). */
export interface CoinMeta { name: string; symbol: string }

export async function fetchMetadata(mints: string[]): Promise<Record<string, CoinMeta>> {
  const c = conn();
  const out: Record<string, CoinMeta> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const infos = await c.getMultipleParsedAccounts(batch.map((m) => new PublicKey(m)));
    infos.value.forEach((info, j) => {
      const parsed: any = info?.data;
      const ext = parsed?.parsed?.info?.extensions?.find((x: any) => x.extension === "tokenMetadata");
      if (ext?.state?.name) out[batch[j]] = { name: ext.state.name, symbol: ext.state.symbol };
    });
  }
  return out;
}

/** "Name (SYM) · 2pL4…T3ea" — the short address stays so two coins with the same name are told apart. */
export const coinLabel = (mint: string, meta?: CoinMeta) =>
  meta ? `${meta.name} (${meta.symbol})` : short(mint, 6);

export interface CoinRow {
  escrow: Escrow;
  meta?: CoinMeta;
  curve: Curve | null;
  marketCapLamports: string;
  poolRemaining: string;      // escrowed - allocated
  escrowPct: number;          // locked airdrop share of the launch buy
  devPct: number;             // what stayed with the dev
  lastDistribution: { index: number; total: string; holders: number; claimed: number; claimedAmount: string } | null;
  /** per-wallet cap on one round, percent */
  capPct: number;
  /** "regular" — creator fee goes to the escrow; pump's holder-rewards coins are not launched here */
  coinType: "regular";
  /** the escrow keeps 100% of the creator fee: there is no platform fee on this program */
  platformFeePct: number;
  nextTrigger: NextTrigger | null;
}

export interface NextTrigger {
  state: "armed" | "waiting" | "unknown";
  kind?: "volume" | "milestone";
  slotsLeft?: number;
  volumeProgressPct?: number;   // toward 1% of market cap
  milestoneProgressPct?: number; // toward 2x the last milestone
}

const ESCROW_DISC = anchorDisc("account", "Escrow");
const ROUND_DISC = anchorDisc("account", "Round");
// a discriminator is 8 bytes, so it cannot go through PublicKey (32 bytes)
const toB58 = (b: Buffer) => bs58.encode(b);

export async function fetchEscrows(): Promise<Escrow[]> {
  const c = conn();
  const accs = await c.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: toB58(ESCROW_DISC) } }],
  });
  return accs
    .map((a) => decodeEscrow(a.pubkey.toBase58(), a.account.data as Buffer))
    // only coins that actually launched
    .filter((e) => e.bought > 0n)
    .sort((a, b) => Number(b.escrowed - a.escrowed));
}

export async function fetchRounds(escrowAddr?: string): Promise<Round[]> {
  const c = conn();
  const accs = await c.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: toB58(ROUND_DISC) } }],
  });
  const rounds = accs.map((a) => decodeRound(a.pubkey.toBase58(), a.account.data as Buffer));
  return escrowAddr ? rounds.filter((r) => r.escrow === escrowAddr) : rounds;
}

async function curveFor(mint: string): Promise<Curve | null> {
  try {
    const info = await conn().getAccountInfo(bondingCurve(new PublicKey(mint)));
    return info ? decodeCurve(info.data as Buffer) : null;
  } catch { return null; }
}

function nextTrigger(e: Escrow, curve: Curve | null, slot: number): NextTrigger | null {
  if (e.generation < 3 || !curve) return null;
  if (e.armed) {
    return {
      state: "armed",
      kind: e.armedKind === 2 ? "milestone" : "volume",
      slotsLeft: Math.max(0, Number(e.fireSlot ?? 0n) - slot),
    };
  }
  const mcap = marketCap(curve);
  const needed = mcap / 100n;
  const since = (e.cumVolume ?? 0n) - (e.volumeAtLastDist ?? 0n);
  const volPct = needed > 0n ? Number((since * 100n) / needed) : 0;
  const target = (e.lastMilestoneMcap ?? 0n) * 2n;
  const msPct = target > 0n ? Number((mcap * 100n) / target) : 0;
  return {
    state: "waiting",
    volumeProgressPct: Math.min(100, volPct),
    milestoneProgressPct: Math.min(100, msPct),
  };
}

export async function buildRows(): Promise<CoinRow[]> {
  const c = conn();
  const [escrows, rounds, slot] = await Promise.all([
    fetchEscrows(), fetchRounds(), c.getSlot("confirmed"),
  ]);
  const metas = await fetchMetadata(escrows.map((e) => e.mint));
  // one batched read instead of a round trip per coin
  const curveAddrs = escrows.map((e) => bondingCurve(new PublicKey(e.mint)));
  const curveInfos: (Curve | null)[] = [];
  for (let i = 0; i < curveAddrs.length; i += 100) {
    const infos = await c.getMultipleAccountsInfo(curveAddrs.slice(i, i + 100));
    for (const info of infos) {
      curveInfos.push(info ? decodeCurve(info.data as Buffer) : null);
    }
  }
  const out: CoinRow[] = [];
  for (const [idx, e] of escrows.entries()) {
    const curve = curveInfos[idx] ?? null;
    const mine = rounds.filter((r) => r.escrow === e.address)
      .sort((a, b) => b.index - a.index);
    const last = mine[0];
    out.push({
      escrow: e, meta: metas[e.mint], curve,
      marketCapLamports: curve ? marketCap(curve).toString() : "0",
      poolRemaining: (e.escrowed - e.allocated).toString(),
      escrowPct: e.escrowBps / 100,
      devPct: 100 - e.escrowBps / 100,
      lastDistribution: last
        ? { index: last.index, total: last.total.toString(), holders: last.holderCount,
            claimed: last.claimedCount, claimedAmount: last.claimedAmount.toString() }
        : null,
      capPct: MAX_SHARE_BPS / 100,
      coinType: "regular",
      platformFeePct: 0,
      nextTrigger: nextTrigger(e, curve, slot),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// recent airdrops feed, read straight out of the program's own event logs
// ---------------------------------------------------------------------------

const EVENTS: Record<string, string> = {};
for (const n of ["ShareClaimed", "ManualClaimed", "TriggerFired", "RoundOpened",
                 "BuybackDone", "Launched", "DeadCoinFlagged", "Intervened"]) {
  EVENTS[anchorDisc("event", n).toString("hex")] = n;
}

export interface FeedItem {
  signature: string; slot: number; blockTime: number | null;
  kind: string; escrow?: string; mint?: string; amount?: string; holder?: string;
}

export async function fetchFeed(limit = 30): Promise<FeedItem[]> {
  const c = conn();
  const sigs = await c.getSignaturesForAddress(PROGRAM_ID, { limit: 60 }, "confirmed");
  const mintOf = new Map((await fetchEscrows()).map((e) => [e.address, e.mint]));
  const items: FeedItem[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await c.getTransaction(s.signature, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages ?? [];
    for (const l of logs) {
      if (!l.startsWith("Program data: ")) continue;
      const buf = Buffer.from(l.slice("Program data: ".length), "base64");
      if (buf.length < 8) continue;
      const kind = EVENTS[buf.subarray(0, 8).toString("hex")];
      if (!kind) continue;
      const item: FeedItem = {
        signature: s.signature, slot: s.slot, blockTime: s.blockTime ?? null, kind,
      };
      try {
        item.escrow = new PublicKey(buf.subarray(8, 40)).toBase58();
        item.mint = mintOf.get(item.escrow);
        if (kind === "ShareClaimed") {
          // escrow(32) round(32) holder(32) amount(8) position_value(8)
          item.holder = new PublicKey(buf.subarray(72, 104)).toBase58();
          item.amount = buf.readBigUInt64LE(104).toString();
        } else if (kind === "ManualClaimed") {
          item.holder = new PublicKey(buf.subarray(40, 72)).toBase58();
          item.amount = buf.readBigUInt64LE(76).toString();
        } else if (kind === "TriggerFired") {
          item.amount = buf.readBigUInt64LE(41).toString();
        } else if (kind === "BuybackDone") {
          item.amount = buf.readBigUInt64LE(48).toString();
        }
      } catch { /* partial decode is fine for the feed */ }
      items.push(item);
      if (items.length >= limit) return items;
    }
  }
  return items;
}
