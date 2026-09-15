import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "crypto";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { pumpAccounts, escrowPda, escrowAta, TOKEN_2022, WSOL, TOKEN, patchProvider } from "./pump";
import { configPda, setPlatform } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (...p: Buffer[]) => createHash("sha256").update(Buffer.concat(p)).digest();
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };

/** Leaf/node hashing kept byte-identical to the program's. */
const manualLeaf = (index: number, wallet: PublicKey, bps: number) =>
  sha(Buffer.from("manual"), u16le(index), wallet.toBuffer(), u16le(bps));

function buildTree(leaves: Buffer[]) {
  let level = leaves;
  const layers = [level];
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) { next.push(level[i]); continue; }
      const [a, b] = [level[i], level[i + 1]];
      next.push(Buffer.compare(a, b) <= 0
        ? sha(Buffer.from("node"), a, b) : sha(Buffer.from("node"), b, a));
    }
    level = next; layers.push(level);
  }
  return { root: level[0], layers };
}
function proofFor(layers: Buffer[][], index: number) {
  const proof: Buffer[] = [];
  let idx = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (sib < layers[l].length) proof.push(layers[l][sib]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

describe("manual airdrop (localnet)", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  patchProvider(provider);
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as any;
  const conn = provider.connection;
  const dev = (provider.wallet as anchor.Wallet).payer;

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const feeAuthority = PublicKey.findProgramAddressSync([Buffer.from("fee"), mint.toBuffer()], program.programId)[0];
  const pa = pumpAccounts(mint, dev.publicKey, feeAuthority);
  const escrowTa = escrowAta(escrow, mint);
  const manualPda = PublicKey.findProgramAddressSync(
    [Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const baseAta = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true, TOKEN_2022);

  // the list the dev fixes at launch: six wallets, 100% of the manual slice
  const list = Array.from({ length: 6 }, () => Keypair.generate());
  const BPS = [3000, 2500, 2000, 1500, 800, 200];
  const leaves = list.map((k, i) => manualLeaf(i, k.publicKey, BPS[i]));
  const { root, layers } = buildTree(leaves);

  // deliberately NOT the dev: intervention is a separate authority
  const platform = Keypair.generate();
  // the locked share is manual + holder slices of the buy: 35% fixed list, 30% pool
  const MANUAL_BPS = 3500;
  const AMOUNT = new BN(20_000_000).mul(new BN(10 ** 6));
  const ESCROW_BPS = 3000;
  let lut: PublicKey;
  const sigs: Record<string, string> = {};

  after(() => console.log("\n=== devnet signatures ===\n" +
    JSON.stringify({ mint: mint.toBase58(), escrow: escrow.toBase58(),
                     manualAta: manualAta.toBase58(), ...sigs }, null, 2)));

  async function send(ixs: any[], signers: Keypair[] = []) {
    for (let i = 0; i < 6; i++) {
      try {
        const bh = await conn.getLatestBlockhash("finalized");
        const tx = new anchor.web3.Transaction({ ...bh, feePayer: dev.publicKey }).add(...ixs);
        return await provider.sendAndConfirm(tx, signers,
          { commitment: "confirmed", skipPreflight: true, maxRetries: 5 });
      } catch (e: any) {
        if (!/Blockhash not found|429/i.test(String(e?.message ?? e)) || i === 5) throw e;
        await sleep(1200);
      }
    }
    throw new Error("unreachable");
  }

  it("launch fixes the manual list at mint time", async () => {
    // the platform comes from the program config, set by the upgrade authority
    await setPlatform(program, dev.publicKey, platform.publicKey);
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const keys = [...Object.values(pa) as PublicKey[], escrow, escrowTa, mint, feeAuthority,
                  dev.publicKey, manualPda, manualAta, configPda(program.programId),
                  SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: addr,
        addresses: uniq.slice(i, i + 18),
      })]);
    }
    // A lookup table is only usable once the cluster can see all of its
    // addresses. On a local validator this lands much sooner than on devnet, but
    // polling for it is what makes the test work on both.
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(addr)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1000);

    const launchAccounts = {
      dev: dev.publicKey, mint, escrow, config: configPda(program.programId), escrowTokenAccount: escrowTa,
      manualAuthority: manualPda, manualTokenAccount: manualAta, feeAuthority,
      ...pa, systemProgram: SystemProgram.programId,
    };
    const lutAcc0 = (await conn.getAddressLookupTable(lut)).value!;
    const tryLaunch = async (manualBps: number, holderBps: number, rootArg: number[], amount: BN) => {
      const bad = await program.methods
        .launch("Manual Test", "MAN", "https://example.com/man.json", amount, new BN(0.4 * LAMPORTS_PER_SOL),
                rootArg, manualBps, holderBps, false, 0)
        .accountsPartial(launchAccounts).instruction();
      const bh0 = await conn.getLatestBlockhash("confirmed");
      const m = new TransactionMessage({
        payerKey: dev.publicKey, recentBlockhash: bh0.blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), bad],
      }).compileToV0Message([lutAcc0]);
      const t = new VersionedTransaction(m);
      // simulate only: a rejected launch must not cost a mint keypair
      t.sign([dev, mintKp]);
      const sim = await conn.simulateTransaction(t, { commitment: "confirmed" });
      return (sim.value.logs ?? []).join("\n") + JSON.stringify(sim.value.err ?? "");
    };
    // a simulated launch's log can be truncated before anchor prints the error
    // name; the numeric code from the IDL is always in the returned error
    const errRe = (name: string) => {
      const idlErrors = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8")).errors ?? [];
      const code = idlErrors.find((e: any) => e.name === name)?.code;
      return new RegExp(`${name}|"Custom":${code}\\b`);
    };
    // the lock rules, checked before the real launch on the same mint:
    //  - both slices zero → nothing locked
    //  - manual slice without a root (and vice versa)
    //  - a lock under 1% of supply: 20M × 0.4% = 80K tokens, far below 10M
    assert.match(await tryLaunch(0, 0, [...Buffer.alloc(32)], AMOUNT), errRe("BadLockSplit"), "zero split refused");
    assert.match(await tryLaunch(0, 3000, [...root], AMOUNT), errRe("ManualRootMismatch"), "root without a manual slice refused");
    assert.match(await tryLaunch(3500, 0, [...Buffer.alloc(32)], AMOUNT), errRe("ManualRootMismatch"), "manual slice without a root refused");
    assert.match(await tryLaunch(0, 40, [...Buffer.alloc(32)], AMOUNT), errRe("LockTooSmall"), "lock under 1% of supply refused");
    console.log("  kilit kurallari: sifir bolunme, koksuz liste, %1 alti kilit reddedildi (simulasyon)");

    // beta brakes, same simulation trick:
    //  - paused: launches refuse, nothing else does (claims run below while paused)
    //  - lock cap: the value a launch locks, at the price it paid, is capped
    const cfgAddr = configPda(program.programId);
    const platformOnly = { platform: platform.publicKey, config: cfgAddr };
    await program.methods.setPaused(true).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    assert.match(await tryLaunch(MANUAL_BPS, ESCROW_BPS, [...root], AMOUNT), errRe("Paused"), "launch refused while paused");
    await program.methods.setPaused(false).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    // 20M tokens ≈ 0.02 SOL at launch; a 1-lamport cap must refuse, the 50 SOL default must not
    const cfg0: any = await program.account.config.fetch(cfgAddr);
    const delayBefore = cfg0.feeDelaySlots.toNumber();
    await program.methods.setFeeDelay(new BN(5)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    await program.methods.proposeLockCap(new BN(1)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    let cfg: any = await program.account.config.fetch(cfgAddr);
    assert.equal(cfg.pendingLockCapLamports.toNumber(), 1);
    if ((await conn.getSlot("confirmed")) < cfg.lockCapEffectiveSlot.toNumber()) {
      let early = false;
      try { await program.methods.applyLockCap().accountsPartial({ config: cfgAddr }).rpc(provider.opts); } catch { early = true; }
      assert.isTrue(early, "cap change cannot be applied before its delay");
    }
    while ((await conn.getSlot("confirmed")) < cfg.lockCapEffectiveSlot.toNumber()) await sleep(300);
    await program.methods.applyLockCap().accountsPartial({ config: cfgAddr }).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    assert.equal(cfg.maxLockedValueLamports.toNumber(), 1, "cap applied after the delay");
    const capLogs = await tryLaunch(MANUAL_BPS, ESCROW_BPS, [...root], AMOUNT);
    assert.match(capLogs, errRe("LockCapExceeded"), "launch over the lock cap refused");
    // back to the 50 SOL default, and the production delay
    await program.methods.proposeLockCap(new BN(50 * LAMPORTS_PER_SOL)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    while ((await conn.getSlot("confirmed")) < cfg.lockCapEffectiveSlot.toNumber()) await sleep(300);
    await program.methods.applyLockCap().accountsPartial({ config: cfgAddr }).rpc(provider.opts);
    await program.methods.setFeeDelay(new BN(delayBefore || 1_512_000)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    assert.equal(cfg.maxLockedValueLamports.toNumber(), 50 * LAMPORTS_PER_SOL);
    console.log("  frenler: paused'da launch reddi, 1 lamport tavanda LockCapExceeded, tavan 50 SOL'e geri (simulasyon)");

    const ix = await program.methods
      .launch("Manual Test", "MAN", "https://example.com/man.json",
              AMOUNT, new BN(0.4 * LAMPORTS_PER_SOL),
              [...root], MANUAL_BPS, ESCROW_BPS, false, 0)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda(program.programId), escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta, feeAuthority,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();

    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    // Go through the provider, the same path the plain transactions above use.
    // On this local validator the RPC's own send-transaction-service never
    // forwards anything to the TPU (successfully_sent stays at 0).
    const sig = await provider.sendAndConfirm(tx, [mintKp], {
      commitment: "confirmed", skipPreflight: true, maxRetries: 10,
    });
    sigs.launch = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.platform.toBase58(), platform.publicKey.toBase58(), "platform authority copied from config");
    const expected = AMOUNT.muln(MANUAL_BPS).divn(10000); // 35% of the buy: 7M tokens
    assert.equal(Buffer.from(st.manualRoot).toString("hex"), root.toString("hex"),
      "root stored exactly as committed");
    assert.equal(st.manualTotal.toString(), expected.toString(), "manual slice set aside");
    assert.equal(st.escrowBps, ESCROW_BPS, "holder slice recorded");
    assert.equal(st.manualBps, MANUAL_BPS);
    assert.equal(st.manualClaimedBps, 0);

    const held = await getAccount(conn, manualAta, "confirmed", TOKEN_2022);
    assert.equal(held.amount.toString(), expected.toString(), "tokens are in the manual account");

    // 30 day lock recorded at launch
    const now = Math.floor(Date.now() / 1000);
    assert.isTrue(st.manualLocked, "lock flag set");
    assert.closeTo(st.manualUnlockTs.toNumber() - now, 30 * 24 * 3600, 300,
      "unlock is 30 days out");
    console.log(`  ${expected.toString()} token ayrildi, kilit ${new Date(st.manualUnlockTs.toNumber() * 1000).toISOString()}`);
    // leave launches paused: the claims in the next tests must go through anyway
    await program.methods.setPaused(true).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
  });

  it("each wallet claims its own share (while launches are paused)", async () => {
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    assert.isTrue(cfg.paused, "launches are paused for this test");
    const st0: any = await program.account.escrow.fetch(escrow);
    const total = st0.manualTotal;

    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      await send([
        SystemProgram.transfer({
          fromPubkey: dev.publicKey, toPubkey: w.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL,
        }),
        createAssociatedTokenAccountIdempotentInstruction(
          dev.publicKey, baseAta(w.publicKey), w.publicKey, mint, TOKEN_2022),
      ]);

      const sig = await program.methods
        .claimManual(i, BPS[i], proofFor(layers, i).map((b) => [...b]))
        .accountsPartial({
          wallet: w.publicKey, escrow, manualAuthority: manualPda, mint,
          manualTokenAccount: manualAta, walletTokenAccount: baseAta(w.publicKey),
          baseTokenProgram: TOKEN_2022,
        }).signers([w]).rpc(provider.opts);
      if (i === 0) sigs.firstClaim = sig;

      const bal = await getAccount(conn, baseAta(w.publicKey), "confirmed", TOKEN_2022);
      assert.equal(bal.amount.toString(), total.muln(BPS[i]).divn(10000).toString(),
        `wallet ${i} got exactly its ${BPS[i] / 100}%`);
    }
    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.manualClaimedBps, 10000, "the list adds up to 100%");
    const left = await getAccount(conn, manualAta, "confirmed", TOKEN_2022);
    assert.isBelow(Number(left.amount), 10, "only rounding dust remains");
    console.log(`  6 cuzdan payini aldi, kalan toz: ${left.amount}`);
  });

  it("a second claim by the same wallet is rejected", async () => {
    let rejected = false;
    try {
      await program.methods.claimManual(0, BPS[0], proofFor(layers, 0).map((b) => [...b]))
        .accountsPartial({
          wallet: list[0].publicKey, escrow, manualAuthority: manualPda, mint,
          manualTokenAccount: manualAta, walletTokenAccount: baseAta(list[0].publicKey),
          baseTokenProgram: TOKEN_2022,
        }).signers([list[0]]).rpc(provider.opts);
    } catch { rejected = true; }
    assert.isTrue(rejected, "double claim must be rejected");
    console.log("  ikinci claim reddedildi");
    // launches back on
    await program.methods.setPaused(false).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts);
  });

  it("a wallet outside the list cannot claim, and shares cannot be inflated", async () => {
    const outsider = Keypair.generate();
    await send([
      SystemProgram.transfer({
        fromPubkey: dev.publicKey, toPubkey: outsider.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        dev.publicKey, baseAta(outsider.publicKey), outsider.publicKey, mint, TOKEN_2022),
    ]);

    // (a) not in the tree at all
    let rejected = false;
    try {
      await program.methods.claimManual(2, BPS[2], proofFor(layers, 2).map((b) => [...b]))
        .accountsPartial({
          wallet: outsider.publicKey, escrow, manualAuthority: manualPda, mint,
          manualTokenAccount: manualAta, walletTokenAccount: baseAta(outsider.publicKey),
          baseTokenProgram: TOKEN_2022,
        }).signers([outsider]).rpc(provider.opts);
    } catch { rejected = true; }
    assert.isTrue(rejected, "outsider must not claim someone else's leaf");

    // (b) a real member asking for a bigger percentage than the list says
    let inflated = false;
    try {
      await program.methods.claimManual(5, 9000, proofFor(layers, 5).map((b) => [...b]))
        .accountsPartial({
          wallet: list[5].publicKey, escrow, manualAuthority: manualPda, mint,
          manualTokenAccount: manualAta, walletTokenAccount: baseAta(list[5].publicKey),
          baseTokenProgram: TOKEN_2022,
        }).signers([list[5]]).rpc(provider.opts);
    } catch { inflated = true; }
    assert.isTrue(inflated, "a changed percentage must break the proof");
    console.log("  listede olmayan ve yuzdesini buyuten denemeler reddedildi");
  });
  it("the full list is published on chain so the root can be checked", async () => {
    const entries = list.map((k, i) => ({ index: i, wallet: k.publicKey, bps: BPS[i] }));
    const sig = await program.methods
      .publishManualList(entries)
      .accountsPartial({ dev: dev.publicKey, escrow })
      .rpc(provider.opts);
    sigs.publishList = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.manualPublished, entries.length, "all rows published");

    // what an outsider would do: read the rows back out of the log, rebuild the
    // tree, and check it against the root the program committed at launch
    const logs = (await conn.getTransaction(sig, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    }))!.meta!.logMessages!;
    const dataLine = [...logs].reverse().find((l) => l.startsWith("Program data: "))!;
    const buf = Buffer.from(dataLine.slice("Program data: ".length), "base64");
    let o = 8 + 32 + 32 + 2;                       // disc, escrow, root, published_total
    const n = buf.readUInt32LE(o); o += 4;
    const readBack: Buffer[] = [];
    for (let i = 0; i < n; i++) {
      const idx = buf.readUInt16LE(o); o += 2;
      const w = new PublicKey(buf.subarray(o, o + 32)); o += 32;
      const bps = buf.readUInt16LE(o); o += 2;
      readBack.push(manualLeaf(idx, w, bps));
    }
    assert.equal(n, entries.length, "log carries every row");
    const rebuilt = buildTree(readBack).root;
    assert.equal(rebuilt.toString("hex"), Buffer.from(st.manualRoot).toString("hex"),
      "root rebuilt from the published rows matches the committed root");
    console.log(`  ${n} satir yayinlandi, kok zincirden yeniden kuruldu ve tuttu`);
  });

  it("intervention is refused before the 30 day lock, and to non-platform callers", async () => {
    const common = {
      escrow, manualAuthority: manualPda, mint,
      manualTokenAccount: manualAta, escrowTokenAccount: escrowTa,
      devTokenAccount: baseAta(dev.publicKey), dev: dev.publicKey,
      baseTokenProgram: TOKEN_2022,
    };
    await send([SystemProgram.transfer({
      fromPubkey: dev.publicKey, toPubkey: platform.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL,
    })]);

    // still locked, even for the platform
    let locked = false, detail = "";
    try {
      await program.methods.intervene(0, 0)
        .accountsPartial({ platform: platform.publicKey, ...common })
        .signers([platform]).rpc(provider.opts);
    } catch (e: any) { locked = true; detail = String(e?.message ?? e); }
    assert.isTrue(locked, "manual funds are locked for 30 days");
    assert.match(detail, /StillLocked|0x[0-9a-f]+/i);

    // and the dev cannot do it either — only the platform key can
    let notPlatform = false;
    try {
      await program.methods.intervene(0, 0)
        .accountsPartial({ platform: dev.publicKey, ...common })
        .rpc(provider.opts);
    } catch { notPlatform = true; }
    assert.isTrue(notPlatform, "dev is not the platform authority");
    console.log("  kilit icindeyken ve platform disindan mudahale reddedildi");
  });

  it("dead coin flag trips after 7 quiet days, and only then may the pool move", async () => {
    // shrink the day so seven of them fit in the test
    await program.methods.setDayWindow(new BN(2))
      .accountsPartial({ platform: platform.publicKey, escrow })
      .signers([platform]).rpc(provider.opts);

    const triggerAccounts = {
      escrow, bondingCurve: pa.bondingCurve,
      slotHashes: new PublicKey("SysvarS1otHashes111111111111111111111111111"),
    };
    // nothing is trading, so every rolled day counts as quiet
    let st: any;
    for (let i = 0; i < 10; i++) {
      await program.methods.checkTrigger().accountsPartial(triggerAccounts)
        .rpc(provider.opts);
      st = await program.account.escrow.fetch(escrow);
      if (st.dead) break;
      await sleep(2200);
    }
    assert.isTrue(st.dead, "coin should be flagged dead after 7 quiet days");
    assert.isAtLeast(st.lowVolumeDays, 7);
    console.log(`  olu coin bayragi acildi (${st.lowVolumeDays} sessiz gun)`);

    const poolBefore = st.escrowed.sub(st.allocated);
    assert.isTrue(poolBefore.gtn(0), "there is a pool to move");
    const devBefore = await getAccount(conn, baseAta(dev.publicKey), "confirmed", TOKEN_2022);

    // pool -> pool is meaningless and must be refused
    let badTarget = false;
    try {
      await program.methods.intervene(1, 1)
        .accountsPartial({
          platform: platform.publicKey, escrow, manualAuthority: manualPda, mint,
          manualTokenAccount: manualAta, escrowTokenAccount: escrowTa,
          devTokenAccount: baseAta(dev.publicKey), dev: dev.publicKey,
          baseTokenProgram: TOKEN_2022,
        }).signers([platform]).rpc(provider.opts);
    } catch { badTarget = true; }
    assert.isTrue(badTarget, "pool -> pool must be refused");

    const sig = await program.methods.intervene(1, 0)
      .accountsPartial({
        platform: platform.publicKey, escrow, manualAuthority: manualPda, mint,
        manualTokenAccount: manualAta, escrowTokenAccount: escrowTa,
        devTokenAccount: baseAta(dev.publicKey), dev: dev.publicKey,
        baseTokenProgram: TOKEN_2022,
      }).signers([platform]).rpc(provider.opts);
    sigs.intervene = sig;

    const devAfter = await getAccount(conn, baseAta(dev.publicKey), "confirmed", TOKEN_2022);
    assert.equal((devAfter.amount - devBefore.amount).toString(), poolBefore.toString(),
      "the whole free pool went to the dev wallet");
    console.log(`  olu havuz dev cuzdanina tasindi: ${poolBefore.toString()} token sig=${sig}`);
  });
});