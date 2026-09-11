# airdrop_escrow — gece çalışması raporu

Oturum: https://claude.ai/code/session_01W57hFssDx25ikysWKKjgDs
Ağ: **yalnızca devnet**. Cüzdan: `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` (kalan: 3.500902745 SOL)
Program ID: `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`

## Sonuç: 6 adımın 6'sı da devnet'te çalışıyor ✅

| # | Adım | Durum |
|---|------|-------|
| 1 | launch — create_v2 + buy_v2 CPI, tek atomik tx | ✅ |
| 2 | collect_creator_fee_v2 CPI (escrow PDA creator) | ✅ |
| 3 | distribute — ağırlıklı pay, **idempotent** | ✅ |
| 4 | claim | ✅ |
| 5 | Anchor testleri, devnet'te koşuyor | ✅ 8/8 passing |
| 6 | buyback — escrow SOL'ünü coin'e çevirir, izinsiz | ✅ |

## Devnet'te doğrulanabilir imzalar

Son koşu — coin `4M3oSkABLtMFP4tAGZ6tA8RXoNxJZbp2XuP77Kph7kK6`,
escrow PDA `CdaV3pYmFEiFh8aikp6hDXMoDqQMKjYhV81RPYx2BDnU`:

| Adım | İmza |
|------|------|
| launch | `2JhDiEqdqb1t5gXVFRnEcPcwRF3NLACpKNcV2k1vvQPvgHjXdhMEgfgGJ6XH72SGynJecfjZxxL8FPysQHo8rDuq` |
| collect_fees | `63T5ikHpXbRxaoKQYGcPYos52pxjdoYSjQK6XvVNiFvEcLWDjnw2WmHfeVRqTnQztwuo8B5zNqGZAvqj83AN2QCv` |
| buyback (eşik altı, no-op) | `5v6pzd2NnwpzR5ywBMznU3ymtJBSU4BJ45z3yuU19BrqZcfRYXkd5UJVUVKc5ELPsq17t6MsGS9eQKQ2YK5z9HLr` |
| buyback (gerçek alım) | `5MznxsqdCSr1kZce4UpMv7hxX47jrTQ33b6gQ7Ec1io1LvxujyDtiEW1wCtouobyMgZobipezuS7MUuXyiKnQwM6` |
| distribute | `5Bcp6ABLiXxb7EnMTJk6tEYJ7qxUi57GMbM7o7t8AyfJW8qLDwLHaUfp1MK33dcrxCa6isjLX2tKheYS7ZWPAcvm` |
| distribute (tekrar, no-op) | `iheQnNJx4a5zcnUvEwNWvCZmVt3Ydq9B2J4NDs9bvnkseUDTqv2HG8Z4pcHKmSsco1QukVuSfuqMQnUfWFJgtjj` |
| claim | `5UwuThgQxfUrp9Nu2VXT55ka2v9AvhKHZcQuPQbY6fdp145Ga1Hq2ahhePLoYk7qBSwA29TVDeaeoVTHXKecXAZ6` |

``bash
solana confirm -v <imza> --url devnet
``

### Zincir üstünde doğrulanan gerçekler
- launch tx log sırası: `Launch → CreateV2 → BuyV2 → TransferChecked` — **tek instruction, tek tx**,
  ~300k CU, tx boyutu 490 bayt (ALT ile).
- `bonding_curve.creator` = escrow PDA (istenen davranış).
- Bölüşüm: escrow ATA %30, dev ATA %70 — escrow_bps=3000.
- collect_fees log: `CollectFees → CollectCreatorFeeV2`; escrow lamports +2.799.
- **İdempotentlik kanıtı:** ilk `distribute` 3 adet System `create_account` CPI'ı yapıp 32.644 CU
  harcadı; aynı batch'in tekrarı **hiç CPI yapmadan** 14.562 CU'da erken döndü,
  `allocated` ve `holder_count` değişmedi.
- **buyback kanıtı:** gerçek alım log'u `Buyback → System transfer → BuyExactQuoteInV2`
  (fee program + Token-2022 TransferChecked). Escrow SOL 61.338.839 → 1.336.040
  (= tam rent-exempt taban), escrow token hesabı +50.404.940.778.743.
  Eşik altı çağrı hiç pump CPI'ı yapmadan dönüyor.

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

**İdempotent.** `Allocation.distributed` bayrağı taşıyan holder üç yerde birden atlanıyor:
ağırlık hesabı, payda (`Σw`) ve yazma döngüsü. Payda önemli — atlanan holder'ı sadece
yazma döngüsünde eleseydim, kalanlar hâlâ onun ağırlığını içeren paydayla bölünür ve
havuzun bir kısmı dağıtılmadan kalırdı. Batch'teki herkes zaten dağıtılmışsa instruction
`Ok(())` ile erken dönüyor (hesap yaratmıyor, `allocated`'ı değiştirmiyor).
Böylece hem aynı batch'in tekrarı, hem de kısmen yeni bir batch doğru davranıyor.

**4. claim** — holder imzalar, escrow ATA'dan kendi ATA'sına `transfer_checked`,
allocation `claimed=true`.

## Takıldığım / dikkat etmen gereken yerler

1. **ALT zorunlu.** `launch` 35 hesap alıyor; legacy tx 1232 bayt sınırını aşıyor.
   Address Lookup Table + v0 tx ile 490 bayta iniyor. Testte LUT her koşuda kuruluyor.
   `extendLookupTable` de tek tx'e sığmıyor — 18'erli parçalara böldüm.

2. **Public devnet RPC kararsız.** Kendi verdiği blockhash'te preflight simülasyonunu
   "Blockhash not found" ile reddediyor. `withRetry` (finalized blockhash + 5 deneme) ve
   yardımcı tx'lerde `skipPreflight: true` ile çözüldü — bu tx'ler basit ve deterministik,
   simüle etmek yerine düşen tx onaylanıyor. Kendi RPC'n varsa `ANCHOR_PROVIDER_URL` ile
   geçersiz kıl, testler belirgin şekilde hızlanır.

3. **Anchor 1.2 API farkları** (dokümanda yok, derleyiciden çıkardım):
   `CpiContext::new` ilk argüman olarak `AccountInfo` değil **`Pubkey`** alıyor;
   `anchor_lang::solana_program::hash` yok, `solana-sha256-hasher` ayrı bağımlılık.

4. **ATA'lar `init_if_needed` olamaz.** Coin mint'i `create_v2` CPI'ından önce mevcut
   değil, Anchor account-validation aşamasında mint'i deserialize etmeye çalışıp patlıyor.
   Bu yüzden tüm pump hesapları `UncheckedAccount` ve ATA'lar handler içinde
   `create_associated_token_account_idempotent` ile açılıyor.

5. **`mayhem_token_vault` IDL'de PDA taşımıyor.** COIN_CREATION.md'den çıkardım:
   ATA(sol_vault, mint, Token-2022).

6. **Dust:** distribute havuzdan 1-2 base unit eksik dağıtıyor (tamsayı bölmesi).
   Escrow'da kalıyor, kayıp değil.

7. **`Allocation` layout değişti** (`distributed` alanı eklendi). Bayraktan önceki
   koşulardan kalan allocation hesapları eski düzende; yeni kodla deserialize edilemez.
   Devnet'te her koşu yeni coin bastığı için sorun değil, ama eski bir escrow'a
   dönmeyi planlıyorsan bunu bil.

## Bilinçli olarak yapılmayanlar
- **VRF yok** — istendiği gibi sha256 jitter placeholder. Jitter `slot` içerdiği için
  aynı batch'teki tüm holder'lar aynı slot'u kullanıyor; manipüle edilebilir, üretime uygun değil.
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
