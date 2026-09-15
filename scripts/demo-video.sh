#!/usr/bin/env bash
# Screen-recording demo on devnet (real pump.fun devnet program), 3–4 minutes:
#
#   launch (30% lock) → three buyers → collect fees → buyback → volume trigger
#   → random delay → snapshot → round on chain → claims
#
#   scripts/demo-video.sh          dry run: checks prerequisites, prints the
#                                  storyboard, sends nothing
#   scripts/demo-video.sh start    the real thing (≈ 1.3 SOL of devnet SOL
#                                  net; throwaway wallets are swept back)
#
# Needs: HELIUS_RPC_URL (devnet) in ~/.airdrop-launchpad.env or the shell,
# target/idl/airdrop_escrow.json, the default keypair with ≥ 1.5 SOL on devnet
# and on the program's publisher allowlist. PAUSE_MS (default 5000) is the beat
# after every heading and balance table. Output is also written to
# demo-video.log for the video description (explorer links).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
[ -f "$HOME/.airdrop-launchpad.env" ] && . "$HOME/.airdrop-launchpad.env"

MODE="${1:-}"
if [ "$MODE" != "start" ]; then
  if [ -n "$MODE" ]; then
    echo "unknown argument: $MODE (use 'start' to run; no argument = dry run)" >&2
    exit 2
  fi
  echo "dry run — nothing will be sent. Run 'scripts/demo-video.sh start' to record."
  exec npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/demo-video.ts --dry-run
fi

[ -f target/idl/airdrop_escrow.json ] || { echo "target/idl/airdrop_escrow.json missing: anchor idl build -o target/idl/airdrop_escrow.json -t target/types/airdrop_escrow.ts" >&2; exit 1; }
[ -n "${HELIUS_RPC_URL:-}" ] || { echo "HELIUS_RPC_URL is not set" >&2; exit 1; }

exec npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/demo-video.ts 2>&1 | tee demo-video.log
