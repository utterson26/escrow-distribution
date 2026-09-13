#!/usr/bin/env bash
# Ten-minute crank rehearsal on localnet. Starts the validator if none is
# listening, deploys the v0 build, then runs crank/simulate.ts.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC=http://127.0.0.1:8899

if ! curl -sf -X POST "$RPC" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "validator yok, başlatılıyor (log: $HERE/.localnet/validator.log)"
  mkdir -p "$HERE/.localnet"
  nohup "$HERE/scripts/localnet.sh" > "$HERE/.localnet/validator.log" 2>&1 &
  for _ in $(seq 1 120); do
    curl -sf -X POST "$RPC" -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null && break
    sleep 2
  done
fi

if [ ! -f "$HERE/target/deploy/airdrop_escrow.so" ]; then
  (cd "$HERE/programs/airdrop_escrow" && cargo-build-sbf --arch v0)
fi
# by pubkey: the program keypair is gone, the wallet is the upgrade authority
solana program deploy "$HERE/target/deploy/airdrop_escrow.so" \
  --program-id 5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe \
  --url "$RPC" --commitment confirmed

cd "$HERE"
ANCHOR_PROVIDER_URL=$RPC exec npx ts-node --compiler-options '{"module":"commonjs"}' crank/simulate.ts
