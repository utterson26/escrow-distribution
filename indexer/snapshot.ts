/**
 * airdrop_escrow holder snapshot — deterministic, reproducible by anyone.
 *
 * The output is a pure function of (mint, snapshotSlot) plus permanently
 * available chain history. Balances and holding times are reconstructed by
 * replaying each token account's own transaction history, never from a
 * point-in-time account read, so the same inputs always give the same root.
 *
 *   snapshot  --mint <pubkey> [--slot <n>] --out snap.json
 *   verify    --in snap.json                 # recompute the root from the leaves
 *   reproduce --in snap.json                 # refetch from chain, compare
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";

export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const MAYHEM = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
export const ESCROW_PROGRAM = new PublicKey("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
/** Minimum position value, in lamports, priced off the bonding curve. */
export const MIN_POSITION_LAMPORTS = 50_000_000n; // 0.05 SOL — must match the program

export interface Leaf {
  index: number;
  holder: string;
  tokenAccount: string;
  balance: string;
  heldSinceSlot: number;
  heldSlots: number;
  weight: string;
  cumStart: string;
}
export interface Snapshot {
  mint: string;
  snapshotSlot: number;
  /** Owners deliberately left out (protocol/treasury), recorded so the run reproduces. */
  excluded: string[];
  price: { virtualQuoteReserves: string; virtualTokenReserves: string };
  minPositionLamports: string;
  totalWeight: string;
  root: string;
  leaves: Leaf[];
}

const sha256 = (...parts: Buffer[]) =>
  createHash("sha256").update(Buffer.concat(parts)).digest();
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u128 = (n: bigint) => {
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(n & 0xffffffffffffffffn, 0);
  b.writeBigUInt64LE(n >> 64n, 8);
  return b;
};

/** Leaf hash — byte-for-byte identical to the program's. */
export const leafHash = (l: Leaf) =>
  sha256(Buffer.from("leaf"), u32(l.index), new PublicKey(l.holder).toBuffer(),
         u64(BigInt(l.weight)), u128(BigInt(l.cumStart)));

/** Sorted-pair Merkle tree; a lone node on a level is promoted unchanged. */
export function buildTree(leaves: Leaf[]): { root: Buffer; layers: Buffer[][] } {
  if (leaves.length === 0) return { root: Buffer.alloc(32), layers: [] };
  let level: Buffer[] = leaves.map(leafHash);
  const layers: Buffer[][] = [level];
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) { next.push(level[i]); continue; }
      const [a, b] = [level[i], level[i + 1]];
      next.push(Buffer.compare(a, b) <= 0
        ? sha256(Buffer.from("node"), a, b)
        : sha256(Buffer.from("node"), b, a));
    }
    level = next;
    layers.push(level);
  }
  return { root: level[0], layers };
}

export function proofFor(layers: Buffer[][], index: number): Buffer[] {
  const proof: Buffer[] = [];
  let idx = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const level = layers[l];
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sib < level.length) proof.push(level[sib]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

function readCurve(data: Buffer) {
  return {
    virtualTokenReserves: data.readBigUInt64LE(8),
    virtualQuoteReserves: data.readBigUInt64LE(16),
  };
}

/**
 * Replay a token account's history and return its balance at `snapshotSlot`
 * plus the slot at which the current uninterrupted holding streak began.
 * A balance that ever touches zero restarts the streak — selling out resets you.
 */
async function historyFor(c: Connection, acct: PublicKey, snapshotSlot: number) {
  const sigs = await c.getSignaturesForAddress(acct, { limit: 1000 }, "confirmed");
  const ordered = sigs
    .filter((s) => s.slot <= snapshotSlot && !s.err)
    .sort((a, b) => a.slot - b.slot || a.signature.localeCompare(b.signature));

  let balance = 0n;
  let streakStart = 0;
  for (const s of ordered) {
    const tx = await c.getTransaction(s.signature, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta) continue;
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta.loadedAddresses,
    });
    const post = (tx.meta.postTokenBalances ?? []).find(
      (b) => keys.get(b.accountIndex)?.equals(acct));
    if (!post) continue;
    const after = BigInt(post.uiTokenAmount.amount);
    if (balance === 0n && after > 0n) streakStart = s.slot; // streak begins
    balance = after;
    if (balance === 0n) streakStart = 0;                     // sold out, reset
  }
  return { balance, streakStart };
}

/**
 * Accounts that hold the coin but are not holders: the curve itself, the mayhem
 * vault, and this program's own escrow and buyer PDAs. All derived from the mint,
 * so every reproducer computes the same set.
 */
export function protocolOwners(mint: PublicKey, escrowProgram: PublicKey): string[] {
  const pda = (seeds: Buffer[], prog: PublicKey) =>
    PublicKey.findProgramAddressSync(seeds, prog)[0].toBase58();
  return [
    pda([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP),
    pda([Buffer.from("sol-vault")], MAYHEM),
    pda([Buffer.from("escrow"), mint.toBuffer()], escrowProgram),
    pda([Buffer.from("buyer"), mint.toBuffer()], escrowProgram),
  ];
}

export async function snapshot(
  rpc: string, mintStr: string, slotArg?: number,
  escrowProgram = ESCROW_PROGRAM, extraExcluded: string[] = [],
): Promise<Snapshot> {
  const c = new Connection(rpc, "confirmed");
  const mint = new PublicKey(mintStr);
  const snapshotSlot = slotArg ?? (await c.getSlot("confirmed"));

  const curveAddr = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()], PUMP)[0];
  const curveAcc = await c.getAccountInfo(curveAddr, "confirmed");
  if (!curveAcc) throw new Error("bonding curve not found for mint");
  const curve = readCurve(curveAcc.data);

  const accounts = await c.getProgramAccounts(TOKEN_2022, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });

  const excluded = [...new Set([...protocolOwners(mint, escrowProgram), ...extraExcluded])].sort();
  const skip = new Set(excluded);

  type Row = { holder: string; tokenAccount: string; balance: bigint; streak: number };
  const rows: Row[] = [];
  for (const a of accounts) {
    const owner = new PublicKey(a.account.data.subarray(32, 64)).toBase58();
    if (skip.has(owner)) continue;                             // protocol account
    const { balance, streakStart } = await historyFor(c, a.pubkey, snapshotSlot);
    if (balance === 0n || streakStart === 0) continue;         // sold out entirely
    const value = (balance * curve.virtualQuoteReserves) / curve.virtualTokenReserves;
    if (value < MIN_POSITION_LAMPORTS) continue;               // under the minimum
    rows.push({ holder: owner, tokenAccount: a.pubkey.toBase58(), balance, streak: streakStart });
  }

  // Deterministic order: by holder, then token account. No reliance on RPC order.
  rows.sort((x, y) => x.holder.localeCompare(y.holder) || x.tokenAccount.localeCompare(y.tokenAccount));

  const leaves: Leaf[] = [];
  let cum = 0n;
  for (const [i, r] of rows.entries()) {
    const heldSlots = BigInt(Math.max(0, snapshotSlot - r.streak));
    let weight = r.balance * heldSlots;
    // the program carries weight as u64; clamp rather than wrap
    const U64_MAX = (1n << 64n) - 1n;
    if (weight > U64_MAX) weight = U64_MAX;
    if (weight === 0n) continue;
    leaves.push({
      index: leaves.length, holder: r.holder, tokenAccount: r.tokenAccount,
      balance: r.balance.toString(), heldSinceSlot: r.streak,
      heldSlots: Number(heldSlots), weight: weight.toString(), cumStart: cum.toString(),
    });
    cum += weight;
  }
  // indices must be final before hashing
  leaves.forEach((l, i) => (l.index = i));

  const { root } = buildTree(leaves);
  return {
    mint: mint.toBase58(), snapshotSlot, excluded,
    price: {
      virtualQuoteReserves: curve.virtualQuoteReserves.toString(),
      virtualTokenReserves: curve.virtualTokenReserves.toString(),
    },
    minPositionLamports: MIN_POSITION_LAMPORTS.toString(),
    totalWeight: cum.toString(), root: root.toString("hex"), leaves,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const get = (f: string) => { const i = args.indexOf(f); return i < 0 ? undefined : args[i + 1]; };
  const rpc = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  (async () => {
    if (cmd === "snapshot") {
      const extra = (get("--exclude") ?? "").split(",").filter(Boolean);
      const snap = await snapshot(rpc, get("--mint")!, get("--slot") ? Number(get("--slot")) : undefined,
                                  ESCROW_PROGRAM, extra);
      const out = get("--out") ?? "snapshot.json";
      fs.writeFileSync(out, JSON.stringify(snap, null, 2));
      console.log(`root        : ${snap.root}`);
      console.log(`slot        : ${snap.snapshotSlot}`);
      console.log(`holders     : ${snap.leaves.length}`);
      console.log(`excluded    : ${snap.excluded.length} adres (protokol/hazine)`);
      console.log(`totalWeight : ${snap.totalWeight}`);
      console.log(`yazildi     : ${out}`);
    } else if (cmd === "verify") {
      const snap: Snapshot = JSON.parse(fs.readFileSync(get("--in")!, "utf8"));
      const { root } = buildTree(snap.leaves);
      const sum = snap.leaves.reduce((a, l) => a + BigInt(l.weight), 0n);
      const okRoot = root.toString("hex") === snap.root;
      const okSum = sum.toString() === snap.totalWeight;
      let okCum = true, cum = 0n;
      for (const l of snap.leaves) { if (l.cumStart !== cum.toString()) okCum = false; cum += BigInt(l.weight); }
      console.log(`kok eslesti      : ${okRoot}`);
      console.log(`toplam agirlik   : ${okSum}`);
      console.log(`kumulatif zincir : ${okCum}`);
      process.exit(okRoot && okSum && okCum ? 0 : 1);
    } else if (cmd === "reproduce") {
      const snap: Snapshot = JSON.parse(fs.readFileSync(get("--in")!, "utf8"));
      const again = await snapshot(rpc, snap.mint, snap.snapshotSlot, ESCROW_PROGRAM, snap.excluded);
      const same = again.root === snap.root;
      console.log(`dosyadaki kok : ${snap.root}`);
      console.log(`yeniden uretim: ${again.root}`);
      console.log(same ? "AYNI ✅" : "FARKLI ❌");
      process.exit(same ? 0 : 1);
    } else {
      console.log("kullanim: snapshot --mint <pubkey> [--slot n] --out f.json | verify --in f.json | reproduce --in f.json");
      process.exit(2);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
