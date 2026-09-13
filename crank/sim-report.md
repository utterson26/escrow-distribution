# Crank simülasyonu — 2026-09-13T15:37:41.597Z

Localnet, 5 dk, crank aralığı 60 sn, gecikme penceresi 100 slot.
Crank cüzdanı `2ktrqBviYwFeySgykNqYgWw5Ru86nXZrTvDJ5YQhpAuc` (dev değil; program config'inde platform yetkilisi), trader `9kasB1cyEDz8qeR27zd22UsS3JXh4EDfJ3CdVu7NVsie`, sabit holder'lar `v6BXXMTqGowcqotYDCdmgPvmkrdemzda7dLtqzMQ95b`, `Bx8JxY8nKCwzgfgcxudHjfVbYXdo7gbnTrezvNdYXT5F`.

- HOT: mint `6dyK6reusaD625RXyMZyrdon2Vg8bicptRVCjKiRZjYi`, escrow `HXMniCxiM4twfZDXFQn8kSd1r8n9Gbb68TRkNqgYMA2P`
- SLOW: mint `9fwASWm6PoNPkgBSKHEVqxmiVEN9mHhzge8pdHrhMEmT`, escrow `61mM91CoBUTvNRZS9uQHnz5XFdoqgUjBLTqLUb4cZLN1`

## Sonuç: ✅ hepsi geçti

| Kontrol | Durum | Detay |
|---|---|---|
| her fire, fire_slot'tan sonra indi | ✅ | Dt15…ipzb volume tx_slot=2145 fire_slot=2142; HOT volume tx_slot=2293 fire_slot=2160; SLOW volume tx_slot=2561 fire_slot=2503; HOT milestone tx_slot=2566 fire_slot=2464 |
| beklerken hiç erken çağrı yapılmadı | ✅ | 4 bekleme, 0 TooEarly |
| her kurulan tetikleyici ateşlendi | ✅ | 4 armed, 4 fired |
| SLOW, HOT'tan sonra kuruldu (hacim eşiği çalışıyor) | ✅ | HOT tick 2, SLOW tick 4 |
| bağıştan sonra buyback yapıldı | ✅ | Dt15…ipzb spent=15992264 tokens=25652973519864; Dt15…ipzb spent=16071238 tokens=27293396731963; HOT spent=9402219 tokens=2803979018969; Dt15…ipzb spent=16150602 tokens=28925758864910; HOT spent=12420996 tokens=4926484509715; Dt15…ipzb spent=16230358 tokens=30550099624143; HOT spent=13266532 tokens=6913713039380; Dt15…ipzb spent=16310508 tokens=32166458325946 |
| whale alımı kilometre taşını kurdu | ✅ | HOT tick 4 amount=4799283662459 |
| crank hata vermedi | ✅ | - |
| hiç tick atlanmadı | ✅ | 6 tick |
| her fire'dan sonra crank snapshot alıp round açtı | ✅ | HOT round 0 3 holder, 928039790189/928039790189 snap_slot=2293; SLOW round 0 2 holder, 900000000000/900000000000 snap_slot=2561; HOT round 1 3 holder, 4799283662459/4799283662459 snap_slot=2566 |
| snapshot zincirdeki slot'tan yeniden üretildi, kök tuttu | ✅ | 3/3 round |
| holder'lar paylarını elle müdahale olmadan claim etti | ✅ | 8/8 pay ödendi |

## Zaman çizelgesi

| Zaman | Kim | Coin | Olay |
|---|---|---|---|
| 15:37:42 | sim | - | fund crank 2ktrqBviYwFeySgykNqYgWw5Ru86nXZrTvDJ5YQhpAuc 5 SOL |
| 15:37:42 | sim | - | fund trader 9kasB1cyEDz8qeR27zd22UsS3JXh4EDfJ3CdVu7NVsie 100 SOL |
| 15:37:42 | sim | - | fund holder1 v6BXXMTqGowcqotYDCdmgPvmkrdemzda7dLtqzMQ95b 2 SOL |
| 15:37:43 | sim | - | fund holder2 Bx8JxY8nKCwzgfgcxudHjfVbYXdo7gbnTrezvNdYXT5F 2 SOL |
| 15:37:43 | sim | - | platform set config.platform = crank 2ktrqBviYwFeySgykNqYgWw5Ru86nXZrTvDJ5YQhpAuc |
| 15:38:01 | sim | HOT | launch mint=6dyK6reusaD625RXyMZyrdon2Vg8bicptRVCjKiRZjYi escrow=HXMniCxiM4twfZDXFQn8kSd1r8n9Gbb68TRkNqgYMA2P sig=2dzQhghLbjwBYteYCC6aDNGjR54RQU4QYuvKgDxHbAJSVs8E4PsxymiXya2NNWCYFtc4funZG6sAnaxDJHz1AAQE |
| 15:38:01 | sim | HOT | fee sharing set 90% escrow / 10% platform sig=3mKVtG2T5ywMvrnLU21UKXFLoAZb6yty2Mk3fWYaRAnn5FnBhjRsYPSkuMP93aU3PD7oTkYwDRKQaDKohFFSfjV7 |
| 15:38:20 | sim | SLOW | launch mint=9fwASWm6PoNPkgBSKHEVqxmiVEN9mHhzge8pdHrhMEmT escrow=61mM91CoBUTvNRZS9uQHnz5XFdoqgUjBLTqLUb4cZLN1 sig=w1p7Rb5QpNUX5qek8oSKAK3SvPDjCQaPtoi3QWBj7oPvPhkga1BMc9C8RZ6CkSq5MLkHQuaDLaj9HBTjcXWG2At |
| 15:38:21 | sim | SLOW | fee sharing set 90% escrow / 10% platform sig=65sejj1NeDLwz7gATrXTdSFv93uYpNP2rS3zRZR6wYR1tAE8bfpovf2qj6PgWAFo7iJhTUbbpUMfVavFEx2chLPK |
| 15:38:22 | sim | HOT | holder buy 0.15 SOL by v6BX…Q95b sig=37hCLVFQ1UibhwLrqZX4Yn5kLzUYLJEuFEmUNxckf9ijfznPpinAR1QQg5EBzA4AeW9WSAopqumALLYe6xWBCSWw |
| 15:38:23 | sim | HOT | holder buy 0.15 SOL by Bx8J…XT5F sig=5HG95skT2H5uoVX4pbxwwqJ13gcLDHEMGYBDCuV87G416xzMfaVVJT9YouRbY1oBaacvpPG8xbQvQYi63guAoLiM |
| 15:38:23 | sim | SLOW | holder buy 0.15 SOL by v6BX…Q95b sig=4y3tLFBrMCtUYsL8ry5pTm2pasd3DaZnQgNCsdSsyXtcZNAx3a9yBNbeQQkHj8m6HP3a79EXUBKZsYsZVdcVxtWE |
| 15:38:24 | sim | SLOW | holder buy 0.15 SOL by Bx8J…XT5F sig=5TRCMsjYjNLLxYWJ1tAqz74xKS5hPjaxXA5ic8KFF7iZq2sX2SaGRhis2ynGcLt6qJAtLQwSLzVQ7rL2MaJ9U7MQ |
| 15:38:24 | sim | - | crank started wallet=2ktrqBviYwFeySgykNqYgWw5Ru86nXZrTvDJ5YQhpAuc interval=60000ms |
| 15:38:24 | sim | - | market sizes mcap=2.644 SOL hot=0.0397 SOL/15s slow=0.0066 SOL/40s |
| 15:38:28 | crank | - | tick 1 slot=1987 coins=8 |
| 15:38:29 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=4Lw1iGXALK2R… |
| 15:38:29 | sim | HOT | buy 0.0397 SOL by trader sig=3pA6JXFy9RYL2fVsVKmSRfdsaxjyrDohhYikG8EwzRXSva6D4d4db1FxoCfXsmuohHhdCSHktUbQerghk1riVFEB |
| 15:38:29 | crank | Dt15…ipzb | collect_fees → ok vault=3977565 escrow_gained=3579808 sig=7T6bNzKb2UST… |
| 15:38:29 | crank | Dt15…ipzb | buyback → ok spendable=82805685 spent=15992264 tokens=25652973519864 sig=5DtUZ58oifJu… |
| 15:38:30 | crank | Dt15…ipzb | check_trigger → armed cum_volume=1341647370 mcap_sol=9.534 kind=volume amount=1683735862329 fire_slot=2142 sig=2iHbUhJuTS73… |
| 15:38:30 | crank | Dt15…ipzb | fire_trigger → wait slot=1992 fire_slot=2142 slots_left=150 |
| 15:38:30 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=3qeHJQsZ2JqA… |
| 15:38:31 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=54tMkpqpjeUp… |
| 15:38:31 | crank | SLOW | check_trigger → idle cum_volume=0 mcap_sol=2.644 sig=5nLxGLv4ekC5… |
| 15:38:32 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=22YFvvWNVEFd… |
| 15:38:32 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=xxcqpmQZ4Hea… |
| 15:38:32 | crank | HOT | check_trigger → idle cum_volume=0 mcap_sol=2.769 sig=4Yxuf385beAD… |
| 15:38:44 | sim | HOT | buy 0.0397 SOL by trader sig=JbBB6ttZmvuf2r1R7WmM1k4iLzMMnm2fZVn8fF8qv6ZVrc1AfeZPso49G17t15Tf2pQYpbJ1iM2rA9Ukq8cPbfh |
| 15:38:45 | sim | SLOW | buy 0.0066 SOL by trader sig=4DhqgtkJksx4d56g4Koi61Rqyr9CtQGaDtaQT37kHb4gSRzjWwxr7qvkUPZajUcmyJXZm9AL6ihfFvaN7Dihb4Pt |
| 15:39:00 | sim | HOT | buy 0.0397 SOL by trader sig=2y3hGTyvtEkJ2drjBJAXcwqfnzPRBW6HmfMSj9D5XmsTczPoFdetLrsJjG3nqRvGh3gkpGxBL3phZP7WDLnA3Hv3 |
| 15:39:15 | sim | HOT | buy 0.0397 SOL by trader sig=4jan5obzCZqhfovXGE42GfZTyCtHVdMZ716pVA26zg77Gi83vpba2VdkYWZcGM1fbnuqJAWTx6nAWZjJf75TWskL |
| 15:39:21 | sim | HOT | donation to escrow 0.05 SOL sig=5Wrwi5ehYuMWUG65w2Kq2yvGhZnSjcsLxLe9WgvHMXXkBLNEowJur6U1NyxUzF97GhjsLg14TAhD35bCgJ4AiCbw |
| 15:39:25 | sim | SLOW | buy 0.0066 SOL by trader sig=2AAa5nzcm614CFkWHTEUEHQcoZT1merqACTtjhE4TTE8ttA5BKNDKpm4rnecn1PYsBkeP29qJ6d45VyHFaR2mnLz |
| 15:39:30 | sim | HOT | buy 0.0397 SOL by trader sig=4LJKo2ryzLvUBgs1dZXSg52j2UfqZpcJLaANSzo8djDSdTpP8YKqCctmcSbmJoF2AnrbR8noX8SRxrSx31qUzDyJ |
| 15:39:33 | crank | - | tick 2 slot=2141 coins=8 |
| 15:39:33 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=2XC5wLaxpd5C… |
| 15:39:33 | crank | Dt15…ipzb | buyback → ok spendable=66813421 spent=16071238 tokens=27293396731963 sig=sqnHdSj8ZGw5… |
| 15:39:34 | crank | Dt15…ipzb | check_trigger → still_armed cum_volume=1357520197 mcap_sol=9.629 fire_slot=2142 sig=26GjniaqwfKB… |
| 15:39:34 | crank | Dt15…ipzb | fire_trigger → ok kind=volume tx_slot=2145 fire_slot=2142 released=1683735862329 pending=1683735862329 sig=5WNksEHEdYzN… |
| 15:39:34 | crank | Dt15…ipzb | open_round → skip reason=not dev or platform pending=1683735862329 |
| 15:39:35 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=kp8kW9SHEhJr… |
| 15:39:35 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=Xzi5btoYWTUz… |
| 15:39:36 | crank | SLOW | check_trigger → idle cum_volume=13037036 mcap_sol=2.685 sig=5TWGdV2rv5WE… |
| 15:39:36 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=nFHqGQdYtHx7… |
| 15:39:36 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=V8fNqhm4Nh5S… |
| 15:39:37 | crank | HOT | collect_fees → ok vault=1477040 escrow_gained=1403188 sig=66665A1C4W7q… |
| 15:39:37 | crank | HOT | buyback → ok spendable=41403188 spent=9402219 tokens=2803979018969 sig=2DeERrkPaUrm… |
| 15:39:38 | crank | HOT | check_trigger → armed cum_volume=166125645 mcap_sol=3.295 kind=volume amount=928039790189 fire_slot=2160 sig=3pPeqyZ92Cuk… |
| 15:39:38 | crank | HOT | fire_trigger → wait slot=2153 fire_slot=2160 slots_left=7 |
| 15:39:46 | sim | HOT | buy 0.0397 SOL by trader sig=66CJTotVHFwjmiS8ZVRT7N74HFyo3kP34RJ4ya47BUpxvHoD3VA6r2ZQRvah2gkTgGqqZuqowL6PydwH5i1xEVwa |
| 15:40:01 | sim | HOT | buy 0.0397 SOL by trader sig=5NwDH5w7fLhXawTmQ4EuE5vSfNAtaekgHCVYrMDWyKDVqgdif7TzMjdsqPiJtprWxEZyDR5M18SrjD6PpZNyHVBu |
| 15:40:05 | sim | SLOW | buy 0.0066 SOL by trader sig=4dNLSo2MKdK7zqD6xt3tW9uCKkZmWzqQXcgoZa3erCiKXkXQVc45BmgbHPj3bsTZ6WT8R3ZtEQPjLoNs7HoFTtrN |
| 15:40:16 | sim | HOT | buy 0.0397 SOL by trader sig=2FtSPjikyCgen2NgqjpCPscRLD4BW8fBLusU6XGVbhaYFp4pM3zPfKpBkm6hPY7LyND5B4g4LuVBYQ1MPXTWwxZB |
| 15:40:27 | sim | HOT | whale buy (2x mcap) 0.4431 SOL by trader sig=5kPdaY66uFcqZbUkZ98akiKVeinbUp3tNSttY5fTQ7g9fWHpRFcSiiKV6WbWHvApSZpBZvATM9zbvBjYrMLY5jYb |
| 15:40:32 | sim | HOT | buy 0.0397 SOL by trader sig=27DQRJmNTExJc8fYUq75nsh5o7AJuEm9twRiag95mQepCzPyFVXPGzpkqzuqFXvcosKoRNoKzMeGx7dhJmpRPzrY |
| 15:40:33 | crank | - | tick 3 slot=2281 coins=8 |
| 15:40:33 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=4dBXTcTmuFd5… |
| 15:40:33 | crank | Dt15…ipzb | buyback → ok spendable=50742183 spent=16150602 tokens=28925758864910 sig=2y2RPMecdrH8… |
| 15:40:34 | crank | Dt15…ipzb | check_trigger → idle cum_volume=1373471408 mcap_sol=9.724 sig=2LgY8kkcQvhD… |
| 15:40:34 | crank | Dt15…ipzb | open_round → skip reason=not dev or platform pending=1683735862329 |
| 15:40:34 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=3z45GVCvrxgV… |
| 15:40:35 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=4gc53p3T6GVY… |
| 15:40:35 | crank | SLOW | check_trigger → idle cum_volume=19555554 mcap_sol=2.706 sig=nYfswsEY8cq3… |
| 15:40:35 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=5E4PPTcYZXJ2… |
| 15:40:36 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=Tr9JehFF4Yx5… |
| 15:40:36 | crank | HOT | collect_fees → ok vault=1811268 escrow_gained=1720704 sig=2mMqVEdrVSWT… |
| 15:40:37 | crank | HOT | buyback → ok spendable=31877273 spent=12420996 tokens=4926484509715 sig=2vzXPZNCCUcd… |
| 15:40:37 | crank | HOT | check_trigger → still_armed cum_volume=772862428 mcap_sol=5.751 fire_slot=2160 sig=dNR9kPehs3v3… |
| 15:40:37 | crank | HOT | fire_trigger → ok kind=volume tx_slot=2293 fire_slot=2160 released=928039790189 pending=928039790189 sig=5psVxWKnr5MV… |
| 15:40:38 | crank | HOT | snapshot → ok slot=2293 holders=3 excluded=5 released=928039790189 total=928039790189 root=e41371efbd130f19… file=/home/pc/airdrop-launchpad/crank/snapshots/6dyK6reusaD625RXyMZyrdon2Vg8bicptRVCjKiRZjYi-0.json |
| 15:40:38 | crank | HOT | open_round → ok round=0 holders=3 released=928039790189 total=928039790189 commit_slot=2294 snapshot_slot=2293 sig=DPCgVJzKrkNL… |
| 15:40:45 | sim | SLOW | buy 0.0066 SOL by trader sig=4XMyLRUZyZZVt7F1coXQAiwdm1PyeHLfiHYam2jsfi41sMs1xcUxWYssBH1MQRLYadkWZGLXRVcB2yafoRGBYAqE |
| 15:40:47 | sim | HOT | buy 0.0397 SOL by trader sig=2nVKesnhyZp8pYLH2dM1Zw1brvczmPhrSEj7tFgXrvhqus5zLQ1WbCPj6sBhdDLTwHJC2i7gpQPAE6QxELPbBS91 |
| 15:41:03 | sim | HOT | buy 0.0397 SOL by trader sig=3WgkNBX6sNeuizke51hC4QyTAEyd2iMpx1YYibDPQ7jLE6N28tWG1ggAFZwcECwQPtJ6JFVeGVsBdQytRqKGHzwX |
| 15:41:18 | sim | HOT | buy 0.0397 SOL by trader sig=33t3UQ8MjGf2ZirsieKkCAZTtiqki16w3wToSZsv9HLp1gfekhLxHrx1btnYxwbpZUwTLUFF5RQCQEcUg3mR5fY9 |
| 15:41:25 | sim | SLOW | buy 0.0066 SOL by trader sig=2JNcdv4CThd5dfw54yAijw95jPRwiyHc3uDJ75zPn73jpAg6vvsAYE8NtsmqAf1DXAGvTGcknbMqhMfrEnPZrThZ |
| 15:41:33 | crank | - | tick 4 slot=2421 coins=8 |
| 15:41:33 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=5ZXvg88SGJQ8… |
| 15:41:33 | crank | Dt15…ipzb | buyback → ok spendable=34591581 spent=16230358 tokens=30550099624143 sig=4bBDi4ypJuo2… |
| 15:41:34 | sim | HOT | buy 0.0397 SOL by trader sig=4pBmfAA2nesbLgtctcJrAqiaogrJ6J2aDHiEvkaR5XPTJRZc9EPGZdLwVxreig6EWVGKWSAmQLCktX8vSCzWtjij |
| 15:41:34 | crank | Dt15…ipzb | check_trigger → idle cum_volume=1389501391 mcap_sol=9.820 sig=4a1Asxsv29VV… |
| 15:41:34 | crank | Dt15…ipzb | open_round → skip reason=not dev or platform pending=1683735862329 |
| 15:41:34 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=4TBBx5ZY87DZ… |
| 15:41:35 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=2XtahLwAhhw1… |
| 15:41:35 | crank | SLOW | check_trigger → armed cum_volume=32592590 mcap_sol=2.747 kind=volume amount=900000000000 fire_slot=2503 sig=5Yk4AayPBkY2… |
| 15:41:35 | crank | SLOW | fire_trigger → wait slot=2427 fire_slot=2503 slots_left=76 |
| 15:41:35 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=2uvPn6hHGd4X… |
| 15:41:36 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=5YYd4DM7zYsy… |
| 15:41:36 | crank | HOT | buyback → ok spendable=19456277 spent=13266532 tokens=6913713039380 sig=3GTVKpWG3gfv… |
| 15:41:37 | crank | HOT | check_trigger → armed cum_volume=942804678 mcap_sol=6.561 kind=milestone amount=4799283662459 fire_slot=2464 sig=uvFQK7J5Cqsd… |
| 15:41:37 | crank | HOT | fire_trigger → wait slot=2431 fire_slot=2464 slots_left=33 |
| 15:41:49 | sim | HOT | buy 0.0397 SOL by trader sig=4PJKHsbpq2xfzMtQMhaoraGuux9URLVJXGX5xxUpq2Zqw6wjCofA2s8WcZYNi9NFPUrUvJ3UjBJtx7e56gciPk4v |
| 15:42:06 | sim | HOT | buy 0.0397 SOL by trader sig=32YZCa21i8LEegbQQoxsqpwSiULQ8CkWY1Fv1ueSpaHkve9yJ8fWm2SmSKjuzNyk1DfxyENuKeTeFiKHh25Zeuhf |
| 15:42:07 | sim | SLOW | buy 0.0066 SOL by trader sig=65vZf3jHVB6jtzPeZQrp9EyBHPMNoyBDh7snB9vtSdfTTjtmzYNEtB9NvqVGMQiJ2QcNKPmWCTaWjgsfmUwdiyv2 |
| 15:42:20 | sim | HOT | buy 0.0397 SOL by trader sig=4cqiKR4NNh8o4ERdnrZ4MoYjdz9nvDhHDEYDV5z36EUdkiDpAscGayWoDBas534v9CJ5WXeSfGdEpiiWEgV3fxx9 |
| 15:42:33 | crank | - | tick 5 slot=2554 coins=8 |
| 15:42:33 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=3qhgEZFhNVmB… |
| 15:42:33 | crank | Dt15…ipzb | buyback → ok spendable=18361223 spent=16310508 tokens=32166458325946 sig=AAtJj6bDVahT… |
| 15:42:34 | crank | Dt15…ipzb | check_trigger → idle cum_volume=1405610534 mcap_sol=9.917 sig=2XMPm3YL934u… |
| 15:42:34 | crank | Dt15…ipzb | open_round → skip reason=not dev or platform pending=1683735862329 |
| 15:42:34 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=Z4B4t6FwoTXT… |
| 15:42:34 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=5eQScmrNeG3U… |
| 15:42:35 | crank | SLOW | check_trigger → still_armed cum_volume=39111108 mcap_sol=2.768 fire_slot=2503 sig=4nMvbG2r3xMt… |
| 15:42:36 | sim | HOT | buy 0.0397 SOL by trader sig=5ZiRS8c7RLypXPcr8aon1Ufxn9haYeMaaZxmNGNopqvAvU6FHX7RoXQaaQ4UCTfXNvudThqikvnwpJw6hJQaJB2B |
| 15:42:36 | crank | SLOW | fire_trigger → ok kind=volume tx_slot=2561 fire_slot=2503 released=900000000000 pending=900000000000 sig=2YaZ2smCdL1b… |
| 15:42:36 | crank | SLOW | snapshot → ok slot=2561 holders=2 excluded=5 released=900000000000 total=900000000000 root=3498b29caf887b0d… file=/home/pc/airdrop-launchpad/crank/snapshots/9fwASWm6PoNPkgBSKHEVqxmiVEN9mHhzge8pdHrhMEmT-0.json |
| 15:42:36 | crank | SLOW | open_round → ok round=0 holders=2 released=900000000000 total=900000000000 commit_slot=2562 snapshot_slot=2561 sig=67pnoBEC3bxK… |
| 15:42:37 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=zjsbJPZLygEN… |
| 15:42:37 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=4TjiucdRot1Y… |
| 15:42:37 | crank | HOT | check_trigger → still_armed cum_volume=1099644182 mcap_sol=7.428 fire_slot=2464 sig=5qK4b89JcDB1… |
| 15:42:38 | crank | HOT | fire_trigger → ok kind=milestone tx_slot=2566 fire_slot=2464 released=4799283662459 pending=4799283662459 sig=4vpvhLjDk7CC… |
| 15:42:39 | crank | HOT | snapshot → ok slot=2566 holders=3 excluded=5 released=4799283662459 total=4799283662459 root=b575df38ad07bc67… file=/home/pc/airdrop-launchpad/crank/snapshots/6dyK6reusaD625RXyMZyrdon2Vg8bicptRVCjKiRZjYi-1.json |
| 15:42:39 | crank | HOT | open_round → ok round=1 holders=3 released=4799283662459 total=4799283662459 commit_slot=2569 snapshot_slot=2566 sig=2DE9C14X1kaa… |
| 15:43:33 | crank | - | tick 6 slot=2691 coins=8 |
| 15:43:33 | crank | ARz9…YB3s | check_trigger → idle cum_volume=0 mcap_sol=0.968 sig=4Re65Q8xDDnH… |
| 15:43:33 | crank | Dt15…ipzb | check_trigger → idle cum_volume=1405610534 mcap_sol=10.016 sig=3XBRFbT1wgto… |
| 15:43:33 | crank | Dt15…ipzb | open_round → skip reason=not dev or platform pending=1683735862329 |
| 15:43:34 | crank | BdRL…6ySt | check_trigger → idle cum_volume=296296294 mcap_sol=2.644 sig=krNDCLGjUAJ8… |
| 15:43:34 | crank | 6Mwg…TFUQ | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=2qFgq4Lq6ubs… |
| 15:43:35 | crank | SLOW | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=2kSofNxGBZac… |
| 15:43:35 | crank | 755b…8rVm | check_trigger → idle cum_volume=0 mcap_sol=1.133 sig=VumEnooBvYEE… |
| 15:43:36 | crank | J3M8…iQXP | check_trigger → idle cum_volume=39111108 mcap_sol=2.768 sig=54uSHbU6MjGV… |
| 15:43:36 | crank | HOT | check_trigger → idle cum_volume=1099644182 mcap_sol=7.428 sig=3oucdzry6XZd… |
| 15:43:47 | sim | - | crank stopped  |
| 15:43:47 | holder | HOT | claim round 1 trader +3081351445604 token sig=3bPhmxxfiKkT4vueTCLW2bkeF21uukmYaqJkodGUxKkYXHvPmei4GHKJX84nchMcqRD99eZdMntYUwN1qBhfcCrC |
| 15:43:48 | holder | HOT | claim round 1 Bx8J…XT5F +775411091255 token sig=51rD8PVdErBdDdbzc1YgT8M6AQcbmsavRnGV2StPM4FKcF5XGJz188fpPNSmP2MLmytX384ZDSz1Rj15g53GAG99 |
| 15:43:48 | holder | HOT | claim round 1 v6BX…Q95b +942521125600 token sig=5vbQ9zMmQXSC86JMiVba3EoTew5oW5TDHj8J3RrcP94SUb7wymgXH4o8N6M4MKtR5ot9pXjTNKmMAfmyzTopHPk8 |
| 15:43:48 | holder | HOT | claim round 0 trader +544478499430 token sig=4Ybv28hY3RY8H5G2orFYJmS87KZiEdbQdMqrCwsgx7LCMgYAgGD76jnaTyMqBVjfTfZ6bL8b2kHpDYQhPNVyW1rh |
| 15:43:49 | holder | HOT | claim round 0 Bx8J…XT5F +172987088898 token sig=3u8XZRLegaVD4y1VQDrHKxbuSDk73Z2cg9JbEaT7thZFFNVqkWrsAc5bbGxgsWSig6E3tpFMyJE3Ef6S4PoH6vXy |
| 15:43:49 | holder | HOT | claim round 0 v6BX…Q95b +210574201861 token sig=aHrCXerEGhu8cw2UtFWo2PKv3AoWErypsX4haFFUgfBR336jxWnjiDELGBRpbc6BHWNnen1yu3XCpz1taViviYk |
| 15:43:50 | holder | SLOW | claim round 0 Bx8J…XT5F +406222199436 token sig=5Tw56bg7mRSKbT2Cz2fUfLfSXmJ4HSeg9qgFazxskNCqjG8YMuVJUPS9P7mXPqu2MFVG9CSD3axBLH7smJxy3f1z |
| 15:43:50 | holder | SLOW | claim round 0 v6BX…Q95b +493777800564 token sig=3wZoFgt434S1LSok9p25XDrbQguPxuJGbQgKJ9MhAAsteSkaY9MAEPidGtQ5pvBiZNHnVQJaiT2PMkRPev9Z8d1S |

Ham crank kaydı: `/tmp/crank-sim-fRy2Va/crank.jsonl`