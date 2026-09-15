import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  conn, PROGRAM_ID, anchorDisc, decodeEscrow, decodeRound, decodeCurve,
  bondingCurve, ata, marketCap, short, Escrow, Round, Curve, Config, decodeConfig, MAX_SHARE_BPS, CAP_MIN_HOLDERS,
  MIN_LOCK_SUPPLY_BPS, modeOf,
} from "./chain";

/**
 * Short-lived in-process memo so a page and its API route do not each pay for
 * the same getProgramAccounts scan; chain state on this site only changes on
 * the order of minutes.
 */
const memos = new Map<string, { at: number; p: Promise<any> }>();
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p;
  const p = fn().catch((e) => { memos.delete(key); throw e; });
  memos.set(key, { at: Date.now(), p });
  return p;
}
const TTL = 15_000;

/** `Promise.all` with at most `n` calls in flight. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** The program config (platform authority, platform fee); null before `set_platform`. */
export function fetchConfig(): Promise<Config | null> {
  return memo("config", TTL, async () => {
    const addr = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
    const info = await conn().getAccountInfo(addr);
    return info ? decodeConfig(info.data as Buffer) : null;
  });
}

/** Launch time, recovered from the manual-list unlock (launch + 30 days); older layouts have none. */
export function launchedAt(e: Escrow): Date | null {
  if (e.generation < 4 || !e.manualUnlockTs) return null;
  return new Date((Number(e.manualUnlockTs) - 30 * 24 * 60 * 60) * 1000);
}

/** Rounds written by earlier program generations decode to nonsense; keep only self-consistent ones. */
export const saneRound = (r: Round) =>
  r.holderCount <= 1_000_000 && r.claimedCount <= r.holderCount && r.total <= r.released && r.snapshotSlot <= r.commitSlot;

/** Name and symbol from the mint's Token-2022 metadata extension (pump writes it at create). */
export interface CoinMeta { name: string; symbol: string }

export async function fetchMetadata(mints: string[]): Promise<Record<string, CoinMeta>> {
  return memo(`meta:${mints.join(",")}`, 10 * 60_000, () => fetchMetadataRaw(mints));
}
async function fetchMetadataRaw(mints: string[]): Promise<Record<string, CoinMeta>> {
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
  escrowPct: number;          // holder-pool slice of the launch buy
  manualPct: number;          // fixed-list slice of the launch buy (generation ≥ 5: of the buy; older coins: of the dev share)
  lockedPct: number;          // the two together
  /** locked tokens as a share of total supply (what the launch form promises); null without a curve */
  lockedSupplyPct: number | null;
  devPct: number;             // what stayed with the dev
  /** platform constant: the lock must be at least this share of total supply */
  minLockSupplyPct: number;
  lastDistribution: { index: number; total: string; holders: number; claimed: number; claimedAmount: string } | null;
  /** per-wallet cap on one round, percent; applies from `capMinHolders` eligible holders on */
  capPct: number;
  capMinHolders: number;
  /** from the escrow account: a pump holder-rewards coin keeps its creator fee on pump */
  coinType: "regular" | "holder-rewards";
  /** this coin's platform cut of the creator fee, as written into its pump sharing config (null: not set up yet) */
  platformFeePct: number | null;
  nextTrigger: NextTrigger | null;
  /** ISO launch time, when the escrow layout records one */
  launchedAt: string | null;
  /** total rounds opened so far */
  rounds: number;
  /** Auto / Manual distribution mode; "unknown" for escrows from earlier layouts */
  mode: "auto" | "manual" | "unknown";
}

export interface NextTrigger {
  state: "armed" | "waiting" | "unknown";
  kind?: "volume" | "milestone";
  slotsLeft?: number;
  volumeProgressPct?: number;   // toward 1% of market cap
  milestoneProgressPct?: number; // toward 2x the last milestone
  /** market cap the next milestone fires at (2x the last one), lamports as string */
  milestoneTarget?: string;
  /** trading volume since the last distribution and what the volume trigger needs, lamports as strings */
  volumeSince?: string; volumeNeeded?: string;
}

const ESCROW_DISC = anchorDisc("account", "Escrow");
const ROUND_DISC = anchorDisc("account", "Round");
// a discriminator is 8 bytes, so it cannot go through PublicKey (32 bytes)
const toB58 = (b: Buffer) => bs58.encode(b);

export function fetchEscrows(): Promise<Escrow[]> {
  return memo("escrows", TTL, async () => {
    const accs = await conn().getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: toB58(ESCROW_DISC) } }],
    });
    return accs
      .map((a) => decodeEscrow(a.pubkey.toBase58(), a.account.data as Buffer))
      // only coins that actually launched; newest first, older layouts (no launch time) last
      .filter((e) => e.bought > 0n)
      .sort((a, b) => {
        const ta = launchedAt(a)?.getTime() ?? 0, tb = launchedAt(b)?.getTime() ?? 0;
        return tb - ta || Number(b.escrowed - a.escrowed);
      });
  });
}

export async function fetchRounds(escrowAddr?: string): Promise<Round[]> {
  const rounds = await memo("rounds", TTL, async () => {
    const accs = await conn().getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: toB58(ROUND_DISC) } }],
    });
    return accs.map((a) => decodeRound(a.pubkey.toBase58(), a.account.data as Buffer)).filter(saneRound);
  });
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
    milestoneTarget: target.toString(), volumeSince: since.toString(), volumeNeeded: needed.toString(),
  };
}

/** The manual slice as a percent of the launch buy. Before generation 5 it was a percent of the dev's remainder. */
export function manualPctOf(e: Escrow): number {
  const bps = e.manualBps ?? 0;
  if (!bps) return 0;
  return e.generation >= 5 ? bps / 100 : ((100 - e.escrowBps / 100) * bps) / 10000;
}

export function buildRows(): Promise<CoinRow[]> {
  return memo("rows", TTL, buildRowsRaw);
}
async function buildRowsRaw(): Promise<CoinRow[]> {
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
      manualPct: manualPctOf(e),
      lockedPct: e.escrowBps / 100 + manualPctOf(e),
      lockedSupplyPct: curve && curve.tokenTotalSupply > 0n
        ? Number(((e.escrowed + (e.manualTotal ?? 0n)) * 10_000n) / curve.tokenTotalSupply) / 100 : null,
      devPct: 100 - e.escrowBps / 100 - manualPctOf(e),
      minLockSupplyPct: MIN_LOCK_SUPPLY_BPS / 100,
      lastDistribution: last
        ? { index: last.index, total: last.total.toString(), holders: last.holderCount,
            claimed: last.claimedCount, claimedAmount: last.claimedAmount.toString() }
        : null,
      capPct: MAX_SHARE_BPS / 100,
      capMinHolders: CAP_MIN_HOLDERS,
      coinType: e.isHolderReward ? "holder-rewards" : "regular",
      platformFeePct: e.isHolderReward ? 0 : e.feeSharingSet ? (e.platformFeeBps ?? 0) / 100 : null,
      nextTrigger: nextTrigger(e, curve, slot),
      launchedAt: launchedAt(e)?.toISOString() ?? null,
      rounds: mine.length,
      mode: modeOf(e),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// recent airdrops feed, read straight out of the program's own event logs
// ---------------------------------------------------------------------------

const EVENTS: Record<string, string> = {};
for (const n of ["ShareClaimed", "ManualClaimed", "TriggerFired", "RoundOpened",
                 "BuybackDone", "Launched", "DeadCoinFlagged", "Intervened", "DevDistributionTriggered"]) {
  EVENTS[anchorDisc("event", n).toString("hex")] = n;
}

export interface FeedItem {
  signature: string; slot: number; blockTime: number | null;
  kind: string; escrow?: string; mint?: string; amount?: string; holder?: string;
}

export function fetchFeed(limit = 30): Promise<FeedItem[]> {
  return memo(`feed:${limit}`, TTL, () => fetchFeedRaw(limit));
}
async function fetchFeedRaw(limit: number): Promise<FeedItem[]> {
  const c = conn();
  const [sigs, escrows] = await Promise.all([
    c.getSignaturesForAddress(PROGRAM_ID, { limit: 60 }, "confirmed"), fetchEscrows(),
  ]);
  const mintOf = new Map(escrows.map((e) => [e.address, e.mint]));
  const ok = sigs.filter((s) => !s.err);
  // a few reads in flight at once (JSON-RPC batches need a paid RPC plan)
  const txs = await mapLimit(ok, 6, (s) =>
    c.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }));
  const items: FeedItem[] = [];
  for (const [n, s] of ok.entries()) {
    const logs = txs[n]?.meta?.logMessages ?? [];
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
        } else if (kind === "DevDistributionTriggered") {
          // escrow(32) dev(32) amount(8) round_id(4) pending(8)
          item.holder = new PublicKey(buf.subarray(40, 72)).toBase58();
          item.amount = buf.readBigUInt64LE(72).toString();
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
