/**
 * Platform config admin, for the deploy script and for ops:
 *
 *   config-admin.ts show
 *   config-admin.ts set-platform <platform> <feeWallet>     (upgrade authority signs; creates the config)
 *   config-admin.ts migrate                                 (upgrade authority; grows an old Config)
 *   config-admin.ts propose-fee <bps> | apply-fee           (platform / anyone)
 *   config-admin.ts propose-cap <lamports> | apply-cap
 *   config-admin.ts pause | unpause
 *
 * ANCHOR_PROVIDER_URL, ANCHOR_WALLET as usual.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { patchProvider } from "../tests/pump";

(async () => {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const conn = new anchor.web3.Connection(url, "confirmed");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const provider = patchProvider(new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed", preflightCommitment: "confirmed" }));
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;
  const config = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const programData = PublicKey.findProgramAddressSync([program.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
  const [cmd, a, b] = process.argv.slice(2);
  const show = async () => {
    const c: any = await program.account.config.fetch(config);
    console.log(JSON.stringify({
      platform: c.platform.toBase58(), platformFeeBps: c.platformFeeBps, platformFeeWallet: c.platformFeeWallet.toBase58(),
      pendingFeeBps: c.pendingFeeBps, feeEffectiveSlot: c.feeEffectiveSlot.toString(), feeDelaySlots: c.feeDelaySlots.toString(),
      maxLockedValueLamports: c.maxLockedValueLamports.toString(), pendingLockCapLamports: c.pendingLockCapLamports.toString(),
      lockCapEffectiveSlot: c.lockCapEffectiveSlot.toString(), paused: c.paused,
    }, null, 2));
  };
  const admin = { authority: kp.publicKey, config, program: program.programId, programData, systemProgram: SystemProgram.programId };
  const plat = { platform: kp.publicKey, config };
  let sig: string | undefined;
  switch (cmd) {
    case "show": await show(); return;
    case "set-platform": sig = await program.methods.setPlatform(new PublicKey(a), new PublicKey(b ?? a)).accountsPartial(admin).rpc(provider.opts); break;
    case "migrate": sig = await program.methods.migrateConfig().accountsPartial(admin).rpc(provider.opts); break;
    case "propose-fee": sig = await program.methods.proposePlatformFee(Number(a)).accountsPartial(plat).rpc(provider.opts); break;
    case "apply-fee": sig = await program.methods.applyPlatformFee().accountsPartial({ config }).rpc(provider.opts); break;
    case "propose-cap": sig = await program.methods.proposeLockCap(new BN(a)).accountsPartial(plat).rpc(provider.opts); break;
    case "apply-cap": sig = await program.methods.applyLockCap().accountsPartial({ config }).rpc(provider.opts); break;
    case "pause": sig = await program.methods.setPaused(true).accountsPartial(plat).rpc(provider.opts); break;
    case "unpause": sig = await program.methods.setPaused(false).accountsPartial(plat).rpc(provider.opts); break;
    default: console.log("kullanim: show | set-platform <platform> <feeWallet> | migrate | propose-fee <bps> | apply-fee | propose-cap <lamports> | apply-cap | pause | unpause"); process.exit(2);
  }
  console.log("sig", sig);
  await show();
})().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
