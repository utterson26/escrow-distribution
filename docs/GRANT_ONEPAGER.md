# escrow-distribution — grant one-pager

**One line.** An open-source Solana program that launches pump.fun coins with
part of the creator's buy locked in a program-owned escrow and gives that
lock back to holders automatically, verifiably and pro rata — with the
trading fee bought back into the coin instead of paid to a wallet.

## Problem

Creator allocations on launchpads are a promise. The creator holds the
tokens, decides if and when to distribute them, and the community has no way
to check what happened. The result is the same story every week: a large
creator wallet, a quiet sale, a dead chart. Holder rewards, when they exist,
are computed off chain by the same party that benefits.

## Solution

Make the lock a program account nobody can withdraw from, and make the
distribution a rule everyone can recompute:

- **Lock at launch.** Coin creation and the creator's first buy happen in one
  transaction; a fixed share of that buy (≥ 1% of supply) goes into a
  program-owned escrow. Optionally a fixed list of wallets and percentages is
  committed at the same time and published on chain.
- **Rules, not decisions.** Trading volume (1% of market cap) and market-cap
  milestones (2×) release slices of the lock at a random moment within an
  hour. Anyone may call the trigger; nobody chooses the moment.
- **Pro rata, capped, reproducible.** An open-source indexer weights holders
  by balance × time held, drops dust, caps any wallet at 10% of a round from
  eleven holders on, and commits only a Merkle root plus the two inputs
  (snapshot slot, released amount) to chain. Anyone can rebuild it. Holders
  claim with a proof; the program checks they still hold their position.
- **Fees feed the pool.** pump.fun's creator fee is split on pump itself —
  90% to the escrow, bought back into the coin at a rate that makes
  sandwiching pointless (0.5% of reserves per call, one call per slot), 10%
  to the platform — the platform's only income.

## What exists today (devnet)

- Anchor program, 16 instructions, 20 + 6 + 7 tests plus allocator unit tests,
  a self-review with an auditor question list (`SECURITY_REVIEW.md`).
- Keeper (crank), deterministic indexer, Next.js site with wallet claims.
- Full run on devnet against the real pump.fun program: launch, fee split,
  twelve buyers, sell-out, buyback, trigger, pro-rata round, claims —
  `DEMO-devnet.md`, coin `3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw`
  (https://explorer.solana.com/address/3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw?cluster=devnet).
- Program id (devnet): `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`.
- Beta brakes for mainnet: 50 SOL per-coin lock cap and a launch pause, both
  governed by 7-day delays.

## Public good

MIT-licensed, no token, no fee on the locked pool. The indexer and the
allocation rules are the same code everyone runs; a launchpad, a wallet or a
block explorer can verify any round without trusting us. The contract is
generic enough that other launchpads on pump.fun can adopt it.

## Budget (under $10k)

| Item | USD |
|---|---|
| Independent audit of the program (small scope, ~1.5k lines of Rust) | 5,000–7,000 |
| RPC for indexer and site (archival history + Token-2022 gPA), 6 months | 600 |
| Crank infrastructure (VPS, monitoring), 6 months | 300 |
| Mainnet deploy, showcase coin, priority fees | 300 |
| Contingency | 800 |
| **Total** | **≈ 7,000–9,000** |

## Three-month milestones

1. **Month 1 — audit and mainnet.** Audit findings closed, verifiable build,
   multisig upgrade authority, mainnet deploy, one showcase coin with a 30%
   lock (25% pool + 5% fixed list), keeper running.
2. **Month 2 — verification tooling.** One-command "reproduce this round"
   for anyone; claim-side fraud proof design; per-coin explorer links and
   public snapshot archive.
3. **Month 3 — adoption.** Custom-pair support research complete
   (`docs/CUSTOM_PAIR.md`), integration guide for launchpads, second and
   third coins launched by third parties, lock cap raised after the audit.
