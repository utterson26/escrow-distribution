# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde **Solana devnet'te, gerçek pump.fun devnet programıyla** tek koşuda üretildi: `npm run demo -- --devnet`. Her adımın işlem imzası en alttaki ekte, explorer linkleriyle; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `Gh6eYZsGsc1NVvcdp3vG3P3tq14shdYf6y5oQiAoCsde` | büyük alır ve tutar (tavana takılır) |
| Burak | `EjdYPzmakQLb2nmhXxv4vjVNHgyAnLW65nZ9PT6uDYJS` | alır ve tutar |
| Ceren | `E9Fka3FVThG6BD6M9cjpdQRPa251SuBtFC1zK4QWUcmH` | alır ve tutar |
| Deniz | `HSqEHFyUqYHXfyHhUVpWD1i6Ekviqs8pUKj4bPZ1z7Qc` | alır, sonra hepsini satar |
| Küçük-1 | `FYo5MnRXPFFg1sqEfJh8WbZoZ7uBmhkpdF61ot5qYRnS` | alır ve tutar |
| Küçük-2 | `E4PLTt9g52zmh94g2kb6f4rL982rCrGU7aa1oh8UMCtH` | alır ve tutar |
| Küçük-3 | `DACvSX5DRsbZDN63hVDQLGDgebp2VB3gj6ms2V53D7d6` | alır ve tutar |
| Küçük-4 | `BFEeYj5rnnG5ufxecDJicWH7YW4onxRkoskCKPTTK6be` | alır ve tutar |
| Küçük-5 | `BXKBuKsEaZXu7wB3inNV1CorQd5dxgdFyRmQ6q1AVBGY` | alır ve tutar |
| Küçük-6 | `66NHPTF4hfRzCUoBT8tUoTQHZompYtkoAXhTYzzqyma5` | alır ve tutar |
| Küçük-7 | `5KYYzsPA5KMz2e3QjyssXaWSKLztyk4j5TfanmEBNHqG` | alır ve tutar |
| Küçük-8 | `Bn5oxNj8vF65YdThWZMu8Zy86NQbkPH74K3rP5EHxFbf` | alır ve tutar |
| Escrow | `B2dje7pLbDNn58x1nGuZ4WW43Pe1MYvrhSrzSrWWytCT` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw` (DEMO) — [explorer](https://explorer.solana.com/address/3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw?cluster=devnet) · [pump.fun](https://pump.fun/coin/3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw)

## Adımlar

### 1. Hazırlık

Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- platform ücreti: creator ücretinin %10'u → Ggqm…kPiy (kilitli havuzdan asla pay alınmaz)
- tablo 4qAwqEUjS4fbEzb94zQBDqkynbgyU18zsBmqJukKHq1q (53 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 300M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 90.00M coin |
| dev coin | 0 coin | 210.00M coin |

- coin: 3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw
- escrow: B2dje7pLbDNn58x1nGuZ4WW43Pe1MYvrhSrzSrWWytCT
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Ücret paylaşımı kuruldu: %90 havuz, %10 platform

pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür.

- coin tipi: regular — platform payı %10, pump'taki paylaşım kaydı HNMN…JtW3
- 1 işlem: setup_fee_sharing (imzalar: ek, adım 3)

### 4. On iki cüzdan piyasadan aldı

Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0000 SOL | 0.0050 SOL |

- 12 işlem: Ayşe 0.15 SOL ile aldı → 74.54M coin; Burak 0.12 SOL ile aldı → 50.03M coin; Ceren 0.12 SOL ile aldı → 43.34M coin; Deniz 0.12 SOL ile aldı → 37.91M coin; Küçük-1 0.12 SOL ile aldı → 33.44M coin; Küçük-2 0.12 SOL ile aldı → 29.72M coin; Küçük-3 0.12 SOL ile aldı → 26.58M coin; Küçük-4 0.12 SOL ile aldı → 23.92M coin; Küçük-5 0.12 SOL ile aldı → 21.64M coin; Küçük-6 0.12 SOL ile aldı → 19.67M coin; Küçük-7 0.12 SOL ile aldı → 17.95M coin; Küçük-8 0.12 SOL ile aldı → 16.45M coin (imzalar: ek, adım 4)

### 5. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür (üretimde bu kaydı keeper her dakika yapar).

- piyasa değeri: 7.5166 SOL — dağıtım gecikme penceresi demo için ~60 sn (üretimde 60 dk)
- 2 işlem: set_delay_window; check_trigger (imzalar: ek, adım 5)

### 6. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 37.91M coin | 0 coin |
| Deniz SOL | 0.0786 SOL | 0.3344 SOL |

- 1 işlem: sell (imzalar: ek, adım 6)

### 7. Biriken ücret dağıtıldı: %90 havuza, %10 platforma

pump.fun kasasında biriken creator ücreti paylaşım ayarına göre ödendi: %90 escrow'a (holder'lar için harcanacak), %10 platform cüzdanına.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0058 SOL | 0.0007 SOL |
| escrow SOL | 0.0025 SOL | 0.0071 SOL |
| platform cüzdanı | 0.0100 SOL | 0.0105 SOL |

- escrow +0.0046 SOL (%90), platform +0.0005 SOL; programın kaydettiği toplam ücret: 0.0046 SOL
- 1 işlem: collect_fees (imzalar: ek, adım 7)

### 8. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2071 SOL | 0.1306 SOL |
| havuz coin | 90.00M coin | 100.11M coin |

- Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1306 SOL = 0.1306 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0652 SOL harcandı, 10.11M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0129 SOL harcandı → +2.04M coin, sonraya 0.1817 SOL; parça 2: 0.0130 SOL harcandı → +2.03M coin, sonraya 0.1674 SOL; parça 3: 0.0130 SOL harcandı → +2.02M coin, sonraya 0.1544 SOL; parça 4: 0.0131 SOL harcandı → +2.01M coin, sonraya 0.1413 SOL; parça 5: 0.0132 SOL harcandı → +2.00M coin, sonraya 0.1281 SOL (imzalar: ek, adım 8)

### 9. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.00M coin (havuzun %1'i)
- dağıtım ~37 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz
- 1 işlem: check_trigger (imzalar: ek, adım 9)

### 10. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.00M coin |

- 1 işlem: fire_trigger (imzalar: ek, adım 10)

### 11. Holder listesi ve paylar hesaplandı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı.

- Ayşe (Gh6e…Csde): 74.54M coin, 149 sn tutuyor, ağırlık %24.0 → pay 100.1K coin (%10.0) ← tavan
- Burak (EjdY…DYJS): 50.03M coin, 145 sn tutuyor, ağırlık %15.6 → pay 100.1K coin (%10.0) ← tavan
- Ceren (E9Fk…UcmH): 43.34M coin, 140 sn tutuyor, ağırlık %13.1 → pay 100.1K coin (%10.0) ← tavan
- Küçük-1 (FYo5…YRnS): 33.44M coin, 131 sn tutuyor, ağırlık %9.4 → pay 100.1K coin (%10.0) ← tavan
- Küçük-2 (E4PL…MCtH): 29.72M coin, 127 sn tutuyor, ağırlık %8.1 → pay 100.1K coin (%10.0) ← tavan
- Küçük-3 (DACv…D7d6): 26.58M coin, 123 sn tutuyor, ağırlık %7.0 → pay 100.1K coin (%10.0) ← tavan
- Küçük-4 (BFEe…K6be): 23.92M coin, 114 sn tutuyor, ağırlık %5.9 → pay 100.1K coin (%10.0) ← tavan
- Küçük-5 (BXKB…VBGY): 21.64M coin, 109 sn tutuyor, ağırlık %5.1 → pay 90.8K coin (%9.1)
- Küçük-6 (66NH…yma5): 19.67M coin, 105 sn tutuyor, ağırlık %4.5 → pay 79.5K coin (%7.9)
- Küçük-7 (5KYY…NHqG): 17.95M coin, 101 sn tutuyor, ağırlık %3.9 → pay 69.6K coin (%6.9)
- Küçük-8 (Bn5o…xFbf): 16.45M coin, 96 sn tutuyor, ağırlık %3.4 → pay 60.5K coin (%6.0)
- Deniz (HSqE…z7Qc) listede YOK — hepsini sattığı için
- serbest 1.00M coin, dağıtılan 1.00M coin; tavanın tuttuğu 0 coin havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)
- dev cüzdanı hazine sayılır, listede yok. kök: c437b4d08d818c50… slot 497795463

### 12. Paylaşım zincire mühürlendi

Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Rastgelelik yok, seçim yok.

- zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu
- 11 holder, 1.00M coin dağıtımda, tavan cüzdan başına 100.1K coin
- 1 işlem: open_round (imzalar: ek, adım 12)

### 13. Satan cüzdan pay alamadı

Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 14. Herkes kendi payını aldı

Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (Gh6e…Csde) coin | 74.54M coin | 74.64M coin |
| Burak (EjdY…DYJS) coin | 50.03M coin | 50.13M coin |
| Ceren (E9Fk…UcmH) coin | 43.34M coin | 43.44M coin |
| havuz coin | 99.11M coin | 99.11M coin |

- Ayşe (Gh6e…Csde) ikinci kez denedi → reddedildi (makbuz zaten var)
- 11/11 holder aldı, 1.00M coin / 1.00M coin
- 11 işlem: Ayşe (Gh6e…Csde) +100.1K coin; Küçük-1 (FYo5…YRnS) +100.1K coin; Burak (EjdY…DYJS) +100.1K coin; Ceren (E9Fk…UcmH) +100.1K coin; Küçük-2 (E4PL…MCtH) +100.1K coin; Küçük-3 (DACv…D7d6) +100.1K coin; Küçük-4 (BFEe…K6be) +100.1K coin; Küçük-5 (BXKB…VBGY) +90.8K coin; Küçük-6 (66NH…yma5) +79.5K coin; Küçük-7 (5KYY…NHqG) +69.6K coin; Küçük-8 (Bn5o…xFbf) +60.5K coin (imzalar: ek, adım 14)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 100.11M coin |
| Ücretlerden toplanan | 0.0046 SOL |
| Geri alıma harcanan | 0.0652 SOL → 10.11M coin havuza eklendi |
| Bu turda dağıtılan | 1.00M coin |
| Havuzda kalan | 99.11M coin |
| Süre | 159 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/3vxr89kx461cpf3jWY2CUCgkRYwkrybm7oHT7bW5Phfw (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir payı web'den claim etmek için demoyu `DEMO_LEAVE_LAST=1 npm run demo` ile koş; cüzdanın anahtarı `demo-wallets.json` içine yazılır, Phantom'a aktarıp butona basarsın.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url devnet` ya da explorer linkleri.

**Adım 1 — Hazırlık**

- set_platform: [`3tiLKc3MgtwFeaQGykf7…`](https://explorer.solana.com/tx/3tiLKc3MgtwFeaQGykf7pEKPL5QehF37yxF1EbpGij8nrPVdkZpHjRBRHm4F4KbY4yWJVMz6GUMSrdTLuAmq9hsP?cluster=devnet)
- lookup_table: [`4hHQdbA6FYKSk2WkuKqL…`](https://explorer.solana.com/tx/4hHQdbA6FYKSk2WkuKqLdjrMHzcjkw78DZsbB3ZLU9okEaoWwkbstKob48wB62vcGkvYD2ZpqtJg9qwCiSz7WtCQ?cluster=devnet)

**Adım 2 — Coin basıldı ve %30'u kilitlendi**

- launch: [`3prSkMFzG76X2wHXN2p1…`](https://explorer.solana.com/tx/3prSkMFzG76X2wHXN2p15xUma2sd47bdEYrwagbUHGuZQyJGN7oRz1fVrAFQD3oc7gUyTxqFvVQNndGSL9QgUrtF?cluster=devnet)

**Adım 3 — Ücret paylaşımı kuruldu: %90 havuz, %10 platform**

- setup_fee_sharing: [`4JStsb4SKsFWVoBo2ohb…`](https://explorer.solana.com/tx/4JStsb4SKsFWVoBo2ohbpNaSCEyqZhFusAGnMJfzej1r7zpDqDDksVYUqGtwUEc7rU3j5eYhkUaEExKgfhmEnkWL?cluster=devnet)

**Adım 4 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 74.54M coin: [`3W54ZGu7rojGQkVKimzH…`](https://explorer.solana.com/tx/3W54ZGu7rojGQkVKimzH8aUWF9pyAYKHXMbnnbkrZp4yCsmMZnmneurHyuwtf4zFRAT2xTPYaUjHuhdA97xjgt23?cluster=devnet)
- Burak 0.12 SOL ile aldı → 50.03M coin: [`619eZauu1XVg6R33jZiK…`](https://explorer.solana.com/tx/619eZauu1XVg6R33jZiKqLU1SDR9FqhRaABivUUHknPhuMw841xMGR7f98tJLqYSCn2bj3ps5xRNaroLTBbcr8x2?cluster=devnet)
- Ceren 0.12 SOL ile aldı → 43.34M coin: [`5c9rKcMy2iEiEp4vVLcL…`](https://explorer.solana.com/tx/5c9rKcMy2iEiEp4vVLcLYA3Xiv2C7mMm1N7hosFg9scPdVeRA9tDJvd1Hh5Aetikp8gy43aNXR9hHsK5ifCGC73y?cluster=devnet)
- Deniz 0.12 SOL ile aldı → 37.91M coin: [`FWhiUitkt1MuxTL9VqrV…`](https://explorer.solana.com/tx/FWhiUitkt1MuxTL9VqrVuZcZpQT5YzniYcsBkkVJofqVqCwQDnrDXfPAHKNgZTeP9keJdYr1sYr45yASmtjCMRG?cluster=devnet)
- Küçük-1 0.12 SOL ile aldı → 33.44M coin: [`S5yD288i2qhepSy51dhd…`](https://explorer.solana.com/tx/S5yD288i2qhepSy51dhdjG29Pc33Xy8baWbGPRNvtrhVQk7JQns7GuTDRCQwL49Y5SZ9W9X5NX2zQLvp34HkVeP?cluster=devnet)
- Küçük-2 0.12 SOL ile aldı → 29.72M coin: [`649haDM2Pf6EEnAvecxo…`](https://explorer.solana.com/tx/649haDM2Pf6EEnAvecxoxLRchbfh1BUQuydZ2fzNcGEUjPofUppR4znx6m1RM5pNQzGwSGCJAmfb4FYK6X3NHApK?cluster=devnet)
- Küçük-3 0.12 SOL ile aldı → 26.58M coin: [`4HnVf3jH4Raju6H4E4KP…`](https://explorer.solana.com/tx/4HnVf3jH4Raju6H4E4KPBNsd9oMntJgriBxZZFmGwEf51u9mARfyDkw2CkScosftGvq3Nh6zapbEd9JvtpYVwpag?cluster=devnet)
- Küçük-4 0.12 SOL ile aldı → 23.92M coin: [`5nwJXCnuAwz3fhBVFdpR…`](https://explorer.solana.com/tx/5nwJXCnuAwz3fhBVFdpRrLQ4hUMiW5PqNhgJuDpgiYPPhUSgZpLhQJ754topeGA9TNdbMEwqtJpwRqdyiqmchSPL?cluster=devnet)
- Küçük-5 0.12 SOL ile aldı → 21.64M coin: [`2PBvywhR2jRZD5TpxoAd…`](https://explorer.solana.com/tx/2PBvywhR2jRZD5TpxoAdjn92oLDWiKP4cqkmHniQCvhLifJvKEkzfRAcZGbxXvGeTJSkS7Q7REsy36v6dgP3tMRv?cluster=devnet)
- Küçük-6 0.12 SOL ile aldı → 19.67M coin: [`P2WDDGiy1KU9zf4pQqbk…`](https://explorer.solana.com/tx/P2WDDGiy1KU9zf4pQqbkShDR5uYmhv5dcbmFrvEXmkC9JBgSqmAJsGEhpE1nNJYCcMsnTrV4fLa9vJF9i4KP1BT?cluster=devnet)
- Küçük-7 0.12 SOL ile aldı → 17.95M coin: [`ufY2CDY15YrSZYarcnKx…`](https://explorer.solana.com/tx/ufY2CDY15YrSZYarcnKxsCm7Kne1Rzw9TPKBJHsnLY9aRd4UHBoVYDitBNJVYc7dmkWNUmRsxoAKvt83oJGtzcG?cluster=devnet)
- Küçük-8 0.12 SOL ile aldı → 16.45M coin: [`ke4pkovNp5xj7SaBrVLy…`](https://explorer.solana.com/tx/ke4pkovNp5xj7SaBrVLy4EmtStJ8t5336G7QociKd5jaSHT9gr4BhnEWqvuPSVvKiLuv7YPbGrBxgb68kYgvHR7?cluster=devnet)

**Adım 5 — Tetikleyici başlangıç noktası**

- set_delay_window: [`28jsagLF4M9K2mCBjXUa…`](https://explorer.solana.com/tx/28jsagLF4M9K2mCBjXUa7YGYgHdzTMJqGeGjwMydvMYJ7TXL4UNYHdNx9hXSkTXXtY1PwwB2PZ55mTwe4UUCHVbU?cluster=devnet)
- check_trigger: [`2fqjjiZ2U9Sq4MeYXo1C…`](https://explorer.solana.com/tx/2fqjjiZ2U9Sq4MeYXo1CXFKqnXJdKJtQvcDLUYJUfqK4GbHBWd4JzkqmGxSYSh7zxrd4iCqL7yjFhbbCtKuxxuAd?cluster=devnet)

**Adım 6 — Deniz hepsini sattı**

- sell: [`5G1vj3CirAqdyA5bwt1q…`](https://explorer.solana.com/tx/5G1vj3CirAqdyA5bwt1qpHvJ3YaPN36abVJTPwDR4CC7hYYnYKy3XGZnk4psxT6CHdBTfnnWBBwr3UM4rVjYvupT?cluster=devnet)

**Adım 7 — Biriken ücret dağıtıldı: %90 havuza, %10 platforma**

- collect_fees: [`3gWqke974MGXBrtUFVta…`](https://explorer.solana.com/tx/3gWqke974MGXBrtUFVtapnMAEXMUi1idgYfhjGrZ9MmGtocgGHcoFMGfz3m6SR7B25Cauh4igmuA351HoWyG9aqL?cluster=devnet)

**Adım 8 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: [`2VegPGidqqGrykw8zHek…`](https://explorer.solana.com/tx/2VegPGidqqGrykw8zHekVpZ6oDpLWp4gpsL7on2TjSPXsfTvfeK1iMcaoxSbcMDgjkJk29RjY2VriiLH2DroLekT?cluster=devnet)
- parça 1: 0.0129 SOL harcandı → +2.04M coin, sonraya 0.1817 SOL: [`5sbeiaVyvs6DD6CzXDDB…`](https://explorer.solana.com/tx/5sbeiaVyvs6DD6CzXDDBFQNJLmKVnewnN4jjFjswb5r8mHVTAMFwbbcKrU6ikb6mq7eVp9hmRgXgycJtn6hT4mgh?cluster=devnet)
- parça 2: 0.0130 SOL harcandı → +2.03M coin, sonraya 0.1674 SOL: [`z3bpzHiacSpJnYzMSNqK…`](https://explorer.solana.com/tx/z3bpzHiacSpJnYzMSNqK46LDM4ijqPBwPk2detG12Mq8NBcELFsWkgwnddrKHEyEoVj4NA5YYsZKhJjx3rqfyMQ?cluster=devnet)
- parça 3: 0.0130 SOL harcandı → +2.02M coin, sonraya 0.1544 SOL: [`3pLyiqzSPeq2G5LTRLzF…`](https://explorer.solana.com/tx/3pLyiqzSPeq2G5LTRLzFE2tN2zTBT3UmzA4m2KdwE7jMiTS9btrJSQFS7vvR9RkNtSLveRvpfvyqWhSA5CUYmdCC?cluster=devnet)
- parça 4: 0.0131 SOL harcandı → +2.01M coin, sonraya 0.1413 SOL: [`57wRXhiWZjoezAfjSNvH…`](https://explorer.solana.com/tx/57wRXhiWZjoezAfjSNvHcCQpFHBWBUNyDNTZHNSsbUfvuiZdC5gifZ7oDKHPgVegSbYVBKSEW5xAmb2bWc23NyNX?cluster=devnet)
- parça 5: 0.0132 SOL harcandı → +2.00M coin, sonraya 0.1281 SOL: [`5FDhPZVVqc1PbYXrA9nS…`](https://explorer.solana.com/tx/5FDhPZVVqc1PbYXrA9nS3aNUcHb9wrcG5fpzJZRi7yJuCUwm3sFfdSMnF4EmWZZRjMmQXpx8Ry4PC8k8QUDPVSqX?cluster=devnet)

**Adım 9 — Hacim tetikleyiciyi kurdu**

- check_trigger: [`MYAQVgZrj7SjzrYRMMSS…`](https://explorer.solana.com/tx/MYAQVgZrj7SjzrYRMMSSLvLo5GX8ExURaHaVZVEE1ToujTXW3tQFrbRzQJZfBQQXcwe9DJF2f1wkUTDAMq5N4jJ?cluster=devnet)

**Adım 10 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: [`48WxjHyJy6NK8ZPXefga…`](https://explorer.solana.com/tx/48WxjHyJy6NK8ZPXefgaU5Sqn4EY5j7t6QxwqhxvPutiK72q2Uu4rzfPcoTfMGJT66kUwhf3csqdZpa7VG7pbF2M?cluster=devnet)

**Adım 12 — Paylaşım zincire mühürlendi**

- open_round: [`33CQjSkb6hCVsqqb1fdQ…`](https://explorer.solana.com/tx/33CQjSkb6hCVsqqb1fdQ7S3UC2rpFu6mT3xZkdrA1Nc2TNootUtAcgLDN98daXhMeq7dW4E6C8kZge1NKwU3PW15?cluster=devnet)

**Adım 14 — Herkes kendi payını aldı**

- Ayşe (Gh6e…Csde) +100.1K coin: [`2DBSH5r4BgvPYv3YuBxy…`](https://explorer.solana.com/tx/2DBSH5r4BgvPYv3YuBxyw7SmUccwE3Pc52E15gZ77oi1uMRXGEmSxVYzFPU8LmedpHXJL2gwAbHsDQxVruTxRCVs?cluster=devnet)
- Küçük-1 (FYo5…YRnS) +100.1K coin: [`5FzcPTG3t7woNTXFtgF6…`](https://explorer.solana.com/tx/5FzcPTG3t7woNTXFtgF6X7LLGF21YQzEJ6mCvyFKVZtjodq2DLiAKpmm1SviDhpokxuqE5qjt8t8E9GHbfjmZ6bc?cluster=devnet)
- Burak (EjdY…DYJS) +100.1K coin: [`4r2rU8dtoiaWpKkFgwmi…`](https://explorer.solana.com/tx/4r2rU8dtoiaWpKkFgwmiwiceAuP7VQqYxQ78cRbx1WZX122HvjNaSEv2CPna8BiCfb2qSkCQpfbszYCqAFSLeAvj?cluster=devnet)
- Ceren (E9Fk…UcmH) +100.1K coin: [`2mFPRs1PEN55HUkALBBm…`](https://explorer.solana.com/tx/2mFPRs1PEN55HUkALBBmghXasrq5NhTL14Fzn11iNgcCMiFYZsDTaZCNsKv52pj2wW1HrA4JfANPU96KfRopS7ME?cluster=devnet)
- Küçük-2 (E4PL…MCtH) +100.1K coin: [`ELSwcMQ6ZrQgScr1fyXu…`](https://explorer.solana.com/tx/ELSwcMQ6ZrQgScr1fyXu6D624jL5ktDFwxKFNdBvU7rhquAAcyWGG5nR8nAepGCfUMLDUcaks3QMfVkDPyt9a7S?cluster=devnet)
- Küçük-3 (DACv…D7d6) +100.1K coin: [`2m53ysHFcM6m5aM6t8Xb…`](https://explorer.solana.com/tx/2m53ysHFcM6m5aM6t8XbJgNwRUGZXCoi5aGVa3BKcAsxX4gpcGkvDQ5xp3nwrrWF7XwiVgyteDxS5fYq6UMvc7S4?cluster=devnet)
- Küçük-4 (BFEe…K6be) +100.1K coin: [`3H2dAnjpFuwCBwc5zZYZ…`](https://explorer.solana.com/tx/3H2dAnjpFuwCBwc5zZYZ1YxnXEKiGFiAcx69b4LTyNTtqh3JEw5Ky362uCsFXh2VhxvuwrY7yV2Fv1HGVzfft798?cluster=devnet)
- Küçük-5 (BXKB…VBGY) +90.8K coin: [`odJWJLLH5EaPVUFaSHMn…`](https://explorer.solana.com/tx/odJWJLLH5EaPVUFaSHMnzo2fVjNgtkJ3tVdknNJ8cKzxrzEV6ycojtrYZDohGGnvoWBTKYRoSMVrU1Rj718p5Pz?cluster=devnet)
- Küçük-6 (66NH…yma5) +79.5K coin: [`5WmptAzV6tUkUHyHUACb…`](https://explorer.solana.com/tx/5WmptAzV6tUkUHyHUACbADQPXNyuohTFZii43JFUiTWbyboacoa4aF4vczB1Wyb9q6r344L9NeQ7wNJ8Dtqgkn92?cluster=devnet)
- Küçük-7 (5KYY…NHqG) +69.6K coin: [`zyY2VjCnhBCGTaZNyc3Q…`](https://explorer.solana.com/tx/zyY2VjCnhBCGTaZNyc3Q4w69S3nDt3y1H6DpsBHogFFKshrDzK6hw4uSNLvTsFyXrwHTvP6kw1b7HTpHSV1t2rK?cluster=devnet)
- Küçük-8 (Bn5o…xFbf) +60.5K coin: [`2uNSDkTW4x4ddx87tRN9…`](https://explorer.solana.com/tx/2uNSDkTW4x4ddx87tRN95ibKQ5LLWrA4cwGqPaHW9b75Q8f6HcXKCxNZBBppi4gC6yvPjGZ7zDF78tZwi3mzqSJQ?cluster=devnet)
