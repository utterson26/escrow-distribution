use anchor_lang::prelude::*;

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
#[constant]
pub const ROUND_SEED: &[u8] = b"round";
#[constant]
pub const BUYER_SEED: &[u8] = b"buyer";
#[constant]
pub const MANUAL_SEED: &[u8] = b"manual";
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
/// Dataless, system-owned PDA that is the coin's creator on pump: it can pay
/// rent and sign for the fee-sharing config, which a data-carrying escrow PDA
/// cannot. Everything it receives is swept into the escrow.
#[constant]
pub const FEE_SEED: &[u8] = b"fee";

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
/// share: about $20. Fixed in SOL: a true dollar figure would need a price feed.
pub const MIN_POSITION_LAMPORTS: u64 = 100_000_000; // 0.1 SOL
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

/// Manual airdrop list size. The list itself never goes on chain — only its
/// root — but the index is bounded so the claim bitmap stays fixed.
pub const MAX_MANUAL_ENTRIES: u16 = 50;
/// Nobody may touch unclaimed manual shares before this has elapsed.
pub const MANUAL_LOCK_SECONDS: i64 = 30 * 24 * 60 * 60;

/// A coin counts as dead after this many consecutive low-volume days.
pub const DEAD_COIN_DAYS: u8 = 7;
/// A day is "low volume" when it trades less than this share of market cap.
pub const DEAD_VOLUME_BPS: u128 = 10; // 0.1% = binde bir
/// Length of a volume day. Configurable only so tests need not wait a week.
pub const DEFAULT_DAY_SECONDS: i64 = 24 * 60 * 60;
pub const MIN_DAY_SECONDS: i64 = 2;

/// `intervene` sources and targets — deliberately just these.
pub const SRC_MANUAL: u8 = 0;
pub const SRC_DEAD_POOL: u8 = 1;
pub const DST_DEV: u8 = 0;
pub const DST_POOL: u8 = 1;

pub const TRIGGER_VOLUME: u8 = 1;
pub const TRIGGER_MILESTONE: u8 = 2;

/// Seed of the per-holder, per-round claim receipt.
#[constant]
pub const RECEIPT_SEED: &[u8] = b"receipt";
/// Most of one round a single wallet may receive. The allocator caps a wallet
/// here and hands the excess to the others pro rata; the program refuses any
/// leaf above it, so a publisher cannot commit a root that favours one wallet.
pub const MAX_SHARE_BPS: u64 = 1_000; // 10%
/// The cap only applies once a round has this many eligible holders; below
/// it, ten wallets could not absorb a round and the cap would only strand
/// tokens.
pub const CAP_MIN_HOLDERS: u32 = 11;

/// Platform's cut of the creator fee, set on pump's fee-sharing config at
/// launch. Read from `Config`; this is the initial value.
pub const DEFAULT_PLATFORM_FEE_BPS: u16 = 1_000; // 10%
/// A proposed platform fee only takes effect this many slots later: 7 days at
/// ~400 ms per slot.
pub const PLATFORM_FEE_DELAY_SLOTS: u64 = 1_512_000;
/// Floor on the configurable fee delay. Anything this small is only for
/// tests; `set_fee_delay` cannot go below it nor above the default.
pub const MIN_FEE_DELAY_SLOTS: u64 = 5;
/// Rent the fee PDA needs to open pump's 1024-byte sharing config, fronted by
/// whoever calls `setup_fee_sharing`.
pub const FEE_SHARING_RENT_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
/// A holder must still hold at least this share of their snapshot balance when
/// claiming. 10000 = the whole position; a holder who dumped after the
/// snapshot forfeits the share. Lower it to soften the rule, 0 disables it.
pub const CLAIM_HOLD_BPS: u64 = 10_000;
