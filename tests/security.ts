/**
 * Regression tests for the findings in SECURITY_REVIEW.md. Localnet only.
 *
 *   F1  the platform authority comes from the program config, which only the
 *       upgrade authority can write — a launcher cannot name themselves
 *   F2  the test knobs (day window, delay window) answer to the platform, not
 *       the dev, so a dev cannot flag their own coin dead and ask for the pool
 *   F3  a round is a pure function of chain history: the release and slot are
 *       recorded, the allocation reproduces, and a root that pays one wallet
 *       over the 10% cap cannot pay out
 *   F4  a holder who dumped after the snapshot cannot claim; holding it again
 *       makes the claim go through
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
import { pumpAccounts, escrowPda, escrowAta, directBuyIx, TOKEN_2022, TOKEN, WSOL } from "./pump";
import { snapshot, buildTree, proofFor, Snapshot } from "../indexer/snapshot";
import { configPda, setPlatform } from "./config";

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errOf = (e: any) => String(e?.error?.errorCode?.code ?? e?.message ?? e);

describe("security review regressions (localnet)", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, {
    commitment: "confirmed", preflightCommitment: "confirmed",
  });
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
  const pa = pumpAccounts(mint, dev.publicKey, escrow);
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
    const bh = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ ...bh, feePayer: payer.publicKey }).add(...ixs);
    return sendAndConfirmTransaction(conn, tx, [payer, ...extra], { commitment: "confirmed" });
  }
  async function expectError(label: string, p: Promise<unknown>, re: RegExp) {
    try { await p; } catch (e: any) {
      assert.match(errOf(e) + JSON.stringify(e?.logs ?? ""), re, `${label}: wrong error`);
      return;
    }
    assert.fail(`${label}: should have been rejected`);
  }

  before(async () => {
    for (const k of [platform, stranger, ...holders]) {
      const sig = await conn.requestAirdrop(k.publicKey, 3 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }
  });

  it("F1: only the upgrade authority can set the platform; a launch copies it", async () => {
    const ix = await program.methods.setPlatform(stranger.publicKey).accountsPartial({
      authority: stranger.publicKey, config: configPda(program.programId), program: program.programId,
      programData: PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0],
      systemProgram: SystemProgram.programId,
    }).instruction();
    await expectError("stranger sets platform", send([ix], stranger), /NotUpgradeAuthority|custom program error/);

    await setPlatform(program, dev.publicKey, platform.publicKey);
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(cfg.platform.toBase58(), platform.publicKey.toBase58());

    // launch: LUT + v0 tx, as everywhere else
    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    const keys = [...Object.values(pa) as PublicKey[], escrow, escrowTa, mint, dev.publicKey,
                  manualPda, manualAta, configPda(program.programId), SystemProgram.programId, program.programId];
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
      .launch("Sec Test", "SEC", "https://example.com/sec.json", 3000,
              new BN(300_000_000).mul(new BN(10 ** 6)), new BN(2 * LAMPORTS_PER_SOL), [...Buffer.alloc(32)], 0)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda(program.programId), escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta, ...pa, systemProgram: SystemProgram.programId,
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
        .rpc({ commitment: "confirmed" }), /NotPlatform/);
    await expectError("dev sets delay window",
      program.methods.setDelayWindow(new BN(5)).accountsPartial({ platform: dev.publicKey, escrow })
        .rpc({ commitment: "confirmed" }), /NotPlatform/);
    await program.methods.setDelayWindow(new BN(5))
      .accountsPartial({ platform: platform.publicKey, escrow }).signers([platform]).rpc({ commitment: "confirmed" });
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
    await program.methods.checkTrigger().accountsPartial(triggerAccounts).rpc({ commitment: "confirmed" }); // baseline
    for (const h of holders) {
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directBuyIx(mint, h.publicKey, escrow, BigInt(0.1 * LAMPORTS_PER_SOL), 1n)], h);
    }
    await program.methods.checkTrigger().accountsPartial(triggerAccounts).rpc({ commitment: "confirmed" });
    let st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.armed, "volume armed the trigger");
    while ((await conn.getSlot("confirmed")) < st.fireSlot.toNumber()) await sleep(400);
    await program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve }).rpc({ commitment: "confirmed" });
    st = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.pending.gtn(0));
    const released = BigInt(st.pending.toString());

    const snapSlot = await conn.getSlot("confirmed");
    snap = await snapshot(conn.rpcEndpoint, mint.toBase58(), snapSlot, program.programId, [], released);
    assert.equal(snap.leaves.length, 2, "both holders, dev excluded automatically");
    // two holders, 10% cap: each gets exactly the cap, 80% stays pending
    const cap = released * 1000n / 10000n;
    for (const l of snap.leaves) assert.equal(l.amount, cap.toString(), "capped at 10%");
    // anyone re-running with the recorded (slot, released) gets the same root
    const again = await snapshot(conn.rpcEndpoint, mint.toBase58(), snapSlot, program.programId, [], released);
    assert.equal(again.root, snap.root, "reproducible");

    const round = roundPda(0);
    await program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total),
                 snap.leaves.length, new BN(snapSlot))
      .accountsPartial({ publisher: platform.publicKey, escrow, round, systemProgram: SystemProgram.programId })
      .signers([platform]).rpc({ commitment: "confirmed" });
    const r: any = await program.account.round.fetch(round);
    assert.equal(r.released.toString(), released.toString(), "release recorded for reproducers");
    assert.equal(r.snapshotSlot.toNumber(), snapSlot, "slot recorded for reproducers");
    st = await program.account.escrow.fetch(escrow);
    assert.equal(st.pending.toString(), (released - BigInt(snap.total)).toString(), "cap remainder stays pending");

    // a publisher who commits a root paying one wallet 40% gets nowhere: the
    // proof verifies, the program refuses the amount
    const released2 = BigInt(st.pending.toString()); // what is still pending after round 0
    const doctored = JSON.parse(JSON.stringify(snap));
    doctored.leaves[0].amount = (released2 * 4000n / 10000n).toString();
    doctored.leaves[1].amount = "0";
    const { root: badRoot, layers: badLayers } = buildTree(doctored.leaves);
    const round1 = roundPda(1);
    // a release above what is pending is refused outright: the cap is measured
    // against `released`, so it cannot be inflated either
    await expectError("inflated release",
      program.methods.openRound(1, [...badRoot], new BN((released2 + 1n).toString()), new BN(doctored.leaves[0].amount), 2, new BN(snapSlot))
        .accountsPartial({ publisher: platform.publicKey, escrow, round: round1, systemProgram: SystemProgram.programId })
        .signers([platform]).rpc({ commitment: "confirmed" }),
      /AmountNotAuthorized/);
    await program.methods
      .openRound(1, [...badRoot], new BN(released2.toString()), new BN(doctored.leaves[0].amount),
                 2, new BN(snapSlot))
      .accountsPartial({ publisher: platform.publicKey, escrow, round: round1, systemProgram: SystemProgram.programId })
      .signers([platform]).rpc({ commitment: "confirmed" });
    const l = doctored.leaves[0];
    const w = holders.find((k) => k.publicKey.toBase58() === l.holder)!;
    await expectError("over-cap leaf",
      program.methods.claimShare(l.index, new BN(l.balance), new BN(l.amount), proofFor(badLayers, l.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(w.publicKey, round1)).signers([w]).rpc({ commitment: "confirmed" }),
      /ShareOverCap/);
  });

  it("F4: a holder who dumped after the snapshot cannot claim until they hold it again", async () => {
    const round = roundPda(0);
    const { layers } = buildTree(snap.leaves);
    const leaf = snap.leaves[0];
    const winner = holders.find((k) => k.publicKey.toBase58() === leaf.holder)!;
    const other = holders.find((k) => k !== winner)!;

    // dump half the position to the other holder
    const half = BigInt(leaf.balance) / 2n;
    await send([createTransferCheckedInstruction(baseAta(winner.publicKey), mint, baseAta(other.publicKey),
      winner.publicKey, half, 6, [], TOKEN_2022)], winner);
    const claim = () => program.methods
      .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((b) => [...b]))
      .accountsPartial(claimAccounts(winner.publicKey, round)).signers([winner]).rpc({ commitment: "confirmed" });
    await expectError("claim after dumping", claim(), /HoldingBelowSnapshot/);

    // get it back, claim goes through and pays exactly the allocated amount
    await send([createTransferCheckedInstruction(baseAta(other.publicKey), mint, baseAta(winner.publicKey),
      other.publicKey, half, 6, [], TOKEN_2022)], other);
    const before = BigInt((await conn.getTokenAccountBalance(baseAta(winner.publicKey), "confirmed")).value.amount);
    await claim();
    const after = BigInt((await conn.getTokenAccountBalance(baseAta(winner.publicKey), "confirmed")).value.amount);
    assert.equal((after - before).toString(), leaf.amount);
  });
});
