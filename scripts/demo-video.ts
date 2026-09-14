/**
 * Screen-recording demo, devnet only, against the real pump.fun devnet program.
 * Meant to be read on camera: every step prints an English heading, waits a
 * beat, sends its transactions with explorer links, and shows the balances it
 * changed as before → after. Runs in about three to four minutes.
 *
 *   launch (30% lock) → three buyers → collect fees → buyback → volume trigger
 *   → random delay → snapshot + pro-rata shares → round on chain → claims
 *
 * Never run this file directly; `scripts/demo-video.sh start` is the entry
 * point. `--dry-run` checks the prerequisites and prints the storyboard
 * without sending anything (that is what the .sh does without `start`).
 *
 * Costs about 0.5 SOL of devnet SOL net (measured: 0.46): the throwaway wallets are swept
 * back and the creator's position is sold back at the end.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction, TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  pumpAccounts, escrowPda, escrowAta, buyerPda, baseAtaOf, directBuyIx,
  feeAuthorityPda, sharingConfigPda, setupFeeSharingAccounts, collectFeesAccounts, shareholderMetas, sellBackAll,
  TOKEN_2022, TOKEN, WSOL, patchProvider,
} from "../tests/pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";

const DRY_RUN = process.argv.includes("--dry-run");
const RPC_URL = process.env.HELIUS_RPC_URL ?? "";
/** pause after every heading and every balance table, so the viewer can read it */
const PAUSE_MS = DRY_RUN ? 0 : Number(process.env.PAUSE_MS ?? 5000);
/** SOL each buyer wallet is funded with; the leftover is swept back at the end */
const FUND_SOL = 0.25;
const BUYS = [0.15, 0.12, 0.10];
const BUYERS = ["Alice", "Bob", "Carol"];
/** locked share of the creator's buy: all of it goes to the holder pool (no fixed list) */
const HOLDER_BPS = 3000;
/** the creator's launch buy; 300M is what the devnet demo uses (≈ 0.4 SOL) */
const LAUNCH_TOKENS = 300_000_000n;
/** random-delay window in slots: up to ~40 s on camera (production: 60 minutes) */
const DELAY_WINDOW = 100;
/** fees from three small buys are below the 0.01 SOL buyback minimum; this makes the buyback visible */
const TOPUP_SOL = 0.1;
const BUYBACK_CHUNKS = 3;
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const DEC = 1_000_000n;
const MIN_DEV_SOL = 1.5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(PAUSE_MS);
const short = (k: PublicKey | string) => { const s = typeof k === "string" ? k : k.toBase58(); return `${s.slice(0, 4)}…${s.slice(-4)}`; };
const sol = (lamports: number | bigint) => `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const tok = (raw: bigint | string | number) => {
  const n = Number(BigInt(raw.toString())) / 1e6;
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);
};
const txLink = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addrLink = (k: PublicKey | string) => `https://explorer.solana.com/address/${typeof k === "string" ? k : k.toBase58()}?cluster=devnet`;

// ---- console layout ---------------------------------------------------------
const W = 78;
const line = (c = "─") => c.repeat(W);
let stepNo = 0;
async function heading(title: string, sub: string) {
  stepNo++;
  console.log(`\n${line("═")}\n  STEP ${stepNo}  ${title.toUpperCase()}\n  ${sub}\n${line("═")}`);
  await pause();
}
function tx(label: string, sig: string) {
  console.log(`  ✓ ${label}\n    ${txLink(sig)}`);
}
function info(s: string) { console.log(`  · ${s}`); }
/** balances as a before → after table; delta on the right */
type Bal = Record<string, bigint>;
async function diff(before: Bal, after: Bal, unit: (v: bigint) => string) {
  const keys = Object.keys(after);
  const w = Math.max(...keys.map((k) => k.length));
  for (const k of keys) {
    const b = before[k] ?? 0n, a = after[k];
    const d = a - b;
    const sign = d > 0n ? "+" : d < 0n ? "−" : " ";
    console.log(`    ${k.padEnd(w)}  ${unit(b).padStart(14)}  →  ${unit(a).padStart(14)}   ${sign}${unit(d < 0n ? -d : d)}`);
  }
  await pause();
}

/** BuybackDone event: spent / bought / left for later */
function decodeBuybackDone(logs: string[]) {
  const l = [...logs].reverse().find((x) => x.startsWith("Program data: "));
  if (!l) return null;
  const b = Buffer.from(l.slice("Program data: ".length), "base64");
  let o = 8 + 32;
  const spent = b.readBigUInt64LE(o); o += 8;
  const bought = b.readBigUInt64LE(o); o += 8;
  o += 16;
  return { spent, bought, left: b.readBigUInt64LE(o) };
}

const STORYBOARD: [string, string][] = [
  ["Launch", `create the coin on pump.fun, creator buys ${Number(LAUNCH_TOKENS) / 1e6}M, 30% of that buy is locked in a program-owned escrow — one transaction`],
  ["Fee sharing", "pump.fun's creator fee for this coin is split on pump itself: escrow share / platform share (config, 10% by default)"],
  ["Three buyers", `${BUYERS.join(", ")} buy from pump.fun (${BUYS.join(" / ")} SOL); the creator fee accrues`],
  ["Collect fees", "the accrued creator fee is paid out: the escrow's share and the platform's share"],
  ["Buyback", `escrow SOL is converted into the coin in slot-sized chunks (≤ 0.5% of reserves each); ${TOPUP_SOL} SOL top-up so it shows on camera`],
  ["Volume trigger", "trading volume passed 1% of market cap: 1% of the pool is released after a random delay"],
  ["Distribution unlocked", "fire_trigger (permissionless) after the delay"],
  ["Snapshot", "deterministic holder snapshot, shares pro rata to balance × holding time"],
  ["Round on chain", "Merkle root + snapshot slot + released amount are written on chain"],
  ["Claims", "every holder claims with a proof from their own wallet; a second claim is rejected"],
  ["Wrap-up", "throwaway wallets swept back, creator position sold back to the curve"],
];

async function main() {
  if (!RPC_URL) throw new Error("HELIUS_RPC_URL is not set (source ~/.airdrop-launchpad.env)");
  if (!/devnet/i.test(RPC_URL)) throw new Error(`HELIUS_RPC_URL does not look like devnet: ${RPC_URL.replace(/api-key=.*/, "api-key=…")}`);
  const conn = new anchor.web3.Connection(RPC_URL, "confirmed");
  const devPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const dev = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(devPath, "utf8"))));
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(dev), { commitment: "confirmed", preflightCommitment: "confirmed" });
  patchProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];

  // ---- prerequisites (both modes) ----
  console.log(`\n${line()}\n  escrow-distribution — devnet demo${DRY_RUN ? " (DRY RUN: nothing is sent)" : ""}\n${line()}`);
  const devSol = await conn.getBalance(dev.publicKey, "confirmed");
  const progInfo = await conn.getAccountInfo(program.programId);
  const cfg: any = await program.account.config.fetch(configPda, "confirmed").catch(() => null);
  info(`rpc      ${RPC_URL.replace(/api-key=.*/, "api-key=…")}`);
  info(`program  ${program.programId.toBase58()}  ${progInfo ? "deployed ✓" : "NOT FOUND ✗"}`);
  info(`creator  ${dev.publicKey.toBase58()}  ${sol(devSol)}  ${devSol >= MIN_DEV_SOL * LAMPORTS_PER_SOL ? "✓" : `✗ (need ≥ ${MIN_DEV_SOL} SOL)`}`);
  info(`config   platform ${cfg ? short(cfg.platform) : "?"}  fee ${cfg ? cfg.platformFeeBps / 100 : "?"}%  lock cap ${cfg ? sol(cfg.maxLockedValueLamports.toNumber()) : "?"}  launches ${cfg?.paused ? "PAUSED ✗" : "open ✓"}`);
  const isPublisher = cfg?.publishers?.some((k: PublicKey) => k.equals(dev.publicKey));
  info(`publisher allowlist includes creator wallet: ${isPublisher ? "yes ✓" : "NO ✗ (open_round would fail)"}`);
  const ok = !!progInfo && !!cfg && !cfg.paused && isPublisher && devSol >= MIN_DEV_SOL * LAMPORTS_PER_SOL;
  console.log(`\n  storyboard (${STORYBOARD.length} steps, ~3–4 min with ${PAUSE_MS / 1000 || 5} s pauses):`);
  STORYBOARD.forEach(([t, s], i) => console.log(`   ${String(i + 1).padStart(2)}. ${t.padEnd(22)} ${s}`));
  if (DRY_RUN) {
    console.log(`\n  ${ok ? "all checks passed — run `scripts/demo-video.sh start` to record" : "checks FAILED — fix the ✗ lines above before recording"}\n`);
    process.exit(ok ? 0 : 1);
  }
  if (!ok) throw new Error("prerequisites failed (see ✗ above)");
  const feePct = cfg.platformFeeBps / 100, poolPct = 100 - feePct;
  await pause();

  // ---- accounts ----
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const escrowTa = escrowAta(escrow, mint);
  const buyer = buyerPda(mint, program.programId);
  const buyerTa = baseAtaOf(buyer, mint);
  const feeAuthority = feeAuthorityPda(mint, program.programId);
  const sharingConfig = sharingConfigPda(mint);
  const pa = pumpAccounts(mint, dev.publicKey, feeAuthority);
  const paS = pumpAccounts(mint, dev.publicKey, sharingConfig);
  const pb = pumpAccounts(mint, buyer, sharingConfig);
  const platformWallet = cfg.platformFeeWallet as PublicKey;
  const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const coinAta = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
  const wsolAta = (owner: PublicKey) => getAssociatedTokenAddressSync(WSOL, owner, true, TOKEN);
  const wallets = BUYERS.map(() => Keypair.generate());
  const nameOf = (k: string) => { const i = wallets.findIndex((w) => w.publicKey.toBase58() === k); return i >= 0 ? BUYERS[i] : short(k); };
  const signerOf = (k: string) => wallets.find((w) => w.publicKey.toBase58() === k)!;

  const coinBal = async (owner: PublicKey) => {
    try { return BigInt((await conn.getTokenAccountBalance(coinAta(owner), "confirmed")).value.amount); } catch { return 0n; }
  };
  const lamports = async (k: PublicKey) => BigInt(await conn.getBalance(k, "confirmed"));
  const escrowState = async () => (await program.account.escrow.fetch(escrow, "confirmed")) as any;
  const poolOf = (st: any) => BigInt(st.escrowed.toString()) - BigInt(st.allocated.toString());
  const errText = (e: any) => String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);

  async function send(ixs: TransactionInstruction[], payer = dev, extra: Keypair[] = []) {
    for (let i = 0; ; i++) {
      try {
        const bh = await conn.getLatestBlockhash("confirmed");
        const t = new Transaction({ ...bh, feePayer: payer.publicKey }).add(...ixs);
        return await sendAndConfirmTransaction(conn, t, [payer, ...extra], { commitment: "confirmed", skipPreflight: false, maxRetries: 5 });
      } catch (e: any) {
        if (i >= 6 || !/Blockhash not found|timed out|429|Too Many Requests|block height exceeded/i.test(String(e?.message ?? e))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  let lut: PublicKey;
  async function sendV0(ixs: TransactionInstruction[], signers: Keypair[] = []) {
    for (let i = 0; ; i++) {
      try {
        const lutAcc = (await conn.getAddressLookupTable(lut, { commitment: "confirmed" })).value!;
        const bh = await conn.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
          payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs],
        }).compileToV0Message([lutAcc]);
        const t = new VersionedTransaction(msg);
        return await provider.sendAndConfirm(t, signers, { commitment: "confirmed", skipPreflight: false, maxRetries: 10 });
      } catch (e: any) {
        if (i >= 5 || !/Blockhash not found|timed out|429|Too Many Requests|invalid index|block height exceeded/i.test(String(e?.message ?? e))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  const rpc = (m: any) => m.rpc(provider.opts) as Promise<string>;
  const t0 = Date.now();

  // ---- lookup table (silent: plumbing, not part of the story) ----
  {
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({ authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot });
    lut = addr;
    const sfs = setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, platformWallet);
    const keys = [...Object.values(pa) as PublicKey[], ...Object.values(paS) as PublicKey[], ...Object.values(pb) as PublicKey[],
      ...Object.values(sfs) as PublicKey[],
      escrow, escrowTa, mint, dev.publicKey, buyer, buyerTa, manualPda, manualAta, configPda, feeAuthority, sharingConfig,
      SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({ payer: dev.publicKey, authority: dev.publicKey, lookupTable: lut, addresses: uniq.slice(i, i + 18) })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(lut)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1500);
  }

  // ---- 1. launch ----
  await heading("Launch", `Create the coin on pump.fun, buy ${Number(LAUNCH_TOKENS) / 1e6}M as the creator, lock 30% of that buy — one transaction`);
  const AMOUNT = LAUNCH_TOKENS * DEC;
  {
    const ix = await program.methods
      .launch("Fair Launch Demo", "FAIR", "https://example.com/fair.json",
              new BN(AMOUNT.toString()), new BN(2.5 * LAMPORTS_PER_SOL), Array(32).fill(0), 0, HOLDER_BPS, false)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda, escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta, feeAuthority,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();
    const before: Bal = { "creator coins": 0n, "escrow pool": 0n };
    tx("launch (create_v2 + buy_v2 + lock)", await sendV0([ix], [mintKp]));
    const st = await escrowState();
    info(`coin    ${mint.toBase58()}\n    ${addrLink(mint)}\n    https://pump.fun/coin/${mint.toBase58()}`);
    info(`escrow  ${escrow.toBase58()} (program account — no private key exists)\n    ${addrLink(escrow)}`);
    info(`lock = ${st.escrowed.toString() === "0" ? "?" : `${HOLDER_BPS / 100}% of the creator's buy`}; the creator is excluded from every distribution`);
    await diff(before, { "creator coins": await coinBal(dev.publicKey), "escrow pool": poolOf(st) }, tok);
    // the keeper's first look records the baseline the volume trigger measures from
    if ((cfg.platform as PublicKey).equals(dev.publicKey)) {
      await rpc(program.methods.setDelayWindow(new BN(DELAY_WINDOW)).accountsPartial({ platform: dev.publicKey, escrow }));
    } else {
      info("wallet is not the platform key: delay window stays at the production 60 minutes — the wait in step 7 can be long");
    }
    const triggerAccounts = { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES };
    tx("check_trigger — keeper records the market-cap baseline", await rpc(program.methods.checkTrigger().accountsPartial(triggerAccounts)));
    const st2 = await escrowState();
    info(`market cap ${sol(st2.lastMilestoneMcap.toNumber())}; volume trigger needs 1% of that in trades; delay window ${(cfg.platform as PublicKey).equals(dev.publicKey) ? `shortened to ~${Math.round(DELAY_WINDOW * 0.4)} s for the camera (production: 60 min)` : "60 min (production value)"}`);
  }
  const triggerAccounts = { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES };

  // ---- 2. fee sharing ----
  await heading("Fee sharing", `pump.fun's creator fee for this coin is split on pump itself: ${poolPct}% escrow, ${feePct}% platform — fixed for the life of the coin`);
  {
    tx("setup_fee_sharing", await program.methods.setupFeeSharing()
      .accountsPartial(setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, platformWallet))
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })])
      .rpc(provider.opts));
    info(`pump fee-sharing config ${sharingConfig.toBase58()}\n    ${addrLink(sharingConfig)}`);
    info(`the ${feePct}% is the platform's only income; the locked pool is never touched`);
    await pause();
  }

  // ---- 3. three buyers ----
  await heading("Three buyers", `${BUYERS.join(", ")} buy from pump.fun like anyone else — the creator fee accrues in pump's vault`);
  {
    for (const w of wallets) {
      await send([
        SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: w.publicKey, lamports: FUND_SOL * LAMPORTS_PER_SOL }),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, coinAta(w.publicKey), w.publicKey, mint, TOKEN_2022),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, wsolAta(w.publicKey), w.publicKey, WSOL, TOKEN),
      ]);
    }
    const vaultBefore = await lamports(paS.creatorVault);
    const before: Bal = {};
    for (const w of wallets) before[`${nameOf(w.publicKey.toBase58())} coins`] = 0n;
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const s = await send([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        directBuyIx(mint, w.publicKey, sharingConfig, BigInt(Math.round(BUYS[i] * LAMPORTS_PER_SOL)), 1n),
      ], w);
      tx(`${BUYERS[i]} (${short(w.publicKey)}) buys with ${BUYS[i]} SOL → ${tok(await coinBal(w.publicKey))}`, s);
      await sleep(800); // different holding times
    }
    const after: Bal = {};
    for (const w of wallets) after[`${nameOf(w.publicKey.toBase58())} coins`] = await coinBal(w.publicKey);
    await diff(before, after, tok);
    await diff({ "creator fee vault": vaultBefore }, { "creator fee vault": await lamports(paS.creatorVault) }, sol);
  }

  // ---- 4. collect fees ----
  await heading("Collect fees", `The accrued creator fee is paid out by pump: ${poolPct}% to the escrow, ${feePct}% to the platform wallet`);
  {
    const before: Bal = { "creator fee vault": await lamports(paS.creatorVault), "escrow SOL": await lamports(escrow), "platform wallet": await lamports(platformWallet) };
    tx("collect_fees", await program.methods.collectFees()
      .accountsPartial(collectFeesAccounts(mint, escrow, program.programId, dev.publicKey))
      .remainingAccounts(shareholderMetas(feeAuthority, platformWallet, cfg.platformFeeBps))
      .rpc(provider.opts));
    await diff(before, { "creator fee vault": await lamports(paS.creatorVault), "escrow SOL": await lamports(escrow), "platform wallet": await lamports(platformWallet) }, sol);
  }

  // ---- 5. buyback ----
  await heading("Buyback", "Escrow SOL is converted into the coin — at most 0.5% of the curve's reserves per call, one call per slot, priced on chain");
  {
    info(`three small buys leave the fee under the 0.01 SOL buyback minimum, so ${TOPUP_SOL} SOL is added to the escrow for the camera (in production the creator fee is the only source)`);
    tx(`${TOPUP_SOL} SOL top-up to the escrow`, await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: escrow, lamports: TOPUP_SOL * LAMPORTS_PER_SOL })]));
    const st0 = await escrowState();
    const solBefore = await lamports(escrow);
    const before: Bal = { "escrow pool (coins)": poolOf(st0) };
    const buybackAccounts = {
      payer: dev.publicKey, escrow, buyer, mint, buyerTokenAccount: buyerTa, escrowTokenAccount: escrowTa,
      global: pb.global, quoteMint: WSOL, quoteTokenProgram: TOKEN,
      feeRecipient: pb.feeRecipient, associatedQuoteFeeRecipient: pb.associatedQuoteFeeRecipient,
      buybackFeeRecipient: pb.buybackFeeRecipient, associatedQuoteBuybackFeeRecipient: pb.associatedQuoteBuybackFeeRecipient,
      bondingCurve: pb.bondingCurve, associatedBaseBondingCurve: pb.associatedBaseBondingCurve,
      associatedQuoteBondingCurve: pb.associatedQuoteBondingCurve, associatedQuoteUser: pb.associatedQuoteUser,
      creatorVault: pb.creatorVault, associatedCreatorVault: pb.associatedCreatorVault,
      sharingConfig: pb.sharingConfig, globalVolumeAccumulator: pb.globalVolumeAccumulator,
      userVolumeAccumulator: pb.userVolumeAccumulator, associatedUserVolumeAccumulator: pb.associatedUserVolumeAccumulator,
      feeConfig: pb.feeConfig, feeProgram: pb.feeProgram, eventAuthority: pb.eventAuthority, pumpProgram: pb.pumpProgram,
      baseTokenProgram: TOKEN_2022, associatedTokenProgram: pb.associatedTokenProgram, systemProgram: SystemProgram.programId,
    };
    let lastSpendSlot = 0;
    const pastSlot = async (slot: number) => { while ((await conn.getSlot("processed")) <= slot) await sleep(300); };
    for (let i = 0; i < BUYBACK_CHUNKS; i++) {
      const st = await escrowState();
      lastSpendSlot = Math.max(lastSpendSlot, Number(st.lastBuybackSlot));
      await pastSlot(lastSpendSlot);
      const ix = await program.methods.buyback().accountsPartial(buybackAccounts).instruction();
      let s: string | null = null; let ev: ReturnType<typeof decodeBuybackDone> = null;
      for (let attempt = 0; attempt < 6 && !s; attempt++) {
        try {
          s = await sendV0([ix]);
          const t = await conn.getTransaction(s, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
          lastSpendSlot = Math.max(lastSpendSlot, t?.slot ?? 0);
          ev = decodeBuybackDone(t?.meta?.logMessages ?? []);
        } catch (e: any) {
          if (!/BuybackSameSlot|0x1772/.test(errText(e))) throw e;
          info("second buyback in the same slot rejected (BuybackSameSlot) — waiting for the next slot");
          await pastSlot(await conn.getSlot("processed"));
        }
      }
      if (!s || !ev || ev.spent === 0n) { info("below the buyback minimum, stopping"); break; }
      tx(`chunk ${i + 1}: spent ${sol(ev.spent)} → +${tok(ev.bought)} coins, ${sol(ev.left)} left for later slots`, s);
    }
    const st1 = await escrowState();
    await diff({ "escrow SOL": solBefore }, { "escrow SOL": await lamports(escrow) }, sol);
    await diff(before, { "escrow pool (coins)": poolOf(st1) }, tok);
  }

  // ---- 6. volume trigger ----
  await heading("Volume trigger", "Trading volume since launch passed 1% of market cap: the program releases 1% of the pool at a random moment within the delay window");
  let fireSlot = 0;
  {
    tx("check_trigger — anyone may call it", await rpc(program.methods.checkTrigger().accountsPartial(triggerAccounts)));
    const st = await escrowState();
    if (!st.armed) throw new Error("trigger did not arm — not enough volume?");
    fireSlot = st.fireSlot.toNumber();
    const now = await conn.getSlot("confirmed");
    info(`kind: ${st.armedKind === 1 ? "volume (1% of pool)" : "market-cap milestone (5% of pool)"}; release: ${tok(st.authorized.toString())} coins`);
    info(`fires at slot ${fireSlot} — about ${Math.max(0, Math.round((fireSlot - now) * 0.4))} s from now; nobody chose that moment, nobody can front-run it`);
    if (now < fireSlot) {
      try {
        await rpc(program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve }));
        info("WARNING: early fire accepted (unexpected)");
      } catch (e: any) {
        info(/TooEarly/.test(errText(e)) ? "an early fire_trigger is rejected (TooEarly)" : `early fire rejected: ${errText(e).slice(0, 60)}`);
      }
    }
    await pause();
  }

  // ---- 7. fire ----
  await heading("Distribution unlocked", "After the delay, fire_trigger (permissionless) moves the released slice into the claimable balance");
  {
    let now = await conn.getSlot("confirmed");
    while (now < fireSlot) { process.stdout.write(`\r    waiting… ${Math.max(0, Math.round((fireSlot - now) * 0.4))} s   `); await sleep(1000); now = await conn.getSlot("confirmed"); }
    process.stdout.write("\r" + " ".repeat(30) + "\r");
    const st0 = await escrowState();
    const before: Bal = { "claimable (pending)": BigInt(st0.pending.toString()) };
    tx("fire_trigger", await rpc(program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve })));
    const st = await escrowState();
    await diff(before, { "claimable (pending)": BigInt(st.pending.toString()) }, tok);
  }

  // ---- 8. snapshot ----
  await heading("Snapshot", "The open-source indexer replays every token account to the snapshot slot and splits the release pro rata to balance × holding time");
  const stFired = await escrowState();
  const released = BigInt(stFired.pending.toString());
  const snapSlot = await conn.getSlot("confirmed");
  const snap = await snapshot(RPC_URL, mint.toBase58(), snapSlot, program.programId, [], released);
  {
    const sorted = [...snap.leaves].sort((x: any, y: any) => (BigInt(y.weight) > BigInt(x.weight) ? 1 : -1));
    for (const l of sorted) {
      const wPct = (Number(BigInt(l.weight) * 10000n / BigInt(snap.totalWeight)) / 100).toFixed(1);
      const sPct = (Number(BigInt(l.amount) * 10000n / released) / 100).toFixed(1);
      info(`${nameOf(l.holder).padEnd(6)} holds ${tok(l.balance).padStart(8)} for ${String(Math.round(l.heldSlots * 0.4)).padStart(3)} s → weight ${wPct.padStart(5)}% → share ${tok(l.amount)} (${sPct}%)`);
    }
    info(`creator wallet is treasury — excluded; snapshot slot ${snap.snapshotSlot}; root ${snap.root.slice(0, 16)}…`);
    info(`anyone can rebuild this: npx ts-node indexer/snapshot.ts reproduce (same inputs → same root)`);
    await pause();
  }

  // ---- 9. open round ----
  await heading("Round on chain", "Only the Merkle root, the snapshot slot and the released amount go on chain — who gets what is now fixed and reproducible");
  const round = PublicKey.findProgramAddressSync([Buffer.from("round"), escrow.toBuffer(), Buffer.from(new Uint32Array([0]).buffer)], program.programId)[0];
  {
    tx("open_round", await rpc(program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total), snap.leaves.length, new BN(snap.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })));
    const r: any = await program.account.round.fetch(round, "confirmed");
    info(`round ${round.toBase58()}\n    ${addrLink(round)}`);
    info(`${r.holderCount} holders, ${tok(r.total.toString())} coins to distribute, snapshot slot ${r.snapshotSlot.toNumber()}`);
    await pause();
  }

  // ---- 10. claims ----
  await heading("Claims", "Each holder claims with a proof from their own wallet; the program checks the proof, the cap, and that they still hold their position");
  {
    const claimAccounts = (h: PublicKey) => ({
      holder: h, escrow, round, mint, escrowTokenAccount: escrowTa, holderTokenAccount: coinAta(h),
      receipt: PublicKey.findProgramAddressSync([Buffer.from("receipt"), round.toBuffer(), h.toBuffer()], program.programId)[0],
      bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
    });
    const { layers } = buildTree(snap.leaves);
    const before: Bal = {};
    for (const w of wallets) before[`${nameOf(w.publicKey.toBase58())} coins`] = await coinBal(w.publicKey);
    before["escrow pool (coins)"] = poolOf(await escrowState());
    for (const leaf of snap.leaves) {
      const w = signerOf(leaf.holder);
      const s = await rpc(program.methods
        .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((x) => [...x]))
        .accountsPartial(claimAccounts(w.publicKey)).signers([w]));
      tx(`${nameOf(leaf.holder)} claims +${tok(leaf.amount)}`, s);
    }
    const first = snap.leaves[0]; const w0 = signerOf(first.holder);
    try {
      await rpc(program.methods
        .claimShare(first.index, new BN(first.balance), new BN(first.amount), proofFor(layers, first.index).map((x) => [...x]))
        .accountsPartial(claimAccounts(w0.publicKey)).signers([w0]));
      info("WARNING: second claim accepted (unexpected)");
    } catch {
      info(`${nameOf(first.holder)} tries again → rejected (receipt already exists)`);
    }
    const after: Bal = {};
    for (const w of wallets) after[`${nameOf(w.publicKey.toBase58())} coins`] = await coinBal(w.publicKey);
    after["escrow pool (coins)"] = poolOf(await escrowState());
    await diff(before, after, tok);
    const rr: any = await program.account.round.fetch(round, "confirmed");
    info(`${rr.claimedCount}/${rr.holderCount} claimed, ${tok(rr.claimedAmount.toString())} / ${tok(rr.total.toString())}; the rest of the pool waits for the next trigger`);
  }

  // ---- 11. wrap-up ----
  await heading("Wrap-up", "Throwaway wallets return their SOL; the creator's position is sold back to the curve (devnet housekeeping)");
  {
    let swept = 0;
    for (const w of wallets) {
      const bal = await conn.getBalance(w.publicKey, "confirmed");
      const keep = 5_000 + 890_880;
      if (bal <= keep) continue;
      try { await send([SystemProgram.transfer({ fromPubkey: w.publicKey, toPubkey: dev.publicKey, lamports: bal - keep })], w); swept += bal - keep; }
      catch (e: any) { info(`sweep ${short(w.publicKey)} skipped: ${String(e?.message ?? e).slice(0, 60)}`); }
    }
    try { swept += await sellBackAll(conn, dev, mint, sharingConfig); } catch (e: any) { info(`sell-back skipped: ${String(e?.message ?? e).slice(0, 60)}`); }
    const st = await escrowState();
    const devEnd = await conn.getBalance(dev.publicKey, "confirmed");
    console.log(`\n${line()}`);
    info(`locked at launch ${tok(st.escrowed.toString())} · fees collected ${sol(st.feesCollected.toNumber())} · buyback ${sol(st.buybackSpent.toNumber())} → +${tok(st.buybackTokens.toString())} coins`);
    info(`distributed this round ${tok(st.allocated.toString())} · still locked ${tok(poolOf(st))} · nobody can withdraw it`);
    info(`coin ${addrLink(mint)}`);
    info(`escrow ${addrLink(escrow)}`);
    info(`devnet SOL spent net ${sol(devSol - devEnd)} (swept back ${sol(swept)}) · ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(line());
  }
}

main().catch((e) => { console.error("\ndemo failed:", e?.message ?? e, e?.logs ?? ""); process.exit(1); });
