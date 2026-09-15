# escrow-distribution

**Beta — unaudited. Per-coin lock cap: 50 SOL. Rounds are opened by the platform's keeper only. Devnet only for now.**

escrow-distribution is a Solana program that launches a pump.fun coin with
part of the creator's buy locked in a program-owned escrow, and hands that
lock back to the coin's holders over time, automatically and verifiably:
trading volume and market-cap milestones release slices of the lock, every
eligible holder gets a pro-rata share, and the creator fee pump.fun collects
on every trade is bought back into the coin. Nobody — not the creator, not
the platform, not the program's authors — can withdraw the escrow.

Open source (MIT). Program id on devnet:
`5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`.

## How it works

1. **Lock.** `launch` creates the coin on pump.fun and buys the creator's
   initial position in one transaction. A share of that buy (at least 1% of
   total supply, at most 50 SOL of value during the beta) is locked in two
   slices: a **holder pool** the triggers distribute, and optionally a
   **fixed list** of wallets and percentages committed at launch, published on
   chain and claimable by proof. Either slice may be zero, not both. The
   creator keeps the rest and is excluded from every distribution.
2. **Two fee modes.** In *creator-fee* mode the coin's creator on pump.fun is
   a program-owned account, and pump's fee-sharing config splits every trade's
   creator fee 90% to the escrow and 10% to the platform — fixed per coin on
   pump itself. The escrow's share is converted back into the coin by
   `buyback` (at most 0.5% of the curve's reserves per call, one call per
   slot, priced on chain) and added to the pool. In *holder-rewards* mode the
   coin is a pump.fun holder-rewards coin: pump pays the creator fee to its
   own holder pool, and the program does nothing with fees.
3. **Triggers.** Anyone may call `check_trigger`; it samples the curve. When
   trading volume since the last distribution reaches 1% of market cap, 1% of
   the pool is released; when market cap doubles, 5%. The release fires at a
   random moment within the next hour (`fire_trigger`, also permissionless),
   so the distribution slot cannot be front-run.
4. **Pro-rata distribution.** An open-source indexer replays every token
   account's history to the snapshot slot, weights holders by balance × time
   held, drops positions under 0.1 SOL (≈ $20), and splits the release in
   proportion. From eleven holders on, no wallet takes more than 10% of a
   round; the excess is re-split over the others. Only the Merkle root of the
   (wallet, balance, amount) rows, the snapshot slot and the released amount
   go on chain. Nothing is random.
5. **Claim.** Each holder claims with a proof. The program checks the amount
   against the cap, that the holder still holds the snapshot balance, and
   that the position is worth at least 0.1 SOL — once per wallet per round.
6. **Dead coins.** Seven consecutive days below 0.1% of market cap in volume
   flag a coin dead; only then may the platform move the remaining pool to
   the creator. Unclaimed fixed-list shares can be moved after 30 days.

## Trust model

- **Nobody can touch the pool.** No instruction moves tokens out of the
  escrow except `claim_share` (with a proof), `claim_manual` (with a proof)
  and `intervene` (dead coin / expired list, platform only, two fixed
  targets).
- **The platform's income is a share of pump's creator fee, nothing else.**
  It is written into each coin's pump fee-sharing config at setup and cannot
  be changed for that coin afterwards; the rate for new coins changes only
  through a proposal that takes effect seven days later.
- **The lock cap and the pause are beta brakes.** The cap (50 SOL of value
  per coin, measured at the launch price) can only be raised with the same
  seven-day delay. The platform can pause *launches*; it cannot pause claims,
  triggers, rounds or buybacks.
- **Who publishes the allocation is bounded, not trusted — and, during the
  beta, allowlisted.** Only keys on the program config's publisher list (the
  platform's keeper wallet) may open a round; the creator cannot. The
  program refuses a release above what the triggers freed, any leaf above
  the cap, any claim by a wallet that is not in the tree or no longer holds
  its position — and the allocation is a pure function of chain history, so
  anyone can rebuild it and compare. Permissionless publishing with an
  on-chain fraud proof is planned for after the audit.
- **Thresholds are in SOL and change slowly.** The eligibility floor
  (0.1 SOL ≈ $20) and the per-coin lock cap (50 SOL) are program-config
  values the platform can change only through a proposal that takes effect
  seven days later; every round records the floor it was built with. A price
  oracle is deferred to custom-pair support.
- **Upgrades.** The program is upgradeable; the upgrade authority is meant to
  be a multisig from the first mainnet deploy. `SECURITY_REVIEW.md` lists
  every known limitation and the questions we want an auditor to answer.

## Verify it yourself

- Rebuild the allocation of any round from public data:
  `npx ts-node indexer/snapshot.ts reproduce --in <round.json>` — the
  snapshot slot and the released amount are on the `Round` account, the
  root must match.
- Rebuild a fixed list from chain: the rows are emitted by
  `publish_manual_list`; hash them as in `tests/manual_airdrop.ts` and
  compare with the root on the `Escrow` account.
- Rebuild the program: `solana-verify build` against a tagged commit and
  compare the hash with the on-chain program data.
- Every coin page on the site links the escrow account and its transactions
  on the explorer.

## Run it

Everything runs on a local validator with the pump.fun programs cloned from
devnet, so the whole loop can be tried in ten minutes without SOL.

Prerequisites: Rust 1.89 (pinned), Solana CLI ≥ 2.x, Anchor CLI 1.2.0,
Node ≥ 20, a default keypair (`solana-keygen new`), and optionally a devnet
Helius key in `~/.airdrop-launchpad.env` (`export HELIUS_RPC_URL=…`) — the
public RPC works for cloning but is slow.

```bash
git clone https://github.com/utterson26/escrow-distribution.git && cd escrow-distribution
npm install && (cd web && npm install)

# 1. build for the v0 loader and write the IDL
(cd programs/airdrop_escrow && cargo-build-sbf --arch v0)
anchor idl build -o target/idl/airdrop_escrow.json -t target/types/airdrop_escrow.ts

# 2. local validator with the pump world (leave it running; ~1 min to clone).
#    Loads the .so at genesis; RESET=0 keeps an existing ledger.
./scripts/localnet.sh &

# 3. one end-to-end run: launch with a 25% pool + 5% fixed list, fee split,
#    twelve buyers, one sells out, chunked buyback, volume trigger, random
#    delay, pro-rata round, claims. Writes DEMO.md.
npm run demo

# 4. or the unattended crank rehearsal: two coins, a market, the keeper, then
#    the holders rebuild the rounds and claim. Report in crank/sim-report.md
npm run crank:sim

# 5. the site, pointed at the local validator
(cd web && npm run dev:local)      # http://localhost:3000
```

Tests (localnet):

```bash
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json
npx ts-mocha -p ./tsconfig.json -t 600000 tests/airdrop_escrow.ts  # full flow, 20 tests
npx ts-mocha -p ./tsconfig.json -t 600000 tests/security.ts        # SECURITY_REVIEW findings
npx ts-mocha -p ./tsconfig.json -t 600000 tests/manual_airdrop.ts  # fixed list, brakes, intervention, dead coin
npx ts-node -T indexer/allocate.test.ts                            # allocator unit tests
```

Devnet: `npm run demo -- --devnet` runs the same story against the real
pump.fun devnet program through `HELIUS_RPC_URL` (≈ 1–2 SOL per run; the
throwaway wallets are swept back and the creator's position is sold back at
the end). `DEMO-devnet.md` is the last such run. Keep `patchProvider`
(`tests/pump.ts`) on any provider you build against a load-balanced RPC.

## Try on devnet

The program is deployed on devnet and works against the real pump.fun devnet
program. Five commands from a clean machine (Rust/Anchor toolchain as above,
a Helius devnet key — the public RPC has no Token-2022 `getProgramAccounts`
for the indexer):

```bash
git clone https://github.com/utterson26/escrow-distribution.git && cd escrow-distribution && npm install
anchor idl build -o target/idl/airdrop_escrow.json -t target/types/airdrop_escrow.ts
export HELIUS_RPC_URL='https://devnet.helius-rpc.com/?api-key=YOURS'
solana airdrop 2 -u devnet            # a run spends ≈ 0.5 SOL net; the demo sweeps the rest back
scripts/demo-video.sh && scripts/demo-video.sh start
```

The first `demo-video.sh` call is a dry run: it checks the RPC, the program,
your balance and the config and prints the storyboard without sending
anything. `start` runs the 3–4 minute loop — launch with a 30% lock, three
buyers, fee split, buyback, volume trigger, random delay, snapshot, round,
claims — with an explorer link for every transaction and before/after
balances at every step (`demo-video.log` keeps the links).

Beta note: only keys on the program's publisher allowlist may open rounds
(and only the platform key may shorten the delay window), so the dry run
fails on the "publisher" line for any other wallet. Everything up to the
trigger — `launch`, fee sharing, `collect_fees`, `buyback`, `check_trigger`,
`fire_trigger` — is permissionless and works from any funded wallet; the
twelve-buyer story with a fixed list is `npm run demo -- --devnet`.

## Repository map

| path | what |
|---|---|
| `programs/airdrop_escrow` | the Anchor program |
| `indexer/snapshot.ts` | deterministic holder snapshot + pro-rata allocator; `snapshot` / `verify` / `reproduce` |
| `crank/` | the keeper: fee sweep, buyback, triggers, rounds — once a minute, for every coin ([README](crank/README.md)) |
| `web/` | drop.chain site (Next.js): live coins, coin pages with claims and a share estimator, launch form that signs from a browser wallet, docs, event feed |
| `scripts/` | `localnet.sh`, `demo.ts`, `demo-video.sh` (devnet, 3–4 min, for recording), `deploy-mainnet.sh` (dry-run only for now), `config-admin.ts` (`SQUADS_VAULT=…` exports platform calls for Squads, see `docs/MULTISIG.md`) |
| `docs/` | mainnet checklist, showcase parameters, grant one-pager, hackathon application (`HACKATHON.md`), multisig guide, announcement draft, custom-pair notes |
| `SECURITY_REVIEW.md` | trust model, findings, limitations, audit questions |
| `PROGRESS.md` | running log (Turkish): what is proven, what is pending |

## Status

Devnet: program deployed and exercised end to end (`DEMO-devnet.md`).
Mainnet: not deployed; see `docs/MAINNET_CHECKLIST.md`. Not audited.

## License

MIT — see `LICENSE`.
