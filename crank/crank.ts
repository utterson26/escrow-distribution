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
 *   open_round     when a fired trigger left tokens pending: take the holder
 *                  snapshot with the indexer, split the release pro rata
 *                  (10% cap per wallet), commit the root
 *
 * open_round is the one step that is not permissionless — the root is the
 * trust point of the whole scheme — so it runs only when this wallet is the
 * coin's dev or its platform authority. Everything else the crank does is
 * enforced on chain; the pre-checks only avoid paying for obvious no-ops.
 *
 *   RPC_URL            default ANCHOR_PROVIDER_URL, else http://127.0.0.1:8899
 *   CRANK_KEYPAIR      default ANCHOR_WALLET, else ~/.config/solana/id.json
 *   CRANK_INTERVAL_MS  default 60000
 *   CRANK_SNAPSHOT_DIR where snapshots are written, default crank/snapshots
 *   CRANK_LOG          optional JSONL file, one event per line
 *   --once             run a single tick and exit (for cron)
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
  pumpAccounts, escrowAta, buyerPda, baseAtaOf, feeAuthorityPda, sharingConfigPda,
  setupFeeSharingAccounts, collectFeesAccounts, shareholdersFromChain, TOKEN_2022, WSOL, TOKEN,
} from "../tests/pump";
import { snapshot } from "../indexer/snapshot";

// Mirrors of the program constants the crank pre-checks against. The chain is
// the authority; these only save the fee of a call that would be a no-op.
const MIN_BUYBACK_LAMPORTS = 10_000_000n;
const BUYBACK_RESERVE_LAMPORTS = 10_000_000n;
/** Below this above rent, pump will not distribute the vault anyway. */
const MIN_COLLECT_LAMPORTS = 1_200_000n;

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
let configPda: PublicKey;
const KIND = ["none", "volume", "milestone"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const roundPda = (escrow: PublicKey, index: number, program: PublicKey) => {
  const b = Buffer.alloc(4); b.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), escrow.toBuffer(), b], program)[0];
};

const RPC_URL = process.env.RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
const INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS ?? 60_000);
const SNAPSHOT_DIR = process.env.CRANK_SNAPSHOT_DIR ?? path.join(__dirname, "snapshots");
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
  configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const escrowSize: number = program.account.escrow.size;
  const escrowRent = BigInt(await conn.getMinimumBalanceForRentExemption(escrowSize));
  const roundSize: number = program.account.round.size;
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

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

  /** Rounds of one escrow, current layout only. */
  async function listRounds(escrow: PublicKey) {
    const disc = program.coder.accounts.memcmp("round");
    const raw = await conn.getProgramAccounts(program.programId, {
      commitment: "confirmed",
      filters: [
        { dataSize: roundSize },
        { memcmp: { offset: disc.offset, bytes: disc.bytes } },
        { memcmp: { offset: 8, bytes: escrow.toBase58() } },
      ],
    });
    return raw.map((a) => ({
      address: a.pubkey,
      state: program.coder.accounts.decode("round", a.account.data) as any,
    }));
  }

  async function crankCoin(tick: number, esc: { address: PublicKey; state: any; lamports: bigint }) {
    const mint: PublicKey = esc.state.mint;
    const escrow = esc.address;
    const coin = short(mint);
    const buyer = buyerPda(mint, program.programId);
    const feeAuthority = feeAuthorityPda(mint, program.programId);
    const sharingConfig = sharingConfigPda(mint);
    // pump's creator for this coin: the sharing config once fee sharing is set
    // up, our fee PDA before that (and forever on a holder-rewards coin)
    const creator = esc.state.feeSharingSet ? sharingConfig : feeAuthority;
    const pb = pumpAccounts(mint, buyer, creator);
    const pa = pumpAccounts(mint, esc.state.dev, creator);
    const holderReward: boolean = !!esc.state.isHolderReward;

    const curveInfo = await conn.getAccountInfo(pa.bondingCurve, "confirmed");
    if (!curveInfo) { log({ tick, coin, event: "skip", reason: "no bonding curve" }); return; }
    const curveComplete = curveInfo.data.readUInt8(48) === 1;

    // 0. fee sharing: a regular coin that was launched but not yet set up gets
    //    its escrow / platform split now (permissionless; the crank fronts the
    //    sharing config's rent and gets the unused part back)
    if (!holderReward && !esc.state.feeSharingSet) {
      try {
        const cfg: any = await program.account.config.fetch(configPda, "confirmed");
        const ix = await program.methods.setupFeeSharing().accountsPartial(
          setupFeeSharingAccounts(mint, escrow, program.programId, keypair.publicKey, cfg.platformFeeWallet)).instruction();
        const { sig } = await send([ix], 600_000);
        log({ tick, coin, action: "setup_fee_sharing", result: "ok", platform_bps: cfg.platformFeeBps, sig });
        esc.state = await program.account.escrow.fetch(escrow, "confirmed");
      } catch (e) {
        log({ tick, coin, action: "setup_fee_sharing", result: "error", error: errName(e) });
      }
      return; // the creator vault moved; pick the coin up again next tick
    }

    // 1. creator fees: have pump pay the vault out (escrow share / platform
    //    share) when there is enough to be worth a transaction. pump itself
    //    refuses to distribute below ~0.0019 SOL in the vault, so wait for a
    //    little more than that. Not on holder-rewards coins: pump keeps their
    //    creator fee for its own holder pool.
    const vaultLamports = BigInt(await conn.getBalance(pa.creatorVault, "confirmed"));
    const vaultFloor = BigInt(await conn.getMinimumBalanceForRentExemption(0));
    const sweepable = vaultLamports > vaultFloor ? vaultLamports - vaultFloor : 0n;
    if (!holderReward && sweepable >= MIN_COLLECT_LAMPORTS) {
      try {
        // the shareholders are whatever this coin's sharing config says (fixed
        // at setup; the program config may have moved on since)
        const metas = await shareholdersFromChain(conn, mint);
        if (!metas) throw new Error("sharing config missing");
        const ix = await program.methods.collectFees()
          .accountsPartial(collectFeesAccounts(mint, escrow, program.programId, keypair.publicKey))
          .remainingAccounts(metas)
          .instruction();
        const before = BigInt(await conn.getBalance(escrow, "confirmed"));
        const { sig } = await send([ix]);
        const gained = BigInt(await conn.getBalance(escrow, "confirmed")) - before;
        log({ tick, coin, action: "collect_fees", result: "ok", vault: sweepable, escrow_gained: gained, sig });
      } catch (e) {
        log({ tick, coin, action: "collect_fees", result: "error", error: errName(e) });
      }
    }

    // 2. buyback: only when the escrow's spendable SOL clears the on-chain
    //    threshold, so we never pay to hear "BuybackSkipped" — and only once the
    //    chain has moved past the last buyback's slot (one spend per slot).
    const escrowLamports = BigInt(await conn.getBalance(escrow, "confirmed"));
    const buyerLamports = BigInt(await conn.getBalance(buyer, "confirmed"));
    const fromEscrow = escrowLamports > escrowRent ? escrowLamports - escrowRent : 0n;
    const spendable = fromEscrow + buyerLamports - BUYBACK_RESERVE_LAMPORTS;
    const slotOpen = (await conn.getSlot("processed")) > Number(esc.state.lastBuybackSlot);
    if (!holderReward && spendable >= MIN_BUYBACK_LAMPORTS && !curveComplete && slotOpen) {
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
        // one spend per slot: not a failure, the next tick picks it up
        const name = errName(e);
        log({ tick, coin, action: "buyback", result: /BuybackSameSlot|0x1772/.test(name) ? "same_slot" : "error",
              spendable, error: name });
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

    // 5. whatever the triggers released becomes a round: snapshot the holders,
    //    allocate the release over them, commit the root. Only the dev or the
    //    platform may commit. The cap can leave a remainder pending; it is
    //    re-offered next time, so a coin with few holders does not spin a round
    //    every tick — only when there is something new to hand out.
    st = await program.account.escrow.fetch(escrow, "confirmed");
    const rounds = await listRounds(escrow);
    const pending = BigInt(st.pending.toString());
    if (pending === 0n) return;
    const me = keypair.publicKey;
    if (!me.equals(st.dev) && !me.equals(st.platform)) {
      log({ tick, coin, action: "open_round", result: "skip", reason: "not dev or platform", pending });
      return;
    }
    const lastReleased = rounds.reduce((m, r) => (r.state.index >= m.i ? { i: r.state.index, v: BigInt(r.state.released.toString()) } : m), { i: -1, v: 0n });
    const lastTotal = rounds.reduce((m, r) => (r.state.index >= m.i ? { i: r.state.index, v: BigInt(r.state.total.toString()) } : m), { i: -1, v: 0n });
    if (lastReleased.i >= 0 && pending === lastReleased.v - lastTotal.v) {
      log({ tick, coin, action: "open_round", result: "skip", reason: "only the cap remainder is pending", pending });
      return;
    }
    const index = rounds.reduce((m, r) => Math.max(m, r.state.index + 1), 0);
    const snapSlot = await conn.getSlot("confirmed");
    let snap;
    try {
      snap = await snapshot(RPC_URL, mint.toBase58(), snapSlot, program.programId, [], pending);
    } catch (e) {
      log({ tick, coin, action: "snapshot", result: "error", error: errName(e) });
      return;
    }
    const file = path.join(SNAPSHOT_DIR, `${mint.toBase58()}-${index}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    if (snap.leaves.length === 0) {
      log({ tick, coin, action: "snapshot", result: "empty", slot: snapSlot, reason: "no eligible holder", pending });
      return;
    }
    log({ tick, coin, action: "snapshot", result: "ok", slot: snapSlot, holders: snap.leaves.length,
          excluded: snap.excluded.length, released: pending, total: snap.total,
          root: snap.root.slice(0, 16) + "…", file });
    if (BigInt(snap.total) === 0n) return;

    const round = roundPda(escrow, index, program.programId);
    try {
      const ix = await program.methods
        .openRound(index, [...Buffer.from(snap.root, "hex")], new anchor.BN(pending.toString()),
                   new anchor.BN(snap.total), snap.leaves.length, new anchor.BN(snapSlot))
        .accountsPartial({ publisher: me, escrow, round, systemProgram: SystemProgram.programId })
        .instruction();
      const { sig, slot } = await send([ix]);
      log({ tick, coin, action: "open_round", result: "ok", round: index, holders: snap.leaves.length,
            released: pending, total: snap.total, commit_slot: slot, snapshot_slot: snapSlot, sig });
    } catch (e) {
      log({ tick, coin, action: "open_round", result: "error", round: index, error: errName(e) });
      return;
    }
  }

  let tick = 0;
  let busy = false;
  let stopping = false;
  // finish the tick in progress before exiting
  const stop = () => { stopping = true; if (!busy) { logFile?.end(); process.exit(0); } };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
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
      if (stopping) { logFile?.end(); process.exit(0); }
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
