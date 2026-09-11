use anchor_lang::prelude::*;

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
#[constant]
pub const ROUND_SEED: &[u8] = b"round";
#[constant]
pub const BUYER_SEED: &[u8] = b"buyer";

/// SlotHashes sysvar. Not re-exported by anchor-lang 1.2, so pinned by address.
pub const SLOT_HASHES: Pubkey = pubkey!("SysvarS1otHashes111111111111111111111111111");

/// Wrapped SOL — quote mint for SOL-paired pump coins.
pub const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const BPS_DENOM: u64 = 10_000;

/// Below this much spendable SOL, `buyback` does nothing. A program constant
/// rather than an argument: `buyback` is permissionless, so a caller must not be
/// able to force a dust-sized buy and burn the escrow's SOL on fees.
pub const MIN_BUYBACK_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
/// Kept in the buyer PDA to cover the accounts pump opens on the buyer's behalf
/// (user_volume_accumulator ~0.00184 SOL plus a couple of ATAs).
pub const BUYBACK_RESERVE_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
/// Most of the curve's quote reserves a single buyback may spend. Splitting the
/// buy across calls keeps any one transaction small enough that sandwiching it
/// is not worth the attacker's gas.
pub const BUYBACK_MAX_RESERVE_BPS: u64 = 50; // 0.5%

/// Slippage the on-chain buyback quote is allowed to miss by, in basis points.
pub const BUYBACK_SLIPPAGE_BPS: u64 = 200; // 2%

/// Minimum position, valued at the bonding curve price, to be eligible for a
/// prize. Fixed in SOL: a true dollar figure would need a price feed.
pub const MIN_POSITION_LAMPORTS: u64 = 50_000_000; // 0.05 SOL
/// Volume since the last distribution must reach this share of market cap.
pub const VOLUME_TRIGGER_BPS: u128 = 100; // 1%
/// Share of the remaining pool a volume trigger releases.
pub const VOLUME_RELEASE_BPS: u64 = 100; // 1%
/// Share of the remaining pool a milestone trigger releases.
pub const MILESTONE_RELEASE_BPS: u64 = 500; // 5%
/// Default random-delay window: 60 minutes at ~400ms per slot.
pub const DEFAULT_MAX_DELAY_SLOTS: u64 = 9_000;
/// Floor on the configurable delay window. Anything this small is only for
/// tests: a narrow window makes the distribution moment predictable again.
pub const MIN_MAX_DELAY_SLOTS: u64 = 5;

pub const TRIGGER_VOLUME: u8 = 1;
pub const TRIGGER_MILESTONE: u8 = 2;

/// Winners per round; bounded by the 256-bit claim bitmap on `Round`.
pub const MAX_WINNERS: u16 = 256;
/// A round may only be drawn at least this many slots after its root was
/// committed, so the publisher cannot know the randomness in advance.
pub const DRAW_DELAY_SLOTS: u64 = 1;
