# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası var; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutanlar arasında ağırlıklı çekilişle dağıtılır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, kazananlar kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, çekilişe girmez |
| Ayşe | `3XSpwU6CrtgQtz6xjDLZMfdzcKi3ZMhg9LezwvZUz4h1` | alır ve tutar |
| Burak | `9YK47MnuruaAU2YHxDP9Euc3knx7PAfxATphwEQ6j9ka` | alır ve tutar |
| Ceren | `GT51o8xu4PnV77qggwxXaGtuBfAo8E4kiFsRBMs3ewb8` | alır ve tutar |
| Deniz | `5Nw5EMTFSeWc5QMPbqqVbhVyH73PPnqKHhtgqXuPH2uW` | alır, sonra hepsini satar |
| Escrow | `B1fHcDWhwZP2z3ynWaRfJWndN1WryTNQzoBS2sr3Y6jP` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `Edkz8KdhbGSu62q1vmbGuSVAQPVGBj139oCgGBGha11U` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- tablo 5TSrRNd69hQwDv4jKEJ9whB3mR4Z1eSJNZBUBpG5wN6z (44 adres)

İmzalar:

- set_platform: `5fkHbbNF6uUvv5xu3K2LMGcKwq2u1XJ7zdR2eKeQjxFRB4UJbchY1cN9qGKh28ypD2F6AAity25rp8yfbeHB1BfY`
- lookup_table: `249CUZUBMvS7NvVUfFF2vMKf9xgnbFXh6yCAo9Ge9iFvhpKM4C4qbMkJPCcr2vyfmHER1LxB8DBGoFfsXjpVEhyD`

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 400M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 120.00M coin |
| dev coin | 0 coin | 280.00M coin |

- coin: Edkz8KdhbGSu62q1vmbGuSVAQPVGBj139oCgGBGha11U
- escrow: B1fHcDWhwZP2z3ynWaRfJWndN1WryTNQzoBS2sr3Y6jP

İmzalar:

- launch: `4a21JtCyR6oagvtreaEEQJnkRayZoL1jEpUYYjsfF5iMftZ56VBM3Sz7NQEX4tLWFAbhmP52SjcEMhBDFKkDJgSK`

### 3. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür.

- piyasa değeri: 2.3690 SOL — dağıtım gecikme penceresi demo için 150 slot (~1 dk; üretimde 60 dk)

İmzalar:

- set_delay_window: `3dAkpxwUprEsrNaCW7FufdajZn4ZXqvnbmFvC6FUk6MQmgecxYQ4YpQcbLbcpNDcBrnebYa3ihgQqxKfZVawRm1Q`
- check_trigger: `4Udf12QAyDrpB5ndnr5EU4UsQFmMzaoMVkUuNUFata9CBVAxgBBvcKyFRNdvyeBW7Dx7tTh4yieroPtREjYAkZpy`

### 4. Dört cüzdan piyasadan aldı

Ayşe, Burak, Ceren ve Deniz doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0027 SOL | 0.0037 SOL |

İmzalar:

- Ayşe 0.12 SOL ile aldı → 46.57M coin: `5hc7H2cuTQ67EjsNugX66fX3kAF7Ny4VqNS2XjAVGEDh6mL8sYwsdHs7MYNtP95U8bLDo424TijkmfhYGSavWChp`
- Burak 0.1 SOL ile aldı → 34.15M coin: `3d62kTU9L4CpHf7dN4XGwtPK3ZG1E98cBwYa3k7QNdnhZvM5iE7VD7mwQs1yG3BPNuWB1eFvBysK68KHskxvaDtx`
- Ceren 0.08 SOL ile aldı → 24.75M coin: `cPzMveLHviVncWesW92dh6TYyQkGtvD5aka5KvWpeKrpjHuS1YgQmdamXCnBUAax9iGWWR1wMWZocF8CeNvVtL2`
- Deniz 0.06 SOL ile aldı → 17.25M coin: `VNnZfFC9TgKN49ZEJM9D6DXftbAHtjErV3Nuzj9NQ67sP7PhZQP8Wz2STSoZQvTnKhSrR2adDwJs7GEKPgWtGhq`

### 5. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 17.25M coin | 0 coin |
| Deniz SOL | 0.5382 SOL | 0.5967 SOL |

İmzalar:

- sell: `3z7fYeJuAQcJHhbP8QNQi6g19MkXWqjfkdY2pFmcv9PLkeK96nBsdxGEq3iJQ6c3sJ4PCzgpwQvj6v5jpMenuzZv`

### 6. Biriken ücret havuza süpürüldü

Alım-satımlardan biriken creator ücreti pump.fun kasasından escrow'a çekildi; bu para holder'lar için harcanacak.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.0034 SOL | 0.0064 SOL |
| creator ücreti kasası | 0.0039 SOL | 0.0009 SOL |

- programın kaydettiği toplam ücret: 0.0030 SOL

İmzalar:

- collect_fees: `4axM3Y9Bmbr1J6Ca5MrgFbcdkr8aYokPi1PH4TNEE3Z9VinNii8px5v7RpHsBBJmXvAz2J3q2TM3RvhPSt7V4PyA`

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

- bağış 0.2 SOL: `3n27YYd2HxQrwJoLfyc63UDh9GJvXnhQdAcKtqy8eFEgNPEMAKtMz96dnQgWEHmAEKiYvjg1JZ6i5jbTgQDTUqpB`
- parça 1 (slot 14810): 0.0095 SOL harcandı → +2.79M coin, sonraya 0.1836 SOL: `3JC8DLG7PuXuSXnzVJu7zBk1uPJrSiHpeEA5qzW8X5o8psSijgFwYanZkNLJRmBzqz1AMwZqLgJ1BqHcL65UMup1`
- parça 2 (slot 14812): 0.0095 SOL harcandı → +2.78M coin, sonraya 0.1722 SOL: `5zv2ReHacLh7Hjrchv2q7HhtnV5Ppch7WxY6vKsLDaHXTDXpzerVaQPfCLuPwBzsCkRnyCS8vRoatAMDLoo1WsSN`
- parça 3 (slot 14814): 0.0095 SOL harcandı → +2.76M coin, sonraya 0.1627 SOL: `5EXdyk45mkAhP1d5UztHPz7DQwqPfZChtVDMrf39SKpW63TC5ZCsZDLf3d4cHbyfFUk3HrRjbByyppYGm2JnKfrU`
- parça 4 (slot 14816): 0.0096 SOL harcandı → +2.75M coin, sonraya 0.1531 SOL: `3QLXVjJ7KGczna1JgmrkVFw2B7CZRhfiV1JLwqNxQJ9rSgGEgMbiiugQx9ETzo4rEz27pHc9it5ZdB3CoEFyJrqR`
- parça 5 (slot 14818): 0.0096 SOL harcandı → +2.73M coin, sonraya 0.1434 SOL: `PoFQUJQtogAxjhpK5T8XMrueeBqx7jwoksumehPCRCxorPF6Fe9hX7PpR3pJsvHHv6em58xEcfSF9fCiVFBVRo1`

### 8. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.34M coin (havuzun %1'i)
- ateşleme slotu 14878, şu an 14820 → ~23 sn sonra
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz

İmzalar:

- check_trigger: `3y3ZE6M5dehp9esxowR3DzMVNcWEhbUewtk1pvCXasK3kb29yT525DBQEu7dfYrjBfEymetSLVR7wNJZKNt2V2i4`

### 9. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.34M coin |

İmzalar:

- fire_trigger: `2pyPHqfTaR7RwgjbD3LdfV3X4bBdHQSrfv4Vf3GDipxQYTda77XcEpQc9BGPdwa7fEyoGgu1d89ftG5LqL86VoHW`

### 10. Holder listesi çıkarıldı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Ağırlık = bakiye × tutma süresi.

- Ayşe (3XSp…z4h1): 46.57M coin, 88 slottur tutuyor → şans %45.8
- Burak (9YK4…j9ka): 34.15M coin, 84 slottur tutuyor → şans %32.1
- Ceren (GT51…ewb8): 24.75M coin, 80 slottur tutuyor → şans %22.1
- Deniz (5Nw5…H2uW) listede YOK — hepsini sattığı için
- dev cüzdanı hazine sayılır, listede yok. kök: bd3497b6e7d11f23… slot 14879

### 11. Kök zincire yazıldı, sonra çekiliş

Liste önce zincire mühürlendi (kök), rastgelelik ancak ondan sonra üretildi: 3 kazanan, eşit ödül. Sıra önemli — önce liste, sonra zar.

- ödül: 3 × 446.0K coin; zar slotu 14882 (kök yazıldıktan 2 slot sonra)
- rastgele tohum: 74fa18baf13c49b8…

İmzalar:

- open_round: `V3NZWrf9xpoAAtpfs2iUswBFCWUmkxVo5xedxNsxScKvmsmcG8dsXAkkGcvDRi3Wu4cr87mtpJvJocz7gwTkPAL`
- draw: `3H1KArpTMqVHTkoUHVuVcUGkmTn4jUL5geHnjK2Pj1NfmXmsF7K6ZVFi3sSVR8kuYXQJm3NvRT7MFdvtCZwr7w1n`

### 12. Satan cüzdan ödül alamadı

Kazananlar almadan önce Deniz, 1. çekilişi kazanan satırı kendi cüzdanıyla kullanıp ödül almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- 1. çekilişi Ayşe (3XSp…z4h1) kazandı; Deniz o satırla deniyor
- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 13. Kazananlar ödülünü aldı

Her çekiliş ağırlığa göre bir holder'a düştü; kazananlar kendi cüzdanlarıyla claim etti, ödül havuzdan cüzdanlarına geçti.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (3XSp…z4h1) coin | 46.57M coin | 47.01M coin |
| Burak (9YK4…j9ka) coin | 34.15M coin | 34.15M coin |
| Ceren (GT51…ewb8) coin | 24.75M coin | 25.20M coin |
| havuz coin | 132.47M coin | 132.47M coin |

- çekiliş 3 → Burak (9YK4…j9ka) kazandı, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- 2/3 ödül ödendi

İmzalar:

- çekiliş 1 → Ayşe (3XSp…z4h1) +446.0K coin: `38Jnjpc7aPEjstdstLNP5i5WShfr51T3hE2uDgQEh2KCEuhgeSPNt4ZrC8KCTBU9btJGD5tcKejAaR8oh5EhzdsR`
- çekiliş 2 → Ceren (GT51…ewb8) +446.0K coin: `4Btr8VkAMKPwFohkCuQQUgmwsyErBwVmhWeEXUmtpaspPc3wkxMLKBq65KDnrbYZYP8HyLoFLooG3fhGpesEh2pj`

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 133.81M coin |
| Ücretlerden toplanan | 0.0030 SOL |
| Geri alıma harcanan | 0.0477 SOL → 13.81M coin havuza eklendi |
| Dağıtılan | 1.34M coin |
| Havuzda kalan | 132.47M coin |
| Süre | 63 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk), holder listesi zincire yazıldıktan sonra zar atılır, ödül yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir, geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı slotta iki kez çalışmaz.

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/Edkz8KdhbGSu62q1vmbGuSVAQPVGBj139oCgGBGha11U (bu coin: havuz, son dağıtım, sıradaki tetikleyici, "Your share" paneli).
Son çekiliş bilerek claim edilmedi: kazanan cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel ödülü bulur, "claim" butonu zincire gönderir.
