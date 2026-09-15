/**
 * Random traders for one coin on devnet, so a launch has a market to react to:
 * N throwaway wallets, each buying and selling at random moments (5–30 s
 * apart) for a set number of minutes, within a total SOL budget. Some hold,
 * some trade back and forth, some sell out early. When the run ends (or on
 * Ctrl-C) every wallet sends its SOL back to the funder.
 *
 * Never run this file directly; `scripts/sim-traders.sh <MINT> [options]` is
 * the entry point and documents the options. `--dry-run` prints the cast and
 * the plan without funding anything.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  directBuyIx, directSellIx, baseAtaOf, escrowPda, feeAuthorityPda, sharingConfigPda, patchProvider,
  TOKEN, TOKEN_2022, WSOL,
} from "../tests/pump";

// ---- options -----------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, dflt: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const VALUE_FLAGS = ["--wallets", "--minutes", "--budget", "--delay-window"];
const MINT_ARG = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(argv[i - 1]));
const DRY_RUN = flag("dry-run");
const SWEEP_ONLY = flag("sweep");
const SELL_BACK = flag("sell-back");
const WALLETS = Number(opt("wallets", "15"));
const MINUTES = Number(opt("minutes", "15"));
const BUDGET_SOL = Number(opt("budget", "2"));
const DELAY_WINDOW = Number(opt("delay-window", "100"));
const MIN_GAP_S = 5, MAX_GAP_S = 30;
const RPC_URL = process.env.HELIUS_RPC_URL ?? "";
/** never trade a wallet below this: ATA rent, pump's per-user accounts, fees */
const RESERVE = 0.02 * LAMPORTS_PER_SOL;
/** program eligibility floor is 0.1 SOL; first buys aim a little above it */
const FIRST_BUY_SOL: [number, number] = [0.06, 0.1];
const LATER_BUY_SOL: [number, number] = [0.01, 0.05];

type Persona = "holder" | "trader" | "early-seller";
interface Trader { name: string; kp: Keypair; persona: Persona; funded: number; bought: number; sold: number; trades: number; done: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sol = (l: number | bigint) => `${(Number(l) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const ts = () => new Date().toISOString().slice(11, 19);
const log = (s: string) => console.log(`${ts()}  ${s}`);
const NAMES = ["Ada", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun", "Kai", "Lou", "Mia", "Nico", "Ode", "Pia", "Quin", "Rey", "Sol", "Tia"];

function walletsFile(mint: string) { return path.join(__dirname, "..", `sim-wallets-${mint.slice(0, 8)}.json`); }

async function main() {
  if (!MINT_ARG) throw new Error("usage: scripts/sim-traders.sh <MINT> [--wallets 15] [--minutes 15] [--budget 2] [--dry-run] [--sell-back] [--sweep]");
  const mint = new PublicKey(MINT_ARG);
  if (!RPC_URL) throw new Error("HELIUS_RPC_URL is not set (source ~/.airdrop-launchpad.env)");
  const conn = new Connection(RPC_URL, "confirmed");
  const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));

  const provider = patchProvider(new anchor.AnchorProvider(conn, new anchor.Wallet(funder), { commitment: "confirmed", preflightCommitment: "confirmed" }));
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;
  const escrow = escrowPda(mint, program.programId);
  const esc = await program.account.escrow.fetchNullable(escrow, "confirmed");
  if (!esc) throw new Error(`no launch found for mint ${mint.toBase58()} on this cluster`);
  /** whoever pump sees as the coin creator right now: the fee PDA, or the sharing config once the crank set it up */
  const creatorNow = async () => {
    const st = await program.account.escrow.fetch(escrow, "confirmed");
    return st.feeSharingSet ? sharingConfigPda(mint) : feeAuthorityPda(mint, program.programId);
  };

  // ---- cast ------------------------------------------------------------------
  const file = walletsFile(mint.toBase58());
  let traders: Trader[];
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    traders = saved.map((s: any) => ({ name: s.name, kp: Keypair.fromSecretKey(Uint8Array.from(s.secret)), persona: s.persona, funded: 0, bought: 0, sold: 0, trades: 0, done: false }));
    log(`reusing ${traders.length} wallets from ${path.basename(file)}`);
  } else {
    traders = Array.from({ length: WALLETS }, (_, i) => ({
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : ""), kp: Keypair.generate(),
      // roughly: half hold, a third trade, the rest dump early
      persona: (i % 6 === 5 ? "early-seller" : i % 3 === 1 ? "trader" : "holder") as Persona,
      funded: 0, bought: 0, sold: 0, trades: 0, done: false,
    }));
  }
  const perWallet = Math.floor((BUDGET_SOL * LAMPORTS_PER_SOL) / traders.length);
  const funderBal = await conn.getBalance(funder.publicKey, "confirmed");

  console.log(`\ncoin      ${mint.toBase58()}\nescrow    ${escrow.toBase58()}  (locked ${(Number(esc.escrowed) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} tokens)`);
  console.log(`funder    ${funder.publicKey.toBase58()}  ${sol(funderBal)}`);
  console.log(`plan      ${traders.length} wallets · ${MINUTES} min · budget ${BUDGET_SOL} SOL (${sol(perWallet)} each) · gaps ${MIN_GAP_S}–${MAX_GAP_S} s · sweep at the end${SELL_BACK ? " after selling back" : " (positions kept)"}`);
  console.log(`cast      ${traders.map((t) => `${t.name}:${t.persona}`).join("  ")}\n`);
  if (DRY_RUN) { console.log("dry run — nothing sent. Drop --dry-run to trade."); return; }
  if (!SWEEP_ONLY && funderBal < BUDGET_SOL * LAMPORTS_PER_SOL + 0.1 * LAMPORTS_PER_SOL) {
    throw new Error(`funder needs at least ${BUDGET_SOL + 0.1} SOL on devnet (has ${sol(funderBal)}); solana airdrop 2 -u devnet`);
  }
  fs.writeFileSync(file, JSON.stringify(traders.map((t) => ({ name: t.name, persona: t.persona, pubkey: t.kp.publicKey.toBase58(), secret: Array.from(t.kp.secretKey) })), null, 1));

  // ---- sweep -----------------------------------------------------------------
  let sweeping = false;
  async function sweep() {
    if (sweeping) return; sweeping = true;
    log(`sweeping ${traders.length} wallets back to the funder…`);
    let total = 0;
    const creator = await creatorNow().catch(() => feeAuthorityPda(mint, program.programId));
    for (const t of traders) {
      try {
        if (SELL_BACK) {
          const ata = baseAtaOf(t.kp.publicKey, mint);
          const bal = await conn.getTokenAccountBalance(ata, "confirmed").then((b) => BigInt(b.value.amount)).catch(() => 0n);
          if (bal > 0n) {
            await send(conn, t.kp, [directSellIx(mint, t.kp.publicKey, creator, bal, 0n)]);
            log(`  ${t.name} sold back ${(Number(bal) / 1e6).toFixed(0)} tokens`);
          }
        }
        const bal = await conn.getBalance(t.kp.publicKey, "confirmed");
        const fee = 5_000;
        if (bal > fee) {
          await send(conn, t.kp, [SystemProgram.transfer({ fromPubkey: t.kp.publicKey, toPubkey: funder.publicKey, lamports: bal - fee })]);
          total += bal - fee;
        }
      } catch (e: any) { log(`  ${t.name} sweep failed: ${String(e?.message ?? e).slice(0, 80)}`); }
    }
    log(`swept ${sol(total)} back; funder now ${sol(await conn.getBalance(funder.publicKey, "confirmed"))}`);
    if (!SELL_BACK) log(`positions kept: the wallets still hold the coin (keys in ${path.basename(file)}); rerun with --sweep --sell-back to liquidate later`);
  }
  if (SWEEP_ONLY) { await sweep(); return; }
  process.on("SIGINT", async () => { log("interrupted"); await sweep(); process.exit(0); });

  // ---- setup: short delay window (platform only) + funding -------------------
  if (DELAY_WINDOW > 0) {
    try {
      await program.methods.setDelayWindow(new BN(DELAY_WINDOW)).accountsPartial({ platform: funder.publicKey, escrow }).rpc(provider.opts);
      log(`delay window set to ${DELAY_WINDOW} slots (~${Math.round(DELAY_WINDOW * 0.4)} s) so releases land while you watch`);
    } catch (e: any) { log(`delay window unchanged (${String(e?.message ?? e).slice(0, 60)}) — releases land within the program's default hour`); }
  }
  // fund, and open the coin + wSOL token accounts pump's buy expects to exist (funder pays the rent)
  for (let i = 0; i < traders.length; i += 4) {
    const batch = traders.slice(i, i + 4);
    await send(conn, funder, batch.flatMap((t) => [
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: t.kp.publicKey, lamports: perWallet }),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, baseAtaOf(t.kp.publicKey, mint), t.kp.publicKey, mint, TOKEN_2022),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, getAssociatedTokenAddressSync(WSOL, t.kp.publicKey, true, TOKEN), t.kp.publicKey, WSOL, TOKEN),
    ]));
    batch.forEach((t) => { t.funded = perWallet; });
  }
  log(`funded ${traders.length} wallets with ${sol(perWallet)} each`);

  // ---- trading -----------------------------------------------------------------
  const endAt = Date.now() + MINUTES * 60_000;
  let volume = 0;
  const tokenBal = (t: Trader) => conn.getTokenAccountBalance(baseAtaOf(t.kp.publicKey, mint), "confirmed").then((b) => BigInt(b.value.amount)).catch(() => 0n);

  async function act(t: Trader) {
    const creator = await creatorNow();
    const balLamports = await conn.getBalance(t.kp.publicKey, "confirmed");
    const spendable = balLamports - RESERVE;
    const tokens = await tokenBal(t);
    const elapsed = 1 - (endAt - Date.now()) / (MINUTES * 60_000);

    let action: "buy" | "sell" | "wait" = "wait";
    if (tokens === 0n) action = spendable > 0.01 * LAMPORTS_PER_SOL ? "buy" : "wait";
    else if (t.persona === "holder") action = spendable > 0.02 * LAMPORTS_PER_SOL && Math.random() < 0.35 ? "buy" : "wait";
    else if (t.persona === "early-seller") action = elapsed > rnd(0.1, 0.35) ? "sell" : "wait";
    else action = Math.random() < 0.55 && spendable > 0.015 * LAMPORTS_PER_SOL ? "buy" : "sell";

    if (action === "buy") {
      const [lo, hi] = tokens === 0n ? FIRST_BUY_SOL : LATER_BUY_SOL;
      const lamports = Math.min(spendable, Math.round(rnd(lo, hi) * LAMPORTS_PER_SOL));
      if (lamports < 0.005 * LAMPORTS_PER_SOL) return;
      await send(conn, t.kp, [directBuyIx(mint, t.kp.publicKey, creator, BigInt(lamports), 1n)]);
      t.bought += lamports; t.trades++; volume += lamports;
      log(`${t.name.padEnd(5)} ${t.persona.padEnd(12)} buys  ${sol(lamports)}`);
    } else if (action === "sell") {
      // early sellers dump the lot; traders sell a slice
      const share = t.persona === "early-seller" ? 1 : rnd(0.2, 0.8);
      const amount = (tokens * BigInt(Math.round(share * 1000))) / 1000n;
      if (amount === 0n) return;
      const before = await conn.getBalance(t.kp.publicKey, "confirmed");
      await send(conn, t.kp, [directSellIx(mint, t.kp.publicKey, creator, amount, 0n)]);
      const got = Math.max(0, (await conn.getBalance(t.kp.publicKey, "confirmed")) - before);
      t.sold += got; t.trades++; volume += got;
      log(`${t.name.padEnd(5)} ${t.persona.padEnd(12)} sells ${Math.round(share * 100)}% → ${sol(got)}${share === 1 ? "  (out)" : ""}`);
      if (share === 1) t.done = true;
    }
  }

  async function life(t: Trader) {
    await sleep(rnd(0, MAX_GAP_S) * 1000); // stagger the start
    while (Date.now() < endAt && !t.done) {
      try { await act(t); } catch (e: any) { log(`${t.name} skipped: ${String(e?.message ?? e).slice(0, 90)}`); }
      await sleep(rnd(MIN_GAP_S, MAX_GAP_S) * 1000);
    }
  }
  log(`trading for ${MINUTES} min — watch the coin page; Ctrl-C ends early and sweeps`);
  const ticker = setInterval(() => {
    const left = Math.max(0, Math.round((endAt - Date.now()) / 60_000));
    log(`— ${left} min left · volume ${sol(volume)} · trades ${traders.reduce((s, t) => s + t.trades, 0)} · out ${traders.filter((t) => t.done).length}/${traders.length}`);
  }, 60_000);
  await Promise.all(traders.map(life));
  clearInterval(ticker);

  console.log("\nwallet  persona       trades   bought      sold");
  for (const t of traders) console.log(`${t.name.padEnd(7)} ${t.persona.padEnd(12)}  ${String(t.trades).padStart(5)}   ${sol(t.bought).padStart(10)}  ${sol(t.sold).padStart(10)}`);
  console.log(`total volume ${sol(volume)}\n`);
  await sweep();
}

async function send(conn: Connection, signer: Keypair, ixs: any[]) {
  for (let i = 0; ; i++) {
    try {
      const bh = await conn.getLatestBlockhash("confirmed");
      const tx = new Transaction({ ...bh, feePayer: signer.publicKey }).add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs);
      return await sendAndConfirmTransaction(conn, tx, [signer], { commitment: "confirmed" });
    } catch (e: any) {
      if (i >= 4 || !/Blockhash not found|429|Too Many Requests|block height exceeded|timed out/i.test(String(e?.message ?? e))) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

main().catch((e) => { console.error("FAILED", e?.message ?? e); process.exit(1); });
