#!/usr/bin/env bash
# Random traders for one coin on devnet: N throwaway wallets buy and sell at
# random moments (5–30 s apart) for a while, within a SOL budget, then send
# their SOL back to the funder.
#
#   scripts/sim-traders.sh <MINT>                      15 wallets, 15 min, 2 SOL
#   scripts/sim-traders.sh <MINT> --dry-run            print the cast and plan, send nothing
#   scripts/sim-traders.sh <MINT> --wallets 20 --minutes 30 --budget 2
#   scripts/sim-traders.sh <MINT> --sell-back          sell every position back before sweeping
#   scripts/sim-traders.sh <MINT> --sweep [--sell-back] only sweep the wallets of an earlier run
#   scripts/sim-traders.sh <MINT> --delay-window 0     leave the coin's random-delay window alone
#
# Personas: holders buy and keep, traders buy and sell slices, early sellers
# dump everything part-way through. The default keeps positions at the end so
# the wallets stay eligible for rounds; keys are saved to sim-wallets-<mint>.json.
#
# Needs: HELIUS_RPC_URL (devnet) in ~/.airdrop-launchpad.env or the shell, the
# default keypair with budget + 0.1 SOL on devnet, target/idl/airdrop_escrow.json.
# When the keypair is the platform authority the coin's delay window is
# shortened to ~40 s (--delay-window, default 100 slots) so releases land while
# you watch; the crank must be running for triggers to fire and rounds to open:
#   RPC_URL=$HELIUS_RPC_URL npm run crank
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
[ -f "$HOME/.airdrop-launchpad.env" ] && . "$HOME/.airdrop-launchpad.env"
[ $# -ge 1 ] || { sed -n 2,20p "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ -f target/idl/airdrop_escrow.json ] || { echo "target/idl/airdrop_escrow.json missing: anchor idl build -o target/idl/airdrop_escrow.json -t target/types/airdrop_escrow.ts" >&2; exit 1; }
[ -n "${HELIUS_RPC_URL:-}" ] || { echo "HELIUS_RPC_URL is not set" >&2; exit 1; }
exec npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/sim-traders.ts "$@"
