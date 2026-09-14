/**
 * Platform config admin, for the deploy script and for ops:
 *
 *   config-admin.ts show
 *   config-admin.ts set-platform <platform> <feeWallet>     (upgrade authority signs; creates the config)
 *   config-admin.ts migrate                                 (upgrade authority; grows an old Config)
 *   config-admin.ts propose-fee <bps> | apply-fee           (platform / anyone)
 *   config-admin.ts propose-cap <lamports> | apply-cap
 *   config-admin.ts pause | unpause
 *   config-admin.ts set-publishers <pubkey>[,<pubkey>...]   (platform; up to 4, beta allowlist)
 *   config-admin.ts propose-min-position <lamports> | apply-min-position
 *
 * ANCHOR_PROVIDER_URL, ANCHOR_WALLET as usual.
 *
 * SQUADS_VAULT=<vault pubkey>: the platform-signed commands (propose-*, pause,
 * set-publishers, ...) are built with the vault as signer and printed as a
 * base58 transaction instead of being sent — paste it into the Squads
 * transaction builder (docs/MULTISIG.md). Nothing is signed here.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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
      publishers: c.publishers.map((k: PublicKey) => k.toBase58()).filter((k: string) => k !== PublicKey.default.toBase58()),
      minPositionLamports: c.minPositionLamports.toString(), pendingMinPositionLamports: c.pendingMinPositionLamports.toString(),
      minPositionEffectiveSlot: c.minPositionEffectiveSlot.toString(),
    }, null, 2));
  };
  const admin = { authority: kp.publicKey, config, program: program.programId, programData, systemProgram: SystemProgram.programId };
  const vault = process.env.SQUADS_VAULT ? new PublicKey(process.env.SQUADS_VAULT) : undefined;
  const plat = { platform: vault ?? kp.publicKey, config };
  // with a vault the platform call is exported for Squads, not sent
  const rpc = async (m: any): Promise<string> => {
    if (!vault) return m.rpc(provider.opts);
    const tx = new Transaction({ feePayer: vault, recentBlockhash: PublicKey.default.toBase58() }).add(await m.instruction());
    const b58 = anchor.utils.bytes.bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
    console.log(`Squads'a aktarilacak islem (imzasiz, ${vault.toBase58()} imzalar):\n${b58}`);
    return "(gonderilmedi: SQUADS_VAULT)";
  };
  let sig: string | undefined;
  switch (cmd) {
    case "show": await show(); return;
    case "set-platform": sig = await program.methods.setPlatform(new PublicKey(a), new PublicKey(b ?? a)).accountsPartial(admin).rpc(provider.opts); break;
    case "migrate": sig = await program.methods.migrateConfig().accountsPartial(admin).rpc(provider.opts); break;
    case "propose-fee": sig = await rpc(program.methods.proposePlatformFee(Number(a)).accountsPartial(plat)); break;
    case "apply-fee": sig = await program.methods.applyPlatformFee().accountsPartial({ config }).rpc(provider.opts); break;
    case "propose-cap": sig = await rpc(program.methods.proposeLockCap(new BN(a)).accountsPartial(plat)); break;
    case "apply-cap": sig = await program.methods.applyLockCap().accountsPartial({ config }).rpc(provider.opts); break;
    case "pause": sig = await rpc(program.methods.setPaused(true).accountsPartial(plat)); break;
    case "unpause": sig = await rpc(program.methods.setPaused(false).accountsPartial(plat)); break;
    case "set-publishers": {
      const keys = a.split(",").map((k) => new PublicKey(k.trim()));
      while (keys.length < 4) keys.push(PublicKey.default);
      sig = await rpc(program.methods.setPublishers(keys.slice(0, 4)).accountsPartial(plat)); break;
    }
    case "propose-min-position": sig = await rpc(program.methods.proposeMinPosition(new BN(a)).accountsPartial(plat)); break;
    case "apply-min-position": sig = await program.methods.applyMinPosition().accountsPartial({ config }).rpc(provider.opts); break;
    default: console.log("kullanim: show | set-platform <platform> <feeWallet> | migrate | propose-fee <bps> | apply-fee | propose-cap <lamports> | apply-cap | pause | unpause | set-publishers <k,k,..> | propose-min-position <lamports> | apply-min-position"); process.exit(2);
  }
  console.log("sig", sig);
  await show();
})().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
