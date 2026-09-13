# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası en alttaki ekte; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `HGwJnwhYG4YJCaxk9tSmw3uh8qtZV4WU7tN3MqrHz4VY` | büyük alır ve tutar (tavana takılır) |
| Burak | `EjAZSoG4powPL5nezW55vDnQtkHoqpPxybwcDo7LruCc` | alır ve tutar |
| Ceren | `2Z43zb44X5jDauKzY6vV5rJDxwafiN1K5LoQGmXy4ZH8` | alır ve tutar |
| Deniz | `B5qDn6VrWS1uwADTDTdivjsB1Eqt9RN9tyRfreLH267S` | alır, sonra hepsini satar |
| Küçük-1 | `AmNLacGeQFyHKL5wBMMUVzuPbfQpYiyAdtx3vPfr9xVd` | alır ve tutar |
| Küçük-2 | `BkHUTMh1evTg4X7yxWSEPw9QrzgWLKHDXaAUvqULJHqP` | alır ve tutar |
| Küçük-3 | `7cDYRG1f8kKumqwVf2Sxid6CqebfwG5RUcQpN96A7gWZ` | alır ve tutar |
| Küçük-4 | `8xrXVAJxKWKdQwJduUARK15E3SPcfhU7Fs7D8xUUv9Bn` | alır ve tutar |
| Küçük-5 | `FkYxomrGMqqSkfYYewGKrHZYskjPfYr7tJqEAVPu3M5E` | alır ve tutar |
| Küçük-6 | `25utVG8Vb1pHWiAYziJWbLo1N6mQWq9yHf6gcEfv9bib` | alır ve tutar |
| Küçük-7 | `HCFbpMRfZojm4PU4iSE3Pz8mb8MJh5j7SQ7n59KDCPZT` | alır ve tutar |
| Küçük-8 | `i5UakZ8PY6g3ukAhVa3Hum24fHEsHmHPw1Xngkna94B` | alır ve tutar |
| Escrow | `BobUpCdHLG4MJ3mE4j2WHRiNc9ZuHddCBZVbWMM6d9ZE` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `HPadGkpNp3o9NDdxvDHaGNZsn5rx5BJLAPiMKwsW6Ke9` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- platform ücreti: creator ücretinin %10'u → f3Ui…vrLr (kilitli havuzdan asla pay alınmaz)
- tablo 3eFwXBWD9SvHw3gaSWQDiCKjmfaFT5qE65yQXyBNtVX4 (53 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 550M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 165.00M coin |
| dev coin | 0 coin | 385.00M coin |

- coin: HPadGkpNp3o9NDdxvDHaGNZsn5rx5BJLAPiMKwsW6Ke9
- escrow: BobUpCdHLG4MJ3mE4j2WHRiNc9ZuHddCBZVbWMM6d9ZE
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Ücret paylaşımı kuruldu: %90 havuz, %10 platform

pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür.

- coin tipi: regular — platform payı %10, pump'taki paylaşım kaydı C5jY…eVZS
- 1 işlem: setup_fee_sharing (imzalar: ek, adım 3)

### 4. On iki cüzdan piyasadan aldı

Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0000 SOL | 0.0052 SOL |

- 12 işlem: Ayşe 0.15 SOL ile aldı → 35.22M coin; Burak 0.12 SOL ile aldı → 24.94M coin; Ceren 0.12 SOL ile aldı → 22.51M coin; Deniz 0.12 SOL ile aldı → 20.42M coin; Küçük-1 0.12 SOL ile aldı → 18.61M coin; Küçük-2 0.12 SOL ile aldı → 17.03M coin; Küçük-3 0.12 SOL ile aldı → 15.65M coin; Küçük-4 0.12 SOL ile aldı → 14.42M coin; Küçük-5 0.12 SOL ile aldı → 13.34M coin; Küçük-6 0.12 SOL ile aldı → 12.37M coin; Küçük-7 0.12 SOL ile aldı → 11.50M coin; Küçük-8 0.12 SOL ile aldı → 10.72M coin (imzalar: ek, adım 4)

### 5. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür (üretimde bu kaydı keeper her dakika yapar).

- piyasa değeri: 11.4393 SOL — dağıtım gecikme penceresi demo için ~60 sn (üretimde 60 dk)
- 2 işlem: set_delay_window; check_trigger (imzalar: ek, adım 5)

### 6. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 20.42M coin | 0 coin |
| Deniz SOL | 0.4782 SOL | 0.6944 SOL |

- 1 işlem: sell (imzalar: ek, adım 6)

### 7. Biriken ücret dağıtıldı: %90 havuza, %10 platforma

pump.fun kasasında biriken creator ücreti paylaşım ayarına göre ödendi: %90 escrow'a (holder'lar için harcanacak), %10 platform cüzdanına.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0059 SOL | 0.0009 SOL |
| escrow SOL | 0.0034 SOL | 0.0079 SOL |
| platform cüzdanı | 0.0100 SOL | 0.0105 SOL |

- escrow +0.0045 SOL (%90), platform +0.0005 SOL; programın kaydettiği toplam ücret: 0.0045 SOL
- 1 işlem: collect_fees (imzalar: ek, adım 7)

### 8. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2079 SOL | 0.1131 SOL |
| havuz coin | 165.00M coin | 172.95M coin |

- Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1131 SOL = 0.1131 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0829 SOL harcandı, 7.95M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1781 SOL; parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1597 SOL; parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1432 SOL; parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1265 SOL; parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1097 SOL (imzalar: ek, adım 8)

### 9. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.73M coin (havuzun %1'i)
- dağıtım ~15 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz
- 1 işlem: check_trigger (imzalar: ek, adım 9)

### 10. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.73M coin |

- 1 işlem: fire_trigger (imzalar: ek, adım 10)

### 11. Holder listesi ve paylar hesaplandı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı.

- Ayşe (HGwJ…z4VY): 35.22M coin, 35 sn tutuyor, ağırlık %20.9 → pay 172.9K coin (%10.0) ← tavan
- Burak (EjAZ…ruCc): 24.94M coin, 34 sn tutuyor, ağırlık %14.5 → pay 172.9K coin (%10.0) ← tavan
- Ceren (2Z43…4ZH8): 22.51M coin, 33 sn tutuyor, ağırlık %12.6 → pay 172.9K coin (%10.0) ← tavan
- Küçük-1 (AmNL…9xVd): 18.61M coin, 30 sn tutuyor, ağırlık %9.7 → pay 172.9K coin (%10.0) ← tavan
- Küçük-2 (BkHU…JHqP): 17.03M coin, 29 sn tutuyor, ağırlık %8.5 → pay 172.9K coin (%10.0) ← tavan
- Küçük-3 (7cDY…7gWZ): 15.65M coin, 28 sn tutuyor, ağırlık %7.5 → pay 172.9K coin (%10.0) ← tavan
- Küçük-4 (8xrX…v9Bn): 14.42M coin, 27 sn tutuyor, ağırlık %6.6 → pay 172.9K coin (%10.0) ← tavan
- Küçük-5 (FkYx…3M5E): 13.34M coin, 26 sn tutuyor, ağırlık %5.8 → pay 154.0K coin (%8.9)
- Küçük-6 (25ut…9bib): 12.37M coin, 24 sn tutuyor, ağırlık %5.2 → pay 136.1K coin (%7.9)
- Küçük-7 (HCFb…CPZT): 11.50M coin, 23 sn tutuyor, ağırlık %4.6 → pay 120.4K coin (%7.0)
- Küçük-8 (i5Ua…a94B): 10.72M coin, 22 sn tutuyor, ağırlık %4.1 → pay 108.4K coin (%6.3)
- Deniz (B5qD…267S) listede YOK — hepsini sattığı için
- serbest 1.73M coin, dağıtılan 1.73M coin; tavanın tuttuğu 0 coin havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)
- dev cüzdanı hazine sayılır, listede yok. kök: 638209bc09754d51… slot 6670

### 12. Paylaşım zincire mühürlendi

Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Rastgelelik yok, seçim yok.

- zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu
- 11 holder, 1.73M coin dağıtımda, tavan cüzdan başına 172.9K coin
- 1 işlem: open_round (imzalar: ek, adım 12)

### 13. Satan cüzdan pay alamadı

Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 14. Herkes kendi payını aldı

Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (HGwJ…z4VY) coin | 35.22M coin | 35.40M coin |
| Burak (EjAZ…ruCc) coin | 24.94M coin | 25.11M coin |
| Ceren (2Z43…4ZH8) coin | 22.51M coin | 22.68M coin |
| havuz coin | 171.22M coin | 171.22M coin |

- Küçük-8 (i5Ua…a94B) payı 108.4K coin, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- Ayşe (HGwJ…z4VY) ikinci kez denedi → reddedildi (makbuz zaten var)
- 10/11 holder aldı, 1.62M coin / 1.73M coin
- 10 işlem: Ayşe (HGwJ…z4VY) +172.9K coin; Burak (EjAZ…ruCc) +172.9K coin; Küçük-2 (BkHU…JHqP) +172.9K coin; Küçük-1 (AmNL…9xVd) +172.9K coin; Küçük-4 (8xrX…v9Bn) +172.9K coin; Küçük-3 (7cDY…7gWZ) +172.9K coin; Ceren (2Z43…4ZH8) +172.9K coin; Küçük-5 (FkYx…3M5E) +154.0K coin; Küçük-6 (25ut…9bib) +136.1K coin; Küçük-7 (HCFb…CPZT) +120.4K coin (imzalar: ek, adım 14)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 172.95M coin |
| Ücretlerden toplanan | 0.0045 SOL |
| Geri alıma harcanan | 0.0829 SOL → 7.95M coin havuza eklendi |
| Bu turda dağıtılan | 1.73M coin |
| Havuzda kalan | 171.22M coin |
| Süre | 68 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/HPadGkpNp3o9NDdxvDHaGNZsn5rx5BJLAPiMKwsW6Ke9 (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir holder'ın payı bilerek claim edilmedi: cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel payı bulur, "claim" butonu zincire gönderir.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

**Adım 1 — Hazırlık**

- set_platform: `2BTFGYagVrEeNDnP43syMPL6YHN8ViTs9wXJoYkfJTGYXiKtFvsxrDmF6n8FhRZ9Ei8msR76uLHRkcGWBxSLNGvS`
- lookup_table: `4oZ76FgNXQoXfXtJqxdaKzCzMwmZmC6Ys3dSgHnvtxjpgkzkqb2M1psX7HAaCtx6D46yBA4V4MPwYGBCGbF7KpVV`

**Adım 2 — Coin basıldı ve %30'u kilitlendi**

- launch: `2vH33QzQDosKkHx5gmJNYr1NWKPBpY7iA7XMpFm2baP5CXAxAAAZxU5jGh7TKuBb6Dstiz1By4Wo6dBxaFpKP3NG`

**Adım 3 — Ücret paylaşımı kuruldu: %90 havuz, %10 platform**

- setup_fee_sharing: `4evciZEEag63fN2sSdncTziGDghMdhXkPWTQQJKorCghAauLmAiUPYFAWLizhx7TTxPqkZknaHcEp41eNcCxtHKn`

**Adım 4 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 35.22M coin: `5wKzvoZCfgNTfYZRGnPFohNW6VTDVM2TaAnwwQAS49J4xxQ6m7c6q7ygXGfoU7j2fZuHdr93Qq3rxM4887bYjCju`
- Burak 0.12 SOL ile aldı → 24.94M coin: `2E4m2kyzjiSZdJVVxBDxiaYYKCZjsAYEPXJzSJmxh5S6jzbD56cEorcin7jppB3hqeb9iNhVAwTRupvxGzbZsePE`
- Ceren 0.12 SOL ile aldı → 22.51M coin: `2fU7yff4sM45YSndd4jNb638m7Xbpjj9WYyay9sadHGuZ7cwNtgzSsHpbYeKvfCdWFPTTGyd5auxXwhwW5iZyStT`
- Deniz 0.12 SOL ile aldı → 20.42M coin: `48kmPtXtc5XUSYsw7rdaMpc9gS6zPsQ4AktxBTiJPDV6881UyqPsMSz6sK29MT1uYMPmyNgxrFeYGxxQjcuBMdE6`
- Küçük-1 0.12 SOL ile aldı → 18.61M coin: `39DcJerrJpEGei4s2Ypnh8vsNAuKqeVud3CiFamaEjwvSndpUZiiHPtR5P3nVQAfkKAUBVyMDEC16cfrTSQSoTTR`
- Küçük-2 0.12 SOL ile aldı → 17.03M coin: `3LaYeYk2H84a32yBjGhoHWJc8mLJTLjS3oHiWFVwoAKuWdQXj9NEgVREmddEghzZPeyYCdsB8as6CT8PC4PhZhyr`
- Küçük-3 0.12 SOL ile aldı → 15.65M coin: `53qMfhvTC7HdVEvbbS7Jjd5Cpu9S9tvwEyNWCTBGC8atVKwHAtXkRTjU7815YW3H1pZ8VSGaAYamkEApHjN1jiAD`
- Küçük-4 0.12 SOL ile aldı → 14.42M coin: `2LizU8vxFwngrLNGTzp3rZqLcEkb5UjkyYfxVSKY7UbxMF5yUMLmLUi4ySZMkzunBMXc4PXjsRau2kokTxqZV7gx`
- Küçük-5 0.12 SOL ile aldı → 13.34M coin: `2JkogomVZYcAa2RL6FLHPey8wLQ6C4awPhQs6tZG1q1DYrVWAGeYvCCMcv5HbF7Qzsrn8ZQvBAscRQkXicLiJzay`
- Küçük-6 0.12 SOL ile aldı → 12.37M coin: `5yR3e1eh37U2wWMcA2yaynESvYvXNDQwoaWY3D4yyLw4NUUoLQ5r6sn4V1QY36mTbXGapktahNmsTVHgREz27JWo`
- Küçük-7 0.12 SOL ile aldı → 11.50M coin: `4ytVBH5VzH1EWess5ZPzqkU3HiwezcLFR4hUcSifroQ63G5T1PJLcepcUsjPocyRipixQRNmhu1yGMS1q1HhFD3n`
- Küçük-8 0.12 SOL ile aldı → 10.72M coin: `5RoSx5nGi1YuHQey5me4KkNFKm6utmLSDVo46FZTgW3FHaAHx5MiuDNY3vdo7Gy6nNXeB8At1QEEFSEyd26XXUP`

**Adım 5 — Tetikleyici başlangıç noktası**

- set_delay_window: `2iUiCHYki97th4S9a2PTTgbhikPmk9UMWWwRMhQcM8uP1nHdmuMoxte6Tm6n2u1qc3yMprEBmvDiVHQMqFhy8sbr`
- check_trigger: `4iPg22SxLMzjzjZtjkg48SdeRkrG7V8k7BnWFxWasWT47fKL3rXL4Gw1xrTk2pUC1imazYCtiQfd6oi19RB64Gg8`

**Adım 6 — Deniz hepsini sattı**

- sell: `3LtViGZLqyZFr3ycH5pzK5Cp4YhNQuNJZybB2tPooESDFsuD6z3W65EJVS5eaMNAnPremHspQnNm2LVFJngB7gDc`

**Adım 7 — Biriken ücret dağıtıldı: %90 havuza, %10 platforma**

- collect_fees: `5riYyq8z9kie84A2N5yZ5NQFAAuHJ8b4GZLq96LmXXXqy7fHWfZbUuobYc8VkLu1mbWqsLt6KvTktWG1pFR5EsSC`

**Adım 8 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: `5ma4bBdoLM3k8a5vQwA8a5XjE2UquhiVutuSzPFoMsRAfaLBhrKfwq5LLhmcDcmGeerV3P92QgGGNb4m8EQeyXxn`
- parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1781 SOL: `2JfM8DE5XFDdg6C8dUuxzZG8ZTanraH4xMAnUYyQSP9umJRSNWM3M5Stm3btySaHvbrKJZ6ufs1a7gyraLghdriK`
- parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1597 SOL: `NrFGX5ESbmWuoezCWuHccBueSsvvVSGGtTMVv3ixD5yLpMGNGRzpf9VnuDKzha8ymim41ipJUcAGn94ccGhDVPZ`
- parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1432 SOL: `2kTdMPHETgeiotmRtDqcem6kTZ7UiQvT3kRrT6qu9f9HX9nZi1qoSBgohowxF4JUZJXgS6L42okm7dmq2z6rdpSu`
- parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1265 SOL: `4s5kUi2ReNHCiYLqcRfGkYcWoiHdUQxdZ6Yd4MyhFbhzgeEeBVL7SCGMey3uBD8xjeSnFJfXW3p6paZRHQLXEB1P`
- parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1097 SOL: `5NE8NrXSTzux9G3RPSAuEBQhsNWgDwGhaaz1BX1ZYhaPdPsJHtEQ6ZCH21cRKuD8AGQGcd8pMp58FyUptrYWzCfC`

**Adım 9 — Hacim tetikleyiciyi kurdu**

- check_trigger: `bcGnZBQpYYVT9k7Lv5QqCCLqyntZK84ZoJ8XCePQYYp6uFqxCugGEVEXweJtzJjGzF1xDtbshEEKF4fPSXfFX2E`

**Adım 10 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: `5JnpuBTr3Nn8tMoeJXyhNdPKe9bgSxZU877xCqphB5Fdg6WYb2sE67FsCXrsQzCQs7DTF4EZXpoD7FQuFsM6W5MT`

**Adım 12 — Paylaşım zincire mühürlendi**

- open_round: `irVF7tdxMLMnMegsBDggNoKGiEx7yqwb3uDm3CRBR2zg6rfC2GxP3eaSbwdiUg65E2zXcJN2zgvcVXo1hWbaRQ9`

**Adım 14 — Herkes kendi payını aldı**

- Ayşe (HGwJ…z4VY) +172.9K coin: `3GW6hxMK6wGNizbUEzsaSuWe41C4u1CXn6bdmp1Mba2yXfv9nT8bB1kpBcaDxWnKZdWZ3ivhpPLA6YAnL5M1s7wf`
- Burak (EjAZ…ruCc) +172.9K coin: `5na79jbkNNL5rT1gyE3uCZJCgbNj1PESYxGUsFsFtGXsZVKy1rxRZBX25XtLvSPH7wjKdYCCjvnuqDcdJQuEWn3d`
- Küçük-2 (BkHU…JHqP) +172.9K coin: `p3Dh5LukVsoJEG2kfLkJ1tTn1jzv73daNEfhMacT8mTheJEDV2QQMhvpMYSLb6YQLSeSaC1CbvCZiXqiVd8mQVk`
- Küçük-1 (AmNL…9xVd) +172.9K coin: `5tUeVCk5T6fD427NRrYTaQoP1LYrGyQ5y4KF5VkX92tfDsqwf2fYrd6uigfJDC77fMeRqHMu1AzFwtfB2ztu9KZT`
- Küçük-4 (8xrX…v9Bn) +172.9K coin: `3g4QzwbwySBqwjfR4K5N2NqcZMzpfTxc5c4D7qHLu2jh3tAhu8M5RyTPk11h2nbHmRWh7sJuW6XZU5uoxyHmdL7c`
- Küçük-3 (7cDY…7gWZ) +172.9K coin: `ceeusenJnqMbxh5cxLFev1bqtnJr7NYoNXkFoCBXp8zDfMNaUWhFgweZ6Trsyy5BiMW13SQdNKVZTJYh9osqALM`
- Ceren (2Z43…4ZH8) +172.9K coin: `4buRRbGaYFbfgr4wYB6Nyycdk7mA3wLLjojWiLeyAxRWiiK2h7SrijBS1KVPNPn3MLZHTAkBTQrTiVnHwsC233Tb`
- Küçük-5 (FkYx…3M5E) +154.0K coin: `4sn8hPTJeLX7w22F1cpqRbddXc8sy81HFYqL5jrLg2S9wHPmhpw4ctqFitwL3SJrU7XSpT5UZFuPRdFLpA7sizED`
- Küçük-6 (25ut…9bib) +136.1K coin: `3E7B5PZrksWHjBtAgi6EGQeHggoe24cLmEqVFC94Km2yi2n1LHjSA5V3iQU1MrezRTmTFTiBkqeCyUdBktVuPFoz`
- Küçük-7 (HCFb…CPZT) +120.4K coin: `3TXurSgNe1AfyA5M3Dvqm32XZgv32yLBQJWGVNgSw6YDtAEuDTrCP9w3oJHp51LhyduBHarhevygQtqeNkCnjdVR`
