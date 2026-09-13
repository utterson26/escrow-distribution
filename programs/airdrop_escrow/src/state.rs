use anchor_lang::prelude::*;

/// Program-wide settings. One account, written only by the program's upgrade
/// authority, so no launcher can pick its own "platform".
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The key that may open rounds, intervene, and turn the test knobs.
    pub platform: Pubkey,
    pub bump: u8,
    /// Platform's share of the creator fee, in bps, written into pump's
    /// fee-sharing config when a coin is set up. Never touches the locked pool.
    pub platform_fee_bps: u16,
    /// Where that share is paid.
    pub platform_fee_wallet: Pubkey,
    /// A proposed new rate, live from `fee_effective_slot` on (0 = none).
    pub pending_fee_bps: u16,
    pub fee_effective_slot: u64,
    /// Slots between proposing and applying a rate; PLATFORM_FEE_DELAY_SLOTS
    /// (7 days) unless a test narrowed it with `set_fee_delay`.
    pub fee_delay_slots: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    /// Dev wallet that launched the coin and controls distribution.
    pub dev: Pubkey,
    /// The pump coin mint (Token-2022).
    pub mint: Pubkey,
    /// Share of the initial buy locked for holders (the pool), in basis
    /// points of the buy. The manual list's slice is `manual_bps`; the two
    /// together are the locked share, ≥ MIN_LOCK_SUPPLY_BPS of total supply.
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

    // ---- manual airdrop ----
    /// Merkle root of the (wallet, bps) list the dev fixed at launch. The list
    /// is too big for the launch transaction, so only its root is committed;
    /// that still makes it immutable from launch onward.
    pub manual_root: [u8; 32],
    /// Share of the dev's own allocation set aside for the manual list.
    pub manual_bps: u16,
    /// Tokens moved into the manual airdrop account at launch.
    pub manual_total: u64,
    /// Basis points claimed so far; can never exceed 10000.
    pub manual_claimed_bps: u16,
    /// One bit per list index.
    pub manual_claimed_bits: [u8; 8],
    /// Before this timestamp nobody may touch what is unclaimed.
    pub manual_unlock_ts: i64,
    /// Still inside the lock window.
    pub manual_locked: bool,
    /// Entries the dev has published on chain so far, for public verification.
    pub manual_published: u16,

    // ---- platform intervention ----
    /// The only key allowed to call `intervene`. Meant to become a multisig.
    pub platform: Pubkey,
    /// Start of the current volume day.
    pub day_start_ts: i64,
    /// `cum_volume` when the current day began.
    pub day_start_volume: u128,
    /// Consecutive low-volume days seen so far.
    pub low_volume_days: u8,
    /// Set once `DEAD_COIN_DAYS` low-volume days have passed in a row.
    pub dead: bool,
    /// Length of a volume day in seconds; a test knob, see PROGRESS.md.
    pub day_seconds: i64,
    /// Slot of the last buyback that spent anything. One spend per slot: the
    /// 0.5%-of-reserves cap is per call, so without this a single transaction
    /// could stack calls and drain the escrow into one block.
    pub last_buyback_slot: u64,
    pub bump: u8,
    /// pump holder-rewards coin: the creator fee goes to pump's holder pool,
    /// so `collect_fees` and `buyback` do not apply; only the locked supply
    /// and the triggered distributions do.
    pub is_holder_reward: bool,
    /// `setup_fee_sharing` ran: the creator vault is split escrow / platform.
    pub fee_sharing_set: bool,
    /// The platform bps written into this coin's sharing config (fixed there;
    /// a later rate change only reaches new launches).
    pub platform_fee_bps: u16,
}

/// One row of the manual airdrop list, published on chain so anyone can
/// recompute the committed root.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ManualEntry {
    pub index: u16,
    pub wallet: Pubkey,
    pub bps: u16,
}

/// One distribution round. The amount a trigger released is split pro rata
/// over every eligible holder (weight = balance × holding time), no single
/// wallet taking more than `MAX_SHARE_BPS` of it; the Merkle root commits to
/// the resulting (holder, snapshot balance, amount) rows. Nothing is random:
/// anyone can rebuild the snapshot from `snapshot_slot` and `released` and
/// check the root.
#[account]
#[derive(InitSpace)]
pub struct Round {
    pub escrow: Pubkey,
    pub index: u32,
    /// Merkle root over the allocation leaves.
    pub root: [u8; 32],
    /// What the allocator was given: the input every reproducer needs.
    pub released: u64,
    /// Sum of every leaf amount; ≤ `released` (the per-wallet cap can leave a
    /// remainder, which stays pending for the next round).
    pub total: u64,
    /// Leaves in the tree.
    pub holder_count: u32,
    pub claimed_amount: u64,
    pub claimed_count: u32,
    pub commit_slot: u64,
    /// Slot the holder snapshot behind `root` was taken at.
    pub snapshot_slot: u64,
    pub bump: u8,
}

/// Marks one holder's claim in one round. Its existence is the "already
/// claimed" bit: a second claim fails on `init`.
#[account]
#[derive(InitSpace)]
pub struct ClaimReceipt {
    pub bump: u8,
}
