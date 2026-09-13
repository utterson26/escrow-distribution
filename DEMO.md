# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası en alttaki ekte; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitlenir — bir dilimi launch'ta sabitlenen cüzdan listesine, kalanı holder havuzuna; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `hTQBTnzfoJrupmsxWV1BWZx3tCXqfYoqSwSsowdTaLb` | büyük alır ve tutar (tavana takılır) |
| Burak | `AetK57FkbkoCCYiSLysqsyTC85BqhktxqFWKssmXSriU` | alır ve tutar |
| Ceren | `CJu6XVYzWoRu75mst3YJwoL8ssXH5uDxvYoks28vKBjz` | alır ve tutar |
| Deniz | `GGWXcdTjFwQ93gmYXG6jXJysgpYsrTbYfF9jTK2rVMnJ` | alır, sonra hepsini satar |
| Küçük-1 | `27XusuHv6VEjLDg1W5QJPgKAbtQvpRm161N1a7Z9W1Dv` | alır ve tutar |
| Küçük-2 | `7CiinZ6fN5o1NM1HuRb37Rt8h2Hz8xQfFTDSRmSdXQe5` | alır ve tutar |
| Küçük-3 | `D9kXevozYXqkJH87JJx61a9zhpWjXsoEoq5y6sgdoMd2` | alır ve tutar |
| Küçük-4 | `8ZERoaGg3XnnoJBwPgpVjUnvWWNnJ1zAaHkPBwsck54B` | alır ve tutar |
| Küçük-5 | `6koBd8whQVHgSrp6NUZwAUtuHzBeZqM8HkeTD7ij1Q7C` | alır ve tutar |
| Küçük-6 | `B8E3Zgvy1BLt1XCwa71PRdACUEY3BoRbtQbH6vCovCfd` | alır ve tutar |
| Küçük-7 | `BPgBnfpRwTT88QvuDHoENJUT7zqKeT9SQHKVG8t3CBqq` | alır ve tutar |
| Küçük-8 | `6GTyRtT8kUaCuhAF2LH56XZ29pZEmad8MCcPn4VRB7Jq` | alır ve tutar |
| Ekip-1 | `BBh6PYcCb4Ei7Fvbmd9jDFazHh2N8VVcm67kRKEcRdfS` | sabit listede %60 |
| Ekip-2 | `7LDEYv3ZiYFAhzjq6fLuNpUgFvqDybQN9C8YgqsPi8Je` | sabit listede %40 |
| Escrow | `Awrbt2ioxFGq5LCi3BUmpmakTqswW2JkALNJwQfvmq5y` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `J5Js9ch4yaTvwNjsYcBrn2dmtj7cPm6KHoTibgZbqPpt` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- platform ücreti: creator ücretinin %7'u → 7FZ8…ZRmW (kilitli havuzdan asla pay alınmaz)
- tablo 5erHtj4khbNhrB8VNWzUPwtqsbmGzgG5VofE2GRmg3Vc (53 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste

Tek işlemde: pump.fun'da coin yaratıldı, dev 550M coin aldı; alımın %25'i holder havuzuna (escrow), %5'i launch'ta sabitlenen cüzdan+yüzde listesine (Ekip-1 %60, Ekip-2 %40) kilitlendi. Kilit toplam arzın en az %1'i olmak zorunda (platform sabiti), yoksa launch reddedilir.

| | Öncesi | Sonrası |
|---|---|---|
| holder havuzu | 0 coin | 137.50M coin |
| sabit liste | 0 coin | 27.50M coin |
| dev coin | 0 coin | 385.00M coin |

- kilit 165.00M coin ≥ arzın %1'i (10.00M coin) ✓; liste kökü 051110080f927fd8… zincirde
- coin: J5Js9ch4yaTvwNjsYcBrn2dmtj7cPm6KHoTibgZbqPpt
- escrow: Awrbt2ioxFGq5LCi3BUmpmakTqswW2JkALNJwQfvmq5y
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Ücret paylaşımı kuruldu: %90 havuz, %10 platform

pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür.

- coin tipi: regular — platform payı %7, pump'taki paylaşım kaydı B12a…QD3F
- 1 işlem: setup_fee_sharing (imzalar: ek, adım 3)

### 4. Sabit liste zincirde, Ekip-1 payını aldı

Launch'ta kökü yazılan liste satır satır zincire yayınlandı (herkes kökü yeniden hesaplayıp doğrulayabilir); Ekip-1 kendi cüzdanıyla ispat verip listedeki %60'ını çekti. Liste launch'tan sonra değiştirilemez, kimse kendini ekleyemez.

| | Öncesi | Sonrası |
|---|---|---|
| sabit liste | 27.50M coin | 11.00M coin |
| Ekip-1 coin | 0 coin | 16.50M coin |

- listenin %60'ı çekildi; Ekip-2'nin %40'ı bekliyor. Holder havuzu (137.50M coin) bu listeden bağımsız
- 2 işlem: publish_manual_list; claim_manual (Ekip-1) (imzalar: ek, adım 4)

### 5. On iki cüzdan piyasadan aldı

Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0000 SOL | 0.0052 SOL |

- 12 işlem: Ayşe 0.15 SOL ile aldı → 35.22M coin; Burak 0.12 SOL ile aldı → 24.94M coin; Ceren 0.12 SOL ile aldı → 22.51M coin; Deniz 0.12 SOL ile aldı → 20.42M coin; Küçük-1 0.12 SOL ile aldı → 18.61M coin; Küçük-2 0.12 SOL ile aldı → 17.03M coin; Küçük-3 0.12 SOL ile aldı → 15.65M coin; Küçük-4 0.12 SOL ile aldı → 14.42M coin; Küçük-5 0.12 SOL ile aldı → 13.34M coin; Küçük-6 0.12 SOL ile aldı → 12.37M coin; Küçük-7 0.12 SOL ile aldı → 11.50M coin; Küçük-8 0.12 SOL ile aldı → 10.72M coin (imzalar: ek, adım 5)

### 6. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür (üretimde bu kaydı keeper her dakika yapar).

- piyasa değeri: 11.4393 SOL — dağıtım gecikme penceresi demo için ~60 sn (üretimde 60 dk)
- 2 işlem: set_delay_window; check_trigger (imzalar: ek, adım 6)

### 7. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 20.42M coin | 0 coin |
| Deniz SOL | 0.4782 SOL | 0.6944 SOL |

- 1 işlem: sell (imzalar: ek, adım 7)

### 8. Biriken ücret dağıtıldı: %90 havuza, %10 platforma

pump.fun kasasında biriken creator ücreti paylaşım ayarına göre ödendi: %90 escrow'a (holder'lar için harcanacak), %10 platform cüzdanına.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0059 SOL | 0.0009 SOL |
| escrow SOL | 0.0034 SOL | 0.0080 SOL |
| platform cüzdanı | 0.0100 SOL | 0.0104 SOL |

- escrow +0.0047 SOL (%93), platform +0.0004 SOL; programın kaydettiği toplam ücret: 0.0047 SOL
- 1 işlem: collect_fees (imzalar: ek, adım 8)

### 9. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2080 SOL | 0.1133 SOL |
| havuz coin | 137.50M coin | 145.45M coin |

- Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.
- aynı anda (blok 36212) ikinci alım reddedildi (BuybackSameSlot) — bu bir kural: blok başına tek harcama; sonraki blok bekleniyor
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1133 SOL = 0.1133 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0829 SOL harcandı, 7.95M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1782 SOL; parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1599 SOL; parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1433 SOL; parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1266 SOL; parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1099 SOL (imzalar: ek, adım 9)

### 10. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.45M coin (havuzun %1'i)
- dağıtım ~37 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz
- 1 işlem: check_trigger (imzalar: ek, adım 10)

### 11. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.45M coin |

- 1 işlem: fire_trigger (imzalar: ek, adım 11)

### 12. Holder listesi ve paylar hesaplandı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı.

- Ayşe (hTQB…TaLb): 35.22M coin, 57 sn tutuyor, ağırlık %17.9 → pay 145.4K coin (%10.0) ← tavan
- Burak (AetK…SriU): 24.94M coin, 56 sn tutuyor, ağırlık %12.4 → pay 145.4K coin (%10.0) ← tavan
- Ceren (CJu6…KBjz): 22.51M coin, 54 sn tutuyor, ağırlık %10.9 → pay 145.4K coin (%10.0) ← tavan
- Ekip-1 (BBh6…RdfS): 16.50M coin, 62 sn tutuyor, ağırlık %9.1 → pay 145.4K coin (%10.0) ← tavan
- Küçük-1 (27Xu…W1Dv): 18.61M coin, 52 sn tutuyor, ağırlık %8.7 → pay 145.4K coin (%10.0) ← tavan
- Küçük-2 (7Cii…XQe5): 17.03M coin, 51 sn tutuyor, ağırlık %7.8 → pay 138.6K coin (%9.5)
- Küçük-3 (D9kX…oMd2): 15.65M coin, 50 sn tutuyor, ağırlık %7.0 → pay 124.3K coin (%8.5)
- Küçük-4 (8ZER…k54B): 14.42M coin, 49 sn tutuyor, ağırlık %6.3 → pay 111.8K coin (%7.7)
- Küçük-5 (6koB…1Q7C): 13.34M coin, 48 sn tutuyor, ağırlık %5.7 → pay 100.9K coin (%6.9)
- Küçük-6 (B8E3…vCfd): 12.37M coin, 47 sn tutuyor, ağırlık %5.2 → pay 92.0K coin (%6.3)
- Küçük-7 (BPgB…CBqq): 11.50M coin, 46 sn tutuyor, ağırlık %4.7 → pay 83.3K coin (%5.7)
- Küçük-8 (6GTy…B7Jq): 10.72M coin, 45 sn tutuyor, ağırlık %4.3 → pay 76.3K coin (%5.2)
- Deniz (GGWX…VMnJ) listede YOK — hepsini sattığı için
- serbest 1.45M coin, dağıtılan 1.45M coin; tavanın tuttuğu 0 coin havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)
- dev cüzdanı hazine sayılır, listede yok. kök: 2b7784ed58317e8c… slot 36309

### 13. Paylaşım zincire mühürlendi

Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Rastgelelik yok, seçim yok.

- zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu
- 12 holder, 1.45M coin dağıtımda, tavan cüzdan başına 145.4K coin
- 1 işlem: open_round (imzalar: ek, adım 13)

### 14. Satan cüzdan pay alamadı

Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 15. Herkes kendi payını aldı

Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (hTQB…TaLb) coin | 35.22M coin | 35.37M coin |
| Burak (AetK…SriU) coin | 24.94M coin | 25.08M coin |
| Ceren (CJu6…KBjz) coin | 22.51M coin | 22.66M coin |
| havuz coin | 143.99M coin | 143.99M coin |

- Küçük-8 (6GTy…B7Jq) payı 76.3K coin, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- Ayşe (hTQB…TaLb) ikinci kez denedi → reddedildi (makbuz zaten var)
- 11/12 holder aldı, 1.38M coin / 1.45M coin
- 11 işlem: Ayşe (hTQB…TaLb) +145.4K coin; Ceren (CJu6…KBjz) +145.4K coin; Ekip-1 (BBh6…RdfS) +145.4K coin; Burak (AetK…SriU) +145.4K coin; Küçük-1 (27Xu…W1Dv) +145.4K coin; Küçük-2 (7Cii…XQe5) +138.6K coin; Küçük-3 (D9kX…oMd2) +124.3K coin; Küçük-4 (8ZER…k54B) +111.8K coin; Küçük-5 (6koB…1Q7C) +100.9K coin; Küçük-6 (B8E3…vCfd) +92.0K coin; Küçük-7 (BPgB…CBqq) +83.3K coin (imzalar: ek, adım 15)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 145.45M coin |
| Ücretlerden toplanan | 0.0047 SOL |
| Geri alıma harcanan | 0.0829 SOL → 7.95M coin havuza eklendi |
| Bu turda dağıtılan | 1.45M coin |
| Havuzda kalan | 143.99M coin |
| Süre | 116 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/J5Js9ch4yaTvwNjsYcBrn2dmtj7cPm6KHoTibgZbqPpt (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir holder'ın payı bilerek claim edilmedi: cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel payı bulur, "claim" butonu zincire gönderir.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

**Adım 1 — Hazırlık**

- set_platform: `5cPkdbuyNwCRqX8mfDWNQPnDqixn3VdCznCat3UFnLFV38o4zB7BwR9zjVZs7dHsDhLMmW5BpdP5CUoPgwMJt41R`
- lookup_table: `2dyqEX7tcttiaj8xzxRYmQPGA27y9pEpUGYzbHQiQd1x8yqJPJ2XV4itVeTN2RKuj9jLVUCyHe5NbkpEwenTrWBA`

**Adım 2 — Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste**

- launch: `PpfCN3a8LQRvcbATs7cakbZXWnZcezK23ohhBW3BMZKP6YGR3nbaQyPRYLvF2T2cDmpm3QoNinNKMxPeypdTEcR`

**Adım 3 — Ücret paylaşımı kuruldu: %90 havuz, %10 platform**

- setup_fee_sharing: `51QCFzNLUZBkmyu2LkFNbMXzvLMWs94noiT8381CAjmHVxDfToev5JYVT7S7cqM9Z8tnsWrNsh6UPuRg3tgrJEZW`

**Adım 4 — Sabit liste zincirde, Ekip-1 payını aldı**

- publish_manual_list: `2GuRhRRmVJ12BocyMEiiE1uNjXePBaoJfYQPp8yAsUv4raidhWR8iMnCFmjrhY9qNLu7CzsxqyghYAxCh1SSBvNL`
- claim_manual (Ekip-1): `2nKzuYJ6Y5pdUWMeu289FLjZakCEN3pePnjqDnxySosj3SYk4BE8JLerxW6te1ww3bvKCZccWLkMhTGXsayzRtKu`

**Adım 5 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 35.22M coin: `3jyjQQkiuSBomBTVydxBGWi7XsoLt1SyopkWxXRisM1AJettqdU8fTed2sF5jGfMUtd87fHi615ky5N8iwnSmrRV`
- Burak 0.12 SOL ile aldı → 24.94M coin: `4DuQpk58EgSgnsBAMwKgQwstWvFkgepRvdMiRrmYnfFZ98yuqu22qgBZmRQUZP6DKb6Yvf23HmGyxbLayQU87LwT`
- Ceren 0.12 SOL ile aldı → 22.51M coin: `2HtwGnJVKPRTXAdnsH9LgPtWzh3mL37fdqyXQku7rdJSsgeVky5P1ZLzBCFTgUvTZ5V6FhLgDUTrupvvmTa2jFnZ`
- Deniz 0.12 SOL ile aldı → 20.42M coin: `5xV4QarkYGYjBwXudzzT7FyYj92kz39qskP2a5dcdUjarLxpT6aAs9FVSLgHUTWadN1noPEBH8cH89yEzo9PPvfd`
- Küçük-1 0.12 SOL ile aldı → 18.61M coin: `3sE8iq225CikK2ev5DYmkRjZfsWsSDgVuR5C5gYj1cHzupLYFmQGjnVdAHV3W6T1cocbuAmyyTYV5tzvFieiP2Vk`
- Küçük-2 0.12 SOL ile aldı → 17.03M coin: `2UhFzdQ1rU6udZdndfx3FKovjbejfeXgvCbq6TZ8eZSNLvpTeGtWKJF2xy38oxuE4P53HKxZBQpkNJRwKhy1emgs`
- Küçük-3 0.12 SOL ile aldı → 15.65M coin: `4jwMUtdKLi9b7sfRGQfJ8cMgX3WuVKwwV1FBawsAchjXBns1S3KZihAyqzSQrfYdttxJ4ZyyKQuJJ7gTZYHpV75q`
- Küçük-4 0.12 SOL ile aldı → 14.42M coin: `tFZdKSnzaqUsjN6SeiUzEfN9X4vgDNm26f9LF64GnXqZXmEUhQ26s9WQqVkaR7db7WpnGk1gSCk4QETDEggW4Xz`
- Küçük-5 0.12 SOL ile aldı → 13.34M coin: `4LaRzesYdLhtfnDt36xN5e3vmXHfEG9BPhi4wGZ7mhKzFf6BDTBUCpn5tMpJawvzxy7zeSivpFbk7DJwrGtW9hUX`
- Küçük-6 0.12 SOL ile aldı → 12.37M coin: `D3LUTo3GL9PYoMHFobJPUwPxjSHsUJJgbwuiGmAHLNcvQRze9EfMQ8Y9msz5j4Bq3mXUAxjF8couzWd3myKZCBV`
- Küçük-7 0.12 SOL ile aldı → 11.50M coin: `8JPFJDLb1y4QsXieURmWZyBsrpPPXMN6RKyiTPZWwbHtUmj9AWWSWRngY7jyfupfTJddmijRzW13nBofFDtNFjS`
- Küçük-8 0.12 SOL ile aldı → 10.72M coin: `5fqG8JkRXFTz7KKg3sYJkpY7TZ9USwHbuCfmKfHfr8XVfydXQXyLy4toC2nAABZbQbxajhfgcQhFs2P8Zz7bnW8y`

**Adım 6 — Tetikleyici başlangıç noktası**

- set_delay_window: `3CzQCnh4vtHFNuZiMhQRXYEWj3ppWVRjMx7fGzBt3a6e9pvNN6vb49XYceGGFCkv9vmaSvrQ5GMyHWiw5SiJpneJ`
- check_trigger: `Ayq5xWYzLRPV88soXHevWrBf3MV44pEaRZCgZg1VoB5KjWzaeSj6mqMQEzW49xbHut4vaQ1cDhiP4BBou2DwAc8`

**Adım 7 — Deniz hepsini sattı**

- sell: `2BY2J4CLdxaV4ZEXw3JRvoVAzG5r2mfpDzpzBEZd9s3ump83gddju4tdCHjL38jmU2NSsTbL1g9e3TewVBUwN5wn`

**Adım 8 — Biriken ücret dağıtıldı: %90 havuza, %10 platforma**

- collect_fees: `2YpPC7xfkpJ9TepBozFCmATbrQZWUaNkEsJBnxLteJhWcSkSE7i1wji9tt1KFusMtTDJfiHavsNF3AFkukN2QocL`

**Adım 9 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: `2vr6hTibiJiFoZwanJK4yRn1FcDJPAGHP3fWLs7Hgd5apc1gcRv8B8mKxiemfWTjLBFrkqb2Xp1cLEsBPw1xCePr`
- parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1782 SOL: `4c19EwwFcBFbrMVa4jGHgFEsdsdngjnb21vGWuQnFnCqDASaoJRW4qJDftqV4EfmtVFLkRHqGaJYuyaqxET1gXfY`
- parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1599 SOL: `5hFC4LqnwYcnzL4ATyDN2QM1N8JjVXhsoBFXk4kLrmFj2nxnpr3LfnxSNff4W6HqF1Doxe3WEwfUd1pgCF6Vk418`
- parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1433 SOL: `4Go7VTcuNwKtF9pGyeXJQPEDTuM7B4Mqg1JZwNYkhB6NJ7akKmEwkjMNZAHDtnA3yE1Q1ggVjt2UetESCKXF8QYF`
- parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1266 SOL: `y64aeSH6bY8GQHeKMhctsrNUY9ecPDSQt4jFy8j4R8MgxLE5LsKyX9HkYRrpdQx3E4UCWcgh5uqKvb3GEPVihSG`
- parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1099 SOL: `7NwWqVChKtZCP7MBDf8zzUvbjfZWtgoms6zV5SH5M6CtuZwbauMKs9Urcce6Th8Ez9JqGK55EkqpQeDEzhstkAU`

**Adım 10 — Hacim tetikleyiciyi kurdu**

- check_trigger: `5itkQzccRRkxPkF7TmoyJSjP73XP3Lbv41CekfGehEtgSRbfjxB1dN4y2oq5LNCZwnv4v9rcRw4e8huCN5qe5FtM`

**Adım 11 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: `2ekozQDLbtXb5uhZoHXG2nyqYLvrbHov7QT9gfiiWv6FEfwDwZaYqfyuUtkfj4cXh5yKP6jhtPcEgy2v8YaSZcHB`

**Adım 13 — Paylaşım zincire mühürlendi**

- open_round: `gZpxmbUHtkE4ybfbeB9kbctrsK6ovZwh6Z8LScuPMZqg3cG4bYeeQWLii5An245jfUqeo2Fm3tysarMiRifxefY`

**Adım 15 — Herkes kendi payını aldı**

- Ayşe (hTQB…TaLb) +145.4K coin: `5SnX1kHGWXWZhwzLj9DQMhZtLdtUVoBc9V2vX11QkTKtWR943FL1h1ffqqKmLY2TZN1fgh5VRGdWQTuKiBxgTMi9`
- Ceren (CJu6…KBjz) +145.4K coin: `2Yj2yBfmitzo7VoNZNxg8P87XsfD5NYhgqH7eUJ2P8JneYJM2bV5onDi7FHN1SmkTdmBk1dGfHLsdM6Db3BLt8zx`
- Ekip-1 (BBh6…RdfS) +145.4K coin: `5qnX7WoqkigZmXMZoqPG28QJmMRn33siQMpzMPoFgfoBuC3b3s5iHKwursvF3MukSbCBBFtMggcTLrhqrH8zyspi`
- Burak (AetK…SriU) +145.4K coin: `2PFzMRaar25rRzuUYDQcKC1syajfnnZ2z5CDB3zR5NraAmjfFT3fqiyP42zvWKkjpG5GVuzQaJKXtVoPf3aKbFLk`
- Küçük-1 (27Xu…W1Dv) +145.4K coin: `6bpajTodrAinTwuTCvMWbmQ6dx7acoCAmegg1QgyRMpYFcBhkQJRh4xxcrfQrM2z1T5zpQtq2j6jQ46jH75CZ4Y`
- Küçük-2 (7Cii…XQe5) +138.6K coin: `3JrJkY3RBrjSvpJpsRoLEYNZkcw4uzaPsoqSW8Eio7H3z95VCCqaRkbFHuUic9DV7CHbhZg4sXkfMDtH6CTVQfXA`
- Küçük-3 (D9kX…oMd2) +124.3K coin: `uDxGVYwSyw5F1FP2zjnauTsTgoHGd3Ak8ehYRCSZ9JnAcxSAbEaA8izjWjAFd3cM1g6v47T8FLAZhXJQT4c6Es2`
- Küçük-4 (8ZER…k54B) +111.8K coin: `4d4oAnSSYsKxbR5gW2VUjw9o9u1VLVtyNV3JUHZLu5hjqfX6Ynhcu3rj58tTg8JwhDGy2bmcUNtmtwstnnEXfM7g`
- Küçük-5 (6koB…1Q7C) +100.9K coin: `2t4J6pEMT7YjhidnHgTXzQ1u4Cf9wbsspChdWaeZk5sF5sk6QcTXofJBBzQ4jr1HLDYAbp9NAMEuechouYp3uSPh`
- Küçük-6 (B8E3…vCfd) +92.0K coin: `b2Yx94AAjJTm9LmRTNpKGsopQ5sx7kAvUgdABaivjwTJn5h46Mqo5VbYDRnmVmnBooC9mjQkghNLjJZucrsNcnV`
- Küçük-7 (BPgB…CBqq) +83.3K coin: `4nhF5ATd6e9HgGDffJLwZMctTFGikUH37B9mhdyuxAL39RAdJZYe3JhNPViN3U7xyqtrS9mkoLznE6M1QfrD9WQe`
