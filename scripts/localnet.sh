#!/usr/bin/env bash
# Local test validator with the pump.fun world cloned in from devnet.
#
# Everything our program CPIs into has to exist locally: the pump, fee and
# mayhem programs, plus the config accounts they read. Fee recipients and their
# wSOL accounts are cloned too, because buy_v2 writes to them.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER="${LEDGER:-$HERE/.localnet}"
# RESET=0 keeps the existing ledger (pending rounds/claims survive a restart)
RESET="${RESET:-1}"
# Helius if configured, plain devnet otherwise — cloning hits a lot of accounts
[ -f "$HOME/.airdrop-launchpad.env" ] && . "$HOME/.airdrop-launchpad.env"
SRC="${CLONE_URL:-${HELIUS_RPC_URL:-https://api.devnet.solana.com}}"

PROGRAMS=(
  6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P   # pump
  pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ   # pump fees
  MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e   # mayhem
)
ACCOUNTS=(
  4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf  # pump global
  Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1  # pump event authority
  Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y  # global volume accumulator
  TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM   # mint authority
  8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt  # fee config
  13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ  # mayhem global params
  BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s  # mayhem sol vault
  68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg  # fee recipient
  DLP9ADYpdQV4Z4UQDZof7iLHu2qqdzmMPjcAHDGe4jTt  # fee recipient wSOL
  5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD  # buyback fee recipient
  HjQjngTDqoHE6aaGhUqfz9aQ7WZcBRjy5xB8PScLSr8i  # buyback recipient wSOL
)

# 50M shreds ≈ a few GB; the default (200M) filled an 18 GB disk in three hours
args=(--ledger "$LEDGER" --url "$SRC" --quiet --limit-ledger-size 50000000)
[ "$RESET" = 1 ] && args+=(--reset)
for p in "${PROGRAMS[@]}"; do args+=(--clone-upgradeable-program "$p"); done
for a in "${ACCOUNTS[@]}"; do args+=(--clone "$a"); done

echo "ledger : $LEDGER"
echo "cloning from devnet: ${#PROGRAMS[@]} programs, ${#ACCOUNTS[@]} accounts"
exec solana-test-validator "${args[@]}"
