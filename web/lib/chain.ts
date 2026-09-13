import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

export const PROGRAM_ID = new PublicKey("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
export const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const DECIMALS = 6;

export const rpcUrl = () =>
  process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
export const conn = () => new Connection(rpcUrl(), "confirmed");

/** Which cluster the server reads from, judged by the RPC URL. */
export function network() {
  const url = rpcUrl();
  const local = /localhost|127\.0\.0\.1/.test(url);
  const name = local ? "localnet" : /mainnet/.test(url) ? "mainnet" : "devnet";
  // explorer.solana.com can point at a local validator through a custom cluster URL
  const cluster = local
    ? `cluster=custom&customUrl=${encodeURIComponent(url)}`
    : `cluster=${name}`;
  return {
    name,
    explorerAddress: (a: string) => `https://explorer.solana.com/address/${a}?${cluster}`,
    explorerTx: (s: string) => `https://explorer.solana.com/tx/${s}?${cluster}`,
  };
}

export const anchorDisc = (kind: "account" | "global" | "event", name: string) =>
  createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);

const b58 = (b: Buffer) => new PublicKey(b).toBase58();

/**
 * Escrow accounts on devnet come from three generations of the program as it
 * grew, so the layout is read field by field and simply stops when the buffer
 * runs out. Missing fields come back undefined rather than as wrong numbers.
 */
export interface Escrow {
  address: string; dev: string; mint: string; escrowBps: number;
  bought: bigint; escrowed: bigint; allocated: bigint; claimed: bigint;
  holderCount: number; feesCollected: bigint;
  buybackSpent?: bigint; buybackTokens?: bigint;
  cumVolume?: bigint; lastQuoteReserves?: bigint; volumeAtLastDist?: bigint;
  lastMilestoneMcap?: bigint; maxDelaySlots?: bigint;
  armed?: boolean; armedKind?: number; fireSlot?: bigint;
  authorized?: bigint; pending?: bigint;
  manualRoot?: string; manualBps?: number; manualTotal?: bigint;
  manualClaimedBps?: number; manualUnlockTs?: bigint; manualLocked?: boolean;
  platform?: string; dead?: boolean; lowVolumeDays?: number;
  /** generation 5: pump holder-rewards coin (no fee sweep / buyback), fee sharing state */
  isHolderReward?: boolean; feeSharingSet?: boolean; platformFeeBps?: number;
  generation: number;
}

/** Program-wide config: platform authority and the platform's cut of the creator fee. */
export interface Config {
  platform: string; platformFeeBps: number; platformFeeWallet: string;
  pendingFeeBps: number; feeEffectiveSlot: bigint;
  feeDelaySlots?: bigint;
  /** beta brake: most value one launch may lock, at the launch price (0 = the 50 SOL default) */
  maxLockedValueLamports?: bigint; pendingLockCapLamports?: bigint; lockCapEffectiveSlot?: bigint;
  /** launches paused (claims, triggers and rounds never pause) */
  paused?: boolean;
  /** beta: only these keys may open rounds */
  publishers?: string[];
  minPositionLamports?: bigint; pendingMinPositionLamports?: bigint; minPositionEffectiveSlot?: bigint;
}
export const DEFAULT_MAX_LOCKED_VALUE_LAMPORTS = 50_000_000_000n;
export function decodeConfig(data: Buffer): Config {
  const r = new R(data);
  const platform = r.key(); r.u8(); // bump
  const c: Config = {
    platform, platformFeeBps: r.u16(), platformFeeWallet: r.key(),
    pendingFeeBps: r.u16(), feeEffectiveSlot: r.u64(),
  };
  if (r.left() >= 8) c.feeDelaySlots = r.u64();
  if (r.left() >= 8 + 8 + 8 + 1) {
    c.maxLockedValueLamports = r.u64() || DEFAULT_MAX_LOCKED_VALUE_LAMPORTS;
    c.pendingLockCapLamports = r.u64(); c.lockCapEffectiveSlot = r.u64(); c.paused = r.bool();
  }
  if (r.left() >= 4 * 32 + 8 + 8 + 8) {
    c.publishers = [r.key(), r.key(), r.key(), r.key()].filter((k) => k !== "11111111111111111111111111111111");
    c.minPositionLamports = r.u64() || DEFAULT_MIN_POSITION_LAMPORTS;
    c.pendingMinPositionLamports = r.u64(); c.minPositionEffectiveSlot = r.u64();
  }
  return c;
}

class R {
  o = 8;
  constructor(private b: Buffer) {}
  left() { return this.b.length - this.o; }
  u8() { return this.b.readUInt8(this.o++); }
  bool() { return this.u8() === 1; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  u128() {
    const lo = this.b.readBigUInt64LE(this.o), hi = this.b.readBigUInt64LE(this.o + 8);
    this.o += 16; return (hi << 64n) | lo;
  }
  key() { const v = b58(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  bytes(n: number) { const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }
}

export function decodeEscrow(address: string, data: Buffer): Escrow {
  const r = new R(data);
  const e: Escrow = {
    address, dev: r.key(), mint: r.key(), escrowBps: r.u16(),
    bought: r.u64(), escrowed: r.u64(), allocated: r.u64(), claimed: r.u64(),
    holderCount: r.u32(), feesCollected: r.u64(), generation: 1,
  };
  // `bump` is the last field of every generation, so what is left over tells us
  // which optional blocks follow. It is never read: nothing on the page needs it.
  if (r.left() >= 16 + 1) {
    e.buybackSpent = r.u64(); e.buybackTokens = r.u64(); e.generation = 2;
  }
  if (r.left() >= 82 + 1) {
    e.cumVolume = r.u128(); e.lastQuoteReserves = r.u64();
    e.volumeAtLastDist = r.u128(); e.lastMilestoneMcap = r.u64();
    e.maxDelaySlots = r.u64(); e.armed = r.bool(); e.armedKind = r.u8();
    e.fireSlot = r.u64(); e.authorized = r.u64(); e.pending = r.u64();
    e.generation = 3;
  }
  if (r.left() >= 129 + 1) {
    e.manualRoot = r.bytes(32).toString("hex");
    e.manualBps = r.u16(); e.manualTotal = r.u64();
    e.manualClaimedBps = r.u16(); r.bytes(8);      // claim bitmap
    e.manualUnlockTs = r.i64(); e.manualLocked = r.bool(); r.u16(); // published count
    e.platform = r.key(); r.i64(); r.u128();       // day start ts / volume
    e.lowVolumeDays = r.u8(); e.dead = r.bool();
    e.generation = 4;
  }
  // day_seconds, last_buyback_slot, bump, then the generation-5 block
  if (r.left() >= 8 + 8 + 1 + 4) {
    r.i64(); r.u64(); r.u8();
    e.isHolderReward = r.bool(); e.feeSharingSet = r.bool(); e.platformFeeBps = r.u16();
    e.generation = 5;
  }
  return e;
}

export interface Round {
  address: string; escrow: string; index: number; root: string;
  /** what the allocator was given; with snapshotSlot, all a reproducer needs */
  released: bigint;
  /** sum of leaf amounts (≤ released: the 10% per-wallet cap can leave a remainder) */
  total: bigint;
  holderCount: number;
  claimedAmount: bigint; claimedCount: number;
  commitSlot: bigint; snapshotSlot: bigint;
  /** eligibility floor the round was built with (older rounds: the 0.1 SOL default) */
  minPositionLamports: bigint;
}
export const DEFAULT_MIN_POSITION_LAMPORTS = 100_000_000n;
export function decodeRound(address: string, data: Buffer): Round {
  const r = new R(data);
  const round: Round = {
    address, escrow: r.key(), index: r.u32(), root: r.bytes(32).toString("hex"),
    released: r.u64(), total: r.u64(), holderCount: r.u32(),
    claimedAmount: r.u64(), claimedCount: r.u32(),
    commitSlot: r.u64(), snapshotSlot: r.u64(), minPositionLamports: DEFAULT_MIN_POSITION_LAMPORTS,
  };
  r.u8(); // bump
  if (r.left() >= 8) round.minPositionLamports = r.u64() || DEFAULT_MIN_POSITION_LAMPORTS;
  return round;
}
/** Most of one round a single wallet may receive (program constant MAX_SHARE_BPS)... */
export const MAX_SHARE_BPS = 1000;
/** ...once a round has this many eligible holders (program constant CAP_MIN_HOLDERS). */
export const CAP_MIN_HOLDERS = 11;
/** A launch must lock at least this share of total supply (program constant MIN_LOCK_SUPPLY_BPS). */
export const MIN_LOCK_SUPPLY_BPS = 100;

export const pda = (seeds: (Buffer | Uint8Array)[], prog = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(seeds, prog)[0];
export const bondingCurve = (mint: PublicKey) =>
  pda([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP);
export const ata = (owner: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

export interface Curve {
  virtualTokenReserves: bigint; virtualQuoteReserves: bigint;
  realTokenReserves: bigint; tokenTotalSupply: bigint; complete: boolean;
}
export function decodeCurve(data: Buffer): Curve {
  return {
    virtualTokenReserves: data.readBigUInt64LE(8),
    virtualQuoteReserves: data.readBigUInt64LE(16),
    realTokenReserves: data.readBigUInt64LE(24),
    tokenTotalSupply: data.readBigUInt64LE(40),
    complete: data.readUInt8(48) === 1,
  };
}
/** Market cap in lamports, priced off the curve. */
export const marketCap = (c: Curve) =>
  (c.tokenTotalSupply * c.virtualQuoteReserves) / c.virtualTokenReserves;

export const fmtTokens = (v: bigint) =>
  (Number(v) / 10 ** DECIMALS).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtSol = (v: bigint) =>
  (Number(v) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 });
export const short = (s: string, n = 4) => `${s.slice(0, n)}…${s.slice(-n)}`;
