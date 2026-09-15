/**
 * Everything the browser needs to build a `launch` transaction on its own:
 * the manual-list Merkle root (byte-identical to the program's hashing), the
 * 39-account instruction in IDL order, and the lookup table that makes it
 * fit in one v0 transaction. No Anchor client, no server-side signing.
 */
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha256";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction, AddressLookupTableAccount, Connection, Keypair,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
export const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
export const MAYHEM = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
export const DECIMALS = 6;
export const MAX_MANUAL_ENTRIES = 50;
export const MIN_LOCK_SUPPLY_BPS = 100;

// sha256("global:launch")[..8] and sha256("global:publish_manual_list")[..8], from the IDL
const LAUNCH_DISC = Buffer.from([153, 241, 93, 225, 22, 69, 74, 61]);
const PUBLISH_DISC = Buffer.from([44, 124, 36, 194, 216, 102, 229, 135]);

const pda = (seeds: (Buffer | Uint8Array)[], prog: PublicKey) => PublicKey.findProgramAddressSync(seeds, prog)[0];
const ata = (owner: PublicKey, mint: PublicKey, tp: PublicKey) =>
  pda([owner.toBuffer(), tp.toBuffer(), mint.toBuffer()], ATA_PROGRAM);

/* ------------------------------------------------------------ manual list */

const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const h = (...parts: Uint8Array[]) => Buffer.from(sha256(Buffer.concat(parts)));

export interface ManualEntry { index: number; wallet: PublicKey; bps: number }

/** Leaf/node hashing kept byte-identical to the program's `claim_manual`. */
export const manualLeaf = (e: ManualEntry) =>
  h(Buffer.from("manual"), u16le(e.index), e.wallet.toBuffer(), u16le(e.bps));

export function manualRoot(entries: ManualEntry[]): Buffer {
  if (!entries.length) return Buffer.alloc(32);
  let level: Buffer[] = entries.map(manualLeaf);
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) { next.push(level[i]); continue; }
      const [a, b] = [level[i], level[i + 1]];
      next.push(Buffer.compare(a, b) <= 0 ? h(Buffer.from("node"), a, b) : h(Buffer.from("node"), b, a));
    }
    level = next;
  }
  return level[0];
}

/**
 * "wallet, percent" per line → entries. Percent is of the list's own slice.
 * Throws with a line number on the first bad row.
 */
export function parseManualList(text: string): ManualEntry[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (rows.length > MAX_MANUAL_ENTRIES) throw new Error(`at most ${MAX_MANUAL_ENTRIES} wallets`);
  const seen = new Set<string>();
  const out = rows.map((row, i) => {
    const [w, p] = row.split(/[,\s]+/);
    let wallet: PublicKey;
    try { wallet = new PublicKey(w); } catch { throw new Error(`line ${i + 1}: "${w}" is not a Solana address`); }
    const pct = Number(p);
    if (!(pct > 0) || pct > 100) throw new Error(`line ${i + 1}: percent must be between 0 and 100`);
    const bps = Math.round(pct * 100);
    if (Math.abs(pct * 100 - bps) > 1e-6) throw new Error(`line ${i + 1}: use at most two decimals`);
    if (seen.has(wallet.toBase58())) throw new Error(`line ${i + 1}: ${w} appears twice`);
    seen.add(wallet.toBase58());
    return { index: i, wallet, bps };
  });
  const total = out.reduce((s, e) => s + e.bps, 0);
  if (total > 10_000) throw new Error(`the list adds up to ${total / 100}% — at most 100%`);
  return out;
}

/* --------------------------------------------------------------- pricing */

export interface PumpParams {
  initialVirtualTokenReserves: string; initialVirtualSolReserves: string; tokenTotalSupply: string;
  feeBps: string; creatorFeeBps: string; feeRecipient: string; buybackFeeRecipient: string;
}

/** Tokens a fresh curve gives for `sol` lamports, fees taken off the top. */
export function tokensForSol(p: PumpParams, lamports: bigint): bigint {
  const vt = BigInt(p.initialVirtualTokenReserves), vs = BigInt(p.initialVirtualSolReserves);
  const feeBps = BigInt(p.feeBps) + BigInt(p.creatorFeeBps);
  const net = (lamports * 10_000n) / (10_000n + feeBps);
  return vt - (vt * vs) / (vs + net);
}
/** Lamports a fresh curve charges for `amount` tokens, fees included. */
export function solForTokens(p: PumpParams, amount: bigint): bigint {
  const vt = BigInt(p.initialVirtualTokenReserves), vs = BigInt(p.initialVirtualSolReserves);
  if (amount >= vt) return 0n;
  const base = (vs * amount) / (vt - amount) + 1n;
  const feeBps = BigInt(p.feeBps) + BigInt(p.creatorFeeBps);
  return base + (base * feeBps) / 10_000n;
}

/* ----------------------------------------------------------- instruction */

export interface LaunchArgs {
  name: string; symbol: string; uri: string;
  amount: bigint; maxSolCost: bigint;
  manualRoot: Buffer; manualBps: number; holderBps: number; isHolderReward: boolean;
}

const str = (s: string) => { const b = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const u64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); return b; };

export function launchAddresses(mint: PublicKey, dev: PublicKey, p: PumpParams) {
  const escrow = pda([Buffer.from("escrow"), mint.toBuffer()], PROGRAM_ID);
  const feeAuthority = pda([Buffer.from("fee"), mint.toBuffer()], PROGRAM_ID);
  const manualAuthority = pda([Buffer.from("manual"), mint.toBuffer()], PROGRAM_ID);
  const bondingCurve = pda([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP);
  const creatorVault = pda([Buffer.from("creator-vault"), feeAuthority.toBuffer()], PUMP);
  const userVolumeAccumulator = pda([Buffer.from("user_volume_accumulator"), dev.toBuffer()], PUMP);
  const solVault = pda([Buffer.from("sol-vault")], MAYHEM);
  const feeRecipient = new PublicKey(p.feeRecipient);
  const buybackFeeRecipient = new PublicKey(p.buybackFeeRecipient);
  return {
    dev, mint, escrow,
    config: pda([Buffer.from("config")], PROGRAM_ID),
    escrowTokenAccount: ata(escrow, mint, TOKEN_2022),
    manualAuthority,
    manualTokenAccount: ata(manualAuthority, mint, TOKEN_2022),
    feeAuthority,
    global: pda([Buffer.from("global")], PUMP),
    mintAuthority: pda([Buffer.from("mint-authority")], PUMP),
    bondingCurve,
    associatedBaseBondingCurve: ata(bondingCurve, mint, TOKEN_2022),
    eventAuthority: pda([Buffer.from("__event_authority")], PUMP),
    pumpProgram: PUMP,
    mayhemProgram: MAYHEM,
    globalParams: pda([Buffer.from("global-params")], MAYHEM),
    solVault,
    mayhemState: pda([Buffer.from("mayhem-state"), mint.toBuffer()], MAYHEM),
    mayhemTokenVault: ata(solVault, mint, TOKEN_2022),
    quoteMint: WSOL,
    quoteTokenProgram: TOKEN,
    feeRecipient,
    associatedQuoteFeeRecipient: ata(feeRecipient, WSOL, TOKEN),
    buybackFeeRecipient,
    associatedQuoteBuybackFeeRecipient: ata(buybackFeeRecipient, WSOL, TOKEN),
    associatedQuoteBondingCurve: ata(bondingCurve, WSOL, TOKEN),
    associatedBaseUser: ata(dev, mint, TOKEN_2022),
    associatedQuoteUser: ata(dev, WSOL, TOKEN),
    creatorVault,
    associatedCreatorVault: ata(creatorVault, WSOL, TOKEN),
    sharingConfig: pda([Buffer.from("sharing-config"), mint.toBuffer()], FEE_PROGRAM),
    globalVolumeAccumulator: pda([Buffer.from("global_volume_accumulator")], PUMP),
    userVolumeAccumulator,
    associatedUserVolumeAccumulator: ata(userVolumeAccumulator, WSOL, TOKEN),
    feeConfig: pda([Buffer.from("fee_config"), PUMP.toBuffer()], FEE_PROGRAM),
    feeProgram: FEE_PROGRAM,
    baseTokenProgram: TOKEN_2022,
    associatedTokenProgram: ATA_PROGRAM,
    systemProgram: SystemProgram.programId,
  };
}

/** The `launch` instruction, accounts in the IDL's order. */
export function launchInstruction(mint: PublicKey, dev: PublicKey, p: PumpParams, a: LaunchArgs): TransactionInstruction {
  const k = launchAddresses(mint, dev, p);
  const w = (pubkey: PublicKey) => ({ pubkey, isWritable: true, isSigner: false });
  const r = (pubkey: PublicKey) => ({ pubkey, isWritable: false, isSigner: false });
  const keys = [
    { pubkey: dev, isWritable: true, isSigner: true },
    { pubkey: mint, isWritable: true, isSigner: true },
    w(k.escrow), r(k.config), w(k.escrowTokenAccount), r(k.manualAuthority), w(k.manualTokenAccount), r(k.feeAuthority),
    w(k.global), r(k.mintAuthority), w(k.bondingCurve), w(k.associatedBaseBondingCurve), r(k.eventAuthority), r(k.pumpProgram),
    w(k.mayhemProgram), r(k.globalParams), w(k.solVault), w(k.mayhemState), w(k.mayhemTokenVault),
    r(k.quoteMint), r(k.quoteTokenProgram), w(k.feeRecipient), w(k.associatedQuoteFeeRecipient),
    w(k.buybackFeeRecipient), w(k.associatedQuoteBuybackFeeRecipient), w(k.associatedQuoteBondingCurve),
    w(k.associatedBaseUser), w(k.associatedQuoteUser), w(k.creatorVault), w(k.associatedCreatorVault),
    r(k.sharingConfig), w(k.globalVolumeAccumulator), w(k.userVolumeAccumulator), w(k.associatedUserVolumeAccumulator),
    r(k.feeConfig), r(k.feeProgram), r(k.baseTokenProgram), r(k.associatedTokenProgram), r(k.systemProgram),
  ];
  const data = Buffer.concat([
    LAUNCH_DISC, str(a.name), str(a.symbol), str(a.uri), u64(a.amount), u64(a.maxSolCost),
    a.manualRoot, u16le(a.manualBps), u16le(a.holderBps), Buffer.from([a.isHolderReward ? 1 : 0]),
  ]);
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

/** `publish_manual_list`: puts the rows behind the committed root on chain so recipients can build proofs. */
export function publishManualInstruction(mint: PublicKey, dev: PublicKey, entries: ManualEntry[]): TransactionInstruction {
  const escrow = pda([Buffer.from("escrow"), mint.toBuffer()], PROGRAM_ID);
  const len = Buffer.alloc(4); len.writeUInt32LE(entries.length);
  const data = Buffer.concat([PUBLISH_DISC, len, ...entries.map((e) => Buffer.concat([u16le(e.index), e.wallet.toBuffer(), u16le(e.bps)]))]);
  return new TransactionInstruction({
    programId: PROGRAM_ID, data,
    keys: [{ pubkey: dev, isWritable: true, isSigner: true }, { pubkey: escrow, isWritable: true, isSigner: false }],
  });
}

/* ------------------------------------------------------------ lookup table */

/**
 * 39 accounts do not fit a legacy transaction, so the launch goes out as a v0
 * transaction with a one-off lookup table: create + first extend in one
 * transaction, the remainder in a second.
 */
export function lookupTableInstructions(dev: PublicKey, slot: number, addresses: PublicKey[]) {
  const [createIx, table] = AddressLookupTableProgram.createLookupTable({ authority: dev, payer: dev, recentSlot: slot });
  const uniq = [...new Map(addresses.map((k) => [k.toBase58(), k])).values()];
  const extend = (chunk: PublicKey[]) =>
    AddressLookupTableProgram.extendLookupTable({ payer: dev, authority: dev, lookupTable: table, addresses: chunk });
  const first = uniq.slice(0, 26), rest = uniq.slice(26);
  return { table, txs: [[createIx, extend(first)], ...(rest.length ? [[extend(rest)]] : [])] as TransactionInstruction[][], count: uniq.length };
}

/** Poll until the table holds every address and the slot has moved past its last extension. */
export async function waitForTable(conn: Connection, table: PublicKey, count: number): Promise<AddressLookupTableAccount> {
  for (let i = 0; i < 40; i++) {
    const acc = (await conn.getAddressLookupTable(table, { commitment: "confirmed" })).value;
    if (acc && acc.state.addresses.length >= count) {
      const slot = await conn.getSlot("confirmed");
      if (slot > Number(acc.state.lastExtendedSlot)) return acc;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("the lookup table did not become usable in time — try again");
}

export async function buildV0(conn: Connection, payer: PublicKey, ixs: TransactionInstruction[], table: AddressLookupTableAccount, signers: Keypair[] = []) {
  const bh = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: payer, recentBlockhash: bh.blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs],
  }).compileToV0Message([table]);
  const tx = new VersionedTransaction(msg);
  if (signers.length) tx.sign(signers);
  return { tx, bh };
}
