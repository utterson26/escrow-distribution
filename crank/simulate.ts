/**
 * Ten-minute localnet rehearsal for the crank.
 *
 * Launches two coins, starts the crank as a separate process with its own
 * freshly funded wallet, and then plays the market for `SIM_MINUTES`:
 *
 *   HOT   a steady stream of buys — should arm the volume trigger fast and
 *         keep re-arming; gets a SOL donation mid-run (buyback) and a whale
 *         buy that doubles the market cap (milestone)
 *   SLOW  small, infrequent buys — should take several minutes to arm
 *
 * Everything the crank logs is checked afterwards against what it should have
 * done: every fire landed at or after the fire slot, nothing was fired early,
 * no tick was skipped while a trigger was due, the buyback happened, and the
 * milestone was seen. The report goes to `crank/sim-report.md`.
 *
 * Needs a running `scripts/localnet.sh` with the program deployed.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pumpAccounts, escrowPda, escrowAta, directBuyIx, TOKEN_2022, TOKEN, WSOL } from "../tests/pump";

const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
const SIM_MINUTES = Number(process.env.SIM_MINUTES ?? 10);
const CRANK_INTERVAL_MS = Number(process.env.CRANK_INTERVAL_MS ?? 60_000);
/** Narrow firing window so a fire lands inside the rehearsal (~40 s at 400 ms/slot). */
const DELAY_WINDOW = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;

interface SimEvent { ts: string; t: number; coin: string; what: string; detail: string }

async function main() {
  const conn = new anchor.web3.Connection(RPC_URL, "confirmed");
  const devPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const dev = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(devPath, "utf8"))));
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(dev), {
    commitment: "confirmed", preflightCommitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "crank-sim-"));
  const crankLog = path.join(workdir, "crank.jsonl");
  const events: SimEvent[] = [];
  const t0 = Date.now();
  const note = (coin: string, what: string, detail = "") => {
    const ev = { ts: new Date().toISOString(), t: Math.round((Date.now() - t0) / 1000), coin, what, detail };
    events.push(ev);
    console.log(`[sim  ] ${ev.ts} t=${ev.t}s ${coin} ${what} ${detail}`);
  };

  // Two wallets that are deliberately not the dev: the crank signs with its
  // own key, and the trades come from a third party.
  const crankKp = Keypair.generate();
  const trader = Keypair.generate();
  fs.writeFileSync(path.join(workdir, "crank.json"), JSON.stringify([...crankKp.secretKey]));
  for (const [who, kp, sol] of [["crank", crankKp, 5], ["trader", trader, 100]] as const) {
    const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    note("-", `fund ${who}`, `${kp.publicKey.toBase58()} ${sol} SOL`);
  }

  /** Legacy tx paid and signed by `payer` (dev unless told otherwise). */
  async function send(ixs: anchor.web3.TransactionInstruction[], payer = dev, extra: Keypair[] = []) {
    const bh = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ ...bh, feePayer: payer.publicKey }).add(...ixs);
    return sendAndConfirmTransaction(conn, tx, [payer, ...extra],
      { commitment: "confirmed", skipPreflight: true, maxRetries: 5 });
  }

  /** create_v2 + buy_v2 through our program, the way tests do it (needs a LUT). */
  async function launch(name: string, symbol: string, amountTokens: number) {
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;
    const escrow = escrowPda(mint, program.programId);
    const pa = pumpAccounts(mint, dev.publicKey, escrow);
    const escrowTa = escrowAta(escrow, mint);
    const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
    const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);

    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    const keys = [...Object.values(pa) as PublicKey[], escrow, escrowTa, mint, dev.publicKey,
                  manualPda, manualAta, SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: lut,
        addresses: uniq.slice(i, i + 18),
      })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(lut)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1000);

    const ix = await program.methods
      .launch(name, symbol, `https://example.com/${symbol.toLowerCase()}.json`,
              3000, new BN(amountTokens).mul(new BN(10 ** 6)), new BN(2 * LAMPORTS_PER_SOL),
              [...Buffer.alloc(32)], 0, dev.publicKey)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    const sig = await provider.sendAndConfirm(tx, [mintKp], {
      commitment: "confirmed", skipPreflight: true, maxRetries: 10,
    });
    await program.methods.setDelayWindow(new BN(DELAY_WINDOW))
      .accountsPartial({ dev: dev.publicKey, escrow }).rpc({ commitment: "confirmed" });
    note(symbol, "launch", `mint=${mint.toBase58()} escrow=${escrow.toBase58()} sig=${sig}`);
    return { symbol, mint, escrow, pa };
  }

  const hot = await launch("Crank Hot", "HOT", 300_000_000);
  const slow = await launch("Crank Slow", "SLOW", 300_000_000);
  const coins = [hot, slow];

  // the trader's token accounts, opened once so the buy transactions stay small
  await send([
    ...coins.map((c) => createAssociatedTokenAccountIdempotentInstruction(
      trader.publicKey, getAssociatedTokenAddressSync(c.mint, trader.publicKey, true, TOKEN_2022),
      trader.publicKey, c.mint, TOKEN_2022)),
    createAssociatedTokenAccountIdempotentInstruction(
      trader.publicKey, getAssociatedTokenAddressSync(WSOL, trader.publicKey, true, TOKEN),
      trader.publicKey, WSOL, TOKEN),
  ], trader);

  async function buy(c: typeof hot, sol: number, label: string) {
    const ix = directBuyIx(c.mint, trader.publicKey, c.escrow, BigInt(Math.round(sol * LAMPORTS_PER_SOL)), 1n);
    const sig = await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ix], trader);
    note(c.symbol, label, `${sol} SOL sig=${sig}`);
  }

  /** Market cap in SOL off the curve's virtual reserves. */
  async function mcapSol(c: typeof hot) {
    const raw = (await conn.getAccountInfo(c.pa.bondingCurve, "confirmed"))!.data;
    const vt = raw.readBigUInt64LE(8), vq = raw.readBigUInt64LE(16), supply = raw.readBigUInt64LE(40);
    return Number((supply * vq) / vt) / LAMPORTS_PER_SOL;
  }

  /** SOL needed to double the market cap from the current curve state. */
  async function solToDouble(c: typeof hot, baseline: bigint) {
    const raw = (await conn.getAccountInfo(c.pa.bondingCurve, "confirmed"))!.data;
    const vt = raw.readBigUInt64LE(8), vq = raw.readBigUInt64LE(16), supply = raw.readBigUInt64LE(40);
    const k = vq * vt;
    const inner = (supply * k) / (baseline * 2n);
    let lo = 1n, hi = vt, vtT = vt;
    while (lo <= hi) { const m = (lo + hi) / 2n; if (m * m <= inner) { vtT = m; lo = m + 1n; } else hi = m - 1n; }
    return Number(k / vtT - vq) / LAMPORTS_PER_SOL;
  }

  // ---- start the crank ----
  const crank: ChildProcess = spawn("npx", ["ts-node", "--compiler-options", '{"module":"commonjs"}',
    path.join(__dirname, "crank.ts")], {
    env: { ...process.env, RPC_URL, CRANK_KEYPAIR: path.join(workdir, "crank.json"),
           CRANK_INTERVAL_MS: String(CRANK_INTERVAL_MS), CRANK_LOG: crankLog },
    stdio: ["ignore", "pipe", "pipe"],
  });
  crank.stdout!.on("data", (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, "[crank] ")));
  crank.stderr!.on("data", (d) => process.stderr.write(String(d).replace(/^(?=.)/gm, "[crank!] ")));
  note("-", "crank started", `wallet=${crankKp.publicKey.toBase58()} interval=${CRANK_INTERVAL_MS}ms`);

  // ---- the market, on a schedule ----
  // The volume trigger wants 1% of market cap between distributions, so the
  // trade sizes are set from the cap the coins actually launched at: HOT trades
  // ~1.5% every 15 s (arms within a tick), SLOW ~0.25% every 40 s (needs four
  // buys, so a few minutes).
  const cap = await mcapSol(hot);
  const HOT_BUY = +(cap * 0.015).toFixed(4), SLOW_BUY = +(cap * 0.0025).toFixed(4);
  note("-", "market sizes", `mcap=${cap.toFixed(3)} SOL hot=${HOT_BUY} SOL/15s slow=${SLOW_BUY} SOL/40s`);
  const end = t0 + SIM_MINUTES * 60_000;
  const DONATE_AT = SIM_MINUTES * 60 / 3, WHALE_AT = SIM_MINUTES * 60 * 0.55;
  let nextHot = Date.now() + 5_000, nextSlow = Date.now() + 20_000;
  let donated = false, whaled = false;
  while (Date.now() < end) {
    const now = Date.now();
    const t = (now - t0) / 1000;
    try {
      if (now >= nextHot) { nextHot = now + 15_000; await buy(hot, HOT_BUY, "buy"); }
      if (now >= nextSlow) { nextSlow = now + 40_000; await buy(slow, SLOW_BUY, "buy"); }
      if (!donated && t >= DONATE_AT) {
        donated = true;
        const sig = await send([SystemProgram.transfer({
          fromPubkey: trader.publicKey, toPubkey: hot.escrow, lamports: 0.05 * LAMPORTS_PER_SOL,
        })], trader);
        note("HOT", "donation to escrow", `0.05 SOL sig=${sig}`);
      }
      if (!whaled && t >= WHALE_AT) {
        whaled = true;
        const st: any = await program.account.escrow.fetch(hot.escrow, "confirmed");
        const need = await solToDouble(hot, BigInt(st.lastMilestoneMcap.toString()));
        await buy(hot, +(need * 1.03).toFixed(4), "whale buy (2x mcap)");
      }
    } catch (e: any) {
      note("-", "error", String(e?.message ?? e).slice(0, 160));
    }
    await sleep(1000);
  }
  // give the crank one last tick to fire anything left over
  await sleep(CRANK_INTERVAL_MS + 5_000);
  crank.kill("SIGTERM");
  note("-", "crank stopped");

  // ---- verdict ----
  const lines = fs.readFileSync(crankLog, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const sym = (coin: string) => coins.find((c) => short(c.mint) === coin)?.symbol ?? coin;
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const fires = lines.filter((l) => l.action === "fire_trigger" && l.result === "ok");
  const arms = lines.filter((l) => l.action === "check_trigger" && l.result === "armed");
  const waits = lines.filter((l) => l.action === "fire_trigger" && l.result === "wait");
  const errors = lines.filter((l) => l.result === "error" || l.event === "error" || l.event === "tick_error");

  checks.push({ name: "her fire, fire_slot'tan sonra indi",
    ok: fires.length > 0 && fires.every((f) => BigInt(f.tx_slot) >= BigInt(f.fire_slot)),
    detail: fires.map((f) => `${sym(f.coin)} ${f.kind} tx_slot=${f.tx_slot} fire_slot=${f.fire_slot}`).join("; ") });
  checks.push({ name: "beklerken hiç erken çağrı yapılmadı",
    ok: waits.every((w) => BigInt(w.slot) < BigInt(w.fire_slot)) && !errors.some((e) => /TooEarly/.test(e.error)),
    detail: `${waits.length} bekleme, ${errors.filter((e) => /TooEarly/.test(e.error)).length} TooEarly` });
  checks.push({ name: "her kurulan tetikleyici ateşlendi",
    ok: arms.length > 0 && arms.length <= fires.length + 1,
    detail: `${arms.length} armed, ${fires.length} fired` });
  const hotFirstArm = arms.find((a) => sym(a.coin) === "HOT")?.tick;
  const slowFirstArm = arms.find((a) => sym(a.coin) === "SLOW")?.tick;
  checks.push({ name: "SLOW, HOT'tan sonra kuruldu (hacim eşiği çalışıyor)",
    ok: hotFirstArm !== undefined && slowFirstArm !== undefined && slowFirstArm > hotFirstArm,
    detail: `HOT tick ${hotFirstArm}, SLOW tick ${slowFirstArm}` });
  const bb = lines.filter((l) => l.action === "buyback" && l.result === "ok");
  checks.push({ name: "bağıştan sonra buyback yapıldı",
    ok: bb.length > 0, detail: bb.map((b) => `${sym(b.coin)} spent=${b.spent} tokens=${b.tokens}`).join("; ") });
  const ms = arms.filter((a) => a.kind === "milestone");
  checks.push({ name: "whale alımı kilometre taşını kurdu",
    ok: ms.length > 0, detail: ms.map((m) => `${sym(m.coin)} tick ${m.tick} amount=${m.amount}`).join("; ") });
  checks.push({ name: "crank hata vermedi",
    ok: errors.length === 0, detail: errors.map((e) => `${sym(e.coin ?? "-")} ${e.action ?? e.event}: ${e.error}`).join("; ") || "-" });
  checks.push({ name: "hiç tick atlanmadı",
    ok: !lines.some((l) => l.event === "tick_skipped"), detail: `${lines.filter((l) => l.event === "tick").length} tick` });

  const timeline = [
    ...events.map((e) => ({ ts: e.ts, who: "sim", coin: e.coin, text: `${e.what} ${e.detail}` })),
    ...lines.filter((l) => l.action || l.event === "tick").map((l) => ({
      ts: l.ts, who: "crank", coin: l.coin ? sym(l.coin) : "-",
      text: l.event === "tick" ? `tick ${l.tick} slot=${l.slot} coins=${l.coins}`
        : `${l.action} → ${l.result}` + Object.entries(l)
          .filter(([k]) => !["ts", "tick", "coin", "action", "result", "sig"].includes(k))
          .map(([k, v]) => ` ${k}=${v}`).join("") + (l.sig ? ` sig=${String(l.sig).slice(0, 12)}…` : ""),
    })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));

  const allOk = checks.every((c) => c.ok);
  const report = [
    `# Crank simülasyonu — ${new Date(t0).toISOString()}`, "",
    `Localnet, ${SIM_MINUTES} dk, crank aralığı ${CRANK_INTERVAL_MS / 1000} sn, gecikme penceresi ${DELAY_WINDOW} slot.`,
    `Crank cüzdanı \`${crankKp.publicKey.toBase58()}\` (dev değil), trader \`${trader.publicKey.toBase58()}\`.`, "",
    ...coins.map((c) => `- ${c.symbol}: mint \`${c.mint.toBase58()}\`, escrow \`${c.escrow.toBase58()}\``), "",
    `## Sonuç: ${allOk ? "✅ hepsi geçti" : "❌ eksik var"}`, "",
    "| Kontrol | Durum | Detay |", "|---|---|---|",
    ...checks.map((c) => `| ${c.name} | ${c.ok ? "✅" : "❌"} | ${c.detail} |`), "",
    "## Zaman çizelgesi", "", "| Zaman | Kim | Coin | Olay |", "|---|---|---|---|",
    ...timeline.map((r) => `| ${r.ts.slice(11, 19)} | ${r.who} | ${r.coin} | ${r.text.replace(/\|/g, "\\|")} |`), "",
    `Ham crank kaydı: \`${crankLog}\``,
  ].join("\n");
  const out = path.join(__dirname, "sim-report.md");
  fs.writeFileSync(out, report);
  console.log("\n" + checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.name} — ${c.detail}`).join("\n"));
  console.log(`\nrapor: ${out}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
