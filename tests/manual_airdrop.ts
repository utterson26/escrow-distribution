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
import { pumpAccounts, escrowPda, escrowAta, TOKEN_2022, WSOL, TOKEN } from "./pump";

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

describe("manual airdrop (devnet)", () => {
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
  const manualPda = PublicKey.findProgramAddressSync(
    [Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const baseAta = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o, true, TOKEN_2022);

  // the list the dev fixes at launch: six wallets, 100% of the manual slice
  const list = Array.from({ length: 6 }, () => Keypair.generate());
  const BPS = [3000, 2500, 2000, 1500, 800, 200];
  const leaves = list.map((k, i) => manualLeaf(i, k.publicKey, BPS[i]));
  const { root, layers } = buildTree(leaves);

  const MANUAL_BPS = 5000;               // half the dev's own allocation
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
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const keys = [...Object.values(pa) as PublicKey[], escrow, escrowTa, mint,
                  dev.publicKey, manualPda, manualAta,
                  SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    await send([createIx]);
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: addr,
        addresses: uniq.slice(i, i + 18),
      })]);
    }
    await sleep(2000);

    const ix = await program.methods
      .launch("Manual Test", "MAN", "https://example.com/man.json",
              ESCROW_BPS, AMOUNT, new BN(0.4 * LAMPORTS_PER_SOL),
              [...root], MANUAL_BPS)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();

    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("finalized");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    tx.sign([dev, mintKp]);
    const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    sigs.launch = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    const devShare = AMOUNT.sub(AMOUNT.muln(ESCROW_BPS).divn(10000));
    const expected = devShare.muln(MANUAL_BPS).divn(10000);
    assert.equal(Buffer.from(st.manualRoot).toString("hex"), root.toString("hex"),
      "root stored exactly as committed");
    assert.equal(st.manualTotal.toString(), expected.toString(), "dev share set aside");
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
  });

  it("each wallet claims its own share", async () => {
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
        }).signers([w]).rpc({ commitment: "confirmed" });
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
        }).signers([list[0]]).rpc({ commitment: "confirmed" });
    } catch { rejected = true; }
    assert.isTrue(rejected, "double claim must be rejected");
    console.log("  ikinci claim reddedildi");
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
        }).signers([outsider]).rpc({ commitment: "confirmed" });
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
        }).signers([list[5]]).rpc({ commitment: "confirmed" });
    } catch { inflated = true; }
    assert.isTrue(inflated, "a changed percentage must break the proof");
    console.log("  listede olmayan ve yuzdesini buyuten denemeler reddedildi");
  });
});
