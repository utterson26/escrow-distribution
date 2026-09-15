/**
 * Screen-recording demo, devnet only, against the real pump.fun devnet program.
 * Meant to be read on camera: every step prints an English heading, waits a
 * beat, sends its transactions with explorer links, and shows the balances it
 * changed as before → after. Runs in about three to four minutes.
 *
 *   Auto coin:   launch (30% of supply locked, creator keeps 2%) → three buyers
 *                (1% / 2% / 3% of supply) → collect fees → buyback → volume
 *                trigger → random delay → snapshot + pro-rata shares → round → claims
 *   Manual coin: launch in Manual mode → the same buyers → the dev releases a
 *                slice with dev_distribute (no rule, no delay) → snapshot → round → claims
 *
 * Never run this file directly; `scripts/demo-video.sh start` is the entry
 * point. `--dry-run` checks the prerequisites and prints the storyboard
 * without sending anything (that is what the .sh does without `start`).
 *
 * Costs about 1.3 SOL of devnet SOL net (measured 1.29): two launches each lock 30% of supply for good; the throwaway wallets are swept
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
const FUND_SOL = 0.2;
const BUYERS = ["Alice", "Bob", "Carol"];
/** pump mints a fixed 1B; every share below is a share of that total supply */
const SUPPLY = 1_000_000_000n;
/** holder pool and what the creator keeps, in % of total supply (no fixed list here) */
const POOL_PCT = 30, KEEP_PCT = 2;
/** what each buyer takes, in % of total supply */
const BUYER_PCT = [1, 2, 3];
/** the creator's launch buy: pool + keep = 32% of supply (≈ 0.43 SOL on the devnet curve) */
const LAUNCH_TOKENS = (SUPPLY * BigInt(POOL_PCT + KEEP_PCT)) / 100n;
/** the program takes the lock as a share of the buy: 30 / 32 of it */
const HOLDER_BPS = Math.round((POOL_PCT / (POOL_PCT + KEEP_PCT)) * 10_000);
/** Manual act: share of the pool the dev releases in one call */
const MANUAL_RELEASE_PCT = 3;
const MODE_AUTO = 0, MODE_MANUAL = 1;
/**
 * Eligibility floor used on devnet. The devnet curve starts at 1 SOL virtual,
 * so 1% of supply is worth ~0.02 SOL — under the production floor of 0.1 SOL.
 * The platform lowers it (proposal + delay, delay narrowed by the test knob)
 * so the buyers' positions count; production keeps 0.1 SOL.
 */
const DEVNET_FLOOR_LAMPORTS = 10_000_000; // 0.01 SOL
/** random-delay window in slots: up to ~40 s on camera (production: 60 minutes) */
const DELAY_WINDOW = 100;
/** fees from three small buys are below the 0.01 SOL buyback minimum; this makes the buyback visible */
const TOPUP_SOL = 0.1;
const BUYBACK_CHUNKS = 3;
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const DEC = 1_000_000n;
const MIN_DEV_SOL = 2;

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
  ["Launch (Auto)", `create the coin on pump.fun, creator buys ${POOL_PCT + KEEP_PCT}% of supply, ${POOL_PCT}% of supply is locked in a program-owned escrow, creator keeps ${KEEP_PCT}% — one transaction`],
  ["Fee sharing", "pump.fun's creator fee for this coin is split on pump itself: escrow share / platform share (config, 10% by default)"],
  ["Three buyers", `${BUYERS.join(", ")} buy ${BUYER_PCT.join("% / ")}% of supply from pump.fun; the creator fee accrues`],
  ["Collect fees", "the accrued creator fee is paid out: the escrow's share and the platform's share"],
  ["Buyback", `escrow SOL is converted into the coin in slot-sized chunks (≤ 0.5% of reserves each); ${TOPUP_SOL} SOL top-up so it shows on camera`],
  ["Volume trigger", "trading volume passed 1% of market cap: 1% of the pool is released after a random delay"],
  ["Distribution unlocked", "fire_trigger (permissionless) after the delay"],
  ["Snapshot", "deterministic holder snapshot, shares pro rata to balance × holding time"],
  ["Round on chain", "Merkle root + snapshot slot + released amount are written on chain"],
  ["Claims", "every holder claims with a proof from their own wallet; a second claim is rejected"],
  ["Launch (Manual)", `a second coin in Manual mode: same ${POOL_PCT}% of supply locked, the automatic rule is off`],
  ["Buyers again", `${BUYERS.join(", ")} buy the same ${BUYER_PCT.join("% / ")}%; volume alone arms nothing`],
  ["Dev releases", `dev_distribute: the creator releases ${MANUAL_RELEASE_PCT}% of the pool — at once, no rule, no delay; only the dev may, and never more than the pool`],
  ["Manual round", "same snapshot, same pro-rata split, same Merkle claims — the round is tagged as dev-released"],
  ["Wrap-up", "throwaway wallets swept back, creator positions sold back to the curve"],
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
  console.log(`\n  storyboard (${STORYBOARD.length} steps, ~5–6 min with ${PAUSE_MS / 1000 || 5} s pauses):`);
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
  /** live curve reserves, to price a buy of an exact share of supply */
  const curveOf = async (bc: PublicKey) => {
    const d = (await conn.getAccountInfo(bc, "confirmed"))!.data;
    return { vTok: d.readBigUInt64LE(8), vSol: d.readBigUInt64LE(16) };
  };
  /** SOL to send with buy_exact_quote_in so that about `tokens` come out: curve price + pump's 1% fees + a hair of slack */
  const solForTokens = (c: { vTok: bigint; vSol: bigint }, tokens: bigint) => {
    const base = (c.vSol * tokens) / (c.vTok - tokens) + 1n;
    return base + (base * 130n) / 10_000n;
  };
  const pctOfSupply = (tokens: bigint | string) => `${(Number(BigInt(tokens.toString())) / Number(SUPPLY * DEC) * 100).toFixed(2)}% of supply`;
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
  await heading("Launch (Auto)", `Create the coin on pump.fun, buy ${POOL_PCT + KEEP_PCT}% of supply as the creator, lock ${POOL_PCT}% of supply for holders, keep ${KEEP_PCT}% — one transaction`);
  const AMOUNT = LAUNCH_TOKENS * DEC;
  {
    const ix = await program.methods
      .launch("Fair Launch Demo", "FAIR", "https://example.com/fair.json",
              new BN(AMOUNT.toString()), new BN(2.5 * LAMPORTS_PER_SOL), Array(32).fill(0), 0, HOLDER_BPS, false, MODE_AUTO)
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
    info(`locked ${tok(st.escrowed.toString())} = ${pctOfSupply(st.escrowed.toString())} · creator keeps ${tok(AMOUNT - BigInt(st.escrowed.toString()))} = ${KEEP_PCT}% · Auto mode: the volume / milestone rule releases, the creator has no say`);
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

  // ---- eligibility floor for the devnet curve (platform only) ----
  let floorLamports = BigInt(cfg.minPositionLamports.toString()) || 100_000_000n;
  if ((cfg.platform as PublicKey).equals(dev.publicKey) && floorLamports > BigInt(DEVNET_FLOOR_LAMPORTS)) {
    const platformOnly = { platform: dev.publicKey, config: configPda };
    await rpc(program.methods.setFeeDelay(new BN(5)).accountsPartial(platformOnly));
    await rpc(program.methods.proposeMinPosition(new BN(DEVNET_FLOOR_LAMPORTS)).accountsPartial(platformOnly));
    let c: any = await program.account.config.fetch(configPda, "confirmed");
    while ((await conn.getSlot("confirmed")) < c.minPositionEffectiveSlot.toNumber()) await sleep(400);
    await rpc(program.methods.applyMinPosition().accountsPartial({ config: configPda }));
    c = await program.account.config.fetch(configPda, "confirmed");
    floorLamports = BigInt(c.minPositionLamports.toString());
    info(`eligibility floor lowered to ${sol(floorLamports)} for the devnet curve (production: 0.1 SOL; a 1%-of-supply position is worth ~0.02 SOL here) — proposal + delay, delay narrowed by the platform's test knob`);
  }

  // ---- 3. three buyers ----
  await heading("Three buyers", `${BUYERS.join(", ")} buy ${BUYER_PCT.join("% / ")}% of supply from pump.fun like anyone else — the creator fee accrues in pump's vault`);
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
      const want = (SUPPLY * DEC * BigInt(BUYER_PCT[i])) / 100n;
      const spend = solForTokens(await curveOf(pa.bondingCurve), want);
      const s = await send([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        directBuyIx(mint, w.publicKey, sharingConfig, spend, 1n),
      ], w);
      tx(`${BUYERS[i]} (${short(w.publicKey)}) buys ${BUYER_PCT[i]}% of supply for ${sol(spend)} → ${tok(await coinBal(w.publicKey))}`, s);
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
  const snap = await snapshot(RPC_URL, mint.toBase58(), snapSlot, program.programId, [], released, floorLamports);
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

  // ---- 11. Manual coin: launch ----
  const mintKpM = Keypair.generate();
  const mintM = mintKpM.publicKey;
  const escrowM = escrowPda(mintM, program.programId);
  const escrowTaM = escrowAta(escrowM, mintM);
  const feeAuthorityM = feeAuthorityPda(mintM, program.programId);
  const paM = pumpAccounts(mintM, dev.publicKey, feeAuthorityM);
  const manualPdaM = PublicKey.findProgramAddressSync([Buffer.from("manual"), mintM.toBuffer()], program.programId)[0];
  const manualAtaM = getAssociatedTokenAddressSync(mintM, manualPdaM, true, TOKEN_2022);
  const coinAtaM = (owner: PublicKey) => getAssociatedTokenAddressSync(mintM, owner, true, TOKEN_2022);
  const coinBalM = async (owner: PublicKey) => {
    try { return BigInt((await conn.getTokenAccountBalance(coinAtaM(owner), "confirmed")).value.amount); } catch { return 0n; }
  };
  const escrowStateM = async () => (await program.account.escrow.fetch(escrowM, "confirmed")) as any;
  await heading("Launch (Manual)", `A second coin, Manual mode: the same ${POOL_PCT}% of supply is locked, but the volume / milestone rule is off — only the creator's dev_distribute releases, into the same rounds`);
  {
    // its own lookup table (the launch touches 39 accounts)
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({ authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot });
    const keys = [...Object.values(paM) as PublicKey[], escrowM, escrowTaM, mintM, dev.publicKey, manualPdaM, manualAtaM, configPda, feeAuthorityM,
                  SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({ payer: dev.publicKey, authority: dev.publicKey, lookupTable: addr, addresses: uniq.slice(i, i + 18) })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(addr)).value;
      if (acc && acc.state.addresses.length >= uniq.length && (await conn.getSlot("confirmed")) > Number(acc.state.lastExtendedSlot)) break;
      await sleep(500);
    }
    await sleep(1500);
    const ix = await program.methods
      .launch("Manual Mode Demo", "MANL", "https://example.com/manl.json",
              new BN(AMOUNT.toString()), new BN(2.5 * LAMPORTS_PER_SOL), Array(32).fill(0), 0, HOLDER_BPS, false, MODE_MANUAL)
      .accountsPartial({
        dev: dev.publicKey, mint: mintM, escrow: escrowM, config: configPda, escrowTokenAccount: escrowTaM,
        manualAuthority: manualPdaM, manualTokenAccount: manualAtaM, feeAuthority: feeAuthorityM,
        ...paM, systemProgram: SystemProgram.programId,
      }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(addr, { commitment: "confirmed" })).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({ payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix] }).compileToV0Message([lutAcc]);
    const sig = await provider.sendAndConfirm(new VersionedTransaction(msg), [mintKpM], { commitment: "confirmed", skipPreflight: false, maxRetries: 10 });
    tx("launch (Manual mode)", sig);
    const st = await escrowStateM();
    info(`coin    ${mintM.toBase58()}\n    ${addrLink(mintM)}`);
    info(`locked ${tok(st.escrowed.toString())} = ${pctOfSupply(st.escrowed.toString())} · mode ${st.distributionMode === MODE_MANUAL ? "Manual" : "?"} · fixed at launch, no instruction changes it`);
    if ((cfg.platform as PublicKey).equals(dev.publicKey)) {
      await rpc(program.methods.setDelayWindow(new BN(DELAY_WINDOW)).accountsPartial({ platform: dev.publicKey, escrow: escrowM }));
    }
    tx("check_trigger — baseline", await rpc(program.methods.checkTrigger().accountsPartial({ escrow: escrowM, bondingCurve: paM.bondingCurve, slotHashes: SLOT_HASHES })));
    await pause();
  }

  // ---- 12. Manual coin: buyers ----
  await heading("Buyers again", `${BUYERS.join(", ")} buy the same ${BUYER_PCT.join("% / ")}% of supply — on a Manual coin that volume arms nothing`);
  {
    for (const w of wallets) {
      await send([createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, coinAtaM(w.publicKey), w.publicKey, mintM, TOKEN_2022)]);
    }
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const want = (SUPPLY * DEC * BigInt(BUYER_PCT[i])) / 100n;
      const spend = solForTokens(await curveOf(paM.bondingCurve), want);
      const s = await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                            directBuyIx(mintM, w.publicKey, feeAuthorityM, spend, 1n)], w);
      tx(`${BUYERS[i]} buys ${BUYER_PCT[i]}% of supply for ${sol(spend)} → ${tok(await coinBalM(w.publicKey))}`, s);
      await sleep(800);
    }
    tx("check_trigger — the same volume that armed the Auto coin", await rpc(program.methods.checkTrigger().accountsPartial({ escrow: escrowM, bondingCurve: paM.bondingCurve, slotHashes: SLOT_HASHES })));
    const st = await escrowStateM();
    info(`armed: ${st.armed ? "YES (unexpected)" : "no — Manual mode never arms; the pool waits for the creator"}`);
    await pause();
  }

  // ---- 13. Manual coin: dev releases ----
  await heading("Dev releases", `dev_distribute: the creator releases ${MANUAL_RELEASE_PCT}% of the pool at once — no rule, no delay; only the dev may call it, never more than the pool, and the tokens can only leave through holders' claims`);
  let releasedM = 0n;
  {
    const st0 = await escrowStateM();
    const amount = (poolOf(st0) * BigInt(MANUAL_RELEASE_PCT)) / 100n;
    try {
      await rpc(program.methods.devDistribute(new BN(amount.toString())).accountsPartial({ dev: wallets[0].publicKey, escrow: escrowM }).signers([wallets[0]]));
      info("WARNING: a holder's dev_distribute was accepted (unexpected)");
    } catch (e: any) { info(`${BUYERS[0]} tries dev_distribute → rejected (${/NotDev|2003|ConstraintRaw/.test(errText(e)) ? "not the dev" : errText(e).slice(0, 40)})`); }
    try {
      await rpc(program.methods.devDistribute(new BN((poolOf(st0) + 1n).toString())).accountsPartial({ dev: dev.publicKey, escrow: escrowM }));
      info("WARNING: over-pool release accepted (unexpected)");
    } catch (e: any) { info(`creator asks for more than the pool → rejected (${/OverPool/.test(errText(e)) ? "OverPool" : errText(e).slice(0, 40)})`); }
    const before: Bal = { "claimable (pending)": BigInt(st0.pending.toString()), "escrow pool (coins)": poolOf(st0) };
    tx(`dev_distribute ${tok(amount)} (${MANUAL_RELEASE_PCT}% of the pool)`, await rpc(program.methods.devDistribute(new BN(amount.toString())).accountsPartial({ dev: dev.publicKey, escrow: escrowM })));
    const st = await escrowStateM();
    releasedM = BigInt(st.pending.toString());
    await diff(before, { "claimable (pending)": releasedM, "escrow pool (coins)": poolOf(st) }, tok);
    info("the pool only shrinks by what a round will hand to holders; nothing moved to the creator");
  }

  // ---- 14. Manual coin: round + claims ----
  await heading("Manual round", "The same indexer snapshot, the same pro-rata split and Merkle claims; the round records that the dev released it");
  {
    const snapSlotM = await conn.getSlot("confirmed");
    const snapM = await snapshot(RPC_URL, mintM.toBase58(), snapSlotM, program.programId, [], releasedM, floorLamports);
    for (const l of [...snapM.leaves].sort((x: any, y: any) => (BigInt(y.weight) > BigInt(x.weight) ? 1 : -1))) {
      const sPct = (Number(BigInt(l.amount) * 10000n / releasedM) / 100).toFixed(1);
      info(`${nameOf(l.holder).padEnd(6)} holds ${tok(l.balance).padStart(8)} → share ${tok(l.amount)} (${sPct}%)`);
    }
    info(`creator excluded; ${snapM.leaves.length} holders; root ${snapM.root.slice(0, 16)}…`);
    const roundM = PublicKey.findProgramAddressSync([Buffer.from("round"), escrowM.toBuffer(), Buffer.from(new Uint32Array([0]).buffer)], program.programId)[0];
    tx("open_round", await rpc(program.methods
      .openRound(0, [...Buffer.from(snapM.root, "hex")], new BN(releasedM.toString()), new BN(snapM.total), snapM.leaves.length, new BN(snapM.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow: escrowM, round: roundM, systemProgram: SystemProgram.programId })));
    const r: any = await program.account.round.fetch(roundM, "confirmed");
    info(`round ${roundM.toBase58()} · trigger kind ${r.triggerKind === 3 ? "dev (Manual)" : r.triggerKind} · ${r.holderCount} holders · ${tok(r.total.toString())} coins\n    ${addrLink(roundM)}`);
    const { layers } = buildTree(snapM.leaves);
    const claimAccountsM = (h: PublicKey) => ({
      holder: h, escrow: escrowM, round: roundM, mint: mintM, escrowTokenAccount: escrowTaM, holderTokenAccount: coinAtaM(h),
      receipt: PublicKey.findProgramAddressSync([Buffer.from("receipt"), roundM.toBuffer(), h.toBuffer()], program.programId)[0],
      bondingCurve: paM.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
    });
    const before: Bal = {};
    for (const w of wallets) before[`${nameOf(w.publicKey.toBase58())} coins`] = await coinBalM(w.publicKey);
    for (const leaf of snapM.leaves) {
      const w = signerOf(leaf.holder);
      tx(`${nameOf(leaf.holder)} claims +${tok(leaf.amount)}`, await rpc(program.methods
        .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((x) => [...x]))
        .accountsPartial(claimAccountsM(w.publicKey)).signers([w])));
    }
    const after: Bal = {};
    for (const w of wallets) after[`${nameOf(w.publicKey.toBase58())} coins`] = await coinBalM(w.publicKey);
    await diff(before, after, tok);
  }

  // ---- 15. wrap-up ----
  await heading("Wrap-up", "Throwaway wallets return their SOL; the creator's positions are sold back to the curve (devnet housekeeping)");
  {
    let swept = 0;
    for (const w of wallets) {
      const bal = await conn.getBalance(w.publicKey, "confirmed");
      const keep = 5_000 + 890_880;
      if (bal <= keep) continue;
      try { await send([SystemProgram.transfer({ fromPubkey: w.publicKey, toPubkey: dev.publicKey, lamports: bal - keep })], w); swept += bal - keep; }
      catch (e: any) { info(`sweep ${short(w.publicKey)} skipped: ${String(e?.message ?? e).slice(0, 60)}`); }
    }
    // a sell right after the claims can miss a blockhash on devnet; three tries
    const sellBack = async (label: string, m: PublicKey, creator: PublicKey) => {
      for (let i = 0; i < 3; i++) {
        try { swept += await sellBackAll(conn, dev, m, creator); return; }
        catch (e: any) { if (i === 2) info(`sell-back (${label}) skipped: ${String(e?.message ?? e).slice(0, 60)}`); else await sleep(2000); }
      }
    };
    await sellBack("Auto coin", mint, sharingConfig);
    await sellBack("Manual coin", mintM, feeAuthorityM);
    const st = await escrowState();
    const stM = await escrowStateM();
    const devEnd = await conn.getBalance(dev.publicKey, "confirmed");
    console.log(`\n${line()}`);
    info(`locked at launch ${tok(st.escrowed.toString())} · fees collected ${sol(st.feesCollected.toNumber())} · buyback ${sol(st.buybackSpent.toNumber())} → +${tok(st.buybackTokens.toString())} coins`);
    info(`distributed this round ${tok(st.allocated.toString())} · still locked ${tok(poolOf(st))} · nobody can withdraw it`);
    info(`Manual coin: released by the dev ${tok(stM.allocated.toString())} · still locked ${tok(poolOf(stM))}`);
    info(`Auto coin ${addrLink(mint)}`);
    info(`Manual coin ${addrLink(mintM)}`);
    info(`escrow ${addrLink(escrow)}`);
    info(`devnet SOL spent net ${sol(devSol - devEnd)} (swept back ${sol(swept)}) · ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(line());
  }
}

main().catch((e) => { console.error("\ndemo failed:", e?.message ?? e, e?.logs ?? ""); process.exit(1); });
