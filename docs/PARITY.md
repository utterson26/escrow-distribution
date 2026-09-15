# Parity — Solana ↔ EVM

The Solana program (`programs/airdrop_escrow`) is the reference. The EVM
adapters (Robinhood Chain / Pons, BNB Chain / Four.meme) follow it; this file
lists what the reference has that the adapters still lack, so a port is a
checklist rather than a rediscovery.

| Feature | Solana | EVM |
|---|---|---|
| Lock at launch, holder pool + fixed list, 1% floor, lock cap, pause | ✅ | ✅ |
| Fee sharing → escrow, rate-limited buyback | ✅ | ✅ |
| Volume / milestone triggers, random delay, snapshot + Merkle rounds, claims | ✅ | ✅ |
| **Distribution mode fixed at launch (Auto / Manual)** | ✅ `distribution_mode` on the escrow, validated at `launch`, no setter | ☐ to do |
| **`dev_distribute(amount)`** — Manual only, dev-signed, `amount ≤ pool − pending`, moves nothing, feeds the next round; `DevDistributionTriggered(amount, round_id)` | ✅ | ☐ to do |
| `check_trigger` samples but never arms on a Manual coin | ✅ | ☐ to do |
| Round records `trigger_kind` (volume / milestone / dev); round indexes are sequential (`rounds_opened`) | ✅ | ☐ to do |
| Launch UI states shares of total supply and prices the buy from the curve | ✅ (web) | ☐ adapt to each launchpad's curve |
| Invariant test: no path from the pool to anyone but holders in either mode (`tests/distribution_mode.ts`) | ✅ | ☐ port the suite |

Notes for the port:

- The mode must be immutable after creation and validated to the two values;
  do not add an owner setter "for flexibility".
- `dev_distribute` takes an amount and nothing else — no recipient, no list.
  Its only effect is `pending += amount`; the distribution engine is shared.
- Keep the Auto rule's constants identical (1% volume → 1% release, 2× market
  cap → 5% release) so a coin behaves the same on every chain.
