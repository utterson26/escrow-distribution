# airdrop-launchpad

Launch a pump.fun coin whose creator is a program-owned escrow, lock part of
the dev's buy in it, and hand it back to holders through verifiable,
automatic airdrops: trading volume and market-cap milestones release tokens,
a Merkle snapshot of holders is committed on chain, randomness is drawn one
slot later, winners claim with a proof. Creator fees are swept into the escrow
and bought back into the coin. Nobody — the dev included — can withdraw the
escrow.

Everything runs on a **local validator with the pump.fun programs cloned from
devnet**, so you can try the whole loop in ten minutes without SOL.

## What is in here

| path | what |
|---|---|
| `programs/airdrop_escrow` | the Anchor program (`launch`, `collect_fees`, `buyback`, `check_trigger` / `fire_trigger`, `open_round` / `draw` / `claim_prize`, manual airdrop list, platform intervention) |
| `indexer/snapshot.ts` | deterministic holder snapshot → Merkle root; `snapshot` / `verify` / `reproduce` |
| `crank/` | the keeper: checks triggers, buys back, fires, snapshots, opens rounds, draws — once a minute, for every coin ([README](crank/README.md)) |
| `web/` | Next.js site: coins, rounds, claim with Phantom, event feed |
| `tests/` | Anchor/mocha suites, including `security.ts` for [SECURITY_REVIEW.md](SECURITY_REVIEW.md) |
| `scripts/localnet.sh` | local validator with pump / fee / mayhem programs and their config accounts cloned |
| `PROGRESS.md` | running log: what is proven, what is pending, open decisions |

## Prerequisites

- Rust `1.89` (pinned by `rust-toolchain.toml`), Solana CLI ≥ 2.x (`solana`,
  `solana-test-validator`, `cargo-build-sbf`), Anchor CLI `1.2.0`, Node ≥ 20.
- A default keypair: `solana-keygen new` if `~/.config/solana/id.json` does
  not exist. It becomes the dev, the deployer and the upgrade authority on
  localnet.
- A devnet RPC for cloning. The public one works but is slow and rate-limited;
  a free Helius key is nicer:
  `echo 'export HELIUS_RPC_URL="https://devnet.helius-rpc.com/?api-key=…"' > ~/.airdrop-launchpad.env`

## Ten minutes to a claim

```bash
git clone … && cd airdrop-launchpad
npm install && (cd web && npm install)

# 1. build for the v0 loader — `anchor build` produces SBPFv3, which neither
#    localnet nor devnet accept — and write the IDL
(cd programs/airdrop_escrow && cargo-build-sbf --arch v0)
anchor idl build -o target/idl/airdrop_escrow.json -t target/types/airdrop_escrow.ts

# 2. local validator with the pump world (leave it running; ~1 min to clone).
#    Loads the .so from step 1 at genesis under the program id, with your wallet
#    as upgrade authority. Resets the ledger; `RESET=0 ./scripts/localnet.sh`
#    restarts on the old one. To push a rebuild without restarting:
#    solana program deploy target/deploy/airdrop_escrow.so \
#      --program-id 5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe --url http://127.0.0.1:8899
./scripts/localnet.sh &

# 3. the whole loop, unattended: two coins, a market, the crank, then the
#    holders rebuild the snapshots and claim. ~7 minutes, report in crank/sim-report.md
npm run crank:sim

# 4. the site, pointed at the local validator
(cd web && npm run dev:local)      # http://localhost:3000
```

Step 3 launches the coins, generates a wallet for the crank and makes it the
platform authority via `set_platform` (signed by your wallet, the upgrade
authority), trades for five minutes and checks every crank action against
what the chain says. To claim from the site with your own wallet, add
it to the run and it will leave the draws it wins unclaimed:

```bash
DEMO_WALLET=<your Phantom address> npm run crank:sim
```

then set Phantom to **Solana Localnet** (Settings → Developer Settings →
Testnet Mode → Localnet; extension only) — details in
[crank/README.md](crank/README.md#phantom-ile-localnet).

## Tests

```bash
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json
npx ts-mocha -p ./tsconfig.json -t 600000 tests/security.ts        # findings F1–F4
npx ts-mocha -p ./tsconfig.json -t 600000 tests/manual_airdrop.ts  # manual list, intervention, dead coin
npx ts-mocha -p ./tsconfig.json -t 600000 tests/airdrop_escrow.ts  # full flow; the indexer uses HELIUS_RPC_URL if set (point it at localnet here), else the provider
```

Every run mints a new coin; on localnet that is free.

## How the airdrop stays honest

- **Lock.** `launch` does `create_v2` + `buy_v2` in one transaction and moves
  `escrow_bps` of the buy into an escrow ATA owned by a PDA. No withdraw
  instruction exists.
- **Release.** `check_trigger` (permissionless) samples the curve; 1% of
  market cap in volume releases 1% of the pool, a 2× market cap releases 5%.
  The release fires at a random slot inside the next hour.
- **Snapshot.** The indexer replays every token account's history to
  `snapshot_slot`, weights holders by balance × slots held, excludes the dev
  and the protocol's own accounts, and builds a Merkle tree. Only the root and
  the slot go on chain, so anyone can rebuild and compare
  (`indexer/snapshot.ts reproduce`).
- **Draw.** Randomness is the hash of a slot fixed when the root was
  committed; whoever calls `draw`, and when, does not change it.
- **Claim.** The winner proves their leaf and that the draw fell in their
  range; the program itself checks they still hold the snapshot balance and
  at least 0.05 SOL worth. One prize per draw.
- **Fees → buyback.** The escrow is the pump creator; `collect_fees` sweeps the
  vault, `buyback` converts at most 0.5% of the curve's reserves per call into
  the coin and adds it to the pool — and spends at most once per slot, so the
  cap cannot be defeated by stacking calls into one transaction.

What is trusted, what is not, and what was found in review:
[SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Devnet

Program id `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`. The deployed
devnet build predates `Config`, `snapshot_slot`, `draw_slot` and the
balance-carrying leaf; redeploy (v0 build) before running the devnet suite.
Deploying needs ~2.7 SOL for the buffer. `PROGRESS.md` has the signatures of
every step already proven on devnet.
