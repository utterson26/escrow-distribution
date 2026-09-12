# Crank simülasyonu — 2026-09-12T07:28:04.296Z

Localnet, 5 dk, crank aralığı 60 sn, gecikme penceresi 100 slot.
Crank cüzdanı `6aAmMh1DZHtxMkBrFu6vxtD9pDQR9SD1vcRtf8m8xgTd` (dev değil; launch'ta platform yetkilisi olarak yazıldı), trader `FkfDN3AxmYkB2XD1zYnujiE1RpYF1NM2gMopyvYmiGYy`, sabit holder'lar `2TTrhpSYnNLcAheMpzC8MgU4HyUe46jJMxFjZzZ6ZQux`, `3J9ExGgopgBFCKM3B6cCrQCPsano5ePsiRa8bx1WHgvg`.

- HOT: mint `2pL4vX5HN4d3vEwp5ok8jxSCLX9SwpFqy9ebyozmT3ea`, escrow `CdJaLgzcrBt5jjpGDXNukAfgw1strm7ByGuCiP4B6Ems`
- SLOW: mint `WpmxALKWy5N4h72YuCMN14F6aSRA5LBA3iv291iHaaX`, escrow `8t33DFGRT4NbdM8i8uGNWrxTQ3xkNj2sknwH7Td7ZnTa`

## Sonuç: ✅ hepsi geçti

| Kontrol | Durum | Detay |
|---|---|---|
| her fire, fire_slot'tan sonra indi | ✅ | HOT volume tx_slot=6469 fire_slot=6398; SLOW volume tx_slot=6740 fire_slot=6691; HOT milestone tx_slot=6748 fire_slot=6695 |
| beklerken hiç erken çağrı yapılmadı | ✅ | 3 bekleme, 0 TooEarly |
| her kurulan tetikleyici ateşlendi | ✅ | 3 armed, 3 fired |
| SLOW, HOT'tan sonra kuruldu (hacim eşiği çalışıyor) | ✅ | HOT tick 2, SLOW tick 4 |
| bağıştan sonra buyback yapıldı | ✅ | HOT spent=8794812 tokens=2997633935461; HOT spent=11666885 tokens=5257331198562; HOT spent=12417833 tokens=7380377352718 |
| whale alımı kilometre taşını kurdu | ✅ | HOT tick 4 amount=4822520050668 |
| crank hata vermedi | ✅ | - |
| hiç tick atlanmadı | ✅ | 6 tick |
| her fire'dan sonra crank snapshot alıp round açtı | ✅ | HOT round 0 8×116247042419 snap_slot=6469; SLOW round 0 8×112500000000 snap_slot=6740; HOT round 1 8×602815006333 snap_slot=6748 |
| her round'un çekilişi yapıldı | ✅ | 3 açıldı, 3 çekildi |
| snapshot zincirdeki slot'tan yeniden üretildi, kök tuttu | ✅ | 3/3 round |
| kazananlar elle müdahale olmadan claim etti | ✅ | 19/24 çekiliş ödendi, 5 tanesi demo cüzdana (Phantom) bırakıldı |

## Zaman çizelgesi

| Zaman | Kim | Coin | Olay |
|---|---|---|---|
| 07:28:04 | sim | - | fund crank 6aAmMh1DZHtxMkBrFu6vxtD9pDQR9SD1vcRtf8m8xgTd 5 SOL |
| 07:28:05 | sim | - | fund trader FkfDN3AxmYkB2XD1zYnujiE1RpYF1NM2gMopyvYmiGYy 100 SOL |
| 07:28:05 | sim | - | fund holder1 2TTrhpSYnNLcAheMpzC8MgU4HyUe46jJMxFjZzZ6ZQux 2 SOL |
| 07:28:05 | sim | - | fund holder2 3J9ExGgopgBFCKM3B6cCrQCPsano5ePsiRa8bx1WHgvg 2 SOL |
| 07:28:23 | sim | HOT | launch mint=2pL4vX5HN4d3vEwp5ok8jxSCLX9SwpFqy9ebyozmT3ea escrow=CdJaLgzcrBt5jjpGDXNukAfgw1strm7ByGuCiP4B6Ems sig=4SJMFo2i46pFfZidighSKXvJhJDhUqHV82hqWYGW861w1bxamCHLapeULq6JeW4n2xoUPHKxf2JeWXAmShz74Mn7 |
| 07:28:40 | sim | SLOW | launch mint=WpmxALKWy5N4h72YuCMN14F6aSRA5LBA3iv291iHaaX escrow=8t33DFGRT4NbdM8i8uGNWrxTQ3xkNj2sknwH7Td7ZnTa sig=4MGyhy6vRbbpZgPk8Y3aQTxxBD3EY2z4i6xaxyh3bWeGh7SkhXJgqdqAM5ctLDcT7vCkmTqy5aJPKaXDcTUkq1gd |
| 07:28:41 | sim | HOT | holder buy 0.1 SOL by 2TTr…ZQux sig=YVucGEWro5NrR9hsGWM67uVCfP9Jn7YiBjpzAZQYnmLJQmwMbvdBUo6xSh2B6uyDFY7EGoiA7qbxATyWboXUiLX |
| 07:28:42 | sim | HOT | holder buy 0.1 SOL by 3J9E…Hgvg sig=4dcJ6vr4nmLbQVTtFnbWCpjR7Ma1fURJcbXDQ1uNjsGZotKbH5sT6fPEcD3THb6v7RoGFYFQGWMxALLP3U9zNoqR |
| 07:28:42 | sim | SLOW | holder buy 0.1 SOL by 2TTr…ZQux sig=5tokuj4Z6azdbDvBzt7zAoVsEjpHFug3s6BAu1MHUEKWo8BnHgDxSfTq6WNWqgmzfmw4tTT5pRY8vxXjG1ixZ8RG |
| 07:28:43 | sim | SLOW | holder buy 0.1 SOL by 3J9E…Hgvg sig=63tKysR9G8JM35g6657vNujkEph39QKUtnqkv8ku38a82sUSStWye8okv9dbXNU26TjEkwSUaP2mJg6137f7MkKk |
| 07:28:44 | sim | HOT | demo wallet funded 2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K +60000000000000 token sig=4u3SSB2yZ7pu6pYDz7fjP7oes98HFCpTwDoyGiXACGynP4eHtRCMFvcDgsGaWC8NRsWCoYhsyQEQw4CsL2MNK2j3 |
| 07:28:44 | sim | SLOW | demo wallet funded 2xfsZ29tHRXX86fgQbPazWi9hRGVqdnzhK32RbPuq36K +60000000000000 token sig=2bRzycfRseCvK2f9g61TWE5abf8neQETAkxARy7Db2D7amnB9HJYoYa4eTpqfMwVZ383utvZFmhJwDPdCcEjAWep |
| 07:28:44 | sim | - | crank started wallet=6aAmMh1DZHtxMkBrFu6vxtD9pDQR9SD1vcRtf8m8xgTd interval=60000ms |
| 07:28:44 | sim | - | market sizes mcap=2.343 SOL hot=0.0351 SOL/15s slow=0.0059 SOL/40s |
| 07:28:45 | crank | - | tick 1 slot=6163 coins=12 |
| 07:28:45 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=2jaPukQjeF4U… |
| 07:28:46 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=5wtTaKKYXyP9… |
| 07:28:46 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:28:46 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=65dmrxL9JUxu… |
| 07:28:46 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:28:47 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=4kjQDyqNKpfK… |
| 07:28:47 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=5sYfufN93B1q… |
| 07:28:47 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=2q8NuYDeGUjd… |
| 07:28:47 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:28:48 | crank | SLOW | collect_fees → ok lamports=1756889 sig=5YnEBdCbGvbD… |
| 07:28:48 | crank | SLOW | check_trigger → idle cum_volume=0 mcap_sol=2.343 sig=5js4S93A6HU8… |
| 07:28:49 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=3JFYFaBhkHxZ… |
| 07:28:49 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:28:49 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=2LWiwuarpWEd… |
| 07:28:49 | sim | HOT | buy 0.0351 SOL by trader sig=5GR1FnN6tPWnx1Zc64VsDcGKAdc1iTpxPoFvpEhWrpx5uKgnJh11Vwn2TxzEG4ePZz8TK8EbeT4p4ekkvtM6M1Sf |
| 07:28:49 | crank | HOT | collect_fees → ok lamports=1756889 sig=2dB1cdmFc6b5… |
| 07:28:50 | crank | HOT | check_trigger → idle cum_volume=0 mcap_sol=2.343 sig=991TY4GJwg9c… |
| 07:28:50 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5tyDfwuJZQ1Y… |
| 07:28:50 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:28:51 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=54DR59V2qnMs… |
| 07:28:51 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:29:05 | sim | HOT | buy 0.0351 SOL by trader sig=2WkD91p6vPWzqqkHriURqpEtic4beWMgwyhxeNZQcX93p4p6eDuSwDPXe1cE1xMtzM3PY8jXH9qwmG94GvsrmWqk |
| 07:29:05 | sim | SLOW | buy 0.0059 SOL by trader sig=48d5PAap9XcYKuhi5tnShXokjAx1RnyWehom4tkeyWHE8QpWK8hzm1LvRWbndV1BEEjvAmhsKvnZE7jWfcmychrH |
| 07:29:20 | sim | HOT | buy 0.0351 SOL by trader sig=5tqJAqu2WMMBqAmFThMsCdaDHNyZmyV2osjfSUmS691d8qEQMHk42tg4G4XMw7A5bMLfQHtzf7wsqdC2a3C85zci |
| 07:29:35 | sim | HOT | buy 0.0351 SOL by trader sig=41HGdy16QQx9YNeiNoZrEr8whnoXwgVpQSfpTd4ujZ9LgvviBanFCwT7EGUykCwamCib1cGujaGPH3MmVUk2UWPM |
| 07:29:45 | sim | SLOW | buy 0.0059 SOL by trader sig=51HLjdHjSLJvjaDNJWGg5mpVynTBa8k34eAb9qaGUoRt9V49Cjo9D2UobuhzXkwAS3gLVHmdVyAxZNgnViadDZee |
| 07:29:45 | sim | HOT | donation to escrow 0.05 SOL sig=3bdtnDe4D8WbGsn9DubaU9ximfDiZ5hEdQYnGYzWDYJaeFK2hngY8Y7HgucpDv6RQqaJ1y9QN36eQVnaXf1gRqGo |
| 07:29:51 | sim | HOT | buy 0.0351 SOL by trader sig=21WaYWQj1mGTEGvn4UCkVfcGpSv3MiasZhpgdvXB48uQXNJgqYEQNJYqf7xkASyJhVX35zG7XaBv72mzKiAaVL1E |
| 07:29:51 | crank | - | tick 2 slot=6319 coins=12 |
| 07:29:52 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=37zr94WuFT1w… |
| 07:29:52 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=2LbdcWnyyrYz… |
| 07:29:52 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:29:52 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=G9UbMFuucoQG… |
| 07:29:52 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:29:53 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=2xtzHusLtoAP… |
| 07:29:53 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=4Au5Mb9zWEFw… |
| 07:29:54 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=3EfW2YAP2hdf… |
| 07:29:54 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:29:54 | crank | SLOW | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=jcj9cuuAuSZL… |
| 07:29:55 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=2FRSXNLMwzbv… |
| 07:29:55 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:29:55 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5aqZ9v9ws5FB… |
| 07:29:55 | crank | HOT | buyback → ok spendable=41860889 spent=8794812 tokens=2997633935461 sig=4mesJQJr6gnW… |
| 07:29:56 | crank | HOT | check_trigger → armed cum_volume=147352897 mcap_sol=2.883 kind=volume amount=929976339354 fire_slot=6398 sig=4kvG3ncVoQqu… |
| 07:29:56 | crank | HOT | fire_trigger → wait slot=6331 fire_slot=6398 slots_left=67 |
| 07:29:57 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5S16kFZaVLVE… |
| 07:29:57 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:29:57 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=3qZjmcdL1ZtL… |
| 07:29:57 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:30:06 | sim | HOT | buy 0.0351 SOL by trader sig=5DYwoRypw2p4PXuhKeFJEzVAWWLUZjDhfD2pc1ooQtk8yEj6u84xUpjBAqafQnV4hJFDb82GogwYBANPWt91ZLK6 |
| 07:30:22 | sim | HOT | buy 0.0351 SOL by trader sig=5ddiVEuTtSMWUFzZSjaSvHMA8WMMZgykhqQqmDdd1HJpTJKX4Y4PjM7ESvVtCsJzFByKriC43T9nckKdUoMNvbPk |
| 07:30:25 | sim | SLOW | buy 0.0059 SOL by trader sig=47UM6orzkT777K12RviupWCwQvDD6UjgyPHUvFyofnTCy4up2kcPzReQcv3148ZFpwgxtZcH1ZeoKRgv1p5UHdoc |
| 07:30:37 | sim | HOT | buy 0.0351 SOL by trader sig=2nu8EGDAeVA3teNZhhymAh5X8TDDrT5DMb5XoqNpBLe3umzrf8SyCjXHsfsc9ikqKUK1cMa8Fra1qYrjRkXovHhP |
| 07:30:49 | sim | HOT | whale buy (2x mcap) 0.4324 SOL by trader sig=5y4EAMWNckVTyL8cj1B5LssjYQPj6NSPNNG7ENeJyFtngy9eXeQ2U9LP7Gi4mKPx5KVw5SJpzNeSNHVJARsHoxZU |
| 07:30:51 | crank | - | tick 3 slot=6456 coins=12 |
| 07:30:51 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4zVQZJ2QKQ8c… |
| 07:30:52 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=2XVR7xRspahR… |
| 07:30:52 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:30:52 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=3Zo5KETu9guw… |
| 07:30:52 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:30:52 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=3nqRQDr7A97o… |
| 07:30:53 | sim | HOT | buy 0.0351 SOL by trader sig=4o1UDB4DyGkigLumPtirujPPGStZPiQ2buuzyxe1Pi48FsUGrEQkotsAr3aPcxepvy2iCxw1djoyZyzipx2aXPUp |
| 07:30:53 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=5536BwC3KUqr… |
| 07:30:53 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=4M7AknYjqkNc… |
| 07:30:53 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:30:54 | crank | SLOW | check_trigger → idle cum_volume=17481477 mcap_sol=2.395 sig=aire21JXnc4t… |
| 07:30:54 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=3MXz2FvzvQTB… |
| 07:30:54 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:30:54 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=61zFQuKSCuVR… |
| 07:30:55 | crank | HOT | collect_fees → ok lamports=2139245 sig=iCiQwTE7xrpa… |
| 07:30:55 | crank | HOT | buyback → ok spendable=33360922 spent=11666885 tokens=5257331198562 sig=4ppwSz8rgfe9… |
| 07:30:56 | crank | HOT | check_trigger → still_armed cum_volume=724604136 mcap_sol=5.074 fire_slot=6398 sig=3CdbHDgxWKsg… |
| 07:30:56 | crank | HOT | fire_trigger → ok kind=volume tx_slot=6469 fire_slot=6398 released=929976339354 pending=929976339354 sig=TQWRM4Z4JG1n… |
| 07:30:56 | crank | HOT | snapshot → ok slot=6469 holders=4 excluded=5 root=3dd0575b8903ddf5… file=/home/pc/airdrop-launchpad/crank/snapshots/2pL4vX5HN4d3vEwp5ok8jxSCLX9SwpFqy9ebyozmT3ea-0.json |
| 07:30:57 | crank | HOT | open_round → ok round=0 winners=8 prize=116247042419 committed=929976339352 commit_slot=6470 snapshot_slot=6469 sig=QFAyGAD9zesu… |
| 07:30:57 | crank | HOT | draw → ok round=0 tx_slot=6472 seed=d2de9591ea53ebae… sig=2a29ESv8HZnP… |
| 07:30:58 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5Fewdj9tbcjg… |
| 07:30:58 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:30:58 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=3fZac4dgwV7w… |
| 07:30:58 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:31:05 | sim | SLOW | buy 0.0059 SOL by trader sig=52shwz3JseUKtrCrtnNQiwmEqHbZydTHXpXc8crLnakjzgfqvoK2Exb6wEysKBfLfnpuQ3TAnrKYtrkAxRMERrCN |
| 07:31:08 | sim | HOT | buy 0.0351 SOL by trader sig=2AUuf53aQ1XxfAKpRZPMsRC6ToYZrQCButoitQDyzxvSk4KtaeFcnBzQix6TqjvZp1jZwsayiXomPJErNWKgQ4oi |
| 07:31:24 | sim | HOT | buy 0.0351 SOL by trader sig=9iHnVHzCFc9pbg8iZ4nQ2JS1a6jCrG83M3HXBUcZdLpyhYNu2ct9Ndfh8jaAWYTVcBGi42UgDGyefjMPmqVT8Kk |
| 07:31:39 | sim | HOT | buy 0.0351 SOL by trader sig=4LNKwBEHtJgE8YoXPrvrh9yiXqaKXxMYntdv8tptXZ4u9iSTV9ZvLDdne4pX4dD3My33wViwVyCg8S9eAymn5tVN |
| 07:31:45 | sim | SLOW | buy 0.0059 SOL by trader sig=oxxPgf3mpQmJLVv1jrqA3q6xHFycFznJD4D3CJDTyeiTXUdNhyPLBXidXFHuT26sQ6dU7WCog9WdzB2StDtb2oz |
| 07:31:51 | crank | - | tick 4 slot=6598 coins=12 |
| 07:31:51 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4zbWYneVpBRi… |
| 07:31:52 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=2qdsTnCpiKFQ… |
| 07:31:52 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:31:52 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=9dPinQAofYHk… |
| 07:31:52 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:31:52 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=AFjtyW1H2Emo… |
| 07:31:53 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=5ViZTfwsALHu… |
| 07:31:53 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=4ozZiaWc8hza… |
| 07:31:53 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:31:54 | crank | SLOW | check_trigger → armed cum_volume=29135795 mcap_sol=2.430 kind=volume amount=900000000000 fire_slot=6691 sig=4R82PsTbfSpj… |
| 07:31:54 | crank | SLOW | fire_trigger → wait slot=6605 fire_slot=6691 slots_left=86 |
| 07:31:55 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=2HVEkZf7kUfu… |
| 07:31:55 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:31:55 | sim | HOT | buy 0.0351 SOL by trader sig=4wgFcKSbMZQrT6AAsiN2HpQyLPnLHcDTsx7NKYAGTVJcy1LeJobKS36Qe7CpzLnSruWuN5XDbR7MRZ1admB8g3E2 |
| 07:31:58 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=5K6wbCn8Rjip… |
| 07:32:00 | crank | HOT | buyback → ok spendable=21694037 spent=12417833 tokens=7380377352718 sig=31mneUHUhHKG… |
| 07:32:00 | crank | HOT | check_trigger → armed cum_volume=875535326 mcap_sol=5.748 kind=milestone amount=4822520050668 fire_slot=6695 sig=5vPcjunSz5o4… |
| 07:32:00 | crank | HOT | fire_trigger → wait slot=6614 fire_slot=6695 slots_left=81 |
| 07:32:01 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=3JVsytNnYMvv… |
| 07:32:01 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:32:01 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=ikLXbsrBXTJP… |
| 07:32:01 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:32:10 | sim | HOT | buy 0.0351 SOL by trader sig=3TZfZ9ppM2dxcZr1YZNa6QxWrp2Vqo5uW31qPu4LcJS2MEdy8CSWQtY8YVNkP4T4k38NbSKKhPzEdFw72TjBYB57 |
| 07:32:25 | sim | HOT | buy 0.0351 SOL by trader sig=5wA5MqhdCzUW2HAdxD9fAszUPAafi9arUCwcN7vz8rLYD4ePz8ZZiqmarfjb32SVb8Hc5knoVqqgMLF9eVSENiJs |
| 07:32:26 | sim | SLOW | buy 0.0059 SOL by trader sig=3t39hkYSZYec1KGpADPTSRMxAr71aFXFU3sFzS8ocexojSJNMaVQJe1zLfkPF2hAmujJTD8jqzFGyvFJ5VASFzWB |
| 07:32:40 | sim | HOT | buy 0.0351 SOL by trader sig=Xux95vEPfVtJpRgu8gCW2ZfTTAL1BFyEieKYFWqXR9TU37HRXt3iUYCDVnWnxjmkwh1nMRYgYBTHBwiwXgXWNWs |
| 07:32:51 | crank | - | tick 5 slot=6732 coins=12 |
| 07:32:51 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=2jj2vZMttbkS… |
| 07:32:51 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=5ADohoviT8Bf… |
| 07:32:51 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:32:52 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=38jTKoYkN7rB… |
| 07:32:52 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:32:52 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=49c9ys7gPFgB… |
| 07:32:53 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=2VcXcbGf6NKB… |
| 07:32:53 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=JKNqSx4JtMhS… |
| 07:32:53 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:32:54 | crank | SLOW | check_trigger → still_armed cum_volume=34962954 mcap_sol=2.448 fire_slot=6691 sig=53eTsyDhikKz… |
| 07:32:54 | crank | SLOW | fire_trigger → ok kind=volume tx_slot=6740 fire_slot=6691 released=900000000000 pending=900000000000 sig=5a1ZXEv8rHfV… |
| 07:32:54 | crank | SLOW | snapshot → ok slot=6740 holders=3 excluded=5 root=0659e3c468435074… file=/home/pc/airdrop-launchpad/crank/snapshots/WpmxALKWy5N4h72YuCMN14F6aSRA5LBA3iv291iHaaX-0.json |
| 07:32:54 | crank | SLOW | open_round → ok round=0 winners=8 prize=112500000000 committed=900000000000 commit_slot=6741 snapshot_slot=6740 sig=4ftDytf9PJdP… |
| 07:32:56 | sim | HOT | buy 0.0351 SOL by trader sig=4s5rmpqg6BpEhzncSw4ZCh92Xw2Mn5cBGMKNtk8WNabyQR3J3JYEBEYo4E3zWverjCWS2gNjXUVPdPnF8aFKJtaN |
| 07:32:56 | crank | SLOW | draw → ok round=0 tx_slot=6744 seed=28abcb09340643f8… sig=3mCdwGmk3gVh… |
| 07:32:56 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=5vH5Fti7nRsm… |
| 07:32:56 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:32:56 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=4xxKKRgy3eMN… |
| 07:32:57 | crank | HOT | check_trigger → still_armed cum_volume=1014201990 mcap_sol=6.468 fire_slot=6695 sig=5aJQeh1QnSCh… |
| 07:32:57 | crank | HOT | fire_trigger → ok kind=milestone tx_slot=6748 fire_slot=6695 released=4822520050668 pending=4822520050670 sig=3zWw6SYWxSfe… |
| 07:32:57 | crank | HOT | snapshot → ok slot=6748 holders=4 excluded=5 root=77ef439a79085bb6… file=/home/pc/airdrop-launchpad/crank/snapshots/2pL4vX5HN4d3vEwp5ok8jxSCLX9SwpFqy9ebyozmT3ea-1.json |
| 07:32:58 | crank | HOT | open_round → ok round=1 winners=8 prize=602815006333 committed=4822520050664 commit_slot=6749 snapshot_slot=6748 sig=KmUumkk9ygTQ… |
| 07:32:59 | crank | HOT | draw → ok round=1 tx_slot=6752 seed=8d86b7478e4d89db… sig=5U14YDVV7RBJ… |
| 07:32:59 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=t5CcjsxUMiG1… |
| 07:32:59 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:33:00 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=5GJwfGZHBuWb… |
| 07:33:00 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:33:51 | crank | - | tick 6 slot=6875 coins=12 |
| 07:33:51 | crank | 2BYg…WSbz | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=4chXRmQ4W4u3… |
| 07:33:52 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=3U2p2cM2Y2PA… |
| 07:33:52 | crank | 274b…X2XS | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:33:52 | crank | 5siF…v1cL | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=VX8bWH6Pnxgh… |
| 07:33:52 | crank | 5siF…v1cL | open_round → skip reason=not dev or platform pending=1800000000000 |
| 07:33:53 | crank | ChjG…Pq6e | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=FSi28zU1atyt… |
| 07:33:53 | crank | BcqV…9Etg | check_trigger → idle cum_volume=823106768 mcap_sol=5.601 sig=2e2qvBw7mwrx… |
| 07:33:54 | crank | E4Zr…LDxa | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=3cnX1oCSn4Ad… |
| 07:33:54 | crank | E4Zr…LDxa | open_round → skip reason=not dev or platform pending=6 |
| 07:33:54 | crank | SLOW | check_trigger → idle cum_volume=34962954 mcap_sol=2.448 sig=3bnak6fmCHkV… |
| 07:33:55 | crank | 8HDC…b7NX | check_trigger → idle cum_volume=1074299453 mcap_sol=5.651 sig=xPPsEQ7gNgQJ… |
| 07:33:55 | crank | 8HDC…b7NX | open_round → skip reason=not dev or platform pending=8785224810297 |
| 07:33:55 | crank | GDuH…N2hh | check_trigger → idle cum_volume=11654318 mcap_sol=2.378 sig=4ZvCBpc2Rkw7… |
| 07:33:56 | crank | HOT | check_trigger → idle cum_volume=1014201990 mcap_sol=6.468 sig=5W7mZ6KZPQzd… |
| 07:33:56 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5ppX2k6UpgPa… |
| 07:33:56 | crank | Cm85…NhDt | open_round → skip reason=not dev or platform pending=6065921730205 |
| 07:33:56 | crank | CPkr…GRhD | check_trigger → idle cum_volume=823178396 mcap_sol=5.600 sig=4hj825YWwR6G… |
| 07:33:56 | crank | CPkr…GRhD | open_round → skip reason=not dev or platform pending=7 |
| 07:34:10 | sim | - | crank stopped  |
| 07:34:10 | holder | HOT | claim round 1 draw 0 trader +602815006333 token sig=5grf81APnsTUQUyQdBz179xPvmmR2Ko5WDznbMBKhZ5DBRsL5uFZhVAocUzqKnox5maApzRFP3CeLnZbbyksg9Ho |
| 07:34:10 | holder | HOT | claim round 1 draw 1 trader +602815006333 token sig=5Ygq1DUW1v6cZfQGKFjXtJrD5CFdQ4Q92XVjWaziPFo3YA1K9S8nR78B13cAqJKU4jRazL5WpD26R8ggjCAQetKn |
| 07:34:11 | holder | HOT | claim round 1 draw 2 3J9E…Hgvg +602815006333 token sig=J8H9ox6BC3PgpYncgFSY5Ads3LoQvkrv3KsKdUqY8FsZbtdtFFypSNi4cHkQxGJprbM5RkUMzrLCbhXf89X2496 |
| 07:34:11 | holder | HOT | claim round 1 draw 3 trader +602815006333 token sig=TLTzkyeMU9vsV8uXhJWYNyB3LCZ7ijHiLKPwBsEH65w1FoSBqPUktZppwAJVBQrrurq18efbUY6QS3h3kcKmC9K |
| 07:34:12 | holder | HOT | claim round 1 draw 4 trader +602815006333 token sig=Nfam1VBnxXcFVJTXtU6ZpW4YxqDPXDaNaG7ar6ZQD9tJaawEyvbZUSa6PgMYK1pU34Bdv88X5eUnyrX1Z2dAWWV |
| 07:34:12 | holder | HOT | claim round 1 draw 5 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 07:34:12 | holder | HOT | claim round 1 draw 6 3J9E…Hgvg +602815006333 token sig=3oNdZj3q1oyXK2jRYitP2jB2kKRqUxcTYVAGy8M6WgA2HhBKLairTyjrnNmRjFTUjRy7YMoBghwy9ZNdLamqDqvm |
| 07:34:12 | holder | HOT | claim round 1 draw 7 trader +602815006333 token sig=4yqogowYo8YWF4TZjcHnHYZLvtDy5acSZhb1fvGHBZ11wyxk6t3F9tJ64ZX2uDmSdsE12ENQbnwLcSF4AbdBF7q3 |
| 07:34:13 | holder | HOT | claim round 0 draw 0 trader +116247042419 token sig=37YKQn89bJ4LPCHSn9aombt1eoHv6PsF4GAPnxETCU2WYLpDcLsAMCJ8b5gJezAXGYW5rRHSxeHkp89wS4EYrM6X |
| 07:34:13 | holder | HOT | claim round 0 draw 1 trader +116247042419 token sig=comPbWi9qp8ciHwF1AgbrW3bekYTQoRZS4Ew5nCPMNutdMnnRXExvVCrBjcXBor7wT7uGJoe3Fcn67mKLcTX3g2 |
| 07:34:14 | holder | HOT | claim round 0 draw 2 trader +116247042419 token sig=5bRSrT37ZWseqQAzMjQpcKQFFPU2T9JZm5ocqta8HTYQRkLJFzd4KZSE5grfdgenS13ZacA2Q1YnDqLVJTR6bjsd |
| 07:34:14 | holder | HOT | claim round 0 draw 3 trader +116247042419 token sig=4UXMpv4CWihj3hkS1zLLh1YsfDGD3KumCSUZ2Vf1VsNVh97zVhBwMqPao1PtQ1XDofghXwunvJf6ANT5ksLH2fRv |
| 07:34:15 | holder | HOT | claim round 0 draw 4 trader +116247042419 token sig=wQm9uP3dUh6see3acVgBSYA5LiLR1GB3BCdbJEnEY6SmA5QCmSkoQLbjKRnEhC7DxZHYHa1UtMPoDBZuAWzSwxh |
| 07:34:15 | holder | HOT | claim round 0 draw 5 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 07:34:15 | holder | HOT | claim round 0 draw 6 3J9E…Hgvg +116247042419 token sig=3GVgiN3FjdLmTrQWFZb9vHYBvPEhebqCj29bcRfuHyHYwkv8g1PVeRLgT9sw2iWUDNzY6b2fuPpjGMBLrzXrZNRH |
| 07:34:15 | holder | HOT | claim round 0 draw 7 3J9E…Hgvg +116247042419 token sig=2xzg967Z7Xj1bTXj9dg5WQDCrzDhok5Bsb5iyABdEdyAor2As4j2Rv2QN5moyfXWvtGtZK1QBX94du5WAW8chsGC |
| 07:34:15 | holder | SLOW | claim round 0 draw 0 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 07:34:16 | holder | SLOW | claim round 0 draw 1 2TTr…ZQux +112500000000 token sig=ZP1uSpaXJY2RdnKEPB55C3oafUEQi1XVj8UE8NFttsq2B1Zb6uwkC24C37xNHYNJKcXxquRRJgkPFVhHiyphMyK |
| 07:34:16 | holder | SLOW | claim round 0 draw 2 3J9E…Hgvg +112500000000 token sig=2YmFokz6LKexYM8HSAkumw5gVBCxXysWD4wZaD1tXH6ncoS7JPEN7zY3eJvroiziKBA2n6CUJwyPiK9BhrRLdgse |
| 07:34:17 | holder | SLOW | claim round 0 draw 3 2TTr…ZQux +112500000000 token sig=45yAXcPwb2L38f2uxpSP1cvGfhLi6A9S4zwzbeYvwbHM5En3eRxvYYfxy4XZYXnrYktRTfuPsMcxmfF4dEA7pLSQ |
| 07:34:17 | holder | SLOW | claim round 0 draw 4 2TTr…ZQux +112500000000 token sig=5bJuGQp4zS6JomuKMhe41pe9jvBwu6KEokejqMg9mkHdF2zSy14SspCnEdYdv9Ym6mePXzCdi6iq3T1p9VaVFNoK |
| 07:34:17 | holder | SLOW | claim round 0 draw 5 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 07:34:17 | holder | SLOW | claim round 0 draw 6 left for the demo wallet (2xfs…q36K) to claim from the web site |
| 07:34:17 | holder | SLOW | claim round 0 draw 7 3J9E…Hgvg +112500000000 token sig=2MdPvrqyciWbmo3XYxMq6dq84Rw9u6mo9aLPFVPTp8d3fVN1ZNLps9BceiA22TFS2jZCwvKUF8jLLwqvZFi9ohW3 |

Ham crank kaydı: `/tmp/crank-sim-0yKEQK/crank.jsonl`