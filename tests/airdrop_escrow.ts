import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
  getAssociatedTokenAddressSync, createTransferCheckedInstruction,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import {
  pumpAccounts, escrowPda, escrowAta, buyerPda, baseAtaOf,
  TOKEN_2022, WSOL, TOKEN,
} from "./pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";
import { createHash } from "crypto";

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const leBytesToBigInt = (b: Buffer) => {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
};
const roundPda = (escrow: PublicKey, index: number, program: PublicKey) => {
  const b = Buffer.alloc(4); b.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), escrow.toBuffer(), b], program)[0];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      last = e;
      const m = String(e?.message ?? e);
      if (!/Blockhash not found|block height exceeded|429|Too Many Requests|timed out/i.test(m)) throw e;
      console.log(`  retry ${label} (${i + 1}/${tries}): ${m.slice(0, 80)}`);
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

describe("airdrop_escrow (devnet)", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, {
    commitment: "confirmed", preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as any;
  const conn = provider.connection;
  const dev = (provider.wallet as anchor.Wallet).payer;

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const pa = pumpAccounts(mint, dev.publicKey, escrow);
  const escrowTa = escrowAta(escrow, mint);
  // the dataless PDA that signs the pump buy on the escrow's behalf
  const buyer = buyerPda(mint, program.programId);
  const buyerTa = baseAtaOf(buyer, mint);
  const pb = pumpAccounts(mint, buyer, escrow); // pump accounts keyed on the buyer
  const baseAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
  const quoteAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(WSOL, owner, true, TOKEN);

  // 7 wallets: 5 that should qualify, 1 that sells out, 1 below the minimum
  const holders = Array.from({ length: 7 }, () => Keypair.generate());
  const GRANT = [25, 30, 35, 40, 45, 30, 5].map((m) => new BN(m).mul(new BN(1_000_000)).mul(new BN(10 ** 6)));
  const SELLS_OUT = 5;   // receives, then sends everything back
  const TOO_SMALL = 6;   // 5M tokens, under 0.05 SOL
  let snap: any;
  let lut: PublicKey;
  const sigs: Record<string, string> = {};

  /** send a legacy tx built from `ixs`, retrying transient RPC failures */
  async function send(ixs: any[], signers: Keypair[] = []): Promise<string> {
    return withRetry("tx", async () => {
      const bh = await conn.getLatestBlockhash("finalized");
      const tx = new anchor.web3.Transaction({ ...bh, feePayer: dev.publicKey }).add(...ixs);
      // skipPreflight: the public devnet RPC routinely fails simulation with
      // "Blockhash not found" on a blockhash it just handed out. These txs are
      // simple and deterministic, so confirm the landed tx instead of simulating.
      return await provider.sendAndConfirm(tx, signers, {
        commitment: "confirmed", skipPreflight: true, maxRetries: 5,
      });
    });
  }

  after(() => {
    console.log("\n=== devnet signatures ===");
    console.log(JSON.stringify({ mint: mint.toBase58(), escrow: escrow.toBase58(), ...sigs }, null, 2));
  });

  it("sets up an address lookup table", async () => {
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const keys = [
      ...Object.values(pa) as PublicKey[],
      ...Object.values(pb) as PublicKey[],
      escrow, escrowTa, mint, dev.publicKey, buyer, buyerTa,
      SystemProgram.programId, program.programId,
    ];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];

    sigs.lut = await send([createIx]);
    // one extend per chunk: 32 bytes/address does not fit in a single legacy tx
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey,
        lookupTable: addr, addresses: uniq.slice(i, i + 18),
      })]);
    }
    console.log(`  LUT ${addr.toBase58()} (${uniq.length} addrs) ${sigs.lut}`);
    // a lookup table is only usable one slot after it is extended
    await sleep(2000);
  });

  it("1. launch: create_v2 + buy_v2 in one atomic tx", async () => {
    // large enough that a real position clears the 0.05 SOL minimum
    const amount = new BN(400_000_000).mul(new BN(10 ** 6));
    const maxSolCost = new BN(1.5 * LAMPORTS_PER_SOL);
    const escrowBps = 3000; // 30% to escrow

    const ix = await program.methods
      .launch("Airdrop Test", "ADT", "https://example.com/adt.json", escrowBps, amount, maxSolCost)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, escrowTokenAccount: escrowTa,
        ...pa, systemProgram: SystemProgram.programId,
      })
      .instruction();

    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    assert.isNotNull(lutAcc, "lookup table must be fetchable");
    const sig = await withRetry("launch", async () => {
      const bh = await conn.getLatestBlockhash("finalized");
      const msg = new TransactionMessage({
        payerKey: dev.publicKey,
        recentBlockhash: bh.blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
      }).compileToV0Message([lutAcc]);
      const tx = new VersionedTransaction(msg);
      tx.sign([dev, mintKp]);
      console.log(`  tx size: ${tx.serialize().length} bytes`);
      const s = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
      await conn.confirmTransaction({ signature: s, ...bh }, "confirmed");
      return s;
    });
    sigs.launch = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.mint.toBase58(), mint.toBase58());
    assert.equal(st.escrowBps, escrowBps);
    assert.equal(st.bought.toString(), amount.toString());
    const expectedCut = amount.muln(escrowBps).divn(10_000);
    assert.equal(st.escrowed.toString(), expectedCut.toString());

    const esc = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.equal(esc.amount.toString(), expectedCut.toString(), "escrow ATA balance");
    const devTa = await getAccount(conn, pa.associatedBaseUser, "confirmed", TOKEN_2022);
    assert.equal(devTa.amount.toString(), amount.sub(expectedCut).toString(), "dev keeps the rest");
    console.log(`  escrow=${esc.amount} dev=${devTa.amount} sig=${sig}`);
  });

  it("2. collect_fees: escrow PDA sweeps the pump creator vault via CPI", async () => {
    const before = await conn.getBalance(escrow, "confirmed");
    const sig = await withRetry("collect_fees", () => program.methods
      .collectFees()
      .accountsPartial({
        payer: dev.publicKey, escrow,
        creatorTokenAccount: quoteAta(escrow),
        creatorVault: pa.creatorVault,
        creatorVaultTokenAccount: quoteAta(pa.creatorVault),
        quoteMint: WSOL, quoteTokenProgram: TOKEN,
        associatedTokenProgram: pa.associatedTokenProgram,
        eventAuthority: pa.eventAuthority, pumpProgram: pa.pumpProgram,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" }));
    sigs.collectFees = sig;
    const after = await conn.getBalance(escrow, "confirmed");
    const st: any = await program.account.escrow.fetch(escrow);
    console.log(`  escrow lamports ${before} -> ${after}, recorded=${st.feesCollected} sig=${sig}`);
    assert.isAtLeast(after, before, "escrow must not lose lamports");
  });

  /** every account `buyback` needs, shared by both buyback tests */
  const buybackAccounts = () => ({
    payer: dev.publicKey, escrow, buyer, mint,
    buyerTokenAccount: buyerTa, escrowTokenAccount: escrowTa,
    global: pb.global, quoteMint: WSOL, quoteTokenProgram: TOKEN,
    feeRecipient: pb.feeRecipient,
    associatedQuoteFeeRecipient: pb.associatedQuoteFeeRecipient,
    buybackFeeRecipient: pb.buybackFeeRecipient,
    associatedQuoteBuybackFeeRecipient: pb.associatedQuoteBuybackFeeRecipient,
    bondingCurve: pb.bondingCurve,
    associatedBaseBondingCurve: pb.associatedBaseBondingCurve,
    associatedQuoteBondingCurve: pb.associatedQuoteBondingCurve,
    associatedQuoteUser: pb.associatedQuoteUser,
    creatorVault: pb.creatorVault,
    associatedCreatorVault: pb.associatedCreatorVault,
    sharingConfig: pb.sharingConfig,
    globalVolumeAccumulator: pb.globalVolumeAccumulator,
    userVolumeAccumulator: pb.userVolumeAccumulator,
    associatedUserVolumeAccumulator: pb.associatedUserVolumeAccumulator,
    feeConfig: pb.feeConfig, feeProgram: pb.feeProgram,
    eventAuthority: pb.eventAuthority, pumpProgram: pb.pumpProgram,
    baseTokenProgram: TOKEN_2022, associatedTokenProgram: pb.associatedTokenProgram,
    systemProgram: SystemProgram.programId,
  });

  async function sendBuyback(
    label: string, overrides: Record<string, PublicKey> = {},
  ): Promise<string> {
    const ix = await program.methods.buyback()
      .accountsPartial({ ...buybackAccounts(), ...overrides }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    return withRetry(label, async () => {
      const bh = await conn.getLatestBlockhash("finalized");
      const msg = new TransactionMessage({
        payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
      }).compileToV0Message([lutAcc]);
      const tx = new VersionedTransaction(msg);
      tx.sign([dev]);
      const sg = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
      await conn.confirmTransaction({ signature: sg, ...bh }, "confirmed");
      return sg;
    });
  }

  it("2b. buyback below the threshold is a no-op", async () => {
    const lamports = await conn.getBalance(escrow, "confirmed");
    const escBefore = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    const stBefore: any = await program.account.escrow.fetch(escrow);
    // only the swept creator fee is in there, far below MIN_BUYBACK_LAMPORTS (0.01 SOL)
    assert.isBelow(lamports, 10_000_000, "escrow must be under the threshold here");

    const sig = await sendBuyback("buyback-noop");
    sigs.buybackNoop = sig;

    const escAfter = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    const stAfter: any = await program.account.escrow.fetch(escrow);
    assert.equal(escAfter.amount.toString(), escBefore.amount.toString(), "no tokens bought");
    assert.equal(stAfter.buybackSpent.toString(), stBefore.buybackSpent.toString(), "nothing spent");
    assert.equal(await conn.getBalance(escrow, "confirmed"), lamports, "escrow SOL untouched");
    console.log(`  no-op at ${lamports} lamports (< 0.01 SOL) sig=${sig}`);
  });

  it("2c. buyback above the threshold converts escrow SOL into the coin", async () => {
    // top the escrow up so it clears MIN_BUYBACK_LAMPORTS + the rent reserve
    await send([SystemProgram.transfer({
      fromPubkey: dev.publicKey, toPubkey: escrow, lamports: 0.06 * LAMPORTS_PER_SOL,
    })]);
    const solBefore = await conn.getBalance(escrow, "confirmed");
    const escBefore = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);

    const sig = await sendBuyback("buyback");
    sigs.buyback = sig;

    const solAfter = await conn.getBalance(escrow, "confirmed");
    const escAfter = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    const st: any = await program.account.escrow.fetch(escrow);

    assert.isAbove(Number(escAfter.amount - escBefore.amount), 0, "escrow gained coin");
    assert.equal(st.buybackTokens.toString(), (escAfter.amount - escBefore.amount).toString(),
      "buyback_tokens matches the ATA delta");
    assert.isBelow(solAfter, solBefore, "escrow SOL was spent");
    assert.isTrue(st.escrowed.gte(st.allocated), "escrowed still covers allocations");
    // the program quoted the curve itself; the fill must clear quote - 2%
    const ev = (await conn.getTransaction(sig, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    }))!.meta!.logMessages!.join("\n");
    assert.match(ev, /Instruction: BuyExactQuoteInV2/, "went through the pump v2 buy");
    const bought = Number(escAfter.amount - escBefore.amount);
    assert.isAbove(bought, 0, "tokens received");
    console.log(`  SOL ${solBefore} -> ${solAfter}, coin +${escAfter.amount - escBefore.amount}`);
    console.log(`  buyback_spent=${st.buybackSpent} buyback_tokens=${st.buybackTokens} sig=${sig}`);
  });

  it("2d. sandwich: a non-canonical bonding curve is rejected", async () => {
    // Top the escrow back up so any failure is about the curve, not about funds.
    await send([SystemProgram.transfer({
      fromPubkey: dev.publicKey, toPubkey: escrow, lamports: 0.05 * LAMPORTS_PER_SOL,
    })]);
    const solBefore = await conn.getBalance(escrow, "confirmed");
    const escBefore = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);

    // The program now derives its own price floor from the bonding curve, so the
    // curve account is attacker-reachable input. Feeding it a curve with different
    // reserves would quote a lower floor and let a sandwich through. Both shapes of
    // that attack must be refused before anything is spent.
    const cases: Array<[string, PublicKey]> = [
      // a real, pump-owned BondingCurve — but for a different coin
      ["foreign pump curve", new PublicKey("EED8ipKJRM2k4ezSNEgzK1TaNgMkaNQrs1HaAVHqy3pz")],
      // an address that is not a bonding curve at all
      ["non-existent curve", PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), Keypair.generate().publicKey.toBuffer()],
        new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"))[0]],
    ];

    for (const [label, curve] of cases) {
      let detail = "";
      try {
        await sendBuyback("buyback-forged", { bondingCurve: curve });
        assert.fail(`${label}: buyback should have been rejected`);
      } catch (e: any) {
        detail = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);
      }
      // 2006 ConstraintSeeds / 3007 wrong owner / 3012 not initialized — whichever
      // applies, the point is the program refuses to quote from a non-canonical account.
      assert.match(detail, /ConstraintSeeds|0x7d6|0xbbf|0xbc4|seeds constraint/i,
        `${label}: expected an account-validation rejection, got ${detail.slice(0, 200)}`);
      console.log(`  ${label} rejected`);
    }

    // Nothing was spent by the rejected attempts.
    assert.equal(await conn.getBalance(escrow, "confirmed"), solBefore, "escrow SOL untouched");
    const escMid = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.equal(escMid.amount.toString(), escBefore.amount.toString(), "no tokens moved");

    // Control: the same funds buy fine against the canonical curve, so the
    // rejections above were about the account, not about the money.
    const sig = await sendBuyback("buyback-control");
    sigs.buybackAfterForged = sig;
    const escAfter = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.isAbove(Number(escAfter.amount - escBefore.amount), 0,
      "canonical curve still buys with the same funds");
    console.log(`  control buy ok, +${escAfter.amount - escBefore.amount} sig=${sig}`);
  });

  it("3. holders are funded on chain", async () => {
    for (let i = 0; i < holders.length; i++) {
      const ata = baseAta(holders[i].publicKey);
      await send([
        SystemProgram.transfer({
          fromPubkey: dev.publicKey, toPubkey: holders[i].publicKey,
          lamports: 0.02 * LAMPORTS_PER_SOL,
        }),
        createAssociatedTokenAccountIdempotentInstruction(
          dev.publicKey, ata, holders[i].publicKey, mint, TOKEN_2022),
        createTransferCheckedInstruction(
          pa.associatedBaseUser, mint, ata, dev.publicKey,
          BigInt(GRANT[i].toString()), 6, [], TOKEN_2022),
      ]);
    }
    // one of them sells out completely — must drop out of the snapshot
    await send([createTransferCheckedInstruction(
      baseAta(holders[SELLS_OUT].publicKey), mint, pa.associatedBaseUser,
      holders[SELLS_OUT].publicKey, BigInt(GRANT[SELLS_OUT].toString()), 6, [], TOKEN_2022,
    )], [holders[SELLS_OUT]]);

    const sold = await getAccount(conn, baseAta(holders[SELLS_OUT].publicKey), "confirmed", TOKEN_2022);
    assert.equal(sold.amount.toString(), "0", "seller is flat");
    console.log(`  ${holders.length} holder funded; #${SELLS_OUT} sold out, #${TOO_SMALL} is dust`);
  });

  it("4. indexer builds a deterministic snapshot", async () => {
    const slot = await conn.getSlot("confirmed");
    // the dev wallet is the treasury here, not an airdrop participant
    snap = await snapshot(process.env.HELIUS_RPC_URL!, mint.toBase58(), slot,
                          program.programId, [dev.publicKey.toBase58()]);
    assert.equal(snap.leaves.length, 5, "exactly the 5 qualifying holders");

    const inSnap = new Set(snap.leaves.map((l: any) => l.holder));
    assert.isFalse(inSnap.has(holders[SELLS_OUT].publicKey.toBase58()), "seller excluded");
    assert.isFalse(inSnap.has(holders[TOO_SMALL].publicKey.toBase58()), "dust position excluded");
    for (const i of [0, 1, 2, 3, 4]) {
      assert.isTrue(inSnap.has(holders[i].publicKey.toBase58()), `holder ${i} present`);
    }
    // weights are balance x slots held, and cum ranges must tile the line
    let cum = 0n;
    for (const l of snap.leaves) {
      assert.equal(l.cumStart, cum.toString(), "cumulative ranges are contiguous");
      cum += BigInt(l.weight);
    }
    assert.equal(cum.toString(), snap.totalWeight);

    // same inputs -> same root, recomputed from the leaves alone
    const { root } = buildTree(snap.leaves);
    assert.equal(root.toString("hex"), snap.root, "root recomputes from leaves");
    fs.writeFileSync("snapshot.json", JSON.stringify(snap, null, 2));
    console.log(`  ${snap.leaves.length} uygun holder, root=${snap.root.slice(0, 16)}...`);
  });

  it("5. round is opened: root committed before any randomness exists", async () => {
    const roundIndex = 0;
    const round = roundPda(escrow, roundIndex, program.programId);
    const winners = 8;
    const st: any = await program.account.escrow.fetch(escrow);
    const free = st.escrowed.sub(st.allocated);
    const prize = free.divn(winners * 2); // leave headroom

    const sig = await withRetry("open_round", () => program.methods
      .openRound(roundIndex, [...Buffer.from(snap.root, "hex")],
                 new BN(snap.totalWeight), winners, prize)
      .accountsPartial({ dev: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })
      .rpc({ commitment: "confirmed" }));
    sigs.openRound = sig;

    const r: any = await program.account.round.fetch(round);
    assert.equal(Buffer.from(r.root).toString("hex"), snap.root, "root stored as committed");
    assert.isFalse(r.drawn, "no randomness at commit time");
    assert.equal(r.winnerCount, winners);
    console.log(`  root islendi, ${winners} kazanan x ${prize.toString()} odul sig=${sig}`);
  });

  it("6. randomness is drawn afterwards, by anyone", async () => {
    const round = roundPda(escrow, 0, program.programId);
    const before: any = await program.account.round.fetch(round);
    // the draw must be in a later slot than the commit
    while ((await conn.getSlot("confirmed")) <= before.commitSlot.toNumber()) await sleep(500);

    const sig = await withRetry("draw", () => program.methods
      .draw()
      .accountsPartial({ round, slotHashes: SLOT_HASHES })
      .rpc({ commitment: "confirmed" }));
    sigs.draw = sig;

    const r: any = await program.account.round.fetch(round);
    assert.isTrue(r.drawn, "seed filled in");
    assert.notEqual(Buffer.from(r.seed).toString("hex"), "00".repeat(32), "seed is real");
    console.log(`  seed=${Buffer.from(r.seed).toString("hex").slice(0, 16)}... sig=${sig}`);
  });

  it("7. winners claim; only the drawn ranges pay out", async () => {
    const roundIndex = 0;
    const round = roundPda(escrow, roundIndex, program.programId);
    const r: any = await program.account.round.fetch(round);
    const seed = Buffer.from(r.seed);
    const total = BigInt(snap.totalWeight);
    const { layers } = buildTree(snap.leaves);

    // recompute the same draws the program will
    const winnersOf = new Map<number, number[]>();
    for (let k = 0; k < r.winnerCount; k++) {
      const h = createHash("sha256").update(Buffer.concat([seed, u16le(k)])).digest();
      const ticket = leBytesToBigInt(h.subarray(0, 16)) % total;
      const idx = snap.leaves.findIndex((l: any) =>
        BigInt(l.cumStart) <= ticket && ticket < BigInt(l.cumStart) + BigInt(l.weight));
      assert.isAtLeast(idx, 0, `draw ${k} must land on a leaf`);
      winnersOf.set(k, [...(winnersOf.get(k) ?? []), idx]);
    }

    let paid = 0;
    for (const [k, [idx]] of winnersOf) {
      const leaf = snap.leaves[idx];
      const h = holders.find((x) => x.publicKey.toBase58() === leaf.holder)!;
      const before = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      const sig = await withRetry(`claim ${k}`, () => program.methods
        .claimPrize(k, leaf.index, new BN(leaf.weight), new BN(leaf.cumStart),
                    proofFor(layers, leaf.index).map((b) => [...b]))
        .accountsPartial({
          holder: h.publicKey, escrow, round, mint,
          escrowTokenAccount: escrowTa, holderTokenAccount: baseAta(h.publicKey),
          bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
        })
        .signers([h]).rpc({ commitment: "confirmed" }));
      if (paid === 0) sigs.claimPrize = sig;
      const after = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      assert.equal((after.amount - before.amount).toString(), r.prize.toString(),
        `draw ${k} paid exactly one prize`);
      paid++;
    }
    const rr: any = await program.account.round.fetch(round);
    assert.equal(rr.claimedCount, paid, "every drawn prize claimed once");
    console.log(`  ${paid} odul odendi`);

    // the same draw cannot be claimed twice
    const [k0, [i0]] = [...winnersOf][0];
    const l0 = snap.leaves[i0];
    const h0 = holders.find((x) => x.publicKey.toBase58() === l0.holder)!;
    let again = false;
    try {
      await program.methods.claimPrize(k0, l0.index, new BN(l0.weight), new BN(l0.cumStart),
          proofFor(layers, l0.index).map((b) => [...b]))
        .accountsPartial({
          holder: h0.publicKey, escrow, round, mint,
          escrowTokenAccount: escrowTa, holderTokenAccount: baseAta(h0.publicKey),
          bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
        }).signers([h0]).rpc({ commitment: "confirmed" });
    } catch { again = true; }
    assert.isTrue(again, "double claim rejected");
    console.log("  ayni cekilis ikinci kez odenmedi");
  });

  it("8. a holder who is not in the tree cannot forge a claim", async () => {
    const round = roundPda(escrow, 0, program.programId);
    const { layers } = buildTree(snap.leaves);
    const victim = snap.leaves[0];
    const outsider = holders[TOO_SMALL]; // real wallet, but below the minimum
    let rejected = false;
    try {
      await program.methods.claimPrize(0, victim.index, new BN(victim.weight), new BN(victim.cumStart),
          proofFor(layers, victim.index).map((b) => [...b]))
        .accountsPartial({
          holder: outsider.publicKey, escrow, round, mint,
          escrowTokenAccount: escrowTa, holderTokenAccount: baseAta(outsider.publicKey),
          bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
        }).signers([outsider]).rpc({ commitment: "confirmed" });
    } catch { rejected = true; }
    assert.isTrue(rejected, "someone else's leaf must not pay out");
    console.log("  agacta olmayan cuzdanin sahte claim'i reddedildi");
  });
});