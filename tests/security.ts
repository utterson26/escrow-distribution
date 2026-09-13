/**
 * Regression tests for the findings in SECURITY_REVIEW.md. Localnet only.
 *
 *   F1  the platform authority comes from the program config, which only the
 *       upgrade authority can write — a launcher cannot name themselves
 *   F2  the test knobs (day window, delay window) answer to the platform, not
 *       the dev, so a dev cannot flag their own coin dead and ask for the pool
 *   F3  a round is a pure function of chain history: release, slot and the
 *       eligibility floor are recorded, the allocation reproduces, only listed
 *       publishers may commit, the floor changes only with the delay
 *   F4  a holder who dumped after the snapshot cannot claim; holding it again
 *       makes the claim go through
 *   F5  a holder-rewards coin: fee sharing, collect_fees and buyback are refused
 *   F6  the platform fee only changes after a delay; early apply fails, a late
 *       one lands and reaches the next coin set up (delay narrowed by a test knob)
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  pumpAccounts, escrowPda, escrowAta, directBuyIx, feeAuthorityPda, setupFeeSharingAccounts,
  collectFeesAccounts, buyerPda, baseAtaOf, failureText, sellBackAll, sharingConfigPda, TOKEN_2022, TOKEN, WSOL, patchProvider,
} from "./pump";
import { snapshot, buildTree, proofFor, Snapshot } from "../indexer/snapshot";
import { configPda, setPlatform } from "./config";

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errOf = (e: any) => String(e?.error?.errorCode?.code ?? e?.message ?? e);

describe("security review regressions (localnet)", () => {
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

  const platform = Keypair.generate();
  const stranger = Keypair.generate();
  const holders = [Keypair.generate(), Keypair.generate()];
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const feeAuthority = feeAuthorityPda(mint, program.programId);
  const pa = pumpAccounts(mint, dev.publicKey, feeAuthority); // no fee sharing here: creator stays the fee PDA
  const escrowTa = escrowAta(escrow, mint);
  const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const baseAta = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true, TOKEN_2022);
  const roundPda = (i: number) => {
    const b = Buffer.alloc(4); b.writeUInt32LE(i);
    return PublicKey.findProgramAddressSync([Buffer.from("round"), escrow.toBuffer(), b], program.programId)[0];
  };
  const triggerAccounts = { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES };
  const claimAccounts = (h: PublicKey, round: PublicKey) => ({
    holder: h, escrow, round, mint, escrowTokenAccount: escrowTa, holderTokenAccount: baseAta(h),
    receipt: PublicKey.findProgramAddressSync([Buffer.from("receipt"), round.toBuffer(), h.toBuffer()], program.programId)[0],
    bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
  });
  let snap: Snapshot;

  async function send(ixs: anchor.web3.TransactionInstruction[], payer: Keypair = dev, extra: Keypair[] = []) {
    for (let i = 0; ; i++) {
      try {
        const bh = await conn.getLatestBlockhash("finalized");
        const tx = new Transaction({ ...bh, feePayer: payer.publicKey }).add(...ixs);
        return await sendAndConfirmTransaction(conn, tx, [payer, ...extra], { commitment: "confirmed", skipPreflight: provider.opts.skipPreflight });
      } catch (e: any) {
        if (i >= 4 || !/Blockhash not found|429|Too Many Requests|timed out/i.test(String(e?.message ?? e))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  async function expectError(label: string, p: Promise<unknown>, re: RegExp, addr: PublicKey = escrow) {
    try { await p; } catch (e: any) {
      assert.match(errOf(e) + (await failureText(conn, e, addr)), re, `${label}: wrong error`);
      return;
    }
    assert.fail(`${label}: should have been rejected`);
  }

  after(async () => {
    // off localnet the throwaway keys give their SOL back
    if (/127\.0\.0\.1|localhost/.test(conn.rpcEndpoint)) return;
    let swept = 0;
    for (const k of [platform, stranger, ...holders]) {
      try {
        const bal = await conn.getBalance(k.publicKey, "confirmed");
        if (bal <= 900_000) continue;
        await send([SystemProgram.transfer({ fromPubkey: k.publicKey, toPubkey: dev.publicKey, lamports: bal - 900_000 })], dev, [k]);
        swept += bal - 900_000;
      } catch { /* best effort */ }
    }
    console.log(`  swept ${swept / LAMPORTS_PER_SOL} SOL back`);
    try {
      // the SEC coin got fee sharing in F6, so its creator is the sharing config now
      const st: any = await program.account.escrow.fetch(escrow).catch(() => null);
      const got = await sellBackAll(conn, dev, mint, st?.feeSharingSet ? sharingConfigPda(mint) : feeAuthority);
      console.log(`  sold the dev's SEC position back: +${got / LAMPORTS_PER_SOL} SOL`);
    } catch (e: any) { console.log(`  sell-back skipped: ${String(e?.message ?? e).slice(0, 80)}`); }
  });

  before(async () => {
    // localnet has a faucet; on devnet the faucet is rate-limited, so the dev
    // wallet funds the throwaway keys (they need ~0.3 SOL each here)
    const local = /127\.0\.0\.1|localhost/.test(conn.rpcEndpoint);
    for (const k of [platform, stranger, ...holders]) {
      if (local) {
        const sig = await conn.requestAirdrop(k.publicKey, 3 * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, "confirmed");
      } else {
        // holders buy 0.15 SOL each; the platform/stranger keys only pay fees
        const sol = holders.includes(k) ? 0.2 : 0.05;
        await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: k.publicKey, lamports: sol * LAMPORTS_PER_SOL })]);
      }
    }
  });

  it("F1: only the upgrade authority can set the platform; a launch copies it", async () => {
    const ix = await program.methods.setPlatform(stranger.publicKey, stranger.publicKey).accountsPartial({
      authority: stranger.publicKey, config: configPda(program.programId), program: program.programId,
      programData: PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0],
      systemProgram: SystemProgram.programId,
    }).instruction();
    await expectError("stranger sets platform", send([ix], stranger), /NotUpgradeAuthority|custom program error/, configPda(program.programId));

    await setPlatform(program, dev.publicKey, platform.publicKey);
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(cfg.platform.toBase58(), platform.publicKey.toBase58());

    // launch: LUT + v0 tx, as everywhere else
    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    const keys = [...Object.values(pa) as PublicKey[], escrow, escrowTa, mint, dev.publicKey,
                  manualPda, manualAta, feeAuthority, configPda(program.programId), SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: lut, addresses: uniq.slice(i, i + 18),
      })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(lut)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1000);
    const launchIx = await program.methods
      .launch("Sec Test", "SEC", "https://example.com/sec.json",
              new BN(300_000_000).mul(new BN(10 ** 6)), new BN(2 * LAMPORTS_PER_SOL), [...Buffer.alloc(32)], 0, 3000, false)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda(program.programId), escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta, feeAuthority, ...pa, systemProgram: SystemProgram.programId,
      }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), launchIx],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    await provider.sendAndConfirm(tx, [mintKp], { commitment: "confirmed", skipPreflight: true, maxRetries: 10 });

    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.platform.toBase58(), platform.publicKey.toBase58(), "escrow.platform is the config's, not the dev");
    assert.notEqual(st.platform.toBase58(), dev.publicKey.toBase58());
  });

  it("F2: the dev cannot turn the test knobs; the platform can", async () => {
    await expectError("dev sets day window",
      program.methods.setDayWindow(new BN(2)).accountsPartial({ platform: dev.publicKey, escrow })
        .rpc(provider.opts), /NotPlatform/);
    await expectError("dev sets delay window",
      program.methods.setDelayWindow(new BN(5)).accountsPartial({ platform: dev.publicKey, escrow })
        .rpc(provider.opts), /NotPlatform/);
    await program.methods.setDelayWindow(new BN(5))
      .accountsPartial({ platform: platform.publicKey, escrow }).signers([platform]).rpc(provider.opts);
    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.maxDelaySlots.toNumber(), 5);
  });

  it("F3: a round is a pure function of chain history — the publisher cannot pick who gets what", async () => {
    // two holders buy, the trigger arms on that volume, fires, a round is opened
    for (const h of holders) {
      await send([
        createAssociatedTokenAccountIdempotentInstruction(h.publicKey, baseAta(h.publicKey), h.publicKey, mint, TOKEN_2022),
        createAssociatedTokenAccountIdempotentInstruction(h.publicKey,
          getAssociatedTokenAddressSync(WSOL, h.publicKey, true, TOKEN), h.publicKey, WSOL, TOKEN),
      ], h);
    }
    await program.methods.checkTrigger().accountsPartial(triggerAccounts).rpc(provider.opts); // baseline
    for (const h of holders) {
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directBuyIx(mint, h.publicKey, feeAuthority, BigInt(0.15 * LAMPORTS_PER_SOL), 1n)], h);
    }
    await program.methods.checkTrigger().accountsPartial(triggerAccounts).rpc(provider.opts);
    let st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.armed, "volume armed the trigger");
    while ((await conn.getSlot("confirmed")) < st.fireSlot.toNumber()) await sleep(400);
    await program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve }).rpc(provider.opts);
    st = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.pending.gtn(0));
    const released = BigInt(st.pending.toString());

    // the eligibility floor is a delayed platform setting; narrow the delay
    // (test knob), lower the floor to 0.05 SOL, and see the round carry it
    const cfgAddr = configPda(program.programId);
    const platformOnly = { platform: platform.publicKey, config: cfgAddr };
    await program.methods.setFeeDelay(new BN(5)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    await expectError("dev proposes a floor",
      program.methods.proposeMinPosition(new BN(50_000_000)).accountsPartial({ platform: dev.publicKey, config: cfgAddr }).rpc(provider.opts),
      /NotPlatform/, cfgAddr);
    await program.methods.proposeMinPosition(new BN(50_000_000)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    let cfg: any = await program.account.config.fetch(cfgAddr);
    if ((await conn.getSlot("confirmed")) < cfg.minPositionEffectiveSlot.toNumber()) {
      await expectError("apply floor early",
        program.methods.applyMinPosition().accountsPartial({ config: cfgAddr }).rpc(provider.opts), /MinPositionChangeTooEarly/, cfgAddr);
    }
    while ((await conn.getSlot("confirmed")) < cfg.minPositionEffectiveSlot.toNumber()) await sleep(300);
    await program.methods.applyMinPosition().accountsPartial({ config: cfgAddr }).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    assert.equal(cfg.minPositionLamports.toNumber(), 50_000_000, "floor applied after the delay");
    const floor = BigInt(cfg.minPositionLamports.toString());

    const snapSlot = await conn.getSlot("confirmed");
    snap = await snapshot(conn.rpcEndpoint, mint.toBase58(), snapSlot, program.programId, [], released, floor);
    assert.equal(snap.leaves.length, 2, "both holders, dev excluded automatically");
    assert.equal(snap.minPositionLamports, floor.toString(), "snapshot records the floor it used");
    // two holders: below the cap threshold, the whole release is split pro rata
    assert.equal(snap.total, released.toString(), "nothing held back with two holders");
    // anyone re-running with the recorded (slot, released, floor) gets the same root
    const again = await snapshot(conn.rpcEndpoint, mint.toBase58(), snapSlot, program.programId, [], released, floor);
    assert.equal(again.root, snap.root, "reproducible");

    // beta: only listed publishers may commit a root — the dev is not one
    const round = roundPda(0);
    await expectError("dev opens a round",
      program.methods.openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total),
                 snap.leaves.length, new BN(snapSlot))
        .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })
        .rpc(provider.opts), /NotPublisher/, round);
    await program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total),
                 snap.leaves.length, new BN(snapSlot))
      .accountsPartial({ publisher: platform.publicKey, escrow, round, systemProgram: SystemProgram.programId })
      .signers([platform]).rpc(provider.opts);
    const r: any = await program.account.round.fetch(round);
    assert.equal(r.released.toString(), released.toString(), "release recorded for reproducers");
    assert.equal(r.snapshotSlot.toNumber(), snapSlot, "slot recorded for reproducers");
    assert.equal(r.minPositionLamports.toNumber(), 50_000_000, "floor recorded on the round");

    // a second publisher can be listed by the platform; the list is capped at four
    cfg = await program.account.config.fetch(cfgAddr);
    const list: PublicKey[] = [platform.publicKey, holders[0].publicKey, PublicKey.default, PublicKey.default];
    await program.methods.setPublishers(list).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    assert.isTrue(cfg.publishers.some((k: PublicKey) => k.equals(holders[0].publicKey)), "holder listed as publisher");
    await expectError("dev sets publishers",
      program.methods.setPublishers(list).accountsPartial({ platform: dev.publicKey, config: cfgAddr }).rpc(provider.opts), /NotPlatform/, cfgAddr);
    // floor back to the 0.1 SOL default for the other suites
    await program.methods.proposeMinPosition(new BN(100_000_000)).accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
    cfg = await program.account.config.fetch(cfgAddr);
    while ((await conn.getSlot("confirmed")) < cfg.minPositionEffectiveSlot.toNumber()) await sleep(300);
    await program.methods.applyMinPosition().accountsPartial({ config: cfgAddr }).rpc(provider.opts);
    st = await program.account.escrow.fetch(escrow);
    assert.equal(st.pending.toString(), "0", "the release is consumed; nothing is carried");

    // a release above what triggers freed is refused outright, so a publisher
    // cannot inflate the base the cap is measured against
    const { root: badRoot } = buildTree(snap.leaves);
    await expectError("inflated release",
      program.methods.openRound(1, [...badRoot], new BN((released + 1n).toString()), new BN(snap.total), 2, new BN(snapSlot))
        .accountsPartial({ publisher: platform.publicKey, escrow, round: roundPda(1), systemProgram: SystemProgram.programId })
        .signers([platform]).rpc(provider.opts),
      /AmountNotAuthorized/);
  });

  it("F4: a holder who dumped after the snapshot cannot claim until they hold it again", async () => {
    const round = roundPda(0);
    const { layers } = buildTree(snap.leaves);
    const leaf = snap.leaves[0];
    const holderA = holders.find((k) => k.publicKey.toBase58() === leaf.holder)!;
    const other = holders.find((k) => k !== holderA)!;

    // dump half the position to the other holder
    const half = BigInt(leaf.balance) / 2n;
    await send([createTransferCheckedInstruction(baseAta(holderA.publicKey), mint, baseAta(other.publicKey),
      holderA.publicKey, half, 6, [], TOKEN_2022)], holderA);
    const claim = () => program.methods
      .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((b) => [...b]))
      .accountsPartial(claimAccounts(holderA.publicKey, round)).signers([holderA]).rpc(provider.opts);
    await expectError("claim after dumping", claim(), /HoldingBelowSnapshot/);

    // get it back, claim goes through and pays exactly the allocated amount
    await send([createTransferCheckedInstruction(baseAta(other.publicKey), mint, baseAta(holderA.publicKey),
      other.publicKey, half, 6, [], TOKEN_2022)], other);
    const before = BigInt((await conn.getTokenAccountBalance(baseAta(holderA.publicKey), "confirmed")).value.amount);
    await claim();
    const after = BigInt((await conn.getTokenAccountBalance(baseAta(holderA.publicKey), "confirmed")).value.amount);
    assert.equal((after - before).toString(), leaf.amount);
  });

  it("F5: a holder-rewards coin refuses fee sharing, collect_fees and buyback", async () => {
    // pump keeps that coin's creator fee for its own holder pool, so there is
    // nothing for the escrow to sweep or buy back with
    const mintKp2 = Keypair.generate();
    const mint2 = mintKp2.publicKey;
    const escrow2 = escrowPda(mint2, program.programId);
    const fee2 = feeAuthorityPda(mint2, program.programId);
    const pa2 = pumpAccounts(mint2, dev.publicKey, fee2);
    const escrowTa2 = escrowAta(escrow2, mint2);
    const manual2 = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint2.toBuffer()], program.programId)[0];
    const manualAta2 = getAssociatedTokenAddressSync(mint2, manual2, true, TOKEN_2022);
    const buyer2 = buyerPda(mint2, program.programId);
    const pb2 = pumpAccounts(mint2, buyer2, fee2);

    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    const keys = [...Object.values(pa2) as PublicKey[], ...Object.values(pb2) as PublicKey[], escrow2, escrowTa2, mint2,
                  dev.publicKey, manual2, manualAta2, fee2, buyer2, baseAtaOf(buyer2, mint2),
                  configPda(program.programId), SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: lut, addresses: uniq.slice(i, i + 18),
      })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(lut)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1000);
    const launchIx = await program.methods
      .launch("Holder Rewards", "HR", "https://example.com/hr.json",
              new BN(100_000_000).mul(new BN(10 ** 6)), new BN(1 * LAMPORTS_PER_SOL), [...Buffer.alloc(32)], 0, 3000, true)
      .accountsPartial({
        dev: dev.publicKey, mint: mint2, escrow: escrow2, config: configPda(program.programId), escrowTokenAccount: escrowTa2,
        manualAuthority: manual2, manualTokenAccount: manualAta2, feeAuthority: fee2, ...pa2, systemProgram: SystemProgram.programId,
      }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), launchIx],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    await provider.sendAndConfirm(tx, [mintKp2], { commitment: "confirmed", skipPreflight: true, maxRetries: 10 });
    const st: any = await program.account.escrow.fetch(escrow2);
    assert.isTrue(st.isHolderReward, "flag recorded at launch");

    await expectError("setup_fee_sharing on a holder-rewards coin",
      program.methods.setupFeeSharing()
        .accountsPartial(setupFeeSharingAccounts(mint2, escrow2, program.programId, dev.publicKey, platform.publicKey))
        .rpc(provider.opts),
      /NotApplicable/, escrow2);
    await expectError("collect_fees on a holder-rewards coin",
      program.methods.collectFees()
        .accountsPartial(collectFeesAccounts(mint2, escrow2, program.programId, dev.publicKey))
        .rpc(provider.opts),
      /NotApplicable/, escrow2);
    // buyback: give the escrow something to spend so the guard is what refuses
    await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: escrow2, lamports: 0.05 * LAMPORTS_PER_SOL })]);
    const bbIx = await program.methods.buyback().accountsPartial({
      payer: dev.publicKey, escrow: escrow2, buyer: buyer2, mint: mint2,
      buyerTokenAccount: baseAtaOf(buyer2, mint2), escrowTokenAccount: escrowTa2,
      global: pb2.global, quoteMint: WSOL, quoteTokenProgram: TOKEN,
      feeRecipient: pb2.feeRecipient, associatedQuoteFeeRecipient: pb2.associatedQuoteFeeRecipient,
      buybackFeeRecipient: pb2.buybackFeeRecipient, associatedQuoteBuybackFeeRecipient: pb2.associatedQuoteBuybackFeeRecipient,
      bondingCurve: pb2.bondingCurve, associatedBaseBondingCurve: pb2.associatedBaseBondingCurve,
      associatedQuoteBondingCurve: pb2.associatedQuoteBondingCurve, associatedQuoteUser: pb2.associatedQuoteUser,
      creatorVault: pb2.creatorVault, associatedCreatorVault: pb2.associatedCreatorVault,
      sharingConfig: pb2.sharingConfig, globalVolumeAccumulator: pb2.globalVolumeAccumulator,
      userVolumeAccumulator: pb2.userVolumeAccumulator, associatedUserVolumeAccumulator: pb2.associatedUserVolumeAccumulator,
      feeConfig: pb2.feeConfig, feeProgram: pb2.feeProgram, eventAuthority: pb2.eventAuthority, pumpProgram: pb2.pumpProgram,
      baseTokenProgram: TOKEN_2022, associatedTokenProgram: pb2.associatedTokenProgram, systemProgram: SystemProgram.programId,
    }).instruction();
    const bh2 = await conn.getLatestBlockhash("confirmed");
    const msg2 = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh2.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), bbIx],
    }).compileToV0Message([lutAcc]);
    const tx2 = new VersionedTransaction(msg2);
    await expectError("buyback on a holder-rewards coin",
      provider.sendAndConfirm(tx2, [], { commitment: "confirmed", skipPreflight: false }), /NotApplicable|0x/, escrow2);
  });

  it("F6: a platform fee change needs a 7-day delay; applying early is refused", async () => {
    // the config outlives test runs on a reused ledger, so work relative to
    // whatever the rate is now
    const cfg0: any = await program.account.config.fetch(configPda(program.programId));
    const initial: number = cfg0.platformFeeBps;
    const target = initial === 500 ? 700 : 500;
    await expectError("dev proposes",
      program.methods.proposePlatformFee(500).accountsPartial({ platform: dev.publicKey, config: configPda(program.programId) })
        .rpc(provider.opts), /NotPlatform/, configPda(program.programId));
    await expectError("over 100%",
      program.methods.proposePlatformFee(10001).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
        .signers([platform]).rpc(provider.opts), /BadFeeBps/, configPda(program.programId));
    // (a proposal may already be pending on a reused ledger; then it is just "too early")
    await expectError("apply with nothing pending",
      program.methods.applyPlatformFee().accountsPartial({ config: configPda(program.programId) }).rpc(provider.opts),
      cfg0.feeEffectiveSlot.toNumber() > 0 ? /FeeChangeTooEarly/ : /NoPendingFee/, configPda(program.programId));
    const now = await conn.getSlot("confirmed");
    await program.methods.setFeeDelay(new BN(1_512_000)).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts); // 7 days, in case an earlier run narrowed it
    await program.methods.proposePlatformFee(target).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts);
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(cfg.pendingFeeBps, target);
    assert.isAtLeast(cfg.feeEffectiveSlot.toNumber(), now + 1_512_000 - 5, "effective ~7 days (1.512M slots) out");
    assert.equal(cfg.platformFeeBps, initial, "rate unchanged until applied");
    await expectError("apply early",
      program.methods.applyPlatformFee().accountsPartial({ config: configPda(program.programId) }).rpc(provider.opts),
      /FeeChangeTooEarly/, configPda(program.programId));
    const cfg2: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(cfg2.platformFeeBps, initial, "unchanged after the early attempt");

    // the delay is a test knob (platform only, floored at 5 slots) so the
    // successful path can be exercised here: re-propose with a 5-slot delay,
    // wait it out, apply, and see the new rate land on the next coin set up
    await expectError("dev sets fee delay",
      program.methods.setFeeDelay(new BN(5)).accountsPartial({ platform: dev.publicKey, config: configPda(program.programId) })
        .rpc(provider.opts), /NotPlatform/, configPda(program.programId));
    await expectError("delay under the floor",
      program.methods.setFeeDelay(new BN(1)).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
        .signers([platform]).rpc(provider.opts), /BadFeeDelay/, configPda(program.programId));
    await program.methods.setFeeDelay(new BN(5)).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts);
    await program.methods.proposePlatformFee(target).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts);
    const cfg3: any = await program.account.config.fetch(configPda(program.programId));
    const eff = cfg3.feeEffectiveSlot.toNumber();
    if ((await conn.getSlot("confirmed")) < eff) {
      await expectError("apply early (short delay)",
        program.methods.applyPlatformFee().accountsPartial({ config: configPda(program.programId) }).rpc(provider.opts),
        /FeeChangeTooEarly/, configPda(program.programId));
    }
    while ((await conn.getSlot("confirmed")) < eff) await sleep(300);
    // anyone may apply once the delay has passed
    await program.methods.applyPlatformFee().accountsPartial({ config: configPda(program.programId) }).rpc(provider.opts);
    const cfg4: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(cfg4.platformFeeBps, target, "rate applied after the delay");
    assert.equal(cfg4.pendingFeeBps, 0); assert.equal(cfg4.feeEffectiveSlot.toNumber(), 0, "proposal cleared");
    await expectError("apply twice",
      program.methods.applyPlatformFee().accountsPartial({ config: configPda(program.programId) }).rpc(provider.opts),
      /NoPendingFee/, configPda(program.programId));

    // the SEC coin was never set up: its split now uses the new 5%
    await program.methods.setupFeeSharing()
      .accountsPartial(setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, platform.publicKey))
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })])
      .rpc(provider.opts);
    const st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.feeSharingSet);
    assert.equal(st.platformFeeBps, target, "a coin set up after the change carries the new rate");
    // leave the delay at its production value
    await program.methods.setFeeDelay(new BN(1_512_000)).accountsPartial({ platform: platform.publicKey, config: configPda(program.programId) })
      .signers([platform]).rpc(provider.opts);
  });
});
