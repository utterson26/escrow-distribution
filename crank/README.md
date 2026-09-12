# crank

Programın izinsiz instruction'larını düzenli çağıran küçük keeper. Herkes
kendi cüzdanıyla çalıştırabilir; cüzdan yalnızca işlem ücretini öder, hiçbir
karar vermez — eşikler ve gecikmeler zincirde.

Dakikada bir, programın çıkardığı **her coin** için:

| adım | ne zaman |
|---|---|
| `collect_fees` | pump creator kasasında ≥ 0,001 SOL birikmişse |
| `buyback` | escrow'un harcanabilir SOL'ü program eşiğini (0,01 SOL) geçiyorsa ve curve tamamlanmamışsa |
| `check_trigger` | her zaman — hacim örneklemesi buradan geliyor |
| `fire_trigger` | tetikleyici kurulu **ve** slot ≥ `fire_slot` ise; erken asla çağrılmaz |
| `open_round` | fire sonrası `pending > 0` ise: indexer'la snapshot alır, kökü ve snapshot slot'unu zincire yazar (`crank/snapshots/<mint>-<round>.json` dosyası kalır) |
| `draw` | kökü yazılmış ama çekilişi yapılmamış her round için, commit'ten en az bir slot sonra |

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

Ortam: `RPC_URL`, `CRANK_KEYPAIR`, `CRANK_INTERVAL_MS` (60000), `CRANK_WINNERS`
(round başına çekiliş, 8), `CRANK_SNAPSHOT_DIR`, `CRANK_LOG` (JSONL). Her olay tek satır: `tick coin action result …` ve varsa `sig`.
`fire_trigger` satırında `tx_slot` işlemin gerçekten indiği slot, `fire_slot`
ise programın koyduğu eşik.

## Simülasyon

`scripts/crank-sim.sh` — localnet'te iki coin çıkarır (platform yetkilisi =
crank cüzdanı), crank'i ayrı bir süreç ve **ayrı bir cüzdanla** başlatır,
5 dakika piyasa oynatır (HOT: sık alım + bağış + balina; SLOW: seyrek küçük
alım; iki de sabit holder). Kimse elle müdahale etmez: crank ateşler,
snapshot alır, kökü yazar, çekilişi yapar. Sonra script holder'ları oynar —
her round'u zincirdeki `snapshot_slot`'tan yeniden kurar, kökü karşılaştırır,
kazandığı çekilişleri claim eder — ve crank kaydını beklenenle karşılaştırıp
`crank/sim-report.md` yazar.

```bash
npm run crank:sim                      # 5 dk, SIM_MINUTES ile değişir
DEMO_WALLET=<Phantom adresin> npm run crank:sim
```

`DEMO_WALLET` verilirse o cüzdan da holder olur (SOL + dev'den 60M token) ve
kazandığı çekilişler **claim edilmeden bırakılır** — web sitesinden Phantom ile
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
   yeniden kurup kazandığın çekilişleri listeler (birkaç saniye sürer).
7. Her satırdaki **Claim**'e bas → Phantom imza ister → onayla. Token
   bakiyen ödül kadar artar; aynı çekiliş ikinci kez claim edilemez.

Sorun giderme:
- Phantom "transaction may fail" diyorsa ağ hâlâ Devnet'tedir; 4. adımı
  kontrol et. İşlem yerel validator'da çalıştığı için başka bir ağda
  simüle edilemez.
- Site "opaque" round gösteriyorsa snapshot yeniden üretilememiştir; bu
  validator yeniden başlatıldıysa (`--reset` ledger'ı siler) olur, koşuyu
  tekrarla.
- Validator'ı yeniden başlatınca Phantom'daki eski coin bakiyeleri
  kaybolur; bu normal, ledger sıfırlanmıştır.
