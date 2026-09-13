# Security review — airdrop_escrow (pre-audit, beta)

Last updated 2026-09-13. Scope: `programs/airdrop_escrow/src/*` at the
current `main`, plus the trust boundaries with the indexer (`indexer/`), the
crank (`crank/`), the web app (`web/`) and pump.fun. This is a self-review by
the author, kept current as the program changes; it is **not** an independent
audit. The last section lists what we want an auditor to look at.

## 1. What the program is

A pump.fun coin is created with a program-owned account as its creator; part
of the dev's launch buy is locked in an escrow the program alone controls;
trading volume and market-cap milestones release slices of that lock to
every eligible holder, pro rata, claimed by Merkle proof; pump's creator fee
is split between the escrow (bought back into the coin) and the platform.
Nothing in the design lets a human withdraw the lock.

State: one `Config` PDA (platform authority, fee rate, lock cap, pause), one
`Escrow` PDA per coin, one `Round` PDA per distribution, one `ClaimReceipt`
PDA per (round, holder), dataless `fee` / `buyer` / `manual` PDAs that only
sign.

## 2. Trust model

| Party | Can | Cannot |
|---|---|---|
| Nobody | — | move tokens out of the escrow token account except through `claim_share`, `claim_manual`, `intervene` (below) |
| Dev (launcher) | choose lock split, manual list, fee mode at launch; `publish_manual_list`; open rounds | withdraw the lock; change the list; pick who gets a share; pause; change fees |
| Platform authority (`Config.platform`) | open rounds; `intervene` (only: unclaimed manual shares after 30 days → dev or pool; a dead coin's pool → dev); test knobs; propose fee / lock-cap changes; pause **launches** | take tokens for itself; skip the 7-day delay; stop claims, triggers, rounds or buybacks |
| Upgrade authority | upgrade the program; `set_platform`; `migrate_config` | anything at runtime without an upgrade — which is why it must be a multisig on mainnet |
| Any wallet | `check_trigger`, `fire_trigger`, `buyback`, `collect_fees`, `setup_fee_sharing`, `apply_*` after the delay, claim its own share | claim for someone else; claim twice; claim over the cap |
| pump.fun | price the coin, hold the creator vault, split the fee per the sharing config | touch the escrow |

Program-side invariants (every one has a test):
- `escrowed ≥ allocated ≥ claimed`; escrow token balance = `escrowed − claimed`
  (+ donations, + buyback tokens).
- `open_round`: `released ≤ pending`, `total ≤ released`; `pending` is zeroed
  and only `total` becomes `allocated` — the remainder stays in the pool.
- `claim_share`: proof must verify; amount ≤ 10% of `released` once the round
  has ≥ 11 holders; claims ≤ `total`; holder still holds the snapshot balance
  (`CLAIM_HOLD_BPS = 100%`) worth ≥ 0.1 SOL at the curve price; one receipt
  per (round, holder).
- `launch`: `manual_bps + holder_bps ∈ (0, 10000]`; a manual slice iff a root;
  lock ≥ 1% of total supply; lock value at the launch price ≤
  `Config.max_locked_value_lamports`; refused while `Config.paused`.
- Platform fee and lock cap change only through propose → delay → apply
  (`fee_delay_slots`, 7 days in production; the knob `set_fee_delay` is
  platform-only and floored).
- `buyback`: at most 0.5% of the curve's quote reserves per call, one spend
  per slot, on-chain quote with 2% slippage floor, canonical curve only.

## 3. Findings fixed (history)

### F1 — HIGH: the launcher chose the "platform authority"
`launch` took `platform` as an argument. Fixed: `Config` PDA written only by
the upgrade authority (`set_platform`); `launch` copies `config.platform`.
Test F1.

### F2 — HIGH (with F1): the dev could flag their own coin dead in seconds
The day/delay knobs were dev-only. Fixed: platform-only. Test F2.

### F3 — MEDIUM: the round's randomness could be ground (superseded)
The old randomness step seeded from "the most recent slot hash". Fixed by
pinning the slot at commit time; then made moot when randomness was removed
entirely: a round pays every eligible holder pro rata. Test F3 now checks the
allocation reproduces from chain and an inflated `released` is refused; main
suite 10 checks an over-cap leaf is refused with eleven holders.

### F4 — MEDIUM: snapshot-then-dump
A holder could sell right after the snapshot and still claim. Fixed: the
snapshot balance is in the leaf and `claim_share` requires the holder to
still hold it (`HoldingBelowSnapshot`). Test F4.

### F5 — LOW: division by curve reserves
Guarded with `EmptyCurve`.

### F6 — (design) platform fee could have been changed instantly
Now propose → 7 days → apply, permissionless apply, early apply refused.
Test F6 (with the delay knob narrowed, the whole path runs on localnet).

### F7 — (design) a launch could lock an unbounded value on an unaudited program
Now `Config.max_locked_value_lamports` (50 SOL default), measured as
`sol_spent × locked_tokens / bought_tokens` at the launch buy, 7-day delayed
changes; `LockCapExceeded`. And `Config.paused` stops launches only. Tests in
`tests/manual_airdrop.ts` (simulated launches: `Paused`, `LockCapExceeded`;
claims run while paused).

### F8 — (bug) the manual-list PDA counted as a holder
The indexer treated the fixed list's unclaimed slice as a holder position.
Fixed: `protocolOwners` excludes the `manual` PDA. Surfaced by the demo.

## 4. Reviewed and considered safe

- **PDA seeds.** Every program account is re-derived from its own stored
  fields; a forged account cannot be program-owned.
- **Pump accounts.** `bonding_curve` and `global` are pinned with
  `seeds::program = pump::ID` wherever the program reads them, wrapped in
  `Padded<T>` so an older, shorter pump layout still deserializes and an
  unknown newer one is ignored past our fields. Everything else is a
  pass-through pump validates; the program never trusts its contents.
- **Creator = dataless fee PDA.** pump's sharing config must be paid for and
  administered by the creator; a data-carrying escrow PDA cannot fund a
  system `create_account`, a dataless PDA can. It keeps nothing: every lamport
  it receives is swept to the escrow (`collect_fees`) or returned to the
  payer (`setup_fee_sharing` rent leftover) in the same instruction.
- **Fee split is enforced by pump**, not by us: `update_fee_shares_v2` is
  one-shot (pump revokes the admin), so neither the dev nor the platform can
  re-route a coin's creator fee later.
- **ATAs** are constrained to the right authority wherever a balance is
  read; in `launch` the ATA program derives them.
- **Signers.** See the trust table. Everything unnamed is permissionless and
  only moves value along fixed rails.
- **Arithmetic.** `checked_*` / `u128` with explicit narrowing; saturating
  only for counters.
- **Re-entrancy.** CPIs go to pump, pump_fees, token, ATA, System; none call
  back; state is written after CPIs.
- **Double spend.** Manual: one bit per list index + cumulative bps cap.
  Shares: `init` receipt per (round, holder). Rounds: `init` per index.
- **Merkle.** Domain-separated leaves/nodes, sorted pairs, leaf computed by
  the program from the caller's claimed fields.
- **Buyback reimbursement** is exact; the caller only pays fees.

## 5. Known limitations and assumptions (not fixed)

1. **The root is trusted, but bounded.** Whoever opens a round (dev or
   platform) publishes the allocation. What they cannot do: pay a non-holder,
   pay below the minimum, pay a dumped position, pay any wallet over 10% (≥ 11
   holders), release more than the triggers freed. Anyone can reproduce the
   allocation from `(mint, snapshot_slot, released)` and compare. An on-chain
   fraud proof is the follow-up.
2. **Holder history comes from an RPC.** The indexer replays token-account
   history through `getSignaturesForAddress` / `getTransaction`; a lying or
   pruned RPC gives a different snapshot. Reproducers should use their own
   node. Positions under 0.1 SOL are ignored, so dust-splitting does not help
   an attacker, but a whale can split into ten wallets to dodge the 10% cap
   — the cap limits concentration per wallet, not per person.
3. **Volume is sampled, not measured.** Wash trading to a release costs pump
   fees on every leg and releases 1% of the pool to *all* holders.
4. **Manual shares can be swept at unlock** by the platform (to the dev or
   the pool), by design, after 30 days.
5. **The lock cap is a beta brake**, priced at launch; it says nothing about
   the value later. Raise it only after an audit.
6. **`Config` migration.** `migrate_config` grows the account; appended fields
   read as zero, which every reader treats as "default" (`0` lock cap =
   50 SOL). Run it right after an upgrade that adds fields, before any launch.
7. **Holder-rewards coins** rely on pump paying the creator fee to its own
   holder pool; the program only refuses to pretend otherwise. As of today
   pump's devnet build does not implement the flag; the escrow flag is ours.
8. **Web `/api/claim` rebuilds snapshots per request** (disk cache per round);
   rate-limit before exposing widely.
9. **Dead-coin intervention leaves `pending` stale** (harmless; `open_round`
   then fails on `NothingToClaim`).
10. **`holder_count` is the publisher's word.** The on-chain cap switches on
    at 11 declared holders. A dishonest publisher could declare 10, commit a
    tree that favours one wallet and lock everyone past index 9 out of the
    round — visible to any reproducer (their leaves are missing), but not
    refused on chain. Same class as (1); the fraud-proof follow-up covers it.
11. **Dollar thresholds are fixed in SOL** (0.1 SOL ≈ $20 at the time of
    writing); a price feed would be needed for true dollar rules.

## 6. Attack surface, by instruction

| Instruction | Signer | Value moved | What an attacker would try | Guard |
|---|---|---|---|---|
| `launch` | dev, mint | dev SOL → pump; tokens → escrow/manual | lock a fake amount; skip the lock; front a huge lock | split rules, 1% floor, lock cap, `paused` |
| `setup_fee_sharing` | payer (any) | payer rent → fee PDA → sharing config, leftover back | route the fee to themselves | shareholders come from `Config`, one-shot on pump |
| `collect_fees` | payer (any) | vault → fee PDA → escrow; vault → platform | pass wrong shareholders | pump checks them against its config |
| `buyback` | payer (any) | escrow SOL → curve → escrow tokens | sandwich; drain via stacking; forged curve | 0.5% cap, one per slot, on-chain quote −2%, canonical curve seeds |
| `check_trigger` / `fire_trigger` | any | none / pool → `pending` | fire early; re-arm | `TooEarly`, `AlreadyArmed`, random delay |
| `open_round` | dev or platform | pool → `allocated` | over-release; favour a wallet | `released ≤ pending`, on-chain 10% cap, reproducible allocation |
| `claim_share` | holder | escrow → holder | forge, double claim, claim after dump | proof, receipt, hold check, cap |
| `claim_manual` | wallet | manual → wallet | forge, double claim | proof, bitmap, bps sum |
| `intervene` | platform | manual/pool → dev or pool | steal | only two targets, 30-day lock / dead flag |
| `propose_*` / `apply_*` / `set_paused` | platform / any | none | instant change | 7-day delay; pause affects launches only |
| `set_platform` / `migrate_config` | upgrade authority | none | take over | multisig the upgrade authority |

## 7. Beta conditions (what "beta" means here)

- Unaudited. Per-coin lock cap 50 SOL. Launches can be paused by the
  platform; nothing else can.
- Program upgrade authority and platform authority should be distinct keys;
  the upgrade authority a multisig.
- The crank runs with its own low-value key; every instruction it sends is
  permissionless except `open_round`, which the platform key signs.
- The web app is read-only apart from `claim_share` signed by the visitor.

## 8. Questions for the auditor

1. Is the `Padded<T>` wrapper for pump accounts safe against a *malicious*
   layout change, i.e. could a future pump field shift `virtual_*_reserves`
   under us? (We pin by seeds, not by size.)
2. `launch` measures the lock value from the dev's lamport delta around the
   `buy_v2` CPI. Can a dev reduce that delta (e.g. by having another account
   pay) to slip under the lock cap?
3. The receipt PDA is the only double-claim guard for `claim_share`; is
   `init` with `payer = holder` abusable (rent griefing, account pre-creation)?
4. `open_round` trusts the publisher's `holder_count`; it only bounds
   `leaf_index` and the cap threshold. Can a wrong count be used to disable
   the cap (`holder_count < 11` with more real leaves)?
5. Fee-sharing setup fronts rent from the payer to a dataless PDA and returns
   the leftover in the same instruction — any way to leave lamports on the
   PDA or take them from it?
6. `migrate_config` resizes with `AccountInfo::resize`; is the rent top-up
   and zero-fill correct on every runtime version we target?
7. `intervene` targets and timing; is the 30-day manual lock computed from
   the right clock (`unix_timestamp`)?
8. Arithmetic on `u128` narrowing in `allocate` (off-chain) vs on-chain cap
   check — can rounding let a leaf exceed the cap by 1?
9. Anything in the trigger sampling (`cum_volume`, `last_quote_reserves`)
   that a single large buy/sell pair can exploit to arm a release cheaply.
10. Upgradeability: what state would a malicious upgrade need to touch to
    drain escrows, and what governance should gate upgrades.

## Not in scope

Key management, the pump.fun and pump_fees programs themselves, RPC
availability, and the front end's hosting.
