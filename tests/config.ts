import { PublicKey, SystemProgram } from "@solana/web3.js";

export const configPda = (program: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], program)[0];
export const programDataPda = (program: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [program.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];

/** Point the program's config at `platform`. `authority` must be the upgrade authority. */
export async function setPlatform(program: any, authority: PublicKey, platform: PublicKey) {
  return program.methods.setPlatform(platform).accountsPartial({
    authority, config: configPda(program.programId), program: program.programId,
    programData: programDataPda(program.programId), systemProgram: SystemProgram.programId,
  }).rpc({ commitment: "confirmed" });
}
