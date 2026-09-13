# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası var; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutanlar arasında ağırlıklı çekilişle dağıtılır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, kazananlar kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, çekilişe girmez |
| Ayşe | `EKdedT62LHVbPVLeNw4Kor6w7jdZYHusLCJd9tMnZBgR` | alır ve tutar |
| Burak | `3tTUX8GPuE8NRAky6XSVgTh9yivcV7uFr9wpkLsCGwxU` | alır ve tutar |
| Ceren | `EQetoWSzHGviKdDVUPRsMg2umZs6dfi9Rv5UEwJKNm8U` | alır ve tutar |
| Deniz | `9qKKQtWWDFtmeUEZjBVP49QUcABagEXmyMLtfnVfjn6n` | alır, sonra hepsini satar |
| Escrow | `2TVX61QVjBYf6mtTfaMwqETW4TS5sBsQLvFEkFcRDaeE` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `C5TvUhY6AZP6Uec6PuVqNsRBAA6UhU8n2x98eMky4t42` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- tablo AxMyPTFjpf7UsrTkcHihvgenNwetPq8PqR5nbC6YcHeN (44 adres)

İmzalar:

- set_platform: `59aAwFteJkjXg6EgXoNyoN1kPpV9zANw6nN1dEVgCi7duWN8FRNyWVohrGPDkvHuhP5wqZHBwPwEu7iWdwxN2d88`
- lookup_table: `2e6eSc1LoxnradR6jEdV8H5fUsQ73d4mNXe6sJ8JBRrwQcdeBZCNYGkPRGhFH14MjWEr49qfFUkVRvJVWmjScq39`

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 400M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 120.00M coin |
| dev coin | 0 coin | 280.00M coin |

- coin: C5TvUhY6AZP6Uec6PuVqNsRBAA6UhU8n2x98eMky4t42
- escrow: 2TVX61QVjBYf6mtTfaMwqETW4TS5sBsQLvFEkFcRDaeE

İmzalar:

- launch: `VLZL2nwu5RuatAxJ2chBGoktvScpr5squvFPNZqjtXniJRSV3K4qX3W6WbNn4e6ZJSjjHEJeAwVmjqpyjdyamhV`

### 3. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür.

- piyasa değeri: 2.3690 SOL — dağıtım gecikme penceresi demo için 150 slot (~1 dk; üretimde 60 dk)

İmzalar:

- set_delay_window: `2hBsevf1J7t6seAe2SamR7dsKVNeBFHWZ88LVkAskxtFjBVZS2tEyb6UvMh5Xy51QpaeamHU6GfNBLDBwsKdaRoL`
- check_trigger: `4PCRk9bXac6NXu5NG3dvKfx2xi79WiZdh5BX24BtoJAVkMb8dbrvw3xHaA1H1atxmvTwe64wsrjFd7ehhM2CePuE`

### 4. Dört cüzdan piyasadan aldı

Ayşe, Burak, Ceren ve Deniz doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0027 SOL | 0.0037 SOL |

İmzalar:

- Ayşe 0.12 SOL ile aldı → 46.57M coin: `pmKZ2StyoiLwzHyvofvwTck2LhgQkuc7bSfZtLpKjAbUJpXpaPUrJHGpBAgp64Gq7UZjFLcMtRPv66dbrEZpvXK`
- Burak 0.1 SOL ile aldı → 34.15M coin: `36TrP7bcLQKRBsDSY4hSBaVawpeVPvFAhoNzhead1ANLQACPeWGxe4aUpS3vQGrcGtJPRU7kjNoUs8S3v5DJ8Pk3`
- Ceren 0.08 SOL ile aldı → 24.75M coin: `5h4sxE7u1AJeAgchpDkiC3b2L8CisrWP3u2T1P7JJhnrnsVSGG1zbox7dgQ2LUY2EM4anbHe3WUN2jjCoAu9zbzm`
- Deniz 0.06 SOL ile aldı → 17.25M coin: `5bULNbBSRaWTrCeHd9AncEzxzPWSVqZwwaVzX64jJi9hmZRucYoTuyZ7qQj1HEMAkZ67yTEmd9KoHwyjEGQACgp`

### 5. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 17.25M coin | 0 coin |
| Deniz SOL | 0.5382 SOL | 0.5967 SOL |

İmzalar:

- sell: `4VB5aUWqmqfzs5WpUAHakrE2HwAg6sD1YVyiqb4oNNdwgPuMjr33iQn4br62CZVoMtd9v4iXwPQYkFybYVbAFLuM`

### 6. Biriken ücret havuza süpürüldü

Alım-satımlardan biriken creator ücreti pump.fun kasasından escrow'a çekildi; bu para holder'lar için harcanacak.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.0034 SOL | 0.0064 SOL |
| creator ücreti kasası | 0.0039 SOL | 0.0009 SOL |

- programın kaydettiği toplam ücret: 0.0030 SOL

İmzalar:

- collect_fees: `4MVzHKp38Kfi3yMAX6rxccJMKsHC5MoCnRSNeZ73ab4h1e8ZpNuJTgAn2X8gUJ4zxHT1PBFcybNdzcdZHE9AwYZe`

### 7. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL bağış geldi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2064 SOL | 0.1468 SOL |
| havuz coin | 120.00M coin | 133.81M coin |

- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz, escrow SOL değişmedi (0.1468 SOL = 0.1468 SOL)
- her parça ayrı slotta: %0,5 sınırı üst üste bindirilemez, musluk slot başına bir kez akar
- 5 parça, toplam 0.0477 SOL harcandı, 13.81M coin alındı

İmzalar:

- bağış 0.2 SOL: `hVSTBeQYDPZJUJsDE9DQkc1bijuGQqmtTEr1oTEcybxbhoJAMHsB4cnBd8Lk4gg5o5Qv79WWqZj2nTmNXNQorBS`
- parça 1 (slot 16558): 0.0095 SOL harcandı → +2.79M coin, sonraya 0.1836 SOL: `26X8G9SK9oixG2kCmZS6zLzW31ge2Br2xKnwZ4pyo9g9VFMMsBFdGUkEdLqXCyMRdXx39t6uSUNdpPPXF4UvC1sA`
- parça 2 (slot 16560): 0.0095 SOL harcandı → +2.78M coin, sonraya 0.1722 SOL: `3h7toxakpqzPzQZP4j1gnz7b86GWgokY4NHfU8Qbmt57B7tXY75rPZkkjdbvnjStvfYDEp6ShrZrs6NGuFLA4JrZ`
- parça 3 (slot 16562): 0.0095 SOL harcandı → +2.76M coin, sonraya 0.1627 SOL: `2Sczn8ctsRKksYiieJUH9sXZW2ctMEHVEw6gxmyrSf5J7Dy7Z5DGioCBT2HrDQC6dFzFKeJLY3Zui2hPhhrwLkPC`
- parça 4 (slot 16564): 0.0096 SOL harcandı → +2.75M coin, sonraya 0.1531 SOL: `4Zqq4fc81oweqy6Nyx9tTTXVPq1rPWReV3Fzms3LJD8wBW4zRts5K1qGwSSphouwd41xnJ7npnmCjaBNKkG4Y94P`
- parça 5 (slot 16566): 0.0096 SOL harcandı → +2.73M coin, sonraya 0.1434 SOL: `2pjbF9SjMf3aj7AEp2xXcvp7b4KqhmnPffFY3SFhjbdcjiQ3eYDuH7LzuZGMwzNZdmBdxV54Zv6hk9kdzUsYxeu8`

### 8. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.34M coin (havuzun %1'i)
- ateşleme slotu 16700, şu an 16568 → ~53 sn sonra
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz

İmzalar:

- check_trigger: `5GQXoKdxeqxqXLBx8RSf9748Si9SNJMCSasUW4eNFCvcBFLNy6YZKsP5hPKyobSKpsdTp29VFX4svcSxNcvsi2Nv`

### 9. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.34M coin |

İmzalar:

- fire_trigger: `2C9aGpEEgrpHKupqSQbbwdHwTA3gNexPzb7d9ovVBhPxtRpCTYMizQpec3U1bCeRZxhCEUS9F4Jmg4d8uRH3Nu6o`

### 10. Holder listesi çıkarıldı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Ağırlık = bakiye × tutma süresi.

- Burak (3tTU…GwxU): 34.15M coin, 159 slottur tutuyor → şans %32.2
- Ayşe (EKde…ZBgR): 46.57M coin, 163 slottur tutuyor → şans %45.0
- Ceren (EQet…Nm8U): 24.75M coin, 155 slottur tutuyor → şans %22.8
- Deniz (9qKK…jn6n) listede YOK — hepsini sattığı için
- dev cüzdanı hazine sayılır, listede yok. kök: 4795adf5dbbf02c2… slot 16701

### 11. Kök zincire yazıldı, sonra çekiliş

Liste önce zincire mühürlendi (kök), rastgelelik ancak ondan sonra üretildi: 3 kazanan, eşit ödül. Sıra önemli — önce liste, sonra zar.

- ödül: 3 × 446.0K coin; zar slotu 16704 (kök yazıldıktan 2 slot sonra)
- rastgele tohum: 8d6032a2be847fc4…

İmzalar:

- open_round: `5CUnc6rJoGa8w5euscJ2WH1ehkZguJrTNNnc8YuKtrPH4sh1E4TNKRQacVaS4LPHPZiSV4MaaRR8D5VoCnz7kytZ`
- draw: `64bzcD1fh75dqXEV2yZnASoRf8JZiSry2qY58ZF7bctdhRwa84cfq9F25PxdmFyg71VE765yXKYC5if8oDynBc4H`

### 12. Satan cüzdan ödül alamadı

Kazananlar almadan önce Deniz, 1. çekilişi kazanan satırı kendi cüzdanıyla kullanıp ödül almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- 1. çekilişi Ayşe (EKde…ZBgR) kazandı; Deniz o satırla deniyor
- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 13. Kazananlar ödülünü aldı

Her çekiliş ağırlığa göre bir holder'a düştü; kazananlar kendi cüzdanlarıyla claim etti, ödül havuzdan cüzdanlarına geçti.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (EKde…ZBgR) coin | 46.57M coin | 47.46M coin |
| Burak (3tTU…GwxU) coin | 34.15M coin | 34.15M coin |
| Ceren (EQet…Nm8U) coin | 24.75M coin | 24.75M coin |
| havuz coin | 132.47M coin | 132.47M coin |

- çekiliş 3 → Ceren (EQet…Nm8U) kazandı, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- 2/3 ödül ödendi

İmzalar:

- çekiliş 1 → Ayşe (EKde…ZBgR) +446.0K coin: `oZpRuuuCzURMvrhREAtu7uH6amGEaJhMCeN3ptQEXprGJaw67wtMZvDCMv3wmPa5PQ2CTUPk14QFsDiHEfsgEqb`
- çekiliş 2 → Ayşe (EKde…ZBgR) +446.0K coin: `4bEydJj4P8Ld6v9JgEcE8kMfS5fugMeKqjoEFzm142heEBqQgPQaMjfBQDhdWQRHJXnyTTmvXCH24hxwNrrtgKuA`

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 133.81M coin |
| Ücretlerden toplanan | 0.0030 SOL |
| Geri alıma harcanan | 0.0477 SOL → 13.81M coin havuza eklendi |
| Dağıtılan | 1.34M coin |
| Havuzda kalan | 132.47M coin |
| Süre | 95 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk), holder listesi zincire yazıldıktan sonra zar atılır, ödül yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir, geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı slotta iki kez çalışmaz.

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/C5TvUhY6AZP6Uec6PuVqNsRBAA6UhU8n2x98eMky4t42 (bu coin: havuz, son dağıtım, sıradaki tetikleyici, "Your share" paneli).
Son çekiliş bilerek claim edilmedi: kazanan cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel ödülü bulur, "claim" butonu zincire gönderir.
