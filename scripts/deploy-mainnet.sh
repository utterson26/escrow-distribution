#!/usr/bin/env bash
# Mainnet deploy, step by step, every step confirmed by hand.
#
#   ./scripts/deploy-mainnet.sh --dry-run     # prints what it would do, touches nothing
#   ./scripts/deploy-mainnet.sh               # asks before each step
#
# Reads .env.mainnet (see .env.mainnet.example). Never run this without having
# read docs/MAINNET_CHECKLIST.md first.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

ENV_FILE="$HERE/.env.mainnet"
if [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; elif [ "$DRY" = 1 ]; then
  echo "(dry-run) $ENV_FILE yok, .env.mainnet.example ile devam"; . "$HERE/.env.mainnet.example"
else
  echo "HATA: $ENV_FILE yok. .env.mainnet.example'ı kopyala ve doldur."; exit 1
fi
: "${MAINNET_RPC_URL:?}" "${UPGRADE_AUTHORITY_KEYPAIR:?}" "${PLATFORM_AUTHORITY_PUBKEY:?}" "${PLATFORM_FEE_WALLET_PUBKEY:?}"
# The devnet id 5iJy… cannot be used on mainnet: its keypair is lost (PROGRESS.md, 13 Sep). Mainnet gets a
# fresh keypair; MAINNET_PROGRAM_ID must match declare_id! in lib.rs at build time.
: "${MAINNET_PROGRAM_ID:?set MAINNET_PROGRAM_ID (solana-keygen new -o mainnet-program.json; pubkey → declare_id!, Anchor.toml)}"
PROGRAM_ID="$MAINNET_PROGRAM_ID"

step=0
confirm() {
  step=$((step + 1))
  echo; echo "=== Adım $step: $1"
  if [ "$DRY" = 1 ]; then echo "(dry-run) atlandı"; return 1; fi
  read -r -p "Devam? [y/N] " a; [ "$a" = y ]
}
run() { echo "+ $*"; [ "$DRY" = 1 ] || "$@"; }

echo "program      : $PROGRAM_ID"
echo "rpc          : ${MAINNET_RPC_URL%%\?*}"
echo "upgrade auth : $UPGRADE_AUTHORITY_KEYPAIR"
echo "platform     : $PLATFORM_AUTHORITY_PUBKEY"
echo "fee wallet   : $PLATFORM_FEE_WALLET_PUBKEY"
echo "dry-run      : $DRY"

# 0. sanity: the declared id matches, the tree is clean and pushed
grep -q "declare_id!(\"$PROGRAM_ID\")" "$HERE/programs/airdrop_escrow/src/lib.rs" || { echo "declare_id uyuşmuyor"; exit 1; }
if [ -n "$(git -C "$HERE" status --porcelain)" ]; then echo "UYARI: çalışma ağacı kirli; verifiable build commit'e bağlanır"; fi
COMMIT=$(git -C "$HERE" rev-parse HEAD)
echo "commit       : $COMMIT"

# 1. verifiable build (solana-verify runs the build in a pinned docker image so
#    anyone can rebuild and compare the hash with what is on chain)
if confirm "verifiable build (solana-verify build, docker gerekir)"; then
  command -v solana-verify >/dev/null || { echo "solana-verify yok: cargo install solana-verify"; exit 1; }
  run solana-verify build --library-name airdrop_escrow -- --features ""
  run solana-verify get-executable-hash "$HERE/target/deploy/airdrop_escrow.so"
else
  [ "$DRY" = 1 ] && echo "+ solana-verify build --library-name airdrop_escrow"
fi
SO="$HERE/target/deploy/airdrop_escrow.so"
[ -f "$SO" ] && { SIZE=$(stat -c %s "$SO"); echo "binary       : $SIZE bytes"; }

# 2. wallet + cost
if confirm "bakiye ve maliyet kontrolü"; then
  run solana balance -k "$UPGRADE_AUTHORITY_KEYPAIR" --url "$MAINNET_RPC_URL"
  [ -n "${SIZE:-}" ] && run solana rent "$SIZE" --url "$MAINNET_RPC_URL"
  run solana program show "$PROGRAM_ID" --url "$MAINNET_RPC_URL" || echo "(program henüz yok: ilk deploy)"
else
  [ "$DRY" = 1 ] && echo "+ solana balance / solana rent $SIZE / solana program show $PROGRAM_ID"
fi

# 3. deploy (first time: needs the program keypair; upgrade: pubkey is enough)
if confirm "deploy / upgrade (--use-rpc, öncelik ücreti ile)"; then
  if [ -f "${PROGRAM_KEYPAIR:-/nonexistent}" ]; then PID_ARG="$PROGRAM_KEYPAIR"; else PID_ARG="$PROGRAM_ID"; fi
  run solana program deploy "$SO" --program-id "$PID_ARG" \
    --keypair "$UPGRADE_AUTHORITY_KEYPAIR" --upgrade-authority "$UPGRADE_AUTHORITY_KEYPAIR" \
    --url "$MAINNET_RPC_URL" --commitment confirmed --use-rpc --max-sign-attempts 50 \
    --with-compute-unit-price "${PRIORITY_FEE_MICROLAMPORTS:-10000}"
else
  [ "$DRY" = 1 ] && echo "+ solana program deploy $SO --program-id <keypair|$PROGRAM_ID> --use-rpc ..."
fi

# 4. verify: on-chain bytes == build, program id, upgrade authority
if confirm "zincir üstü doğrulama (dump + cmp, authority)"; then
  TMP=$(mktemp -d)
  run solana program dump "$PROGRAM_ID" "$TMP/onchain.so" --url "$MAINNET_RPC_URL"
  if [ "$DRY" = 0 ]; then
    cmp -n "$SIZE" "$TMP/onchain.so" "$SO" && echo "OK: zincirdeki bytecode build ile aynı"
    solana program show "$PROGRAM_ID" --url "$MAINNET_RPC_URL" | tee "$TMP/show.txt"
    AUTH=$(grep Authority "$TMP/show.txt" | awk '{print $2}')
    WANT=$(solana-keygen pubkey "$UPGRADE_AUTHORITY_KEYPAIR")
    [ "$AUTH" = "$WANT" ] && echo "OK: upgrade authority $AUTH" || { echo "HATA: authority $AUTH != $WANT"; exit 1; }
  fi
  command -v solana-verify >/dev/null && run solana-verify verify-from-repo --url "$MAINNET_RPC_URL" \
    --program-id "$PROGRAM_ID" --library-name airdrop_escrow --commit-hash "$COMMIT" \
    "$(git -C "$HERE" remote get-url origin)" || true
else
  [ "$DRY" = 1 ] && echo "+ solana program dump / cmp / solana program show / solana-verify verify-from-repo"
fi

# 5. config: platform authority + fee wallet; migrate if the account predates a field
if confirm "set_platform / migrate_config (upgrade authority imzalar)"; then
  run env ANCHOR_PROVIDER_URL="$MAINNET_RPC_URL" ANCHOR_WALLET="$UPGRADE_AUTHORITY_KEYPAIR" \
    npx ts-node -T --compiler-options '{"module":"commonjs"}' "$HERE/scripts/config-admin.ts" \
    set-platform "$PLATFORM_AUTHORITY_PUBKEY" "$PLATFORM_FEE_WALLET_PUBKEY"
else
  [ "$DRY" = 1 ] && echo "+ scripts/config-admin.ts set-platform $PLATFORM_AUTHORITY_PUBKEY $PLATFORM_FEE_WALLET_PUBKEY"
fi

# 6. hand the upgrade authority to the multisig (last, and only when everything above is green)
if [ -n "${MULTISIG_UPGRADE_AUTHORITY:-}" ]; then
  if confirm "upgrade authority → multisig $MULTISIG_UPGRADE_AUTHORITY (GERİ ALINAMAZ)"; then
    run solana program set-upgrade-authority "$PROGRAM_ID" --new-upgrade-authority "$MULTISIG_UPGRADE_AUTHORITY" \
      --keypair "$UPGRADE_AUTHORITY_KEYPAIR" --url "$MAINNET_RPC_URL" --skip-new-upgrade-authority-signer-check
  else
    [ "$DRY" = 1 ] && echo "+ solana program set-upgrade-authority $PROGRAM_ID --new-upgrade-authority $MULTISIG_UPGRADE_AUTHORITY"
  fi
fi

echo; echo "bitti (dry-run=$DRY). Sonraki: docs/MAINNET_CHECKLIST.md 'deploy sonrası' bölümü."
