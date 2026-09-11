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
    ) -> Result<()> {
        require!(escrow_bps as u64 <= BPS_DENOM, EscrowError::InvalidBps);
        require!(amount > 0, EscrowError::ZeroAmount);

        let mint_key = ctx.accounts.mint.key();
        let escrow_key = ctx.accounts.escrow.key();

        // ---- 1. create_v2: the coin's creator is our escrow PDA -----------------
        pump::cpi::create_v2(
            CpiContext::new(
                pump::ID,
                pump::cpi::accounts::CreateV2 {
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.mint_authority.to_account_info(),
                    bonding_curve: ctx.accounts.bonding_curve.to_account_info(),
                    associated_bonding_curve: ctx
                        .accounts
                        .associated_base_bonding_curve
                        .to_account_info(),
                    global: ctx.accounts.global.to_account_info(),
                    user: ctx.accounts.dev.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.base_token_program.to_account_info(),
                    associated_token_program: ctx
                        .accounts
                        .associated_token_program
                        .to_account_info(),
                    mayhem_program_id: ctx.accounts.mayhem_program.to_account_info(),
                    global_params: ctx.accounts.global_params.to_account_info(),
                    sol_vault: ctx.accounts.sol_vault.to_account_info(),
                    mayhem_state: ctx.accounts.mayhem_state.to_account_info(),
                    mayhem_token_vault: ctx.accounts.mayhem_token_vault.to_account_info(),
                    event_authority: ctx.accounts.event_authority.to_account_info(),
                    program: ctx.accounts.pump_program.to_account_info(),
                },
            ),
            name,
            symbol,
            uri,
            escrow_key,            // creator = escrow PDA
            false,                 // is_mayhem_mode
            pump::types::OptionBool(false), // is_cashback_enabled = off
        )?;

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
        pump::cpi::buy_v2(
            CpiContext::new(
                pump::ID,
                pump::cpi::accounts::BuyV2 {
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
                    user: ctx.accounts.dev.to_account_info(),
                    associated_base_user: ctx.accounts.associated_base_user.to_account_info(),
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
            ),
            amount,
            max_sol_cost,
        )?;

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

    /// Write weighted allocations for a batch of holders.
    /// weight = balance * held_secs, jittered by a hash of (escrow, holder, slot).
    /// The jitter is a placeholder for a VRF.
    pub fn distribute<'info>(
        ctx: Context<'info, Distribute<'info>>,
        weights: Vec<HolderWeight>,
    ) -> Result<()> {
        let n = weights.len();
        require!(n > 0 && n <= MAX_HOLDERS_PER_CALL, EscrowError::BadHolderCount);
        // remaining_accounts = [allocation PDA, holder pubkey] per holder
        require!(
            ctx.remaining_accounts.len() == n * 2,
            EscrowError::HolderAccountMismatch
        );

        let escrow_key = ctx.accounts.escrow.key();
        let slot = Clock::get()?.slot;

        // ---- pass 0: which holders have not been allocated yet? ---------------
        // A holder already carrying `distributed` is skipped everywhere below —
        // including the weight denominator — so re-sending a batch is a no-op and
        // a partially-new batch still splits the whole remaining pool.
        let mut fresh: Vec<usize> = Vec::with_capacity(n);
        for i in 0..n {
            let alloc_ai = &ctx.remaining_accounts[i * 2];
            let holder = ctx.remaining_accounts[i * 2 + 1].key();
            let (expected, _) = Pubkey::find_program_address(
                &[ALLOC_SEED, escrow_key.as_ref(), holder.as_ref()],
                ctx.program_id,
            );
            require_keys_eq!(*alloc_ai.key, expected, EscrowError::HolderAccountMismatch);

            let already = if alloc_ai.data_is_empty() {
                false
            } else {
                let data = alloc_ai.try_borrow_data()?;
                if data.len() < 8 || data[..8] == [0u8; 8] {
                    false
                } else {
                    Allocation::try_deserialize(&mut &data[..])?.distributed
                }
            };
            if !already {
                fresh.push(i);
            }
        }

        // Every holder in this batch already has a share: nothing to do.
        if fresh.is_empty() {
            emit!(Distributed {
                escrow: escrow_key,
                holders: 0,
                skipped: n as u32,
                amount: 0,
            });
            return Ok(());
        }

        let pool = ctx
            .accounts
            .escrow
            .escrowed
            .checked_sub(ctx.accounts.escrow.allocated)
            .ok_or(EscrowError::Overflow)?;
        require!(pool > 0, EscrowError::NothingToClaim);

        // ---- pass 1: jittered weights, fresh holders only ---------------------
        let mut jittered: Vec<u128> = Vec::with_capacity(fresh.len());
        let mut total: u128 = 0;
        for &i in &fresh {
            let w = &weights[i];
            let holder = ctx.remaining_accounts[i * 2 + 1].key();
            let base = (w.balance as u128)
                .checked_mul(w.held_secs as u128)
                .ok_or(EscrowError::Overflow)?;
            // hash -> [1.0, 2.0) multiplier in fixed point over u32::MAX
            let h = hashv(&[escrow_key.as_ref(), holder.as_ref(), &slot.to_le_bytes()]);
            let r = u32::from_le_bytes(h.to_bytes()[0..4].try_into().unwrap()) as u128;
            let jw = base
                .checked_mul(u32::MAX as u128 + r)
                .ok_or(EscrowError::Overflow)?
                / (u32::MAX as u128);
            jittered.push(jw);
            total = total.checked_add(jw).ok_or(EscrowError::Overflow)?;
        }
        require!(total > 0, EscrowError::ZeroWeight);

        // ---- pass 2: create + write the allocation PDAs ------------------------
        let mut written: u64 = 0;
        for (k, &i) in fresh.iter().enumerate() {
            let alloc_ai = &ctx.remaining_accounts[i * 2];
            let holder = ctx.remaining_accounts[i * 2 + 1].key();
            let jw = jittered[k];

            let share = ((pool as u128)
                .checked_mul(jw)
                .ok_or(EscrowError::Overflow)?
                / total) as u64;

            let (_, bump) = Pubkey::find_program_address(
                &[ALLOC_SEED, escrow_key.as_ref(), holder.as_ref()],
                ctx.program_id,
            );

            let space = 8 + Allocation::INIT_SPACE;
            if alloc_ai.data_is_empty() {
                let rent = Rent::get()?.minimum_balance(space);
                let signer_seeds: &[&[u8]] =
                    &[ALLOC_SEED, escrow_key.as_ref(), holder.as_ref(), &[bump]];
                anchor_lang::system_program::create_account(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.key(),
                        anchor_lang::system_program::CreateAccount {
                            from: ctx.accounts.dev.to_account_info(),
                            to: alloc_ai.clone(),
                        },
                        &[signer_seeds],
                    ),
                    rent,
                    space as u64,
                    ctx.program_id,
                )?;
            }

            let alloc = Allocation {
                escrow: escrow_key,
                holder,
                amount: share,
                weight: jw,
                distributed: true,
                claimed: false,
                bump,
            };
            let mut data = alloc_ai.try_borrow_mut_data()?;
            let mut cursor = &mut data[..];
            alloc.try_serialize(&mut cursor)?;

            written = written.checked_add(share).ok_or(EscrowError::Overflow)?;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.allocated = escrow
            .allocated
            .checked_add(written)
            .ok_or(EscrowError::Overflow)?;
        escrow.holder_count = escrow
            .holder_count
            .checked_add(fresh.len() as u32)
            .ok_or(EscrowError::Overflow)?;

        emit!(Distributed {
            escrow: escrow_key,
            holders: fresh.len() as u32,
            skipped: (n - fresh.len()) as u32,
            amount: written,
        });
        Ok(())
    }


    /// Permissionless: turn the escrow's accumulated SOL (creator fees swept by
    /// `collect_fees`, or anything else sent to the PDA) into more of the coin,
    /// deposited straight into the escrow token account.
    ///
    /// A no-op below `MIN_BUYBACK_LAMPORTS` — it returns `Ok(())` rather than
    /// erroring so a keeper can call it on a schedule without handling failures.
    pub fn buyback(ctx: Context<Buyback>, min_tokens_out: u64) -> Result<()> {
        let escrow_ai = ctx.accounts.escrow.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(escrow_ai.data_len());
        // The escrow must stay rent-exempt; only what sits above that is spendable.
        let from_escrow = escrow_ai.lamports().saturating_sub(rent_min);
        let in_buyer = ctx.accounts.buyer.lamports();
        let quote_in = from_escrow
            .saturating_add(in_buyer)
            .saturating_sub(BUYBACK_RESERVE_LAMPORTS);

        if quote_in < MIN_BUYBACK_LAMPORTS {
            emit!(BuybackSkipped {
                escrow: ctx.accounts.escrow.key(),
                spendable: quote_in,
                threshold: MIN_BUYBACK_LAMPORTS,
            });
            return Ok(());
        }

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
            from_escrow,
        )?;

        let mint_key = ctx.accounts.escrow.mint;
        let buyer_bump = ctx.bumps.buyer;
        let buyer_seeds: &[&[u8]] = &[BUYER_SEED, mint_key.as_ref(), &[buyer_bump]];

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
        **escrow_ai.try_borrow_mut_lamports()? -= from_escrow;
        **ctx.accounts.payer.try_borrow_mut_lamports()? += from_escrow;

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
        });
        Ok(())
    }

    /// Holder pulls their allocation out of the escrow token account.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let alloc = &mut ctx.accounts.allocation;
        require!(!alloc.claimed, EscrowError::AlreadyClaimed);
        require!(alloc.amount > 0, EscrowError::NothingToClaim);
        let amount = alloc.amount;

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

        alloc.claimed = true;
        let escrow = &mut ctx.accounts.escrow;
        escrow.claimed = escrow.claimed.checked_add(amount).ok_or(EscrowError::Overflow)?;

        emit!(Claimed {
            escrow: escrow.key(),
            holder: ctx.accounts.holder.key(),
            amount,
        });
        Ok(())
    }
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
pub struct Distributed {
    pub escrow: Pubkey,
    /// Holders newly allocated by this call.
    pub holders: u32,
    /// Holders skipped because they already carried `distributed`.
    pub skipped: u32,
    pub amount: u64,
}
#[event]
pub struct BuybackDone {
    pub escrow: Pubkey,
    pub lamports_spent: u64,
    pub tokens_bought: u64,
}
#[event]
pub struct BuybackSkipped {
    pub escrow: Pubkey,
    pub spendable: u64,
    pub threshold: u64,
}
#[event]
pub struct Claimed {
    pub escrow: Pubkey,
    pub holder: Pubkey,
    pub amount: u64,
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
    pub escrow: Account<'info, Escrow>,
    /// Escrow's ATA for the coin; opened in-handler once the mint exists.
    /// CHECK: address checked by the ATA program
    #[account(mut)]
    pub escrow_token_account: UncheckedAccount<'info>,

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
    pub escrow: Account<'info, Escrow>,

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
pub struct Distribute<'info> {
    #[account(mut)]
    pub dev: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump,
        constraint = escrow.dev == dev.key() @ EscrowError::NotDev
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: [allocation_pda, holder] * n
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.mint.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [ALLOC_SEED, escrow.key().as_ref(), holder.key().as_ref()],
        bump = allocation.bump,
        constraint = allocation.holder == holder.key() @ EscrowError::HolderAccountMismatch
    )]
    pub allocation: Account<'info, Allocation>,

    #[account(address = escrow.mint)]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    #[account(mut)]
    pub escrow_token_account:
        InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    #[account(mut)]
    pub holder_token_account:
        InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    pub base_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

/// Permissionless buyback. `payer` only funds the transaction and any account
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
    pub escrow: Account<'info, Escrow>,

    /// Dataless, system-owned PDA that actually signs the pump buy.
    #[account(mut, seeds = [BUYER_SEED, escrow.mint.as_ref()], bump)]
    pub buyer: SystemAccount<'info>,

    #[account(address = escrow.mint)]
    pub mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = base_token_program,
    )]
    pub buyer_token_account:
        InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = base_token_program,
    )]
    pub escrow_token_account:
        InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    // ---- pump: same 27 accounts as buy_v2 ----
    /// CHECK: pump PDA
    #[account(mut)]
    pub global: UncheckedAccount<'info>,
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
    /// CHECK: pump PDA
    #[account(mut)]
    pub bonding_curve: UncheckedAccount<'info>,
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
