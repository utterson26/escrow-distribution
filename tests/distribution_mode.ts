/**
 * Auto / Manual distribution modes. Localnet only.
 *
 *   two coins launched side by side, same 30% holder pool, same two holders
 *   plus a fixed wallet list on the Manual coin:
 *
 *   Auto    dev_distribute is refused; the volume rule arms and fires as before
 *   Manual  volume never arms a trigger; dev_distribute is the only release:
 *           a stranger is refused, more than the pool is refused, two calls in
 *           a row add up, the whole pool can go in one call, and the round
 *           built from it excludes the dev and the list — the same allocator,
 *           floor, cap and Merkle claim as an Auto round
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createHash } from "crypto";
import { assert } from "chai";
import {
  pumpAccounts, escrowPda, escrowAta, directBuyIx, feeAuthorityPda, failureText, sellBackAll, TOKEN_2022, TOKEN, WSOL, patchProvider,
} from "./pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";
import { configPda, setPlatform } from "./config";

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const MODE_AUTO = 0, MODE_MANUAL = 1;
const TRIGGER_VOLUME = 1, TRIGGER_DEV = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errOf = (e: any) => String(e?.error?.errorCode?.code ?? e?.message ?? e);
const sha = (...p: Buffer[]) => createHash("sha256").update(Buffer.concat(p)).digest();
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const manualLeaf = (index: number, wallet: PublicKey, bps: number) =>
  sha(Buffer.from("manual"), u16le(index), wallet.toBuffer(), u16le(bps));
/** the fixed list's tree, byte-identical to the program's `claim_manual` hashing */
function manualRoot(leaves: Buffer[]): Buffer {
  let level = leaves;
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) { next.push(level[i]); continue; }
      const [a, b] = [level[i], level[i + 1]];
      next.push(Buffer.compare(a, b) <= 0 ? sha(Buffer.from("node"), a, b) : sha(Buffer.from("node"), b, a));
    }
    level = next;
  }
  return level[0];
}

describe("distribution modes: Auto / Manual (localnet)", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  patchProvider(provider);
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as any;
  const conn = provider.connection;
  const dev = (provider.wallet as anchor.Wallet).payer;

  const platform = Keypair.generate();
  const stranger = Keypair.generate();
  const holders = [Keypair.generate(), Keypair.generate()];
  const listed = [Keypair.generate(), Keypair.generate()];
  const listLeaves = listed.map((k, i) => manualLeaf(i, k.publicKey, [6000, 4000][i]));
  const listRoot = manualRoot(listLeaves);

  /** everything one coin needs, keyed by mode */
  function coin(mode: number) {
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;
    const escrow = escrowPda(mint, program.programId);
    const feeAuthority = feeAuthorityPda(mint, program.programId);
    const pa = pumpAccounts(mint, dev.publicKey, feeAuthority);
    const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
    const roundPda = (i: number) => {
      const b = Buffer.alloc(4); b.writeUInt32LE(i);
      return PublicKey.findProgramAddressSync([Buffer.from("round"), escrow.toBuffer(), b], program.programId)[0];
    };
    return {
      mode, mintKp, mint, escrow, feeAuthority, pa, manualPda, roundPda,
      escrowTa: escrowAta(escrow, mint),
      manualAta: getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022),
      baseAta: (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true, TOKEN_2022),
      trigger: { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES },
    };
  }
  const AUTO = coin(MODE_AUTO), MANUAL = coin(MODE_MANUAL);
  type Coin = typeof AUTO;

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
  async function expectError(label: string, p: Promise<unknown>, re: RegExp, addr: PublicKey) {
    try { await p; } catch (e: any) {
      assert.match(errOf(e) + (await failureText(conn, e, addr)), re, `${label}: wrong error`);
      return;
    }
    assert.fail(`${label}: should have been rejected`);
  }
  const state = async (c: Coin) => (await program.account.escrow.fetch(c.escrow)) as any;
  const pool = (st: any) => BigInt(st.escrowed.toString()) - BigInt(st.allocated.toString()) - BigInt(st.pending.toString());

  async function launch(c: Coin, manualBps: number, root: Buffer) {
    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({ authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot });
    const keys = [...Object.values(c.pa) as PublicKey[], c.escrow, c.escrowTa, c.mint, c.feeAuthority, dev.publicKey, c.manualPda, c.manualAta,
                  configPda(program.programId), SystemProgram.programId, program.programId];
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
    await sleep(1000);
    const ix = await program.methods
      .launch(c.mode === MODE_AUTO ? "Auto Mode" : "Manual Mode", c.mode === MODE_AUTO ? "AUTO" : "MANL", "https://example.com/mode.json",
              new BN(300_000_000).mul(new BN(10 ** 6)), new BN(2 * LAMPORTS_PER_SOL), [...root], manualBps, 3000, false, c.mode)
      .accountsPartial({
        dev: dev.publicKey, mint: c.mint, escrow: c.escrow, config: configPda(program.programId), escrowTokenAccount: c.escrowTa,
        manualAuthority: c.manualPda, manualTokenAccount: c.manualAta, feeAuthority: c.feeAuthority, ...c.pa, systemProgram: SystemProgram.programId,
      }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
    }).compileToV0Message([lutAcc]);
    await provider.sendAndConfirm(new VersionedTransaction(msg), [c.mintKp], { commitment: "confirmed", skipPreflight: true, maxRetries: 10 });
  }

  /** the same market on both coins: two holders buy 0.15 SOL each, volume is sampled before and after */
  async function trade(c: Coin) {
    for (const h of holders) {
      await send([
        createAssociatedTokenAccountIdempotentInstruction(h.publicKey, c.baseAta(h.publicKey), h.publicKey, c.mint, TOKEN_2022),
        createAssociatedTokenAccountIdempotentInstruction(h.publicKey, getAssociatedTokenAddressSync(WSOL, h.publicKey, true, TOKEN), h.publicKey, WSOL, TOKEN),
      ], h);
    }
    await program.methods.checkTrigger().accountsPartial(c.trigger).rpc(provider.opts); // baseline
    for (const h of holders) {
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directBuyIx(c.mint, h.publicKey, c.feeAuthority, BigInt(0.15 * LAMPORTS_PER_SOL), 1n)], h);
    }
    await program.methods.checkTrigger().accountsPartial(c.trigger).rpc(provider.opts);
  }

  const devDistribute = (c: Coin, amount: bigint, signer: Keypair = dev) =>
    program.methods.devDistribute(new BN(amount.toString()))
      .accountsPartial({ dev: signer.publicKey, escrow: c.escrow }).signers(signer === dev ? [] : [signer]).rpc(provider.opts);

  const local = /127\.0\.0\.1|localhost/.test(conn.rpcEndpoint);
  const throwaways = [platform, stranger, ...holders, ...listed];
  before(async () => {
    // localnet has a faucet; on devnet the dev wallet funds the throwaway keys
    for (const k of throwaways) {
      if (local) {
        const sig = await conn.requestAirdrop(k.publicKey, 3 * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, "confirmed");
      } else {
        // holders buy 0.15 + 0.6 SOL on the Manual coin and 0.15 on the Auto coin; the rest only pay fees
        const sol = holders.includes(k) ? 1.0 : 0.05;
        await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: k.publicKey, lamports: sol * LAMPORTS_PER_SOL })]);
      }
    }
    await setPlatform(program, dev.publicKey, platform.publicKey);
    const platformOnly = { platform: platform.publicKey, config: configPda(program.programId) };
    await program.methods.setPublishers([platform.publicKey, PublicKey.default, PublicKey.default, PublicKey.default])
      .accountsPartial(platformOnly).signers([platform]).rpc(provider.opts);
  });

  after(async () => {
    if (local) return;
    // off localnet the throwaway keys give their SOL back and the dev's positions are sold
    let swept = 0;
    for (const k of throwaways) {
      try {
        const bal = await conn.getBalance(k.publicKey, "confirmed");
        if (bal <= 900_000) continue;
        await send([SystemProgram.transfer({ fromPubkey: k.publicKey, toPubkey: dev.publicKey, lamports: bal - 900_000 })], dev, [k]);
        swept += bal - 900_000;
      } catch { /* best effort */ }
    }
    for (const c of [AUTO, MANUAL]) {
      try { swept += await sellBackAll(conn, dev, c.mint, c.feeAuthority); } catch (e: any) { console.log(`  sell-back skipped: ${String(e?.message ?? e).slice(0, 80)}`); }
    }
    console.log(`  swept ${swept / LAMPORTS_PER_SOL} SOL back`);
  });

  it("launch fixes the mode; anything but Auto / Manual is refused", async () => {
    await launch(AUTO, 0, Buffer.alloc(32));
    await launch(MANUAL, 500, listRoot); // 5% of the buy to a two-wallet list
    assert.equal((await state(AUTO)).distributionMode, MODE_AUTO);
    assert.equal((await state(MANUAL)).distributionMode, MODE_MANUAL);
    assert.equal((await state(MANUAL)).manualBps, 500, "the fixed list works in Manual mode too");
    // there is no instruction that changes the mode: the only writers of the
    // escrow are listed here, and none of them touches `distribution_mode`
    const writers = program.idl.instructions.map((i: any) => i.name);
    assert.notInclude(writers, "set_distribution_mode");
    const bad = coin(2);
    await expectError("mode 2", launch(bad, 0, Buffer.alloc(32)), /BadDistributionMode/, bad.escrow);
  });

  it("Auto: dev_distribute is refused; the volume rule releases as before", async () => {
    await expectError("dev_distribute on an Auto coin", devDistribute(AUTO, 1_000_000n), /NotManualMode/, AUTO.escrow);
    await program.methods.setDelayWindow(new BN(5)).accountsPartial({ platform: platform.publicKey, escrow: AUTO.escrow }).signers([platform]).rpc(provider.opts);
    await trade(AUTO);
    let st = await state(AUTO);
    assert.isTrue(st.armed, "volume armed the Auto coin");
    assert.equal(st.armedKind, TRIGGER_VOLUME);
    while ((await conn.getSlot("confirmed")) < st.fireSlot.toNumber()) await sleep(400);
    await program.methods.fireTrigger().accountsPartial({ escrow: AUTO.escrow, bondingCurve: AUTO.pa.bondingCurve }).rpc(provider.opts);
    st = await state(AUTO);
    assert.isTrue(st.pending.gtn(0), "the fired trigger released tokens");
    assert.equal(st.pendingKind, TRIGGER_VOLUME, "the release remembers what caused it");
    // still refused, even with tokens pending
    await expectError("dev_distribute after a fire", devDistribute(AUTO, 1n), /NotManualMode/, AUTO.escrow);
  });

  it("Manual: the same market never arms a trigger", async () => {
    await trade(MANUAL);
    const st = await state(MANUAL);
    assert.isFalse(st.armed, "Manual coin did not arm on the same volume");
    assert.equal(st.pending.toString(), "0");
    assert.isTrue(st.cumVolume.gtn(0), "volume is still sampled (dead-coin tracking)");
    assert.isTrue(st.lastMilestoneMcap.gtn(0), "the milestone baseline is still recorded");
    // and pump's price moving 2x would not either: the arm path is skipped before the rule
    for (const h of holders) {
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directBuyIx(MANUAL.mint, h.publicKey, MANUAL.feeAuthority, BigInt(0.6 * LAMPORTS_PER_SOL), 1n)], h);
    }
    await program.methods.checkTrigger().accountsPartial(MANUAL.trigger).rpc(provider.opts);
    assert.isFalse((await state(MANUAL)).armed, "no milestone arm either");
  });

  it("Manual: only the dev, only up to the pool; calls add up; the whole pool fits in one call", async () => {
    let st = await state(MANUAL);
    const full = pool(st);
    await expectError("stranger", devDistribute(MANUAL, 1_000_000n, stranger), /NotDev|ConstraintRaw|2003/, MANUAL.escrow);
    await expectError("platform (not the dev)", devDistribute(MANUAL, 1_000_000n, platform), /NotDev|ConstraintRaw|2003/, MANUAL.escrow);
    await expectError("zero", devDistribute(MANUAL, 0n), /ZeroAmount/, MANUAL.escrow);
    await expectError("more than the pool", devDistribute(MANUAL, full + 1n), /OverPool/, MANUAL.escrow);

    // two calls in a row: pending accumulates, the pool shrinks by the same
    const a = full / 10n, b = full / 20n;
    await devDistribute(MANUAL, a);
    st = await state(MANUAL);
    assert.equal(st.pending.toString(), a.toString());
    assert.equal(st.pendingKind, TRIGGER_DEV);
    await devDistribute(MANUAL, b);
    st = await state(MANUAL);
    assert.equal(st.pending.toString(), (a + b).toString(), "two calls add up");
    assert.equal(pool(st).toString(), (full - a - b).toString(), "what is pending is no longer in the pool");
    await expectError("more than what is left", devDistribute(MANUAL, full - a - b + 1n), /OverPool/, MANUAL.escrow);
    // the rest of the pool, in one call — pending now equals the entire holder pool
    await devDistribute(MANUAL, full - a - b);
    st = await state(MANUAL);
    assert.equal(st.pending.toString(), full.toString(), "the whole pool can be released at once");
    assert.equal(pool(st).toString(), "0");
    await expectError("pool is empty", devDistribute(MANUAL, 1n), /OverPool/, MANUAL.escrow);
    // and it is still in the escrow token account: nothing moved anywhere
    const held = BigInt((await conn.getTokenAccountBalance(MANUAL.escrowTa, "confirmed")).value.amount);
    assert.isTrue(held >= full, "released tokens stay in the escrow until holders claim");
  });

  it("Manual: the round is the same allocator — dev and list excluded, floor, cap, Merkle claim", async () => {
    const st = await state(MANUAL);
    const released = BigInt(st.pending.toString());
    const snapSlot = await conn.getSlot("confirmed");
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    const floor = BigInt(cfg.minPositionLamports.toString()) || 100_000_000n;
    const snap = await snapshot(conn.rpcEndpoint, MANUAL.mint.toBase58(), snapSlot, program.programId, [], released, floor);
    const who = snap.leaves.map((l) => l.holder);
    assert.equal(who.length, 2, "exactly the two holders");
    assert.notInclude(who, dev.publicKey.toBase58(), "dev excluded");
    assert.notInclude(who, MANUAL.manualPda.toBase58(), "fixed-list account excluded");
    assert.notInclude(who, MANUAL.escrow.toBase58(), "escrow excluded");
    for (const k of listed) assert.notInclude(who, k.publicKey.toBase58(), "listed wallets hold nothing yet, so they are not in the pool round");
    assert.equal(snap.total, released.toString(), "below the cap threshold the whole release is split");

    const round = MANUAL.roundPda(0);
    // index must be the next in sequence
    await expectError("round index 1 before 0",
      program.methods.openRound(1, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total), snap.leaves.length, new BN(snapSlot))
        .accountsPartial({ publisher: platform.publicKey, escrow: MANUAL.escrow, round: MANUAL.roundPda(1), systemProgram: SystemProgram.programId })
        .signers([platform]).rpc(provider.opts), /BadRoundIndex/, MANUAL.roundPda(1));
    await program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total), snap.leaves.length, new BN(snapSlot))
      .accountsPartial({ publisher: platform.publicKey, escrow: MANUAL.escrow, round, systemProgram: SystemProgram.programId })
      .signers([platform]).rpc(provider.opts);
    const r: any = await program.account.round.fetch(round);
    assert.equal(r.triggerKind, TRIGGER_DEV, "the round records that the dev released it");
    assert.equal(r.released.toString(), released.toString());
    const after = await state(MANUAL);
    assert.equal(after.roundsOpened, 1);
    assert.equal(after.pending.toString(), "0");
    assert.equal(after.pendingKind, 0);

    // one holder claims with a proof; the dev cannot (not in the tree)
    const { layers } = buildTree(snap.leaves);
    const claimAccounts = (h: PublicKey) => ({
      holder: h, escrow: MANUAL.escrow, round, mint: MANUAL.mint, escrowTokenAccount: MANUAL.escrowTa, holderTokenAccount: MANUAL.baseAta(h),
      receipt: PublicKey.findProgramAddressSync([Buffer.from("receipt"), round.toBuffer(), h.toBuffer()], program.programId)[0],
      bondingCurve: MANUAL.pa.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
    });
    const leaf = snap.leaves.find((l) => l.holder === holders[0].publicKey.toBase58())!;
    const before = BigInt((await conn.getTokenAccountBalance(MANUAL.baseAta(holders[0].publicKey), "confirmed")).value.amount);
    await program.methods.claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((b) => [...b]))
      .accountsPartial(claimAccounts(holders[0].publicKey)).signers([holders[0]]).rpc(provider.opts);
    const got = BigInt((await conn.getTokenAccountBalance(MANUAL.baseAta(holders[0].publicKey), "confirmed")).value.amount) - before;
    assert.equal(got.toString(), leaf.amount, "holder received exactly the leaf amount");
    await send([createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, MANUAL.baseAta(dev.publicKey), dev.publicKey, MANUAL.mint, TOKEN_2022)]);
    await expectError("dev claims with a holder's leaf",
      program.methods.claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(dev.publicKey)).rpc(provider.opts), /BadProof/, round);

    // Auto coin: its pending volume release opens a round the same way, tagged as such
    const st2 = await state(AUTO);
    const rel2 = BigInt(st2.pending.toString());
    const slot2 = await conn.getSlot("confirmed");
    const snap2 = await snapshot(conn.rpcEndpoint, AUTO.mint.toBase58(), slot2, program.programId, [], rel2, floor);
    await program.methods
      .openRound(0, [...Buffer.from(snap2.root, "hex")], new BN(rel2.toString()), new BN(snap2.total), snap2.leaves.length, new BN(slot2))
      .accountsPartial({ publisher: platform.publicKey, escrow: AUTO.escrow, round: AUTO.roundPda(0), systemProgram: SystemProgram.programId })
      .signers([platform]).rpc(provider.opts);
    assert.equal(((await program.account.round.fetch(AUTO.roundPda(0))) as any).triggerKind, TRIGGER_VOLUME);
  });
});
