import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  pumpAccounts, escrowPda, allocPda, escrowAta, TOKEN_2022, WSOL, TOKEN,
} from "./pump";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("airdrop_escrow (devnet)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as Program;
  const conn = provider.connection;
  const dev = (provider.wallet as anchor.Wallet).payer;

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const pa = pumpAccounts(mint, dev.publicKey, escrow);
  const escrowTa = escrowAta(escrow, mint);

  const holders = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  let lut: PublicKey;
  const sigs: Record<string, string> = {};

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
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      payer: dev.publicKey, authority: dev.publicKey, lookupTable: addr, addresses: uniq,
    });
    const sig = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(createIx, extendIx), [], { commitment: "confirmed" });
    sigs.lut = sig;
    console.log(`  LUT ${addr.toBase58()} (${uniq.length} addrs) ${sig}`);
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
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    tx.sign([dev, mintKp]);
    console.log(`  tx size: ${tx.serialize().length} bytes`);

    const sig = await conn.sendTransaction(tx, { skipPreflight: false });
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
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
    const sig = await program.methods
      .collectFees()
      .accountsPartial({
        payer: dev.publicKey, escrow,
        creatorTokenAccount: pa.associatedCreatorVault,
        creatorVault: pa.creatorVault,
        creatorVaultTokenAccount: pa.associatedCreatorVault,
        quoteMint: WSOL, quoteTokenProgram: TOKEN,
        associatedTokenProgram: pa.associatedTokenProgram,
        eventAuthority: pa.eventAuthority, pumpProgram: pa.pumpProgram,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    sigs.collectFees = sig;
    const after = await conn.getBalance(escrow, "confirmed");
    const st: any = await program.account.escrow.fetch(escrow);
    console.log(`  escrow lamports ${before} -> ${after}, recorded=${st.feesCollected} sig=${sig}`);
    assert.isAtLeast(after, before, "escrow must not lose lamports");
  });

  it("3. distribute: weighted allocations (balance x held_secs, hash-jittered)", async () => {
    const weights = [
      { balance: new BN(1000), heldSecs: new BN(3600) },
      { balance: new BN(2000), heldSecs: new BN(1800) },
      { balance: new BN(500),  heldSecs: new BN(7200) },
    ];
    const remaining = holders.flatMap((h) => [
      { pubkey: allocPda(escrow, h.publicKey, program.programId), isWritable: true, isSigner: false },
      { pubkey: h.publicKey, isWritable: false, isSigner: false },
    ]);
    const sig = await program.methods
      .distribute(weights)
      .accountsPartial({ dev: dev.publicKey, escrow, systemProgram: SystemProgram.programId })
      .remainingAccounts(remaining)
      .rpc({ commitment: "confirmed" });
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

  it("4. claim: a holder pulls their allocation", async () => {
    const h = holders[0];
    // fund the holder so it can pay its own fees, and open its ATA
    const fund = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: dev.publicKey, toPubkey: h.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        dev.publicKey,
        anchor.utils.token.associatedAddress({ mint, owner: h.publicKey } as any),
        h.publicKey, mint, TOKEN_2022),
    );
    await provider.sendAndConfirm(fund, [], { commitment: "confirmed" });

    const holderTa = anchor.utils.token.associatedAddress({ mint, owner: h.publicKey } as any);
    const alloc = allocPda(escrow, h.publicKey, program.programId);
    const a: any = await program.account.allocation.fetch(alloc);

    const sig = await program.methods
      .claim()
      .accountsPartial({
        holder: h.publicKey, escrow, allocation: alloc, mint,
        escrowTokenAccount: escrowTa, holderTokenAccount: holderTa,
        baseTokenProgram: TOKEN_2022,
      })
      .signers([h])
      .rpc({ commitment: "confirmed" });
    sigs.claim = sig;

    const bal = await getAccount(conn, holderTa, "confirmed", TOKEN_2022);
    assert.equal(bal.amount.toString(), a.amount.toString(), "holder received their allocation");
    const after: any = await program.account.allocation.fetch(alloc);
    assert.isTrue(after.claimed, "allocation marked claimed");
    console.log(`  holder got ${bal.amount} sig=${sig}`);
  });
});
