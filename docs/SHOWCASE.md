# Showcase coin — suggested parameters

The first coin launched through the program on mainnet, by us, to show the
mechanics with real money and real pump.fun fees. Numbers are a proposal; the
launch script takes them as arguments.

| Parameter | Value | Why |
|---|---|---|
| Lock | **30% of the launch buy** | large enough to matter, well under the beta cap |
| — holder pool (`holder_bps`) | 2500 (25%) | what the triggers distribute |
| — fixed list (`manual_bps`) | 500 (5%) | team / early contributors, wallets + percentages fixed at launch, published on chain, claimable by proof |
| Fee mode | **creator fee** (`is_holder_reward = false`) | pump's creator fee flows 90% to the escrow (bought back into the coin) and 10% to the platform; the holder-rewards mode would hand the fee to pump's own holder pool instead |
| Triggers | milestone (2× market cap → 5% of the pool) + volume (1% of market cap traded → 1% of the pool) | both on by default; nothing to configure |
| Distribution delay | default 0–60 min random | do not narrow on mainnet |
| Eligibility | ≥ 0.1 SOL position, held since before the snapshot | program constants |
| Cap | 10% of a round per wallet from 11 holders on | program constant |

## Launch buy in SOL

pump's mainnet curve starts at 30 SOL virtual / 1.073B virtual tokens (1B
supply, 793.1M real). The launch buy is the only SOL the dev puts in; the
locked value is measured from it.

| Launch buy (tokens) | SOL cost (≈) | Locked 30% at launch price | Dev keeps |
|---|---|---|---|
| 50M | 1.47 | 0.44 SOL | 35M |
| 100M | 3.08 | 0.92 SOL | 70M |
| 150M | 4.88 | 1.46 SOL | 105M |

(cost = 30 × 1.073e9 / (1.073e9 − tokens) − 30, plus ~1.25% pump fee; check
against `docs/pump` before the day — the curve parameters are read from pump's
`Global`, not hard-coded.)

Suggestion: **100M tokens (~3.1 SOL)**. 25M go to the holder pool, 5M to the
fixed list, 70M stay with the dev wallet — which the program excludes from
every distribution. The locked value (~0.9 SOL at launch) sits far under the
50 SOL beta cap; the 1%-of-supply floor (10M tokens) is cleared threefold.

## What to expect in the first day

- First `collect_fees` once the creator vault holds ≳ 0.0019 SOL (pump's
  distribution minimum) — at a 0.3% creator fee that is ~0.6 SOL of volume.
- First buyback once the escrow's SOL clears 0.01 SOL; each call spends at
  most 0.5% of the curve's quote reserves, one per slot.
- First volume trigger after 1% of market cap trades since the last check;
  the crank checks every minute. Fires 0–60 minutes later; the crank then
  snapshots, allocates and opens the round; holders claim on the site.
