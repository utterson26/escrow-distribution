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
  pumpAccounts, escrowPda, escrowAta, buyerPda, baseAtaOf, directBuyIx, directSellIx,
  feeAuthorityPda, sharingConfigPda, setupFeeSharingAccounts, collectFeesAccounts, shareholderMetas,
  TOKEN_2022, WSOL, TOKEN,
} from "./pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";
import { configPda, setPlatform } from "./config";

const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
/** pull lamports_spent / left_for_next_call out of a BuybackDone log */
function decodeBuybackDone(logs: string[]) {
  const line = [...logs].reverse().find((l) => l.startsWith("Program data: "));
  const b = Buffer.from(line!.slice("Program data: ".length), "base64");
  let o = 8 + 32;                       // discriminator + escrow
  const spent = b.readBigUInt64LE(o); o += 8;
  const bought = b.readBigUInt64LE(o); o += 8;
  const quoted = b.readBigUInt64LE(o); o += 8;
  const floor = b.readBigUInt64LE(o); o += 8;
  const left = b.readBigUInt64LE(o);
  return { spent, bought, quoted, floor, left };
}

const manualPda = (mint: PublicKey, program: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program)[0];
const manualAta = (mint: PublicKey, program: PublicKey) =>
  getAssociatedTokenAddressSync(mint, manualPda(mint, program), true, TOKEN_2022);

const receiptPda = (round: PublicKey, holder: PublicKey, program: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("receipt"), round.toBuffer(), holder.toBuffer()], program)[0];
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
    commitment: "confirmed",
    // off localnet the RPC is load-balanced: a "confirmed" blockhash from one
    // node is "Blockhash not found" on the next, so simulate against finalized
    preflightCommitment: /127\.0\.0\.1|localhost/.test(base.connection.rpcEndpoint) ? "confirmed" : "finalized",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as any;
  const conn = provider.connection;
  const dev = (provider.wallet as anchor.Wallet).payer;

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  // the coin's creator on pump: our dataless fee PDA at launch, the pump fee
  // sharing config once `setup_fee_sharing` has run (1c)
  const feeAuthority = feeAuthorityPda(mint, program.programId);
  const sharingConfig = sharingConfigPda(mint);
  const pa = pumpAccounts(mint, dev.publicKey, feeAuthority);   // launch-time accounts
  const paS = pumpAccounts(mint, dev.publicKey, sharingConfig); // after fee sharing
  const escrowTa = escrowAta(escrow, mint);
  // the dataless PDA that signs the pump buy on the escrow's behalf
  const buyer = buyerPda(mint, program.programId);
  const buyerTa = baseAtaOf(buyer, mint);
  const pb = pumpAccounts(mint, buyer, sharingConfig); // pump accounts keyed on the buyer
  // where the platform's cut of the creator fee goes; the rate comes from the config
  const feeWallet = Keypair.generate();
  let platformBps = 1000;
  const baseAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
  const quoteAta = (owner: PublicKey) =>
    getAssociatedTokenAddressSync(WSOL, owner, true, TOKEN);

  // 7 wallets: 5 that should qualify, 1 that sells out, 1 below the minimum
  // (0.1 SOL ≈ $20 at the curve price: 35M tokens clears it, 5M does not)
  const holders = Array.from({ length: 7 }, () => Keypair.generate());
  const GRANT = [35, 36, 37, 38, 40, 30, 5].map((m) => new BN(m).mul(new BN(1_000_000)).mul(new BN(10 ** 6)));
  const SELLS_OUT = 5;   // receives, then sends everything back
  const TOO_SMALL = 6;   // 5M tokens, under the 0.1 SOL (~$20) floor
  let snap: any;
  let earlyRejectProven = false;
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
    // the dev doubles as platform in this run; only the upgrade authority may say so
    await withRetry("set_platform", () => setPlatform(program, dev.publicKey, dev.publicKey, feeWallet.publicKey));
    // a fresh wallet must be rent-exempt to receive its fee share
    await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: feeWallet.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL })]);
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const sfs = setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, feeWallet.publicKey);
    const keys = [
      ...Object.values(pa) as PublicKey[],
      ...Object.values(paS) as PublicKey[],
      ...Object.values(pb) as PublicKey[],
      ...Object.values(sfs) as PublicKey[],
      escrow, escrowTa, mint, dev.publicKey, buyer, buyerTa, feeAuthority, sharingConfig,
      manualPda(mint, program.programId), manualAta(mint, program.programId),
      configPda(program.programId), SystemProgram.programId, program.programId,
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
    // large enough that a 35M-token position clears the 0.1 SOL minimum
    const amount = new BN(500_000_000).mul(new BN(10 ** 6));
    const maxSolCost = new BN(1.5 * LAMPORTS_PER_SOL);
    const escrowBps = 3000; // 30% to escrow

    const ix = await program.methods
      .launch("Airdrop Test", "ADT", "https://example.com/adt.json", amount, maxSolCost,
              [...Buffer.alloc(32)], 0, escrowBps, false)  // manual 0 / holder 30%: holder-only coin, holder-rewards off
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda(program.programId), escrowTokenAccount: escrowTa,
        manualAuthority: manualPda(mint, program.programId),
        manualTokenAccount: manualAta(mint, program.programId),
        feeAuthority, ...pa, systemProgram: SystemProgram.programId,
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

  it("1c. fee sharing: the creator fee is split 90% escrow / 10% platform on pump", async () => {
    const raw0 = (await conn.getAccountInfo(pa.bondingCurve, "confirmed"))!.data;
    assert.equal(new PublicKey(raw0.subarray(49, 81)).toBase58(), feeAuthority.toBase58(),
      "at launch pump's creator is our fee PDA");
    const feeBefore = await conn.getBalance(feeAuthority, "confirmed");
    const sig = await withRetry("setup_fee_sharing", () => program.methods.setupFeeSharing()
      .accountsPartial(setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, feeWallet.publicKey))
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })])
      .rpc(provider.opts));
    sigs.setupFeeSharing = sig;
    const st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.feeSharingSet);
    // the config outlives test runs on a reused ledger (F6 may have moved the
    // rate), so the coin must carry whatever the config said at setup time
    const cfg: any = await program.account.config.fetch(configPda(program.programId));
    assert.equal(st.platformFeeBps, cfg.platformFeeBps, "config rate recorded on the escrow");
    platformBps = cfg.platformFeeBps;
    const raw = (await conn.getAccountInfo(pa.bondingCurve, "confirmed"))!.data;
    assert.equal(new PublicKey(raw.subarray(49, 81)).toBase58(), sharingConfig.toBase58(),
      "pump now routes the creator fee through the sharing config");
    assert.equal(await conn.getBalance(feeAuthority, "confirmed"), feeBefore, "fee PDA keeps none of the fronted rent");
    // a second setup is refused
    let again = false;
    try {
      await program.methods.setupFeeSharing()
        .accountsPartial(setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, feeWallet.publicKey))
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })])
        .rpc(provider.opts);
    } catch { again = true; }
    assert.isTrue(again, "fee sharing is one-shot");
    console.log(`  sharing config ${sharingConfig.toBase58()} sig=${sig}`);
  });

  it("1b. delay window narrowed, first check only sets the baseline", async () => {
    await withRetry("set_delay_window", () => program.methods
      .setDelayWindow(new BN(DELAY_WINDOW))
      .accountsPartial({ platform: dev.publicKey, escrow })
      .rpc(provider.opts));

    const sig = await withRetry("check_trigger", () => program.methods
      .checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    sigs.checkBaseline = sig;
    const st: any = await program.account.escrow.fetch(escrow);
    assert.isFalse(st.armed, "first sight only records the baseline");
    assert.isTrue(st.lastMilestoneMcap.gtn(0), "milestone baseline set");
    console.log(`  baseline mcap=${st.lastMilestoneMcap.toNumber() / 1e9} SOL`);
  });

  it("2. collect_fees: pump pays 90% to the escrow and 10% to the platform wallet", async () => {
    // some trading first, so the creator vault holds enough to split: pump
    // only distributes above ~0.0019 SOL in the vault (rent floor + a
    // per-shareholder minimum), and the creator fee is a few bps of volume
    await send([createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, quoteAta(dev.publicKey), dev.publicKey, WSOL, TOKEN)]);
    for (let i = 0; i < 2; i++) {
      const b0 = (await getAccount(conn, pa.associatedBaseUser, "confirmed", TOKEN_2022)).amount;
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directBuyIx(mint, dev.publicKey, sharingConfig, BigInt(0.25 * LAMPORTS_PER_SOL), 1n)]);
      const b1 = (await getAccount(conn, pa.associatedBaseUser, "confirmed", TOKEN_2022)).amount;
      await send([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  directSellIx(mint, dev.publicKey, sharingConfig, b1 - b0, 0n)]);
    }
    const vault = paS.creatorVault;
    const vaultBefore = await conn.getBalance(vault, "confirmed");
    assert.isAbove(vaultBefore, 1_900_000, "creator vault accrued enough fees to distribute");
    const escBefore = await conn.getBalance(escrow, "confirmed");
    const platBefore = await conn.getBalance(feeWallet.publicKey, "confirmed");

    const sig = await withRetry("collect_fees", () => program.methods
      .collectFees()
      .accountsPartial(collectFeesAccounts(mint, escrow, program.programId, dev.publicKey))
      .remainingAccounts(shareholderMetas(feeAuthority, feeWallet.publicKey, platformBps))
      .rpc(provider.opts));
    sigs.collectFees = sig;

    const escGain = (await conn.getBalance(escrow, "confirmed")) - escBefore;
    const platGain = (await conn.getBalance(feeWallet.publicKey, "confirmed")) - platBefore;
    const st: any = await program.account.escrow.fetch(escrow);

    assert.isAbove(escGain, 0, "escrow received its share");
    assert.isAbove(platGain, 0, "platform received its share");
    // the config split within rounding (10% by default: platform ≈ escrow / 9)
    const ratio = platGain / escGain;
    assert.closeTo(ratio, platformBps / (10000 - platformBps), 0.005, `split should follow the config, got ${escGain}/${platGain}`);
    assert.equal(st.feesCollected.toNumber(), escGain, "escrow books only its own share");
    assert.equal(await conn.getBalance(feeAuthority, "confirmed"), 0, "fee PDA keeps nothing");
    console.log(`  vault ${vaultBefore} -> escrow +${escGain} (${100 - platformBps / 100}%), platform +${platGain} (${platformBps / 100}%) sig=${sig}`);
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

  /** one spend per slot: wait until the chain has moved past the last buyback's slot */
  async function waitPastBuybackSlot() {
    const st: any = await program.account.escrow.fetch(escrow);
    const last = Number(st.lastBuybackSlot);
    while ((await conn.getSlot("processed")) <= last) await sleep(200);
  }

  async function sendBuyback(
    label: string, overrides: Record<string, PublicKey> = {},
  ): Promise<string> {
    const ix = await program.methods.buyback()
      .accountsPartial({ ...buybackAccounts(), ...overrides }).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    await waitPastBuybackSlot();
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

    // --- chunking: one call may only spend 0.5% of the curve's quote reserves ---
    const bb = decodeBuybackDone((await conn.getTransaction(sig, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    }))!.meta!.logMessages!);
    const raw = (await conn.getAccountInfo(pa.bondingCurve, "confirmed"))!.data;
    const reservesAfter = raw.readBigUInt64LE(16);
    // reserves before the buy = reserves now minus what went in
    const capBefore = ((reservesAfter - bb.spent) * 50n) / 10000n;
    assert.isAtMost(Number(bb.spent), Number(capBefore) * 1.02,
      `spent ${bb.spent} must stay within 0.5% of reserves (~${capBefore})`);
    assert.isAbove(Number(bb.left), 0, "the cap held something back for next time");
    console.log(`  parcali: ${bb.spent} harcandi, ${bb.left} sonraki cagriya birakildi`);

    // the held-back SOL is still usable: a second call buys again
    const midEsc = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    const sig2 = await sendBuyback("buyback-2nd");
    sigs.buybackChunk2 = sig2;
    const endEsc = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.isAbove(Number(endEsc.amount - midEsc.amount), 0, "second chunk also bought");
    console.log(`  ikinci parca: +${endEsc.amount - midEsc.amount} token sig=${sig2}`);
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

  it("2e. one buyback per slot: a second call in the same slot is rejected", async () => {
    // The per-call cap is only a cap if the calls cannot be stacked. Two buyback
    // instructions in one transaction land in the same slot; the first spends,
    // the second must be refused so the transaction as a whole fails.
    await send([SystemProgram.transfer({
      fromPubkey: dev.publicKey, toPubkey: escrow, lamports: 0.05 * LAMPORTS_PER_SOL,
    })]);
    const solBefore = await conn.getBalance(escrow, "confirmed");
    const escBefore = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);

    const ix = await program.methods.buyback().accountsPartial(buybackAccounts()).instruction();
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    await waitPastBuybackSlot(); // so the FIRST instruction is allowed and only the second trips
    const bh = await conn.getLatestBlockhash("finalized");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix, ix],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    tx.sign([dev]);

    let detail = "";
    try {
      const sg = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
      await conn.confirmTransaction({ signature: sg, ...bh }, "confirmed");
      assert.fail("stacked buybacks should have been rejected");
    } catch (e: any) {
      detail = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);
    }
    // 6002 = BuybackSameSlot
    assert.match(detail, /BuybackSameSlot|0x1772/,
      `expected BuybackSameSlot, got ${detail.slice(0, 300)}`);
    // The whole transaction was dropped: the first instruction's spend rolled back.
    assert.equal(await conn.getBalance(escrow, "confirmed"), solBefore, "escrow SOL untouched");
    const escMid = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.equal(escMid.amount.toString(), escBefore.amount.toString(), "no tokens moved");
    console.log("  ayni slotta ikinci buyback reddedildi (BuybackSameSlot)");

    // Control: a lone call in a later slot spends, and records its slot.
    const sig = await sendBuyback("buyback-next-slot");
    sigs.buybackNextSlot = sig;
    const txSlot = (await conn.getTransaction(sig, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    }))!.slot;
    const st: any = await program.account.escrow.fetch(escrow);
    assert.equal(st.lastBuybackSlot.toString(), String(txSlot), "last_buyback_slot = tx slot");
    const escAfter = await getAccount(conn, escrowTa, "confirmed", TOKEN_2022);
    assert.isAbove(Number(escAfter.amount - escBefore.amount), 0, "next-slot call bought");
    console.log(`  sonraki slotta alim ok, last_buyback_slot=${st.lastBuybackSlot} sig=${sig}`);
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
    // Helius on devnet (public RPC has no Token-2022 gPA); on localnet the provider
    // itself — a HELIUS_RPC_URL pointing at devnet in the shell must not win here
    const indexerRpc = /127\.0\.0\.1|localhost/.test(conn.rpcEndpoint)
      ? conn.rpcEndpoint : (process.env.HELIUS_RPC_URL ?? conn.rpcEndpoint);
    snap = await snapshot(indexerRpc, mint.toBase58(), slot,
                          program.programId, [dev.publicKey.toBase58()]);
    assert.equal(snap.leaves.length, 5, "exactly the 5 qualifying holders");

    const inSnap = new Set(snap.leaves.map((l: any) => l.holder));
    assert.isFalse(inSnap.has(holders[SELLS_OUT].publicKey.toBase58()), "seller excluded");
    assert.isFalse(inSnap.has(holders[TOO_SMALL].publicKey.toBase58()), "dust position excluded");
    for (const i of [0, 1, 2, 3, 4]) {
      assert.isTrue(inSnap.has(holders[i].publicKey.toBase58()), `holder ${i} present`);
    }
    // weights are balance x slots held and add up to the total
    let sum = 0n;
    for (const l of snap.leaves) {
      assert.isTrue(BigInt(l.weight) > 0n, "positive weight");
      sum += BigInt(l.weight);
    }
    assert.equal(sum.toString(), snap.totalWeight);

    // same inputs -> same root, recomputed from the leaves alone
    const { root } = buildTree(snap.leaves);
    assert.equal(root.toString("hex"), snap.root, "root recomputes from leaves");
    fs.writeFileSync("snapshot.json", JSON.stringify(snap, null, 2));
    console.log(`  ${snap.leaves.length} uygun holder, root=${snap.root.slice(0, 16)}...`);
  });

  const triggerAccounts = () => ({
    escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES,
  });
  const DELAY_WINDOW = 150; // ~60s: wide enough that an early fire is reliably early

  it("4c. volume arms a trigger, releasing 1% of the pool at that moment", async () => {
    // the earlier buybacks already moved the curve, which is the volume the
    // trigger samples; one more check turns that into an armed distribution
    let st: any = await program.account.escrow.fetch(escrow);
    if (!st.armed) {
      await send([SystemProgram.transfer({
        fromPubkey: dev.publicKey, toPubkey: escrow, lamports: 0.07 * LAMPORTS_PER_SOL,
      })]);
      await sendBuyback("volume");
    }
    const sig = await withRetry("check_arm", () => program.methods
      .checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    sigs.checkArm = sig;

    st = await program.account.escrow.fetch(escrow);
    const now = await conn.getSlot("confirmed");
    assert.isTrue(st.armed, "volume should have armed a trigger");
    assert.equal(st.armedKind, 1, "volume kind");
    assert.isAtMost(st.fireSlot.toNumber(), now + DELAY_WINDOW + 5, "delay inside the window");
    assert.isAtLeast(st.fireSlot.toNumber(), now - 5, "fire slot is not in the past");

    // arming does not move escrowed/allocated, so the pool read now is the pool
    // the 1% was taken from
    const pool = st.escrowed.sub(st.allocated);
    assert.equal(st.authorized.toString(), pool.divn(100).toString(), "1% of the pool");
    console.log(`  armed: ${st.authorized.toString()} token (havuzun %1'i), fire_slot=${st.fireSlot} (now=${now})`);

    // Try to fire straight away, while we are certainly still inside the delay.
    // Done here rather than in a later test so an unfavourable small allocate cannot let
    // the slot slip past before we get to it.
    const fireSlot = st.fireSlot.toNumber();
    if ((await conn.getSlot("confirmed")) < fireSlot) {
      const tooEarly = (program.idl.errors ?? []).find((e: any) => e.name === "TooEarly");
      let detail = "";
      for (let i = 0; i < 6; i++) {
        try {
          await program.methods.fireTrigger()
            .accountsPartial({ escrow, bondingCurve: pa.bondingCurve })
            .rpc(provider.opts);
          detail = "KABUL EDILDI"; break;
        } catch (e: any) {
          const m = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);
          if (/Blockhash not found|429|Too Many Requests/i.test(m)) { await sleep(800); continue; }
          detail = m; break;
        }
      }
      if (detail === "" ) {
        console.log("  not: RPC gurultusu erken cagriyi denetmedi");
      } else {
        assert.notEqual(detail, "KABUL EDILDI", "early fire must not succeed");
        assert.isTrue(
          /TooEarly/i.test(detail) || detail.includes("0x" + Number(tooEarly?.code ?? 0).toString(16)),
          `expected TooEarly, got: ${detail.slice(0, 200)}`);
        earlyRejectProven = true;
        console.log(`  erken cagri reddedildi: TooEarly (fire_slot=${fireSlot})`);
      }
    } else {
      console.log(`  not: gecikme cok kucuk cikti, erken cagri denenemedi`);
    }
  });

  it("4d. checking again while armed changes nothing", async () => {
    const before: any = await program.account.escrow.fetch(escrow);
    const sig = await withRetry("check_noop", () => program.methods
      .checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    sigs.checkNoop = sig;
    const after: any = await program.account.escrow.fetch(escrow);
    assert.equal(after.fireSlot.toString(), before.fireSlot.toString(), "fire slot untouched");
    assert.equal(after.authorized.toString(), before.authorized.toString(), "amount untouched");
    assert.equal(after.armedKind, before.armedKind);
    console.log(`  ikinci cagri no-op, hata vermedi sig=${sig}`);
  });

  it("4e. firing after the delay works", async () => {
    const st: any = await program.account.escrow.fetch(escrow);
    const fireSlot = st.fireSlot.toNumber();
    while ((await conn.getSlot("confirmed")) < fireSlot) await sleep(400);
    const now = await conn.getSlot("confirmed");

    const sig = await withRetry("fire", () => program.methods.fireTrigger()
      .accountsPartial({ escrow, bondingCurve: pa.bondingCurve })
      .rpc(provider.opts));
    sigs.fireVolume = sig;

    const after: any = await program.account.escrow.fetch(escrow);
    assert.isFalse(after.armed, "disarmed after firing");
    assert.equal(after.pending.toString(), st.authorized.toString(), "released into pending");
    console.log(`  slot ${now} >= ${fireSlot} -> ${after.pending.toString()} token serbest sig=${sig}`);
  });

  /** the indexer's RPC: the provider on localnet, Helius elsewhere */
  const indexerRpc = () => /127\.0\.0\.1|localhost/.test(conn.rpcEndpoint)
    ? conn.rpcEndpoint : (process.env.HELIUS_RPC_URL ?? conn.rpcEndpoint);
  const claimAccounts = (h: PublicKey, round: PublicKey) => ({
    holder: h, escrow, round, receipt: receiptPda(round, h, program.programId), mint,
    escrowTokenAccount: escrowTa, holderTokenAccount: baseAta(h),
    bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
  });

  it("5. round is opened: the root commits a capped pro-rata allocation", async () => {
    const roundIndex = 0;
    const round = roundPda(escrow, roundIndex, program.programId);
    const st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.pending.gtn(0), "a trigger must have released funds first");
    const released = BigInt(st.pending.toString());

    // allocate what the trigger released over the snapshot
    const slot = await conn.getSlot("confirmed");
    snap = await snapshot(indexerRpc(), mint.toBase58(), slot, program.programId,
                          [dev.publicKey.toBase58()], released);
    assert.equal(snap.leaves.length, 5, "same 5 holders");
    const total = BigInt(snap.total);
    // five holders: below CAP_MIN_HOLDERS, so no cap — everything released is
    // handed out, strictly in proportion to weight
    assert.equal(total.toString(), released.toString(), "≤10 holders: the whole release is distributed");
    const W = BigInt(snap.totalWeight);
    for (const l of snap.leaves) {
      const expect = released * BigInt(l.weight) / W;
      const got = BigInt(l.amount);
      assert.isTrue(got >= expect && got <= expect + released, `${l.holder} pro rata (${got} vs ${expect})`);
      assert.isTrue(got - expect < 1_000_000n, "only rounding dust above the exact share");
    }
    const again = await snapshot(indexerRpc(), mint.toBase58(), slot, program.programId,
                                 [dev.publicKey.toBase58()], released);
    assert.equal(again.root, snap.root, "allocation is deterministic");
    fs.writeFileSync("snapshot.json", JSON.stringify(snap, null, 2));

    // more than the trigger released must be refused
    let refused = false;
    try {
      await program.methods
        .openRound(roundIndex, [...Buffer.from(snap.root, "hex")], new BN(released.toString()),
                   new BN((released + 1n).toString()), snap.leaves.length, new BN(snap.snapshotSlot))
        .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })
        .rpc(provider.opts);
    } catch { refused = true; }
    assert.isTrue(refused, "cannot distribute more than the trigger authorised");

    const sig = await withRetry("open_round", () => program.methods
      .openRound(roundIndex, [...Buffer.from(snap.root, "hex")], new BN(released.toString()),
                 new BN(total.toString()), snap.leaves.length, new BN(snap.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })
      .rpc(provider.opts));
    sigs.openRound = sig;

    const r: any = await program.account.round.fetch(round);
    assert.equal(Buffer.from(r.root).toString("hex"), snap.root, "root stored as committed");
    assert.equal(r.released.toString(), released.toString());
    assert.equal(r.total.toString(), total.toString());
    assert.equal(r.holderCount, snap.leaves.length);
    assert.equal(r.snapshotSlot.toNumber(), snap.snapshotSlot, "snapshot slot recorded");
    const st2: any = await program.account.escrow.fetch(escrow);
    assert.equal(st2.pending.toString(), "0", "the release is consumed by the round");
    console.log(`  root islendi: ${snap.leaves.length} holder, ${total} dagitiliyor / ${released} serbest sig=${sig}`);
  });

  it("6. every holder claims exactly their share; nobody twice", async () => {
    const round = roundPda(escrow, 0, program.programId);
    const { layers } = buildTree(snap.leaves);
    let paid = 0n;
    for (const leaf of snap.leaves) {
      const h = holders.find((x) => x.publicKey.toBase58() === leaf.holder)!;
      const before = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      const sig = await withRetry(`claim ${leaf.index}`, () => program.methods
        .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount),
                    proofFor(layers, leaf.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(h.publicKey, round))
        .signers([h]).rpc(provider.opts));
      if (paid === 0n) sigs.claimShare = sig;
      const after = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      assert.equal((after.amount - before.amount).toString(), leaf.amount, `leaf ${leaf.index} paid its amount`);
      paid += BigInt(leaf.amount);
    }
    const rr: any = await program.account.round.fetch(round);
    assert.equal(rr.claimedCount, snap.leaves.length, "every holder claimed once");
    assert.equal(rr.claimedAmount.toString(), rr.total.toString(), "round fully paid");
    console.log(`  ${snap.leaves.length} holder ${paid} token aldi`);

    // the same holder cannot claim twice: the receipt already exists
    const l0 = snap.leaves[0];
    const h0 = holders.find((x) => x.publicKey.toBase58() === l0.holder)!;
    let again = false;
    try {
      await program.methods.claimShare(l0.index, new BN(l0.balance), new BN(l0.amount),
          proofFor(layers, l0.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(h0.publicKey, round)).signers([h0]).rpc(provider.opts);
    } catch { again = true; }
    assert.isTrue(again, "double claim rejected");
    console.log("  ikinci claim reddedildi");
  });

  it("7. a holder who is not in the tree cannot forge a claim", async () => {
    const round = roundPda(escrow, 0, program.programId);
    const { layers } = buildTree(snap.leaves);
    const victim = snap.leaves[0];
    const outsider = holders[TOO_SMALL]; // real wallet, but below the minimum
    let detail = "";
    try {
      await program.methods.claimShare(victim.index, new BN(victim.balance), new BN(victim.amount),
          proofFor(layers, victim.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(outsider.publicKey, round)).signers([outsider]).rpc(provider.opts);
      detail = "KABUL";
    } catch (e: any) { detail = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []); }
    assert.match(detail, /BadProof/, `someone else's leaf must not pay out: ${detail.slice(0, 200)}`);
    console.log("  agacta olmayan cuzdanin sahte claim'i reddedildi (BadProof)");
  });

  it("8. below eleven holders there is no cap: a 60% leaf is a valid share", async () => {
    // Five holders, one of them heavy: the allocator gives the heaviest wallet
    // whatever its weight says, and the program accepts it. (With eleven or
    // more holders the same leaf is refused — see 10.)
    const heavy = [...snap.leaves].sort((x: any, y: any) => (BigInt(y.amount) > BigInt(x.amount) ? 1 : -1))[0];
    const pct = Number(BigInt(heavy.amount) * 10000n / BigInt(snap.released)) / 100;
    console.log(`  en agir holder payin %${pct}'ini aldi (tavan yok, ${snap.leaves.length} holder)`);
    assert.isAbove(pct, 10, "a share above 10% went through with five holders");
  });

  it("9. milestone: doubling the market cap releases 5% and ratchets", async () => {
    const before: any = await program.account.escrow.fetch(escrow);
    const baseline = before.lastMilestoneMcap;

    // Work out exactly how much more buying doubles the cap, instead of guessing.
    // mcap = supply * vq / vt with vq*vt = k, so mcap = supply*k/vt^2; doubling
    // the cap means vt -> vt/sqrt(2), and the quote needed is k/vt' - vq.
    const raw = (await conn.getAccountInfo(pa.bondingCurve, "confirmed"))!.data;
    const vt = raw.readBigUInt64LE(8);      // virtual_token_reserves
    const vq = raw.readBigUInt64LE(16);     // virtual_quote_reserves
    const supply = raw.readBigUInt64LE(40); // token_total_supply
    const target = BigInt(baseline.toString()) * 2n;
    const k = vq * vt;
    // vt' = sqrt(supply * k / target), integer sqrt
    const inner = (supply * k) / target;
    let lo = 1n, hi = vt, vtTarget = vt;
    while (lo <= hi) {
      const mid = (lo + hi) / 2n;
      if (mid * mid <= inner) { vtTarget = mid; lo = mid + 1n; } else { hi = mid - 1n; }
    }
    const need = k / vtTarget - vq;
    console.log(`  mcap 2x icin ~${(Number(need) / 1e9).toFixed(3)} SOL alim gerekiyor`);
    assert.isBelow(Number(need) / LAMPORTS_PER_SOL, 2.5, "milestone pump stays affordable");

    // Our own buyback is capped at 0.5% of reserves per call, so it can no longer
    // move the cap on its own — which is the point. Move the market directly
    // instead, the way an outside buyer would.
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    await withRetry("market-buy", async () => {
      const bh = await conn.getLatestBlockhash("finalized");
      const msg = new TransactionMessage({
        payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          directBuyIx(mint, dev.publicKey, sharingConfig, BigInt(Math.ceil(Number(need) * 1.03)), 1n),
        ],
      }).compileToV0Message([lutAcc]);
      const tx = new VersionedTransaction(msg);
      tx.sign([dev]);
      const sg = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
      await conn.confirmTransaction({ signature: sg, ...bh }, "confirmed");
      sigs.marketBuy = sg;
      return sg;
    });

    const sig = await withRetry("check_milestone", () => program.methods
      .checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    sigs.checkMilestone = sig;

    const st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.armed, "milestone should have armed");
    assert.equal(st.armedKind, 2, "milestone kind, not volume");
    const pool = st.escrowed.sub(st.allocated);
    assert.equal(st.authorized.toString(), pool.divn(20).toString(), "5% of the pool");
    console.log(`  mcap ${baseline.toNumber() / 1e9} -> 2x asildi, ${st.authorized.toString()} token armed`);

    // fire it and confirm the milestone ratchets upward
    const fireSlot = st.fireSlot.toNumber();
    while ((await conn.getSlot("confirmed")) < fireSlot) await sleep(400);
    const fsig = await withRetry("fire_milestone", () => program.methods.fireTrigger()
      .accountsPartial({ escrow, bondingCurve: pa.bondingCurve })
      .rpc(provider.opts));
    sigs.fireMilestone = fsig;

    const after: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(after.lastMilestoneMcap.gte(baseline.muln(2)), "milestone moved up to the new cap");
    assert.isFalse(after.armed);
    console.log(`  yeni tas=${after.lastMilestoneMcap.toNumber() / 1e9} SOL sig=${fsig}`);

    // and it never steps back down: a check right after must not re-arm
    const again = await withRetry("check_after_milestone", () => program.methods
      .checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    const st2: any = await program.account.escrow.fetch(escrow);
    assert.equal(st2.lastMilestoneMcap.toString(), after.lastMilestoneMcap.toString(),
      "milestone does not go backwards");
    assert.equal(st2.armedKind, st2.armed ? 1 : 0, "no second milestone at the same cap");
    console.log(`  tas geri gitmedi sig=${again}`);
  });

  it("10. eleven holders: the 10% cap applies on chain and the remainder goes back to the pool", async () => {
    // the milestone just released 5% of the pool; make eleven eligible holders
    const st0: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st0.pending.gtn(0), "milestone release pending");
    // the dev tops up its tokens (the curve must not complete: keep buys small)
    await send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      directBuyIx(mint, dev.publicKey, sharingConfig, BigInt(0.3 * LAMPORTS_PER_SOL), 1n),
    ]);
    // 20M tokens each: at the doubled price that is ~0.13 SOL, over the $20 floor
    const NEW_GRANT = 20_000_000n * 1_000_000n;
    const more = Array.from({ length: 6 }, () => Keypair.generate());
    for (const h of more) {
      await send([
        SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: h.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, baseAta(h.publicKey), h.publicKey, mint, TOKEN_2022),
        createTransferCheckedInstruction(pa.associatedBaseUser, mint, baseAta(h.publicKey), dev.publicKey,
          NEW_GRANT, 6, [], TOKEN_2022),
      ]);
    }
    holders.push(...more);
    await sleep(2000); // a little holding time for the newcomers

    // (a) a dishonest root paying one wallet 50% is refused on chain now
    let released = BigInt(st0.pending.toString());
    const slotA = await conn.getSlot("confirmed");
    const doctored = await snapshot(indexerRpc(), mint.toBase58(), slotA, program.programId,
                                    [dev.publicKey.toBase58()], released);
    assert.equal(doctored.leaves.length, 11, "eleven eligible holders");
    const half = released / 2n;
    doctored.leaves.forEach((l: any, i: number) => { l.amount = i === 0 ? half.toString() : "0"; });
    const bad = buildTree(doctored.leaves);
    const round1 = roundPda(escrow, 1, program.programId);
    await withRetry("open_round_doctored", () => program.methods
      .openRound(1, [...bad.root], new BN(released.toString()), new BN(half.toString()), 11, new BN(doctored.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round: round1, systemProgram: SystemProgram.programId })
      .rpc(provider.opts));
    const l0 = doctored.leaves[0];
    const h0 = holders.find((x) => x.publicKey.toBase58() === l0.holder)!;
    let detail = "";
    try {
      await program.methods.claimShare(l0.index, new BN(l0.balance), new BN(l0.amount), proofFor(bad.layers, l0.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(h0.publicKey, round1)).signers([h0]).rpc(provider.opts);
      detail = "KABUL";
    } catch (e: any) { detail = String(e?.message ?? e) + JSON.stringify(e?.logs ?? []); }
    assert.match(detail, /ShareOverCap/, `over-cap leaf must be refused with 11 holders: ${detail.slice(0, 200)}`);
    console.log("  11 holder: %50'lik leaf reddedildi (ShareOverCap)");

    // (b) a fresh release: volume arms, fires
    await send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      directBuyIx(mint, dev.publicKey, sharingConfig, BigInt(0.15 * LAMPORTS_PER_SOL), 1n),
    ]);
    await withRetry("check_trigger", () => program.methods.checkTrigger().accountsPartial(triggerAccounts()).rpc(provider.opts));
    let st: any = await program.account.escrow.fetch(escrow);
    assert.isTrue(st.armed, "volume armed again");
    while ((await conn.getSlot("confirmed")) < st.fireSlot.toNumber()) await sleep(400);
    await withRetry("fire", () => program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve }).rpc(provider.opts));
    st = await program.account.escrow.fetch(escrow);
    released = BigInt(st.pending.toString());
    assert.isTrue(released > 0n);

    // (c) the honest allocation: heavy wallets capped at 10%, everyone paid,
    //     whatever the cap held back is simply not allocated
    const slotB = await conn.getSlot("confirmed");
    const snap11 = await snapshot(indexerRpc(), mint.toBase58(), slotB, program.programId,
                                  [dev.publicKey.toBase58()], released);
    assert.equal(snap11.leaves.length, 11);
    const cap = released * 1000n / 10000n;
    for (const l of snap11.leaves) assert.isTrue(BigInt(l.amount) <= cap, `${l.holder} over the cap`);
    const total = BigInt(snap11.total);
    assert.isTrue(total <= released);
    const capped = snap11.leaves.filter((l: any) => BigInt(l.amount) === cap).length;
    console.log(`  11 holder: ${capped} cuzdan tavanda, ${total}/${released} dagitildi, kalan ${released - total} havuzda`);
    const allocatedBefore = BigInt(st.allocated.toString());
    const round2 = roundPda(escrow, 2, program.programId);
    await withRetry("open_round_11", () => program.methods
      .openRound(2, [...Buffer.from(snap11.root, "hex")], new BN(released.toString()), new BN(total.toString()), 11, new BN(snap11.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round: round2, systemProgram: SystemProgram.programId })
      .rpc(provider.opts));
    const st2: any = await program.account.escrow.fetch(escrow);
    assert.equal(st2.pending.toString(), "0", "nothing carried over");
    assert.equal((BigInt(st2.allocated.toString()) - allocatedBefore).toString(), total.toString(),
      "only what the round hands out leaves the pool; the cap remainder stays in it");
    const { layers } = buildTree(snap11.leaves);
    for (const leaf of snap11.leaves) {
      if (BigInt(leaf.amount) === 0n) continue;
      const h = holders.find((x) => x.publicKey.toBase58() === leaf.holder)!;
      const before = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      await withRetry(`claim11 ${leaf.index}`, () => program.methods
        .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((b) => [...b]))
        .accountsPartial(claimAccounts(h.publicKey, round2)).signers([h]).rpc(provider.opts));
      const after = await getAccount(conn, baseAta(h.publicKey), "confirmed", TOKEN_2022);
      assert.equal((after.amount - before.amount).toString(), leaf.amount);
    }
    const r2: any = await program.account.round.fetch(round2);
    assert.equal(r2.claimedAmount.toString(), total.toString(), "round fully paid");
    console.log(`  11 holder claim etti, ${total} odendi`);
  });
});