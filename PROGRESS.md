# airdrop_escrow — gece çalışması raporu

Oturum: https://claude.ai/code/session_01W57hFssDx25ikysWKKjgDs
Ağ: **yalnızca devnet**. Cüzdan: `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` (kalan: 1.096772598 SOL)
Program ID: `5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe`

## Tasarım kararı: dev cüzdanı airdrop'a katılmaz

Coin'i basan ve escrow'u kuran **dev cüzdanı, dağıtımlarda holder sayılmaz.**
Snapshot alınırken hazine olarak elenir ve anlık görüntü dosyasındaki
`excluded` alanına yazılır, böylece anlık görüntüyü yeniden üreten
herkes aynı elemeyi uygular.

Sebebi: dev, launch anında arzın büyük bir kısmını elinde tutuyor (bu koşuda
%70'i). Ağırlık `bakiye × tutma süresi` olduğu için dev cüzdanı dahil
edilseydi çekilişlerin neredeyse tamamını kazanır, airdrop anlamsızlaşırdı.
Aynı gerekçeyle protokolün kendi hesapları da elenir: bonding curve, mayhem
kasası, escrow PDA'sı ve buyer PDA'sı. Bunlar coin adresinden deterministik
olarak türetilir.

Not: eleme **anlık görüntü tarafında** yapılır, zincirde zorlanmaz. Yani bu bir
politika kararıdır, kriptografik bir garanti değil — ama `excluded`
listesi anlık görüntüde yazılı olduğu için herkes denetleyebilir.

## Sonuç: 21 adım — 10'u devnet'te, 11–21 localnet'te doğrulandı; devnet güncellemesi fon bekliyor 🟡

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
| 10 | buyback parçalama (çağrı başına %0,5) | ✅ |
| 11 | manuel airdrop modu | 🟡 kod tamam, devnet'e çıkamadı |
| 12 | Switchboard rastgelelik | 🟡 uyumlu, entegre edilmedi |
| 13 | localnet (pump klonlu test ağı) | ✅ |
| 14 | manuel airdrop + müdahale + ölü coin — localnet'te | ✅ 7/7 |
| 15 | crank botu (check/buyback/fire, izinsiz keeper) — localnet 10 dk simülasyon | ✅ 8/8 |
| 16 | crank uçtan uca: fire → snapshot → open_round → draw → claim — localnet 5 dk | ✅ 12/12 |
| 17 | web localnet'te, Phantom ile claim | ✅ çalışıyor |
| 18 | web: coin adı/sembolü, "how it works", ağ rozeti | ✅ |
| 19 | Switchboard on-demand localnet'te | ❌ oracle gerektiriyor, slot hash kaldı (not aşağıda) |
| 20 | güvenlik öz-denetimi: 5 bulgu düzeltildi + 4 regresyon testi | ✅ `SECURITY_REVIEW.md` |
| 21 | README (10 dakikada localnet) | ✅ |

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

## Adım 10 — buyback parçalama ✅

Tek büyük alım yerine her çağrı, curve'ün SOL rezervinin en fazla **%0,5'ini**
harcıyor; kalan escrow'da bekliyor ve sonraki çağrıyla alınıyor. Amaç sandviç
çekiciliğini düşürmek: küçük alımı önden koşmak saldırgana kâr bırakmıyor.

Eşik ile sınır **farklı şeylere** uygulanıyor, yoksa mod hiç çalışmazdı:
0,01 SOL eşiği **biriken paraya**, %0,5 sınırı **tek çağrıda harcanana**.
(Test coin'inde %0,5 ≈ 0,0075 SOL, yani eşiğin altında; ikisi de aynı sayıya
uygulansaydı alım hiç olmazdı.)

Devnet kanıtı: **7.971.768 lamport harcandı, 43.811.293 sonraki çağrıya
bırakıldı**; ikinci çağrı +3.290.872.817.749 token aldı.

**Yan etki — bilmen gereken:** buyback artık piyasayı tek başına oynatamıyor.
Kilometre taşı testi eskiden fiyatı bizim buyback'imizle itiyordu; %0,5 sınırıyla
piyasa değerini 2 katına çıkarmak ~70 çağrı alırdı. Doğrusu da bu: teste
doğrudan pump alımı eklendi, piyasa bağımsız hareket ediyor.

## Adım 11 — manuel airdrop modu 🟡

`launch` iki yeni argüman alıyor: `manual_root` ve `manual_bps`.
Dev payının `manual_bps` kadarı ayrı bir PDA'nın token hesabına ayrılıyor;
her cüzdan kendi payını `claim_manual` ile çekiyor.

**Liste neden kök olarak işleniyor:** 50 cüzdan + yüzde ≈ 1.700 bayt. launch
işlemi ALT ile bile 1.232 baytlık sınıra sığmıyor. Kök işlemek listeyi yine
**launch anında** kilitliyor — sonradan değiştirilemez, kimse kendini ekleyemez.
Tek fark, listenin kendisi zincirde durmuyor; iddia eden kendi satırını ispatlıyor.

Kök tek başına listenin %100'ü geçmediğini ispatlayamadığı için üst sınır claim
sırasında tutuluyor: `manual_claimed_bps` 10.000'i aşamıyor. Index
`MAX_MANUAL_ENTRIES` (50) ile sınırlı.

30 günlük kilit launch'ta yazılıyor (`manual_unlock_ts` + `manual_locked`).
İstediğin gibi **müdahale instruction'ı yok** — şimdilik sadece zaman kilidi ve bayrak.

**Durum:** `cargo check` temiz, testler yazıldı (`tests/manual_airdrop.ts`:
liste launch'ta kilitlenir, 6 cüzdan kendi payını çeker, ikinci claim reddedilir,
listede olmayan ve yüzdesini büyüten denemeler reddedilir). **Devnet'e çıkamadı:**
deploy buffer'ı için ~1,97 SOL gerekiyor, cüzdanda 1,10 SOL var.

## Adım 12 — Switchboard rastgelelik 🟡

Devnet'te üç Switchboard programı da **deployed**:
`SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv`,
`Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2`,
`SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f`.

Asıl risk crate uyumluluğuydu: `switchboard-on-demand 0.13.0` paketi
`anchor-lang >=0.31.0` istiyor, bizde 1.2.0 var ve 0.31 → 1.x geçişinde
kırıcı değişiklikler olmuştu. **Denedim: temiz derleniyor.** Yani engel yok.

Entegre etmedim çünkü deploy gerektiriyor ve fon yok. Gereken adımlar:
Randomness hesabı açmak (rent), devnet oracle queue'ya bağlanmak, commit → oracle
reveal → programın okuması, ve reveal'ı tetikleyecek bir zincir dışı crank.
Slot hash şimdilik yerinde duruyor.

## Adım 13 — localnet 🟡

`scripts/localnet.sh` devnet'ten pump dünyasını klonlayıp yerel bir test ağı
kuruyor: pump, fee ve mayhem programları (`--clone-upgradeable-program`) ve
bunların okuduğu 11 hesap — global, fee_config, volume accumulator, mint authority,
mayhem PDA'ları, ücret alıcıları ve wSOL hesapları. Token-2022 validator'da yerleşik.
Anchor.toml'a `[programs.localnet]` profili eklendi.

Klonlamanın doğru çalıştığını doğruladım: hesap boyutları devnet'le birebir aynı
(global 1054, fee_config 4073, volume accumulator 600 bayt), programlar
`Executable: true` olarak geldi, program yerelde deploy edildi ve testler koştu.

### Localnet iki gerçek hata yakaladı — ikisi de devnet'te de patlardı

**1. Stack taşması.** `launch` çağrısı `Access violation in stack frame 5`
ile ölüyordu. Sebep: `Escrow` yeni alanlarla ~300 bayta çıkmıştı ve
`Account<Escrow>` onu stack'te taşıyordu; üstüne pump'ın `CreateV2` (16
hesap) ve `BuyV2` (27 hesap) CPI yapıları aynı fonksiyon kapsamında kurulunca
4 KB'lık BPF frame'i aşıyordu. Çözüm: `Escrow` ve `Round` hesapları
`Box`'landı (11 + 3 yerde), iki pump CPI'ı da `#[inline(never)]` ayrı
fonksiyonlara taşındı ki her biri kendi frame'ini alsın.

**2. Yanlış mimariyle derleme.** `anchor build` **SBPFv3** üretiyor
(`e_flags=3`) ama bu özellik **devnet'te de kapalı**
(`SIMD-0178/0179/0189: inactive`). Yani fon gelip deploy etseydik
`ELF error: Detected sbpf_version required by the executable which are not enabled`
alacaktık ve SOL boşa gidecekti. Doğru komut:

```bash
cd programs/airdrop_escrow && cargo-build-sbf --arch v0
```

Bu bilgiyle devnet maliyeti de güncellendi: v0 çıktısı 531.096 bayt, buffer rent'i
**2,70 SOL** (v3'teki 2,33 değil), üstüne program alanını genişletme.

### Validator neden ayakta kalmıyordu — teşhisim yanlıştı
Önce belleğe (3,9 GB RAM, dolu swap) yordum. Gerçek sebep **süreçlerin tool çağrısı
bitince toplanması**; ilk koşuda da kendi koyduğum `timeout 180` validator'ı
öldürüyordu, ben onu "slot üretmeyi bıraktı" diye okumuştum. Kalıcı arka plan
mekanizmasıyla başlatılınca sorunsuz çalışıyor (~1,3 GB kullanıyor, makinede yer var).

### Yerel ağa özgü iki ayar
- **Lookup table beklemesi.** Devnet'te 2 saniye yetiyordu; yerelde tablonun tüm
  adresleriyle görünür olmasını yoklamak gerekiyor. Test artık iki ortamda da yokluyor.
- **v0 işlemler provider üzerinden gönderiliyor.** Bu validator'ın RPC'sindeki
  ileti servisi TPU'ya hiçbir şey göndermiyor (`successfully_sent=0i`), bu yüzden
  `conn.sendTransaction` ile atılan lookup-table'lı işlem sessizce düşüyordu.
  `provider.sendAndConfirm` yolu çalışıyor.

## Adım 14 — manuel airdrop localnet'te doğrulandı ✅

```
7 passing (44s)
```

- liste launch anında kilitleniyor: kök zincire yazıldı, ayrılan pay 7.000.000 token
  (dev payının %50'si), 30 günlük kilit `2026-10-11` olarak kaydedildi
- 6 cüzdanın her biri kendi payını çekti, toplam **%100** (`claimed_bps=10000`)
- aynı cüzdanın ikinci claim'i reddedildi
- listede olmayan bir cüzdanın başkasının satırıyla denemesi ve gerçek bir üyenin
  yüzdesini büyütmesi reddedildi (ikisi de ispatı bozuyor)
- **liste yayını:** 6 satır zincire yazıldı, satırlar log'dan geri okunup ağaç
  yeniden kuruldu ve launch'ta işlenen kökle **tuttu**
- **müdahale:** kilit içindeyken ve platform dışından çağrıldığında reddedildi
- **ölü coin:** 7 sessiz günün ardından bayrak açıldı (`dead=true`,
  `low_volume_days=7`), ardından havuz platform yetkilisince dev cüzdanına
  taşındı (6.000.000.000.000 token)

Platform yetkilisi dev'den farklı bir anahtar (`5iw2oj8jgetU…` vs
`4RycArC9Gap3…`) — yani yetki ayrımı gerçekten sınanmış oldu.

## Adım 15 — crank botu ✅ (localnet, 10 dk, 8/8)

`crank/crank.ts`: indexer'ın yanında duran küçük keeper. Dakikada bir
programın çıkardığı **her coin'i** (`getProgramAccounts`, escrow
discriminator + güncel boyut) tarar ve sırayla `collect_fees` → `buyback` →
`check_trigger` → `fire_trigger` çağırır. Hepsi izinsiz; cüzdan yalnızca
ücret öder. Zincirdeki eşikleri **kararı vermek için değil, boşa ücret
ödememek için** önden kontrol eder: buyback yalnızca harcanabilir SOL ≥ 0,01
ise (yoksa `BuybackSkipped` duymak için para ödenmez), fire yalnızca slot ≥
`fire_slot` ise (erken çağrı `TooEarly` yer, o yüzden hiç denenmez).
Çalıştırma: `npm run crank` (`RPC_URL`, `CRANK_KEYPAIR`, `CRANK_INTERVAL_MS`,
`CRANK_LOG`; cron için `--once`). Detay `crank/README.md`.

### Simülasyon — `npm run crank:sim` → `crank/sim-report.md`

`crank/simulate.ts` iki coin çıkarıyor, crank'i **ayrı süreç + ayrı cüzdanla**
başlatıyor (dev değil: `2y2Z72iZ…`), üçüncü bir trader cüzdanı 10 dakika
piyasa oynatıyor. Alım boyutları gerçek piyasa değerinden türetildi (localnet'te
pump'ın klonlanmış config'iyle taze coin ≈ 1,8 SOL mcap):
HOT her 15 sn mcap'in %1,5'i, SLOW her 40 sn %0,25'i; 200. saniyede
escrow'a 0,05 SOL bağış, 330. saniyede mcap'i 2'ye katlayan balina alımı.

Koşu sonrası crank kaydı beklenenle karşılaştırıldı — **8/8**:

| Kontrol | Sonuç |
|---|---|
| her fire `fire_slot`'tan sonra indi | 8 fire, hepsinde `tx_slot ≥ fire_slot` (ör. HOT hacim 1693 ≥ 1577, milestone 2266 ≥ 2208) |
| erken çağrı yok | 7 "bekle" kararı, 0 `TooEarly` |
| kurulan her tetikleyici ateşlendi | 7 armed / 8 fired (fazlası önceki koşudan kalan bir milestone) |
| hacim eşiği ayırt ediyor | HOT tick 2'de, SLOW tick 4'te kuruldu |
| bağış → buyback | 4 buyback, toplam 38,1M lamport, 28,8T token; her çağrı %0,5 sınırında kaldı, kalan sonraki tick'e devretti |
| balina → milestone | tick 6'da `kind=milestone`, havuzun %5'i (4,93T token) |
| hata | 0 |
| atlanan tick | 0 / 11 |

Zincir üstü gerçekler: crank cüzdanı 10 dakikada **0,0023 SOL** harcadı
(60 işlem, 4 coin). Creator ücreti gerçekten biriktikçe süpürüldü (launch alımından
1.164.295 lamport, sonra 1,2–1,3M'lik dilimler) ve buyback bunu coine çevirdi.
HOT, her fire'dan sonra bir sonraki tick'te yeniden kuruldu — %1 hacim eşiği
bu alım temposunda her dakika doluyor; SLOW'un her kurulumu ~4 alım (=%1) aldı.

**Yan bulgu — crank tüm coinleri gerçekten tarıyor:** localnet'te önceki
2 dakikalık prova koşusundan kalan iki coin de vardı; crank ilk tick'te
onlardan birinde yarım kalmış milestone tetikleyicisini (fire_slot 1202) slot
1404'te ateşledi. Rapor bu yüzden 4 coin gösteriyor.

Bilinen sınırlar: (1) Birden fazla crank aynı anda çalışırsa aynı işlemi iki
kez denerler; ikincisi `NotArmed`/no-op ile döner, zarar yok ama ücret gider.
(2) `open_round`/`draw` crank'te yok — kök indexer'dan geliyor, o ayrı iş.
(3) Legacy tx kullanıyor; buyback 30 hesapla 1232 baytın altında kalıyor,
ama pump hesap eklerse ALT gerekir.

## Seni bekleyen claim (Phantom, localnet)

Cüzdan `2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K` — localnet'te 2 SOL ve her
coin'den 60M token var; **7 çekiliş** claim edilmeden bırakıldı (güvenlik
düzeltmelerinden sonraki koşu, 08:05 UTC; eski koşunun round'ları yeni leaf
formatıyla geçersiz, onları kullanma):

| Coin | Sayfa | Çekilişler | Ödül |
|---|---|---|---|
| **Crank Hot (HOT)** `FG2F…B3pb` | http://localhost:3000/coin/FG2FGH2yQbXMwGhyyfb7uKotQiJvD7YMRgagFtnCB3pb | round 0 draw 5, 7; round 1 draw 7 | 2 × 116,2B + 602,8B token |
| **Crank Slow (SLOW)** `LXEG…DPsq` | http://localhost:3000/coin/LXEGQSXWEirUBVukL2thfqf8RkV2UGi2VNGNDoYDPsq | round 0 draw 1, 3, 6, 7 | 4 × 112,5B token |

`/api/claim` ikisini de görüyor (`reproducible 2/2`, `1/1`). **Dikkat (F4):**
claim, snapshot'taki 60M token'ı hâlâ tutmanı şart koşar; önce satarsan
`HoldingBelowSnapshot` alırsın.

**12 Eylül 17:00 — disk dolunca (ledger 18 GB + 666 MB validator log) makine
kapandı; validator `RESET=0 ./scripts/localnet.sh` ile eski ledger'dan geri
kaldırıldı** (bozuk 0 baytlık 22900 snapshot'ı silindi, 22800'den yüklendi).
Tek doğrulama: `/api/claim` iki coin için de aynı 7 çekilişi veriyor
(HOT r0d5, r0d7, r1d7; SLOW r0d1, d3, d6, d7), cüzdan 4 SOL. Web
http://localhost:3000 ayakta. `localnet.sh` artık `--limit-ledger-size 50000000`
kullanıyor ve `RESET=0` ile mevcut ledger'ı korur.

### HOT'un 3 çekilişi Phantom'la claim edildi ✅ (12 Eylül 13:29–13:32 UTC)

Üçü de `2xfs…q36K` imzalı, `ClaimPrize → TransferChecked`, hata yok, 80.000 lamport ücret:

| Çekiliş | Slot | İmza | Token |
|---|---|---|---|
| round 0 draw 5 | 24259 | `2kwXG5RHaVZ4kNm4KGE92jp2n8HRjLSehoBn5a5yp6pMLKPgLKHLKQAoroVgozgWsMQvD8SKkFpGoeCtU5B2T48n` | +116.247.042.419 |
| round 0 draw 7 | 24360 | `1PefWuz3QAJKhjaE7AMyHm7kScP6MPW6aTSNntbaQEbhixZdpjrEhrSbW2L4c7tQe17Y8apPgz6Ep9h1BFmHTSs` | +116.247.042.419 |
| round 1 draw 7 | 24407 | `2kngYVcGdbXZBK2zpXeu39ZCdxqpvWazEJzUwAyprJCkmUkhNwZwwWYuSGVRz41Tckh9nsMyiFizTgNxn9FR1ZNA` | +602.815.006.333 |

HOT bakiyesi 60.000.000.000.000 → 60.835.309.091.171 (toplam +835.309.091.171 =
üç ödülün tamı). Escrow `claimed` = `allocated` = 5.752.496.390.016, yani HOT'ta
dağıtılan her şey alındı. `/api/claim` HOT için artık boş, SLOW'un 4 çekilişi
(round 0 draw 1, 3, 6, 7) hâlâ bekliyor.

Validator `--reset` ile yeniden başlatılırsa bunlar silinir; o zaman
`DEMO_WALLET=2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K npm run crank:sim` ile
yeniden üret. Phantom ayarı: `crank/README.md` → "Phantom ile localnet".
Port kontrolü yapıldı: Windows'tan `localhost:8899/health` → `ok`; 0 SOL
görünüyorsa Phantom'daki seçili hesap/ağ meselesi, ağ değil.

## Adım 16 — crank uçtan uca: tetikten claim'e kimse dokunmadan ✅ (12/12)

Crank artık fire'dan sonra `pending > 0` gördüğünde **indexer'la snapshot alır,
kökü `open_round` ile yazar ve bir slot sonra `draw` çağırır**. Ayrıca her
tick'te çekilişi yapılmamış round varsa (önceki tick çökmüş ya da dev elle
açmış) onu da çeker. Snapshot dosyası `crank/snapshots/<mint>-<round>.json`
olarak kalır (gitignore'da).

### İki program değişikliği (localnet'e deploy edildi, devnet bekliyor)

1. **`open_round` imzacısı `publisher` = dev *veya* platform yetkilisi.**
   Eskiden yalnızca dev'di; crank kendi cüzdanıyla imzaladığı için kökü
   yazamazdı. Platform zaten launch'ta yazılan bir yetki (`escrow.platform`,
   müdahale için kullanılıyor); crank'i platform çalıştırır. Kök güven noktası
   olduğu için bu adım **izinsiz yapılmadı** — herkes kök yazabilseydi kendi
   listesini yazıp `pending`'in tamamını alabilirdi. Crank'in cüzdanı ikisinden
   biri değilse adımı atlar ve loglar (`not dev or platform`); simülasyonda
   önceki koşulardan kalan 4 coin için tam olarak bu görüldü.
2. **`Round.snapshot_slot` eklendi**, `open_round` argümanı. Web eskiden
   commit slot'undan geriye `{0,2,5,10,20,40}` slot deneyerek kökü tutturmaya
   çalışıyordu; ağırlık `bakiye × slot` olduğu için her slot farklı kök
   verir ve open_round'un indiği slot ile snapshot slotu arasındaki fark
   listede yoksa round "opaque" kalıyordu. Şimdi snapshot slotu zincirde;
   web ve simülasyon doğrudan o slottan yeniden üretiyor. Alan `Round`'un
   sonuna eklendi, eski round'lar (devnet) hâlâ çözülüyor (web'de
   `snapshotSlot` yoksa eski geri yürüme yöntemi kalıyor).

Ayrıca **indexer dev cüzdanını otomatik eler:** `snapshot()` escrow hesabından
`dev`'i okuyup `excluded`'a ekliyor. Eskiden `--exclude` ile elle veriliyordu ve
web'in yeniden üretimi bunu bilmediği için kök tutmazdı. Politika aynı
(PROGRESS'in başındaki karar), artık zincirden türetiliyor.

### Simülasyon (5 dk, 60 sn tick, 8 çekiliş/round)
İki coin (platform = crank cüzdanı), trader + 2 sabit holder. Sonuç 12/12:

| Kontrol | Sonuç |
|---|---|
| fire'lar `fire_slot` sonrası | 3/3 (HOT hacim 5179≥5064, SLOW hacim 5454≥5393, HOT milestone 5464≥5396) |
| erken çağrı | 0 TooEarly |
| SLOW HOT'tan sonra kuruldu | HOT tick 2, SLOW tick 4 |
| bağış → buyback | 3 buyback |
| balina → milestone | tick 4, havuzun %5'i |
| **her fire'dan sonra snapshot + open_round** | 3 round: HOT#0 8×116,2B, SLOW#0 8×112,5B, HOT#1 8×602,8B token |
| **her round çekildi** | 3/3, commit'ten 1–3 slot sonra |
| **snapshot `snapshot_slot`'tan yeniden üretildi, kök tuttu** | 3/3 |
| **kazananlar claim etti** | **24/24 çekiliş ödendi**, her ödeme tam `prize` kadar |
| hata / atlanan tick | 0 / 0 |

Uçtan uca zincir: trade → check_trigger (armed) → fire (pending) →
snapshot → open_round (kök + slot) → draw (seed) → holder kökü yeniden kurar,
kazandığı çekilişleri ispatlar → claim_prize öder. Arada insan yok.

## Adım 17 — web localnet'te, Phantom ile claim ✅

- Tarayıcı tarafı RPC'si `NEXT_PUBLIC_RPC_URL` ile ayarlanabilir (varsayılan
  devnet). Sunucu tarafı zaten `HELIUS_RPC_URL`. `cd web && npm run dev:local`
  ikisini de `http://127.0.0.1:8899`'a çevirip 3000'de açar.
- `/api/claim/<mint>` crank'in açtığı round'u `snapshot_slot`'tan yeniden
  üretip (`reproducible: 1`) demo cüzdanın kazandığı çekilişleri listeledi.
- `DEMO_WALLET=<Phantom adresi> npm run crank:sim`: o cüzdan da holder olur
  (2 SOL airdrop + dev'den 60M token/coin) ve kazandığı çekilişler claim
  edilmeden bırakılır; web'de Phantom'la claim edilir. Phantom ayarı:
  `crank/README.md` → "Phantom ile localnet".

## Adım 19 — Switchboard localnet'te: yapılamadı, slot hash kaldı ❌

Denendi, 30 dk sınırında bırakıldı. Sebep yapısal: Switchboard on-demand'da
`reveal`'i **oracle** yapar — commit'teki `seed_slot`'un slot hash'ini kendi
izlediği zincirden okur, imzalar; Switchboard programı bu hash'i zincirdeki
SlotHashes sysvar'ıyla karşılaştırır. Yerel validator'ı izleyen bir oracle
yok, dolayısıyla reveal asla gelmez (crate `switchboard-on-demand 0.13.0`,
`RandomnessAccountData::get_value` ayrıca `reveal_slot == clock.slot` ister,
yani reveal ile `draw` aynı işlemde olmalı). "Localnet'te kendi altyapısını
kurar" denen `solana-randomness-service` eski SGX servisi, on-demand değil.
Dokümanda localnet yok, yalnızca devnet.

Devnet'e geçince yol: `Randomness.create` (rent) → `commitIx` ile `open_round`
aynı tx'te → crank oracle'dan `revealIx` alıp `draw` ile aynı tx'te gönderir;
program `seed_slot ≥ round.draw_slot` ve `get_value(clock.slot)` kontrol eder.
Bu arada F3 (aşağıda) slot hash'in kullanıcı tarafından grind edilmesini
kapattı; kalan tek etki `draw_slot`'un lideri.

## Adım 20 — güvenlik öz-denetimi ✅ (`SECURITY_REVIEW.md`)

Program baştan sona okundu. Düzeltilen bulgular (her biri `tests/security.ts`'de
regresyon testiyle, 4/4; `manual_airdrop.ts` 7/7 yeniden koştu):

| # | Önem | Bulgu | Düzeltme |
|---|---|---|---|
| F1 | YÜKSEK | `platform` yetkilisini **launch eden seçiyordu** → dev kendini platform yapıp müdahale edebilirdi | `Config` PDA; yalnızca **program upgrade authority** `set_platform` ile yazar; launch kopyalar, argüman kalktı |
| F2 | YÜKSEK | `set_day_window`/`set_delay_window` dev'deydi → 2 sn'lik günle 14 saniyede "ölü coin", F1 ile birleşince havuz dev'e | iki knob da **platform-only** |
| F3 | ORTA | `draw` "en son slot hash"i kullanıyordu → herkes uygun slotu bekleyip çağırarak seed'i seçebilirdi | `draw_slot = commit + 2` commit'te sabitlenir; seed o slotun hash'i, ne zaman çağrıldığı fark etmez; pencere kaçarsa yeniden hedefleme |
| F4 | ORTA | snapshot sonrası dump: claim yalnızca "hâlâ ≥0,05 SOL" istiyordu | leaf'e `balance` girdi; claim `held_now ≥ balance × CLAIM_HOLD_BPS/10000` (şu an %100) — **politika sabiti, sen karar ver** |
| F5 | DÜŞÜK | curve rezervine bölme | `EmptyCurve` guard |

Program localnet'e deploy edildi; **devnet'te yok**. Leaf formatı ve `Round`
düzeni değiştiği için eski round'lar/snapshot'lar geçersiz (devnet'te sıfırdan
koşulacak). Doğrulama koşusu: `DEMO_WALLET` ile tek sim, 12/12, 17/24 claim +
7 çekiliş Phantom'a bırakıldı.

## Bundan sonra
Crank simülasyonu tek komut: `npm run crank:sim` (validator yoksa başlatır, deploy eder).
Web'i localnet'e bağlamak: `cd web && npm run dev:local` → http://localhost:3000.
**Devnet'e çıkarken:** adım 16 ve 20'deki program değişiklikleri (publisher, snapshot_slot,
Config/set_platform, draw_slot, leaf'te balance) henüz devnet'te yok;
`cargo-build-sbf --arch v0` + deploy + `anchor idl build` + `set_platform` şart.
Kurulum sıfırdan: `README.md`.
Geliştirme localnet'te: `./scripts/localnet.sh` (arka planda bırak; ledger
50M shred ile sınırlı, `RESET=0` mevcut ledger'ı korur) →
`cd programs/airdrop_escrow && cargo-build-sbf --arch v0` →
`solana program deploy … --url http://127.0.0.1:8899` →
`ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 npx ts-mocha …`.
Devnet yalnızca son doğrulama için; oraya çıkarken **v0 derlemesi şart**.

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

## Kesin kararlar (2026-09-12)

Aşağıdakiler kapandı; yeniden açılmayacak.

1. **Devnet SOL** bugün geliyor. Devnet doğrulaması fon gelince; sıraya alındı.
   Deploy'da **v0 derlemesi şart** (`cargo-build-sbf --arch v0`).
2. **Manuel liste Merkle kökü olarak işleniyor — onaylı.** Liste
   `publish_manual_list` ile zincirde yayınlanıyor; yeterli.
3. **30 gün sonrası müdahale:** yalnızca **platform yetkilisi**, yalnızca
   **iki hedef** (dev cüzdanı / otomatik havuz). `intervene` tam bu.
4. **Buyback sınırı %0,5/çağrı üretimde kalır.**
5. **Switchboard beklemede** (localnet'te mümkün değil — adım 19).

## Senden karar bekleyenler (yeni)

1. **F4 — claim için snapshot bakiyesini tutma şartı (`CLAIM_HOLD_BPS = 10000`).**
   Güvenlik denetiminde ekledim: snapshot'tan sonra satan ödül alamıyor. Ürün
   olarak istediğin bu mu? Seçenekler: %100 (şimdiki), %50 gibi bir eşik, ya da
   0 (eski davranış: sadece ≥0,05 SOL). Tek sabit, `constants.rs`.
2. **Platform anahtarı kim?** Artık program config'inde ve yalnızca upgrade
   authority yazabiliyor. Devnet'e çıkarken `set_platform` ile gerçek platform
   anahtarını (ideali multisig) belirlemen gerekecek; şu an localnet'te crank'in
   geçici anahtarı.
3. **Upgrade authority'yi multisig'e taşıma** (mainnet öncesi). Config'i de
   koruyor artık.

## Web sitesi — durum

`web/` Next.js 15, üç sayfa (`/`, `/coin/<mint>`, `/feed`) + üç API rotası
(`/api/escrows`, `/api/feed`, `/api/claim/[mint]`). Veriler devnet'ten canlı,
mock yok. Bugün doğrulandı: `tsc --noEmit` temiz, `next build` hatasız
(7 rota). Helius anahtarı `web/.env.local`'de, gitignore'da. Devnet'e bağlı
olduğu için localnet'teki coinleri göstermez; `HELIUS_RPC_URL` yerel RPC'ye
çevrilirse gösterir. Çalıştırma: `cd web && npm run dev`.

## Çalıştırma
```bash
cd ~/airdrop-launchpad
anchor build && anchor deploy --provider.cluster devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 600000 tests/airdrop_escrow.ts
```
