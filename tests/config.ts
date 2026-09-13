import { PublicKey, SystemProgram } from "@solana/web3.js";

export const configPda = (program: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], program)[0];
export const programDataPda = (program: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [program.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];

/** Point the program's config at `platform` (and the platform fee wallet). `authority` must be the upgrade authority. */
export async function setPlatform(program: any, authority: PublicKey, platform: PublicKey, feeWallet: PublicKey = platform) {
  return program.methods.setPlatform(platform, feeWallet).accountsPartial({
    authority, config: configPda(program.programId), program: program.programId,
    programData: programDataPda(program.programId), systemProgram: SystemProgram.programId,
  }).rpc(program.provider.opts);
}
