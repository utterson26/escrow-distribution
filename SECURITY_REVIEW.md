# Security self-review — airdrop_escrow

Date: 2026-09-12. Scope: `programs/airdrop_escrow/src/*` at commit after
"crank uçtan uca" (every instruction, every `Accounts` struct), plus the trust
boundaries with the indexer, crank and web. Method: read the program top to
bottom looking for overflow, wrong PDA seeds, missing signer/owner checks,
re-entrancy, and authority leaks; then write a failing test for each finding
and fix it. Tests: `tests/security.ts` (F1–F4, 4/4 on localnet), plus the
existing suites re-run after the changes (`tests/manual_airdrop.ts` 7/7).

This is a self-review by the author of the code, not an independent audit.

## Findings fixed

### F1 — HIGH: the launcher chose the "platform authority"
`launch` took `platform: Pubkey` as an argument and stored it on the escrow.
The platform is the key that may `intervene` (move unclaimed manual shares
after 30 days, move the pool of a dead coin to the dev) and, since today, open
rounds. A dev could name themselves platform and every "only the platform"
check became a self-check.

Fix: a program-wide `Config` PDA (`["config"]`) holds `platform`; it is written
by `set_platform`, which requires the signer to be the program's **upgrade
authority** (checked against `ProgramData`). `launch` copies
`config.platform` onto the escrow; the argument is gone. Test F1: a stranger's
`set_platform` fails with `NotUpgradeAuthority`; a launch records the config's
platform, not the dev.

### F2 — HIGH (with F1): the dev could flag their own coin dead in seconds
`set_day_window` (min 2 s) and `set_delay_window` (min 5 slots) were dev-only
"test knobs". With a 2-second day, seven `check_trigger` calls in 14 seconds
of quiet make `dead = true`; combined with F1 the dev then calls `intervene`
and takes the whole undistributed pool. Even with F1 fixed, a dev-controlled
day window lets them manufacture the precondition and lobby the platform.

Fix: both knobs are signed by the platform (`NotPlatform` otherwise). Test F2.
Production should still leave them at defaults; they exist so tests need not
wait a week.

### F3 — MEDIUM: the round's randomness could be ground by any caller (superseded)
The original finding: the randomness step seeded the round from "the most
recent slot hash", so a caller could wait for a hash they liked. It was fixed
by pinning the seed slot at commit time, then made moot on 2026-09-13 when
randomness was removed altogether: a round now pays **every** eligible holder
pro rata (balance × time held), with a 10% per-wallet cap from 11 holders on,
so there is no seed to grind and nobody to pick. What the program enforces on
its own: the leaf amount is ≤ `MAX_SHARE_BPS` of the recorded release (once
the round has `CAP_MIN_HOLDERS`), the release is ≤ what triggers freed
(`pending`), claims cannot exceed the round total, one claim per wallet per
round (receipt PDA). Tests: F3 shows the allocation reproduces from chain and
an inflated release is refused (`AmountNotAuthorized`); main suite 10 commits
a doctored root paying one of eleven wallets 50% and shows the claim refused
(`ShareOverCap`).

### F4 — MEDIUM: snapshot-then-dump
`claim_share` (then under its old name) only checked that the holder still had *some* position worth
≥ 0.1 SOL (≈$20; 0.05 at the time). Weight is balance × time held, so a whale could hold until the
snapshot, dump everything but dust after `RoundOpened`, and still collect a
share sized by the position they no longer have.

Fix: the snapshot balance is now part of the leaf
(today `leaf = sha256("leaf", index, holder, balance, amount)`) and
`claim_share` requires the holder's current balance ≥ `balance ×
CLAIM_HOLD_BPS / 10000` (`HoldingBelowSnapshot`). `CLAIM_HOLD_BPS = 10000`:
you must still hold what the snapshot credited you for. This is a policy
constant — lower it to soften, 0 restores the old rule. Test F4: after moving
half the position away the claim fails; after moving it back it pays exactly
one share. Indexer, crank, web and simulation all carry the new leaf.

### F5 — LOW: division by curve reserves
`check_trigger`, `fire_trigger` and `claim_share` divide by
`virtual_token_reserves`. Pump never sets it to zero, but a zero would have
been a panic (whole tx fails, no state harm). Guarded with `EmptyCurve`.

## Reviewed and considered safe

- **PDA seeds.** Every program account is re-derived from its own stored
  fields (`escrow` from `mint`, `round` from `escrow`+`index`, `manual`/`buyer`
  from `mint`, `config` constant). A forged account cannot be program-owned,
  so seeds-from-own-data is sound.
- **Pump accounts.** `bonding_curve` and `global` are pinned with
  `seeds::program = pump::ID` wherever the program *reads* them (buyback
  quote, triggers, claim pricing) — the sandwich test proves a foreign curve
  is rejected. The rest are unchecked pass-throughs that pump validates; the
  program never trusts their contents.
- **ATAs.** `escrow_token_account`, `holder_token_account`,
  `wallet_token_account`, `dev_token_account`, `manual_token_account` are
  constrained as associated-token accounts of the right authority, so a claim
  cannot point at somebody else's balance. In `launch` the ATAs are unchecked
  because the mint does not exist at validation time; the ATA program derives
  and checks the address itself.
- **Signers.** Dev-only: `publish_manual_list`. Platform-only: `intervene`,
  the knobs. Dev-or-platform: `open_round`. Upgrade-authority-only:
  `set_platform`. Holder signs their own claim. Everything else is
  intentionally permissionless and only moves value along fixed rails.
- **Arithmetic.** All value math is `checked_*` or `u128` with explicit
  narrowing; saturating ops are used only for counters and where the result
  is clamped by design (`cum_volume`, `manual_published`). `authorized`,
  `pending`, `allocated`, `claimed` and `escrowed` invariants hold:
  `allocated ≥ claimed`, token account balance = `escrowed − claimed` (plus
  donations), `free = escrowed − allocated`.
- **Re-entrancy.** The only CPIs are into pump, the token program, the ATA
  program and System; none can call back into this program, and state is
  updated after the CPIs in every instruction (`buyback` also needs that
  order for the runtime's lamport check).
- **Double spend.** Manual claims: one bit per list index and a cumulative
  bps cap. Shares: an `init` receipt PDA per (round, holder). Rounds: `init`
  PDA per index.
  `open_round` cannot exceed `pending` (what triggers released) nor the free
  pool.
- **Merkle.** Domain-separated leaves (`"leaf"`, `"manual"`) and nodes
  (`"node"`), sorted pairs; the leaf is computed by the program from the
  caller's claimed fields, so a node hash cannot be smuggled in as a leaf.
- **Buyback reimbursement.** `needed` is computed on chain and refunded
  exactly; the caller cannot profit, only pay fees. The reserve kept on the
  buyer PDA is bounded by a constant.
- **Platform fee never touches the pool.** The platform's cut lives only in
  pump's fee-sharing config for the coin (`setup_fee_sharing` writes it from
  `Config.platform_fee_bps`, ≤ 10000); no instruction moves tokens out of the
  escrow token account except `claim_share`, `claim_manual` and `intervene`.
  The rate changes only via `propose_platform_fee` (platform authority) and,
  ≥ `PLATFORM_FEE_DELAY_SLOTS` (7 days) later, the permissionless
  `apply_platform_fee`; an early apply is refused (`FeeChangeTooEarly`, test
  F6). A change reaches only coins set up afterwards — each coin's split is
  fixed on pump at setup (pump revokes the admin after one update).
- **Holder-rewards coins** carry `is_holder_reward` on the escrow;
  `setup_fee_sharing`, `collect_fees` and `buyback` refuse (`NotApplicable`,
  test F5), so nothing pretends to sweep a fee pump keeps.
- **Buyback cap is per slot, not just per call.** `last_buyback_slot` is
  written on every spend and a second spend in the same slot is refused
  (`BuybackSameSlot`), so the 0.5%-of-reserves cap cannot be multiplied by
  packing several `buyback` instructions into one transaction or block.

## Known limitations (not fixed here)

1. **The root is trusted.** Whoever opens a round (dev or platform) can
   publish an allocation that favours someone. What they cannot do: pay a
   non-holder, pay below the minimum position, pay a dumped position (F4),
   pay any wallet more than 10% of the release, or release more than the
   triggers freed. Mitigation is off-chain: the allocation is deterministic
   from `(mint, snapshot_slot, released)` and all three are on chain, so
   anyone can reproduce and compare. A fraud-proof instruction would be the
   on-chain follow-up.
2. **Cap remainder.** With ten or fewer eligible holders every wallet hits the
   10% cap and part of the release stays `pending`; the crank re-offers it only
   when a trigger releases more. No randomness remains in the protocol.
3. **Volume is sampled, not measured.** Wash trades between two
   `check_trigger` calls are invisible; more frequent checks tighten it.
   Wash-trading *to* trigger a release costs ≥1% in pump fees per 1% of
   market cap, and releases 1% of the remaining pool to holders, not to the
   washer.
4. **Manual shares can be swept at unlock.** By decision, the platform may
   move unclaimed manual shares to the dev or the pool the moment the 30 days
   are up, ahead of slow claimants.
5. **Web `/api/claim` rebuilds snapshots per request** — a cheap way to make
   the server burn RPC credits. Cache is per (mint, round) on disk; add a rate
   limit before exposing publicly.
6. **`escrow.pending` is left stale by a dead-coin intervention** (the pool is
   gone, so `open_round` fails on `NothingToClaim`, which is correct but
   reads oddly on the site).

## Not in scope

Upgrade-authority key management (it now guards `set_platform` too — make it
a multisig before mainnet), the pump.fun program itself, RPC availability.
