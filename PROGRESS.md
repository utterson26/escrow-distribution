# airdrop_escrow — gece çalışması raporu

Oturum: https://claude.ai/code/session_01W57hFssDx25ikysWKKjgDs
Ağ: **yalnızca devnet**. Cüzdan: `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` (kalan: 4.379386479 SOL)
Program ID: `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`

## Sonuç: 9 adımın 9'u da devnet'te çalışıyor ✅

| # | Adım | Durum |
|---|------|-------|
| 1 | launch — create_v2 + buy_v2 CPI, tek atomik tx | ✅ |
| 2 | collect_creator_fee_v2 CPI (escrow PDA creator) | ✅ |
| 3 | distribute — ağırlıklı pay, **idempotent** | ✅ |
| 4 | claim | ✅ |
| 5 | Anchor testleri, devnet'te koşuyor | ✅ 17/17 passing |
| 6 | buyback — escrow SOL'ünü coin'e çevirir, izinsiz | ✅ |
| 7 | buyback tabanı zincir üstü hesaplanır (%2 slippage) + sandviç testi | ✅ |
| 8 | holder listesi doğrulaması — (c) hibrit, deterministik indexer | ✅ |
| 9 | tetikleyiciler (hacim + kilometre taşı, rastgele gecikme) | ✅ |

## Devnet'te doğrulanabilir imzalar

Son koşu — coin `4NgGpUUwpZXfh2Hvj8EACxw8HdyTMtntvFoKcg2uFx8G`,
escrow PDA `43vJaEY1qfDZ9hDBtD4Ud3HHtJuUya4A4jmaSmbNDvkG`:

| Adım | İmza |
|------|------|
| launch | `3Jx1SdWBLhbosPvCwmFTPo5G5m1FNk48bf1wzbv53PKuwbR7oHCXHibVEQTct41sQRzeYAPxh7aqJvW5qoauxVmc` |
| check_trigger (temel) | `YA3bKj9hLZDp9dAs1g87h8isgiXE5SjTbPy44aMMsshkJCwYiXwBgTwCaqraGC5neohTw4e4P11KkoCCEjoZ2EP` |
| collect_fees | `41sMjntjSUgvZvThejevfbXc64AqrNjT91TKUxTpUhoHwKf1t4xVbZ3H8nX8uxy1bfrCZmRajGoG21duUiQSioGH` |
| buyback (eşik altı, no-op) | `h6Q48hjiLtDV5KwYnWyxmf1ZP5hHfomJKyBHwDng46cG5e5zXvCwehiQar2CnZoNLqkbD9racqe5mmijmnajSHi` |
| buyback (gerçek alım) | `5G1mqheHRDC1UMnR3KjnWvF1xhGBc4XcxWAXScsGqTQiYgmUn79GLvxXduCXfVyUQ25FwS7i7VzujavTwbWm1PxN` |
| check_trigger (hacim → armed) | `zkAmsWavYhLQwMXnBQeWvZFbMThcf61uVUvbY7yrPNdNEXirbApWmqhgKYgWs6QswsdSaKQ4NgiDCLQbKguCYpr` |
| check_trigger (armed iken no-op) | `64NywiXAunYKKdKE8yQ5ZuMv2KGmFSnUzCygJbhJNTSFdu8cmHC6Yv1S2asDCZuEhPiuyraYXko79JgBCKuKhy6Y` |
| fire_trigger (gecikme dolunca) | `SK1g5mrbvgikUqHWn8M4UvCPBgziNbk1CCJoXVkkj4GBuv7dXGfGUhzxUfWFk8M1SKfd1PA2sunUKYPL93D9TRj` |
| open_round | `4dnmW2MGZkWBzpitDDgSu3hUQ8BXWS7tS7KniqohTaBXwzxL2anaztiQUok6ACY3Aw9p7geVfpWEPtoLxRkRa5eM` |
| draw | `XnMZ6XDk9hPhZ34oR6xxJcVSK5uCQWjBykM7vbeh7QjSZAxD2EJxXHbRGqPMJvSgFiQg9U5sXr7obaVDx9nxfGU` |
| claim_prize | `3YcJbKg2BaWWyfp9pwf8gFvex35h3qRYLhiGU7RjSsH1wWZJQvzX6HSmBF3HqJVV9MTB8f9ecLqvFnEtiRg22FqP` |
| check_trigger (kilometre taşı) | `4RAu7bbRpwf5RynDhYTQcjbuqTDtSpWSC41bwJDzUV7hnGsFrzaASfeGyqbBg67DiBAtmPSxvr32x9xTECSPqL3p` |
| fire_trigger (kilometre taşı) | `5gCgTUrNxyAwPpCphrHi53nq8VnPMJduiYuhAbXiwVa43ZgfgRjp7T7XiwQoNwYWUazYxSn4d9qi9pdN1np8ubK4` |

Not: erken çağrı reddi simülasyonda geri döndüğü için zincire imza bırakmaz;
kanıtı yukarıdaki `TriggerArmed` event'i ile `fire_trigger` işleminin slotudur.

```bash
solana confirm -v <imza> --url devnet
```

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
- **Holder doğrulama kanıtı:** 7 cüzdan fonlandı; 1'i her şeyi sattı, 1'i eşiğin
  altında kaldı. Indexer **tam olarak 5** uygun holder buldu, ikisini de eledi.
  8 çekiliş yapıldı, 8 ödül ödendi; aynı çekiliş ikinci kez ödenmedi; ağaçta
  olmayan bir cüzdanın başkasının yaprağıyla yaptığı sahte claim reddedildi.
- **Determinizm kanıtı:** ödüller dağıtıldıktan **sonra** zincirden yeniden
  üretilen kök, dosyadakiyle birebir aynı çıktı:
  `e6c53711c7315062f1cca34c0799dc723686db2f9301f50ad41d954ea79c884a`
- **Slippage tabanı kanıtı:** başarılı alımın `BuybackDone` event'i çözüldü —
  curve'den teklif 50.523.826.939.404, taban (−%2) 49.513.350.400.615, gerçekleşen
  50.404.940.778.743 = teklifin **%99,7647**'si. Yani %2 toleransın yalnızca %0,24'ü kullanıldı.
- **Sandviç kanıtı:** kanonik olmayan iki bonding curve (gerçek ama yabancı bir pump curve'ü
  ve hiç var olmayan bir adres) reddedildi; escrow'un SOL'ü ve tokenı kıl payı oynamadı.
  Ardından **aynı parayla** kanonik curve'le alım geçti — yani ret paradan değil hesaptandı.

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

**6. buyback** — izinsiz. Escrow'un rent-exempt tabanının üstündeki SOL'ü pump'tan
coin almaya çevirip escrow token hesabına ekliyor; alınan token distribute havuzuna
(`escrow.escrowed`) dahil oluyor. `MIN_BUYBACK_LAMPORTS` (0,01 SOL)
altındaysa hata vermeden `Ok(())` dönüyor — keeper'ın zamanlanmış çağrıları
hata yönetmek zorunda kalmasın diye. Eşik argüman değil **program sabiti**: instruction
izinsiz olduğu için çağıran toz miktarlı alım zorlayıp escrow'un SOL'ünü ücrete yakamamalı.

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

### buyback'te iki tasarım kararı

**`buy_exact_quote_in_v2` kullandım, `buy_v2` değil.** İkisi de birebir
aynı 27 hesabı ve aynı bayrakları alıyor, tek fark argümanlar. `buy_v2` girdi olarak
token miktarı ister; elimizde SOL olduğu için pump'ın ücret matematiğini programda yeniden
yazmak gerekirdi ve pump ücretleri değiştirdiğinde sessizce kayardı. `buy_v2`'ye
geçmek isterseniz tek satırlık değişiklik.

**Taban (min_tokens_out) zincir üstünde hesaplanıyor, çağırandan alınmıyor.** Program
`bonding_curve` ve `global` hesaplarını okuyup sabit çarpım
formülüyle beklenen çıktıyı buluyor (ücretler düşülmüş: `fee_basis_points` +
`creator_fee_basis_points` = 100 bps), sonra **%2** (`BUYBACK_SLIPPAGE_BPS`)
tolerans uygulayıp tabanı pump'a geçiriyor. CPI dönüşünde gelen miktarı ayrıca kendisi de
doğruluyor. Ücret modelini gerçek bir devnet alımıyla kalibre ettim: tahmin/gerçek = %99,76,
yani %2 toleransın içinde rahat pay var.

**Rezervleri okumak yeni bir saldırı yüzeyi açıyor.** Taban artık bir hesaptan türediği için,
saldırgan düşük fiyat ima eden sahte bir curve geçirip tabanı düşürebilirdi. Bu yüzden
`bonding_curve` ve `global` Accounts struct'ında pump PDA'larına
`seeds::program` ile sabitlendi. Sandviç testi tam olarak bunu kanıtlıyor.

**Escrow PDA alıcı olamıyor.** Pump, alıcının SOL'ünü System transfer ile çekiyor; System
transfer kaynağın System Program'a ait ve verisiz olmasını şart koşuyor. Escrow PDA veri
tutuyor ve bu programa ait. Bu yüzden araya verisiz bir `["buyer", mint]` PDA'sı
koydum: çağıran SOL'ü öne sürüyor, escrow aynı işlemde geri ödüyor.

## Holder listesi nasıl doğrulanıyor — (c) hibrit

Sorun şuydu: dağıtım listesi dışarıdan geliyordu, yani kime gideceğini biri elle
yazabiliyordu. Çözüm, işi ikiye ayırmak:

**Zincirin bilemeyeceği tek şey dışarıdan geliyor:** "bu kişi ne kadar süredir
tutuyor". Bunu ancak geçmişe bakarak hesaplayabilirsin, o da zincir dışı bir iş.
Indexer bunu hesaplayıp bir özet (Merkle kökü) üretiyor, kök zincire yazılıyor.

**Zincirin bilebileceği her şeyi program kendisi doğruluyor:**
- ödül alacak kişinin **şu anki** bakiyesini kendi okuyor — sıfırsa ödeme yok
- pozisyon değerini curve fiyatından hesaplıyor — 0,05 SOL altındaysa ödeme yok
- token hesabı, claim eden cüzdanın kendi hesabı olmak zorunda (başkasının
  pozisyonunu göstererek eşiği geçemezsin)

**Kazananı kimse seçemiyor:** Kök önce işleniyor (`open_round`), rastgelelik
**sonra** çekiliyor (`draw`) ve en az bir slot beklemek zorunda. Yani kökü
yazan kişi kimin kazanacağını bilemez. Kazanan, ağırlık aralığının çekilen sayıyı
kapsadığını ispatlıyor; program tek tek kontrol ediyor.

**Geriye kalan güven:** Indexer ağırlıkları çarpıtabilir (birinin sırasını
kayırabilir). Yapamayacakları: elinde coin olmayana ödeme yaptırmak, eşiğin
altındakini geçirmek, kazananı seçmek.

## Indexer'ı kendin doğrula

Indexer açık kaynak ve deterministik: çıktısı yalnızca (coin, slot) çiftine ve
zincirin kalıcı geçmişine bağlı. Hiçbir yerde "o anki" hesap durumuna güvenmiyor;
her token hesabının kendi işlem geçmişini o slot'a kadar oynatarak bakiyeyi ve
tutma süresini yeniden kuruyor. Bu yüzden aynı girdiyle herkes aynı kökü üretir.

Üç komut var:

```bash
export HELIUS_RPC_URL="https://devnet.helius-rpc.com/?api-key=<ANAHTARIN>"

# 1) Anlık görüntü üret
npx ts-node --compiler-options '{"module":"commonjs"}' indexer/snapshot.ts \
  snapshot --mint <COIN> --slot <SLOT> --out snapshot.json

# 2) Kök gerçekten bu yapraklardan mı çıkıyor? (ağ gerekmez)
npx ts-node --compiler-options '{"module":"commonjs"}' indexer/snapshot.ts \
  verify --in snapshot.json

# 3) Zincirden bastan üret, dosyayla karşılaştır
npx ts-node --compiler-options '{"module":"commonjs"}' indexer/snapshot.ts \
  reproduce --in snapshot.json
```

`verify` üç şeyi kontrol eder: kök yapraklardan yeniden hesaplanıyor mu,
ağırlıkların toplamı `totalWeight` ile uyuşuyor mu, kümülatif aralıklar
boşluksuz mu. `reproduce` ise zincire gidip her şeyi baştan kurar ve kökü
karşılaştırır — **AYNI** demezse listede oynama var demektir.

Zincire yazılan kökü ise şuradan okursun: `open_round` işleminin
`RoundOpened` kaydında ve `Round` hesabının `root` alanında.
Dosyadaki kök ile bu ikisi aynı olmalı.

### Dışlanan hesaplar
Coin'in token hesaplarının hepsi holder değil: bonding curve'ün kendi hesabı,
mayhem kasası, escrow ve buyer PDA'ları protokol hesabı. Bunlar coin'den
deterministik olarak türetiliyor ve snapshot dosyasındaki `excluded`
alanına yazılıyor, böylece yeniden üretim aynı listeyi kullanır. Bu koşuda dev
cüzdanı da hazine olduğu için elle dışlandı — o da dosyada görünür.

## Tetikleyiciler (adım 9)

Dağıtım artık elle çağrılmıyor. İki koşul var, ikisi de izinsiz kontrol edilir:

- **Hacim:** son dağıtımdan bu yana hacim, piyasa değerinin %1'ine ulaşırsa
  havuzun kalanının **%1'i** serbest kalır.
- **Kilometre taşı:** piyasa değeri son taşın 2 katına çıkarsa havuzun kalanının
  **%5'i**. Taş yalnızca yukarı gider, geri inmez.

İkisi birden olursa kilometre taşı kazanır (daha çok öder).

**Eşik dolunca hemen dağıtılmaz.** `check_trigger` tetikleyiciyi kurar ve slot
hash'inden türetilen **0–60 dk** arası rastgele bir slot belirler. `fire_trigger`
o slottan önce çağrılırsa `TooEarly` ile **reddedilir**; sonra çağrılırsa tutarı
serbest bırakır. Böylece dağıtım anı önceden bilinemez.

**Tutarı artık dev seçemiyor.** `open_round` yalnızca tetikleyicinin serbest
bıraktığı kadarını dağıtabilir; fazlasını istemek reddedilir.

### Önemli sınır: kümülatif hacim zincirde yok
pump, coin başına kümülatif hacim yayınlamıyor. `GlobalVolumeAccumulator`
30 günlük **global** bir pencere (devnet'te tamamen sıfır), bonding curve'de ise
hacim alanı yok — rezervler net, satışta geri düşüyor. Bu yüzden hacmi program
kendisi **örnekleyerek** tutuyor: her `check_trigger` çağrısında rezerv
hareketinin mutlak değerini topluyor. Sonuç: iki kontrol arasında yapılan
gidip-gelme işlemleri eksik sayılır. Kontrol izinsiz ve ucuz olduğu için sık
çağıran biri doğruluğu istediği kadar artırabilir.

### Devnet'te kanıtlananlar
Son tam koşu **17/17**.

- hacim tetikleyicisi kuruldu (`kind=1`), tutar havuzun tam %1'i
- **rastgele gecikme gerçekten uygulandı:** `TriggerArmed` event'i çözüldü —
  `armed_slot=496602909`, `fire_slot=496603034` → **125 slot (~50 sn)**
  gecikme, 150 slotluk pencerenin içinde
- **erken çağrı reddedildi:** hedeften 115 slot önce (slot 496602919) yapılan
  `fire_trigger` çağrısı `TooEarly (0x1780)` ile geri döndü
- gecikme dolunca ateşlendi: işlem slot **496603055** ≥ 496603034, durum Ok,
  1.842.700.303.291 token `pending`'e geçti
- `open_round` yetkilendirilenden fazlasını reddetti
- kilometre taşı kuruldu (`kind=2`), tutar havuzun %5'i; taş
  2,369 → **4,920 SOL**'e çıktı ve sonraki kontrolde **geri gitmedi**

## Bilinçli olarak yapılmayanlar
- **VRF yok** — istendiği gibi sha256 jitter placeholder. Jitter `slot` içerdiği için
  aynı batch'teki tüm holder'lar aynı slot'u kullanıyor; manipüle edilebilir, üretime uygun değil.
- `collect_fees` sonrası escrow'daki SOL'ü çekecek bir instruction yok.
- Holder listesi/ağırlıkları zincir dışından geliyor; program doğrulamıyor.
- **Eşik sabit 0,05 SOL, dolar değil.** Gerçek $10 için fiyat beslemesi (Pyth)
  gerekir; SOL fiyatı oynadıkça dolar karşılığı kayar.
- **Rastgelelik slot hash.** Blok üreticisi sınırlı ölçüde oynayabilir; VRF sonra.
- **Ağırlık `u64`'e sığmalı** (bakiye × slot). Indexer taşarsa kırpıyor; çok uzun
  tutma sürelerinde ölçek küçültmek gerekir.
- **Kapanmış token hesapları gözden kaçar** — ama zaten tamamen satmış demektir,
  eleneceklerdi.
- **Gecikme penceresi dev tarafından daraltılabilir** (`set_delay_window`).
  Dar pencere dağıtım anını yeniden tahmin edilebilir yapar; bu bir test kolaylığı,
  üretimde varsayılan 9.000 slot (60 dk) kalmalı.
- **Hacim örnekleme ile tutuluyor** (yukarıdaki sınır) — kontroller arası
  gidip-gelmeler sayılmaz.
- **Slippage toleransı sabit (%2), escrow başına ayarlanamıyor.** Çok sığ curve'lerde dar,
  çok derinlerde gereksiz geniş kalabilir.
- **Taban, alımın gerçekleştiği curve durumundan türüyor.** Aynı blokta önden koşan biri
  fiyatı oynatırsa program yeni duruma göre teklif verir; tek instruction içinde bunu
  tespit etmenin yolu yok. Gerçek koruma için zincir dışı bir referans fiyat gerekir —
  buradaki taban, kanonik olmayan hesap ve bozuk dolum senaryolarını kapatıyor.
- Test her koşuda yeni coin basıyor (~0.02 SOL/koşu).

8. **Elle lamport aritmetiği CPI'dan ÖNCE yapılamıyor.** `try_borrow_mut_lamports`
   ile escrow'dan düşüp buyer'a eklemek — toplamı korumasına rağmen — runtime'ın CPI
   sınırındaki denge doğrulamasına takılıyor (`sum of account balances ... do not match`).
   Çözüm: tüm CPI'lardan **sonra** yapmak; orada yalnızca üst seviye kontrol kalıyor ve netleşiyor.
   Bunu bulmam uzun sürdü, çünkü araya eklediğim debug bloğu testin `tx.sign([dev])`
   satırını düşürmüştü; araya giren "signature verification" hataları bisect'i geçersiz
   kıldı ve beni yanlış yöne sürükledi — kendi hatam.

9. **Zincir üstü IDL yazımı patlıyor** (`Failed to initialize IDL`). Program
   yükseltmesi sorunsuz; sadece IDL hesabı büyüyen IDL'e göre yeniden boyutlanmıyor.
   Testler yerel `target/idl/airdrop_escrow.json` dosyasını kullandığı için engel
   değil, ama `anchor idl fetch` şu an eski IDL'i döndürür.

10. **Büyük hesabı `Account<>` ile açmak stack'i patlatıyor.** pump'ın
   `Global`'ı 1408 bayt; `Account<Global>` olarak alınca
   `Access violation ... at address 0x300010000` — BPF'in 4 KB stack frame'i
   taşıyor. Çözüm: `Box<Account<...>>` ile heap'e almak. `BondingCurve`
   ve token hesaplarını da aynı şekilde box'ladım.

11. **`getProgramAccounts` Token-2022'de public RPC'de kapalı** — *"excluded from
   account secondary indexes"*. Holder listesi için Helius/Triton gibi bir sağlayıcı
   şart. Anahtar repoda değil, `~/.airdrop-launchpad.env` içinde ve `.gitignore`'da.

12. **Token hesapları 165 değil 170 bayt** (Token-2022 `ImmutableOwner` uzantısı).
   `dataSize: 165` ile tarayan bir indexer sessizce **sıfır** sonuç döndürür;
   bu yüzden coin adresine göre (`memcmp` offset 0) filtreliyoruz.

13. **Coin'de transfer hook yok ve ekleyemeyiz** (mint'i pump yaratıyor). Bu yüzden
   tutma süresi zincir üstü takip edilemiyor; (a) şıkkı bu yüzden elendi.

## Çalıştırma
```bash
cd ~/airdrop-launchpad
anchor build && anchor deploy --provider.cluster devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 600000 tests/airdrop_escrow.ts
```
