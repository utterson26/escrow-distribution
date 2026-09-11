import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  pumpAccounts, escrowPda, allocPda, escrowAta, buyerPda, baseAtaOf,
  TOKEN_2022, WSOL, TOKEN,
} from "./pump";

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

  const holders = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
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
    const amount = new BN(1_000_000).mul(new BN(10 ** 6)); // 1M base tokens
    const maxSolCost = new BN(0.5 * LAMPORTS_PER_SOL);
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

  const weights = [
      { balance: new BN(1000), heldSecs: new BN(3600) },
      { balance: new BN(2000), heldSecs: new BN(1800) },
    { balance: new BN(500),  heldSecs: new BN(7200) },
  ];
  const remaining = () => holders.flatMap((h) => [
    { pubkey: allocPda(escrow, h.publicKey, program.programId), isWritable: true, isSigner: false },
    { pubkey: h.publicKey, isWritable: false, isSigner: false },
  ]);

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

  it("3. distribute: weighted allocations (balance x held_secs, hash-jittered)", async () => {
    const sig = await withRetry("distribute", () => program.methods
      .distribute(weights)
      .accountsPartial({ dev: dev.publicKey, escrow, systemProgram: SystemProgram.programId })
      .remainingAccounts(remaining())
      .rpc({ commitment: "confirmed" }));
    sigs.distribute = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    let sum = new BN(0);
    for (const h of holders) {
      const a: any = await program.account.allocation.fetch(
        allocPda(escrow, h.publicKey, program.programId));
      console.log(`  ${h.publicKey.toBase58().slice(0, 8)} amount=${a.amount} weight=${a.weight}`);
      sum = sum.add(a.amount);
    }
    assert.equal(sum.toString(), st.allocated.toString(), "sum of allocations == escrow.allocated");
    assert.isTrue(st.allocated.lte(st.escrowed), "cannot allocate more than escrowed");
    console.log(`  allocated=${st.allocated} of escrowed=${st.escrowed} sig=${sig}`);
  });

  it("3b. distribute is idempotent: resending the same batch is a no-op", async () => {
    const before: any = await program.account.escrow.fetch(escrow);
    const allocBefore = await Promise.all(holders.map((h) =>
      program.account.allocation.fetch(allocPda(escrow, h.publicKey, program.programId))));
    allocBefore.forEach((a: any, i) =>
      assert.isTrue(a.distributed, `holder ${i} must carry the distributed flag`));

    const sig = await withRetry("distribute-again", () => program.methods
      .distribute(weights)
      .accountsPartial({ dev: dev.publicKey, escrow, systemProgram: SystemProgram.programId })
      .remainingAccounts(remaining())
      .rpc({ commitment: "confirmed" }));
    sigs.distributeAgain = sig;

    const after: any = await program.account.escrow.fetch(escrow);
    assert.equal(after.allocated.toString(), before.allocated.toString(), "allocated unchanged");
    assert.equal(after.holderCount, before.holderCount, "holder_count unchanged");
    for (let i = 0; i < holders.length; i++) {
      const a: any = await program.account.allocation.fetch(
        allocPda(escrow, holders[i].publicKey, program.programId));
      assert.equal(a.amount.toString(), (allocBefore[i] as any).amount.toString(),
        `holder ${i} amount unchanged`);
      assert.equal(a.weight.toString(), (allocBefore[i] as any).weight.toString(),
        `holder ${i} weight unchanged`);
    }
    console.log(`  no-op confirmed, allocated still ${after.allocated} sig=${sig}`);
  });

  it("4. claim: a holder pulls their allocation", async () => {
    const h = holders[0];
    // fund the holder so it can pay its own fees, and open its ATA
    await send([
      SystemProgram.transfer({
        fromPubkey: dev.publicKey, toPubkey: h.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        dev.publicKey,
        baseAta(h.publicKey), h.publicKey, mint, TOKEN_2022),
    ]);

    const holderTa = baseAta(h.publicKey);
    const alloc = allocPda(escrow, h.publicKey, program.programId);
    const a: any = await program.account.allocation.fetch(alloc);

    const sig = await withRetry("claim", () => program.methods
      .claim()
      .accountsPartial({
        holder: h.publicKey, escrow, allocation: alloc, mint,
        escrowTokenAccount: escrowTa, holderTokenAccount: holderTa,
        baseTokenProgram: TOKEN_2022,
      })
      .signers([h])
      .rpc({ commitment: "confirmed" }));
    sigs.claim = sig;

    const bal = await getAccount(conn, holderTa, "confirmed", TOKEN_2022);
    assert.equal(bal.amount.toString(), a.amount.toString(), "holder received their allocation");
    const after: any = await program.account.allocation.fetch(alloc);
    assert.isTrue(after.claimed, "allocation marked claimed");
    console.log(`  holder got ${bal.amount} sig=${sig}`);
  });
});
