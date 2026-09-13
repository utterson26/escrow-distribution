/**
 * airdrop_escrow holder snapshot — deterministic, reproducible by anyone.
 *
 * The output is a pure function of (mint, snapshotSlot) plus permanently
 * available chain history. Balances and holding times are reconstructed by
 * replaying each token account's own transaction history, never from a
 * point-in-time account read, so the same inputs always give the same root.
 *
 *   snapshot  --mint <pubkey> [--slot <n>] --released <tokens> --out snap.json
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
  /** balance × heldSlots — the pro-rata key */
  weight: string;
  /** tokens this holder gets in the round; what the leaf hash commits to */
  amount: string;
}
export interface Snapshot {
  mint: string;
  snapshotSlot: number;
  /** Owners deliberately left out (protocol/treasury), recorded so the run reproduces. */
  excluded: string[];
  price: { virtualQuoteReserves: string; virtualTokenReserves: string };
  minPositionLamports: string;
  totalWeight: string;
  /** what the allocator was given (a trigger's release) */
  released: string;
  /** per-wallet cap, in bps of `released` */
  capBps: number;
  /** sum of every leaf amount; ≤ released when the cap leaves a remainder */
  total: string;
  root: string;
  leaves: Leaf[];
}

/** Most of one round a single wallet may receive — must match the program. */
export const MAX_SHARE_BPS = 1000n;

/**
 * Pro-rata split of `released` over `weights`, no wallet above the cap.
 * Whatever the cap holds back is re-split over the uncapped wallets, again
 * and again until nobody is over; if everyone ends up capped the remainder
 * is simply not handed out (it stays pending on chain). Integer arithmetic,
 * deterministic order, so every reproducer gets the same amounts.
 */
export function allocate(weights: bigint[], released: bigint): bigint[] {
  const n = weights.length;
  const amounts: bigint[] = new Array(n).fill(0n);
  if (n === 0 || released === 0n) return amounts;
  const cap = (released * MAX_SHARE_BPS) / 10000n;
  const capped: boolean[] = new Array(n).fill(false);
  let remaining = released;
  for (let iter = 0; iter <= n; iter++) {
    const open = [...weights.keys()].filter((i) => !capped[i] && weights[i] > 0n);
    if (open.length === 0) break;
    const W = open.reduce((a, i) => a + weights[i], 0n);
    const over = open.filter((i) => (remaining * weights[i]) / W > cap);
    if (over.length > 0) {
      for (const i of over) { capped[i] = true; amounts[i] = cap; remaining -= cap; }
      continue;
    }
    let handed = 0n;
    for (const i of open) { amounts[i] = (remaining * weights[i]) / W; handed += amounts[i]; }
    // rounding dust goes to the heaviest uncapped wallet, cap permitting
    const dust = remaining - handed;
    if (dust > 0n) {
      const top = open.reduce((b, i) => (weights[i] > weights[b] ? i : b), open[0]);
      if (amounts[top] + dust <= cap) amounts[top] += dust;
    }
    break;
  }
  return amounts;
}

const sha256 = (...parts: Buffer[]) =>
  createHash("sha256").update(Buffer.concat(parts)).digest();
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };

/** Leaf hash — byte-for-byte identical to the program's. The snapshot balance
 *  is part of the leaf so a claim can prove what the holder had at the time;
 *  the amount is what the round owes them. */
export const leafHash = (l: Leaf) =>
  sha256(Buffer.from("leaf"), u32(l.index), new PublicKey(l.holder).toBuffer(),
         u64(BigInt(l.balance)), u64(BigInt(l.amount)));

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
 * so every reproducer computes the same set. The dev wallet is excluded too
 * (see PROGRESS.md, "dev cüzdanı airdrop'a katılmaz"); it is read from the
 * escrow account by `snapshot`, since it is not derivable from the mint.
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

/**
 * Holder snapshot at `slotArg` plus the allocation of `released` tokens over
 * it. `released` is part of the input on purpose: the root commits to amounts,
 * so reproducing a round means re-running with the same slot and the same
 * release (both are recorded on the Round account).
 */
export async function snapshot(
  rpc: string, mintStr: string, slotArg?: number,
  escrowProgram = ESCROW_PROGRAM, extraExcluded: string[] = [],
  released: bigint = 0n,
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

  // the dev is the first field of the escrow account, right after the discriminator
  const escrowAddr = PublicKey.findProgramAddressSync([Buffer.from("escrow"), mint.toBuffer()], escrowProgram)[0];
  const escrowAcc = await c.getAccountInfo(escrowAddr, "confirmed");
  const devWallet = escrowAcc ? [new PublicKey(escrowAcc.data.subarray(8, 40)).toBase58()] : [];

  const excluded = [...new Set([...protocolOwners(mint, escrowProgram), ...devWallet, ...extraExcluded])].sort();
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
  let totalWeight = 0n;
  for (const r of rows) {
    const heldSlots = BigInt(Math.max(0, snapshotSlot - r.streak));
    const weight = r.balance * heldSlots;
    if (weight === 0n) continue;
    leaves.push({
      index: leaves.length, holder: r.holder, tokenAccount: r.tokenAccount,
      balance: r.balance.toString(), heldSinceSlot: r.streak,
      heldSlots: Number(heldSlots), weight: weight.toString(), amount: "0",
    });
    totalWeight += weight;
  }
  const amounts = allocate(leaves.map((l) => BigInt(l.weight)), released);
  leaves.forEach((l, i) => { l.index = i; l.amount = amounts[i].toString(); });
  const total = amounts.reduce((a, b) => a + b, 0n);

  const { root } = buildTree(leaves);
  return {
    mint: mint.toBase58(), snapshotSlot, excluded,
    price: {
      virtualQuoteReserves: curve.virtualQuoteReserves.toString(),
      virtualTokenReserves: curve.virtualTokenReserves.toString(),
    },
    minPositionLamports: MIN_POSITION_LAMPORTS.toString(),
    totalWeight: totalWeight.toString(),
    released: released.toString(), capBps: Number(MAX_SHARE_BPS), total: total.toString(),
    root: root.toString("hex"), leaves,
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
                                  ESCROW_PROGRAM, extra, BigInt(get("--released") ?? "0"));
      const out = get("--out") ?? "snapshot.json";
      fs.writeFileSync(out, JSON.stringify(snap, null, 2));
      console.log(`root        : ${snap.root}`);
      console.log(`slot        : ${snap.snapshotSlot}`);
      console.log(`holders     : ${snap.leaves.length}`);
      console.log(`excluded    : ${snap.excluded.length} adres (protokol/hazine)`);
      console.log(`totalWeight : ${snap.totalWeight}`);
      console.log(`released    : ${snap.released} → dagitilan ${snap.total} (tavan %${snap.capBps / 100})`);
      console.log(`yazildi     : ${out}`);
    } else if (cmd === "verify") {
      const snap: Snapshot = JSON.parse(fs.readFileSync(get("--in")!, "utf8"));
      const { root } = buildTree(snap.leaves);
      const sum = snap.leaves.reduce((a, l) => a + BigInt(l.weight), 0n);
      const okRoot = root.toString("hex") === snap.root;
      const okSum = sum.toString() === snap.totalWeight;
      const again = allocate(snap.leaves.map((l) => BigInt(l.weight)), BigInt(snap.released));
      const okAlloc = snap.leaves.every((l, i) => l.amount === again[i].toString());
      const cap = (BigInt(snap.released) * BigInt(snap.capBps)) / 10000n;
      const okCap = snap.leaves.every((l) => BigInt(l.amount) <= cap);
      console.log(`kok eslesti      : ${okRoot}`);
      console.log(`toplam agirlik   : ${okSum}`);
      console.log(`paylar yeniden   : ${okAlloc}`);
      console.log(`tavan asilmadi   : ${okCap}`);
      process.exit(okRoot && okSum && okAlloc && okCap ? 0 : 1);
    } else if (cmd === "reproduce") {
      const snap: Snapshot = JSON.parse(fs.readFileSync(get("--in")!, "utf8"));
      const again = await snapshot(rpc, snap.mint, snap.snapshotSlot, ESCROW_PROGRAM, snap.excluded, BigInt(snap.released));
      const same = again.root === snap.root;
      console.log(`dosyadaki kok : ${snap.root}`);
      console.log(`yeniden uretim: ${again.root}`);
      console.log(same ? "AYNI ✅" : "FARKLI ❌");
      process.exit(same ? 0 : 1);
    } else {
      console.log("kullanim: snapshot --mint <pubkey> [--slot n] --released <n> --out f.json | verify --in f.json | reproduce --in f.json");
      process.exit(2);
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
