# Web

Dark, minimal front end for the launchpad. Every number is read live from the
program on devnet — there is no mock data anywhere.

    npm install
    echo 'HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOURS' > .env.local
    npm run dev        # http://localhost:3000

`.env.local` is gitignored; the browser never sees the key, because all chain
reads happen in server components and API routes.

## Pages

- `/` — every coin the program has launched: locked airdrop share, dev share,
  pool remaining, market cap, last distribution, progress toward the next trigger.
- `/coin/<mint>` — the same in detail, plus distribution rounds, your own
  claimable shares (connect a wallet), the manual airdrop list when the coin has
  one, and a note on why the dev wallet is excluded from the airdrop.
- `/feed` — recent airdrops, decoded from the program's own event logs.

## Reading old accounts

Escrow accounts on devnet come from several generations of the program as it
grew, so `decodeEscrow` reads fields in order and stops when the buffer runs
out. Fields a coin predates come back `undefined` instead of as wrong numbers,
and the UI hides those sections.

## Claiming

`/api/claim/[mint]` rebuilds the snapshot a round was committed from, pinned to
that round's commit slot, and only offers a claim when the rebuilt Merkle root
matches the root stored on chain. Rounds whose snapshot cannot be reproduced are
reported as such rather than guessed at.
