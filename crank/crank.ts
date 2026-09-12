/**
 * airdrop_escrow crank — the keeper that turns the handle.
 *
 * Every instruction it sends is permissionless, so anyone may run a copy of
 * this with any funded wallet; the wallet only pays transaction fees. Once a
 * minute it lists every coin the program has launched and, per coin:
 *
 *   collect_fees   when the pump creator vault holds something worth sweeping
 *   buyback        when the escrow's spendable SOL clears the program threshold
 *   check_trigger  always — it samples volume, which is what the triggers run on
 *   fire_trigger   when a trigger is armed and its random delay has passed
 *
 * Nothing here decides anything: every threshold and delay is enforced on chain,
 * the crank only avoids paying for calls that would obviously be no-ops.
 *
 *   RPC_URL          default ANCHOR_PROVIDER_URL, else http://127.0.0.1:8899
 *   CRANK_KEYPAIR    default ANCHOR_WALLET, else ~/.config/solana/id.json
 *   CRANK_INTERVAL_MS default 60000
 *   CRANK_LOG        optional JSONL file, one event per line
 *   --once           run a single tick and exit (for cron)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  pumpAccounts, escrowAta, buyerPda, baseAtaOf, TOKEN_2022, WSOL, TOKEN,
} from "../tests/pump";

// Mirrors of the program constants the crank pre-checks against. The chain is
// the authority; these only save the fee of a call that would be a no-op.
const MIN_BUYBACK_LAMPORTS = 10_000_000n;
const BUYBACK_RESERVE_LAMPORTS = 10_000_000n;
/** Sweeping less than this is not worth the transaction fee. */
const MIN_COLLECT_LAMPORTS = 1_000_000n;

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const KIND = ["none", "volume", "milestone"];

const RPC_URL = process.env.RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
const INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS ?? 60_000);
const ONCE = process.argv.includes("--once");

function loadKeypair(): Keypair {
  const p = process.env.CRANK_KEYPAIR ?? process.env.ANCHOR_WALLET
    ?? path.join(os.homedir(), ".config/solana/id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

const logFile = process.env.CRANK_LOG ? fs.createWriteStream(process.env.CRANK_LOG, { flags: "a" }) : null;
/** One event, printed as a readable line and appended as JSON when CRANK_LOG is set. */
function log(ev: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const body = Object.entries(ev)
    .map(([k, v]) => `${k}=${typeof v === "string" && v.includes(" ") ? JSON.stringify(v) : String(v)}`)
    .join(" ");
  console.log(`${ts} ${body}`);
  logFile?.write(JSON.stringify({ ts, ...ev }, (_, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
}

/** Anchor error name out of whatever the client threw. */
function errName(e: any): string {
  const code = e?.error?.errorCode?.code ?? e?.errorCode?.code;
  if (code) return code;
  const m = String(e?.message ?? e);
  const hit = m.match(/Error Code: (\w+)/) ?? m.match(/custom program error: (0x[0-9a-f]+)/i);
  return hit ? hit[1] : m.slice(0, 120);
}

const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;

async function main() {
  const keypair = loadKeypair();
  const conn = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(conn, wallet, {
    commitment: "confirmed", preflightCommitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;
  const escrowSize: number = program.account.escrow.size;
  const escrowRent = BigInt(await conn.getMinimumBalanceForRentExemption(escrowSize));

  log({ event: "start", rpc: RPC_URL, wallet: keypair.publicKey.toBase58(),
        interval_ms: INTERVAL_MS, once: ONCE });

  /** Plain legacy transaction from the crank wallet; the caller handles errors. */
  async function send(ixs: anchor.web3.TransactionInstruction[], cu = 200_000) {
    const bh = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ ...bh, feePayer: keypair.publicKey })
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ...ixs);
    const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed", maxRetries: 5 });
    // the slot the transaction actually landed in — the only timing that counts
    const info = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return { sig, slot: info?.slot ?? -1 };
  }

  /** Every escrow the current program generation can decode. */
  async function listEscrows() {
    const disc = program.coder.accounts.memcmp("escrow");
    const raw = await conn.getProgramAccounts(program.programId, {
      commitment: "confirmed",
      filters: [{ dataSize: escrowSize }, { memcmp: { offset: disc.offset, bytes: disc.bytes } }],
    });
    return raw.map((a) => ({
      address: a.pubkey,
      state: program.coder.accounts.decode("escrow", a.account.data) as any,
      lamports: BigInt(a.account.lamports),
    }));
  }

  async function crankCoin(tick: number, esc: { address: PublicKey; state: any; lamports: bigint }) {
    const mint: PublicKey = esc.state.mint;
    const escrow = esc.address;
    const coin = short(mint);
    const buyer = buyerPda(mint, program.programId);
    const pb = pumpAccounts(mint, buyer, escrow);
    const pa = pumpAccounts(mint, esc.state.dev, escrow);
    const quoteAta = (o: PublicKey) => getAssociatedTokenAddressSync(WSOL, o, true, TOKEN);

    const curveInfo = await conn.getAccountInfo(pa.bondingCurve, "confirmed");
    if (!curveInfo) { log({ tick, coin, event: "skip", reason: "no bonding curve" }); return; }
    const curveComplete = curveInfo.data.readUInt8(48) === 1;

    // 1. creator fees: sweep the pump vault into the escrow when there is enough
    //    to be worth a transaction. For SOL-quoted coins the fee sits as lamports
    //    on the vault PDA; anything under rent is not ours to take.
    const vaultLamports = BigInt(await conn.getBalance(pa.creatorVault, "confirmed"));
    const vaultFloor = BigInt(await conn.getMinimumBalanceForRentExemption(0));
    const sweepable = vaultLamports > vaultFloor ? vaultLamports - vaultFloor : 0n;
    if (sweepable >= MIN_COLLECT_LAMPORTS) {
      try {
        const ix = await program.methods.collectFees().accountsPartial({
          payer: keypair.publicKey, escrow,
          creatorTokenAccount: quoteAta(escrow),
          creatorVault: pa.creatorVault,
          creatorVaultTokenAccount: quoteAta(pa.creatorVault),
          quoteMint: WSOL, quoteTokenProgram: TOKEN,
          associatedTokenProgram: pa.associatedTokenProgram,
          eventAuthority: pa.eventAuthority, pumpProgram: pa.pumpProgram,
          systemProgram: SystemProgram.programId,
        }).instruction();
        const { sig } = await send([ix]);
        log({ tick, coin, action: "collect_fees", result: "ok", lamports: sweepable, sig });
      } catch (e) {
        log({ tick, coin, action: "collect_fees", result: "error", error: errName(e) });
      }
    }

    // 2. buyback: only when the escrow's spendable SOL clears the on-chain
    //    threshold, so we never pay to hear "BuybackSkipped".
    const escrowLamports = BigInt(await conn.getBalance(escrow, "confirmed"));
    const buyerLamports = BigInt(await conn.getBalance(buyer, "confirmed"));
    const fromEscrow = escrowLamports > escrowRent ? escrowLamports - escrowRent : 0n;
    const spendable = fromEscrow + buyerLamports - BUYBACK_RESERVE_LAMPORTS;
    if (spendable >= MIN_BUYBACK_LAMPORTS && !curveComplete) {
      try {
        const ix = await program.methods.buyback().accountsPartial({
          payer: keypair.publicKey, escrow, buyer, mint,
          buyerTokenAccount: baseAtaOf(buyer, mint), escrowTokenAccount: escrowAta(escrow, mint),
          global: pb.global, quoteMint: WSOL, quoteTokenProgram: TOKEN,
          feeRecipient: pb.feeRecipient,
          associatedQuoteFeeRecipient: pb.associatedQuoteFeeRecipient,
          buybackFeeRecipient: pb.buybackFeeRecipient,
          associatedQuoteBuybackFeeRecipient: pb.associatedQuoteBuybackFeeRecipient,
          bondingCurve: pb.bondingCurve,
          associatedBaseBondingCurve: pb.associatedBaseBondingCurve,
          associatedQuoteBondingCurve: pb.associatedQuoteBondingCurve,
          associatedQuoteUser: pb.associatedQuoteUser,
          creatorVault: pb.creatorVault, associatedCreatorVault: pb.associatedCreatorVault,
          sharingConfig: pb.sharingConfig,
          globalVolumeAccumulator: pb.globalVolumeAccumulator,
          userVolumeAccumulator: pb.userVolumeAccumulator,
          associatedUserVolumeAccumulator: pb.associatedUserVolumeAccumulator,
          feeConfig: pb.feeConfig, feeProgram: pb.feeProgram,
          eventAuthority: pb.eventAuthority, pumpProgram: pb.pumpProgram,
          baseTokenProgram: TOKEN_2022, associatedTokenProgram: pb.associatedTokenProgram,
          systemProgram: SystemProgram.programId,
        }).instruction();
        const before = esc.state.buybackSpent.toString();
        const { sig } = await send([ix], 400_000);
        const after: any = await program.account.escrow.fetch(escrow, "confirmed");
        log({ tick, coin, action: "buyback", result: "ok", spendable,
              spent: after.buybackSpent.sub(new anchor.BN(before)).toString(),
              tokens: after.buybackTokens.toString(), sig });
      } catch (e) {
        log({ tick, coin, action: "buyback", result: "error", spendable, error: errName(e) });
      }
    } else if (spendable >= MIN_BUYBACK_LAMPORTS && curveComplete) {
      log({ tick, coin, action: "buyback", result: "skip", reason: "curve complete", spendable });
    }

    // 3. check the trigger. Always: this is also what samples the volume.
    let st: any = esc.state;
    try {
      const ix = await program.methods.checkTrigger().accountsPartial({
        escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES,
      }).instruction();
      const { sig } = await send([ix]);
      const was = st;
      st = await program.account.escrow.fetch(escrow, "confirmed");
      const ev: Record<string, unknown> = { tick, coin, action: "check_trigger", sig,
        cum_volume: st.cumVolume.toString(), mcap_sol: mcapSol(curveInfo.data) };
      if (st.armed && !was.armed) {
        Object.assign(ev, { result: "armed", kind: KIND[st.armedKind],
          amount: st.authorized.toString(), fire_slot: st.fireSlot.toString() });
      } else if (st.armed) {
        Object.assign(ev, { result: "still_armed", fire_slot: st.fireSlot.toString() });
      } else if (st.dead && !was.dead) {
        Object.assign(ev, { result: "dead_flagged", quiet_days: st.lowVolumeDays });
      } else {
        Object.assign(ev, { result: "idle" });
      }
      log(ev);
    } catch (e) {
      log({ tick, coin, action: "check_trigger", result: "error", error: errName(e) });
      return;
    }

    // 4. fire once the delay has passed. Never before: the program would reject
    //    it and we would have paid for a TooEarly.
    if (st.armed) {
      const slot = BigInt(await conn.getSlot("confirmed"));
      const fireSlot = BigInt(st.fireSlot.toString());
      if (slot < fireSlot) {
        log({ tick, coin, action: "fire_trigger", result: "wait", slot, fire_slot: fireSlot,
              slots_left: fireSlot - slot });
        return;
      }
      try {
        const ix = await program.methods.fireTrigger().accountsPartial({
          escrow, bondingCurve: pa.bondingCurve,
        }).instruction();
        const { sig, slot: txSlot } = await send([ix]);
        const after: any = await program.account.escrow.fetch(escrow, "confirmed");
        log({ tick, coin, action: "fire_trigger", result: "ok", kind: KIND[st.armedKind],
              tx_slot: txSlot, fire_slot: fireSlot, released: st.authorized.toString(),
              pending: after.pending.toString(), sig });
      } catch (e) {
        log({ tick, coin, action: "fire_trigger", result: "error", error: errName(e) });
      }
    }
  }

  let tick = 0;
  let busy = false;
  async function runTick() {
    if (busy) { log({ event: "tick_skipped", reason: "previous tick still running" }); return; }
    busy = true;
    tick += 1;
    try {
      const slot = await conn.getSlot("confirmed");
      const balance = await conn.getBalance(keypair.publicKey, "confirmed");
      const escrows = await listEscrows();
      log({ event: "tick", tick, slot, coins: escrows.length, wallet_sol: (balance / 1e9).toFixed(4) });
      for (const esc of escrows) {
        try { await crankCoin(tick, esc); } catch (e) {
          log({ tick, coin: short(esc.state.mint), event: "error", error: errName(e) });
        }
      }
    } catch (e) {
      log({ event: "tick_error", tick, error: errName(e) });
    } finally {
      busy = false;
    }
  }

  await runTick();
  if (ONCE) { logFile?.end(); return; }
  setInterval(runTick, INTERVAL_MS);
}

/** Market cap in SOL, straight off the curve's virtual reserves. */
function mcapSol(curve: Buffer): string {
  const vt = curve.readBigUInt64LE(8), vq = curve.readBigUInt64LE(16), supply = curve.readBigUInt64LE(40);
  return (Number((supply * vq) / vt) / 1e9).toFixed(3);
}

main().catch((e) => { console.error(e); process.exit(1); });
