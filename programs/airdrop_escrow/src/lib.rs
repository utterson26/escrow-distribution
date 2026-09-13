use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::associated_token::spl_associated_token_account;
use anchor_spl::token_interface::{self, TransferChecked};

pub mod constants;
pub mod error;
pub mod pump_state;
pub mod state;

pub use constants::*;
pub use error::*;
pub use state::*;

declare_id!("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
declare_program!(pump);
declare_program!(pump_fees);

#[program]
pub mod airdrop_escrow {
    use super::*;

    /// Set the platform authority. Only the program's upgrade authority may do
    /// this, so a launcher cannot name themselves platform: the platform is the
    /// key that opens rounds, intervenes on stuck tokens and turns the test knobs.
    pub fn set_platform(
        ctx: Context<SetPlatform>,
        platform: Pubkey,
        platform_fee_wallet: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(platform, Pubkey::default(), EscrowError::NotPlatform);
        require_keys_neq!(platform_fee_wallet, Pubkey::default(), EscrowError::NotPlatform);
        let config = &mut ctx.accounts.config;
        let fresh = config.platform == Pubkey::default();
        config.platform = platform;
        config.platform_fee_wallet = platform_fee_wallet;
        config.bump = ctx.bumps.config;
        if fresh {
            config.platform_fee_bps = DEFAULT_PLATFORM_FEE_BPS;
            config.pending_fee_bps = 0;
            config.fee_effective_slot = 0;
            config.fee_delay_slots = PLATFORM_FEE_DELAY_SLOTS;
        }
        Ok(())
    }

    /// Narrow the propose → apply delay. A test knob, like `set_delay_window`:
    /// platform only, floored at MIN_FEE_DELAY_SLOTS, capped at the 7-day
    /// default. Production keeps the default.
    pub fn set_fee_delay(ctx: Context<PlatformFeeChange>, slots: u64) -> Result<()> {
        require!(
            slots >= MIN_FEE_DELAY_SLOTS && slots <= PLATFORM_FEE_DELAY_SLOTS,
            EscrowError::BadFeeDelay
        );
        ctx.accounts.config.fee_delay_slots = slots;
        Ok(())
    }

    /// Propose a new platform fee rate. It goes live only after
    /// `PLATFORM_FEE_DELAY_SLOTS` (7 days), via `apply_platform_fee`, and only
    /// for coins set up after that — a coin's own split is fixed on pump when
    /// `setup_fee_sharing` runs. Platform authority only.
    pub fn propose_platform_fee(ctx: Context<PlatformFeeChange>, new_bps: u16) -> Result<()> {
        require!(new_bps as u64 <= BPS_DENOM, EscrowError::BadFeeBps);
        let config = &mut ctx.accounts.config;
        let now = Clock::get()?.slot;
        config.pending_fee_bps = new_bps;
        let delay = if config.fee_delay_slots == 0 { PLATFORM_FEE_DELAY_SLOTS } else { config.fee_delay_slots };
        config.fee_effective_slot = now.saturating_add(delay);
        emit!(PlatformFeeProposed {
            current_bps: config.platform_fee_bps,
            new_bps,
            proposed_slot: now,
            effective_slot: config.fee_effective_slot,
        });
        Ok(())
    }

    /// Make a proposed platform fee effective once its delay has elapsed.
    /// Permissionless: the delay, not the caller, is the safeguard.
    pub fn apply_platform_fee(ctx: Context<ApplyPlatformFee>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(config.fee_effective_slot > 0, EscrowError::NoPendingFee);
        let now = Clock::get()?.slot;
        require!(now >= config.fee_effective_slot, EscrowError::FeeChangeTooEarly);
        let old = config.platform_fee_bps;
        config.platform_fee_bps = config.pending_fee_bps;
        config.pending_fee_bps = 0;
        config.fee_effective_slot = 0;
        emit!(PlatformFeeApplied { old_bps: old, new_bps: config.platform_fee_bps, slot: now });
        Ok(())
    }

    /// Atomically create a pump coin whose `creator` is this program's fee PDA,
    /// buy `amount` base tokens with the dev's SOL, and lock part of the buy:
    /// `holder_bps` into the escrow token account (the pool the triggers
    /// distribute) and `manual_bps` into the manual-list account (fixed
    /// wallets + percentages, claimed by proof). The two slices are the locked
    /// share — at least one must be set, together at most 100%, and together
    /// at least MIN_LOCK_SUPPLY_BPS of the coin's total supply. A holder-only
    /// coin is `manual_bps = 0`, a manual-only coin `holder_bps = 0`. The
    /// remainder stays with the dev.
    pub fn launch(
        ctx: Context<Launch>,
        name: String,
        symbol: String,
        uri: String,
        amount: u64,
        max_sol_cost: u64,
        manual_root: [u8; 32],
        manual_bps: u16,
        holder_bps: u16,
        is_holder_reward: bool,
    ) -> Result<()> {
        let locked_bps = manual_bps as u64 + holder_bps as u64;
        require!(locked_bps > 0 && locked_bps <= BPS_DENOM, EscrowError::BadLockSplit);
        require!(
            (manual_bps > 0) == (manual_root != [0u8; 32]),
            EscrowError::ManualRootMismatch
        );
        require!(amount > 0, EscrowError::ZeroAmount);
        let escrow_bps = holder_bps;

        let mint_key = ctx.accounts.mint.key();
        let escrow_key = ctx.accounts.escrow.key();
        let fee_key = ctx.accounts.fee_authority.key();

        // ---- 1. create_v2: the coin's creator is our dataless fee PDA -----------
        // (a data-carrying PDA could not pay for pump's sharing config later)
        cpi_create_v2(&ctx.accounts, name, symbol, uri, fee_key, is_holder_reward)?;

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

        // ---- 4. split: holder_bps of the buy goes to the escrow ATA -----------
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

        // ---- 5. manual_bps of the buy goes to the manual-list account ----------
        let manual_total = if manual_bps > 0 {
            let t = (amount as u128)
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

        // ---- 6. the lock must be at least MIN_LOCK_SUPPLY_BPS of total supply --
        // (read off the bonding curve pump just wrote: token_total_supply sits
        // after the discriminator and four u64 reserves)
        let supply = {
            let data = ctx.accounts.bonding_curve.try_borrow_data()?;
            require!(data.len() >= 48, EscrowError::EmptyCurve);
            u64::from_le_bytes(data[40..48].try_into().unwrap())
        };
        let min_lock = (supply as u128)
            .checked_mul(MIN_LOCK_SUPPLY_BPS as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;
        let locked = (escrow_cut as u128).saturating_add(manual_total as u128);
        require!(locked >= min_lock, EscrowError::LockTooSmall);

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
        // not the launcher's to choose
        escrow.platform = ctx.accounts.config.platform;
        escrow.day_start_ts = 0;
        escrow.day_start_volume = 0;
        escrow.low_volume_days = 0;
        escrow.dead = false;
        escrow.day_seconds = DEFAULT_DAY_SECONDS;
        escrow.last_buyback_slot = 0;
        escrow.is_holder_reward = is_holder_reward;
        escrow.fee_sharing_set = false;
        escrow.platform_fee_bps = 0;
        escrow.bump = ctx.bumps.escrow;

        emit!(Launched {
            escrow: escrow_key,
            mint: mint_key,
            dev: escrow.dev,
            bought: amount,
            escrowed: escrow_cut,
            manual: manual_total,
        });
        Ok(())
    }

    /// Split this coin's creator fee on pump between the escrow and the
    /// platform: opens pump's fee-sharing config for the mint and fixes the
    /// shareholders to (fee PDA, 10000 − platform bps) and (platform wallet,
    /// platform bps). The fee PDA signs and pays; `payer` fronts its rent.
    /// One-shot per coin (pump revokes the admin after the update). Not for
    /// holder-rewards coins, whose creator fee never reaches us.
    pub fn setup_fee_sharing(ctx: Context<SetupFeeSharing>) -> Result<()> {
        require!(!ctx.accounts.escrow.is_holder_reward, EscrowError::NotApplicable);
        require!(!ctx.accounts.escrow.fee_sharing_set, EscrowError::FeeSharingAlreadySetUp);
        let bps = ctx.accounts.config.platform_fee_bps;
        require!(bps as u64 <= BPS_DENOM, EscrowError::BadFeeBps);
        require_keys_eq!(
            ctx.accounts.platform_fee_wallet.key(),
            ctx.accounts.config.platform_fee_wallet,
            EscrowError::NotPlatform
        );

        // rent for the 1024-byte sharing config, paid by the fee PDA
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.fee_authority.to_account_info(),
                },
            ),
            FEE_SHARING_RENT_LAMPORTS,
        )?;

        let mint_key = ctx.accounts.escrow.mint;
        let fee_bump = ctx.bumps.fee_authority;
        let fee_seeds: &[&[u8]] = &[FEE_SEED, mint_key.as_ref(), &[fee_bump]];
        cpi_create_fee_sharing_config(&ctx.accounts, fee_seeds)?;
        // what the rent did not use goes back to the payer at the end; anything
        // the update pays out on top (fees already in the vault) is the escrow's
        let rent_left = ctx.accounts.fee_authority.lamports();

        let mut shareholders = vec![pump_fees::types::Shareholder {
            address: ctx.accounts.fee_authority.key(),
            share_bps: (BPS_DENOM as u16) - bps,
        }];
        if bps > 0 {
            shareholders.push(pump_fees::types::Shareholder {
                address: ctx.accounts.platform_fee_wallet.key(),
                share_bps: bps,
            });
        }
        cpi_update_fee_shares(&ctx.accounts, fee_seeds, shareholders)?;

        let now = ctx.accounts.fee_authority.lamports();
        let fees_part = now.saturating_sub(rent_left);
        for (to, amount) in [
            (ctx.accounts.escrow.to_account_info(), fees_part),
            (ctx.accounts.payer.to_account_info(), rent_left.min(now)),
        ] {
            if amount == 0 {
                continue;
            }
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.key(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.fee_authority.to_account_info(),
                        to,
                    },
                    &[fee_seeds],
                ),
                amount,
            )?;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.fees_collected = escrow
            .fees_collected
            .checked_add(fees_part)
            .ok_or(EscrowError::Overflow)?;
        escrow.fee_sharing_set = true;
        escrow.platform_fee_bps = bps;
        emit!(FeeSharingSet {
            escrow: escrow.key(),
            sharing_config: ctx.accounts.sharing_config.key(),
            platform_fee_bps: bps,
            platform_fee_wallet: ctx.accounts.platform_fee_wallet.key(),
        });
        Ok(())
    }

    /// Pay out the pump creator vault: pump splits it between the fee PDA and
    /// the platform wallet per the sharing config, then the fee PDA's share is
    /// swept into the escrow. Permissionless. Remaining accounts: exactly the
    /// shareholders, in order — [fee PDA, platform wallet] (pump checks them).
    pub fn collect_fees<'info>(ctx: Context<'info, CollectFees<'info>>) -> Result<()> {
        require!(!ctx.accounts.escrow.is_holder_reward, EscrowError::NotApplicable);
        require!(ctx.accounts.escrow.fee_sharing_set, EscrowError::FeeSharingNotSetUp);
        let before = ctx.accounts.escrow.to_account_info().lamports();

        let mut cpi = CpiContext::new(
            pump::ID,
            pump::cpi::accounts::DistributeCreatorFeesV2 {
                payer: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                bonding_curve: ctx.accounts.bonding_curve.to_account_info(),
                sharing_config: ctx.accounts.sharing_config.to_account_info(),
                creator_vault: ctx.accounts.creator_vault.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                event_authority: ctx.accounts.event_authority.to_account_info(),
                program: ctx.accounts.pump_program.to_account_info(),
                creator_vault_quote_token_account: ctx
                    .accounts
                    .creator_vault_quote_token_account
                    .to_account_info(),
                quote_mint: ctx.accounts.quote_mint.to_account_info(),
                quote_token_program: ctx.accounts.quote_token_program.to_account_info(),
                associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            },
        );
        cpi = cpi.with_remaining_accounts(ctx.remaining_accounts.to_vec());
        pump::cpi::distribute_creator_fees_v2(cpi, false)?;

        // the fee PDA's share → escrow (dataless system account; keep nothing)
        let mint_key = ctx.accounts.escrow.mint;
        let fee_bump = ctx.bumps.fee_authority;
        let fee_seeds: &[&[u8]] = &[FEE_SEED, mint_key.as_ref(), &[fee_bump]];
        let sweep = ctx.accounts.fee_authority.lamports();
        if sweep > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.key(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.fee_authority.to_account_info(),
                        to: ctx.accounts.escrow.to_account_info(),
                    },
                    &[fee_seeds],
                ),
                sweep,
            )?;
        }

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
    /// coin flag trip in seconds instead of a week. Platform-only: in the dev's
    /// hands it would let them flag their own coin dead in seconds and ask for
    /// the pool back.
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
    /// production should stay at `DEFAULT_MAX_DELAY_SLOTS`. Platform-only.
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
        require!(curve.virtual_token_reserves > 0, EscrowError::EmptyCurve);
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
            require!(curve.virtual_token_reserves > 0, EscrowError::EmptyCurve);
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

    /// Commit a distribution round: the Merkle root over the pro-rata
    /// allocation of `released` tokens across the holder snapshot taken at
    /// `snapshot_slot`. `total` is the sum of the leaf amounts — at most
    /// `released`, less when the per-wallet cap leaves a remainder, which then
    /// goes back to the pool. Both slot and `released` are recorded so anyone
    /// can rebuild the exact allocation and check the root.
    pub fn open_round(
        ctx: Context<OpenRound>,
        index: u32,
        root: [u8; 32],
        released: u64,
        total: u64,
        holder_count: u32,
        snapshot_slot: u64,
    ) -> Result<()> {
        let now_slot = Clock::get()?.slot;
        require!(snapshot_slot <= now_slot, EscrowError::SnapshotInFuture);
        require!(holder_count > 0, EscrowError::NoHolders);
        require!(total > 0, EscrowError::ZeroAmount);
        require!(total <= released, EscrowError::TotalOverReleased);
        require!(root != [0u8; 32], EscrowError::EmptyRoot);

        // The amount is not the publisher's to choose: it is at most what
        // fired triggers released and have not yet been handed out. `released`
        // is bounded too, because the per-wallet cap is measured against it.
        require!(
            released <= ctx.accounts.escrow.pending,
            EscrowError::AmountNotAuthorized
        );
        let free = ctx
            .accounts
            .escrow
            .escrowed
            .checked_sub(ctx.accounts.escrow.allocated)
            .ok_or(EscrowError::Overflow)?;
        require!(free >= total, EscrowError::NothingToClaim);

        let round = &mut ctx.accounts.round;
        round.escrow = ctx.accounts.escrow.key();
        round.index = index;
        round.root = root;
        round.released = released;
        round.total = total;
        round.holder_count = holder_count;
        round.claimed_amount = 0;
        round.claimed_count = 0;
        round.commit_slot = now_slot;
        round.snapshot_slot = snapshot_slot;
        round.bump = ctx.bumps.round;

        let escrow = &mut ctx.accounts.escrow;
        escrow.allocated = escrow
            .allocated
            .checked_add(total)
            .ok_or(EscrowError::Overflow)?;
        // Whatever the round did not hand out (cap remainder, rounding) is not
        // carried: it simply stays in the pool, un-allocated, for a later
        // trigger. Nothing leaks out of the escrow.
        escrow.pending = 0;

        emit!(RoundOpened {
            escrow: round.escrow,
            index,
            root,
            released,
            total,
            holder_count,
            commit_slot: round.commit_slot,
            snapshot_slot,
        });
        Ok(())
    }

    /// Claim this holder's share of a round. The caller proves their
    /// allocation leaf is in the committed tree; the program then checks, on
    /// its own, that the amount respects the per-wallet cap and that they still
    /// hold a large enough position right now. One claim per holder per round,
    /// enforced by the receipt account's `init`.
    pub fn claim_share(
        ctx: Context<ClaimShare>,
        leaf_index: u32,
        balance: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let round = &ctx.accounts.round;
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(leaf_index < round.holder_count, EscrowError::BadProof);

        // The leaf binds holder, snapshot balance and amount together.
        let holder = ctx.accounts.holder.key();
        let mut node = hashv(&[
            b"leaf",
            &leaf_index.to_le_bytes(),
            holder.as_ref(),
            &balance.to_le_bytes(),
            &amount.to_le_bytes(),
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

        // The cap is a program rule, not an allocator convention: a root that
        // hands one wallet more than MAX_SHARE_BPS of the release cannot pay out.
        // ...once there are enough holders for a cap to mean anything.
        if round.holder_count >= CAP_MIN_HOLDERS {
            let cap = (round.released as u128)
                .checked_mul(MAX_SHARE_BPS as u128)
                .ok_or(EscrowError::Overflow)?
                / BPS_DENOM as u128;
            require!(amount as u128 <= cap, EscrowError::ShareOverCap);
        }
        require!(
            round
                .claimed_amount
                .checked_add(amount)
                .ok_or(EscrowError::Overflow)?
                <= round.total,
            EscrowError::RoundExhausted
        );

        // Independent of the snapshot: is this holder still in, right now, and
        // big enough? The publisher cannot fake either of these.
        let held_now = ctx.accounts.holder_token_account.amount;
        require!(held_now > 0, EscrowError::PositionTooSmall);
        // ...and did they keep what the snapshot credited them for? Weight is
        // balance × time, so a position sold right after the snapshot would
        // otherwise still collect.
        let must_hold = (balance as u128)
            .checked_mul(CLAIM_HOLD_BPS as u128)
            .ok_or(EscrowError::Overflow)?
            / BPS_DENOM as u128;
        require!(held_now as u128 >= must_hold, EscrowError::HoldingBelowSnapshot);
        let curve = &ctx.accounts.bonding_curve;
        require!(curve.virtual_token_reserves > 0, EscrowError::EmptyCurve);
        let value = (held_now as u128)
            .checked_mul(curve.virtual_quote_reserves as u128)
            .ok_or(EscrowError::Overflow)?
            / (curve.virtual_token_reserves as u128);
        require!(
            value >= MIN_POSITION_LAMPORTS as u128,
            EscrowError::PositionTooSmall
        );

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
            amount,
            ctx.accounts.mint.decimals,
        )?;

        ctx.accounts.receipt.bump = ctx.bumps.receipt;
        let round = &mut ctx.accounts.round;
        round.claimed_amount = round.claimed_amount.saturating_add(amount);
        round.claimed_count = round.claimed_count.saturating_add(1);
        let escrow = &mut ctx.accounts.escrow;
        escrow.claimed = escrow.claimed.checked_add(amount).ok_or(EscrowError::Overflow)?;

        emit!(ShareClaimed {
            escrow: escrow.key(),
            round: ctx.accounts.round.key(),
            holder,
            amount,
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
        require!(!ctx.accounts.escrow.is_holder_reward, EscrowError::NotApplicable);
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
        // left over stays put and is picked up by the next call — the *next slot's*
        // call: stacking buybacks in one transaction would defeat the cap.
        let slot = Clock::get()?.slot;
        require!(
            slot > ctx.accounts.escrow.last_buyback_slot,
            EscrowError::BuybackSameSlot
        );
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
        escrow.last_buyback_slot = slot;
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


/// Own frame: pump_fees' account structs are wide.
#[inline(never)]
fn cpi_create_fee_sharing_config(a: &SetupFeeSharing, fee_seeds: &[&[u8]]) -> Result<()> {
    pump_fees::cpi::create_fee_sharing_config(CpiContext::new_with_signer(
        pump_fees::ID,
        pump_fees::cpi::accounts::CreateFeeSharingConfig {
            event_authority: a.fee_event_authority.to_account_info(),
            program: a.fee_program.to_account_info(),
            payer: a.fee_authority.to_account_info(),
            global: a.global.to_account_info(),
            mint: a.mint.to_account_info(),
            sharing_config: a.sharing_config.to_account_info(),
            system_program: a.system_program.to_account_info(),
            bonding_curve: a.bonding_curve.to_account_info(),
            pump_program: a.pump_program.to_account_info(),
            pump_event_authority: a.pump_event_authority.to_account_info(),
            pool: None,
            pump_amm_program: None,
            pump_amm_event_authority: None,
        },
        &[fee_seeds],
    ))
}

#[inline(never)]
fn cpi_update_fee_shares(
    a: &SetupFeeSharing,
    fee_seeds: &[&[u8]],
    shareholders: Vec<pump_fees::types::Shareholder>,
) -> Result<()> {
    // pump first pays out whatever the vault holds to the *current*
    // shareholders — just the creator at this point — so it wants them as
    // remaining accounts
    pump_fees::cpi::update_fee_shares_v2(
        CpiContext::new_with_signer(
            pump_fees::ID,
            pump_fees::cpi::accounts::UpdateFeeSharesV2 {
                event_authority: a.fee_event_authority.to_account_info(),
                program: a.fee_program.to_account_info(),
                authority: a.fee_authority.to_account_info(),
                global: a.global.to_account_info(),
                mint: a.mint.to_account_info(),
                sharing_config: a.sharing_config.to_account_info(),
                bonding_curve: a.bonding_curve.to_account_info(),
                pump_creator_vault: a.pump_creator_vault.to_account_info(),
                pump_creator_vault_ata: a.pump_creator_vault_ata.to_account_info(),
                system_program: a.system_program.to_account_info(),
                pump_program: a.pump_program.to_account_info(),
                pump_event_authority: a.pump_event_authority.to_account_info(),
                pump_amm_program: a.pump_amm_program.to_account_info(),
                amm_event_authority: a.amm_event_authority.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                token_program: a.quote_token_program.to_account_info(),
                associated_token_program: a.associated_token_program.to_account_info(),
                coin_creator_vault_authority: a.coin_creator_vault_authority.to_account_info(),
                coin_creator_vault_ata: a.coin_creator_vault_ata.to_account_info(),
            },
            &[fee_seeds],
        )
        .with_remaining_accounts(vec![a.fee_authority.to_account_info()]),
        shareholders,
    )
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
    is_holder_reward: bool,
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
            false,                          // is_mayhem_mode
            pump::types::OptionBool(false), // is_cashback_enabled: deprecated, must stay off
            pump::types::OptionU64(0),      // creator_fee_bps: 0 = standard schedule (SOL pair)
            pump::types::OptionBool(is_holder_reward), // true: pump pays the creator fee to its holder pool, not to us
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
    /// tokens locked for the manual list (0 on a holder-only coin)
    pub manual: u64,
}
#[event]
pub struct FeeSharingSet {
    pub escrow: Pubkey,
    pub sharing_config: Pubkey,
    pub platform_fee_bps: u16,
    pub platform_fee_wallet: Pubkey,
}
#[event]
pub struct PlatformFeeProposed {
    pub current_bps: u16,
    pub new_bps: u16,
    pub proposed_slot: u64,
    pub effective_slot: u64,
}
#[event]
pub struct PlatformFeeApplied {
    pub old_bps: u16,
    pub new_bps: u16,
    pub slot: u64,
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
    pub released: u64,
    pub total: u64,
    pub holder_count: u32,
    pub commit_slot: u64,
    pub snapshot_slot: u64,
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
pub struct ShareClaimed {
    pub escrow: Pubkey,
    pub round: Pubkey,
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
    /// Program-wide platform authority, copied onto the escrow.
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
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
    /// The coin's creator on pump. Dataless and system-owned so it can later
    /// pay for and sign the fee-sharing config.
    /// CHECK: PDA, seeds checked here
    #[account(seeds = [FEE_SEED, mint.key().as_ref()], bump)]
    pub fee_authority: UncheckedAccount<'info>,

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
    /// CHECK: PDA, seeds checked; receives the escrow's share, swept in-handler
    #[account(mut, seeds = [FEE_SEED, escrow.mint.as_ref()], bump)]
    pub fee_authority: UncheckedAccount<'info>,
    /// CHECK: the coin mint
    #[account(address = escrow.mint)]
    pub mint: UncheckedAccount<'info>,
    /// CHECK: pump PDA, validated by pump
    pub bonding_curve: UncheckedAccount<'info>,
    /// CHECK: pump fees PDA ["sharing-config", mint], validated by pump
    pub sharing_config: UncheckedAccount<'info>,
    /// CHECK: pump PDA ["creator-vault", sharing_config]
    #[account(mut)]
    pub creator_vault: UncheckedAccount<'info>,
    /// CHECK: ATA of the creator vault (unused for SOL)
    #[account(mut)]
    pub creator_vault_quote_token_account: UncheckedAccount<'info>,
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

/// Anyone may set a coin up; the fee PDA does the signing.
#[derive(Accounts)]
pub struct SetupFeeSharing<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: PDA, seeds checked; signs and pays for the sharing config
    #[account(mut, seeds = [FEE_SEED, escrow.mint.as_ref()], bump)]
    pub fee_authority: UncheckedAccount<'info>,
    /// CHECK: must equal config.platform_fee_wallet (checked in-handler)
    pub platform_fee_wallet: UncheckedAccount<'info>,
    /// CHECK: the coin mint
    #[account(address = escrow.mint)]
    pub mint: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub global: UncheckedAccount<'info>,
    /// CHECK: pump PDA; its creator field is migrated to the sharing config
    #[account(mut)]
    pub bonding_curve: UncheckedAccount<'info>,
    /// CHECK: pump fees PDA ["sharing-config", mint], created by the CPI
    #[account(mut)]
    pub sharing_config: UncheckedAccount<'info>,
    /// CHECK: pump PDA ["creator-vault", sharing_config]
    #[account(mut)]
    pub pump_creator_vault: UncheckedAccount<'info>,
    /// CHECK: ATA of that vault (unused for SOL)
    #[account(mut)]
    pub pump_creator_vault_ata: UncheckedAccount<'info>,
    /// CHECK: pump AMM PDA ["creator_vault", sharing_config] (unused pre-graduation)
    #[account(mut)]
    pub coin_creator_vault_authority: UncheckedAccount<'info>,
    /// CHECK: ATA of that authority (unused for SOL)
    #[account(mut)]
    pub coin_creator_vault_ata: UncheckedAccount<'info>,
    /// CHECK: wSOL
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: token program for the quote mint
    pub quote_token_program: UncheckedAccount<'info>,
    /// CHECK: ATA program
    pub associated_token_program: UncheckedAccount<'info>,
    /// CHECK: pump PDA
    pub pump_event_authority: UncheckedAccount<'info>,
    /// CHECK: pump program
    #[account(address = pump::ID)]
    pub pump_program: UncheckedAccount<'info>,
    /// CHECK: pump fees PDA
    pub fee_event_authority: UncheckedAccount<'info>,
    /// CHECK: pump fees program
    #[account(address = pump_fees::ID)]
    pub fee_program: UncheckedAccount<'info>,
    /// CHECK: pump AMM program (only consulted for graduated coins)
    pub pump_amm_program: UncheckedAccount<'info>,
    /// CHECK: pump AMM PDA
    pub amm_event_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Platform authority proposes; anyone may apply once the delay has passed.
#[derive(Accounts)]
pub struct PlatformFeeChange<'info> {
    pub platform: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.platform == platform.key() @ EscrowError::NotPlatform
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct ApplyPlatformFee<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
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

/// Test knobs. Signed by the platform, never the dev.
#[derive(Accounts)]
pub struct SetDelayWindow<'info> {
    pub platform: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.platform == platform.key() @ EscrowError::NotPlatform
    )]
    pub escrow: Box<Account<'info, Escrow>>,
}

#[derive(Accounts)]
pub struct SetPlatform<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// This program; its ProgramData account names the upgrade authority.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::AirdropEscrow>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ EscrowError::NotUpgradeAuthority
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
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
    pub bonding_curve: Box<Account<'info, pump_state::BondingCurve>>,
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
    pub bonding_curve: Box<Account<'info, pump_state::BondingCurve>>,
}

/// The root may be published by the dev or by the platform authority: the
/// platform runs the crank that snapshots and opens rounds, so launches do not
/// depend on the dev staying online. Neither can choose the amount (it is what
/// a trigger released) nor who gets what: the allocation is a pure function of
/// chain history and `released`, and every leaf is capped by the program.
#[derive(Accounts)]
#[instruction(index: u32)]
pub struct OpenRound<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.dev == publisher.key() || escrow.platform == publisher.key()
            @ EscrowError::NotPublisher
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = publisher,
        space = 8 + Round::INIT_SPACE,
        seeds = [ROUND_SEED, escrow.key().as_ref(), &index.to_le_bytes()],
        bump
    )]
    pub round: Box<Account<'info, Round>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimShare<'info> {
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
    /// One per (round, holder): a second claim fails here, on `init`.
    #[account(
        init,
        payer = holder,
        space = 8 + ClaimReceipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, round.key().as_ref(), holder.key().as_ref()],
        bump
    )]
    pub receipt: Account<'info, ClaimReceipt>,

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
    pub bonding_curve: Box<Account<'info, pump_state::BondingCurve>>,
    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
    pub system_program: Program<'info, System>,
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
    pub global: Box<Account<'info, pump_state::Global>>,
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
    pub bonding_curve: Box<Account<'info, pump_state::BondingCurve>>,
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
