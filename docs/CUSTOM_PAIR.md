# Custom pairs (non-SOL quote) — what it would take

Research notes, no code. Source: `docs/pump` (pump-public-docs at
`f216b67`, 2026-09), the pump IDL in `idls/pump.json`, and what our program
does today. Anything the docs do not state is marked **DOĞRULANAMADI**.

## What pump.fun offers

- Since the `*_v2` interface every bonding curve carries a `quote_mint`
  (`Pubkey::default()` for SOL-paired coins). `create_v2` accepts three
  optional remaining accounts — `quote_mint`, `associated_quote_bonding_curve`,
  `quote_token_program` — to create a coin on another quote asset; `buy_v2`,
  `sell_v2`, `buy_exact_quote_in_v2` take the quote mint and its token program
  as normal accounts, and the "quote" side moves through SPL/Token-2022
  token accounts instead of lamports (`COIN_CREATION.md`, `BUY.md`).
- Reserves are named `virtual_quote_reserves` / `real_quote_reserves`; SOL
  coins start at `Global.initial_virtual_sol_reserves`, other quotes at
  `Global.initial_virtual_quote_reserves` (`README.md` "What's New").
- Supported quote mints are gated: `Global.whitelisted_quote_mints` plus a
  `QuoteControl` account with `add_quote_control_mint` /
  `remove_quote_control_mint` (IDL). The docs say USDC is the first
  non-native quote; "custom pair" in the docs means *a quote other than SOL
  or USDC* (tokenised stocks, PUMP, ZEC in the task's wording). Which mints
  are whitelisted on mainnet today: **DOĞRULANAMADI** (read `Global` and the
  `QuoteControl` account on mainnet to find out).
- Fees: SOL- and USDC-paired coins use the standard schedule; a custom-pair
  coin has its own `creator_fee_bps` (`create_v2` arg 7, `BondingCurve.creator_fee_bps`),
  changeable only by pump's CTO team. Protocol/buyback fees for custom pairs:
  **DOĞRULANAMADI** (the fee program has "exotic flat fees" and stable fee
  tiers in the IDL — `set_exotic_flat_fees`, `upsert_stable_fee_tiers` — but
  the docs do not describe them).
- Creator fee collection and sharing work in the quote token: the creator
  vault has an ATA for the quote mint (`associated_creator_vault`),
  `collect_creator_fee_v2` does a token transfer instead of a lamport
  transfer, and `distribute_creator_fees_v2` takes
  `[shareholder_1..N, ata_1..N]` as remaining accounts and can create the
  ATAs (`CREATOR_FEE_SHARING.md`, `COLLECT_CREATOR_FEE.md`).
- Holder-rewards coins and custom pairs coexist in the docs: the flag is
  independent of the quote, and the CTO-team note lists both "change the
  creator fee bps of a coin on a custom pair" and "convert into a holder
  rewards coin" (`HOLDER_REWARDS_README.md`). Whether a custom-pair coin can
  be *created* as holder-rewards, and in which token pump pays its holder
  pool: **DOĞRULANAMADI**.

## What changes in our program

Everything below assumes the quote is an SPL / Token-2022 token, not
lamports. Today the program assumes lamports in five places.

| Area | Today (SOL) | With a custom quote | Work |
|---|---|---|---|
| `launch` — `create_v2` | no quote accounts | pass the 3 optional remaining accounts; `max_sol_cost` becomes `max_quote_cost` in the quote's base units; the dev must hold the quote token and its ATA | small (accounts + arg naming), plus tests |
| `launch` — lock value | `sol_spent` from the dev's lamport delta | quote delta from the dev's quote ATA; the lock cap is in *lamports* — either keep a per-quote cap table in `Config` or convert via a price feed | medium; product decision |
| `launch` — min lock | 1% of supply (token side, unchanged) | unchanged | none |
| `collect_fees` / `setup_fee_sharing` | fee PDA receives lamports, sweeps to escrow with a system transfer; shareholder remaining accounts are wallets | shareholders need quote ATAs (`ata_1..N`); the fee PDA's ATA receives tokens; sweep = token transfer signed by the fee PDA; escrow needs a quote ATA | medium |
| `buyback` | escrow lamports → buyer PDA → `buy_exact_quote_in_v2` in SOL; `BUYBACK_RESERVE_LAMPORTS`, `MIN_BUYBACK_LAMPORTS`, `BUYBACK_MAX_RESERVE_BPS` all in lamports | quote tokens from the escrow's quote ATA; the buyer PDA becomes unnecessary (a token-account authority can be the escrow PDA itself, since token transfers do not need a system-owned signer); thresholds in quote units | large: this is the most SOL-specific instruction |
| `check_trigger` — market cap & volume | `mcap = supply × vq / vt` in lamports; volume = Δ`virtual_quote_reserves` | same formula, in quote units; thresholds are ratios (1% of mcap, 2×) so they still work; the reserves read is unchanged (`Padded<BondingCurve>`) | small |
| `claim_share` — min position | `MIN_POSITION_LAMPORTS` (0.1 SOL) valued at `vq / vt` | value comes out in quote units; a $20 floor needs a per-quote constant or a price feed | small code, product decision |
| Indexer | `MIN_POSITION_LAMPORTS` in SOL; reads `virtualQuoteReserves` | same as above; quote-unit floor | small |
| Crank | `getBalance(creatorVault)` for the sweep threshold, `getBalance(escrow)` for buyback | read the quote ATAs instead; `MIN_COLLECT` in quote units | small |
| Web | "SOL" labels, `fmtSol`, market cap in SOL | quote symbol and decimals from the mint | small |
| pump_fees CPI | `update_fee_shares_v2` with `quote_mint = wSOL`, unused ATAs | pass the real quote mint and initialized ATAs | small |

## Holder-rewards × custom pair

If both are set, our program's job shrinks to the lock and the triggers (no
fee sweep, no buyback), so only the launch, trigger and claim rows above
apply — the cheapest combination to support. If pump pays holder rewards in
the quote token, nothing in our program needs to know.

## Open questions to settle before starting

1. Which quote mints are whitelisted on mainnet, and is the whitelist open
   to third parties or CTO-team only? (`Global.whitelisted_quote_mints`,
   `QuoteControl`; **DOĞRULANAMADI**)
2. Lock cap and dust floor in quote units: fixed table per quote, or a
   price oracle (Pyth) — the same question the $20 floor already has for SOL.
3. Is the buyer PDA still needed? For token quotes, `buy_exact_quote_in_v2`
   debits the user's quote ATA; if pump accepts a PDA as `user` with its ATA
   as `associated_quote_user`, the escrow can sign directly. **DOĞRULANAMADI**
   (docs describe `user` as "transaction signer").
4. Does `distribute_creator_fees_v2` refuse program-owned shareholders for
   token quotes the way it refuses executable recipients for SOL? The fee
   PDA is system-owned and dataless, so likely fine. **DOĞRULANAMADI**.

## Estimate

- Program: ~2 days (buyback rewrite dominates), +1 day tests on localnet
  with a mock quote mint (a Token-2022 mint we create and whitelist —
  requires cloning `QuoteControl` state or a pump admin, **DOĞRULANAMADI**
  whether localnet can whitelist without pump's admin key; if not, tests
  need devnet with a whitelisted quote).
- Indexer + crank + web: ~1 day.
- Product decisions (caps/floors per quote): before any of the above.

Total ≈ 4–5 working days once a whitelisted quote is available to test
against; blocked on pump's whitelist otherwise.
