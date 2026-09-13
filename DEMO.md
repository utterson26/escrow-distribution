# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası en alttaki ekte; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitlenir — bir dilimi launch'ta sabitlenen cüzdan listesine, kalanı holder havuzuna; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `8XKRbd2GCtEJRT3iJKxqeNoPnNtXyyqqBe2whrMNNJf1` | büyük alır ve tutar (tavana takılır) |
| Burak | `46zrd5GgKfNtAwPCkeQob2saFeiTsW5hChv3xuwdjYuR` | alır ve tutar |
| Ceren | `wq4H9qEgtkFYnEB9LDCTr32s8ptyiLNZiPQR11imsxc` | alır ve tutar |
| Deniz | `78uDiw3eQKSjvq6QKyYmyXHg1unbBUr64RR6vH6AA5up` | alır, sonra hepsini satar |
| Küçük-1 | `A5pwpVA4r4aXn62zhYF3qdYCPS2qnFcn1PvQ9Gz9szRA` | alır ve tutar |
| Küçük-2 | `BAEHAtYjyq84twE3EgFvTsKoLQh1aiFhx5SQ7RULvyCc` | alır ve tutar |
| Küçük-3 | `Gij63qpCQpuch6XPeqfK2yooCTE94vvbGCHSc4oQfMji` | alır ve tutar |
| Küçük-4 | `AzLLh65FwoMjHxeuRQj5PjHK97gyznLmsreKstYyicjJ` | alır ve tutar |
| Küçük-5 | `EvquHbLezPsuqe7QQP5fANJnCaziVpnV6D2SVa5MEoc2` | alır ve tutar |
| Küçük-6 | `B9pjnHimp3jzjEXKtp6V9AePJvaEuymHZdy8j3tw7NoN` | alır ve tutar |
| Küçük-7 | `13anJZTNn6mMpqXMhSPnqUxQUXwqat2MWEE1huFvUUoC` | alır ve tutar |
| Küçük-8 | `Edwb5cL5214NQw5CkRmVEuTsnN6nhQY9CAf4cBccL5kp` | alır ve tutar |
| Ekip-1 | `7swH7LWw8PnQfdfQry4xDQGufVxWt8V5wHgX2A4fsr1E` | sabit listede %60 |
| Ekip-2 | `LHwrVdsbHc2vSaiv4TBVipQmH45HDrNB6chr5GRg5V7` | sabit listede %40 |
| Escrow | `GFRdVtSv9BCwFaBovUuLRJJ6KKqrYMF8SsuFFxxoFkak` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `Ge3eaVytDPvXYQQtq8Ljv7Kzq7SqRnUZ7MWtjfBjG3Az` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- platform ücreti: creator ücretinin %7'u → ESR5…aQfe (kilitli havuzdan asla pay alınmaz)
- tablo BSGg7joWQjJHhaLkreLicWgR24N5roVmwz12vBtpngNi (53 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste

Tek işlemde: pump.fun'da coin yaratıldı, dev 550M coin aldı; alımın %25'i holder havuzuna (escrow), %5'i launch'ta sabitlenen cüzdan+yüzde listesine (Ekip-1 %60, Ekip-2 %40) kilitlendi. Kilit toplam arzın en az %1'i olmak zorunda (platform sabiti), yoksa launch reddedilir.

| | Öncesi | Sonrası |
|---|---|---|
| holder havuzu | 0 coin | 137.50M coin |
| sabit liste | 0 coin | 27.50M coin |
| dev coin | 0 coin | 385.00M coin |

- kilit 165.00M coin ≥ arzın %1'i (10.00M coin) ✓; liste kökü 256e2e61f52742c8… zincirde
- coin: Ge3eaVytDPvXYQQtq8Ljv7Kzq7SqRnUZ7MWtjfBjG3Az
- escrow: GFRdVtSv9BCwFaBovUuLRJJ6KKqrYMF8SsuFFxxoFkak
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Ücret paylaşımı kuruldu: %90 havuz, %10 platform

pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür.

- coin tipi: regular — platform payı %7, pump'taki paylaşım kaydı H7pU…sMkv
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
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1133 SOL = 0.1133 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0829 SOL harcandı, 7.95M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1782 SOL; parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1599 SOL; parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1433 SOL; parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1266 SOL; parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1099 SOL (imzalar: ek, adım 9)

### 10. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.45M coin (havuzun %1'i)
- dağıtım ~53 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
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

- Ayşe (8XKR…NJf1): 35.22M coin, 73 sn tutuyor, ağırlık %17.6 → pay 145.4K coin (%10.0) ← tavan
- Burak (46zr…jYuR): 24.94M coin, 72 sn tutuyor, ağırlık %12.2 → pay 145.4K coin (%10.0) ← tavan
- Ceren (wq4H…msxc): 22.51M coin, 71 sn tutuyor, ağırlık %10.9 → pay 145.4K coin (%10.0) ← tavan
- Ekip-1 (7swH…sr1E): 16.50M coin, 78 sn tutuyor, ağırlık %8.8 → pay 145.4K coin (%10.0) ← tavan
- Küçük-1 (A5pw…szRA): 18.61M coin, 68 sn tutuyor, ağırlık %8.7 → pay 145.4K coin (%10.0) ← tavan
- Küçük-2 (BAEH…vyCc): 17.03M coin, 67 sn tutuyor, ağırlık %7.8 → pay 135.8K coin (%9.3)
- Küçük-3 (Gij6…fMji): 15.65M coin, 66 sn tutuyor, ağırlık %7.1 → pay 123.3K coin (%8.5)
- Küçük-4 (AzLL…icjJ): 14.42M coin, 65 sn tutuyor, ağırlık %6.4 → pay 111.6K coin (%7.7)
- Küçük-5 (Evqu…Eoc2): 13.34M coin, 64 sn tutuyor, ağırlık %5.8 → pay 101.9K coin (%7.0)
- Küçük-6 (B9pj…7NoN): 12.37M coin, 63 sn tutuyor, ağırlık %5.3 → pay 92.7K coin (%6.4)
- Küçük-7 (13an…UUoC): 11.50M coin, 62 sn tutuyor, ağırlık %4.9 → pay 84.6K coin (%5.8)
- Küçük-8 (Edwb…L5kp): 10.72M coin, 61 sn tutuyor, ağırlık %4.4 → pay 77.4K coin (%5.3)
- Deniz (78uD…A5up) listede YOK — hepsini sattığı için
- serbest 1.45M coin, dağıtılan 1.45M coin; tavanın tuttuğu 0 coin havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)
- dev cüzdanı hazine sayılır, listede yok. kök: e307b3e0a2c22d55… slot 10873

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
| Ayşe (8XKR…NJf1) coin | 35.22M coin | 35.37M coin |
| Burak (46zr…jYuR) coin | 24.94M coin | 25.08M coin |
| Ceren (wq4H…msxc) coin | 22.51M coin | 22.66M coin |
| havuz coin | 143.99M coin | 143.99M coin |

- Küçük-8 (Edwb…L5kp) payı 77.4K coin, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- Ceren (wq4H…msxc) ikinci kez denedi → reddedildi (makbuz zaten var)
- 11/12 holder aldı, 1.38M coin / 1.45M coin
- 11 işlem: Ceren (wq4H…msxc) +145.4K coin; Küçük-1 (A5pw…szRA) +145.4K coin; Ayşe (8XKR…NJf1) +145.4K coin; Ekip-1 (7swH…sr1E) +145.4K coin; Burak (46zr…jYuR) +145.4K coin; Küçük-2 (BAEH…vyCc) +135.8K coin; Küçük-3 (Gij6…fMji) +123.3K coin; Küçük-4 (AzLL…icjJ) +111.6K coin; Küçük-5 (Evqu…Eoc2) +101.9K coin; Küçük-6 (B9pj…7NoN) +92.7K coin; Küçük-7 (13an…UUoC) +84.6K coin (imzalar: ek, adım 15)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 145.45M coin |
| Ücretlerden toplanan | 0.0047 SOL |
| Geri alıma harcanan | 0.0829 SOL → 7.95M coin havuza eklendi |
| Bu turda dağıtılan | 1.45M coin |
| Havuzda kalan | 143.99M coin |
| Süre | 115 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/Ge3eaVytDPvXYQQtq8Ljv7Kzq7SqRnUZ7MWtjfBjG3Az (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir holder'ın payı bilerek claim edilmedi: cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel payı bulur, "claim" butonu zincire gönderir.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

**Adım 1 — Hazırlık**

- set_platform: `TBkvaJzF9Lf45LkrjEry2hCf733FREYxkkYafaXfaP4YqmEYR9qXSQjvM1t5pYgVRoaYAZrw61M1ix37Jaaib9R`
- lookup_table: `4PawVME4GdKUdQPEWwNkJPVTLMaJnzTc9or4qoHkTcvYnRwvyUPEUeKNbgR23uqUhUtyCxDnjKc5NCTkhzqe4ekN`

**Adım 2 — Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste**

- launch: `3sVVAQ6XxSjgaXaCCEoZ31fhr1L2ZQ1sx9yaW1QfmmiM5xvtREyzthBB3SWgcAB5e6VhqbcHvm6bDH2fzN5LwdTs`

**Adım 3 — Ücret paylaşımı kuruldu: %90 havuz, %10 platform**

- setup_fee_sharing: `4XRiSDZYJ39ZueBgmrdD7tRUWMydZaPS2Vtf6qudp8puH3jSP48TgtdoMNy7WVvyPyiCYiq5MkwTWVuzRr5wAMxu`

**Adım 4 — Sabit liste zincirde, Ekip-1 payını aldı**

- publish_manual_list: `M9tkUgQtCTjrWtVZbMDwfZZ31zx2WJUH82YyJhbickmBRpf2xWipv9RbDuTh2q9udbyUHi3g7b8Ezr4JC92AokS`
- claim_manual (Ekip-1): `ruiZqchKydhSgKsdvzXr2KDLWh7hcZ3toVDD13avLPuLWyHdxf4arcCPbVQBcyEX3QAPhatwoCtNKkLyQS2P2v7`

**Adım 5 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 35.22M coin: `4VXtDccDqoXmSn9wTCxDSS8ikmDMsFofgDw4629AbHFbHSqLZ2vqfatqP9rLDfNvwazn7L9fnzJ8TfugsUmUxkoD`
- Burak 0.12 SOL ile aldı → 24.94M coin: `66qLgCWzhqWs7A9CtNRDbiVosYgHcj2Ht3tDuVrDc3S4UsUJPMgJxeqJgUAkNvT5NaGeASPmA9RxJphnDZSNpiqS`
- Ceren 0.12 SOL ile aldı → 22.51M coin: `2vCeTeswDhynxa5PRYRwh6wA88eS8VUBo7dpfk2hTWtawFcL3fP2aVVJB3yajh9tzd2hUn33Q7yq8ezuoBdczZBq`
- Deniz 0.12 SOL ile aldı → 20.42M coin: `4S4iuPrwfyG2kgdFbiBpnQmZpFp6JDFK6CkgSL8ejTSbicnLyCvZiSScDWGLEMuDs7Ed1eSVLVQLbBf68M2C1BbQ`
- Küçük-1 0.12 SOL ile aldı → 18.61M coin: `4Q72geQ1mXUcyyT6y23F7SuazmdULY2axfhgekGxr6J1HbcEi1iqz7SGcC88aQ53YqGPD7zTcE4KeJR1SPPaNGk`
- Küçük-2 0.12 SOL ile aldı → 17.03M coin: `5sezdXnmsehdYHgKXFeyypwAJRouU4VnYjWemsRXpWjT31K9ZzuaGxQs6CmfcfRYk1ospyUFMrdw5PT3jmco8B8y`
- Küçük-3 0.12 SOL ile aldı → 15.65M coin: `21vbDZKxFmCwBufDy1jydN1V9LNXtipM2hREnP5DJS74RSEpL5fMZpkQ69FYTAqpx4ghAHPfvXcbVQj62dQyK7gh`
- Küçük-4 0.12 SOL ile aldı → 14.42M coin: `NvAypQrYV8FsZtAk5LPcx7efHYML4PQGsuWZXnvFjvz8KP92tc3L3VLuaFSk9M7HMqby6VUN2houGGMevrj6fkq`
- Küçük-5 0.12 SOL ile aldı → 13.34M coin: `3uVZE7BKC9PhztAs9YXapH7wZrhq4opb4aAzZ4QcvYfAUUYJd6j2nErFGo3a37HWXAMbU8W4Cja64cT56XKb6gZV`
- Küçük-6 0.12 SOL ile aldı → 12.37M coin: `2s592kXsWa3NnmuD5Ab81vFRBy5FpS4d6eQwY1fQFhFwwFHV7q1JYjNDsYQnBKxGossuPeLfbfx1EjvnMUWnoMFn`
- Küçük-7 0.12 SOL ile aldı → 11.50M coin: `53Fdn3c9mSNpMu2qjJiaJ1za9uibaYt2ozaJYuZdyvy2wuj5GxArBKb42Asyn4DTcn6DyADcsQ96hAjemQS8RifN`
- Küçük-8 0.12 SOL ile aldı → 10.72M coin: `3KcSauEJ32jvKtV6h2ur6Y1qsoGjzA1KMYrtthsV2wf9yHhp9rVr3g99nSooq418ETUCkoXwMxcWX3PWJuJ52bfP`

**Adım 6 — Tetikleyici başlangıç noktası**

- set_delay_window: `665TxAw1sy6xg3Dd5naKoRsvjp4Rh9zgnkhwbM5kXSYPfUKsPuEydkPTDEcqZupePLe7ngE8gWcGwWyWXgh464bx`
- check_trigger: `2nK6NqEeWnEN15kqJaX9qsVBXcnQ1o5megcBCtUF1rvJhA4QQ5WyumW5FntHM5GfiPn9g8sSiM2xHqr91C17uoUm`

**Adım 7 — Deniz hepsini sattı**

- sell: `2hPoiZc5Mupi2FD8qu6gKMMZQACcZ27iGcvJKnwfhHCrRk5L9AxSSeupuByXzNdYkqr3EHYGkoNZ3rDLXx7svKt6`

**Adım 8 — Biriken ücret dağıtıldı: %90 havuza, %10 platforma**

- collect_fees: `NDGByh5128HFxubvrp4aCi885ALqeDX37hUH95boksFrXhsTKvKn6VFxJS8F6xgii4BXRXjPsd34WTJPAYvbwhU`

**Adım 9 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: `2z1doEtNEDqQyojhdVukF8r6B5YPuXBuH2hStZe3ovfYYXCoYpiKANqkHDY2DuU1G7X3Bem6pe1MZhQMXPWXYGxY`
- parça 1: 0.0164 SOL harcandı → +1.61M coin, sonraya 0.1782 SOL: `3XoL1KtEPcSupTZgJ3RYXnRsde2QpKEKs8PsKBfcpKJnF7qefS1UrCRQfP7UN54f5svH8yzeBD7q9yeyiwFjcaoS`
- parça 2: 0.0165 SOL harcandı → +1.60M coin, sonraya 0.1599 SOL: `2qycBw18zf2J9DMUCLDXP1ByDdDpZe1NABDxfU5oNFNRAws8ir69Ancqdsx9DAD28n4BkoAQk92wnYDQz1PUJQM`
- parça 3: 0.0166 SOL harcandı → +1.59M coin, sonraya 0.1433 SOL: `2c2APTKSUg4KuA7PL6ynu89HHM4TWvU4V9jjMcXuo5Y5Zjucj7WjwR3y1CnX31d6BcEg61FqVsrhYH837bCrAr6c`
- parça 4: 0.0167 SOL harcandı → +1.58M coin, sonraya 0.1266 SOL: `32eNBQDuJjQMJJyBQ8YR1xXwKi5WhyCx2ufZgRS7W7AdYHfZfaSWL6YLMc8Ag4URfrhbzVktt8HW9RTag9hZpo8X`
- parça 5: 0.0167 SOL harcandı → +1.57M coin, sonraya 0.1099 SOL: `4CCnXExfDB1PDX9yCUg6AnaDgi9Tn2P4ebCukWtfym2h3aT5PcSH6fYmYcUck2GXVurTzp62X5Zp9BRoS41gYmwG`

**Adım 10 — Hacim tetikleyiciyi kurdu**

- check_trigger: `5ZTdoiLXoQpRi2abdsip8d6vd1LA62iY2c8YNXcdDi8kVskFe74XdsdiFkgWzTfvurTcbBAQEovhxm8FGK3T4T17`

**Adım 11 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: `4NmBC9qKqPXwFAg1zsWQuJNa5JqgbA28rmQFVHpfpF2LZ6EagWVx3EFTLpk57uTVkX2wCroEvncMzdT9rUP96d8a`

**Adım 13 — Paylaşım zincire mühürlendi**

- open_round: `5qJWZrje94zzUwSbAyUwdaDoG46AFrdvNUt5A7SPmHhUPXHQv9JrWyVbJk19mN4P5iRpP1oBYkEgbbyt2sGcZZE9`

**Adım 15 — Herkes kendi payını aldı**

- Ceren (wq4H…msxc) +145.4K coin: `2ivDbaCyx58zJykgDTBHsth4kbf6AogaTUoqSoGXW9kqMN8kCAu7DaerNjP8m59yUeQFFCYB7YQ5onopgTGgSc7D`
- Küçük-1 (A5pw…szRA) +145.4K coin: `22QbpxMgBFKtK4BaxUYvwzWruGX19ESbt1m5925UR29RVqryvL4yGcQWMFf5xHZxxC5yGAaDnryDB3aBfj4Wq5yK`
- Ayşe (8XKR…NJf1) +145.4K coin: `2MAuWB14ZU2rzcN27wY6jCBYzokBQn9TN1YjHxUMx6CycnxFt3Hg8SzSXktRBPWfzSxRFN3Vp5LmBwNSi4fw7TcU`
- Ekip-1 (7swH…sr1E) +145.4K coin: `6bvNcTZTGsDDMKRmurGAb4kkDqER6fxBi8FRhjrhnyXN3yFr7ZWZx2qhJ9DRsPthDEiQNvuVtn1RRTqfFi9pXHv`
- Burak (46zr…jYuR) +145.4K coin: `5gtNvRfsYkANoA5wSkEgv484dm2R6X1drhfLAaNbYdQi1GGg3QWVc22qzTJCPCcDc5AABg2vEP8osqcXkDRcL9rg`
- Küçük-2 (BAEH…vyCc) +135.8K coin: `2X4CM6JNWRoxRspKWXPbZcQfsHqojn8DA8RkDj7fWf4Z5eyjfBt6qotPcFhFPziwVDnJqqqBbSrtJZgCjP7EBUov`
- Küçük-3 (Gij6…fMji) +123.3K coin: `4GT3SczJTTSAecXWt9LzVLG5kKNMfXkxrkVMLPXNaeV9euQFmMTafzagYZsKnBN3AvUUWMHWWCHFj191dxZAMQFj`
- Küçük-4 (AzLL…icjJ) +111.6K coin: `5PLbkADoVbSqXBDgPH5BdWF4455rmL8YFZBPEiSzmFU8BRbYGyPsuFeHBB9jEW3poiCc1DL3F4dyddhrQez1LBUm`
- Küçük-5 (Evqu…Eoc2) +101.9K coin: `5qxcF2xb8CUNgBVJKaxhWJqmT6ZYNmCtmU48RkA5VuDqLarVWfxhgLt7U6Pbi9a9HdjdTVrYqmZvr2nM88529U6B`
- Küçük-6 (B9pj…7NoN) +92.7K coin: `38HktFTUnzkJS2WH5rBR93ZVDowqJhST28krVCycVRubk6b4q6cAEqjiP5TthqFa7H5ENBxCEffoXwuZn1HUj86h`
- Küçük-7 (13an…UUoC) +84.6K coin: `Bv22CkfWZRLQAPRdSaexiNekndWSkN91UfGFm1GBQcLLDLMzgT1fVcdXqHEu9xVCTNMDBxBu4GJDrECHVd2aPdM`
