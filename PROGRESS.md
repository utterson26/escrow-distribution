# airdrop_escrow — gece çalışması

Oturum: https://claude.ai/code/session_01W57hFssDx25ikysWKKjgDs
Ağ: **yalnızca devnet**. Cüzdan: `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ`

## Durum özeti
| # | Adım | Durum |
|---|------|-------|
| 0 | Ortam + iskelet deploy | ✅ |
| 1 | launch (create_v2 + buy_v2 CPI, atomik) | 🔄 |
| 2 | collect_creator_fee CPI | ⬜ |
| 3 | distribute (ağırlıklı pay) | ⬜ |
| 4 | claim | ⬜ |
| 5 | Devnet testleri | ⬜ |

## Doğrulanmış devnet gerçekleri
- pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` devnet'te **deployed**.
  fee_program `pfeeUxB…jVZ` ve mayhem `MAyhSmzX…MD4e` de deployed.
- pump `global` = `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf`, decode edildi:
  `initialized=true`, **`create_v2_enabled=true`**, `mayhem_mode_enabled=true`,
  `is_cashback_enabled=true` (global), `creator_fee_bps=5`, `fee_bps=95`,
  `buyback_basis_points=1000`, `fee_recipient=68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg`.
- `global_volume_accumulator` = `Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y` (mevcut).
- `event_authority` = `Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1`.
- `collect_creator_fee_v2` **permissionless** (COLLECT_CREATOR_FEE.md) — escrow PDA'nın
  imza atmasına gerek yok; yine de istendiği gibi CPI ile çağrılacak.
- `create_v2` coin'i **Token-2022** (`TokenzQd…PxuEb`) ile basıyor, SPL Token değil.

## Öngörülen risk (adım 1)
create_v2 (16 hesap) + buy_v2 (27 hesap) tek instruction'da ≈ 37 tekil hesap.
Legacy tx 1232 bayt sınırını aşar → **Address Lookup Table (ALT) + v0 tx zorunlu**.
ALT devnet'te kurulacak.

## Bulgular / takıldıklarım
(henüz yok)
