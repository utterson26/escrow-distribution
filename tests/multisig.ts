/**
 * Handing the platform authority to a multisig vault, rehearsed on localnet
 * without Squads: a throwaway keypair stands in for the vault PDA (a Squads
 * vault signs by CPI, the program only sees a signer). Mirrors docs/MULTISIG.md.
 *
 *   1. set_platform → vault           (upgrade authority signs, one time)
 *   2. the old platform key is refused on every platform-only call
 *   3. a platform call exported the way config-admin does for Squads
 *      (unsigned base58 tx, vault as signer) is signed by the vault and lands
 *   4. after the delay anyone applies; nobody but the upgrade authority can
 *      point the platform back
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { assert } from "chai";
import { patchProvider } from "./pump";
import { configPda, programDataPda, setPlatform } from "./config";

const errOf = (e: any) => String(e?.error?.errorCode?.code ?? e?.logs?.join(" ") ?? e?.message ?? e);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("platform authority → multisig vault (localnet)", () => {
  const base = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(base.connection, base.wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  patchProvider(provider);
  anchor.setProvider(provider);
  const program = anchor.workspace.airdropEscrow as any;
  const conn = provider.connection;
  const upgradeAuthority = (provider.wallet as anchor.Wallet).payer;

  const oldPlatform = Keypair.generate();
  const vault = Keypair.generate();     // stands in for the Squads vault PDA
  const stranger = Keypair.generate();
  const config = configPda(program.programId);
  const platformOnly = (k: PublicKey) => ({ platform: k, config });
  let floorBefore: BN;

  // the wallet is not a signer on these, so bypass the provider
  async function sendRaw(tx: Transaction) {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
  async function expectError(label: string, p: Promise<unknown>, re: RegExp) {
    try { await p; } catch (e: any) { assert.match(errOf(e), re, `${label}: wrong error`); return; }
    assert.fail(`${label}: should have been rejected`);
  }

  before(async function () {
    if (!/127\.0\.0\.1|localhost/.test(conn.rpcEndpoint)) this.skip();
    for (const k of [oldPlatform, vault, stranger]) {
      const sig = await conn.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }
    // the state before the handover: a plain hot key is the platform
    await setPlatform(program, upgradeAuthority.publicKey, oldPlatform.publicKey);
    floorBefore = ((await program.account.config.fetch(config)) as any).minPositionLamports;
    await program.methods.setFeeDelay(new BN(5)).accountsPartial(platformOnly(oldPlatform.publicKey)).signers([oldPlatform]).rpc(provider.opts);
  });

  after(async () => {
    // leave the floor and the delay as the other suites expect them (they set their own platform)
    try {
      await program.methods.proposeMinPosition(floorBefore).accountsPartial(platformOnly(vault.publicKey)).signers([vault]).rpc(provider.opts);
      const eff = ((await program.account.config.fetch(config)) as any).minPositionEffectiveSlot.toNumber();
      while ((await conn.getSlot("confirmed")) < eff) await sleep(400);
      await program.methods.applyMinPosition().accountsPartial({ config }).rpc(provider.opts);
      await program.methods.setFeeDelay(new BN(1_512_000)).accountsPartial(platformOnly(vault.publicKey)).signers([vault]).rpc(provider.opts);
    } catch (e: any) { console.log(`  restore skipped: ${String(e?.message ?? e).slice(0, 80)}`); }
  });

  it("handover: set_platform points platform and fee wallet at the vault", async () => {
    await setPlatform(program, upgradeAuthority.publicKey, vault.publicKey, vault.publicKey);
    const cfg: any = await program.account.config.fetch(config);
    assert.equal(cfg.platform.toBase58(), vault.publicKey.toBase58());
    assert.equal(cfg.platformFeeWallet.toBase58(), vault.publicKey.toBase58());
    // the vault can publish; the old key's slot is gone only if set_publishers says so
    assert.include(cfg.publishers.map((k: PublicKey) => k.toBase58()), vault.publicKey.toBase58());
    assert.equal(cfg.feeDelaySlots.toNumber(), 5, "handover keeps the rest of the config");
  });

  it("the old platform key is refused on every platform-only call", async () => {
    const calls: [string, any][] = [
      ["propose_min_position", program.methods.proposeMinPosition(new BN(200_000_000))],
      ["propose_lock_cap", program.methods.proposeLockCap(new BN(50 * LAMPORTS_PER_SOL))],
      ["propose_platform_fee", program.methods.proposePlatformFee(1000)],
      ["set_paused", program.methods.setPaused(true)],
      ["set_publishers", program.methods.setPublishers([oldPlatform.publicKey, PublicKey.default, PublicKey.default, PublicKey.default])],
      ["set_fee_delay", program.methods.setFeeDelay(new BN(5))],
    ];
    for (const [name, m] of calls) {
      await expectError(`old key: ${name}`, m.accountsPartial(platformOnly(oldPlatform.publicKey)).signers([oldPlatform]).rpc(provider.opts), /NotPlatform/);
    }
    const cfg: any = await program.account.config.fetch(config);
    assert.equal(cfg.paused, false);
    assert.equal(cfg.pendingMinPositionLamports.toNumber(), 0);
  });

  it("a Squads-style export (unsigned base58 tx, vault as signer) lands once the vault signs it", async () => {
    // what `SQUADS_VAULT=<vault> config-admin.ts propose-min-position 200000000` prints
    const ix = await program.methods.proposeMinPosition(new BN(200_000_000)).accountsPartial(platformOnly(vault.publicKey)).instruction();
    const exported = new Transaction({ feePayer: vault.publicKey, recentBlockhash: PublicKey.default.toBase58() }).add(ix);
    const b58 = anchor.utils.bytes.bs58.encode(exported.serialize({ requireAllSignatures: false, verifySignatures: false }));

    // the vault side: decode, sign, send — in Squads the members approve and the vault PDA signs by CPI
    const tx = Transaction.from(anchor.utils.bytes.bs58.decode(b58));
    assert.equal(tx.instructions.length, 1);
    assert.ok(tx.instructions[0].keys.find((k) => k.pubkey.equals(vault.publicKey))?.isSigner, "vault is the signer");
    tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(vault);
    await sendRaw(tx);

    const cfg: any = await program.account.config.fetch(config);
    assert.equal(cfg.pendingMinPositionLamports.toNumber(), 200_000_000);
    assert.ok(cfg.minPositionEffectiveSlot.toNumber() > 0);
  });

  it("apply is permissionless after the delay; only the upgrade authority can take the platform back", async () => {
    const cfg0: any = await program.account.config.fetch(config);
    while ((await conn.getSlot("confirmed")) < cfg0.minPositionEffectiveSlot.toNumber()) await sleep(400);
    const applyIx = await program.methods.applyMinPosition().accountsPartial({ config }).instruction();
    const applyTx = new Transaction({ feePayer: stranger.publicKey, ...(await conn.getLatestBlockhash("confirmed")) }).add(applyIx);
    applyTx.sign(stranger);
    await sendRaw(applyTx);
    const cfg: any = await program.account.config.fetch(config);
    assert.equal(cfg.minPositionLamports.toNumber(), 200_000_000);

    // neither the old platform key nor the vault itself may call set_platform: that is the upgrade authority's
    for (const k of [oldPlatform, vault]) {
      const ix = await program.methods.setPlatform(oldPlatform.publicKey, oldPlatform.publicKey).accountsPartial({
        authority: k.publicKey, config, program: program.programId, programData: programDataPda(program.programId), systemProgram: SystemProgram.programId,
      }).instruction();
      const tx = new Transaction({ feePayer: k.publicKey, ...(await conn.getLatestBlockhash("confirmed")) }).add(ix);
      tx.sign(k);
      await expectError(`${k === vault ? "vault" : "old key"} sets platform`, sendRaw(tx), /NotUpgradeAuthority|custom program error: 0x/);
    }
    assert.equal(((await program.account.config.fetch(config)) as any).platform.toBase58(), vault.publicKey.toBase58());
  });
});
