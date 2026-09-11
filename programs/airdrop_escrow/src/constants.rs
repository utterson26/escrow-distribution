use anchor_lang::prelude::*;

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
#[constant]
pub const ALLOC_SEED: &[u8] = b"alloc";
#[constant]
pub const BUYER_SEED: &[u8] = b"buyer";

/// Wrapped SOL — quote mint for SOL-paired pump coins.
pub const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
/// Max holders processed in one `distribute` call (tx size bound).
pub const MAX_HOLDERS_PER_CALL: usize = 12;
pub const BPS_DENOM: u64 = 10_000;

/// Below this much spendable SOL, `buyback` does nothing. A program constant
/// rather than an argument: `buyback` is permissionless, so a caller must not be
/// able to force a dust-sized buy and burn the escrow's SOL on fees.
pub const MIN_BUYBACK_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
/// Kept in the buyer PDA to cover the accounts pump opens on the buyer's behalf
/// (user_volume_accumulator ~0.00184 SOL plus a couple of ATAs).
pub const BUYBACK_RESERVE_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
