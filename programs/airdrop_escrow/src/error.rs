use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("escrow_bps must be <= 10000")]
    InvalidBps,
    #[msg("manual_bps + holder_bps must be > 0 and <= 10000")]
    BadLockSplit,
    #[msg("locked tokens are below MIN_LOCK_SUPPLY_BPS of the total supply")]
    LockTooSmall,
    #[msg("manual_bps > 0 needs a manual root, and a root needs manual_bps > 0")]
    ManualRootMismatch,
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
    #[msg("not applicable to a holder-rewards coin")]
    NotApplicable,
    #[msg("fee sharing has not been set up for this coin")]
    FeeSharingNotSetUp,
    #[msg("fee sharing is already set up for this coin")]
    FeeSharingAlreadySetUp,
    #[msg("platform fee must be <= 10000 bps")]
    BadFeeBps,
    #[msg("no platform fee change is pending")]
    NoPendingFee,
    #[msg("the platform fee change is not effective yet")]
    FeeChangeTooEarly,
    #[msg("fee delay is outside the allowed range")]
    BadFeeDelay,
    #[msg("the value this launch would lock exceeds the platform's per-coin cap")]
    LockCapExceeded,
    #[msg("no lock cap change is pending")]
    NoPendingLockCap,
    #[msg("the lock cap change is not effective yet")]
    LockCapChangeTooEarly,
    #[msg("launches are paused by the platform")]
    Paused,
    #[msg("bonding curve is complete; the coin has migrated")]
    CurveComplete,
    #[msg("buy returned fewer tokens than the on-chain quote allows")]
    SlippageExceeded,
    #[msg("bonding curve quote mint does not match the quote mint passed")]
    QuoteMintMismatch,
}
