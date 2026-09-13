# Mainnet checklist

Not executed yet. Read `SECURITY_REVIEW.md` first; this program is unaudited
and ships with the beta brakes (50 SOL per-coin lock cap, launch pause).

## Before deploy day

- [ ] Independent audit done, findings closed (`SECURITY_REVIEW.md` §8 answered).
- [ ] **New program keypair for mainnet.** The devnet id `5iJy…` cannot be
      reused (its keypair was lost, PROGRESS.md 13 Sep). `solana-keygen new -o
      mainnet-program.json` → pubkey into `declare_id!` and `Anchor.toml`,
      rebuild, commit. Keypair goes offline after the first deploy.
- [ ] Keys, four distinct ones, none on a dev laptop:
      upgrade authority (→ Squads multisig right after deploy), platform
      authority (opens rounds, pauses, proposes changes; hot but low value),
      platform fee wallet (receives the fee split; cold), crank key (hot, fees
      only). `.env.mainnet` filled from `.env.mainnet.example`, never committed.
- [ ] pump.fun mainnet program ids and fee recipients verified against
      `docs/pump` (the localnet script clones devnet ones; mainnet `Global`
      fee recipients differ). `tests/pump.ts` constants parameterised by
      cluster before building the mainnet client.
- [ ] Verifiable build reproduces: `solana-verify build` twice, same hash.
- [ ] Helius (or equivalent) mainnet plan with archival `getTransaction` and
      Token-2022 `getProgramAccounts` — the indexer needs both.
- [ ] Web: `NEXT_PUBLIC_RPC_URL` / `HELIUS_RPC_URL` mainnet, `/api/claim`
      rate-limited, beta banner on, escrow explorer links point at mainnet.
- [ ] Crank runs from a VPS with the crank key only; `CRANK_LOG` shipped
      somewhere durable; alert on `result: "error"`.

## SOL needed (mainnet rent is the same per byte as devnet)

| Item | SOL | Note |
|---|---|---|
| Program deploy (buffer, refunded) | ~3.7 | 737 KB binary; comes back after the upgrade closes the buffer |
| Program data rent (kept) | ~3.7 | one-time; `solana rent <size>` for the exact figure |
| `Config` + first `set_platform` | <0.01 | |
| Showcase coin launch buy | 1.5–3 | see `docs/SHOWCASE.md`; the dev keeps 70% of the tokens |
| Showcase fee-sharing setup | 0.01 | fronted, mostly returned |
| Crank reserve | 0.5 | fees for a month at one tick a minute per coin |
| Platform authority | 0.2 | fees for rounds and proposals |
| Priority fees, retries, margin | 1 | |
| **Total** | **~10–12 SOL** | of which ~3.7 comes back |

## Deploy day (in this order)

1. `./scripts/deploy-mainnet.sh --dry-run` — read every line it prints.
2. `./scripts/deploy-mainnet.sh` — confirm step by step: verifiable build →
   balance → deploy → dump/compare + authority check → `set_platform` (creates
   `Config` with 10% fee, 50 SOL cap, 7-day delay, unpaused) → multisig.
3. `scripts/config-admin.ts show` — platform, fee wallet, cap, paused=false.
4. Start the crank (`RPC_URL`, `CRANK_KEYPAIR`), watch one full tick with no
   escrows: it should log `start` and idle ticks only.
5. Launch the showcase coin with `docs/SHOWCASE.md` parameters (a small script
   modelled on `scripts/demo.ts` step 2 — write it against mainnet, run once).
6. `setup_fee_sharing` for it (the crank will do it on its first tick; doing
   it by hand lets you watch the pump sharing config appear).
7. Check the coin page on the site: locked split, fee split, type, cap.
8. Announce (`docs/ANNOUNCEMENT.md`).

## After deploy

- Watch the first `collect_fees`, `buyback`, trigger arm and fire, and the
  first round + claims on the showcase coin. Reproduce the first round's
  allocation with `indexer/snapshot.ts reproduce`.
- Keep the upgrade authority on the multisig; every upgrade re-runs the
  verifiable build and, if `Config` grew, `migrate_config` before any launch.

## Rollback plan

There is no way to move tokens out of an escrow except through claims, and
that is by design. What can be done, and by whom:

- **Stop new launches**: platform `set_paused(true)` — immediate. Claims,
  triggers, rounds and buybacks keep running; holders are never blocked.
- **Stop the crank**: kill the process. Nothing on chain depends on it except
  liveness (triggers, rounds); holders can still claim what was opened.
- **Bad build**: upgrade to the previous verified commit (multisig), then
  `migrate_config` if needed. Escrow layouts are append-only; never remove a
  field.
- **Compromised platform key**: upgrade authority (multisig) runs
  `set_platform` to a new key; the old key could only have paused launches,
  opened rounds (bounded by the on-chain rules) or proposed changes that take
  7 days — cancel by proposing again.
- **Compromised upgrade authority**: nothing below can help; that is why it is
  a multisig from day one.
- **Showcase coin goes wrong**: nothing to roll back — the lock is the
  product; the dev keeps 70% and pump's curve keeps trading.
