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
    /// Lamports spent by `buyback` buying the coin back.
    pub buyback_spent: u64,
    /// Base tokens bought back into the escrow token account.
    pub buyback_tokens: u64,
    pub bump: u8,
}

/// One distribution round. The Merkle root is committed first and the
/// randomness is drawn afterwards, so whoever publishes the root cannot know
/// — and therefore cannot pick — the winners.
#[account]
#[derive(InitSpace)]
pub struct Round {
    pub escrow: Pubkey,
    pub index: u32,
    /// Merkle root over the holder snapshot leaves.
    pub root: [u8; 32],
    /// Sum of every leaf weight; the draw is taken modulo this.
    pub total_weight: u128,
    pub winner_count: u16,
    /// Tokens paid per winning draw.
    pub prize: u64,
    pub commit_slot: u64,
    /// Randomness, filled in by `draw`.
    pub seed: [u8; 32],
    pub drawn: bool,
    /// One bit per draw index; 256 draws max.
    pub claimed_bits: [u8; 32],
    pub claimed_count: u16,
    pub bump: u8,
}

