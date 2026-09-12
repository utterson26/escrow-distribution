import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { snapshot, buildTree, proofFor, Snapshot } from "../../indexer/snapshot";
import { conn, rpcUrl, PROGRAM_ID } from "./chain";
import { fetchRounds } from "./data";
import { Round } from "./chain";

const CACHE = path.join(process.cwd(), ".cache");

/** Reproduce the snapshot a round was built from, pinned to its commit slot. */
async function snapshotForRound(mint: string, r: Round): Promise<Snapshot | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${mint}-${r.index}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    // newer rounds record the snapshot slot; older ones were taken just before
    // the commit, so walk back a little until the rebuilt root matches
    const candidates = r.snapshotSlot !== undefined
      ? [Number(r.snapshotSlot)]
      : [0, 2, 5, 10, 20, 40].map((back) => Number(r.commitSlot) - back);
    for (const slot of candidates) {
      const snap = await snapshot(rpcUrl(), mint, slot, PROGRAM_ID);
      if (buildTree(snap.leaves).root.toString("hex") === r.root) {
        fs.writeFileSync(file, JSON.stringify(snap));
        return snap;
      }
    }
  } catch { /* fall through */ }
  return null;
}

export interface Claimable {
  roundIndex: number; drawIndex: number; leafIndex: number;
  balance: string; weight: string; cumStart: string; proof: string[]; prize: string;
}
export interface ClaimReport {
  rounds: number;
  reproducible: number;
  claimable: Claimable[];
  /** rounds whose snapshot could not be reproduced from chain history */
  opaque: number[];
}

const le16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const leToBig = (b: Buffer) => {
  let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v;
};

export async function claimableFor(mint: string, escrowAddr: string, wallet: string): Promise<ClaimReport> {
  const rounds = (await fetchRounds(escrowAddr)).filter((r) => r.drawn);
  const out: Claimable[] = [];
  const opaque: number[] = [];
  let reproducible = 0;

  for (const r of rounds) {
    const snap = await snapshotForRound(mint, r);
    if (!snap) { opaque.push(r.index); continue; }
    reproducible++;
    const { layers } = buildTree(snap.leaves);
    const total = BigInt(snap.totalWeight);
    const seed = Buffer.from(r.seed, "hex");

    for (let k = 0; k < r.winnerCount; k++) {
      const taken = (r.claimedBits[Math.floor(k / 8)] >> (k % 8)) & 1;
      if (taken) continue;
      const h = createHash("sha256").update(Buffer.concat([seed, le16(k)])).digest();
      const ticket = leToBig(h.subarray(0, 16)) % total;
      const leaf = snap.leaves.find(
        (l) => BigInt(l.cumStart) <= ticket && ticket < BigInt(l.cumStart) + BigInt(l.weight));
      if (!leaf || leaf.holder !== wallet) continue;
      out.push({
        roundIndex: r.index, drawIndex: k, leafIndex: leaf.index,
        balance: leaf.balance, weight: leaf.weight, cumStart: leaf.cumStart,
        proof: proofFor(layers, leaf.index).map((b) => b.toString("hex")),
        prize: r.prize.toString(),
      });
    }
  }
  return { rounds: rounds.length, reproducible, claimable: out, opaque };
}
