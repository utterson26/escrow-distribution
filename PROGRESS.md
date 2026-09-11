# airdrop_escrow — gece çalışması raporu

Oturum: https://claude.ai/code/session_01W57hFssDx25ikysWKKjgDs
Ağ: **yalnızca devnet**. Cüzdan: `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` (kalan: 3.500902745 SOL)
Program ID: `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`

## Sonuç: 5 adımın 5'i de devnet'te çalışıyor ✅

| # | Adım | Durum |
|---|------|-------|
| 1 | launch — create_v2 + buy_v2 CPI, tek atomik tx | ✅ |
| 2 | collect_creator_fee_v2 CPI (escrow PDA creator) | ✅ |
| 3 | distribute — ağırlıklı pay | ✅ |
| 4 | claim | ✅ |
| 5 | Anchor testleri, devnet'te koşuyor | ✅ 5/5 passing |

## Devnet'te doğrulanabilir imzalar

Test koşusu — coin `CwPUGHhCXrEM3FXAv19ssiy1C4ECftUT9PFiuH9m9Ejm`,
escrow PDA `H62E3DqhLWcZzpk64oLjznRMQ33QSuZg1nVdJcwtp7Kg`:

| Adım | İmza |
|------|------|
| launch | `2ciVyE1XtNe62kTHuyAobeSWFkD5TV6swG2yDBVqJHBmUJwQiHJB7Je9A52FTTuFVvxu39TXh8jzpbLDAhFcPQua` |
| collect_fees | `2JttpNyemmY9KiwVtJRca8aia9tBFe8jaRnJvj7WcqqA5QZ3fLxKpa5AhYQN7Zj5ZfbtzhqaBdta1Ga37Bs5fJb3` |
| distribute | `2GR2cgHvkMTthpzMBQxkUuyUtdTB9Bj5NHkqr1SV12xPZaPpXR6SMKw7KGqZWgqsyYKenk3uT19ZNxngck2Aur9` |
| claim | `oYn4DakkA4Xj5y9ipWrLaERxoRizi44ZGTp1RpstN7jgw1jSMAELeVU5WdyUey6Yy2aZximD5CxX9iyW1U4Z4gp` |

```bash
solana confirm -v <imza> --url devnet
```

### Zincir üstünde doğrulanan gerçekler
- launch tx log sırası: `Launch → CreateV2 → BuyV2 → TransferChecked` — **tek instruction,
  tek tx**, 300.890 CU, tx boyutu 490 bayt (ALT ile).
- `bonding_curve.creator` = `H62E3Dqh…p7Kg` = **escrow PDA** (istenen davranış).
- Bölüşüm: escrow ATA 300.000.000.000 (%30), dev ATA 700.000.000.000 (%70) — escrow_bps=3000.
- collect_fees log: `CollectFees → CollectCreatorFeeV2`; escrow lamports 1.254.760 → 1.257.559
  (+2.799 lamport creator fee).

## Ne çalıştı, nasıl

**1. launch** — `programs/airdrop_escrow/src/lib.rs`
Sıra: `create_v2` CPI (creator = escrow PDA, is_mayhem_mode=false, is_cashback_enabled=false)
→ dev ve escrow için Token-2022 ATA'ları idempotent aç → `buy_v2` CPI (user = dev, dev öder)
→ `escrow_bps` kadarını dev ATA'sından escrow ATA'sına `transfer_checked`.

**2. collect_fees** — `collect_creator_fee_v2` CPI, escrow PDA seed'leriyle imzalı.
Not: bu instruction pump tarafında **permissionless** (COLLECT_CREATOR_FEE.md), yani imza
şart değil; yine de istendiği gibi CPI + PDA imzasıyla yapıldı.

**3. distribute** — ağırlık = `balance × held_secs`, üstüne `sha256(escrow, holder, slot)`
ile [1.0, 2.0) arası jitter. Pay = `pool × w_i / Σw`. Allocation PDA'ları
`["alloc", escrow, holder]`. Dev-only (`escrow.dev` kontrolü).

**4. claim** — holder imzalar, escrow ATA'dan kendi ATA'sına `transfer_checked`,
allocation `claimed=true`.

## Takıldığım / dikkat etmen gereken yerler

1. **ALT zorunlu.** `launch` 35 hesap alıyor; legacy tx 1232 bayt sınırını aşıyor.
   Address Lookup Table + v0 tx ile 490 bayta iniyor. Testte LUT her koşuda kuruluyor.
   `extendLookupTable` de tek tx'e sığmıyor — 18'erli parçalara böldüm.

2. **Public devnet RPC kararsız.** "Blockhash not found" rastgele geliyor;
   `withRetry` sarmalayıcısı eklendi (finalized blockhash + 5 deneme). Kendi RPC'n varsa
   `ANCHOR_PROVIDER_URL` ile geçersiz kıl, testler belirgin şekilde hızlanır.

3. **Anchor 1.2 API farkları** (dokümanda yok, derleyiciden çıkardım):
   `CpiContext::new` ilk argüman olarak `AccountInfo` değil **`Pubkey`** alıyor;
   `anchor_lang::solana_program::hash` yok, `solana-sha256-hasher` ayrı bağımlılık.

4. **ATA'lar `init_if_needed` olamaz.** Coin mint'i `create_v2` CPI'ından önce mevcut
   değil, Anchor account-validation aşamasında mint'i deserialize etmeye çalışıp patlıyor.
   Bu yüzden tüm pump hesapları `UncheckedAccount` ve ATA'lar handler içinde
   `create_associated_token_account_idempotent` ile açılıyor.

5. **`mayhem_token_vault` IDL'de PDA taşımıyor.** COIN_CREATION.md'den çıkardım:
   ATA(sol_vault, mint, Token-2022).

6. **Dust:** distribute 300.000.000.000 havuzdan 299.999.999.998 dağıttı — tamsayı
   bölmesinden 2 base unit artıyor. Escrow'da kalıyor, kayıp değil.

## Bilinçli olarak yapılmayanlar
- **VRF yok** — istendiği gibi sha256 jitter placeholder. Jitter `slot` içerdiği için
  aynı batch'teki tüm holder'lar aynı slot'u kullanıyor; manipüle edilebilir, üretime uygun değil.
- **distribute idempotent değil** — aynı holder'a ikinci kez çağırırsan payı üstüne ekler.
  Gerçek kullanımda bir `distributed` bayrağı gerekir.
- `collect_fees` sonrası escrow'daki SOL'ü çekecek bir instruction yok.
- Holder listesi/ağırlıkları zincir dışından geliyor; program doğrulamıyor.
- Test her koşuda yeni coin basıyor (~0.02 SOL/koşu).

## Çalıştırma
```bash
cd ~/airdrop-launchpad
anchor build && anchor deploy --provider.cluster devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 600000 tests/airdrop_escrow.ts
```
