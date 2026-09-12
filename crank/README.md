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

```bash
# localnet
RPC_URL=http://127.0.0.1:8899 npm run crank
# devnet, kendi anahtarınla
RPC_URL=https://api.devnet.solana.com CRANK_KEYPAIR=~/keeper.json npm run crank
# cron için tek tur
npm run crank -- --once
```

Ortam: `RPC_URL`, `CRANK_KEYPAIR`, `CRANK_INTERVAL_MS` (60000), `CRANK_LOG`
(JSONL). Her olay tek satır: `tick coin action result …` ve varsa `sig`.
`fire_trigger` satırında `tx_slot` işlemin gerçekten indiği slot, `fire_slot`
ise programın koyduğu eşik.

## Simülasyon

`scripts/crank-sim.sh` — localnet'te iki coin çıkarır, crank'i ayrı bir
süreç ve **ayrı bir cüzdanla** başlatır, 10 dakika piyasa oynatır (HOT: sık
alım + bağış + balina; SLOW: seyrek küçük alım) ve crank kaydını beklenenle
karşılaştırıp `crank/sim-report.md` yazar.
