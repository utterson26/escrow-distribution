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

    // ---- trigger bookkeeping ----
    /// Quote volume accumulated by sampling the curve. pump exposes no
    /// per-coin cumulative volume, so this is the sum of absolute reserve moves
    /// seen at each `check_trigger`; round trips between checks are missed.
    pub cum_volume: u128,
    /// Curve quote reserves at the last sample.
    pub last_quote_reserves: u64,
    /// `cum_volume` at the last distribution.
    pub volume_at_last_dist: u128,
    /// Market cap of the last milestone reached. Never decreases.
    pub last_milestone_mcap: u64,
    /// Upper bound of the random firing delay, in slots.
    pub max_delay_slots: u64,
    /// A trigger is armed and waiting for its delay to pass.
    pub armed: bool,
    pub armed_kind: u8,
    pub fire_slot: u64,
    /// Tokens the armed trigger will release.
    pub authorized: u64,
    /// Released by a fired trigger, waiting for a round to be opened with it.
    pub pending: u64,
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

