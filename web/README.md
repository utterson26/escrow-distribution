# drop.chain — web

Dark, single-accent front end for the launchpad. Every number is read live
from the program on devnet — there is no mock data anywhere.

    npm install
    echo 'HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOURS' > .env.local
    npm run dev        # http://localhost:3000

`.env.local` is gitignored; the browser never sees the key. Server components
and API routes read the chain directly, and the wallet talks to the chain
through `/api/rpc`, a same-origin pass-through with a method allowlist.

## Pages

- `/` — hero, how it works, live coin list (current program layout first,
  earlier test builds under a fold), beta status from `Config`.
- `/coin/<mint>` — mode badge (Auto / Manual), locked share of supply, pool
  remaining, a USD market-cap candlestick chart (one-minute candles from
  pump's trade events, migration line, 10 s polling), trigger progress (Auto)
  or the creator's "Distribute now" panel (Manual, dev wallet only),
  distribution rounds with what triggered each, claims (connect a wallet), a
  share estimator, the fixed wallet list when the coin has one, explorer links.
- `/launch` — the creator form. Every share is a share of the 1B supply
  (holder pool, fixed list, what you keep); the form prices the buy that
  delivers them off the curve, computes the bps the program wants, and lets
  you pick the distribution mode (Auto: the rule releases; Manual: only
  `dev_distribute`). Wallet list Merkle root is computed in the browser; the
  preview checks the program's limits live; then three wallet signatures: two
  for a one-off address lookup table (the launch touches 39 accounts) and one
  v0 transaction that creates the coin on pump.fun, buys and locks. Fixed list
  rows are published on chain right after.
- `/feed` — recent events, decoded from the program's own logs.
- `/docs` — FAQ: minimum position, per-wallet cap, milestones, fees, what
  happens when a coin never reaches a milestone.

Pages are rendered from chain state and revalidated every 15 s; chain reads
are memoised in-process for the same window, so a page and its API route share
one `getProgramAccounts` scan.

## API

- `GET /api/escrows`, `GET /api/feed` — the same data the pages show, as JSON.
- `GET /api/claim/<mint>?wallet=&escrow=` — rebuilds every round's snapshot,
  pinned to its slot, and returns proofs only for rounds whose rebuilt root
  matches the one on chain.
- `GET /api/launch-params` — pump's curve parameters and the platform config
  the launch form validates against.
- `POST /api/metadata` — uploads the coin's metadata to pump.fun's IPFS
  endpoint (proxied: it does not answer cross-origin requests).
- `POST /api/rpc` — JSON-RPC pass-through for the browser wallet.
- `GET /api/mcap/<mint>` — the coin's trades (market cap after each, from
  pump's `TradeEvent`s), the curve's graduation flag and the SOL price.
- `GET /api/sol-price` — SOL/USD from Jupiter (CoinGecko fallback), 60 s cache.

## Reading old accounts

Escrow accounts on devnet come from several generations of the program as it
grew, so `decodeEscrow` reads fields in order and stops when the buffer runs
out. Fields a coin predates come back `undefined` instead of as wrong numbers,
and the UI hides those sections. Rounds written by earlier layouts that decode
to nonsense are dropped by `saneRound`.
