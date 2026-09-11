use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::associated_token::spl_associated_token_account;
use anchor_spl::token_interface::{self, TransferChecked};

pub mod constants;
pub mod error;
pub mod state;

pub use constants::*;
pub use error::*;
pub use state::*;

declare_id!("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
declare_program!(pump);

#[program]
pub mod airdrop_escrow {
    use super::*;

    /// Atomically create a pump coin whose `creator` is this program's escrow PDA,
    /// buy `amount` base tokens with the dev's SOL, and split the proceeds:
    /// `escrow_bps` to the escrow token account, the remainder stays with the dev.
    pub fn launch(
        ctx: Context<Launch>,
        name: String,
        symbol: String,
        uri: String,
        escrow_bps: u16,
        amount: u64,
        max_sol_cost: u64,
        manual_root: [u8; 32],
        manual_bps: u16,
        platform: Pubkey,
    ) -> Result<()> {
        require!(manual_bps as u64 <= BPS_DENOM, EscrowError::InvalidBps);
        require!(escrow_bps as u64 <= BPS_DENOM, EscrowError::InvalidBps);
        require!(amount > 0, EscrowError::ZeroAmount);

        let mint_key = ctx.accounts.mint.key();
        let escrow_key = ctx.accounts.escrow.key();

        // ---- 1. create_v2: the coin's creator is our escrow PDA -----------------
        cpi_create_v2(&ctx.accounts, name, symbol, uri, escrow_key)?;

        // ---- 2. the mint now exists: open both base ATAs ------------------------
        // Cannot be `init_if_needed` in the Accounts struct because the mint is
        // uninitialized at account-validation time.
        create_ata_idempotent(
            &ctx.accounts.dev,
            &ctx.accounts.dev,
            &ctx.accounts.associated_base_user,
            &ctx.accounts.mint,
            &ctx.accounts.base_token_program,
            &ctx.accounts.associated_token_program,
            &ctx.accounts.system_program,
        )?;
        create_ata_idempotent(
            &ctx.accounts.dev,
            &ctx.accounts.escrow.to_account_info(),
            &ctx.accounts.escrow_token_account,
            &ctx.accounts.mint,
            &ctx.accounts.base_token_program,
            &ctx.accounts.associated_token_program,
            &ctx.accounts.system_program,
        )?;

        // ---- 3. buy_v2: dev pays, dev receives -------------------------------
        cpi_buy_v2(&ctx.accounts, amount, max_sol_cost)?;

        // ---- 4. split: escrow_bps of the buy goes to the escrow ATA -----------
        let escrow_cut = (amount as u128)
            .checked_mul(escrow_bps as u128)
            .ok_or(EscrowError::Overflow)?
            .checked_div(BPS_DENOM as u128)
            .ok_or(EscrowError::Overflow)? as u64;

        if escrow_cut > 0 {
            let decimals = read_mint_decimals(&ctx.accounts.mint)?;
            token_interface::transfer_checked(
                CpiContext::new(
                    ctx.accounts.base_token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.associated_base_user.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.escrow_token_account.to_account_info(),
                        authority: ctx.accounts.dev.to_account_info(),
                    },
                ),
                escrow_cut,
                decimals,
            )?;
        }

        // ---- 5. set aside the dev's manual airdrop list share -----------------
        let dev_share = amount.saturating_sub(escrow_cut);
        let manual_total = if manual_bps > 0 && manual_root != [0u8; 32] {
            let t = (dev_share as u128)
                .checked_mul(manual_bps as u128)
                .ok_or(EscrowError::Overflow)?
                / BPS_DENOM as u128;
            let t = t as u64;
            if t > 0 {
                create_ata_idempotent(
                    &ctx.accounts.dev,
                    &ctx.accounts.manual_authority,
                    &ctx.accounts.manual_token_account,
                    &ctx.accounts.mint,
                    &ctx.accounts.base_token_program,
                    &ctx.accounts.associated_token_program,
                    &ctx.accounts.system_program,
                )?;
                let decimals = read_mint_decimals(&ctx.accounts.mint)?;
                token_interface::transfer_checked(
                    CpiContext::new(
                        ctx.accounts.base_token_program.key(),
                        TransferChecked {
                            from: ctx.accounts.associated_base_user.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                            to: ctx.accounts.manual_token_account.to_account_info(),
                            authority: ctx.accounts.dev.to_account_info(),
                        },
                    ),
                    t,
                    decimals,
                )?;
            }
            t
        } else {
            0
        };

        let escrow = &mut ctx.accounts.escrow;
        escrow.dev = ctx.accounts.dev.key();
        escrow.mint = mint_key;
        escrow.escrow_bps = escrow_bps;
        escrow.bought = amount;
        escrow.escrowed = escrow_cut;
        escrow.allocated = 0;
        escrow.claimed = 0;
        escrow.holder_count = 0;
        escrow.fees_collected = 0;
        escrow.buyback_spent = 0;
        escrow.buyback_tokens = 0;
        escrow.cum_volume = 0;
        escrow.last_quote_reserves = 0;
        escrow.volume_at_last_dist = 0;
        escrow.last_milestone_mcap = 0;
        escrow.max_delay_slots = DEFAULT_MAX_DELAY_SLOTS;
        escrow.armed = false;
        escrow.armed_kind = 0;
        escrow.fire_slot = 0;
        escrow.authorized = 0;
        escrow.pending = 0;
        escrow.manual_root = manual_root;
        escrow.manual_bps = manual_bps;
        escrow.manual_total = manual_total;
        escrow.manual_claimed_bps = 0;
        escrow.manual_claimed_bits = [0u8; 8];
        escrow.manual_unlock_ts = Clock::get()?
            .unix_timestamp
            .saturating_add(MANUAL_LOCK_SECONDS);
        escrow.manual_locked = true;
        escrow.manual_published = 0;
        escrow.platform = platform;
        escrow.day_start_ts = 0;
        escrow.day_start_volume = 0;
        escrow.low_volume_days = 0;
        escrow.dead = false;
        escrow.day_seconds = DEFAULT_DAY_SECONDS;
        escrow.bump = ctx.bumps.escrow;

        emit!(Launched {
            escrow: escrow_key,
            mint: mint_key,
            dev: escrow.dev,
            bought: amount,
            escrowed: escrow_cut,
        });
        Ok(())
    }

    /// Sweep the pump bonding-curve creator vault. The creator is our escrow PDA,
    /// so the lamports land on the PDA itself.
    pub fn collect_fees(ctx: Context<CollectFees>) -> Result<()> {
        let before = ctx.accounts.escrow.to_account_info().lamports();

        let mint_key = ctx.accounts.escrow.mint;
        let bump = ctx.accounts.escrow.bump;
        let seeds: &[&[u8]] = &[ESCROW_SEED, mint_key.as_ref(), &[bump]];

        pump::cpi::collect_creator_fee_v2(CpiContext::new_with_signer(
            pump::ID,
            pump::cpi::accounts::CollectCreatorFeeV2 {
                creator: ctx.accounts.escrow.to_account_info(),
                creator_token_account: ctx.accounts.creator_token_account.to_account_info(),
                creator_vault: ctx.accounts.creator_vault.to_account_info(),
                creator_vault_token_account: ctx
                    .accounts
                    .creator_vault_token_account
                    .to_account_info(),
                quote_mint: ctx.accounts.quote_mint.to_account_info(),
                quote_token_program: ctx.accounts.quote_token_program.to_account_info(),
                associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                event_authority: ctx.accounts.event_authority.to_account_info(),
                program: ctx.accounts.pump_program.to_account_info(),
            },
            &[seeds],
        ))?;

        let after = ctx.accounts.escrow.to_account_info().lamports();
        let gained = after.saturating_sub(before);
        ctx.accounts.escrow.fees_collected = ctx
            .accounts
            .escrow
            .fees_collected
            .checked_add(gained)
            .ok_or(EscrowError::Overflow)?;

        emit!(FeesCollected {
            escrow: ctx.accounts.escrow.key(),
            lamports: gained,
        });
        Ok(())
    }

    /// Claim a share from the manual list the dev fixed at launch. The list is
    /// only committed as a root, so the caller proves their own entry. Nothing
    /// here can be changed after launch, and nobody can add themselves.
    pub fn claim_manual(
        ctx: Context<ClaimManual>,
        index: u16,
        bps: u16,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.manual_total > 0, EscrowError::NoManualAirdrop);
        require!(index < MAX_MANUAL_ENTRIES, EscrowError::BadManualIndex);
        require!(bps > 0 && bps as u64 <= BPS_DENOM, EscrowError::InvalidBps);

        let byte = (index / 8) as usize;
        let bit = 1u8 << (index % 8);
        require!(
            escrow.manual_claimed_bits[byte] & bit == 0,
            EscrowError::ManualAlreadyClaimed
        );
        // The root alone cannot prove the list sums to 100%, so the cap is
        // enforced as claims come in.
        let total_bps = escrow
            .manual_claimed_bps
            .checked_add(bps)
            .ok_or(EscrowError::Overflow)?;
        require!(total_bps as u64 <= BPS_DENOM, EscrowError::ManualOverAllocated);

        let wallet = ctx.accounts.wallet.key();
        let mut node = hashv(&[
            b"manual",
            &index.to_le_bytes(),
            wallet.as_ref(),
            &bps.to_le_bytes(),
        ])
        .to_bytes();
        for sibling in proof.iter() {
            node = if node <= *sibling {
                hashv(&[b"node", &node, sibling]).to_bytes()
            } else {
                hashv(&[b"node", sibling, &node]).to_bytes()
            };
        }
        require!(node == escrow.manual_root, EscrowError::BadProof);

        let amount = (escrow.manual_total as u128)
            .checked_mul(bps as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;
        require!(amount > 0, EscrowError::ZeroAmount);

        let mint_key = escrow.mint;
        let auth_bump = ctx.bumps.manual_authority;
        let seeds: &[&[u8]] = &[MANUAL_SEED, mint_key.as_ref(), &[auth_bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.base_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.manual_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.wallet_token_account.to_account_info(),
                    authority: ctx.accounts.manual_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount as u64,
            ctx.accounts.mint.decimals,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.manual_claimed_bits[byte] |= bit;
        escrow.manual_claimed_bps = total_bps;
        if Clock::get()?.unix_timestamp >= escrow.manual_unlock_ts {
            escrow.manual_locked = false;
        }

        emit!(ManualClaimed {
            escrow: escrow.key(),
            wallet,
            index,
            bps,
            amount: amount as u64,
            claimed_bps_total: total_bps,
        });
        Ok(())
    }

    /// Publish rows of the manual list on chain. The root committed at launch is
    /// still the authority; this only makes the data available so anyone can
    /// rebuild the tree and check the root matches. Rows that do not match will
    /// simply produce a different root, which everybody can see.
    pub fn publish_manual_list(
        ctx: Context<PublishManualList>,
        entries: Vec<ManualEntry>,
    ) -> Result<()> {
        require!(!entries.is_empty(), EscrowError::BadManualIndex);
        for e in entries.iter() {
            require!(e.index < MAX_MANUAL_ENTRIES, EscrowError::BadManualIndex);
            require!(e.bps > 0 && e.bps as u64 <= BPS_DENOM, EscrowError::InvalidBps);
        }
        let escrow = &mut ctx.accounts.escrow;
        escrow.manual_published = escrow
            .manual_published
            .saturating_add(entries.len() as u16);

        emit!(ManualListPublished {
            escrow: escrow.key(),
            root: escrow.manual_root,
            published_total: escrow.manual_published,
            entries,
        });
        Ok(())
    }

    /// Length of a volume day. Only a test knob: shortening it makes the dead
    /// coin flag trip in seconds instead of a week.
    pub fn set_day_window(ctx: Context<SetDelayWindow>, seconds: i64) -> Result<()> {
        require!(
            seconds >= MIN_DAY_SECONDS && seconds <= DEFAULT_DAY_SECONDS,
            EscrowError::BadDayWindow
        );
        ctx.accounts.escrow.day_seconds = seconds;
        Ok(())
    }

    /// The only way anyone privileged can move tokens that are stuck.
    /// Two sources, two destinations, nothing else:
    ///   - unclaimed manual shares, once the 30 day lock has passed
    ///   - the automatic pool, once the coin is flagged dead
    /// and the money can only go to the dev wallet or back into the pool.
    pub fn intervene(ctx: Context<Intervene>, source: u8, target: u8) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.platform.key(),
            ctx.accounts.escrow.platform,
            EscrowError::NotPlatform
        );
        let now_ts = Clock::get()?.unix_timestamp;
        let escrow_key = ctx.accounts.escrow.key();
        let mint_key = ctx.accounts.escrow.mint;
        let decimals = ctx.accounts.mint.decimals;

        let amount = match source {
            SRC_MANUAL => {
                require!(
                    now_ts >= ctx.accounts.escrow.manual_unlock_ts,
                    EscrowError::StillLocked
                );
                ctx.accounts.manual_token_account.amount
            }
            SRC_DEAD_POOL => {
                require!(ctx.accounts.escrow.dead, EscrowError::NotDead);
                // only what is not already committed to an open round
                ctx.accounts
                    .escrow
                    .escrowed
                    .saturating_sub(ctx.accounts.escrow.allocated)
            }
            _ => return err!(EscrowError::BadInterventionTarget),
        };
        require!(amount > 0, EscrowError::NothingToMove);

        // Moving the pool into itself is meaningless.
        require!(
            !(source == SRC_DEAD_POOL && target == DST_POOL),
            EscrowError::BadInterventionTarget
        );
        require!(target == DST_DEV || target == DST_POOL, EscrowError::BadInterventionTarget);

        let to = if target == DST_DEV {
            ctx.accounts.dev_token_account.to_account_info()
        } else {
            ctx.accounts.escrow_token_account.to_account_info()
        };

        if source == SRC_MANUAL {
            let bump = ctx.bumps.manual_authority;
            let seeds: &[&[u8]] = &[MANUAL_SEED, mint_key.as_ref(), &[bump]];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.base_token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.manual_token_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to,
                        authority: ctx.accounts.manual_authority.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
                decimals,
            )?;
            if target == DST_POOL {
                let escrow = &mut ctx.accounts.escrow;
                escrow.escrowed = escrow.escrowed.checked_add(amount).ok_or(EscrowError::Overflow)?;
            }
        } else {
            let bump = ctx.accounts.escrow.bump;
            let seeds: &[&[u8]] = &[ESCROW_SEED, mint_key.as_ref(), &[bump]];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.base_token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.escrow_token_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to,
                        authority: ctx.accounts.escrow.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
                decimals,
            )?;
            let escrow = &mut ctx.accounts.escrow;
            escrow.escrowed = escrow.escrowed.saturating_sub(amount);
        }

        if source == SRC_MANUAL {
            ctx.accounts.escrow.manual_locked = false;
        }
        emit!(Intervened {
            escrow: escrow_key,
            platform: ctx.accounts.platform.key(),
            source,
            target,
            amount,
        });
        Ok(())
    }

    /// Narrow or widen the random firing window. A small window makes the
    /// distribution moment predictable, so this is really a test knob;
    /// production should stay at `DEFAULT_MAX_DELAY_SLOTS`.
    pub fn set_delay_window(ctx: Context<SetDelayWindow>, slots: u64) -> Result<()> {
        require!(
            slots >= MIN_MAX_DELAY_SLOTS && slots <= DEFAULT_MAX_DELAY_SLOTS,
            EscrowError::BadDelayWindow
        );
        ctx.accounts.escrow.max_delay_slots = slots;
        Ok(())
    }

    /// Permissionless. Samples the curve, and if a trigger condition is met arms
    /// a distribution for a random slot up to `max_delay_slots` from now. Does
    /// nothing — without failing — when no condition holds, so a keeper can call
    /// it on a loop.
    pub fn check_trigger(ctx: Context<CheckTrigger>) -> Result<()> {
        let curve = &ctx.accounts.bonding_curve;
        let quote = curve.virtual_quote_reserves;
        let mcap = (curve.token_total_supply as u128)
            .checked_mul(quote as u128)
            .ok_or(EscrowError::Overflow)?
            / (curve.virtual_token_reserves as u128);

        let escrow = &mut ctx.accounts.escrow;

        // Sample volume: absolute move of the quote reserves since last look.
        if escrow.last_quote_reserves == 0 {
            escrow.last_quote_reserves = quote;
        } else {
            let delta = quote.abs_diff(escrow.last_quote_reserves) as u128;
            escrow.cum_volume = escrow.cum_volume.saturating_add(delta);
            escrow.last_quote_reserves = quote;
        }
        // Roll the volume day and track how long the coin has been quiet.
        let now_ts = Clock::get()?.unix_timestamp;
        if escrow.day_start_ts == 0 {
            escrow.day_start_ts = now_ts;
            escrow.day_start_volume = escrow.cum_volume;
        } else if now_ts.saturating_sub(escrow.day_start_ts) >= escrow.day_seconds {
            let day_volume = escrow.cum_volume.saturating_sub(escrow.day_start_volume);
            let quiet_below = mcap
                .checked_mul(DEAD_VOLUME_BPS)
                .ok_or(EscrowError::Overflow)?
                / BPS_DENOM as u128;
            escrow.low_volume_days = if day_volume < quiet_below {
                escrow.low_volume_days.saturating_add(1)
            } else {
                0
            };
            escrow.day_start_ts = now_ts;
            escrow.day_start_volume = escrow.cum_volume;
            let was_dead = escrow.dead;
            escrow.dead = escrow.low_volume_days >= DEAD_COIN_DAYS;
            if escrow.dead && !was_dead {
                emit!(DeadCoinFlagged {
                    escrow: escrow.key(),
                    quiet_days: escrow.low_volume_days,
                    mcap: mcap as u64,
                });
            }
        }

        // First sight of the coin sets the milestone baseline; no payout for it.
        if escrow.last_milestone_mcap == 0 {
            escrow.last_milestone_mcap = mcap.min(u64::MAX as u128) as u64;
            emit!(TriggerChecked { escrow: escrow.key(), mcap: escrow.last_milestone_mcap,
                                   cum_volume: escrow.cum_volume, armed: false, kind: 0 });
            return Ok(());
        }

        if escrow.armed {
            emit!(TriggerChecked { escrow: escrow.key(), mcap: mcap as u64,
                                   cum_volume: escrow.cum_volume, armed: true,
                                   kind: escrow.armed_kind });
            return Ok(());
        }

        let pool = escrow
            .escrowed
            .checked_sub(escrow.allocated)
            .ok_or(EscrowError::Overflow)?;

        // Milestone wins over volume when both are due: it pays more.
        let doubled = (escrow.last_milestone_mcap as u128).saturating_mul(2);
        let volume_since = escrow.cum_volume.saturating_sub(escrow.volume_at_last_dist);
        let volume_needed = mcap
            .checked_mul(VOLUME_TRIGGER_BPS)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;

        let (kind, release_bps) = if mcap >= doubled {
            (TRIGGER_MILESTONE, MILESTONE_RELEASE_BPS)
        } else if volume_needed > 0 && volume_since >= volume_needed {
            (TRIGGER_VOLUME, VOLUME_RELEASE_BPS)
        } else {
            emit!(TriggerChecked { escrow: escrow.key(), mcap: mcap as u64,
                                   cum_volume: escrow.cum_volume, armed: false, kind: 0 });
            return Ok(());
        };

        let amount = (pool as u128)
            .checked_mul(release_bps as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;
        if amount == 0 {
            emit!(TriggerChecked { escrow: escrow.key(), mcap: mcap as u64,
                                   cum_volume: escrow.cum_volume, armed: false, kind: 0 });
            return Ok(());
        }

        // Random delay so the exact distribution slot cannot be front-run.
        let data = ctx.accounts.slot_hashes.try_borrow_data()?;
        require!(data.len() >= 48, EscrowError::NoSlotHash);
        let now = Clock::get()?.slot;
        let h = hashv(&[&data[16..48], escrow.key().as_ref(), &now.to_le_bytes()]);
        let span = escrow.max_delay_slots.saturating_add(1);
        let delay = u64::from_le_bytes(h.to_bytes()[0..8].try_into().unwrap()) % span;

        escrow.armed = true;
        escrow.armed_kind = kind;
        escrow.fire_slot = now.saturating_add(delay);
        escrow.authorized = amount as u64;

        emit!(TriggerArmed {
            escrow: escrow.key(),
            kind,
            mcap: mcap as u64,
            amount: escrow.authorized,
            armed_slot: now,
            fire_slot: escrow.fire_slot,
        });
        Ok(())
    }

    /// Permissionless. Releases an armed trigger once its delay has passed.
    /// Calling it early is an error, not a no-op — the caller is asking for
    /// something specific and should hear that it is not time yet.
    pub fn fire_trigger(ctx: Context<FireTrigger>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.armed, EscrowError::NotArmed);
        let now = Clock::get()?.slot;
        require!(now >= escrow.fire_slot, EscrowError::TooEarly);

        let amount = escrow.authorized;
        escrow.pending = escrow
            .pending
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;

        if escrow.armed_kind == TRIGGER_MILESTONE {
            let curve = &ctx.accounts.bonding_curve;
            let mcap = (curve.token_total_supply as u128)
                .checked_mul(curve.virtual_quote_reserves as u128)
                .ok_or(EscrowError::Overflow)?
                / (curve.virtual_token_reserves as u128);
            let mcap = mcap.min(u64::MAX as u128) as u64;
            // Milestones ratchet: never step back down.
            if mcap > escrow.last_milestone_mcap {
                escrow.last_milestone_mcap = mcap;
            }
        }
        escrow.volume_at_last_dist = escrow.cum_volume;

        let kind = escrow.armed_kind;
        escrow.armed = false;
        escrow.armed_kind = 0;
        escrow.authorized = 0;
        escrow.fire_slot = 0;

        emit!(TriggerFired { escrow: escrow.key(), kind, amount, slot: now,
                             pending: escrow.pending });
        Ok(())
    }

    /// Commit the Merkle root of a holder snapshot for one distribution round.
    /// Only the root is stored; the randomness that picks winners is drawn in a
    /// separate, later transaction, so whoever publishes the root cannot know who
    /// will win and therefore cannot pick them.
    pub fn open_round(
        ctx: Context<OpenRound>,
        index: u32,
        root: [u8; 32],
        total_weight: u128,
        winner_count: u16,
        prize: u64,
    ) -> Result<()> {
        require!(
            winner_count > 0 && winner_count <= MAX_WINNERS,
            EscrowError::BadWinnerCount
        );
        require!(total_weight > 0, EscrowError::ZeroWeight);
        require!(prize > 0, EscrowError::ZeroAmount);
        require!(root != [0u8; 32], EscrowError::EmptyRoot);

        // The whole purse must already be sitting in the escrow token account.
        let committed = (winner_count as u64)
            .checked_mul(prize)
            .ok_or(EscrowError::Overflow)?;
        // The amount is not the publisher's to choose: it is exactly what a
        // trigger released.
        require!(
            committed <= ctx.accounts.escrow.pending,
            EscrowError::AmountNotAuthorized
        );
        let free = ctx
            .accounts
            .escrow
            .escrowed
            .checked_sub(ctx.accounts.escrow.allocated)
            .ok_or(EscrowError::Overflow)?;
        require!(free >= committed, EscrowError::NothingToClaim);

        let round = &mut ctx.accounts.round;
        round.escrow = ctx.accounts.escrow.key();
        round.index = index;
        round.root = root;
        round.total_weight = total_weight;
        round.winner_count = winner_count;
        round.prize = prize;
        round.commit_slot = Clock::get()?.slot;
        round.seed = [0u8; 32];
        round.drawn = false;
        round.claimed_bits = [0u8; 32];
        round.claimed_count = 0;
        round.bump = ctx.bumps.round;

        let escrow = &mut ctx.accounts.escrow;
        escrow.allocated = escrow
            .allocated
            .checked_add(committed)
            .ok_or(EscrowError::Overflow)?;
        escrow.pending = escrow
            .pending
            .checked_sub(committed)
            .ok_or(EscrowError::Overflow)?;

        emit!(RoundOpened {
            escrow: round.escrow,
            index,
            root,
            total_weight,
            winner_count,
            prize,
            commit_slot: round.commit_slot,
        });
        Ok(())
    }

    /// Draw the randomness for a round. Permissionless, and only valid at least
    /// `DRAW_DELAY_SLOTS` after the root was committed.
    pub fn draw(ctx: Context<Draw>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(!round.drawn, EscrowError::AlreadyDrawn);
        let now = Clock::get()?.slot;
        require!(
            now >= round.commit_slot.saturating_add(DRAW_DELAY_SLOTS),
            EscrowError::DrawTooEarly
        );

        // The SlotHashes sysvar is far too big to deserialize; read the newest
        // entry straight out of its buffer: u64 count, then (slot, hash) pairs.
        let data = ctx.accounts.slot_hashes.try_borrow_data()?;
        require!(data.len() >= 8 + 40, EscrowError::NoSlotHash);
        let mut recent = [0u8; 32];
        recent.copy_from_slice(&data[16..48]);
        let recent_slot = u64::from_le_bytes(data[8..16].try_into().unwrap());

        round.seed = hashv(&[
            &recent,
            &recent_slot.to_le_bytes(),
            round.key().as_ref(),
            &round.root,
        ])
        .to_bytes();
        round.drawn = true;

        emit!(RoundDrawn {
            escrow: round.escrow,
            index: round.index,
            seed: round.seed,
            slot: recent_slot,
        });
        Ok(())
    }

    /// Claim one winning draw. The caller proves their snapshot leaf is in the
    /// committed tree and that the draw landed inside their weight range; the
    /// program then checks, on its own, that they still hold a large enough
    /// position right now.
    pub fn claim_prize(
        ctx: Context<ClaimPrize>,
        draw_index: u16,
        leaf_index: u32,
        weight: u64,
        cum_start: u128,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let round = &ctx.accounts.round;
        require!(round.drawn, EscrowError::NotDrawn);
        require!(draw_index < round.winner_count, EscrowError::BadWinnerCount);
        require!(weight > 0, EscrowError::ZeroWeight);

        // one prize per draw index
        let byte = (draw_index / 8) as usize;
        let bit = 1u8 << (draw_index % 8);
        require!(
            round.claimed_bits[byte] & bit == 0,
            EscrowError::AlreadyClaimed
        );

        // Where this draw landed on the cumulative weight line.
        let h = hashv(&[&round.seed, &draw_index.to_le_bytes()]);
        let ticket = u128::from_le_bytes(h.to_bytes()[0..16].try_into().unwrap())
            % round.total_weight;
        let end = cum_start
            .checked_add(weight as u128)
            .ok_or(EscrowError::Overflow)?;
        require!(
            cum_start <= ticket && ticket < end,
            EscrowError::TicketOutOfRange
        );

        // The leaf binds holder, weight and position on that line together.
        let holder = ctx.accounts.holder.key();
        let mut node = hashv(&[
            b"leaf",
            &leaf_index.to_le_bytes(),
            holder.as_ref(),
            &weight.to_le_bytes(),
            &cum_start.to_le_bytes(),
        ])
        .to_bytes();
        for sibling in proof.iter() {
            node = if node <= *sibling {
                hashv(&[b"node", &node, sibling]).to_bytes()
            } else {
                hashv(&[b"node", sibling, &node]).to_bytes()
            };
        }
        require!(node == round.root, EscrowError::BadProof);

        // Independent of the snapshot: is this holder still in, right now, and
        // big enough? The publisher cannot fake either of these.
        let balance = ctx.accounts.holder_token_account.amount;
        require!(balance > 0, EscrowError::PositionTooSmall);
        let curve = &ctx.accounts.bonding_curve;
        let value = (balance as u128)
            .checked_mul(curve.virtual_quote_reserves as u128)
            .ok_or(EscrowError::Overflow)?
            / (curve.virtual_token_reserves as u128);
        require!(
            value >= MIN_POSITION_LAMPORTS as u128,
            EscrowError::PositionTooSmall
        );

        let prize = round.prize;
        let mint_key = ctx.accounts.escrow.mint;
        let bump = ctx.accounts.escrow.bump;
        let seeds: &[&[u8]] = &[ESCROW_SEED, mint_key.as_ref(), &[bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.base_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.holder_token_account.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                &[seeds],
            ),
            prize,
            ctx.accounts.mint.decimals,
        )?;

        let round = &mut ctx.accounts.round;
        round.claimed_bits[byte] |= bit;
        round.claimed_count = round.claimed_count.saturating_add(1);
        let escrow = &mut ctx.accounts.escrow;
        escrow.claimed = escrow.claimed.checked_add(prize).ok_or(EscrowError::Overflow)?;

        emit!(PrizeClaimed {
            escrow: escrow.key(),
            round: ctx.accounts.round.key(),
            draw_index,
            holder,
            amount: prize,
            position_value: value as u64,
        });
        Ok(())
    }

    /// Permissionless: turn the escrow's accumulated SOL (creator fees swept by
    /// `collect_fees`, or anything else sent to the PDA) into more of the coin,
    /// deposited straight into the escrow token account.
    ///
    /// A no-op below `MIN_BUYBACK_LAMPORTS` — it returns `Ok(())` rather than
    /// erroring so a keeper can call it on a schedule without handling failures.
    pub fn buyback(ctx: Context<Buyback>) -> Result<()> {
        let escrow_ai = ctx.accounts.escrow.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(escrow_ai.data_len());
        // The escrow must stay rent-exempt; only what sits above that is spendable.
        let from_escrow = escrow_ai.lamports().saturating_sub(rent_min);
        let in_buyer = ctx.accounts.buyer.lamports();
        let available = from_escrow
            .saturating_add(in_buyer)
            .saturating_sub(BUYBACK_RESERVE_LAMPORTS);

        // The threshold is about whether enough has piled up to bother at all...
        if available < MIN_BUYBACK_LAMPORTS {
            emit!(BuybackSkipped {
                escrow: ctx.accounts.escrow.key(),
                spendable: available,
                threshold: MIN_BUYBACK_LAMPORTS,
            });
            return Ok(());
        }

        // ...and the cap is about how much of it a single call may spend. What is
        // left over stays put and is picked up by the next call.
        let cap = (ctx.accounts.bonding_curve.virtual_quote_reserves as u128)
            .checked_mul(BUYBACK_MAX_RESERVE_BPS as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;
        let quote_in = (available as u128).min(cap) as u64;
        require!(quote_in > 0, EscrowError::ZeroAmount);

        // Move only what this call actually needs. Whatever the cap held back
        // stays in the escrow and is picked up by the next call.
        let needed = quote_in
            .saturating_add(BUYBACK_RESERVE_LAMPORTS)
            .saturating_sub(in_buyer)
            .min(from_escrow);

        // Pump moves the buyer's SOL with a system transfer, which requires a
        // system-owned, dataless signer. The escrow PDA carries state and is owned
        // by this program, so it cannot be the buyer: the caller fronts the SOL to a
        // dataless PDA we can sign for, and the escrow reimburses them at the end.
        //
        // The reimbursement is deliberately the LAST thing this instruction does.
        // Rewriting lamports by hand before a CPI trips the runtime's balance
        // verification at the CPI boundary; after the final CPI only the top-level
        // check remains, and that one nets out.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.buyer.to_account_info(),
                },
            ),
            needed,
        )?;

        let mint_key = ctx.accounts.escrow.mint;
        let buyer_bump = ctx.bumps.buyer;
        let buyer_seeds: &[&[u8]] = &[BUYER_SEED, mint_key.as_ref(), &[buyer_bump]];

        // Quote the buy from the curve itself. `bonding_curve` and `global` are
        // pinned to their pump PDAs in the Accounts struct, so these reserves cannot
        // be swapped for an attacker-controlled account with flattering numbers.
        let curve = &ctx.accounts.bonding_curve;
        require!(!curve.complete, EscrowError::CurveComplete);
        require_keys_eq!(
            curve.quote_mint,
            Pubkey::default(),
            EscrowError::QuoteMintMismatch
        );

        let g = &ctx.accounts.global;
        let fee_bps = g
            .fee_basis_points
            .checked_add(g.creator_fee_basis_points)
            .ok_or(EscrowError::Overflow)?;

        // quote_in carries the fees, so only part of it reaches the curve.
        let quote_net = (quote_in as u128)
            .checked_mul(BPS_DENOM as u128)
            .ok_or(EscrowError::Overflow)?
            / (BPS_DENOM as u128 + fee_bps as u128);

        // Constant product against the virtual reserves, capped by what the curve
        // actually holds.
        let out = quote_net
            .checked_mul(curve.virtual_token_reserves as u128)
            .ok_or(EscrowError::Overflow)?
            / (curve.virtual_quote_reserves as u128)
                .checked_add(quote_net)
                .ok_or(EscrowError::Overflow)?;
        let expected_out = out.min(curve.real_token_reserves as u128);

        let min_tokens_out = (expected_out
            .checked_mul((BPS_DENOM - BUYBACK_SLIPPAGE_BPS) as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128) as u64;
        require!(min_tokens_out > 0, EscrowError::ZeroAmount);

        let before = ctx.accounts.buyer_token_account.amount;

        pump::cpi::buy_exact_quote_in_v2(
            CpiContext::new_with_signer(
                pump::ID,
                pump::cpi::accounts::BuyExactQuoteInV2 {
                    global: ctx.accounts.global.to_account_info(),
                    base_mint: ctx.accounts.mint.to_account_info(),
                    quote_mint: ctx.accounts.quote_mint.to_account_info(),
                    base_token_program: ctx.accounts.base_token_program.to_account_info(),
                    quote_token_program: ctx.accounts.quote_token_program.to_account_info(),
                    associated_token_program: ctx
                        .accounts
                        .associated_token_program
                        .to_account_info(),
                    fee_recipient: ctx.accounts.fee_recipient.to_account_info(),
                    associated_quote_fee_recipient: ctx
                        .accounts
                        .associated_quote_fee_recipient
                        .to_account_info(),
                    buyback_fee_recipient: ctx.accounts.buyback_fee_recipient.to_account_info(),
                    associated_quote_buyback_fee_recipient: ctx
                        .accounts
                        .associated_quote_buyback_fee_recipient
                        .to_account_info(),
                    bonding_curve: ctx.accounts.bonding_curve.to_account_info(),
                    associated_base_bonding_curve: ctx
                        .accounts
                        .associated_base_bonding_curve
                        .to_account_info(),
                    associated_quote_bonding_curve: ctx
                        .accounts
                        .associated_quote_bonding_curve
                        .to_account_info(),
                    user: ctx.accounts.buyer.to_account_info(),
                    associated_base_user: ctx
                        .accounts
                        .buyer_token_account
                        .to_account_info(),
                    associated_quote_user: ctx.accounts.associated_quote_user.to_account_info(),
                    creator_vault: ctx.accounts.creator_vault.to_account_info(),
                    associated_creator_vault: ctx
                        .accounts
                        .associated_creator_vault
                        .to_account_info(),
                    sharing_config: ctx.accounts.sharing_config.to_account_info(),
                    global_volume_accumulator: ctx
                        .accounts
                        .global_volume_accumulator
                        .to_account_info(),
                    user_volume_accumulator: ctx
                        .accounts
                        .user_volume_accumulator
                        .to_account_info(),
                    associated_user_volume_accumulator: ctx
                        .accounts
                        .associated_user_volume_accumulator
                        .to_account_info(),
                    fee_config: ctx.accounts.fee_config.to_account_info(),
                    fee_program: ctx.accounts.fee_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    event_authority: ctx.accounts.event_authority.to_account_info(),
                    program: ctx.accounts.pump_program.to_account_info(),
                },
                &[buyer_seeds],
            ),
            quote_in,
            min_tokens_out,
        )?;

        // Sweep what the buy produced into the escrow token account.
        ctx.accounts.buyer_token_account.reload()?;
        let gained = ctx.accounts.buyer_token_account.amount.saturating_sub(before);
        require!(gained >= min_tokens_out, EscrowError::SlippageExceeded);
        if gained > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.base_token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.buyer_token_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.escrow_token_account.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                    &[buyer_seeds],
                ),
                gained,
                ctx.accounts.mint.decimals,
            )?;
        }

        // Reimburse whoever fronted the SOL, now that no further CPI follows.
        **escrow_ai.try_borrow_mut_lamports()? -= needed;
        **ctx.accounts.payer.try_borrow_mut_lamports()? += needed;

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyback_spent = escrow
            .buyback_spent
            .checked_add(quote_in)
            .ok_or(EscrowError::Overflow)?;
        escrow.buyback_tokens = escrow
            .buyback_tokens
            .checked_add(gained)
            .ok_or(EscrowError::Overflow)?;
        // Bought-back tokens join the distributable pool.
        escrow.escrowed = escrow
            .escrowed
            .checked_add(gained)
            .ok_or(EscrowError::Overflow)?;

        emit!(BuybackDone {
            escrow: escrow.key(),
            lamports_spent: quote_in,
            tokens_bought: gained,
            quoted: expected_out as u64,
            floor: min_tokens_out,
            left_for_next_call: available.saturating_sub(quote_in),
        });
        Ok(())
    }

}


/// Kept in its own frame on purpose: the pump CPI account structs are large
/// enough that building them alongside each other overflows the 4KB BPF stack.
#[inline(never)]
fn cpi_create_v2<'info>(
    a: &Launch<'info>,
    name: String,
    symbol: String,
    uri: String,
    creator: Pubkey,
) -> Result<()> {
        pump::cpi::create_v2(
            CpiContext::new(
                pump::ID,
                pump::cpi::accounts::CreateV2 {
                    mint: a.mint.to_account_info(),
                    mint_authority: a.mint_authority.to_account_info(),
                    bonding_curve: a.bonding_curve.to_account_info(),
                    associated_bonding_curve: a.associated_base_bonding_curve
                        .to_account_info(),
                    global: a.global.to_account_info(),
                    user: a.dev.to_account_info(),
                    system_program: a.system_program.to_account_info(),
                    token_program: a.base_token_program.to_account_info(),
                    associated_token_program: a.associated_token_program
                        .to_account_info(),
                    mayhem_program_id: a.mayhem_program.to_account_info(),
                    global_params: a.global_params.to_account_info(),
                    sol_vault: a.sol_vault.to_account_info(),
                    mayhem_state: a.mayhem_state.to_account_info(),
                    mayhem_token_vault: a.mayhem_token_vault.to_account_info(),
                    event_authority: a.event_authority.to_account_info(),
                    program: a.pump_program.to_account_info(),
                },
            ),
            name,
            symbol,
            uri,
            creator,
            false,                 // is_mayhem_mode
            pump::types::OptionBool(false), // is_cashback_enabled = off
        )?;

    Ok(())
}

/// Kept in its own frame on purpose: the pump CPI account structs are large
/// enough that building them alongside each other overflows the 4KB BPF stack.
#[inline(never)]
fn cpi_buy_v2<'info>(
    a: &Launch<'info>,
    amount: u64,
    max_sol_cost: u64,
) -> Result<()> {
        pump::cpi::buy_v2(
            CpiContext::new(
                pump::ID,
                pump::cpi::accounts::BuyV2 {
                    global: a.global.to_account_info(),
                    base_mint: a.mint.to_account_info(),
                    quote_mint: a.quote_mint.to_account_info(),
                    base_token_program: a.base_token_program.to_account_info(),
                    quote_token_program: a.quote_token_program.to_account_info(),
                    associated_token_program: a.associated_token_program
                        .to_account_info(),
                    fee_recipient: a.fee_recipient.to_account_info(),
                    associated_quote_fee_recipient: a.associated_quote_fee_recipient
                        .to_account_info(),
                    buyback_fee_recipient: a.buyback_fee_recipient.to_account_info(),
                    associated_quote_buyback_fee_recipient: a.associated_quote_buyback_fee_recipient
                        .to_account_info(),
                    bonding_curve: a.bonding_curve.to_account_info(),
                    associated_base_bonding_curve: a.associated_base_bonding_curve
                        .to_account_info(),
                    associated_quote_bonding_curve: a.associated_quote_bonding_curve
                        .to_account_info(),
                    user: a.dev.to_account_info(),
                    associated_base_user: a.associated_base_user.to_account_info(),
                    associated_quote_user: a.associated_quote_user.to_account_info(),
                    creator_vault: a.creator_vault.to_account_info(),
                    associated_creator_vault: a.associated_creator_vault
                        .to_account_info(),
                    sharing_config: a.sharing_config.to_account_info(),
                    global_volume_accumulator: a.global_volume_accumulator
                        .to_account_info(),
                    user_volume_accumulator: a.user_volume_accumulator
                        .to_account_info(),
                    associated_user_volume_accumulator: a.associated_user_volume_accumulator
                        .to_account_info(),
                    fee_config: a.fee_config.to_account_info(),
                    fee_program: a.fee_program.to_account_info(),
                    system_program: a.system_program.to_account_info(),
                    event_authority: a.event_authority.to_account_info(),
                    program: a.pump_program.to_account_info(),
                },
            ),
            amount,
            max_sol_cost,
        )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

fn create_ata_idempotent<'info>(
    payer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    ata: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    ata_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let ix = spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        payer.key,
        owner.key,
        mint.key,
        token_program.key,
    );
    invoke(
        &ix,
        &[
            payer.clone(),
            ata.clone(),
            owner.clone(),
            mint.clone(),
            system_program.clone(),
            token_program.clone(),
            ata_program.clone(),
        ],
    )
    .map_err(Into::into)
}

/// Read `decimals` straight out of a Token-2022 mint account (offset 44).
fn read_mint_decimals(mint: &AccountInfo) -> Result<u8> {
    let data = mint.try_borrow_data()?;
    require!(data.len() > 44, EscrowError::ZeroAmount);
    Ok(data[44])
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

#[event]
pub struct Launched {
    pub escrow: Pubkey,
    pub mint: Pubkey,
    pub dev: Pubkey,
    pub bought: u64,
    pub escrowed: u64,
}
#[event]
pub struct FeesCollected {
    pub escrow: Pubkey,
    pub lamports: u64,
}
#[event]
pub struct ManualListPublished {
    pub escrow: Pubkey,
    pub root: [u8; 32],
    pub published_total: u16,
    pub entries: Vec<ManualEntry>,
}
#[event]
pub struct DeadCoinFlagged {
    pub escrow: Pubkey,
    pub quiet_days: u8,
    pub mcap: u64,
}
#[event]
pub struct Intervened {
    pub escrow: Pubkey,
    pub platform: Pubkey,
    pub source: u8,
    pub target: u8,
    pub amount: u64,
}
#[event]
pub struct ManualClaimed {
    pub escrow: Pubkey,
    pub wallet: Pubkey,
    pub index: u16,
    pub bps: u16,
    pub amount: u64,
    pub claimed_bps_total: u16,
}
#[event]
pub struct TriggerChecked {
    pub escrow: Pubkey,
    pub mcap: u64,
    pub cum_volume: u128,
    pub armed: bool,
    pub kind: u8,
}
#[event]
pub struct TriggerArmed {
    pub escrow: Pubkey,
    pub kind: u8,
    pub mcap: u64,
    pub amount: u64,
    pub armed_slot: u64,
    pub fire_slot: u64,
}
#[event]
pub struct TriggerFired {
    pub escrow: Pubkey,
    pub kind: u8,
    pub amount: u64,
    pub slot: u64,
    pub pending: u64,
}
#[event]
pub struct RoundOpened {
    pub escrow: Pubkey,
    pub index: u32,
    pub root: [u8; 32],
    pub total_weight: u128,
    pub winner_count: u16,
    pub prize: u64,
    pub commit_slot: u64,
}
#[event]
pub struct RoundDrawn {
    pub escrow: Pubkey,
    pub index: u32,
    pub seed: [u8; 32],
    pub slot: u64,
}
#[event]
pub struct BuybackDone {
    pub escrow: Pubkey,
    pub lamports_spent: u64,
    pub tokens_bought: u64,
    /// What the curve implied before the buy.
    pub quoted: u64,
    /// `quoted` less BUYBACK_SLIPPAGE_BPS; the buy must clear this.
    pub floor: u64,
    /// Spendable SOL the cap held back for the next call.
    pub left_for_next_call: u64,
}
#[event]
pub struct BuybackSkipped {
    pub escrow: Pubkey,
    pub spendable: u64,
    pub threshold: u64,
}
#[event]
pub struct PrizeClaimed {
    pub escrow: Pubkey,
    pub round: Pubkey,
    pub draw_index: u16,
    pub holder: Pubkey,
    pub amount: u64,
    /// The position value the program measured at claim time, in lamports.
    pub position_value: u64,
}

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

/// All pump accounts are unchecked pass-throughs: pump validates every one of
/// them itself, and the coin mint does not exist yet at validation time.
#[derive(Accounts)]
pub struct Launch<'info> {
    #[account(mut)]
    pub dev: Signer<'info>,
    /// New coin mint. Must be a fresh keypair; pump initializes it.
    /// CHECK: initialized by pump::create_v2
    #[account(mut, signer)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = dev,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, mint.key().as_ref()],
        bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    /// Escrow's ATA for the coin; opened in-handler once the mint exists.
    /// CHECK: address checked by the ATA program
    #[account(mut)]
    pub escrow_token_account: UncheckedAccount<'info>,

    /// Holds the manual airdrop shares. No data of its own; it only signs for
    /// its token account.
    /// CHECK: PDA, seeds checked here
    #[account(seeds = [MANUAL_SEED, mint.key().as_ref()], bump)]
    pub manual_authority: UncheckedAccount<'info>,
    /// CHECK: ATA, opened in-handler
    #[account(mut)]
    pub manual_token_account: UncheckedAccount<'info>,

    // ---- pump: shared ----
    /// CHECK: pump PDA
    #[account(mut)]
    pub global: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    #[account(mut)]
    pub bonding_curve: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_base_bonding_curve: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = pump::ID)]
    pub pump_program: UncheckedAccount<'info>,

    // ---- pump: create_v2 / mayhem ----
    /// CHECK: mayhem program
    #[account(mut)]
    pub mayhem_program: UncheckedAccount<'info>,
    /// CHECK: mayhem PDA
    pub global_params: UncheckedAccount<'info>,
    /// CHECK: mayhem PDA
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: mayhem PDA
    #[account(mut)]
    pub mayhem_state: UncheckedAccount<'info>,
    /// CHECK: mayhem vault
    #[account(mut)]
    pub mayhem_token_vault: UncheckedAccount<'info>,

    // ---- pump: buy_v2 ----
    /// CHECK: wSOL for SOL-paired coins
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: token program for the quote mint
    pub quote_token_program: UncheckedAccount<'info>,
    /// CHECK: from global config
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_fee_recipient: UncheckedAccount<'info>,
    /// CHECK: from global config
    #[account(mut)]
    pub buyback_fee_recipient: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_buyback_fee_recipient: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_bonding_curve: UncheckedAccount<'info>,
    /// CHECK: dev's ATA for the coin; opened in-handler
    #[account(mut)]
    pub associated_base_user: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_user: UncheckedAccount<'info>,
    /// CHECK: pump PDA seeded by the escrow (our creator)
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_creator_vault: UncheckedAccount<'info>,
    /// CHECK: pump-fees PDA
    pub sharing_config: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    #[account(mut)]
    pub global_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    #[account(mut)]
    pub user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: pump-fees PDA
    pub fee_config: UncheckedAccount<'info>,
    /// CHECK: pump fees program
    pub fee_program: UncheckedAccount<'info>,

    // ---- programs ----
    /// CHECK: Token-2022 for the coin
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: ATA program
    pub associated_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// CHECK: ATA of the escrow for the quote mint
    #[account(mut)]
    pub creator_token_account: UncheckedAccount<'info>,
    /// CHECK: pump PDA ["creator-vault", escrow]
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: ATA of the creator vault
    #[account(mut)]
    pub creator_vault_token_account: UncheckedAccount<'info>,
    /// CHECK: wSOL
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: token program for the quote mint
    pub quote_token_program: UncheckedAccount<'info>,
    /// CHECK: ATA program
    pub associated_token_program: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = pump::ID)]
    pub pump_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PublishManualList<'info> {
    #[account(mut)]
    pub dev: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.dev == dev.key() @ EscrowError::NotDev
    )]
    pub escrow: Box<Account<'info, Escrow>>,
}

#[derive(Accounts)]
pub struct Intervene<'info> {
    pub platform: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: PDA owning the manual token account
    #[account(seeds = [MANUAL_SEED, escrow.mint.as_ref()], bump)]
    pub manual_authority: UncheckedAccount<'info>,

    #[account(address = escrow.mint)]
    pub mint: Box<InterfaceAccount<'info, anchor_spl::token_interface::Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = manual_authority,
        associated_token::token_program = base_token_program,
    )]
    pub manual_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = base_token_program,
    )]
    pub escrow_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    /// The only other place tokens may go. Pinned to the dev recorded at launch.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = dev,
        associated_token::token_program = base_token_program,
    )]
    pub dev_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    /// CHECK: must be the dev recorded on the escrow
    #[account(address = escrow.dev)]
    pub dev: UncheckedAccount<'info>,
    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimManual<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    /// CHECK: PDA that owns the manual token account
    #[account(seeds = [MANUAL_SEED, escrow.mint.as_ref()], bump)]
    pub manual_authority: UncheckedAccount<'info>,

    #[account(address = escrow.mint)]
    pub mint: Box<InterfaceAccount<'info, anchor_spl::token_interface::Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = manual_authority,
        associated_token::token_program = base_token_program,
    )]
    pub manual_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = wallet,
        associated_token::token_program = base_token_program,
    )]
    pub wallet_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

#[derive(Accounts)]
pub struct SetDelayWindow<'info> {
    pub dev: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.dev == dev.key() @ EscrowError::NotDev
    )]
    pub escrow: Box<Account<'info, Escrow>>,
}

/// Anyone may check; the escrow is the only thing written.
#[derive(Accounts)]
pub struct CheckTrigger<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        seeds = [b"bonding-curve", escrow.mint.as_ref()],
        bump,
        seeds::program = pump::ID
    )]
    pub bonding_curve: Box<Account<'info, pump::accounts::BondingCurve>>,
    /// CHECK: pinned to the sysvar, read as raw bytes.
    #[account(address = SLOT_HASHES)]
    pub slot_hashes: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct FireTrigger<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        seeds = [b"bonding-curve", escrow.mint.as_ref()],
        bump,
        seeds::program = pump::ID
    )]
    pub bonding_curve: Box<Account<'info, pump::accounts::BondingCurve>>,
}

#[derive(Accounts)]
#[instruction(index: u32)]
pub struct OpenRound<'info> {
    #[account(mut)]
    pub dev: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.dev == dev.key() @ EscrowError::NotDev
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = dev,
        space = 8 + Round::INIT_SPACE,
        seeds = [ROUND_SEED, escrow.key().as_ref(), &index.to_le_bytes()],
        bump
    )]
    pub round: Box<Account<'info, Round>>,
    pub system_program: Program<'info, System>,
}

/// Anyone may draw; the delay after the commit is what makes it fair.
#[derive(Accounts)]
pub struct Draw<'info> {
    #[account(
        mut,
        seeds = [ROUND_SEED, round.escrow.as_ref(), &round.index.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Box<Account<'info, Round>>,
    /// CHECK: pinned to the sysvar; read as raw bytes because it is too big to
    /// deserialize.
    #[account(address = SLOT_HASHES)]
    pub slot_hashes: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        seeds = [ROUND_SEED, escrow.key().as_ref(), &round.index.to_le_bytes()],
        bump = round.bump,
        constraint = round.escrow == escrow.key() @ EscrowError::HolderMismatch
    )]
    pub round: Box<Account<'info, Round>>,

    #[account(address = escrow.mint)]
    pub mint: Box<InterfaceAccount<'info, anchor_spl::token_interface::Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = base_token_program,
    )]
    pub escrow_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    /// Pinned to the holder's own associated account, so the balance check
    /// cannot be pointed at somebody else's position.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = base_token_program,
    )]
    pub holder_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    /// Priced from the curve, so it is pinned to the pump PDA for this mint.
    #[account(
        seeds = [b"bonding-curve", escrow.mint.as_ref()],
        bump,
        seeds::program = pump::ID
    )]
    pub bonding_curve: Box<Account<'info, pump::accounts::BondingCurve>>,
    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

/// Permissionless buyback./// Permissionless buyback. `payer` only funds the transaction and any account
/// rent; the SOL that is spent comes from the escrow PDA itself.
#[derive(Accounts)]
pub struct Buyback<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Dataless, system-owned PDA that actually signs the pump buy.
    #[account(mut, seeds = [BUYER_SEED, escrow.mint.as_ref()], bump)]
    pub buyer: SystemAccount<'info>,

    #[account(address = escrow.mint)]
    pub mint: Box<InterfaceAccount<'info, anchor_spl::token_interface::Mint>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = base_token_program,
    )]
    pub buyer_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = base_token_program,
    )]
    pub escrow_token_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,

    // ---- pump: same 27 accounts as buy_v2 ----
    /// Read on-chain for the fee rates, so it is pinned to the pump PDA.
    #[account(seeds = [b"global"], bump, seeds::program = pump::ID)]
    pub global: Box<Account<'info, pump::accounts::Global>>,
    /// CHECK: wSOL
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: token program for the quote mint
    pub quote_token_program: UncheckedAccount<'info>,
    /// CHECK: from global config
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_fee_recipient: UncheckedAccount<'info>,
    /// CHECK: from global config
    #[account(mut)]
    pub buyback_fee_recipient: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_buyback_fee_recipient: UncheckedAccount<'info>,
    /// Read on-chain for the reserves the quote is computed from, so it is pinned
    /// to the pump PDA for this exact mint.
    #[account(
        mut,
        seeds = [b"bonding-curve", escrow.mint.as_ref()],
        bump,
        seeds::program = pump::ID
    )]
    pub bonding_curve: Box<Account<'info, pump::accounts::BondingCurve>>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_base_bonding_curve: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_quote_bonding_curve: UncheckedAccount<'info>,
    /// CHECK: ATA of the buyer for the quote mint
    #[account(mut)]
    pub associated_quote_user: UncheckedAccount<'info>,
    /// CHECK: pump PDA seeded by the escrow (our creator)
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_creator_vault: UncheckedAccount<'info>,
    /// CHECK: pump-fees PDA
    pub sharing_config: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    #[account(mut)]
    pub global_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: pump PDA keyed on the buyer
    #[account(mut)]
    pub user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: ATA
    #[account(mut)]
    pub associated_user_volume_accumulator: UncheckedAccount<'info>,
    /// CHECK: pump-fees PDA
    pub fee_config: UncheckedAccount<'info>,
    /// CHECK: pump fees program
    pub fee_program: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = pump::ID)]
    pub pump_program: UncheckedAccount<'info>,

    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}
