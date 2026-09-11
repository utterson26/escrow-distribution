use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    /// Dev wallet that launched the coin and controls distribution.
    pub dev: Pubkey,
    /// The pump coin mint (Token-2022).
    pub mint: Pubkey,
    /// Share of the initial buy kept in escrow, in basis points.
    pub escrow_bps: u16,
    /// Base tokens bought by `launch`.
    pub bought: u64,
    /// Base tokens routed into the escrow token account.
    pub escrowed: u64,
    /// Sum of all allocations written by `distribute`.
    pub allocated: u64,
    /// Sum of all allocations claimed.
    pub claimed: u64,
    /// Holders given an allocation so far.
    pub holder_count: u32,
    /// Lamports swept out of the pump creator vault by `collect_fees`.
    pub fees_collected: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Allocation {
    pub escrow: Pubkey,
    pub holder: Pubkey,
    /// Base tokens owed to this holder.
    pub amount: u64,
    /// Weight this allocation was computed from (balance x held_secs, jittered).
    pub weight: u128,
    pub claimed: bool,
    pub bump: u8,
}

/// Per-holder input to `distribute`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct HolderWeight {
    /// Token balance snapshot.
    pub balance: u64,
    /// Seconds the balance has been held.
    pub held_secs: u64,
}
