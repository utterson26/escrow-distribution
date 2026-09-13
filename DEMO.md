# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: `npm run demo`. Her adımın zincir üstü işlem imzası var; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutanlar arasında ağırlıklı çekilişle dağıtılır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, kazananlar kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, çekilişe girmez |
| Ayşe | `3PVmf3wYsZGkRG2Lg6CgsUcym4bEAnDaodLMHtHuLFfG` | alır ve tutar |
| Burak | `CU4kdPvtrEhSKpGbxZuCxxdAXbRY7Y7eUBFy9JdwffzX` | alır ve tutar |
| Ceren | `J4HdSkw6VqzCCxNHRH6Pf96xRwh9jmFBJhmKyuRrn89e` | alır ve tutar |
| Deniz | `B1i7niVG4f2Hur9iVPnyEdyNmR34BZrpXyZJZhmt4eLd` | alır, sonra hepsini satar |
| Escrow | `6w4m5RpcsC87G7B4o7Pox52LW2c6XG5n3cSzgTpdpCBJ` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `GkswtFFVcetgfsnSGyLpgk8Fa2iLdKXNYPBK274uGUx5` (DEMO)

## Adımlar

### 1. Hazırlık

Platform yetkilisi belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- tablo EsyDSCxmNntugVZRfBpemPgaZ7MGYirH6r4Vh3tGWFxw (44 adres)

İmzalar:

- set_platform: `39GMbo5agPHsw32UPbLAdYeKgSDmBH9c41JbbDSiP7a5ARd9RHBRMfRcUURtnLX447wbLpD8LRjT5m7SVoPMhbsd`
- lookup_table: `UX4HrkKvysToqrJTtuCJooHBFrPmyheoDF42LoD996d2SWwPoM7mNrQ1GfE41LfG5KEcLhXYSV7b3mmSg9ojzZE`

### 2. Coin basıldı ve %30'u kilitlendi

Tek işlemde: pump.fun'da coin yaratıldı, dev 400M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti.

| | Öncesi | Sonrası |
|---|---|---|
| escrow coin | 0 coin | 120.00M coin |
| dev coin | 0 coin | 280.00M coin |

- coin: GkswtFFVcetgfsnSGyLpgk8Fa2iLdKXNYPBK274uGUx5
- escrow: 6w4m5RpcsC87G7B4o7Pox52LW2c6XG5n3cSzgTpdpCBJ

İmzalar:

- launch: `3eHJLY96wmikzd55zUVv73F3knX5YfVuQNUQnpbaMDV3V9ihweH9VjL3oPK6xvvzeHFVFTgK5Cs6U7iCNBawvLqs`

### 3. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür.

- piyasa değeri: 2.3690 SOL — dağıtım gecikme penceresi demo için 150 slot (~1 dk; üretimde 60 dk)

İmzalar:

- set_delay_window: `2nhGGjk1SR3CQ1CgNuH82Xx91WVqiaBqjaNW78G1cLYPLaLfeWtz3Ex7iFsGPp86WnK1gxhagR1ZpdK7PSsdeAw6`
- check_trigger: `sh4tLYmL3AkiCTMukp74xTGEzniX7cQDt6z5AYgg2fUy8AKn2mZZJK9uGsCMVbGuAUzZMgd9X1GbuRLLitxmZCP`

### 4. Dört cüzdan piyasadan aldı

Ayşe, Burak, Ceren ve Deniz doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0027 SOL | 0.0037 SOL |

İmzalar:

- Ayşe 0.12 SOL ile aldı → 46.57M coin: `5fgUgRmpFz6ZX1HK4HPXGHPggXTPqfzurDS99rHAd46X2Tfww8hsx9nkiRnQaSvjKzYURqCC2AXWShLNBTJRHPu7`
- Burak 0.1 SOL ile aldı → 34.15M coin: `tt57vozT51vkjZeqBtZLi7gQQzfj3eKuTn3QRtnxs87sySejzZA8JJxDUpM7Ae72hvzUy1ktXDNPXyRPoDpYVZN`
- Ceren 0.08 SOL ile aldı → 24.75M coin: `2pMDYwYpQsC2vGfFbNaeN1DfKjTvKAmPEVVM6tpTNUjevEqPLFMuE3dHnC9xGiFKZGMb9xhuqq58XYP3J9TqjhPa`
- Deniz 0.06 SOL ile aldı → 17.25M coin: `ZMsxW2WnEueYZF8k35veobqHVsSHtTCRuPERYvL2eAvQsXjTMjcsuL61bTqgdgE5pcn1svUuE1a4Dsy2cS6LwB9`

### 5. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 17.25M coin | 0 coin |
| Deniz SOL | 0.5382 SOL | 0.5967 SOL |

İmzalar:

- sell: `vQQhSsBDNZbx3YQFzbQidL91FiXxTThRtd97deVcrLAtMsR4F6gJCHxmiedGhmcMvCWxoqCiyNrKaHK68sZbZyC`

### 6. Biriken ücret havuza süpürüldü

Alım-satımlardan biriken creator ücreti pump.fun kasasından escrow'a çekildi; bu para holder'lar için harcanacak.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.0034 SOL | 0.0064 SOL |
| creator ücreti kasası | 0.0039 SOL | 0.0009 SOL |

- programın kaydettiği toplam ücret: 0.0030 SOL

İmzalar:

- collect_fees: `67oiorwRcH6mdDHMCfDbq6ocgR1qtWCxUVBVJ9uCEaedkBjoUJVm4wX9wW7cctsr3xUJTYuc1EK4nnd9WYKrNu9E`

### 7. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL bağış geldi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2064 SOL | 0.1468 SOL |
| havuz coin | 120.00M coin | 133.81M coin |

- 5 parça, toplam 0.0477 SOL harcandı, 13.81M coin alındı

İmzalar:

- bağış 0.2 SOL: `5zVuziJkCpTdf3aTeaHpBwLEg7G1qNviXPbepMmV6uy62bFbc7YUHbYGEmqwTaFsvGkVt9DUTfz49M2qLjCrTSLy`
- parça 1: 0.0095 SOL harcandı → +2.79M coin, sonraya 0.1836 SOL: `4C563GpmbvU7KhvAzByt1m5dbGYT62Gr91HBdY8YfD25dpXeaN668ieS6gEQz1436fJ6LAWYyCogRksX3GJPUVK9`
- parça 2: 0.0095 SOL harcandı → +2.78M coin, sonraya 0.1722 SOL: `3wDX4hLJ8bHD6YZ6ZrsQiZ4Ab94tijY5HCkgiTPZJfFWiujVfFWq7KC43UThDF8oVcyKYAZ8HMbNXdMSPTimjpzG`
- parça 3: 0.0095 SOL harcandı → +2.76M coin, sonraya 0.1627 SOL: `3E5Y792X2FCfVeDk6bBYUJBWNyJgYMDGSs7krkgCoF36VvW7Lf2b1yii1AqU6WNc33xtEZtmWxeZKT6esmXxoEDZ`
- parça 4: 0.0096 SOL harcandı → +2.75M coin, sonraya 0.1531 SOL: `DbrfxBtEhuBGKHcadVz8UEVRpPRJdWH8c627MVUFLzcKzrkjBbvPwMjzeeQhDSBioV5LFbHYB1SpvZXNbWhhrhm`
- parça 5: 0.0096 SOL harcandı → +2.73M coin, sonraya 0.1434 SOL: `zw7C98R8QvPRHVY5B6o1vinc7fMECnjJprxk6FQRcfYwzEa8SkhFKcf4JoviLPwDdtxm3QkLdscmobVqyhUbyKM`

### 8. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 1.34M coin (havuzun %1'i)
- ateşleme slotu 6256, şu an 6236 → ~8 sn sonra
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz

İmzalar:

- check_trigger: `27iVY3rLCQpxNGnmvuXRox4fxBoDapTi9EoxwmV9vN4nQux5d6CUAFTmJMfT7Mg8z8WkwBmtxav99yS7BCqHDxtS`

### 9. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 1.34M coin |

İmzalar:

- fire_trigger: `66m5FvD9pc73Ge6sgRYUd7w3Cxn8LrzFJGHqtiSq72pJyVYKxVS8hYNdknyuFf7PhvBUuBXPsTtZiCc4H3ndsA1F`

### 10. Holder listesi çıkarıldı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Ağırlık = bakiye × tutma süresi.

- Ayşe (3PVm…LFfG): 46.57M coin, 50 slottur tutuyor → şans %47.1
- Burak (CU4k…ffzX): 34.15M coin, 46 slottur tutuyor → şans %31.8
- Ceren (J4Hd…n89e): 24.75M coin, 42 slottur tutuyor → şans %21.0
- Deniz (B1i7…4eLd) listede YOK — hepsini sattığı için
- dev cüzdanı hazine sayılır, listede yok. kök: bc1dc7abdf2535a2… slot 6257

### 11. Kök zincire yazıldı, sonra çekiliş

Liste önce zincire mühürlendi (kök), rastgelelik ancak ondan sonra üretildi: 3 kazanan, eşit ödül. Sıra önemli — önce liste, sonra zar.

- ödül: 3 × 446.0K coin; zar slotu 6260 (kök yazıldıktan 2 slot sonra)
- rastgele tohum: 7920cbabba1dee55…

İmzalar:

- open_round: `4eqWotqFhXrvsYz9E2Cx7YvU38Gtxa9warygKwfV1nbyRHSYh6sYUyScPVvQb2m4YiAwiJKYxMuiF2DjrJyDXEux`
- draw: `4mV7XbofcEwGnc2AKP3y3wXX6TkYbijXDjwNPp6C1fAuq8XJfTRzLmNgP1kzHdmXYwXfm4DcfjXJ4VPiTKQ8YZQc`

### 12. Satan cüzdan ödül alamadı

Kazananlar almadan önce Deniz, 1. çekilişi kazanan satırı kendi cüzdanıyla kullanıp ödül almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- 1. çekilişi Burak (CU4k…ffzX) kazandı; Deniz o satırla deniyor
- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 13. Kazananlar ödülünü aldı

Her çekiliş ağırlığa göre bir holder'a düştü; kazananlar kendi cüzdanlarıyla claim etti, ödül havuzdan cüzdanlarına geçti.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (3PVm…LFfG) coin | 46.57M coin | 46.57M coin |
| Burak (CU4k…ffzX) coin | 34.15M coin | 34.60M coin |
| Ceren (J4Hd…n89e) coin | 24.75M coin | 25.20M coin |
| havuz coin | 132.47M coin | 132.47M coin |

- çekiliş 3 → Burak (CU4k…ffzX) kazandı, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)
- 2/3 ödül ödendi

İmzalar:

- çekiliş 1 → Burak (CU4k…ffzX) +446.0K coin: `2qxtpWFaERymV7mP7Bz3KCTfq56w8pD4NgyQqnFd5XFhfwZzyiRBDhWv1PsLtshrMo6kCLgB8J9xnZAqVqKJGvgQ`
- çekiliş 2 → Ceren (J4Hd…n89e) +446.0K coin: `4EKZgbzWQWCTL1NrAk4z2mDQxVUqfh8wwXqVKpAKJZbVmbcXwenTRLYpVDDPYsM4rc2LuiWQKTGvFbC6r3y1ro9K`

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 133.81M coin |
| Ücretlerden toplanan | 0.0030 SOL |
| Geri alıma harcanan | 0.0477 SOL → 13.81M coin havuza eklendi |
| Dağıtılan | 1.34M coin |
| Havuzda kalan | 132.47M coin |
| Süre | 49 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk), holder listesi zincire yazıldıktan sonra zar atılır, ödül yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir, geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı slotta iki kez çalışmaz.

Doğrulamak için: `solana confirm -v <imza> --url http://127.0.0.1:8899` (localnet açıkken).

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/GkswtFFVcetgfsnSGyLpgk8Fa2iLdKXNYPBK274uGUx5 (bu coin: havuz, son dağıtım, sıradaki tetikleyici, "Your share" paneli).
Son çekiliş bilerek claim edilmedi: kazanan cüzdanın anahtarı `demo-wallets.json` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel ödülü bulur, "claim" butonu zincire gönderir.
