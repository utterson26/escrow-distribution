use anchor_lang::prelude::*;

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
#[constant]
pub const ALLOC_SEED: &[u8] = b"alloc";

/// Wrapped SOL — quote mint for SOL-paired pump coins.
pub const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
/// Max holders processed in one `distribute` call (tx size bound).
pub const MAX_HOLDERS_PER_CALL: usize = 12;
pub const BPS_DENOM: u64 = 10_000;
