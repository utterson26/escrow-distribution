# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası en alttaki ekte; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `8TkzNNTtmrNgyBsT1LQ2tGym8tctcS3FAqovd7WZPPBN` | büyük alır ve tutar (tavana takılır) |
| Burak | `HNhb97nHC9KxFTqhiMu7mCA7ufAYF98yExRmEKxzzt2W` | alır ve tutar |
| Ceren | `FDfwM51gz4Uwkbq1UopZXJCDeKLc2H5Zgp2NxSUq1DNX` | alır ve tutar |
| Deniz | `4BRQ969VLRbjyFvm5E1tKB59VNB7ydEF4Y3u36qRbggX` | alır, sonra hepsini satar |
| Küçük-1 | `DbNr6ffyuucJnGexQyBrZcsAbpaE4Gn9wEGtH4wbXsrT` | alır ve tutar |
| Küçük-2 | `HfRoLpEzw6LmCHyvPP91pAod6YjtvPh5ZuwhoZpgsoQE` | alır ve tutar |
| Küçük-3 | `2MzYT4DWxEMPKKh3zUYvDPaLZoxrcAhPM9iaf9oWVWsA` | alır ve tutar |
| Küçük-4 | `FE96cyGF5eo5spmiT1GaqfG1QePcWTHcjCuxd4K4WwpJ` | alır ve tutar |
| Küçük-5 | `AwXK9t34nhhDggK1P7azs1xv2KcozJ9N6RqHk6rTRtdV` | alır ve tutar |
| Küçük-6 | `UtGSUEKzV1w51M3EHJKHFhjmNW3fZ6Gv39VXKeK3QUd` | alır ve tutar |
| Küçük-7 | `E77eB3cRJHZsaSxiuRhrqKiiNbgckKNa131wDKWDtoUv` | alır ve tutar |
| Küçük-8 | `9niymGChxZUSBmCuUij8MLA82mfEPdnumJFphX5xoaeH` | alır ve tutar |
| Escrow | `4uT1Wivg1gdJZcqmebxZANTnYFD8vHp9Wz3yUasdF9G2` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `57RrZ1ZTXFyjMqTmdd1XeHKGsLXiYJuB29usrqu3QhUs` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- tablo Ck3g6VfphBGirpuo8sijvkxyvjh4x7owjZvWHe62ZMjT (44 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 650M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 195.00M coin |
| dev coin | 0 coin | 455.00M coin |

- coin: 57RrZ1ZTXFyjMqTmdd1XeHKGsLXiYJuB29usrqu3QhUs
- escrow: 4uT1Wivg1gdJZcqmebxZANTnYFD8vHp9Wz3yUasdF9G2
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür.

- piyasa değeri: 5.9968 SOL — dağıtım gecikme penceresi demo için ~60 sn (üretimde 60 dk)
- 2 işlem: set_delay_window; check_trigger (imzalar: ek, adım 3)

### 4. On iki cüzdan piyasadan aldı

Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0055 SOL | 0.0083 SOL |

- 12 işlem: Ayşe 0.15 SOL ile aldı → 23.34M coin; Burak 0.08 SOL ile aldı → 11.43M coin; Ceren 0.08 SOL ile aldı → 10.79M coin; Deniz 0.07 SOL ile aldı → 8.96M coin; Küçük-1 0.07 SOL ile aldı → 8.55M coin; Küçük-2 0.07 SOL ile aldı → 8.16M coin; Küçük-3 0.07 SOL ile aldı → 7.80M coin; Küçük-4 0.07 SOL ile aldı → 7.46M coin; Küçük-5 0.07 SOL ile aldı → 7.14M coin; Küçük-6 0.07 SOL ile aldı → 6.85M coin; Küçük-7 0.07 SOL ile aldı → 6.57M coin; Küçük-8 0.07 SOL ile aldı → 6.30M coin (imzalar: ek, adım 4)

### 5. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 8.96M coin | 0 coin |
| Deniz SOL | 0.5282 SOL | 0.6244 SOL |

- 1 işlem: sell (imzalar: ek, adım 5)

### 6. Biriken ücret havuza süpürüldü

Alım-satımlardan biriken creator ücreti pump.fun kasasından escrow'a çekildi; bu para holder'lar için harcanacak.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.0034 SOL | 0.0110 SOL |
| creator ücreti kasası | 0.0086 SOL | 0.0009 SOL |

- programın kaydettiği toplam ücret: 0.0077 SOL
- 1 işlem: collect_fees (imzalar: ek, adım 6)

### 7. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2110 SOL | 0.1142 SOL |
| havuz coin | 195.00M coin | 202.75M coin |

- Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1142 SOL = 0.1142 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0850 SOL harcandı, 7.75M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0168 SOL harcandı → +1.57M coin, sonraya 0.1808 SOL; parça 2: 0.0169 SOL harcandı → +1.56M coin, sonraya 0.1621 SOL; parça 3: 0.0170 SOL harcandı → +1.55M coin, sonraya 0.1451 SOL; parça 4: 0.0171 SOL harcandı → +1.54M coin, sonraya 0.1280 SOL; parça 5: 0.0172 SOL harcandı → +1.54M coin, sonraya 0.1108 SOL (imzalar: ek, adım 7)

### 8. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 2.03M coin (havuzun %1'i)
- dağıtım ~18 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz
- 1 işlem: check_trigger (imzalar: ek, adım 8)

### 9. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 2.03M coin |

- 1 işlem: fire_trigger (imzalar: ek, adım 9)

### 10. Holder listesi ve paylar hesaplandı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı.

- Ayşe (8Tkz…PPBN): 23.34M coin, 39 sn tutuyor, ağırlık %25.7 → pay 202.8K coin (%10.0) ← tavan
- Burak (HNhb…zt2W): 11.43M coin, 38 sn tutuyor, ağırlık %12.3 → pay 202.8K coin (%10.0) ← tavan
- Ceren (FDfw…1DNX): 10.79M coin, 37 sn tutuyor, ağırlık %11.3 → pay 202.8K coin (%10.0) ← tavan
- Küçük-1 (DbNr…XsrT): 8.55M coin, 34 sn tutuyor, ağırlık %8.3 → pay 202.8K coin (%10.0) ← tavan
- Küçük-2 (HfRo…soQE): 8.16M coin, 33 sn tutuyor, ağırlık %7.7 → pay 202.8K coin (%10.0) ← tavan
- Küçük-3 (2MzY…VWsA): 7.80M coin, 32 sn tutuyor, ağırlık %7.1 → pay 202.8K coin (%10.0) ← tavan
- Küçük-4 (FE96…WwpJ): 7.46M coin, 31 sn tutuyor, ağırlık %6.5 → pay 190.5K coin (%9.4)
- Küçük-5 (AwXK…RtdV): 7.14M coin, 30 sn tutuyor, ağırlık %6.0 → pay 175.3K coin (%8.6)
- Küçük-6 (UtGS…3QUd): 6.85M coin, 28 sn tutuyor, ağırlık %5.5 → pay 161.2K coin (%8.0)
- Küçük-7 (E77e…toUv): 6.57M coin, 27 sn tutuyor, ağırlık %5.1 → pay 148.1K coin (%7.3)
- Küçük-8 (9niy…oaeH): 6.30M coin, 26 sn tutuyor, ağırlık %4.6 → pay 135.9K coin (%6.7)
- Deniz (4BRQ…bggX) listede YOK — hepsini sattığı için
- serbest 2.03M coin, dağıtılan 2.03M coin; tavan yüzünden kalan 0 coin sonraki tura devrediyor
- dev cüzdanı hazine sayılır, listede yok. kök: 929d0cfb46bc9579… slot 29132

### 11. Paylaşım zincire mühürlendi

Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Zar yok, seçim yok.

- zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu
- 11 holder, 2.03M coin dağıtımda, tavan cüzdan başına 202.8K coin
- 1 işlem: open_round (imzalar: ek, adım 11)

### 12. Satan cüzdan pay alamadı

Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 13. Herkes kendi payını aldı

Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (8Tkz…PPBN) coin | 23.34M coin | 23.54M coin |
| Burak (HNhb…zt2W) coin | 11.43M coin | 11.63M coin |
| Ceren (FDfw…1DNX) coin | 10.79M coin | 10.99M coin |
| havuz coin | 200.72M coin | 200.72M coin |

- Küçük-8 (9niy…oaeH) payı 135.9K coin, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- Burak (HNhb…zt2W) ikinci kez denedi → reddedildi (makbuz zaten var)
- 10/11 holder aldı, 1.89M coin / 2.03M coin
- 10 işlem: Burak (HNhb…zt2W) +202.8K coin; Küçük-2 (HfRo…soQE) +202.8K coin; Ceren (FDfw…1DNX) +202.8K coin; Küçük-1 (DbNr…XsrT) +202.8K coin; Ayşe (8Tkz…PPBN) +202.8K coin; Küçük-3 (2MzY…VWsA) +202.8K coin; Küçük-4 (FE96…WwpJ) +190.5K coin; Küçük-5 (AwXK…RtdV) +175.3K coin; Küçük-6 (UtGS…3QUd) +161.2K coin; Küçük-7 (E77e…toUv) +148.1K coin (imzalar: ek, adım 13)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 202.75M coin |
| Ücretlerden toplanan | 0.0077 SOL |
| Geri alıma harcanan | 0.0850 SOL → 7.75M coin havuza eklendi |
| Bu turda dağıtılan | 2.03M coin |
| Havuzda kalan | 200.72M coin |
| Süre | 78 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/57RrZ1ZTXFyjMqTmdd1XeHKGsLXiYJuB29usrqu3QhUs (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir holder'ın payı bilerek claim edilmedi: cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel payı bulur, "claim" butonu zincire gönderir.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

**Adım 1 — Hazırlık**

- set_platform: `3SYdYUghBxAYwRcShQohxkybtgSiz6Q2Dzz3SzsmNNVRPz7wJwtuufUxXg9NxCucQ7Lxovpo9uMQ4CndWgnAopKy`
- lookup_table: `4esVWUkmbuoGYGXrAK2y36AgPmrWYrWeUmCuEhJ2YH129xHbJdSccBAbXBmLkYXSnxPig27LJo5dRWqZC9s84iMQ`

**Adım 2 — Coin basıldı ve %30'u kilitlendi**

- launch: `271614R3tWLDKHTeN3Lox2BqHGAnFp68yFnazAwjLXoHH529Z4ZWbSb4q2JPH6QtNteYgM9mU9KikPRbanViF3pY`

**Adım 3 — Tetikleyici başlangıç noktası**

- set_delay_window: `2sFX9JNShe9jZfszpKZqGkCnH7VwRdgcfwaMoPjUoQPmK1G6cdmLzK3oqtiUNmeBuFxjjpKRxnNSFex1h73SfbTX`
- check_trigger: `2Vd5yRhZpr7yoHks9vXXzgPNbaSFKgyErk45z67NLm74t6GzWK9k8kS4ht2fu7aAar1NRmn1YZX4N3BKJT7EdEgv`

**Adım 4 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 23.34M coin: `3WKNFr73wctxUUtiApE3WUdBZcFTxv5vcMNtgb12T7TR4edYRGEJUmmwvmnTz6dzNJuAZ4LBqMJEoifNH9PKvpw3`
- Burak 0.08 SOL ile aldı → 11.43M coin: `5Qy1FTWczqU5w9NzN2kbaFQP16JawetPHbcMVYEHFBUjFf2RHjuhnj2rRTFUhGd5u6n6QHfd7Nf7AqY8is6v67uw`
- Ceren 0.08 SOL ile aldı → 10.79M coin: `5KBNPArz9Z5nJJNvmJ7hKFMhBNcaTjeCxvovoXDZ2r27efXee3pLiGyvTZPVDnuSduAbVQPymYHA9rd6o9kfEGtR`
- Deniz 0.07 SOL ile aldı → 8.96M coin: `aWhbYxF3pA7gAFsnBgkm4zRTHRBcyNdfT5X7VmyGGZGoPuED4YeJmqFo9cjt8YUsJR9hgaUUkS1Q79EYB6vmexG`
- Küçük-1 0.07 SOL ile aldı → 8.55M coin: `QG7bH3pCyEeGneXbYUWKgVuAHWbYfrdGnYGt66Bez6HnSv4CRXxZ2QmBN6EvQADmwrkJaJTemarcWTttLtv2X6H`
- Küçük-2 0.07 SOL ile aldı → 8.16M coin: `3FvWzzoxfRCqeQCikthZxBK2ZZ3euM6p9Lp6inVUdAGxg6aUZsMFey9WEY2YULQ6nQnCbv9qcg45GRA2vgRzCUWe`
- Küçük-3 0.07 SOL ile aldı → 7.80M coin: `4pGSo5UJXEfPR6g5fUs7iaJ2ziDDtfjLXQUAoVCRSuq8FKmpL2b7zGTPiH1wsqChyep1jXcQGXtsGWWatMMgUdi5`
- Küçük-4 0.07 SOL ile aldı → 7.46M coin: `2xqGyqT5eoe1dHgFnDLphJGRMJs9eWExcYKEuPrZiUokEyZetHkMoqLPjEyzLz96nF6cCeM588ZUnv17NK5JtMfM`
- Küçük-5 0.07 SOL ile aldı → 7.14M coin: `5nZyfAqnGV4S6WRMyNUQzDcWa5QYd581rFvfinnsSN9TSHNHX5B8rSiiReFXYmm3xSRjDYZpMPj4zC9y9kj4CfSX`
- Küçük-6 0.07 SOL ile aldı → 6.85M coin: `5gscj77KFDDKVRDUeNvCGZq295P23WPuX8Q5GusXEizkGD7BSSMgViMUKWPudC5s4BHexwxYhMK2pHfopfMS97Di`
- Küçük-7 0.07 SOL ile aldı → 6.57M coin: `5WPfFZ5V1hNojJ4wLoa5mDeVkz8tHehk85XQxqHWh5BJTwfu4QgdpByY6HrueMEuGasHyTu2nPKEbLFBQnnFvk5F`
- Küçük-8 0.07 SOL ile aldı → 6.30M coin: `5sKZPq2mG58hcXBMrmazoxf5T1Dy6EJeV6dJrBEjVvxatQCJNyVfGJ3dfQ9YDinW8dQQgC6sJgaFKHS992NAopFf`

**Adım 5 — Deniz hepsini sattı**

- sell: `56ghrj5uC6UZUHtE4VibaBVf7SpGrgaXo6b3FrCwfQiXw6hxP3QMMu4mccAUrLuwZGxqy11Yf93r2X8LYdsbbsbT`

**Adım 6 — Biriken ücret havuza süpürüldü**

- collect_fees: `9jGLmw1VW4NJ2px5ZC63bWF1scn5hiRxL4Qm9cPUt3EAggKGWZyWEYgtW7jkFpWiu5AJRBcqxUyeUWv24XhXmS1`

**Adım 7 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: `4uWSxgUsCW25ydKyrq2R7CwGETSW3bBw786yxWowmMnon6W1pRJTvwCsgtCTDbKyR2tiQKZcDmRCfJydqZc3zisC`
- parça 1: 0.0168 SOL harcandı → +1.57M coin, sonraya 0.1808 SOL: `2UCqJiWkXBJzPt7MMKxrNWM5RwWJd6jvEFQUwixiYnQDK4xgCeBmwwdjKAzEa59Mou8n7gYSbjPZoiJuThHCWARW`
- parça 2: 0.0169 SOL harcandı → +1.56M coin, sonraya 0.1621 SOL: `3nRzLXrfn3BiheL5xKWh1KXWq7imca35NcK5YFkAaJ263c6rrBarxQxSa5XLTtZqs5q1oBpwkhpHnJrnft5rQNvp`
- parça 3: 0.0170 SOL harcandı → +1.55M coin, sonraya 0.1451 SOL: `5FC9282QQztZMeageJepddb9BzNfiiAgRteGs5Mp5ewKyGArUJYJhw13ovQnkLNYJbxwYmQfgZ5X1witkpSJEeuN`
- parça 4: 0.0171 SOL harcandı → +1.54M coin, sonraya 0.1280 SOL: `EkDa5wxozGGx9yZazqsC2QCYzhbshx8ZDZ758M3hLftBBVNnUVtxiTui6FtJuKScdPdt9EMAJn54No7G5h3wAMf`
- parça 5: 0.0172 SOL harcandı → +1.54M coin, sonraya 0.1108 SOL: `rYXro4sd4M4rL2ej8rAeq5bYkvc1738czCBokxQjodqGq85wai3RRWoCRiQbym7HZhoSpuq3GtxrjKf23rGHyPV`

**Adım 8 — Hacim tetikleyiciyi kurdu**

- check_trigger: `CvxT4pawnZ6wCkevis2gce3aqn1oYHC8bvHbhknMaCGciqvksTR3VXmVMNtncXkeAAAWH1sY4ucWyNx6XSUgJFP`

**Adım 9 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: `4hEM4Cw3T9RnG9iA5tnYwRwxp3BhxJgHurqivMZpowwNsHNwpLNRm9twe1mzJnQXhh77XvLnNPAi692DmkGkUqFN`

**Adım 11 — Paylaşım zincire mühürlendi**

- open_round: `4nKwG5iVtFTQXGeR2Wv3pf2SyQJPZFxsJAbwPvyCC67kf5pPEC6FDvYwhRXjj2aHpBv5ToEzLeKKjx7WxgRsZWjM`

**Adım 13 — Herkes kendi payını aldı**

- Burak (HNhb…zt2W) +202.8K coin: `2yG2dT351TJcB5yP61ADPL1RZUZGiEvrrgcwDCozUW2CyKjdcxSbGUdVaEhK2z7kNMkVdNZCyb5WgS9Aek3ZHrhU`
- Küçük-2 (HfRo…soQE) +202.8K coin: `dDExER8aUtNrSoZTPvuzAFMSZL2SWZbgmNmYxw1DHVhYuccbA5hUB2FT7Rx6RrzfimWngUFhJNRW3Dppn7avjB1`
- Ceren (FDfw…1DNX) +202.8K coin: `477VxHhB9eBAuiUV8EHnXuC7niKMMZ9vnjYKAsK2YrKkUpz84PL1dyAePe48D12BFWM18By4wFbbH2PMs3932qLz`
- Küçük-1 (DbNr…XsrT) +202.8K coin: `5tyvgQhN2ZtdQ5aKL47YLduWCarieMr1vDzbEBaB4YnJMXwdP9jhgetYvJHiUUSmnLVFZmFrNqYeaXLNeKPh1Srk`
- Ayşe (8Tkz…PPBN) +202.8K coin: `4F5QuUvQYafNnZM1VCPboyy9rAjZi7zTi29nXcWt9tAwTGgjJ3YA1WdF1mggfpXL31CerJBje9k6TXbxBXW1WwnM`
- Küçük-3 (2MzY…VWsA) +202.8K coin: `3pigJFaJe7dBm7w5yoMohU3aZcpnrbfUzy1YXE1jXbfsuMZ5VDKqQnjrbcUo9esQceh3mNGQjUG7cFZFXYfk5Gci`
- Küçük-4 (FE96…WwpJ) +190.5K coin: `61HYnhzopXK1QFS46Ror2K7jMw2ijgJme4UKm9uJProQD3vSYG2HssQ6fsfzUsopL25tB4W69yD6fcpkCR3jXbn4`
- Küçük-5 (AwXK…RtdV) +175.3K coin: `4VQpSqrqBKXjvjZZwJozorMuTTwU8A36ndpqn6mwZae2XWzntzCHnScQrBeRnxi2Lb4eSkfsEoouapCTnPz8J6Gw`
- Küçük-6 (UtGS…3QUd) +161.2K coin: `5fKPXMX5dT1d5ghK7oaL68yAHsCpMhcvGTSb5heZ7NL3fZzZqnUKpKGVV9zVHwCzjB2ViwZ2T3tTjyFTwNff9RJr`
- Küçük-7 (E77e…toUv) +148.1K coin: `5izvuU71cb65TUtNdSjdR1xWUvPHPTwyi8Lxjh9ibLrH7nMEbPaussgd4NaKGkFbFFQ2t3BaPL1eNzPYtp5Cn78W`
