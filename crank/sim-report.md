# Crank simülasyonu — 2026-09-12T06:54:27.237Z

Localnet, 10 dk, crank aralığı 60 sn, gecikme penceresi 100 slot.
Crank cüzdanı `2y2Z72iZQAEz2tjR7R7qS8KVjSFadU5QrXKGd7DSbPSh` (dev değil), trader `Gx5ehqo7cun4xoBy2q8xEWsg28of6kSBQmLbQ5yEfaqJ`.

- HOT: mint `8HDC38eMAgkSEH8tsQ1NyT54PjeJwiuFMZmZC66Bb7NX`, escrow `9UCKA5QPZ887gWc8eepZ9GSwmdVhfAAcTGxiFEUFtomT`
- SLOW: mint `5siFi95AF4JM6wcV6P94TBY5Ej8YsyH4p9VjgwyJv1cL`, escrow `47MwzPWwiuYMRmJ3Y8myXQLyoawCe69WqzJCJSmXV4ZC`

## Sonuç: ✅ hepsi geçti

| Kontrol | Durum | Detay |
|---|---|---|
| her fire, fire_slot'tan sonra indi | ✅ | Cm85…NhDt milestone tx_slot=1404 fire_slot=1202; HOT volume tx_slot=1693 fire_slot=1577; SLOW volume tx_slot=1978 fire_slot=1835; HOT volume tx_slot=1982 fire_slot=1917; HOT milestone tx_slot=2266 fire_slot=2208; HOT volume tx_slot=2550 fire_slot=2473; SLOW volume tx_slot=2688 fire_slot=2608; HOT volume tx_slot=2832 fire_slot=2768 |
| beklerken hiç erken çağrı yapılmadı | ✅ | 7 bekleme, 0 TooEarly |
| her kurulan tetikleyici ateşlendi | ✅ | 7 armed, 8 fired |
| SLOW, HOT'tan sonra kuruldu (hacim eşiği çalışıyor) | ✅ | HOT tick 2, SLOW tick 4 |
| bağıştan sonra buyback yapıldı | ✅ | HOT spent=8534565 tokens=3089041643007; HOT spent=9108069 tokens=5983577057739; HOT spent=9952553 tokens=8632508138552; HOT spent=10533060 tokens=11135449347089 |
| whale alımı kilometre taşını kurdu | ✅ | HOT tick 6 amount=4931625406927 |
| crank hata vermedi | ✅ | - |
| hiç tick atlanmadı | ✅ | 11 tick |

## Zaman çizelgesi

| Zaman | Kim | Coin | Olay |
|---|---|---|---|
| 06:54:27 | sim | - | fund crank 2y2Z72iZQAEz2tjR7R7qS8KVjSFadU5QrXKGd7DSbPSh 5 SOL |
| 06:54:28 | sim | - | fund trader Gx5ehqo7cun4xoBy2q8xEWsg28of6kSBQmLbQ5yEfaqJ 100 SOL |
| 06:54:47 | sim | HOT | launch mint=8HDC38eMAgkSEH8tsQ1NyT54PjeJwiuFMZmZC66Bb7NX escrow=9UCKA5QPZ887gWc8eepZ9GSwmdVhfAAcTGxiFEUFtomT sig=RrbthC78XSLu53yf7Tcxjw1QqEzBruo5b3h97KVyUQUiRyzRt1UbXDU6rt3x59mpDZzdziCqcLZ54ESGf5duMFo |
| 06:55:04 | sim | SLOW | launch mint=5siFi95AF4JM6wcV6P94TBY5Ej8YsyH4p9VjgwyJv1cL escrow=47MwzPWwiuYMRmJ3Y8myXQLyoawCe69WqzJCJSmXV4ZC sig=5VhdYqgCw9FQSrm7c4fu5gspgKSmcJXPC3NzZy3SchngKj6gx7i4kvkuWFSmBSxkR3gquujvZozH9dfiRQshqmXB |
| 06:55:05 | sim | - | crank started wallet=2y2Z72iZQAEz2tjR7R7qS8KVjSFadU5QrXKGd7DSbPSh interval=60000ms |
| 06:55:05 | sim | - | market sizes mcap=1.796 SOL hot=0.0269 SOL/15s slow=0.0045 SOL/40s |
| 06:55:06 | crank | - | tick 1 slot=1397 coins=4 |
| 06:55:06 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=7axzzgx5CTQU… |
| 06:55:06 | crank | SLOW | collect_fees → ok lamports=1164295 sig=5S2BxzsqpYVB… |
| 06:55:07 | crank | SLOW | check_trigger → idle cum_volume=0 mcap_sol=1.796 sig=Tfxxh5BfR7qo… |
| 06:55:07 | crank | HOT | collect_fees → ok lamports=1164295 sig=2HszBUyhPpb3… |
| 06:55:07 | crank | HOT | check_trigger → idle cum_volume=0 mcap_sol=1.796 sig=2Eu7sYTN1H8Y… |
| 06:55:08 | crank | Cm85…NhDt | check_trigger → still_armed cum_volume=960462466 mcap_sol=5.171 fire_slot=1202 sig=2EnzRziqtm9y… |
| 06:55:08 | crank | Cm85…NhDt | fire_trigger → ok kind=milestone tx_slot=1404 fire_slot=1202 released=5095627923938 pending=6065921730205 sig=5nr9iXuJjWo7… |
| 06:55:10 | sim | HOT | buy 0.0269 SOL sig=9ggeBDBWeYFvY5UkrM6euxjStxFS9rXbfHimTJwTcnNG4xtWcFE4ET1EkfabiPQFghMhkqChWMj1e9sf1zhWJqV |
| 06:55:25 | sim | HOT | buy 0.0269 SOL sig=5ayhw6qsTRVpDYrRQS4PHtL2r3spFLLpcssFE7Q6dJ3kLTQyxDucGo6fDtiMiQnMWMHZGHroT4khme4uhpbnDJDw |
| 06:55:26 | sim | SLOW | buy 0.0045 SOL sig=58ScrKEivzxpYmmabrQk4P6hVWnAdU9dqjj3GB7s4TUtUariTWC1bo7W5TcDUuqoXXdDBAgCfjCifscgbXE85i85 |
| 06:55:41 | sim | HOT | buy 0.0269 SOL sig=2fBMSaEeWVuiB1VpYguosBeaiLF6shKnHG2Sp97pbtKC8Psk9iCgGBH9snr7mXWefNeCie4wj2VGLynpf4TeMwXo |
| 06:55:56 | sim | HOT | buy 0.0269 SOL sig=2uEAebju8vf3U5doCkdpf5bAQQJF3Bov2tQ2UFrvF1dGgk3bxwvCg7NgYPEXjGkh5v5ni9wzyzr4Hb4MdTTXVWE9 |
| 06:56:05 | sim | SLOW | buy 0.0045 SOL sig=5Jz8PFRJdCpypYZH3Pj6SM5S8b7o27Sc58txSEJ1EWCCF6KUsiuae7YxWDhoc9kh3PiMWczsQHZHjvQz65BaFkcH |
| 06:56:08 | crank | - | tick 2 slot=1547 coins=4 |
| 06:56:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=MGftpnSbeioP… |
| 06:56:09 | crank | SLOW | check_trigger → idle cum_volume=8888886 mcap_sol=1.819 sig=2Wz1YFqacdHh… |
| 06:56:09 | crank | HOT | check_trigger → armed cum_volume=106271600 mcap_sol=2.081 kind=volume amount=900000000000 fire_slot=1577 sig=2UUiii9DjRtQ… |
| 06:56:09 | crank | HOT | fire_trigger → wait slot=1550 fire_slot=1577 slots_left=27 |
| 06:56:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=3TFaxgumGR3X… |
| 06:56:12 | sim | HOT | buy 0.0269 SOL sig=4hsNXmYDSvhfkdEVZWRwULC9F4f9iyX3i9HRNMXWjXi3TNftgYWv9ggqBCzCzrtoXS7Wo3TV9c6gEtKbMAU8oJ9D |
| 06:56:27 | sim | HOT | buy 0.0269 SOL sig=fkzy2tzk6Famw6DAYUVXmaYvFkEjPde1pHnZXKt8YDDX8oPTaBEUr5GdKsY3q7nKAc8tZ3yvi8SCiX1Y7QPMsKD |
| 06:56:42 | sim | HOT | buy 0.0269 SOL sig=3iEd5dHi8kBE2VYRGijarc4msLoAi3mcjjfWCaaXxjywMjVmSsGGn4mLUqmMjcDo9Li4ZGW22JM3YzYCs4XKTxaf |
| 06:56:46 | sim | SLOW | buy 0.0045 SOL sig=4zXKPX1UzoWH41fnfvfvrBKXiyTPBQBa5ujA18U5ciwiomXy7P4GkjDjSBRVuQZfJpd7Qu57L417oiKxy7XhgvHZ |
| 06:56:58 | sim | HOT | buy 0.0269 SOL sig=4m1tQFtkyw3ZqJ6gy1bvbMbzFA4QH8TEmYHRnC9z789MTvGYcEwR2WXA3G5R5aXNTaMQ8AAojQpm9Xf2diC3yoCN |
| 06:57:08 | crank | - | tick 3 slot=1689 coins=4 |
| 06:57:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=orsV8dkXk7pN… |
| 06:57:09 | crank | SLOW | check_trigger → idle cum_volume=13333329 mcap_sol=1.830 sig=5mxGEZ7XiefE… |
| 06:57:10 | crank | HOT | check_trigger → still_armed cum_volume=212543200 mcap_sol=2.388 fire_slot=1577 sig=5V8pFTot8co5… |
| 06:57:10 | crank | HOT | fire_trigger → ok kind=volume tx_slot=1693 fire_slot=1577 released=900000000000 pending=900000000000 sig=38js4w3inx1z… |
| 06:57:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=4WoV6fHZhzEZ… |
| 06:57:13 | sim | HOT | buy 0.0269 SOL sig=2TBWMYRXLovLcRhCUWLoPsZVH2u5FmL9zwtc1icGECquPRKdqWvrKBmc12Axew87UyjfUjifQ2mv9EpGNToFTijE |
| 06:57:27 | sim | SLOW | buy 0.0045 SOL sig=47fkXbvFmCPkSsT6YVtATRvk4ZrgNxWcVHc7jcp8zXhwUiQe5YpQZiVvsSZJF3eWATYupHBzeZ3daCJJTpXVqCtk |
| 06:57:29 | sim | HOT | buy 0.0269 SOL sig=5jic3Q7uGd2zQYCaQ5yhQq975jDfsikVSWgSx7KTGHad9tRcuUDPhV2evLTbiqfnUMT7adBK8q7dg65CMy828dZq |
| 06:57:44 | sim | HOT | buy 0.0269 SOL sig=49bpSRQcz5ktH41B48GPMkKLitgrEE3j5Zu3ZSXmEaahEc9FRRCN2wcfGcNYd2riP4kDDkZz1zvnvzFtQaUuDHY7 |
| 06:57:47 | sim | HOT | donation to escrow 0.05 SOL sig=2bozKDc1oNQnoFwqowmSDvwep136zkzYZsd4x74PzmakNiE5M4TqVg7AXpT1PLbqgiPnx4kmRSiwhA6iwDthHsEp |
| 06:57:59 | sim | HOT | buy 0.0269 SOL sig=2domu6ecmLzDXb5jbekspympMEqCt17GbLNEf2nxKo2kBCd7QsLRhNK2CZxm9jNYQhh4qc2xhmLEGFnCVAmsVUcK |
| 06:58:07 | sim | SLOW | buy 0.0045 SOL sig=51d3vMAbVHuvN4vh2pvVKGthCw1kLSWbBWWWmNPVJRtVyRrq7awsCCzh38hQvrNZUvN1Xq5mM8JJZgZWB2qeMCDN |
| 06:58:08 | crank | - | tick 4 slot=1832 coins=4 |
| 06:58:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=59xvKdyYywMt… |
| 06:58:09 | crank | SLOW | check_trigger → armed cum_volume=22222215 mcap_sol=1.854 kind=volume amount=900000000000 fire_slot=1835 sig=3hsLwDED6J9o… |
| 06:58:09 | crank | SLOW | fire_trigger → wait slot=1834 fire_slot=1835 slots_left=1 |
| 06:58:10 | crank | HOT | buyback → ok spendable=41164295 spent=8534565 tokens=3089041643007 sig=3pDS63QBMY8u… |
| 06:58:10 | crank | HOT | check_trigger → armed cum_volume=327243999 mcap_sol=2.715 kind=volume amount=930890416430 fire_slot=1917 sig=5GKKNi4oBZ9j… |
| 06:58:10 | crank | HOT | fire_trigger → wait slot=1836 fire_slot=1917 slots_left=81 |
| 06:58:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5QpUY8uJ6CuL… |
| 06:58:15 | sim | HOT | buy 0.0269 SOL sig=5LDAMhUmScCWMBM5XAGGpEFxucisxjnwCKMhjzqphcBzJWBU1SY8khYGcWoT6BZUCQhBTAKDyWm76qvMnYuwnnGe |
| 06:58:30 | sim | HOT | buy 0.0269 SOL sig=5eMLv5SnLbMwRPkGVSc8JKAE3TGYPLi1FpQaoK3szGv1izbHnJQP2BLWaVjyH5XXANzWEt2aZNAZXi2Y29SfRMNu |
| 06:58:45 | sim | HOT | buy 0.0269 SOL sig=s2a96qSz6vMH9FRmbUBoU3t9pcFihvtsAujdhXBNgw7NdLKFEdcsLBYs4KCs4X1mzgFV1rEVRi7jv77dk7SPFCG |
| 06:58:47 | sim | SLOW | buy 0.0045 SOL sig=5ZZdEeUgprY9ZxnGpTbSw7zYjnPXCrb7r2eF7v9VritnbyEgGd4NSiTUjeXcAf2cy97EwVEGPkiyMCP2CYRk5837 |
| 06:59:01 | sim | HOT | buy 0.0269 SOL sig=5TZWg2ATwwzS6EibDtCF3yfyh4Ae6RPHTvuf8BKXRDuQgEFgscWCndY49yFMce1bVNAjJvMdKvTqgFCyof443DR4 |
| 06:59:08 | crank | - | tick 5 slot=1975 coins=4 |
| 06:59:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=5LVSg8CnycUh… |
| 06:59:09 | crank | SLOW | check_trigger → still_armed cum_volume=26666658 mcap_sol=1.865 fire_slot=1835 sig=2JSzseAMUbU4… |
| 06:59:10 | crank | SLOW | fire_trigger → ok kind=volume tx_slot=1978 fire_slot=1835 released=900000000000 pending=900000000000 sig=2qfeXmAhmjq3… |
| 06:59:10 | crank | HOT | collect_fees → ok lamports=1300552 sig=254dqa4cJWH5… |
| 06:59:10 | crank | HOT | buyback → ok spendable=32085882 spent=9108069 tokens=5983577057739 sig=3ksGdstaHR4s… |
| 06:59:11 | crank | HOT | check_trigger → still_armed cum_volume=442511222 mcap_sol=3.093 fire_slot=1917 sig=59CvAZJwwStK… |
| 06:59:11 | crank | HOT | fire_trigger → ok kind=volume tx_slot=1982 fire_slot=1917 released=930890416430 pending=1830890416430 sig=61j8gLY1gmxn… |
| 06:59:12 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=3GdvNpmRrryy… |
| 06:59:16 | sim | HOT | buy 0.0269 SOL sig=5HUa4pPGuf9vDD5uS3XV5AVnmuxgVL88KQpDoNBkHLcSvmgsQwLKmthuwfDVvWAHfyAs48T6tYfKBkvn9ksHHaT2 |
| 06:59:28 | sim | SLOW | buy 0.0045 SOL sig=MpdfT5oy9XVNjCexh89DAbod7XF6bUZbgPd3hv8HxBwF2qpW4BtPrHT7JPBp1CUnPWyDfBngVsepo5rFvSmWpnH |
| 06:59:31 | sim | HOT | buy 0.0269 SOL sig=375c7D2ppCfPUZ3VUAGtB7EryRTarxKw75eAwva4YjvtVwxkKrLBTQdiCLNFyecTsB7kMnR3NggmgDXqnp3BdkKk |
| 06:59:46 | sim | HOT | buy 0.0269 SOL sig=45zjPri2aJH7N8R1ArVfP5UZT1fDaD7qRBp1mdAXNHhLnaa7xVtaEjkFfsybQ1YgeCFkJvF6iL3sVMbGzKDZTLyc |
| 06:59:58 | sim | HOT | whale buy (2x mcap) 0.0543 SOL sig=4xXgo9szXPunZgAkHuV1XFVpd4yfPZgnByMheh64HPxo45s5s1Asrq2F7su5bbsS76XJ1fgbwF2U9Y8qVh89C9ZC |
| 07:00:02 | sim | HOT | buy 0.0269 SOL sig=26wE5DKaG7e4EYv7PQVYWW9VwETai8KxqyatuYEYxRMi4xcSF9CQ5hphodgYu1rAkjUEid3vVmgzvRDoMqpKHkuw |
| 07:00:08 | sim | SLOW | buy 0.0045 SOL sig=3xhPhrbu8prtgLdQYewvkRV1X9tzijSq4vc8ki9bZomoeFQT1edU7y7tu19JYBewJpRgwFkFsFjkuDwZexn6w1XU |
| 07:00:08 | crank | - | tick 6 slot=2118 coins=4 |
| 07:00:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=ciWBAX646BVq… |
| 07:00:09 | crank | SLOW | check_trigger → idle cum_volume=35555544 mcap_sol=1.889 sig=2FbDFAq1AMtG… |
| 07:00:10 | crank | HOT | buyback → ok spendable=22977813 spent=9952553 tokens=8632508138552 sig=54rdwgiRk3Z9… |
| 07:00:10 | crank | HOT | check_trigger → armed cum_volume=612242132 mcap_sol=3.693 kind=milestone amount=4931625406927 fire_slot=2208 sig=2g5UmJC9Znqh… |
| 07:00:10 | crank | HOT | fire_trigger → wait slot=2122 fire_slot=2208 slots_left=86 |
| 07:00:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=479DbwYgM1Vu… |
| 07:00:17 | sim | HOT | buy 0.0269 SOL sig=5YV5CXPrrwGY5XRjvddPMyctEocksUr1M5z6KXgGsWDXtfgDtpPLmV3Nb79bLSny4Jk6QCnHf7YiuZKNA49aQD2v |
| 07:00:33 | sim | HOT | buy 0.0269 SOL sig=3WE14o9vaSnqS9mZBTdst5zrv3AmkC39y33L6SJbygQvNfcSdEYWsTUxDZnoXeut2WwNyFVKyCG8gnvQhcudGMh |
| 07:00:48 | sim | HOT | buy 0.0269 SOL sig=5Nw7sAHtMJHsR1zs6MVcrweSCnLkA6j9PsVnbj8CkhN2QKdYbT4geZyJXrcr9FhJ3NY2LbjEhwoqAFcKLahLHCJu |
| 07:00:49 | sim | SLOW | buy 0.0045 SOL sig=c39hMj4wmX645YxUWVpvpn9rLJJUb8aiGM5eNr3SvkauoDpzwLDUA9f6VFLyDeJTZv4ivU2UEtvMC3oYBEUU8Y1 |
| 07:01:03 | sim | HOT | buy 0.0269 SOL sig=13vBmMu73DqncnovZKSwAtfwttHnpSohYvoNspheMjhj3txWKuZ43AKTAPSG4LPpqTfVDFvGMVBF8VFob82SiVM |
| 07:01:09 | crank | - | tick 7 slot=2261 coins=4 |
| 07:01:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=4ybyERU3bZXM… |
| 07:01:09 | crank | SLOW | check_trigger → idle cum_volume=39999987 mcap_sol=1.901 sig=pGfNxqXRw2xZ… |
| 07:01:10 | crank | HOT | buyback → ok spendable=13025260 spent=10533060 tokens=11135449347089 sig=3MAyrFYh22sj… |
| 07:01:10 | crank | HOT | check_trigger → still_armed cum_volume=728916753 mcap_sol=4.136 fire_slot=2208 sig=3hDwsUwsBVcW… |
| 07:01:10 | crank | HOT | fire_trigger → ok kind=milestone tx_slot=2266 fire_slot=2208 released=4931625406927 pending=6762515823357 sig=DihsSTnEtDs2… |
| 07:01:11 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5U3QxwGuGaBq… |
| 07:01:18 | sim | HOT | buy 0.0269 SOL sig=3n3avHgCMf2hBrYkjFUuoeU1v91ztK8bDpuwkANTN2zoCriCLNjsApqvesBacdrWKhRtQo7apRFFpbQvh6bvD6Cm |
| 07:01:30 | sim | SLOW | buy 0.0045 SOL sig=44LjHspDmW4A1w1RMW69RwznRmChpHiZGWqdRvHkoTXbbgd1UzDYM9d21E97BXBJ6PjoJbrfuig4QADHsy9nbSiK |
| 07:01:34 | sim | HOT | buy 0.0269 SOL sig=XgPGyQkJdgEAh11DbhuRN9nVhoePguZPc8bdvg1a65svS3SR6dC5Bz4wH2Xu4q5bYJ7eFYhryAzqGsC1edoCVD3 |
| 07:01:49 | sim | HOT | buy 0.0269 SOL sig=2neSrPhPTpj4aD5ZBC3xwuWFiCPVyDRGLS26PiEgsys17A5KQjhZqsU2JW5ioHyHtTBxBigZyb99ru5czooLVbXV |
| 07:02:04 | sim | HOT | buy 0.0269 SOL sig=5wQYCJBBiBZ75DfNBRbfXCqJNu8yphZSvffqsC1KvU2hi1QcvwPcjNYTLVGZbFSPtidiohm6yUAkVN6cwqegiU6U |
| 07:02:09 | crank | - | tick 8 slot=2404 coins=4 |
| 07:02:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=3UA3UotjyCsN… |
| 07:02:09 | crank | SLOW | check_trigger → idle cum_volume=44444430 mcap_sol=1.913 sig=2e5by118ghrX… |
| 07:02:09 | crank | HOT | collect_fees → ok lamports=1205024 sig=3HhYdwtuyt9k… |
| 07:02:10 | crank | HOT | check_trigger → armed cum_volume=835188353 mcap_sol=4.607 kind=volume amount=1011354493470 fire_slot=2473 sig=22mbLL5cq65i… |
| 07:02:10 | crank | HOT | fire_trigger → wait slot=2408 fire_slot=2473 slots_left=65 |
| 07:02:10 | sim | SLOW | buy 0.0045 SOL sig=j8ErdahNEGwwjyyu2jJ4SfYBPGc7DM8CoHHGdTxsjjsgCcUv4dUzyeC1vtW343yS3FpegbJzVmTxKr3jQmch8Qm |
| 07:02:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=2noNtQZvH1fU… |
| 07:02:20 | sim | HOT | buy 0.0269 SOL sig=4bvxiVLj4qyg1ppcagwtDoeg97gE3PEjRpBcAFQq4HnmTCAdyFF8JGa4ZFPjtJSaMt7A4nQ1sANkQMUqiZvh3vd3 |
| 07:02:35 | sim | HOT | buy 0.0269 SOL sig=5E66AnMWYcQfhfo57JjBd64usdXEaCzcCSZ7CVayVhmPGNuqr5kicjfPLwQpNUsXn2ZuBiMhuB23cyXZomiZVYMj |
| 07:02:50 | sim | HOT | buy 0.0269 SOL sig=3vkGWnsuBuxwcCcdv43BHiAe4HMX3Gm4vWep1Tt5msK3Ft87RyjMWQm2zfEQM6CD1EaouZE5x6ggyR6NAiYGRKSD |
| 07:02:51 | sim | SLOW | buy 0.0045 SOL sig=667KuYCryycsn22quKWfovJuTKiuexH7uNkyKFPjuVViWKCA8wJs6iwesYtusGivFXEuVTUiP3HFdeNJWBThK1ip |
| 07:03:06 | sim | HOT | buy 0.0269 SOL sig=49JMm8q6CBqDXHWkxc9UgHwKocG1uHhqLJeoQdejVjzKvx2eDVWap8peo7Wx6iWMdrknEu73XJzmWvg1Hcux16fE |
| 07:03:09 | crank | - | tick 9 slot=2545 coins=4 |
| 07:03:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=4BChPW29JAGN… |
| 07:03:09 | crank | SLOW | check_trigger → armed cum_volume=53333316 mcap_sol=1.936 kind=volume amount=900000000000 fire_slot=2608 sig=5NM2nnkQDnCy… |
| 07:03:09 | crank | SLOW | fire_trigger → wait slot=2548 fire_slot=2608 slots_left=60 |
| 07:03:10 | crank | HOT | check_trigger → still_armed cum_volume=941459953 mcap_sol=5.058 fire_slot=2473 sig=kjLHcPXdDtod… |
| 07:03:10 | crank | HOT | fire_trigger → ok kind=volume tx_slot=2550 fire_slot=2473 released=1011354493470 pending=7773870316827 sig=4AA4oS7rjAbV… |
| 07:03:11 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=3JGiwWZ8pfUe… |
| 07:03:21 | sim | HOT | buy 0.0269 SOL sig=5jS6KFTG5rtsbwFgyTYhmxYqGi5oduj7eUc92axTKyKyidA5Shy2GkNLipfz9KikdA7W5oSkFFa8Nvv9bTfFi3Q3 |
| 07:03:33 | sim | SLOW | buy 0.0045 SOL sig=56nWJE5Y7X244dGjhfyUtiy5zr5c4YmGX5jUNasqCRfXsPoDNVPtN88sKVs2E2m46x3HiXNd7AZ9VZCqi134nAyb |
| 07:03:37 | sim | HOT | buy 0.0269 SOL sig=4PE8w3iDaYVVNygKBoPrRVbTZeerWkuAzU99gkmzE9K69LJuBv9YCZnQVqczPUXNieEbjvg9UkMgcQLgHdWocHZC |
| 07:03:52 | sim | HOT | buy 0.0269 SOL sig=2yErSFtSBvFgqhgFPjxWDU8ZuMZWriP1RS1nnfNtjW8AVtzxx8YW7HWVqdn6ZccRJEwH91pTqm6JEJ8bBHU47KRD |
| 07:04:07 | sim | HOT | buy 0.0269 SOL sig=poSKaeEKeCnrts17UUA3UoFQwnKmp9bMZkHGe1YvCDypAbXxvXjqgEmXuxNAdB1mxkx2gPpYoFp4ZZRanaGyY3o |
| 07:04:09 | crank | - | tick 10 slot=2685 coins=4 |
| 07:04:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=3aMfyrDNv19o… |
| 07:04:09 | crank | SLOW | check_trigger → still_armed cum_volume=57777759 mcap_sol=1.948 fire_slot=2608 sig=4DV26vMeJubk… |
| 07:04:10 | crank | SLOW | fire_trigger → ok kind=volume tx_slot=2688 fire_slot=2608 released=900000000000 pending=1800000000000 sig=4oLfoF6wkLW3… |
| 07:04:10 | crank | HOT | check_trigger → armed cum_volume=1047731553 mcap_sol=5.530 kind=volume amount=1011354493470 fire_slot=2768 sig=CpGH9qjmhzdc… |
| 07:04:10 | crank | HOT | fire_trigger → wait slot=2689 fire_slot=2768 slots_left=79 |
| 07:04:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=427yB6BhJ4nZ… |
| 07:04:12 | sim | SLOW | buy 0.0045 SOL sig=4KrYHd9dG8xxofYAUQgyyP5FH1PWNJ6vvDAhUDkrhSXV3JUke3HfZD1VnWxMkbTnZqRaX7MhEJNHW2T8nQGDcfSm |
| 07:04:23 | sim | HOT | buy 0.0269 SOL sig=2RTmW9hUEaYmKaCa3pLiRmYHahX8nDXLkKnyv6prFZdLDtDmiaBLfkZc7H5BnSJ5eL5B733AxET6d39MXHXTzAGM |
| 07:05:09 | crank | - | tick 11 slot=2828 coins=4 |
| 07:05:09 | crank | 274b…X2XS | check_trigger → idle cum_volume=79012344 mcap_sol=2.006 sig=42kpNhG835oK… |
| 07:05:09 | crank | SLOW | check_trigger → idle cum_volume=62222202 mcap_sol=1.960 sig=3bWFUM7V2Ndk… |
| 07:05:10 | crank | HOT | check_trigger → still_armed cum_volume=1074299453 mcap_sol=5.651 fire_slot=2768 sig=2MHHJtkwaf7U… |
| 07:05:10 | crank | HOT | fire_trigger → ok kind=volume tx_slot=2832 fire_slot=2768 released=1011354493470 pending=8785224810297 sig=26bpRZKhRgcW… |
| 07:05:10 | crank | Cm85…NhDt | check_trigger → idle cum_volume=960462466 mcap_sol=5.171 sig=5Lm4FCdE2tou… |
| 07:05:33 | sim | - | crank stopped  |

Ham crank kaydı: `/tmp/crank-sim-zA448O/crank.jsonl`