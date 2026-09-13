# crank

Programın izinsiz instruction'larını düzenli çağıran küçük keeper. Herkes
kendi cüzdanıyla çalıştırabilir; cüzdan yalnızca işlem ücretini öder, hiçbir
karar vermez — eşikler ve gecikmeler zincirde.

Dakikada bir, programın çıkardığı **her coin** için:

| adım | ne zaman |
|---|---|
| `setup_fee_sharing` | ücret paylaşımı kurulmamış her normal coin için bir kez: pump'ta creator ücretini %90 escrow / %10 platform böler (crank rent'i öder, kullanılmayanı geri alır); holder-rewards coin'de yapılmaz |
| `collect_fees` | pump creator kasasında rent üstünde ≥ 0,0012 SOL birikmişse (pump ~0,0019 SOL altını dağıtmıyor); pay sahipleri coin'in pump'taki sharing config'inden okunur; holder-rewards coin'de yapılmaz |
| `buyback` | escrow'un harcanabilir SOL'ü program eşiğini (0,01 SOL) geçiyorsa ve curve tamamlanmamışsa; holder-rewards coin'de yapılmaz |
| `check_trigger` | her zaman — hacim örneklemesi buradan geliyor |
| `fire_trigger` | tetikleyici kurulu **ve** slot ≥ `fire_slot` ise; erken asla çağrılmaz |
| `open_round` | fire sonrası `pending > 0` ise: indexer'la snapshot alır, serbest miktarı bakiye × tutma süresi oranında böler (cüzdan başına en fazla %10), kökü, miktarı ve snapshot slot'unu zincire yazar (`crank/snapshots/<mint>-<round>.json` dosyası kalır). Bekleyen miktar yalnızca bir önceki turun tavan artığıysa yeni tur açmaz |

`open_round` tek izinli adım: kök güven noktası olduğu için yalnızca coin'in
**dev'i veya platform yetkilisi** yazabilir. Crank'in cüzdanı ikisinden biri
değilse o adımı atlar ve `not dev or platform` diye loglar; diğer her şeyi yine
yapar.

```bash
# localnet
RPC_URL=http://127.0.0.1:8899 npm run crank
# devnet, kendi anahtarınla
RPC_URL=https://api.devnet.solana.com CRANK_KEYPAIR=~/keeper.json npm run crank
# cron için tek tur
npm run crank -- --once
```

Ortam: `RPC_URL`, `CRANK_KEYPAIR`, `CRANK_INTERVAL_MS` (60000),
`CRANK_SNAPSHOT_DIR`, `CRANK_LOG` (JSONL). Her olay tek satır: `tick coin action result …` ve varsa `sig`.
`fire_trigger` satırında `tx_slot` işlemin gerçekten indiği slot, `fire_slot`
ise programın koyduğu eşik.

## Simülasyon

`scripts/crank-sim.sh` — localnet'te iki coin çıkarır (platform yetkilisi =
crank cüzdanı), crank'i ayrı bir süreç ve **ayrı bir cüzdanla** başlatır,
5 dakika piyasa oynatır (HOT: sık alım + bağış + balina; SLOW: seyrek küçük
alım; iki de sabit holder). Kimse elle müdahale etmez: crank ateşler,
snapshot alır, payları böler, kökü yazar. Sonra script holder'ları oynar —
her round'u zincirdeki `snapshot_slot` ve `released`'dan yeniden kurar, kökü
karşılaştırır, payını claim eder — ve crank kaydını beklenenle karşılaştırıp
`crank/sim-report.md` yazar.

```bash
npm run crank:sim                      # 5 dk, SIM_MINUTES ile değişir
DEMO_WALLET=<Phantom adresin> npm run crank:sim
```

`DEMO_WALLET` verilirse o cüzdan da holder olur (SOL + dev'den 60M token) ve
payı **claim edilmeden bırakılır** — web sitesinden Phantom ile
claim etmek için.

## Phantom ile localnet

Solana Localnet seçeneği yalnızca **tarayıcı eklentisinde** var (mobilde yok)
ve `http://localhost:8899`'a bağlanır. Validator WSL2'de çalışıyor; Windows'ta
`localhost:8899` WSL2'ye otomatik yönlenir, ekstra ayar gerekmez.

1. Validator ve web ayakta olsun: `npm run crank:sim` (validator yoksa
   başlatır) ve ayrı bir terminalde `cd web && npm run dev:local`.
2. Phantom eklentisini aç → sol üstteki **profil avatarına** tıkla →
   **Settings** (Ayarlar).
3. **Developer Settings** (Geliştirici Ayarları) → **Testnet Mode** anahtarını
   aç.
4. Aynı ekranda açılan ağ listesinden **Solana** için **Localnet**'i seç
   (Devnet/Testnet'in yanında; listede yoksa Phantom'u güncelle).
   İstersen **Auto-Confirm on localhost** anahtarını da aç: localhost
   sitelerinde her imza için onay penceresi çıkmaz.
5. Ağ adının yanında "Localnet" görünmeli. Bakiye sıfır görünüyorsa
   `DEMO_WALLET=<adresin> npm run crank:sim` çalışmamış demektir — koşu
   cüzdana 2 SOL ve her coin'den 60M token gönderir.
6. http://localhost:3000 → koşuda çıkan coin'e (HOT/SLOW) tıkla →
   **Connect wallet** → Phantom. "Your share" kutusu snapshot'ı zincirden
   yeniden kurup sana düşen payı listeler (birkaç saniye sürer).
7. **Claim**'e bas → Phantom imza ister → onayla. Token bakiyen pay kadar
   artar; aynı tur ikinci kez claim edilemez.

Sorun giderme:
- Phantom "transaction may fail" diyorsa ağ hâlâ Devnet'tedir; 4. adımı
  kontrol et. İşlem yerel validator'da çalıştığı için başka bir ağda
  simüle edilemez.
- Site "opaque" round gösteriyorsa snapshot yeniden üretilememiştir; bu
  validator yeniden başlatıldıysa (`--reset` ledger'ı siler) olur, koşuyu
  tekrarla.
- Validator'ı yeniden başlatınca Phantom'daki eski coin bakiyeleri
  kaybolur; bu normal, ledger sıfırlanmıştır.
