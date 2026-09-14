# escrow-distribution — Colosseum Crypto World's Fair application

## Project name

**escrow-distribution**

## One sentence

A Solana program that launches a pump.fun coin with part of the creator's buy
locked in a program-owned escrow nobody can withdraw from, and hands that
lock back to the coin's holders over time by rules anyone can recompute.

## Problem

On every launchpad the creator's allocation is a promise. The creator holds
the tokens, decides if and when to distribute them, and the community has no
way to check what happened. The pattern repeats weekly: a large creator
wallet, a quiet sale, a dead chart. Where holder rewards exist, they are
computed off chain by the party that benefits from them, and the trading fee
the launchpad pays the creator goes to a wallet, not to the coin.

## Solution

Make the lock a program account with no withdraw instruction, and make the
distribution a pure function of chain history:

- **Lock at launch.** Coin creation and the creator's first buy happen in one
  transaction; a share of that buy (at least 1% of supply) goes into the
  escrow. Optionally a fixed list of wallets and percentages is committed at
  the same time — only its Merkle root, published on chain, claimable by
  proof, unchangeable afterwards.
- **Rules, not decisions.** Trading volume (1% of market cap) and market-cap
  milestones (2×) release slices of the pool. The release fires at a random
  slot within the next hour; anyone may call the trigger, nobody chooses the
  moment.
- **Pro rata, capped, reproducible.** An open-source indexer weights holders
  by balance × holding time, drops dust positions, caps any wallet at 10% of a
  round from eleven holders on, and commits only a Merkle root plus its two
  inputs (snapshot slot, released amount) to chain. Holders claim with a
  proof; the program checks the cap and that they still hold their position.
- **Fees feed the pool.** pump.fun's creator fee is split on pump itself —
  90% to the escrow, bought back into the coin in slot-sized pieces (≤ 0.5%
  of reserves per call, one call per slot, priced on chain), 10% to the
  platform. That 10% is the platform's only income; it never touches the pool.

## How it works

1. **`launch`** — one transaction: `create_v2` + `buy_v2` on pump.fun, then
   the locked share (holder pool + optional fixed list) moves into
   program-owned token accounts. The coin's creator on pump is a program PDA.
2. **`setup_fee_sharing` / `collect_fees` / `buyback`** — pump's fee-sharing
   config splits every trade's creator fee 90/10; the escrow's share is
   converted back into the coin by permissionless, rate-limited buybacks and
   added to the pool.
3. **`check_trigger` / `fire_trigger`** — permissionless. The keeper (or
   anyone) samples the curve; when a volume or milestone condition holds, the
   program arms a release for a random slot drawn from the SlotHashes sysvar
   and refuses to fire early (`TooEarly`).
4. **Snapshot + `open_round`** — the indexer replays every Token-2022 account
   of the coin to the snapshot slot, allocates pro rata, builds the tree. The
   publisher writes root, snapshot slot, released amount and holder count;
   the program refuses a total above what the triggers freed.
5. **`claim_share`** — each holder proves their leaf from their own wallet;
   the program checks proof, per-wallet cap, current balance ≥ snapshot
   balance and position ≥ the eligibility floor, once per wallet per round.
   Unclaimed shares stay in the pool for the next trigger.

## Technical status

**Solana (this repository)**

- Anchor program, 24 instructions, ~2,400 lines of Rust, `overflow-checks`
  on, upgradeable with the authority meant for a Squads 2/3 multisig
  (`docs/MULTISIG.md`, rehearsed on localnet).
- Program id on devnet: `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`.
- Full run on devnet against the **real pump.fun devnet program**: launch
  with a 25% pool + 5% fixed list, fee split, twelve buyers, one sell-out,
  chunked buyback, volume trigger, random delay, pro-rata round, eleven
  claims, one rejected impersonation claim, one rejected double claim —
  every signature in `DEMO-devnet.md`, coin
  `3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw`
  ([explorer](https://explorer.solana.com/address/3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw?cluster=devnet)).
- Tests on a local validator with the pump.fun programs cloned from devnet:
  **20** end-to-end (`tests/airdrop_escrow.ts`), **6** security regressions
  from the self-review (`tests/security.ts`), **7** fixed list / brakes /
  intervention / dead coin (`tests/manual_airdrop.ts`), **4** multisig
  hand-over (`tests/multisig.ts`), **14** allocator unit checks
  (`indexer/allocate.test.ts`). 37/37 on the validator, all green on the
  current build.
- Keeper (`crank/`), deterministic indexer with `snapshot` / `verify` /
  `reproduce`, Next.js site with wallet claims and an event feed.
- `SECURITY_REVIEW.md`: trust model, five findings fixed, known limitations,
  the questions we want an auditor to answer. Not audited yet.
- Beta brakes for mainnet: 50 SOL per-coin lock cap, launch pause, publisher
  allowlist, all platform levers behind a seven-day delay.
- A 3–4 minute screen-recording script (`scripts/demo-video.sh`) runs the
  whole loop on devnet with explorer links and before/after balances.

**EVM port** — [escrow-distribution-evm](https://github.com/utterson26/escrow-distribution-evm)

- Same design in Solidity (Foundry): one immutable `EscrowCore` per coin, no
  owner, no proxy, no withdrawal function; `EscrowFactory` with seven-day
  delayed levers; launchpad adapters for **Pons** on Robinhood Chain and
  **Four.meme** on BNB Chain; native or ERC-20 quote assets (USDG, tokenised
  stocks).
- 55 unit/fuzz tests, 7 invariants at 10,000 runs, Solidity↔TypeScript
  differential tests for the allocator and the tree, fork tests against the
  live Pons and Four.meme contracts (Pons ETH 3/3, Pons USDG 1/1, Four.meme
  BNB / PancakeSwap / tokenised stock 4/4). Two end-to-end demos on anvil
  forks (`DEMO.en.md`). Not deployed; `docs/PARITY.md` lists every behavioral
  difference from the Solana version.

## Competitors and differences

| | Creator allocation | Who decides distribution | Trading fee | Verifiable? |
|---|---|---|---|---|
| pump.fun creator fee / holder-rewards | creator holds it | creator; holder-rewards mode pays pump's own pool | to the creator wallet, or pump's holder pool | pump's off-chain accounting |
| Fee-splitting launchpads (Bags, Believe) | creator holds it | creator | split among creator / referrer wallets | payout addresses on chain, allocation logic off chain |
| Token lockers / vesting (Streamflow, Jupiter Lock) | locked, unlocks to the creator | creator, by schedule | untouched | the schedule, yes; the destination is still the creator |
| **escrow-distribution** | locked in a program account, no withdraw path | market-driven triggers, random slot, pro-rata rule | 90% bought back into the coin's pool, 10% platform | root + two inputs on chain; anyone reruns the indexer and compares |

What is different, in one line each:

- The lock cannot be opened by anyone — not the creator, not us, not an
  upgrade of the program's parameters.
- The destination of the lock is the holders, not the creator's future self.
- The allocation is reproducible: same public inputs, same root, or the round
  is provably wrong.
- The fee becomes buy pressure for the coin through a rate-limited on-chain
  buyback instead of income for a wallet.
- The same rules run on Solana and on two EVM launchpads, so a launchpad can
  adopt the contract instead of writing its own reward logic.

## Roadmap

1. **Audit and mainnet (next 4–6 weeks).** Close the auditor's findings,
   verifiable build (`solana-verify`), upgrade authority to a Squads 2/3,
   mainnet deploy, keeper on infrastructure, one showcase coin with a 30%
   lock.
2. **Verification for everyone.** One-command "reproduce this round" with a
   public snapshot archive; fraud-proof design so publishing rounds becomes
   permissionless; explorer-style coin pages.
3. **Custom pairs.** pump.fun coins quoted in USDC / tokenised stocks
   (`docs/CUSTOM_PAIR.md`), which needs a price feed for the eligibility
   floor and the lock cap.
4. **EVM deploy.** Robinhood Chain (Pons) and BNB Chain (Four.meme) after the
   Solana audit; the adapters and fork tests already exist.
5. **Adoption.** Integration guide for launchpads; second and third coins
   launched by third parties; lock cap raised as the program earns trust.

## Team

Solo founder — Rıza Karaboğa, Ankara, Türkiye. Twenty-eight years in law
enforcement before this, most of it in investigation and evidence work, which
is where the project's stance comes from: a claim that cannot be checked is
not a claim. Designs, writes and tests the program, the indexer, the keeper
and the site; the EVM port is by the same hand. Building in the open since
the first commit; every step is logged in `PROGRESS.md`.

## Links

- Solana repository: https://github.com/utterson26/escrow-distribution
- EVM port: https://github.com/utterson26/escrow-distribution-evm
- Devnet program: https://explorer.solana.com/address/5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe?cluster=devnet
- Devnet run, every signature: `DEMO-devnet.md` in the repository
- Security self-review and auditor questions: `SECURITY_REVIEW.md`
- Mainnet checklist: `docs/MAINNET_CHECKLIST.md`
- Multisig plan: `docs/MULTISIG.md`
- Demo video script: `scripts/demo-video.sh`
