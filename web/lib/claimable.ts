import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { snapshot, buildTree, proofFor, Snapshot } from "../../indexer/snapshot";
import { conn, rpcUrl, PROGRAM_ID } from "./chain";
import { fetchRounds } from "./data";
import { Round } from "./chain";

const CACHE = path.join(process.cwd(), ".cache");

/** Reproduce the allocation a round was built from, pinned to its slot and release. */
async function snapshotForRound(mint: string, r: Round): Promise<Snapshot | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${mint}-${r.index}-${r.root.slice(0, 8)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    const snap = await snapshot(rpcUrl(), mint, Number(r.snapshotSlot), PROGRAM_ID, [], r.released, r.minPositionLamports);
    if (buildTree(snap.leaves).root.toString("hex") === r.root) {
      fs.writeFileSync(file, JSON.stringify(snap));
      return snap;
    }
  } catch { /* fall through */ }
  return null;
}

export interface Claimable {
  roundIndex: number; leafIndex: number;
  balance: string; amount: string; proof: string[];
  /** this wallet's share of the round, in percent */
  sharePct: number;
}
export interface ClaimReport {
  rounds: number;
  reproducible: number;
  claimable: Claimable[];
  /** rounds this wallet already claimed */
  claimed: number[];
  /** rounds whose allocation could not be reproduced from chain history */
  opaque: number[];
}

const receiptPda = (round: string, wallet: string) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), new PublicKey(round).toBuffer(), new PublicKey(wallet).toBuffer()], PROGRAM_ID)[0];

export async function claimableFor(mint: string, escrowAddr: string, wallet: string): Promise<ClaimReport> {
  const rounds = await fetchRounds(escrowAddr);
  const out: Claimable[] = [];
  const opaque: number[] = [];
  const claimed: number[] = [];
  let reproducible = 0;

  for (const r of rounds) {
    const snap = await snapshotForRound(mint, r);
    if (!snap) { opaque.push(r.index); continue; }
    reproducible++;
    const leaf = snap.leaves.find((l) => l.holder === wallet);
    if (!leaf || BigInt(leaf.amount) === 0n) continue;
    // the receipt account is the "already claimed" bit
    if (await conn().getAccountInfo(receiptPda(r.address, wallet))) { claimed.push(r.index); continue; }
    const { layers } = buildTree(snap.leaves);
    out.push({
      roundIndex: r.index, leafIndex: leaf.index, balance: leaf.balance, amount: leaf.amount,
      proof: proofFor(layers, leaf.index).map((b) => b.toString("hex")),
      sharePct: r.total > 0n ? Number(BigInt(leaf.amount) * 10000n / r.total) / 100 : 0,
    });
  }
  return { rounds: rounds.length, reproducible, claimable: out, claimed, opaque };
}
