use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("escrow_bps must be <= 10000")]
    InvalidBps,
    #[msg("buy amount must be greater than zero")]
    ZeroAmount,
    #[msg("holder list is empty or exceeds the per-call limit")]
    BadHolderCount,
    #[msg("holder account list does not match the weight list")]
    HolderAccountMismatch,
    #[msg("total weight is zero")]
    ZeroWeight,
    #[msg("allocation already claimed")]
    AlreadyClaimed,
    #[msg("nothing to claim")]
    NothingToClaim,
    #[msg("only the dev authority may call this")]
    NotDev,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("bonding curve is complete; the coin has migrated")]
    CurveComplete,
    #[msg("buy returned fewer tokens than the on-chain quote allows")]
    SlippageExceeded,
    #[msg("bonding curve quote mint does not match the quote mint passed")]
    QuoteMintMismatch,
}
