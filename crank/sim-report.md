# Crank simülasyonu — 2026-09-12T08:05:12.568Z

Localnet, 5 dk, crank aralığı 60 sn, gecikme penceresi 100 slot.
Crank cüzdanı `9VEEK7BmwoiMw7GckqWsLEDc8jKRAEU1oDagKBBjmsM7` (dev değil; program config'inde platform yetkilisi), trader `BfmYuD271T6hYrkthAmGP6beupi5XmFneHZ3mQYjjhzS`, sabit holder'lar `FjGQ1N6w7niXr5C6wYb1XykyjHWdsVWkLCjgV7k8Ercm`, `F9AfKFc9ytAp8xCJHKS8r6GBzXKhsEykScbV9VCGdJxG`.

- HOT: mint `FG2FGH2yQbXMwGhyyfb7uKotQiJvD7YMRgagFtnCB3pb`, escrow `A41ieZFENnBk1aqpu2Fpo7XJHXKgp3sWTSfsVKtft95h`
- SLOW: mint `LXEGQSXWEirUBVukL2thfqf8RkV2UGi2VNGNDoYDPsq`, escrow `BzyuMn1wTeN8PyAJZEFRYPVe1vjicn1QCCqUcukNrA3i`

## Sonuç: ✅ hepsi geçti

| Kontrol | Durum | Detay |
|---|---|---|
| her fire, fire_slot'tan sonra indi | ✅ | HOT volume tx_slot=11681 fire_slot=11539; HOT milestone tx_slot=11966 fire_slot=11836; SLOW volume tx_slot=11983 fire_slot=11879 |
| beklerken hiç erken çağrı yapılmadı | ✅ | 3 bekleme, 0 TooEarly |
| her kurulan tetikleyici ateşlendi | ✅ | 3 armed, 3 fired |
| SLOW, HOT'tan sonra kuruldu (hacim eşiği çalışıyor) | ✅ | HOT tick 2, SLOW tick 4 |
| bağıştan sonra buyback yapıldı | ✅ | HOT spent=8794812 tokens=2997633935461; HOT spent=11666885 tokens=5257331198562; HOT spent=12417833 tokens=7380377352718 |
| whale alımı kilometre taşını kurdu | ✅ | HOT tick 4 amount=4822520050668 |
| crank hata vermedi | ✅ | - |
| hiç tick atlanmadı | ✅ | 6 tick |
| her fire'dan sonra crank snapshot alıp round açtı | ✅ | HOT round 0 8×116247042419 snap_slot=11681; HOT round 1 8×602815006333 snap_slot=11966; SLOW round 0 8×112500000000 snap_slot=11983 |
| her round'un çekilişi yapıldı | ✅ | 3 açıldı, 3 çekildi |
| snapshot zincirdeki slot'tan yeniden üretildi, kök tuttu | ✅ | 3/3 round |
| kazananlar elle müdahale olmadan claim etti | ✅ | 17/24 çekiliş ödendi, 7 tanesi demo cüzdana (Phantom) bırakıldı |

## Zaman çizelgesi

| Zaman | Kim | Coin | Olay |
|---|---|---|---|
| 08:05:12 | sim | - | fund crank 9VEEK7BmwoiMw7GckqWsLEDc8jKRAEU1oDagKBBjmsM7 5 SOL |
| 08:05:13 | sim | - | fund trader BfmYuD271T6hYrkthAmGP6beupi5XmFneHZ3mQYjjhzS 100 SOL |
| 08:05:13 | sim | - | fund holder1 FjGQ1N6w7niXr5C6wYb1XykyjHWdsVWkLCjgV7k8Ercm 2 SOL |
| 08:05:14 | sim | - | fund holder2 F9AfKFc9ytAp8xCJHKS8r6GBzXKhsEykScbV9VCGdJxG 2 SOL |
| 08:05:14 | sim | - | platform set config.platform = crank 9VEEK7BmwoiMw7GckqWsLEDc8jKRAEU1oDagKBBjmsM7 |
| 08:05:33 | sim | HOT | launch mint=FG2FGH2yQbXMwGhyyfb7uKotQiJvD7YMRgagFtnCB3pb escrow=A41ieZFENnBk1aqpu2Fpo7XJHXKgp3sWTSfsVKtft95h sig=4yrQdRgNrQvZZmxB6d1o9rdHs42gpYhH9pSWHxpzcsXihmPSkdrW2v17AfcMDCf9DKXWdxC1Pb8K94xWwfeLfYDm |
| 08:05:50 | sim | SLOW | launch mint=LXEGQSXWEirUBVukL2thfqf8RkV2UGi2VNGNDoYDPsq escrow=BzyuMn1wTeN8PyAJZEFRYPVe1vjicn1QCCqUcukNrA3i sig=4rENZpBAF8U5vnZB6HvPKizqchdPqLVZPuqnahLLucZkBWuZxTkByNZJHwL73rwL4G1tTt8ubhdr77KPafB19wgP |
| 08:05:52 | sim | HOT | holder buy 0.1 SOL by FjGQ…Ercm sig=3wyTcB6PhWr8sNkN3abvn7ikzj6AdAEtqB4jkMMg5bfLHUPdkHMYTkQXPUvuXwZLL7GeDtkPKw1aoVvqhrizaD4E |
| 08:05:53 | sim | HOT | holder buy 0.1 SOL by F9Af…dJxG sig=2WCZxpbm1szNCPBRiyJDTcUDWnc2m3LtiCqvwAvx9YWoA8rCbFz1RT1r8uHphCWbAS4Wfo5MGX5kwRdGM2CJ7qKF |
| 08:05:53 | sim | SLOW | holder buy 0.1 SOL by FjGQ…Ercm sig=UuAcMQMqwVGi8GCxLKHthmEoEoV3kct7g1XJ1SAP6pdGDNSdkLch1ZUEseGKY1ru5F4JzgW3WEMqZM9EFR4AvzJ |
| 08:05:54 | sim | SLOW | holder buy 0.1 SOL by F9Af…dJxG sig=5YWpki7Ypx64FAXMQdFszjTFE64xC7Yo4XVUKjYmMND2XH9Z6ozyfGvw7LzvHpyxJQtmdrC6GrVzbqh5nfAXgd75 |
| 08:05:54 | sim | HOT | demo wallet funded 2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K +60000000000000 token sig=5RvrYXpip4hxwji1FSfPiY4WBkfcEbmEsc7XAtbnExiXFhhQqsgGwxmmd12FBHMeycKRvME1ywPkpX3ExyZ1sRBK |
| 08:05:55 | sim | SLOW | demo wallet funded 2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K +60000000000000 token sig=35xiJvWBm94WCynn7DyjS2bHFVbAPVKeV6NQbMC7fNdR8JyWKxQxKLD7ZuZegkTdTRtk2LUcoooaZfw4nuWY4G9D |
| 08:05:55 | sim | - | crank started wallet=9VEEK7BmwoiMw7GckqWsLEDc8jKRAEU1oDagKBBjmsM7 interval=60000ms |
| 08:05:55 | sim | - | market sizes mcap=2.343 SOL hot=0.0351 SOL/15s slow=0.0059 SOL/40s |
| 08:05:59 | crank | - | tick 1 slot=11368 coins=16 |
| 08:06:00 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4NJ4KVYs5d8H… |
| 08:06:00 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=3MMTMrDton1y… |
| 08:06:00 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:06:00 | sim | HOT | buy 0.0351 SOL by trader sig=52C2hvof7MtZUsF2aWQDw6PvLi8AEuL6oV2ddKZV48moRrewCrUSdtfexeQnrzC7p2AqcyMvZwc18ErtREaL5qRk |
| 08:06:00 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=3xnU6qCs9GYH… |
| 08:06:01 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:06:01 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=2R8baMzRiMhQ… |
| 08:06:01 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=3VZzbgCQfoV8… |
| 08:06:02 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=2pdzmC63kSSx… |
| 08:06:02 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=2s7LyoQM7kYd… |
| 08:06:02 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:06:03 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=36ENjVvJyZjv… |
| 08:06:04 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=4ZsFSGQL9neL… |
| 08:06:04 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:06:04 | crank | HOT | collect_fees → ok lamports=1860889 sig=5Sczx8K94F91… |
| 08:06:04 | crank | HOT | check_trigger → idle cum_volume=0 mcap_sol=2.447 sig=5wa2yVUNZPLa… |
| 08:06:05 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=JE3VBiDUq5Km… |
| 08:06:05 | crank | SLOW | collect_fees → ok lamports=1756889 sig=346PyvdpDYp7… |
| 08:06:06 | crank | SLOW | check_trigger → idle cum_volume=0 mcap_sol=2.343 sig=58mLvJCF34kK… |
| 08:06:06 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=4FcdGPwu444B… |
| 08:06:06 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:06:07 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=jsTY98Sr1kST… |
| 08:06:07 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:06:07 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=339uMhZqZDVy… |
| 08:06:07 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:06:07 | crank | 5Avo…T4qH | collect_fees → ok lamports=1756889 sig=5bQZ5FZAieH2… |
| 08:06:08 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=2WUJZZ9SHTmq… |
| 08:06:16 | sim | HOT | buy 0.0351 SOL by trader sig=5Wa23L3onZ6jUdYmNMy7NqgdbAW1WMpa3gfjGfLpUryvmzyBRL7T8uQYLXuAkHrRoxFsPgwXyu3hn99E5s887dtk |
| 08:06:16 | sim | SLOW | buy 0.0059 SOL by trader sig=3yvXpxjYtj5JxgjcoZtzKVdnBF87NczBj5NahWV1qUkDktaoeY71JZfeseBrX23fupca2HNfUwv46qjfXuAkpN7L |
| 08:06:32 | sim | HOT | buy 0.0351 SOL by trader sig=5SS1jXE9kRwmatHKYSB3LekC5uAFARwpJ1Uh7smuaULFh3q2DHBYaUk5C8A7bLqsriWRDg3kuj5ygWqBwnXRrqr8 |
| 08:06:47 | sim | HOT | buy 0.0351 SOL by trader sig=2gxh8toxCVCUSQz3TxzMdKjARvvMUpYUARF5tCvup9F8DFuwgDXkPZCusK59Kd1oPsZC15Jdp1NcofXZw9QHCDw5 |
| 08:06:53 | sim | HOT | donation to escrow 0.05 SOL sig=2URQJD7UtRxYUGed8WMKrYWTfdax2Urm13UNoVxUgDLZKXX1GShETyMUstSinQD7dFfzn9Hyh23jNer88kcVWHQm |
| 08:06:56 | sim | SLOW | buy 0.0059 SOL by trader sig=3b7nwmDWUNmVu5nqzeTkgU66c5Yj5qhfBf4PTssFU6UUbK6xUiVMzg1WtrwDGwijA38McbEapaoHfjS6rZa51nUt |
| 08:07:03 | sim | HOT | buy 0.0351 SOL by trader sig=5eDb3uTF3iZVGqfE3F17SWV1rMP3UFFKt3XV7gnf9YfAqwMfF7yiaNae3tRSHe6yiG659Who4K4aTjsFrzPsx7cH |
| 08:07:08 | crank | - | tick 2 slot=11527 coins=16 |
| 08:07:08 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=U8XvR59hUiY3… |
| 08:07:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=2Sbir3F8bvWi… |
| 08:07:09 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:07:09 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=4qVLsAqzEzQS… |
| 08:07:09 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:07:09 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=64G4PDEWeiGM… |
| 08:07:10 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=3xTodm9XMp4b… |
| 08:07:11 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=8tEbVXdYnJLH… |
| 08:07:11 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=2DmnG99FjGjg… |
| 08:07:11 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:07:11 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4deC4p3qT56x… |
| 08:07:12 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=2La7S6v9v6Yz… |
| 08:07:12 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:07:12 | crank | HOT | buyback → ok spendable=41860889 spent=8794812 tokens=2997633935461 sig=3LT9HZczn4Ci… |
| 08:07:12 | crank | HOT | check_trigger → armed cum_volume=147352897 mcap_sol=2.883 kind=volume amount=929976339354 fire_slot=11539 sig=4YxV8cNZGrq5… |
| 08:07:12 | crank | HOT | fire_trigger → wait slot=11538 fire_slot=11539 slots_left=1 |
| 08:07:13 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=4qew3AiVj5ap… |
| 08:07:13 | crank | SLOW | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=127yWqZiF5qM… |
| 08:07:14 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=xG1CZXJztaKr… |
| 08:07:14 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:07:14 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5Q2jW4mLBKdw… |
| 08:07:14 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:07:15 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=46s5ZhXBPkCg… |
| 08:07:15 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:07:15 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=35XLhZZa554r… |
| 08:07:18 | sim | HOT | buy 0.0351 SOL by trader sig=66WisMD6ZTGhcvC5GUyTMsunXwowXiKCXDMh7VJnDXh9V9Mvg9Y587CApDceAqXyxWECM632Z4ksA1hpJ1EW968E |
| 08:07:33 | sim | HOT | buy 0.0351 SOL by trader sig=5XVEaruVetQEnh1KcvsxdGoQL2ot4TcL3AGoJvmikCYpVcPsfw2snYjidiPFwYa79y9Mfgcu67VSziDfkRc7T9r3 |
| 08:07:36 | sim | SLOW | buy 0.0059 SOL by trader sig=bk4ks896o9495NX3EamWmecZj9Rqqxz5sE7MwLdFV4cKit3GsSAVbcyKpTUEnkfy3hwfkEm7CwjYMQRxAUxhK6D |
| 08:07:48 | sim | HOT | buy 0.0351 SOL by trader sig=56jtrxRNRB1mvpsKqLV1PtqvTqfeEHcAWaMGMSReVU5LUGTjqP7WW7Z7chnRrFqnAt5todnjCpEyos9rG6Puo6sB |
| 08:07:58 | sim | HOT | whale buy (2x mcap) 0.4324 SOL by trader sig=5DL5Ea9X3fNqmXpMkjfFFCsSpvSKjfgK8ygPUi5uzw43WM73hPggkS3xAWTbq9cgTinkAQ7sFSTLhTRGpgwE3vBh |
| 08:08:04 | sim | HOT | buy 0.0351 SOL by trader sig=rCwrbwDArttvxFqFwQ6yuWh8M6BdGfVcgDWvC6ezM38b3YxRToEfv7aL5BeVqiJUBrshsFXcti8awEvioctTCwV |
| 08:08:08 | crank | - | tick 3 slot=11666 coins=16 |
| 08:08:09 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=3iDdvNk3JnNS… |
| 08:08:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=4okgTRWzr2mC… |
| 08:08:09 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:08:10 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=4A4JpBo3u5L3… |
| 08:08:10 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:08:10 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5y89ZqiWq5jC… |
| 08:08:11 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=26DKpJcm2v5b… |
| 08:08:11 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=4ZiND1Dmb6pc… |
| 08:08:12 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=59dERwmsXhyv… |
| 08:08:12 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:08:12 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4Mh8Csrrvkkh… |
| 08:08:12 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=PUT8tWwqBnux… |
| 08:08:12 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:08:13 | crank | HOT | collect_fees → ok lamports=2139245 sig=2gzU3zMyPauP… |
| 08:08:13 | crank | HOT | buyback → ok spendable=33360922 spent=11666885 tokens=5257331198562 sig=2jMk2r7vpTCB… |
| 08:08:14 | crank | HOT | check_trigger → still_armed cum_volume=724604136 mcap_sol=5.074 fire_slot=11539 sig=4vqzd3PD614s… |
| 08:08:14 | crank | HOT | fire_trigger → ok kind=volume tx_slot=11681 fire_slot=11539 released=929976339354 pending=929976339354 sig=37WsGcPPiuhs… |
| 08:08:14 | crank | HOT | snapshot → ok slot=11681 holders=4 excluded=5 root=b470a257a4c74eb6… file=/home/pc/airdrop-launchpad/crank/snapshots/FG2FGH2yQbXMwGhyyfb7uKotQiJvD7YMRgagFtnCB3pb-0.json |
| 08:08:15 | crank | HOT | open_round → ok round=0 winners=8 prize=116247042419 committed=929976339352 commit_slot=11682 snapshot_slot=11681 sig=3DGHrVuatdtQ… |
| 08:08:17 | crank | HOT | draw → ok round=0 draw_slot=11684 tx_slot=11686 seed=6552d6ce6d134d42… sig=38E9mNpK5Sus… |
| 08:08:17 | sim | SLOW | buy 0.0059 SOL by trader sig=eofUYM6WdEeQAQ9JNLqxMHa194z1Q7M5EtEJUaLPZHQBNfsCLRDZbUvmD98RQLVS51zngeUNmMxsi541iHtZ1xY |
| 08:08:17 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5z9KUcd4hY9a… |
| 08:08:18 | crank | SLOW | check_trigger → idle cum_volume=23308636 mcap_sol=2.413 sig=4WAkpRwraqdp… |
| 08:08:18 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=59XzUg8PZAU5… |
| 08:08:18 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:08:18 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=PRC8LsVw2ADE… |
| 08:08:18 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:08:19 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=3J8PT1Kev19y… |
| 08:08:19 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:08:19 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=26BzwTmJDM6K… |
| 08:08:20 | sim | HOT | buy 0.0351 SOL by trader sig=35M7WzUejqtqTfdZwffezqk9Fi7Vhm2rDQEdpv14H1nPgXUKMKgeNnzL7zvTkBLtiLhASmU8bg3DkH37k33MzDuk |
| 08:08:36 | sim | HOT | buy 0.0351 SOL by trader sig=b9vwS1GS7kY9z8X8D7FpSG6eB9NLUyT6Uo7d6r8geebJYqK98xKj3TuHybya5nLTBshCAUEQ5FWGL4NmnGQaWjw |
| 08:08:51 | sim | HOT | buy 0.0351 SOL by trader sig=59YQdzyV7drt8kJ4KZoPLKBMx6Mrbqaws5NsrMUakmQAGkRyJ8SZVTBG1MQsF9qgobAXUrH4TydmKpjvAodAsQc5 |
| 08:08:57 | sim | SLOW | buy 0.0059 SOL by trader sig=DSz5y8yQn4bQhY4tGZPMNaSuacR6CPDQs3TAMLYSWu8wG868qtKvDwef8PfnQqU5S1RjbMTzvLsA7rsUJu3dgt3 |
| 08:09:07 | sim | HOT | buy 0.0351 SOL by trader sig=2RuP2rQdGfPf8gWk6Re3NkxwWvZx63BiN25Y54bxz6P5i5bFo6tJaMfYmsqb8KLZrzPRRKYvYBxdsQfr6ok99TSU |
| 08:09:08 | crank | - | tick 4 slot=11809 coins=16 |
| 08:09:08 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=5PR7xBZL3LDF… |
| 08:09:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=2eBVsj2Kaj6G… |
| 08:09:09 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:09:09 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=28Gty38tSDxo… |
| 08:09:09 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:09:10 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5Z6kMBdVjAbk… |
| 08:09:11 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=svYUCibBmGHg… |
| 08:09:12 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=345x3F7p4DkL… |
| 08:09:12 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=63QJHZ5ESnrm… |
| 08:09:12 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:09:13 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4Et8qb4XFxXw… |
| 08:09:13 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=4cXpZxtCsjpJ… |
| 08:09:13 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:09:14 | crank | HOT | buyback → ok spendable=21694037 spent=12417833 tokens=7380377352718 sig=368kpwnrEJtx… |
| 08:09:14 | crank | HOT | check_trigger → armed cum_volume=875535326 mcap_sol=5.748 kind=milestone amount=4822520050668 fire_slot=11836 sig=3h8eD5YPffbv… |
| 08:09:14 | crank | HOT | fire_trigger → wait slot=11823 fire_slot=11836 slots_left=13 |
| 08:09:14 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=4PYSDeuuoArm… |
| 08:09:15 | crank | SLOW | check_trigger → armed cum_volume=29135795 mcap_sol=2.430 kind=volume amount=900000000000 fire_slot=11879 sig=35bXMytpLhA1… |
| 08:09:15 | crank | SLOW | fire_trigger → wait slot=11825 fire_slot=11879 slots_left=54 |
| 08:09:15 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=2PLG7LtG1ZNQ… |
| 08:09:15 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:09:16 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=2jVDHaadNos5… |
| 08:09:16 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:09:16 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=3v5WAsSXZXUY… |
| 08:09:16 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:09:16 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=3dfQExWvsbAS… |
| 08:09:22 | sim | HOT | buy 0.0351 SOL by trader sig=3L74MMsZTmg4TDAHKmz7Q4t5WtQ748ivMmcyQtgA1Crh1skv8zCstehJdN6RDiTDXiuS58CNdM5nENBAJKJLuFzs |
| 08:09:37 | sim | HOT | buy 0.0351 SOL by trader sig=UvnRTCnWt1Ke74oPWeNH1hdpeGLEfSXaK31nWu12drU155sX5TXUJdTJbstJLRLGVEMh3wBQRExE4W983Eu1eie |
| 08:09:37 | sim | SLOW | buy 0.0059 SOL by trader sig=21pkQtZ9xZXTQqyjwV89RJ6UTwqBWQmm6rcyPNGi41CSbD88Cvb5yrMJ61PxAaRutEg5gYZN2SVYiuT5q5NwzD54 |
| 08:09:53 | sim | HOT | buy 0.0351 SOL by trader sig=WC217v2Rpw1hC1rqUET5pb4ngzJqrrvstasRSp768kYWktek8gnbpyLVgyqdhrLyCie94HDREAjGT6hGxuAxUQP |
| 08:10:08 | sim | HOT | buy 0.0351 SOL by trader sig=8BahxafP86rABziiowUEWwiGXZ43zeaNYj1xU6yvRg1JWWU3Pm6sbMwU97Z5HRMD7U5wGD1G2zsY9xZ3LyuRwMe |
| 08:10:10 | crank | - | tick 5 slot=11951 coins=16 |
| 08:10:10 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=3v1BCcnCZLwM… |
| 08:10:10 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=4qXKEsXV5aBK… |
| 08:10:10 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:10:11 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=zp75Xw63uBGN… |
| 08:10:11 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:10:11 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=YivYW8RiGzBo… |
| 08:10:12 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=5efTurBvfqmv… |
| 08:10:12 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=5eLYps7upzHR… |
| 08:10:13 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=52kCxycwuoQ5… |
| 08:10:13 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:10:13 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=2DiHxb1eiUnT… |
| 08:10:13 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=669K7iMHzR4S… |
| 08:10:13 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:10:14 | crank | HOT | check_trigger → still_armed cum_volume=1014201990 mcap_sol=6.468 fire_slot=11836 sig=5AzvURjG9D1x… |
| 08:10:14 | crank | HOT | fire_trigger → ok kind=milestone tx_slot=11966 fire_slot=11836 released=4822520050668 pending=4822520050670 sig=xkESfDhrSGes… |
| 08:10:17 | crank | HOT | snapshot → ok slot=11966 holders=4 excluded=5 root=0546c04d0752b8cb… file=/home/pc/airdrop-launchpad/crank/snapshots/FG2FGH2yQbXMwGhyyfb7uKotQiJvD7YMRgagFtnCB3pb-1.json |
| 08:10:18 | crank | HOT | open_round → ok round=1 winners=8 prize=602815006333 committed=4822520050664 commit_slot=11975 snapshot_slot=11966 sig=55s3wwyY9spx… |
| 08:10:20 | crank | HOT | draw → ok round=1 draw_slot=11977 tx_slot=11980 seed=5b6ab3ee2ce78113… sig=3iVSG4bnWgWS… |
| 08:10:21 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=2Y5WnwgPLQ3S… |
| 08:10:21 | crank | SLOW | check_trigger → still_armed cum_volume=34962954 mcap_sol=2.448 fire_slot=11879 sig=31hjP51PwNWi… |
| 08:10:21 | crank | SLOW | fire_trigger → ok kind=volume tx_slot=11983 fire_slot=11879 released=900000000000 pending=900000000000 sig=62NXzZGuanfj… |
| 08:10:23 | crank | SLOW | snapshot → ok slot=11983 holders=3 excluded=5 root=67fb2372f8808251… file=/home/pc/airdrop-launchpad/crank/snapshots/LXEGQSXWEirUBVukL2thfqf8RkV2UGi2VNGNDoYDPsq-0.json |
| 08:10:24 | crank | SLOW | open_round → ok round=0 winners=8 prize=112500000000 committed=900000000000 commit_slot=11988 snapshot_slot=11983 sig=3u1X1ATgVeBJ… |
| 08:10:25 | crank | SLOW | draw → ok round=0 draw_slot=11990 tx_slot=11992 seed=cb6f6f145084d7e9… sig=4hAvjdxAmgDr… |
| 08:10:26 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=65HmMxpXZ5Ad… |
| 08:10:26 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:10:26 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=4ScNfcWVVYK9… |
| 08:10:26 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:10:27 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=21bhnSPwhSc5… |
| 08:10:27 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:10:27 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=3U9gfwSWgFcS… |
| 08:11:09 | crank | - | tick 6 slot=12091 coins=16 |
| 08:11:09 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=5MLURTqWAuYf… |
| 08:11:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=5b4TtwouPfyi… |
| 08:11:09 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:11:09 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=3tpZw4x1Re1L… |
| 08:11:09 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 08:11:10 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=2FRMmFYs1Zng… |
| 08:11:10 | crank | 6wxx…PMj3 | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=wtoQ4VmXUyux… |
| 08:11:11 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=Gum7Mpgoq2MM… |
| 08:11:11 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=2KdkRYu2kiZR… |
| 08:11:11 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 08:11:12 | crank | Wpmx…HaaX | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=5tem7MH8SLGg… |
| 08:11:12 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=2fxEU955FkQf… |
| 08:11:12 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 08:11:12 | crank | HOT | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=6SV6QDFRCU3a… |
| 08:11:13 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5rWd5kbxwHBZ… |
| 08:11:15 | crank | SLOW | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=rtmmAxAYwxJP… |
| 08:11:15 | crank | 2pL4…T3ea | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=4iYph6wwu6at… |
| 08:11:15 | crank | 2pL4…T3ea | open_round → skip reason=not dev or platform pending=6 |
| 08:11:15 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=2V7hKMdw3edM… |
| 08:11:15 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 08:11:16 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=5UX7atd22xJ1… |
| 08:11:16 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 08:11:16 | crank | 5Avo…T4qH | check_trigger → idle cum_volume=197530862 mcap_sol=2.343 sig=62sVMWSoLRea… |
| 08:11:17 | sim | - | crank stopped  |
| 08:11:18 | holder | HOT | claim round 0 draw 0 trader +116247042419 token sig=CWGRjn7xiUfWMLTRCDpK2TL87geDeq5bcfJUpoBpqHc6PnTN5YEQKCuSBBHPSeRGKVV5z4jWJ3A4vCch2bcMeuy |
| 08:11:18 | holder | HOT | claim round 0 draw 1 F9Af…dJxG +116247042419 token sig=3jkFkKwHCxSnNPQu1ML2gug5PpmRvkkGurpeeFM9Zgrh9kA1uPBwRsE55Fkch2zr8GJuTDs7WERkt4SeQmC52mY6 |
| 08:11:19 | holder | HOT | claim round 0 draw 2 FjGQ…Ercm +116247042419 token sig=2QNxkipWcurhJhJ6hiVXpUQhjVfg7j7MCBAFZ5W79nfpUHE8BFvf9hHjqzKGf8TiSu8kVvGRFKRFdL1cRPByw1Us |
| 08:11:19 | holder | HOT | claim round 0 draw 3 FjGQ…Ercm +116247042419 token sig=4Kx8mc2mYUSNwjjwgPqTcdWv1UPffep7qQdK7tr9KCcH6kSJ2xuA71hh7BqGNkaDNmQdvggSuHN5wFB4aLkt9MtT |
| 08:11:20 | holder | HOT | claim round 0 draw 4 trader +116247042419 token sig=dQ1dxFgcB6TAcqVkmQtsujus3RqTLdyqYqHHc5wg83CbgPQ8m9rZTXywioF5Nt1MwLLLKuptwhLjUG2rtjucMv6 |
| 08:11:20 | holder | HOT | claim round 0 draw 5 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:20 | holder | HOT | claim round 0 draw 6 trader +116247042419 token sig=2zkJFFEEuwmAhE5scyGj5VgAFVf4ryRHqrXdY7z2WzeU4otgrcgCajg9YqjDaKD73uiUCqUp7YecAMXoD5T3op4t |
| 08:11:20 | holder | HOT | claim round 0 draw 7 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:20 | holder | HOT | claim round 1 draw 0 trader +602815006333 token sig=5W8gcW5fUEXUmy6Gcpw9uqDVodsBg4TCtbSpkHW8Dh7SangLDH2wR2Wuze4n7m7fj8Jtxq6hWABzLUYBJ5pVccTb |
| 08:11:21 | holder | HOT | claim round 1 draw 1 trader +602815006333 token sig=5NdtdycJVAicCWgub7PyPj6JVd7Dz8tXY8EaHuNWhd48XDyiVskbfB8Pq9QSweHrDrieqwTKjtM3PEXfY9PXLai2 |
| 08:11:21 | holder | HOT | claim round 1 draw 2 trader +602815006333 token sig=5SfSJPWosPAkaNyfetqchz8m3CDtHHSY9Bj86rR9J5seBXxWHczfkh6bN8gpXPoAysS1Gyj61dRRE2bJgBf7CT3H |
| 08:11:22 | holder | HOT | claim round 1 draw 3 trader +602815006333 token sig=UVBKSyDiQkVkXhDMzLT5VZTUx9C6K4QxECL8M8qwmJTfN4qu7GNYf6jvPDxCpFbGA9Z9NgGEqHtFyCGWqZ2oznF |
| 08:11:22 | holder | HOT | claim round 1 draw 4 trader +602815006333 token sig=1Cz93gGM5Yo15vo1SnwqjoHfcdwSsH5ZZr2UMZDWd9NNmBSK1VosDoEsSgYk9QpF5s6Kna7RfAviRf6MtRocNkw |
| 08:11:22 | holder | HOT | claim round 1 draw 5 trader +602815006333 token sig=2npX74TNttT8et4CgQ9KaZ2oNrn1Cpevc81vkHRqLrQYWs6h9qWewn4uf6Pxy4Cx4SNcameMgPSYCWPeru3h5qia |
| 08:11:23 | holder | HOT | claim round 1 draw 6 trader +602815006333 token sig=4GNVFctCygSt4hvKx8z91CggkuyuhFmfvnLWuXTfYMyu73xiZaCGsGZEaHZMzMsZC29NiqqprWXKeu4s1ge3R9hN |
| 08:11:23 | holder | HOT | claim round 1 draw 7 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:23 | holder | SLOW | claim round 0 draw 0 FjGQ…Ercm +112500000000 token sig=4GzaMjvDtuMRffHvJz9397Nb4n8uzrT7fmQ3DvJCAE7qJvwpUACd2AeTMebK2LxzPihWk1yqmoC9suahjtXeDc7A |
| 08:11:23 | holder | SLOW | claim round 0 draw 1 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:24 | holder | SLOW | claim round 0 draw 2 FjGQ…Ercm +112500000000 token sig=4YSr8EMTAEnDRgTVdaBS64P3bfNrtjwVkmBb31WKfbp79y53mDR44X6JFfKd3BbLviB7wGrfdF1ASaSPjuNJwf5h |
| 08:11:24 | holder | SLOW | claim round 0 draw 3 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:24 | holder | SLOW | claim round 0 draw 4 FjGQ…Ercm +112500000000 token sig=23PXyCtYDkHrCsshk9vvxSd7FroVESV5s4EPqiCsxTRvWoXtPh2cc1mkqYwVpugsjCJwkp6ri214K1CEkzucueKr |
| 08:11:25 | holder | SLOW | claim round 0 draw 5 F9Af…dJxG +112500000000 token sig=5Zeq6NPm1B3ru3RzUbM2UPm4kChAKAsbHvjpojGsiMAyE1qXy44WzDcXni3BzE8VChiNeCcbrYEeqhaoV5FeokyE |
| 08:11:25 | holder | SLOW | claim round 0 draw 6 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 08:11:25 | holder | SLOW | claim round 0 draw 7 left for the demo wallet (2xfs…q36K) to claim from the web site |

Ham crank kaydı: `/tmp/crank-sim-dTmCHA/crank.jsonl`