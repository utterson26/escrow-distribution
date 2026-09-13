# Demo — uçtan uca bir dağıtım

Bu belge, 2026-09-13 tarihinde **Solana devnet'te, gerçek pump.fun devnet programıyla** tek koşuda üretildi: `npm run demo -- --devnet`. Her adımın işlem imzası en alttaki ekte, explorer linkleriyle; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.

**Fikir tek cümlede:** coin basılırken bir kısmı kilitlenir — bir dilimi launch'ta sabitlenen cüzdan listesine, kalanı holder havuzuna; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.

## Aktörler

| Kim | Cüzdan | Rol |
|---|---|---|
| Dev | `4RycArC9Gap3BjagoS4AW6boiPYdN8RvBKHpfCqrUhrZ` | coin'i basan; hazine sayılır, dağıtıma girmez |
| Ayşe | `2XagqzaQAqyR1ES1LnGkr5Lcba8pHdbYL6KLcUcVqVFr` | büyük alır ve tutar (tavana takılır) |
| Burak | `CUSZvkkyubJbm4mDgZ692fzfvX6VTYXYpdQFumLZ9bSJ` | alır ve tutar |
| Ceren | `84b1bEx2kQkBR7mwB6VjzdrvULptxrnGqowYsNppiE5s` | alır ve tutar |
| Deniz | `B3uq4wxAJoc7Z6Y4RMuZUCTZT9PSTyyzpTkomxpZATCt` | alır, sonra hepsini satar |
| Küçük-1 | `5qHyZPZFDLuQx2tWbSWqKNLt9Zv3DDJCvg4yyBR1KnQm` | alır ve tutar |
| Küçük-2 | `4wsGvvQSxZHGrvVz6cF7S4PSp9WrrAWmRdVB667jLp9i` | alır ve tutar |
| Küçük-3 | `ApLADAmWQ8DYFruqt1DbVQZrCknHo4FU2txemvdxamht` | alır ve tutar |
| Küçük-4 | `9qFwnHJZPgC546R5fFJaoAghoyYAbL5fmuwEfibJtGuv` | alır ve tutar |
| Küçük-5 | `D9iaHYa78tPiN5HnaUTN9QC9NiLGjyo9JVGctzUSUSAK` | alır ve tutar |
| Küçük-6 | `AqmBAAZZPk5bPK55qHz13oL8epzUiAAbVFsmde22DL8W` | alır ve tutar |
| Küçük-7 | `GZmW466LgPgjxC4JVguUwYh7g436zdMiPA1JjHJYg5CX` | alır ve tutar |
| Küçük-8 | `FjYoHcaRcD2gafJHVd1tV6emA9U1szdDwHJj9VT7LQkx` | alır ve tutar |
| Ekip-1 | `FLxngoESGAgED3pJdJN84dr4XhdiqGTmbXKVvgFrnF4V` | sabit listede %60 |
| Ekip-2 | `23DJHE5gAj2NedAuGzjxdnUumN6SfraUQVDjiPmnA4dw` | sabit listede %40 |
| Escrow | `J9qSiDzsSo79QeQ2hY5Xgd6YVUnYKzmBJUvXeUjGwkDF` | kilitli havuz (program hesabı, insan anahtarı yok) |

Coin: `GvF6QdUih9NYU6p5JiQQJQoNLmaZQhe2gPH85fwZNQn6` (DEMO) — [explorer](https://explorer.solana.com/address/GvF6QdUih9NYU6p5JiQQJQoNLmaZQhe2gPH85fwZNQn6?cluster=devnet) · [pump.fun](https://pump.fun/coin/GvF6QdUih9NYU6p5JiQQJQoNLmaZQhe2gPH85fwZNQn6)

## Adımlar

### 1. Hazırlık

Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye).

- platform ücreti: creator ücretinin %7'u → 5dAf…kVSV (kilitli havuzdan asla pay alınmaz)
- tablo GaBjy3LiHAzLueZjKnftf5oCebU4BjnmkU5oAL77Gqt1 (53 adres)
- 2 işlem: set_platform; lookup_table (imzalar: ek, adım 1)

### 2. Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste

Tek işlemde: pump.fun'da coin yaratıldı, dev 300M coin aldı; alımın %25'i holder havuzuna (escrow), %5'i launch'ta sabitlenen cüzdan+yüzde listesine (Ekip-1 %60, Ekip-2 %40) kilitlendi. Kilit toplam arzın en az %1'i olmak zorunda (platform sabiti), yoksa launch reddedilir.

| | Öncesi | Sonrası |
|---|---|---|
| holder havuzu | 0 coin | 75.00M coin |
| sabit liste | 0 coin | 15.00M coin |
| dev coin | 0 coin | 210.00M coin |

- kilit 90.00M coin ≥ arzın %1'i (10.00M coin) ✓; liste kökü 9b1c2091eba88f8e… zincirde
- coin: GvF6QdUih9NYU6p5JiQQJQoNLmaZQhe2gPH85fwZNQn6
- escrow: J9qSiDzsSo79QeQ2hY5Xgd6YVUnYKzmBJUvXeUjGwkDF
- 1 işlem: launch (imzalar: ek, adım 2)

### 3. Ücret paylaşımı kuruldu: %90 havuz, %10 platform

pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür.

- coin tipi: regular — platform payı %7, pump'taki paylaşım kaydı DvnM…md9Y
- 1 işlem: setup_fee_sharing (imzalar: ek, adım 3)

### 4. Sabit liste zincirde, Ekip-1 payını aldı

Launch'ta kökü yazılan liste satır satır zincire yayınlandı (herkes kökü yeniden hesaplayıp doğrulayabilir); Ekip-1 kendi cüzdanıyla ispat verip listedeki %60'ını çekti. Liste launch'tan sonra değiştirilemez, kimse kendini ekleyemez.

| | Öncesi | Sonrası |
|---|---|---|
| sabit liste | 15.00M coin | 6.00M coin |
| Ekip-1 coin | 0 coin | 9.00M coin |

- listenin %60'ı çekildi; Ekip-2'nin %40'ı bekliyor. Holder havuzu (75.00M coin) bu listeden bağımsız
- 2 işlem: publish_manual_list; claim_manual (Ekip-1) (imzalar: ek, adım 4)

### 5. On iki cüzdan piyasadan aldı

Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0000 SOL | 0.0050 SOL |

- 12 işlem: Ayşe 0.15 SOL ile aldı → 74.54M coin; Burak 0.12 SOL ile aldı → 50.03M coin; Ceren 0.12 SOL ile aldı → 43.34M coin; Deniz 0.12 SOL ile aldı → 37.91M coin; Küçük-1 0.12 SOL ile aldı → 33.44M coin; Küçük-2 0.12 SOL ile aldı → 29.72M coin; Küçük-3 0.12 SOL ile aldı → 26.58M coin; Küçük-4 0.12 SOL ile aldı → 23.92M coin; Küçük-5 0.12 SOL ile aldı → 21.64M coin; Küçük-6 0.12 SOL ile aldı → 19.67M coin; Küçük-7 0.12 SOL ile aldı → 17.95M coin; Küçük-8 0.12 SOL ile aldı → 16.45M coin (imzalar: ek, adım 5)

### 6. Tetikleyici başlangıç noktası

Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür (üretimde bu kaydı keeper her dakika yapar).

- piyasa değeri: 7.5166 SOL — dağıtım gecikme penceresi demo için ~60 sn (üretimde 60 dk)
- 2 işlem: set_delay_window; check_trigger (imzalar: ek, adım 6)

### 7. Deniz hepsini sattı

Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak.

| | Öncesi | Sonrası |
|---|---|---|
| Deniz coin | 37.91M coin | 0 coin |
| Deniz SOL | 0.0786 SOL | 0.3344 SOL |

- 1 işlem: sell (imzalar: ek, adım 7)

### 8. Biriken ücret dağıtıldı: %90 havuza, %10 platforma

pump.fun kasasında biriken creator ücreti paylaşım ayarına göre ödendi: %90 escrow'a (holder'lar için harcanacak), %10 platform cüzdanına.

| | Öncesi | Sonrası |
|---|---|---|
| creator ücreti kasası | 0.0058 SOL | 0.0007 SOL |
| escrow SOL | 0.0025 SOL | 0.0072 SOL |
| platform cüzdanı | 0.0100 SOL | 0.0104 SOL |

- escrow +0.0048 SOL (%93), platform +0.0004 SOL; programın kaydettiği toplam ücret: 0.0048 SOL
- 1 işlem: collect_fees (imzalar: ek, adım 8)

### 9. Topluluk bağışı ve parça parça geri alım

Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi.

| | Öncesi | Sonrası |
|---|---|---|
| escrow SOL | 0.2072 SOL | 0.1307 SOL |
| havuz coin | 75.00M coin | 85.11M coin |

- Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.
- aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (0.1307 SOL = 0.1307 SOL)
- her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar
- 5 parça, toplam 0.0652 SOL harcandı, 10.11M coin alındı
- 6 işlem: 0.2 SOL eklendi; parça 1: 0.0129 SOL harcandı → +2.04M coin, sonraya 0.1819 SOL; parça 2: 0.0130 SOL harcandı → +2.03M coin, sonraya 0.1676 SOL; parça 3: 0.0130 SOL harcandı → +2.02M coin, sonraya 0.1545 SOL; parça 4: 0.0131 SOL harcandı → +2.01M coin, sonraya 0.1414 SOL; parça 5: 0.0132 SOL harcandı → +2.00M coin, sonraya 0.1283 SOL (imzalar: ek, adım 9)

### 10. Hacim tetikleyiciyi kurdu

Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez).

- tür: hacim, serbest bırakılacak: 851.1K coin (havuzun %1'i)
- dağıtım ~16 sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)
- erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz
- 1 işlem: check_trigger (imzalar: ek, adım 10)

### 11. Süre doldu, dağıtım serbest bırakıldı

Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı.

| | Öncesi | Sonrası |
|---|---|---|
| dağıtıma açık coin | 0 coin | 851.1K coin |

- 1 işlem: fire_trigger (imzalar: ek, adım 11)

### 12. Holder listesi ve paylar hesaplandı

Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı.

- Ayşe (2Xag…qVFr): 74.54M coin, 543 sn tutuyor, ağırlık %21.7 → pay 85.1K coin (%10.0) ← tavan
- Burak (CUSZ…9bSJ): 50.03M coin, 539 sn tutuyor, ağırlık %14.4 → pay 85.1K coin (%10.0) ← tavan
- Ceren (84b1…iE5s): 43.34M coin, 534 sn tutuyor, ağırlık %12.4 → pay 85.1K coin (%10.0) ← tavan
- Küçük-1 (5qHy…KnQm): 33.44M coin, 525 sn tutuyor, ağırlık %9.4 → pay 85.1K coin (%10.0) ← tavan
- Küçük-2 (4wsG…Lp9i): 29.72M coin, 520 sn tutuyor, ağırlık %8.3 → pay 85.1K coin (%10.0) ← tavan
- Küçük-3 (ApLA…amht): 26.58M coin, 511 sn tutuyor, ağırlık %7.3 → pay 85.1K coin (%10.0) ← tavan
- Küçük-4 (9qFw…tGuv): 23.92M coin, 506 sn tutuyor, ağırlık %6.5 → pay 83.1K coin (%9.8)
- Küçük-5 (D9ia…USAK): 21.64M coin, 501 sn tutuyor, ağırlık %5.8 → pay 74.4K coin (%8.7)
- Küçük-6 (AqmB…DL8W): 19.67M coin, 497 sn tutuyor, ağırlık %5.2 → pay 67.1K coin (%7.9)
- Küçük-7 (GZmW…g5CX): 17.95M coin, 493 sn tutuyor, ağırlık %4.7 → pay 60.7K coin (%7.1)
- Küçük-8 (FjYo…LQkx): 16.45M coin, 488 sn tutuyor, ağırlık %4.3 → pay 55.1K coin (%6.5)
- Deniz (B3uq…ATCt) listede YOK — hepsini sattığı için
- serbest 851.1K coin, dağıtılan 851.1K coin; tavanın tuttuğu 0 coin havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)
- dev cüzdanı hazine sayılır, listede yok. kök: bbe09c1f1a6e852d… slot 497932819

### 13. Paylaşım zincire mühürlendi

Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Rastgelelik yok, seçim yok.

- zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu
- 11 holder, 851.1K coin dağıtımda, tavan cüzdan başına 85.1K coin
- 1 işlem: open_round (imzalar: ek, adım 13)

### 14. Satan cüzdan pay alamadı

Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti.

- reddedildi (BadProof): Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı

### 15. Herkes kendi payını aldı

Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz.

| | Öncesi | Sonrası |
|---|---|---|
| Ayşe (2Xag…qVFr) coin | 74.54M coin | 74.63M coin |
| Burak (CUSZ…9bSJ) coin | 50.03M coin | 50.11M coin |
| Ceren (84b1…iE5s) coin | 43.34M coin | 43.42M coin |
| havuz coin | 84.26M coin | 84.26M coin |

- Burak (CUSZ…9bSJ) ikinci kez denedi → reddedildi (makbuz zaten var)
- 11/11 holder aldı, 851.1K coin / 851.1K coin
- 11 işlem: Burak (CUSZ…9bSJ) +85.1K coin; Küçük-3 (ApLA…amht) +85.1K coin; Ceren (84b1…iE5s) +85.1K coin; Küçük-1 (5qHy…KnQm) +85.1K coin; Küçük-2 (4wsG…Lp9i) +85.1K coin; Ayşe (2Xag…qVFr) +85.1K coin; Küçük-4 (9qFw…tGuv) +83.1K coin; Küçük-5 (D9ia…USAK) +74.4K coin; Küçük-6 (AqmB…DL8W) +67.1K coin; Küçük-7 (GZmW…g5CX) +60.7K coin; Küçük-8 (FjYo…LQkx) +55.1K coin (imzalar: ek, adım 15)

## Sonuç

| | |
|---|---|
| Havuza kilitlenen | 85.11M coin |
| Ücretlerden toplanan | 0.0048 SOL |
| Geri alıma harcanan | 0.0652 SOL → 10.11M coin havuza eklendi |
| Bu turda dağıtılan | 851.1K coin |
| Havuzda kalan | 84.26M coin |
| Süre | 321 sn |

Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.

## Web'de görmek

`cd web && npm run dev:local` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/GvF6QdUih9NYU6p5JiQQJQoNLmaZQhe2gPH85fwZNQn6 (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).
Bir payı web'den claim etmek için demoyu `DEMO_LEAVE_LAST=1 npm run demo` ile koş; cüzdanın anahtarı `demo-wallets.json` içine yazılır, Phantom'a aktarıp butona basarsın.

## Ek: işlem imzaları

Doğrulamak için: `solana confirm -v <imza> --url devnet` ya da explorer linkleri.

**Adım 1 — Hazırlık**

- set_platform: [`5xr8j2aLsMNDf6xwdwPn…`](https://explorer.solana.com/tx/5xr8j2aLsMNDf6xwdwPn6dq3f5a6h2wEJopiDqrN1v5CgYNZs97hdUEwMohBtxhfuqX5nspB91kyPwo4y1UJTP5C?cluster=devnet)
- lookup_table: [`3ax7WwWjXw2SrmC3rZTA…`](https://explorer.solana.com/tx/3ax7WwWjXw2SrmC3rZTAqFbKDpq5bWCtwW4o8ATRpWZHg4UENGBqVWcgWcakKbvJPTiH1fFrsE5hLvfXeuPw8ofx?cluster=devnet)

**Adım 2 — Coin basıldı, %30'u kilitlendi: %25 holder havuzu + %5 sabit liste**

- launch: [`2XVR67XT1gwR3BbucqLs…`](https://explorer.solana.com/tx/2XVR67XT1gwR3BbucqLsxMuDRoCxKAC1mfd7ENn2udyy21xW8xjWLKzG5TdaHhUiHZfbiDK1YkSxx7Leorbm2ZvU?cluster=devnet)

**Adım 3 — Ücret paylaşımı kuruldu: %90 havuz, %10 platform**

- setup_fee_sharing: [`3syFo5z8YsD6x3EZ61oL…`](https://explorer.solana.com/tx/3syFo5z8YsD6x3EZ61oLvNTej7Ak3D7zcLsBVhVHJJFaRXekVUjGvCrX27VkzZLHgj3jX2TtvT6EiRhZJBoJ5KEd?cluster=devnet)

**Adım 4 — Sabit liste zincirde, Ekip-1 payını aldı**

- publish_manual_list: [`5iRGLw85pUzfAiSzoJog…`](https://explorer.solana.com/tx/5iRGLw85pUzfAiSzoJog5dXHhNN3XhQZUmfNr7DMkqe4GiqZVwivCkXryi6VGi8gbcDkMLQFF9TndfjdZXnPx6to?cluster=devnet)
- claim_manual (Ekip-1): [`2PEazzVp2YUMq5Gnpk2B…`](https://explorer.solana.com/tx/2PEazzVp2YUMq5Gnpk2BQUGRasxFfWvvSrnFBn5saoL9WvfJat3t8CoWTNx3d7pBFkQtGq9R1Z2KpwFn251Ra8St?cluster=devnet)

**Adım 5 — On iki cüzdan piyasadan aldı**

- Ayşe 0.15 SOL ile aldı → 74.54M coin: [`2GL83jaNg7i4LSBd7BVp…`](https://explorer.solana.com/tx/2GL83jaNg7i4LSBd7BVpjVmSZkko6Ev3vXoVh6hneZ1kwWJF39QWpomhCgK1mzaK1963o5xwM357WQy6FiYQ8oZa?cluster=devnet)
- Burak 0.12 SOL ile aldı → 50.03M coin: [`ozHPY53SYsU2CdLEeu42…`](https://explorer.solana.com/tx/ozHPY53SYsU2CdLEeu42BemBhSKGgNG4WZphfebtQ1pPk7S5aLmdDPdenCP7pyYN9sa5Bx1Vp5GeajLf9ac9GuD?cluster=devnet)
- Ceren 0.12 SOL ile aldı → 43.34M coin: [`MVK17JyLDvgT7qB3E4xt…`](https://explorer.solana.com/tx/MVK17JyLDvgT7qB3E4xtQsosGiZaL2a1viSS1oi6hBpvvC4n3JaY1atnpfuEXsZTPwg2NDznJ2AChUa4PxDY9ub?cluster=devnet)
- Deniz 0.12 SOL ile aldı → 37.91M coin: [`5tLyAvccSdm8s65H7mVm…`](https://explorer.solana.com/tx/5tLyAvccSdm8s65H7mVmRbA3y8ajsMeGZKiXizbat374CRfx3pT7Qa71TRhbbwM7cWcPWAR5XN8DgtZqHfJhNpaC?cluster=devnet)
- Küçük-1 0.12 SOL ile aldı → 33.44M coin: [`36YUDTpkZyt15Sjxvnc2…`](https://explorer.solana.com/tx/36YUDTpkZyt15Sjxvnc2Y74PxHHaFrNxDJCtPC6dHArVcVNUfHi9ncn3iCgKhpmDjafknWsDKSATfuj54DrrvmVB?cluster=devnet)
- Küçük-2 0.12 SOL ile aldı → 29.72M coin: [`2RxQpKvGcPvHdHPWiQ2n…`](https://explorer.solana.com/tx/2RxQpKvGcPvHdHPWiQ2n6PmZypcoGvBwzseNedQhEWYcc3jQQvebWGYQcYHriffWHv4DF9Njwwp7mRpNHdLGmSpv?cluster=devnet)
- Küçük-3 0.12 SOL ile aldı → 26.58M coin: [`3Md16PkV3VbgL1tiHYAe…`](https://explorer.solana.com/tx/3Md16PkV3VbgL1tiHYAeEuNshJdWodN9wEXnipFttYSkfjWUn838ZRUe4kBhxQiKPJumYZYhTyRAjESFPLhjGSHd?cluster=devnet)
- Küçük-4 0.12 SOL ile aldı → 23.92M coin: [`53HAWfervr7aTwjWrVgJ…`](https://explorer.solana.com/tx/53HAWfervr7aTwjWrVgJQXh3z9CTHXDx6kzUa98kWD49SCosFZTEdJT5UXakBE77Zys7DJ11LWQu7EFpFz81MZph?cluster=devnet)
- Küçük-5 0.12 SOL ile aldı → 21.64M coin: [`smit2gHiiMmQubm4JgZe…`](https://explorer.solana.com/tx/smit2gHiiMmQubm4JgZeQrcCHpkoo6BYoZcTLDQfuwy4jjExJhRwGDTYyLcSigc2NNsA6NgQ4CNNcsa3j1rAnjz?cluster=devnet)
- Küçük-6 0.12 SOL ile aldı → 19.67M coin: [`3A1kUHG6pZp6rPnjPaQQ…`](https://explorer.solana.com/tx/3A1kUHG6pZp6rPnjPaQQLyX95tna6QAMVQBKvz94nWRPDypfzDNZxxbA2CMwUzQiV4eABT53pyqW5XNhbYPiRe9q?cluster=devnet)
- Küçük-7 0.12 SOL ile aldı → 17.95M coin: [`PERGKkQEv8BjjAVJ1wV7…`](https://explorer.solana.com/tx/PERGKkQEv8BjjAVJ1wV7o6xKG4VajU8C1VGwN9gkKgJdpytCiKFqTD5MNPxVUuGidUF8FXeaj2iSnbGACpokbA2?cluster=devnet)
- Küçük-8 0.12 SOL ile aldı → 16.45M coin: [`5kHcHmeLtQTovErdHWGo…`](https://explorer.solana.com/tx/5kHcHmeLtQTovErdHWGo5kp4M8owAdCuN1tAWT2vrxSE4oVnDR9uZLMCVuc7uJgf8SYrekbv39y5kg8F1RaUSsMz?cluster=devnet)

**Adım 6 — Tetikleyici başlangıç noktası**

- set_delay_window: [`5nWsF6XMa3FjNSzcbPGF…`](https://explorer.solana.com/tx/5nWsF6XMa3FjNSzcbPGFCvFg67tRdTu6EyuhFjQ7cgqiDjyQYHyiiW9UUdXBUUTEXm6NHmPq91J8Kfjimj4eux7d?cluster=devnet)
- check_trigger: [`5XYcQw6hkoAayoY98FQy…`](https://explorer.solana.com/tx/5XYcQw6hkoAayoY98FQyqjLqtg7brZcBnvrGX1bKumomBPkSX6rcEG8cMHc369BatMt9ZUcUbkjbB4cYov8VqeXn?cluster=devnet)

**Adım 7 — Deniz hepsini sattı**

- sell: [`2sRdEfuhHqJ9gmSTnv1G…`](https://explorer.solana.com/tx/2sRdEfuhHqJ9gmSTnv1GsH8ps6oo3aehDbmGAApNsnACi8uSyNtyHTL3BCGExnapF7aB1TGYyMcqnbwtuEGU1gUW?cluster=devnet)

**Adım 8 — Biriken ücret dağıtıldı: %90 havuza, %10 platforma**

- collect_fees: [`5MQKf61V2S6CHGLCsmzD…`](https://explorer.solana.com/tx/5MQKf61V2S6CHGLCsmzDA9u6ZJi1Ki5GS2RLsksThVE4fad3xnUmbb6asiGtpkDmqt3fDR6drNiM5G2U4EsZJ7oW?cluster=devnet)

**Adım 9 — Topluluk bağışı ve parça parça geri alım**

- 0.2 SOL eklendi: [`2RVfz8Qdjao5wUxixryd…`](https://explorer.solana.com/tx/2RVfz8Qdjao5wUxixrydbqGaWf4BsmiBk8UT118yb2oCy6tZ7cN4ZyoYdqXmpXRxFj9wVSGqmsFFE6GGy5Zt9w9w?cluster=devnet)
- parça 1: 0.0129 SOL harcandı → +2.04M coin, sonraya 0.1819 SOL: [`5DX3CWkRZ2oauq1nXssw…`](https://explorer.solana.com/tx/5DX3CWkRZ2oauq1nXsswWxJ7o9jpSQZdHMvpiJH4reeJo7zriWCf4Qq3d43z9CmcUJSoh2Vqv77LM7byrCjqQPym?cluster=devnet)
- parça 2: 0.0130 SOL harcandı → +2.03M coin, sonraya 0.1676 SOL: [`3coGNqb7ZARPTTYQydPj…`](https://explorer.solana.com/tx/3coGNqb7ZARPTTYQydPjJfPsZrHrd2bjeyEeAqPMGrg4zHTYJ3oLxAR42T9FRokbbQbvPNF6jqPbUmU9vDM7Zs8C?cluster=devnet)
- parça 3: 0.0130 SOL harcandı → +2.02M coin, sonraya 0.1545 SOL: [`BgRcoAEahb73a8dp1Vdj…`](https://explorer.solana.com/tx/BgRcoAEahb73a8dp1Vdj17xmkCZv3PAuLtr5E2kTJU4TFxT7c4sTdy4rmmi9UCm7T2vLWECPWAjkhJ9twCj3gMy?cluster=devnet)
- parça 4: 0.0131 SOL harcandı → +2.01M coin, sonraya 0.1414 SOL: [`5kr9VcMPRVC72ptyZMbL…`](https://explorer.solana.com/tx/5kr9VcMPRVC72ptyZMbLk85eknK488aKw4NawDQVaa1XQHrQYardaA1iCkVwRYYSeXyibPvCsfD72DWeJbTVrHqz?cluster=devnet)
- parça 5: 0.0132 SOL harcandı → +2.00M coin, sonraya 0.1283 SOL: [`4PskwP2cPeXo6hZjLaPe…`](https://explorer.solana.com/tx/4PskwP2cPeXo6hZjLaPexnDJJnn6yaJZNJCYXrZyzMrTj9ZGxzRk7xHjx9yjkaDFwSBw8KENmticmAVwpFy94BCq?cluster=devnet)

**Adım 10 — Hacim tetikleyiciyi kurdu**

- check_trigger: [`3YQQbUeGBhVFCBZcRiDg…`](https://explorer.solana.com/tx/3YQQbUeGBhVFCBZcRiDg9hNQzef6PkeEvFJCNWUfX687F9okLsiCQEYbMo5HBcLGh1NHJB96Je6q8jqqgbhzwmyj?cluster=devnet)

**Adım 11 — Süre doldu, dağıtım serbest bırakıldı**

- fire_trigger: [`2KAE8DD7PpCQD4pjF3eY…`](https://explorer.solana.com/tx/2KAE8DD7PpCQD4pjF3eY9Xs1xoiVXRxtfni7pWmcmh4sncBY9373b84t1S2knXNq75QpmwAAbLAvoFTDco4vu3G7?cluster=devnet)

**Adım 13 — Paylaşım zincire mühürlendi**

- open_round: [`55s1RTiNdLrrdySs5puv…`](https://explorer.solana.com/tx/55s1RTiNdLrrdySs5puvDPMANUWJYjhYMxReMLxqTghFVJ7DmJDpsWZwvBMYcD1mFfcTKWxWfVznPxhHh9DMKwDo?cluster=devnet)

**Adım 15 — Herkes kendi payını aldı**

- Burak (CUSZ…9bSJ) +85.1K coin: [`5tutWcPeDSSuKyQwTdiL…`](https://explorer.solana.com/tx/5tutWcPeDSSuKyQwTdiLgf25acE6fpfZBVG9wTNtJRFws8MLHKGrmsb8bF9eCt6ViXtrfmawhS7Leqq52N53kd4v?cluster=devnet)
- Küçük-3 (ApLA…amht) +85.1K coin: [`5CSLhY9Ya3uFdgfPCKvM…`](https://explorer.solana.com/tx/5CSLhY9Ya3uFdgfPCKvMrERJXw494jEVNUjuTBLVxxVpwEqaQn3PDdqoU5NvMw4D4sb6u5F96FQo9ocsdrkU167h?cluster=devnet)
- Ceren (84b1…iE5s) +85.1K coin: [`2EJYWhKNz6DJshXqTkR4…`](https://explorer.solana.com/tx/2EJYWhKNz6DJshXqTkR46XPeQK5socoE4DKbDSEZ5k2T1L4UmWNqnA1dNpwkNXwKm3ep8kTP2SG1nMW2BkRFJLqr?cluster=devnet)
- Küçük-1 (5qHy…KnQm) +85.1K coin: [`5Q2b7oUfbcCuNbk9x2kk…`](https://explorer.solana.com/tx/5Q2b7oUfbcCuNbk9x2kk9C2j7FsbX3pJpz9xLT3fDEh5Ggyb5TvJ6kuyaaTWXn9ybmn1r5ns6paVUPC49fW3djMz?cluster=devnet)
- Küçük-2 (4wsG…Lp9i) +85.1K coin: [`2d9CM4PvN5PkpvMcKWhb…`](https://explorer.solana.com/tx/2d9CM4PvN5PkpvMcKWhbXKrsMmRofKntCaGQnFYmfh9GdHf6SrXWzZsJF1wbZnhNQVdfw5iC4Gh1Vu2o4xT9ktYU?cluster=devnet)
- Ayşe (2Xag…qVFr) +85.1K coin: [`5sitmNVKK2hZLddV7WxP…`](https://explorer.solana.com/tx/5sitmNVKK2hZLddV7WxPETdkpYmPnwh7SUwuibYyLJNmFH2PZxnY1Kph6BpQy8wm4CBLbMjMcMHtt2xjCj9PfWtT?cluster=devnet)
- Küçük-4 (9qFw…tGuv) +83.1K coin: [`2HYJ1FocVKc9Dm5RYMPU…`](https://explorer.solana.com/tx/2HYJ1FocVKc9Dm5RYMPUPdrHbbfpQcE4kio7iH14Hm6MF59ZckjVV1ExRJWynSF36x5DhkeRiZB5oXib24RsHtJd?cluster=devnet)
- Küçük-5 (D9ia…USAK) +74.4K coin: [`5NGj4Xwm36cF9r7dTXZ5…`](https://explorer.solana.com/tx/5NGj4Xwm36cF9r7dTXZ5fv1avJJH5rJdomnjuXyVPXSHkPVExexuLurNaFeQZEyzk1ZPe5xThSrbU7C781BToTyb?cluster=devnet)
- Küçük-6 (AqmB…DL8W) +67.1K coin: [`314v7qU8TRqY1biF4kPY…`](https://explorer.solana.com/tx/314v7qU8TRqY1biF4kPYTLgNvNC1GsvknnihHjByZhYBHbaonH76h48oACLMziVBtfxdj4bvaa2KMkck2DEbc3Vi?cluster=devnet)
- Küçük-7 (GZmW…g5CX) +60.7K coin: [`DMjuJ1FnD3a8wtXHG9eQ…`](https://explorer.solana.com/tx/DMjuJ1FnD3a8wtXHG9eQpPXFoCUjFjAUxdzsBNyjkajochxUNKdkt9eAiVawtb2c1hTEDHa2gJDZ1P111RCvEAj?cluster=devnet)
- Küçük-8 (FjYo…LQkx) +55.1K coin: [`5UYv1hMRpLqmsvWUt64b…`](https://explorer.solana.com/tx/5UYv1hMRpLqmsvWUt64bzCXt5y8usbgU5gAC4r6FkHQnrvY6KnxF6nAXqiREmH3H3XcCNnjBMAXo5pAfd532USuz?cluster=devnet)
