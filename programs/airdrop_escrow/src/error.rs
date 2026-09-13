use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("escrow_bps must be <= 10000")]
    InvalidBps,
    #[msg("buy amount must be greater than zero")]
    ZeroAmount,
    #[msg("buyback already spent in this slot; try again next slot")]
    BuybackSameSlot,
    #[msg("merkle root must not be empty")]
    EmptyRoot,
    #[msg("slot hashes sysvar is empty")]
    NoSlotHash,
    #[msg("merkle proof does not match the committed root")]
    BadProof,
    #[msg("position is below the minimum, valued at the curve price")]
    PositionTooSmall,
    #[msg("round must have at least one holder")]
    NoHolders,
    #[msg("leaf amount exceeds the per-wallet cap (MAX_SHARE_BPS of the round)")]
    ShareOverCap,
    #[msg("round total exceeds what the allocator was given")]
    TotalOverReleased,
    #[msg("claims would exceed the round total")]
    RoundExhausted,
    #[msg("allocation already claimed")]
    AlreadyClaimed,
    #[msg("nothing to claim")]
    NothingToClaim,
    #[msg("only the platform authority may call this")]
    NotPlatform,
    #[msg("manual shares are still inside the 30 day lock")]
    StillLocked,
    #[msg("coin is not flagged dead")]
    NotDead,
    #[msg("that source/target combination is not allowed")]
    BadInterventionTarget,
    #[msg("nothing left to move")]
    NothingToMove,
    #[msg("day length is below the allowed floor")]
    BadDayWindow,
    #[msg("manual list index is out of range")]
    BadManualIndex,
    #[msg("manual share already claimed")]
    ManualAlreadyClaimed,
    #[msg("manual shares would exceed the dev allocation")]
    ManualOverAllocated,
    #[msg("manual airdrop is not configured for this escrow")]
    NoManualAirdrop,
    #[msg("no trigger is armed")]
    NotArmed,
    #[msg("a trigger is already armed")]
    AlreadyArmed,
    #[msg("the random delay has not elapsed yet")]
    TooEarly,
    #[msg("round total exceeds what fired triggers released")]
    AmountNotAuthorized,
    #[msg("delay window is below the allowed floor")]
    BadDelayWindow,
    #[msg("round does not belong to this escrow")]
    HolderMismatch,
    #[msg("only the dev authority may call this")]
    NotDev,
    #[msg("only the dev or the platform authority may open a round")]
    NotPublisher,
    #[msg("snapshot slot is in the future")]
    SnapshotInFuture,
    #[msg("only the program upgrade authority may set the platform")]
    NotUpgradeAuthority,
    #[msg("holder no longer holds the balance the snapshot credited them for")]
    HoldingBelowSnapshot,
    #[msg("bonding curve reserves are zero")]
    EmptyCurve,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("bonding curve is complete; the coin has migrated")]
    CurveComplete,
    #[msg("buy returned fewer tokens than the on-chain quote allows")]
    SlippageExceeded,
    #[msg("bonding curve quote mint does not match the quote mint passed")]
    QuoteMintMismatch,
}
