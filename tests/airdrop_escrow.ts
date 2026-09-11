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
  pumpAccounts, escrowPda, allocPda, escrowAta, TOKEN_2022, WSOL, TOKEN,
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
      escrow, escrowTa, mint, dev.publicKey,
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
