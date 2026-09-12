/**
 * Regression tests for the findings in SECURITY_REVIEW.md. Localnet only.
 *
 *   F1  the platform authority comes from the program config, which only the
 *       upgrade authority can write — a launcher cannot name themselves
 *   F2  the test knobs (day window, delay window) answer to the platform, not
 *       the dev, so a dev cannot flag their own coin dead and ask for the pool
 *   F3  the draw seed is the hash of a slot fixed at commit time: calling early
 *       fails, and the seed is exactly what the SlotHashes sysvar says
 *   F4  a winner who dumped after the snapshot cannot claim; holding it again
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
import { createHash } from "crypto";
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

  it("F3: the draw seed is pinned to the slot fixed at commit time", async () => {
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

    const snapSlot = await conn.getSlot("confirmed");
    snap = await snapshot(conn.rpcEndpoint, mint.toBase58(), snapSlot, program.programId);
    assert.equal(snap.leaves.length, 2, "both holders, dev excluded automatically");
    const winners = 4;
    const prize = st.pending.divn(winners);
    const round = roundPda(0);
    await program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(snap.totalWeight), winners, prize, new BN(snapSlot))
      .accountsPartial({ publisher: platform.publicKey, escrow, round, systemProgram: SystemProgram.programId })
      .signers([platform]).rpc({ commitment: "confirmed" });
    const r: any = await program.account.round.fetch(round);
    assert.equal(r.drawSlot.toNumber(), r.commitSlot.toNumber() + 2, "draw slot fixed two slots after the commit");

    // too early: the slot whose hash seeds the draw has not finished yet
    if ((await conn.getSlot("confirmed")) <= r.drawSlot.toNumber()) {
      await expectError("early draw",
        program.methods.draw().accountsPartial({ round, slotHashes: SLOT_HASHES }).rpc({ commitment: "confirmed" }),
        /DrawTooEarly/);
    }
    while ((await conn.getSlot("confirmed")) <= r.drawSlot.toNumber()) await sleep(300);
    await program.methods.draw().accountsPartial({ round, slotHashes: SLOT_HASHES }).rpc({ commitment: "confirmed" });
    const drawn: any = await program.account.round.fetch(round);
    assert.isTrue(drawn.drawn);

    // recompute the seed from the sysvar: the oldest entry with slot >= draw_slot
    const sys = (await conn.getAccountInfo(SLOT_HASHES, "confirmed"))!.data;
    const count = Number(sys.readBigUInt64LE(0));
    let pick = -1;
    for (let i = 0; i < count; i++) {
      const s = Number(sys.readBigUInt64LE(8 + i * 40));
      if (s >= r.drawSlot.toNumber()) pick = i; else break;
    }
    assert.isAtLeast(pick, 0, "draw slot still inside the sysvar window");
    const off = 8 + pick * 40;
    const slotBytes = sys.subarray(off, off + 8), hash = sys.subarray(off + 8, off + 40);
    const expected = createHash("sha256")
      .update(Buffer.concat([hash, slotBytes, round.toBuffer(), Buffer.from(snap.root, "hex")])).digest();
    assert.equal(Buffer.from(drawn.seed).toString("hex"), expected.toString("hex"),
      "seed is exactly the hash of the pre-committed slot, not of whatever slot the caller picked");
  });

  it("F4: a winner who dumped after the snapshot cannot claim until they hold it again", async () => {
    const round = roundPda(0);
    const r: any = await program.account.round.fetch(round);
    const { layers } = buildTree(snap.leaves);
    const total = BigInt(snap.totalWeight);
    const le16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
    const h = createHash("sha256").update(Buffer.concat([Buffer.from(r.seed), le16(0)])).digest();
    let ticket = 0n; for (let i = 15; i >= 0; i--) ticket = (ticket << 8n) | BigInt(h[i]);
    ticket %= total;
    const leaf = snap.leaves.find((l) => BigInt(l.cumStart) <= ticket && ticket < BigInt(l.cumStart) + BigInt(l.weight))!;
    const winner = holders.find((k) => k.publicKey.toBase58() === leaf.holder)!;
    const other = holders.find((k) => k !== winner)!;

    // dump half the position to the other holder
    const half = BigInt(leaf.balance) / 2n;
    await send([createTransferCheckedInstruction(baseAta(winner.publicKey), mint, baseAta(other.publicKey),
      winner.publicKey, half, 6, [], TOKEN_2022)], winner);
    const claim = () => program.methods
      .claimPrize(0, leaf.index, new BN(leaf.balance), new BN(leaf.weight), new BN(leaf.cumStart),
                  proofFor(layers, leaf.index).map((b) => [...b]))
      .accountsPartial({
        holder: winner.publicKey, escrow, round, mint, escrowTokenAccount: escrowTa,
        holderTokenAccount: baseAta(winner.publicKey), bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
      }).signers([winner]).rpc({ commitment: "confirmed" });
    await expectError("claim after dumping", claim(), /HoldingBelowSnapshot/);

    // get it back, claim goes through and pays exactly one prize
    await send([createTransferCheckedInstruction(baseAta(other.publicKey), mint, baseAta(winner.publicKey),
      other.publicKey, half, 6, [], TOKEN_2022)], other);
    const before = BigInt((await conn.getTokenAccountBalance(baseAta(winner.publicKey), "confirmed")).value.amount);
    await claim();
    const after = BigInt((await conn.getTokenAccountBalance(baseAta(winner.publicKey), "confirmed")).value.amount);
    assert.equal((after - before).toString(), r.prize.toString());
  });
});
