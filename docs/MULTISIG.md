# Platform yetkisini Squads multisig'e taşıma

Programın `Config.platform` anahtarı tek bir cüzdandır: launch'ları durdurur
(`set_paused`), publisher listesini yazar, ücret / kilit tavanı / taban
değişikliklerini önerir, takılan coin'lere `intervene` eder. Bu anahtarın tek
bir sıcak cüzdanda kalması yerine 2/3 bir Squads kasasında durmasını istiyoruz.
Rehber üç parça: kasayı kurmak, yetkiyi devretmek, sonrasında kasadan işlem
imzalamak. Localnet provası `tests/multisig.ts`'te.

Programın gözünden bir Squads kasası sıradan bir imzacıdır (kasa PDA'sı CPI ile
imzalar), o yüzden program tarafında değişiklik gerekmez.

## 0. Hangi anahtar ne yapar

| Anahtar | Ne yapar | Nerede durmalı |
|---|---|---|
| **upgrade authority** | programı yükseltir, `set_platform`, `migrate_config` | Squads kasası (bu rehberin sonunda) |
| **platform** (`Config.platform`) | pause, publishers, propose-*, `intervene`, test düğmeleri | Squads kasası (bu rehber) |
| **platform fee wallet** | pump'ın ödediği ücret payını alır | kasanın kendisi olabilir (SOL alır) |
| **crank** | `open_round`, `setup_fee_sharing`, `collect_fees`, trigger | sıcak, düşük bakiye; `set_publishers` ile listeye eklenir |

Kasa `open_round` imzalamaz: round açmak günlük iş, iki imza beklemez. Bu yüzden
devirden sonra `set_publishers <kasa>,<crank>` şart (aşağıda adım 3.4).

## 1. Squads'ta 2/3 kasa kurma

Squads v4, https://app.squads.so (program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`,
mainnet ve devnet'te aynı; devnet'te prova için uygulamada ağı değiştirin).

**Üyeler — öneri: Phantom (sıcak) + Ledger + yedek, eşik 2/3**

1. **Phantom** — günlük kullanılan tarayıcı cüzdanı. Öneriyi *oluşturan* ve
   ilk imzayı atan bu olur. Bu cüzdan çalınsa bile tek başına hiçbir şey yapamaz.
2. **Ledger** — Solana uygulaması yüklü donanım cüzdanı. Squads'a Ledger ile
   bağlanmak için Phantom'daki "Connect hardware wallet" ya da doğrudan
   Ledger adaptörü. Ledger Solana uygulamasında **Settings → Allow blind
   signing → Yes** açık olmalı; Squads işlemlerini Ledger ekranda çözemez,
   çözemediğini imzalamayı kapalı tutarsa reddeder.
3. **Yedek** — ikinci bir Ledger ya da çevrimdışı üretilmiş (`solana-keygen
   new -o backup.json`, kağıda yazılıp kasaya konmuş) bir anahtar. Ledger
   kaybolursa Phantom + yedek ile kasa yönetilir; asla "Phantom + Phantom'un
   seed'inden türetilmiş ikinci hesap" olmasın, aynı seed tek anahtar sayılır.

**Kurulum**

1. Phantom ile app.squads.so'ya bağlan → **Create Squad**.
2. Ad ver, üç üyenin pubkey'ini ekle (Ledger ve yedek için sadece adres yeter,
   bağlanmaları gerekmez). Eşik: **2**. Time lock: şimdilik 0 (istenirse
   sonradan artırılır; 7 günlük gecikmeyi zaten program uyguluyor).
3. Kira + oluşturma ücreti (küçük, ~0.05–0.1 SOL) öde, onayla.
4. Squad açılınca **Treasury / Vault** sayfasındaki **vault adresini** kopyala.
   Dikkat: Squads'ın iki adresi var — *multisig* adresi (ayar hesabı) ve
   *vault* adresi (para tutan, imza atan PDA). Programa verilecek olan
   **vault**. Devnet'te `solana account <vault>` ile hesabın var olduğunu gör
   (boş olabilir; kasa PDA'sı ilk SOL'ünü alınca oluşur, ücret cüzdanı olarak
   kullanılacaksa 0.01 SOL yollayıp aç).
5. Ledger ile bir kez bağlanıp kasayı gördüğünden emin ol (imza atmadan). Şu
   an bir şey imzalanmıyor, ama ilk gerçek öneride "Ledger tanımıyor" sürpriziyle
   karşılaşmamak için.

**Prova (devnet):** küçük bir SOL transferi önerisi aç, Phantom ile onayla,
Ledger ile onayla, execute et. 2/3'ün gerçekten çalıştığını gördükten sonra
mainnet'e geç.

## 2. Yetkiyi kasaya devretme: `set_platform`

`set_platform`'u yalnızca **upgrade authority** çağırabilir (`SetPlatform`
bağlamı `program_data.upgrade_authority_address` ile karşılaştırır). Şu an
upgrade authority sıcak deploy cüzdanınız olduğu için bu adım tek imzayla
biter; upgrade authority de kasaya geçtikten sonra (bölüm 4) bu çağrı da Squads
üzerinden yapılır.

```bash
# önce mevcut durumu gör
ANCHOR_PROVIDER_URL=$MAINNET_RPC_URL ANCHOR_WALLET=<upgrade-authority.json> \
  npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/config-admin.ts show

# platform = kasa, ücret cüzdanı = kasa (ya da ayrı soğuk cüzdan)
ANCHOR_PROVIDER_URL=$MAINNET_RPC_URL ANCHOR_WALLET=<upgrade-authority.json> \
  npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/config-admin.ts \
  set-platform <VAULT> <VAULT_veya_FEE_WALLET>
```

`set-platform` mevcut bir Config'te ücret oranı, tavan, taban, gecikme ve
`paused`'a dokunmaz (`fresh` yalnızca ilk oluşturmada); publisher listesine
kasayı ekler, **eski platform anahtarını listeden çıkarmaz** — adım 3.4'te
liste elle yazılır.

Doğrulama: `config-admin.ts show` → `platform` = vault. Sonra eski anahtarla
bir `pause` denemesi `NotPlatform` ile düşmeli (localnet provası bunu yapıyor).

**Bilinmesi gereken:** her coin launch anında `Config.platform`'u kendi
`Escrow.platform` alanına kopyalar; `intervene`, `set_day_window`,
`set_delay_window` **escrow'daki** anahtara bakar. Devirden önce launch edilmiş
coin'lerde bu çağrılar eski anahtarda kalır. Devri ilk mainnet coin'inden önce
yapın; yapılamadıysa eski anahtarı imha etmeyin, eski coin'ler için gerekir.

## 3. Kasadan işlem imzalama (propose / apply / pause / publishers)

Platform-only bir işlem, imzacısı kasa olan bir transaction olarak Squads'ta
**öneri**ye dönüşür: bir üye oluşturur, eşik kadar üye onaylar, herhangi bir
üye execute eder; execute sırasında kasa PDA'sı programımıza CPI ile imza atar.

### 3.1 İşlemi üret

`config-admin.ts`, `SQUADS_VAULT` verildiğinde platform-only komutları
göndermek yerine kasa imzacı olacak şekilde kurar ve **imzasız base58** basar:

```bash
export SQUADS_VAULT=<VAULT>
export ANCHOR_PROVIDER_URL=$MAINNET_RPC_URL     # ANCHOR_WALLET herhangi biri olabilir, imza atılmaz

config-admin.ts propose-min-position 200000000   # taban 0.2 SOL öner
config-admin.ts propose-cap 100000000000         # tavan 100 SOL öner
config-admin.ts propose-fee 800                  # ücret %8 öner
config-admin.ts pause | unpause
config-admin.ts set-publishers <VAULT>,<CRANK>
```

Çıktı: `Squads'a aktarilacak islem (imzasiz, <VAULT> imzalar): <base58>`.
Blockhash sahte (sıfır) — Squads execute anında kendi blockhash'ini koyar,
yalnızca instruction'lar taşınır.

### 3.2 Squads'ta öneri oluştur

1. app.squads.so → ilgili Squad → **Developers → TX Builder** (Transaction
   Builder).
2. **Import** (base58 serialized transaction) → base58'i yapıştır. Ekranda tek
   instruction, program `5iJy…` (mainnet'te mainnet id'si), hesaplar
   `platform = <VAULT>`, `config = <CONFIG PDA>` görünmeli. Program id'yi ve
   config PDA'sını `config-admin.ts show` çıktısıyla karşılaştır.
3. **Create proposal** → Phantom imzalar (öneri kaydı için ufak kira).

### 3.3 Onay ve execute

1. Phantom **Approve** (1/2).
2. Ledger ile bağlan → **Approve** (2/2). Ledger "blind signing" uyarısı
   verir; Squads önerisi olduğunu bildiğin için onayla.
3. Eşik dolunca **Execute** — herhangi bir üye, ücreti o öder. Execute'un
   program logunda `MinPositionProposed` / `LockCapProposed` /
   `PublishersSet` event'i görünür; `config-admin.ts show` `pending…` ve
   `…EffectiveSlot` alanlarını gösterir.

Öneri reddedilirse ya da yanlış üretildiyse **Reject / Cancel**; zincire hiçbir
şey yazılmaz.

### 3.4 Publisher listesi (devirden hemen sonra)

`set-publishers <VAULT>,<CRANK>` önerisini yukarıdaki gibi geçir. Crank listede
yoksa `open_round`'u "not on the publisher list" diye atlar. Eski platform
anahtarı listeden böylece düşer.

### 3.5 `apply-*` kasadan geçmez

`apply_min_position`, `apply_lock_cap`, `apply_platform_fee` izin gerektirmez:
gecikme (7 gün, `feeDelaySlots`) dolunca herhangi bir cüzdan çağırır.

```bash
unset SQUADS_VAULT
ANCHOR_WALLET=<herhangi.json> config-admin.ts apply-min-position
```

Crank'in ya da bir cron'un günlük `apply-*` denemesi yeterli; erkense
`…TooEarly` ile düşer, zararsız.

### 3.6 Acil durum: pause

`pause` da kasadan geçer, yani iki imza ister. Ledger'ı olan kişi
ulaşılamazsa Phantom + yedek anahtar 2/3'ü tamamlar — yedeğin *nerede* olduğu
ve *kimin* açabildiği yazılı olsun. Pause yalnızca yeni launch'ları durdurur;
claim / trigger / dağıtım hiçbir zaman durmaz.

## 4. Sonrası: upgrade authority'yi de kasaya taşımak

`MAINNET_CHECKLIST.md`'nin istediği gibi, deploy'dan hemen sonra:

```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <VAULT> --skip-new-upgrade-authority-signer-check \
  --url $MAINNET_RPC_URL --keypair <upgrade-authority.json>
solana program show <PROGRAM_ID> --url $MAINNET_RPC_URL   # Authority: <VAULT>
```

Bundan sonra:
- **Program yükseltme:** sıcak cüzdanla `solana program write-buffer
  airdrop_escrow.so` → `solana program set-buffer-authority <BUFFER>
  --new-buffer-authority <VAULT>` → Squads **Developers → Programs → Upgrade**
  (program + buffer adresi) → 2/3 onay → execute.
- **`set_platform` / `migrate_config`:** artık upgrade authority = kasa, bu
  çağrılar da Squads'tan geçer. `config-admin.ts`'in `SQUADS_VAULT` yolu
  şimdilik yalnızca platform-only komutları dışa aktarır; bu ikisi için
  transaction'ı `authority = <VAULT>` ile elle kurmak gerekir (test'teki
  `setPlatform` yardımcısı gibi, `.instruction()` alıp base58'e çevir).

## 5. Localnet provası

`tests/multisig.ts` — Squads olmadan, kasa yerine geçici bir keypair ile:

1. `set_platform → vault` (upgrade authority imzalar); ücret cüzdanı da vault.
2. Eski platform anahtarı `propose_min_position`, `propose_lock_cap`,
   `propose_platform_fee`, `set_paused`, `set_publishers`, `set_fee_delay`'de
   `NotPlatform` ile reddedilir.
3. `config-admin.ts`'in Squads çıktısıyla aynı biçimde üretilen imzasız base58
   işlem çözülür, vault imzalar, gönderilir → `pendingMinPositionLamports`
   yazılır.
4. Gecikme dolunca yabancı bir cüzdan `apply_min_position` çağırır; ne eski
   anahtar ne vault `set_platform`'u geri alabilir (`NotUpgradeAuthority`).

```bash
scripts/localnet.sh &    # bkz. README
HELIUS_RPC_URL=http://127.0.0.1:8899 ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  ANCHOR_WALLET=~/.config/solana/id.json npx ts-mocha -p ./tsconfig.json -t 300000 tests/multisig.ts
```

## Kontrol listesi

- [ ] Squad 2/3: Phantom + Ledger + yedek; devnet'te bir transfer provası geçti
- [ ] Ledger'da blind signing açık; yedek anahtarın yeri ve erişimi yazılı
- [ ] `set-platform <VAULT> <FEE>` → `show`: platform = vault
- [ ] eski anahtarla `pause` → `NotPlatform`
- [ ] `set-publishers <VAULT>,<CRANK>` önerisi execute edildi; crank round açıyor
- [ ] upgrade authority → vault (`solana program show`)
- [ ] eski platform anahtarı: devirden önce launch edilmiş coin varsa saklandı, yoksa imha
