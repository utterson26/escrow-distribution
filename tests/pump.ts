import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
export const MAYHEM = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

// from the decoded devnet `global` account
export const FEE_RECIPIENT = new PublicKey("68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg");
export const BUYBACK_FEE_RECIPIENT = new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");

const pda = (seeds: (Buffer | Uint8Array)[], prog: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, prog)[0];
const ata = (owner: PublicKey, mint: PublicKey, tp: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, tp);

export function pumpAccounts(mint: PublicKey, dev: PublicKey, escrow: PublicKey) {
  const bondingCurve = pda([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP);
  const creatorVault = pda([Buffer.from("creator-vault"), escrow.toBuffer()], PUMP);
  const userVolumeAccumulator = pda(
    [Buffer.from("user_volume_accumulator"), dev.toBuffer()], PUMP);
  const solVault = pda([Buffer.from("sol-vault")], MAYHEM);

  return {
    global: pda([Buffer.from("global")], PUMP),
    mintAuthority: pda([Buffer.from("mint-authority")], PUMP),
    bondingCurve,
    associatedBaseBondingCurve: ata(bondingCurve, mint, TOKEN_2022),
    associatedQuoteBondingCurve: ata(bondingCurve, WSOL, TOKEN),
    eventAuthority: pda([Buffer.from("__event_authority")], PUMP),
    pumpProgram: PUMP,

    mayhemProgram: MAYHEM,
    globalParams: pda([Buffer.from("global-params")], MAYHEM),
    solVault,
    mayhemState: pda([Buffer.from("mayhem-state"), mint.toBuffer()], MAYHEM),
    mayhemTokenVault: ata(solVault, mint, TOKEN_2022),

    quoteMint: WSOL,
    quoteTokenProgram: TOKEN,
    feeRecipient: FEE_RECIPIENT,
    associatedQuoteFeeRecipient: ata(FEE_RECIPIENT, WSOL, TOKEN),
    buybackFeeRecipient: BUYBACK_FEE_RECIPIENT,
    associatedQuoteBuybackFeeRecipient: ata(BUYBACK_FEE_RECIPIENT, WSOL, TOKEN),
    associatedBaseUser: ata(dev, mint, TOKEN_2022),
    associatedQuoteUser: ata(dev, WSOL, TOKEN),
    creatorVault,
    associatedCreatorVault: ata(creatorVault, WSOL, TOKEN),
    sharingConfig: pda([Buffer.from("sharing-config"), mint.toBuffer()], FEE_PROGRAM),
    globalVolumeAccumulator: pda([Buffer.from("global_volume_accumulator")], PUMP),
    userVolumeAccumulator,
    associatedUserVolumeAccumulator: ata(userVolumeAccumulator, WSOL, TOKEN),
    feeConfig: pda([Buffer.from("fee_config"), PUMP.toBuffer()], FEE_PROGRAM),
    feeProgram: FEE_PROGRAM,
    baseTokenProgram: TOKEN_2022,
    associatedTokenProgram: ATA_PROGRAM,
  };
}

export const escrowPda = (mint: PublicKey, program: PublicKey) =>
  pda([Buffer.from("escrow"), mint.toBuffer()], program);
export const allocPda = (escrow: PublicKey, holder: PublicKey, program: PublicKey) =>
  pda([Buffer.from("alloc"), escrow.toBuffer(), holder.toBuffer()], program);
export const escrowAta = (escrow: PublicKey, mint: PublicKey) =>
  ata(escrow, mint, TOKEN_2022);

export const buyerPda = (mint: PublicKey, program: PublicKey) =>
  pda([Buffer.from("buyer"), mint.toBuffer()], program);
export const baseAtaOf = (owner: PublicKey, mint: PublicKey) =>
  ata(owner, mint, TOKEN_2022);
