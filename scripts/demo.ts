/**
 * Uçtan uca demo, tek koşu. Localnet'te (scripts/localnet.sh ayakta olmalı):
 *
 *   coin bas + escrow'a kilitle → 12 cüzdan alır, biri hepsini satar →
 *   creator ücreti birikir → escrow süpürür → buyback parça parça →
 *   hacim tetikler → rastgele gecikme → dağıtım serbest →
 *   snapshot + pro-rata paylaşım (%10 tavan) → kök zincire →
 *   sahte claim reddedilir → herkes kendi payını claim eder →
 *   tam satan cüzdan snapshot'ta yok.
 *
 * Her adımda tx imzası ve tek satır Türkçe açıklama basar, sonunda DEMO.md yazar.
 *
 *   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 npm run demo   (varsayılan zaten localnet;
 *   HELIUS_RPC_URL yok sayılır — indexer da aynı RPC'yi kullanır)
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey,
  SystemProgram, Transaction, TransactionMessage, VersionedTransaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction, TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  pumpAccounts, escrowPda, escrowAta, buyerPda, baseAtaOf, directBuyIx, directSellIx,
  feeAuthorityPda, sharingConfigPda, setupFeeSharingAccounts, collectFeesAccounts, shareholderMetas,
  TOKEN_2022, TOKEN, WSOL,
} from "../tests/pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";

// `npm run demo -- --devnet`: the real pump.fun on devnet through HELIUS_RPC_URL
// (the public RPC has no Token-2022 gPA for the indexer and rate-limits hard)
const DEVNET = process.argv.includes("--devnet");
const RPC_URL = DEVNET
  ? (process.env.HELIUS_RPC_URL ?? (() => { throw new Error("--devnet needs HELIUS_RPC_URL"); })())
  : (process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899");
const NET = DEVNET ? "devnet" : "localnet";
const OUT_MD = DEVNET ? "DEMO-devnet.md" : "DEMO.md";
/** SOL each throwaway wallet is funded with; on devnet the leftover is swept back at the end */
const FUND_SOL = DEVNET ? 0.2 : 0.6;
const explorer = (sig: string) => DEVNET ? `https://explorer.solana.com/tx/${sig}?cluster=devnet` : sig;
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const DELAY_WINDOW = 150;        // ~1 dk: demo bekleyebilsin, ama gecikme görünsün
const DEC = 1_000_000n;          // coin 6 ondalık

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (k: PublicKey | string) => { const s = typeof k === "string" ? k : k.toBase58(); return `${s.slice(0, 4)}…${s.slice(-4)}`; };
const sol = (lamports: number | bigint) => `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const tok = (raw: bigint | string | number) => {
  const n = Number(BigInt(raw.toString())) / 1e6;
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M coin` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K coin` : `${n.toFixed(0)} coin`;
};

/** BuybackDone event'inden harcanan / sonraya kalan */
function decodeBuybackDone(logs: string[]) {
  const line = [...logs].reverse().find((l) => l.startsWith("Program data: "));
  if (!line) return null;
  const b = Buffer.from(line.slice("Program data: ".length), "base64");
  let o = 8 + 32;
  const spent = b.readBigUInt64LE(o); o += 8;
  const bought = b.readBigUInt64LE(o); o += 8;
  o += 16; // quoted, floor
  const left = b.readBigUInt64LE(o);
  return { spent, bought, left };
}

interface Step {
  n: number; title: string; what: string; sigs: { label: string; sig: string }[];
  before?: Record<string, string>; after?: Record<string, string>; notes: string[];
}

async function main() {
  const conn = new anchor.web3.Connection(RPC_URL, "confirmed");
  const devPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const dev = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(devPath, "utf8"))));
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(dev), {
    commitment: "confirmed",
    // off localnet the RPC is load-balanced: a "confirmed" blockhash from one
    // node is "Blockhash not found" on the next, so simulate against finalized
    preflightCommitment: /127\.0\.0\.1|localhost/.test(conn.rpcEndpoint) ? "confirmed" : "finalized",
  });
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/airdrop_escrow.json"), "utf8"));
  const program = new Program(idl, provider) as any;
  const t0 = new Date();

  const steps: Step[] = [];
  let cur: Step | null = null;
  const step = (title: string, what: string) => {
    cur = { n: steps.length + 1, title, what, sigs: [], notes: [] };
    steps.push(cur);
    console.log(`\n[${cur.n}] ${title} — ${what}`);
  };
  const sig = (label: string, s: string) => { cur!.sigs.push({ label, sig: s }); console.log(`    ${label}: ${s}`); };
  const note = (s: string) => { cur!.notes.push(s); console.log(`    ${s}`); };
  const before = (b: Record<string, string>) => { cur!.before = b; };
  const after = (a: Record<string, string>) => { cur!.after = a; for (const [k, v] of Object.entries(a)) console.log(`    ${k}: ${cur!.before?.[k] ?? "-"} → ${v}`); };

  // ---- cüzdanlar ----
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const escrow = escrowPda(mint, program.programId);
  const escrowTa = escrowAta(escrow, mint);
  const buyer = buyerPda(mint, program.programId);
  const buyerTa = baseAtaOf(buyer, mint);
  // pump'ın gördüğü creator: launch'ta ücret PDA'mız, ücret paylaşımı kurulunca pump'ın sharing config'i
  const feeAuthority = feeAuthorityPda(mint, program.programId);
  const sharingConfig = sharingConfigPda(mint);
  const pa = pumpAccounts(mint, dev.publicKey, feeAuthority);   // launch
  const paS = pumpAccounts(mint, dev.publicKey, sharingConfig); // sonrası
  const pb = pumpAccounts(mint, buyer, sharingConfig);
  const platformWallet = Keypair.generate(); // platformun ücret cüzdanı (%10)
  const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
  const coinAta = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
  const wsolAta = (owner: PublicKey) => getAssociatedTokenAddressSync(WSOL, owner, true, TOKEN);

  // 4 isimli + 8 küçük cüzdan: 11 holder kalır, tavan (%10) ve oransal paylaşım aynı turda görünsün
  const NAMES = ["Ayşe", "Burak", "Ceren", "Deniz", ...Array.from({ length: 8 }, (_, i) => `Küçük-${i + 1}`)];
  const wallets = NAMES.map(() => Keypair.generate());
  const nameOf = (k: string) => { const i = wallets.findIndex((w) => w.publicKey.toBase58() === k); return i < 0 ? short(k) : `${NAMES[i]} (${short(k)})`; };
  const SELLER = 3; // Deniz alır, sonra hepsini satar

  const coinBal = async (owner: PublicKey) => {
    try { return BigInt((await conn.getTokenAccountBalance(coinAta(owner), "confirmed")).value.amount); } catch { return 0n; }
  };
  const escrowState = async () => (await program.account.escrow.fetch(escrow, "confirmed")) as any;
  const poolOf = (st: any) => BigInt(st.escrowed.toString()) - BigInt(st.allocated.toString());

  /** legacy tx */
  async function send(ixs: TransactionInstruction[], payer = dev, extra: Keypair[] = []) {
    for (let i = 0; ; i++) {
      try {
        const bh = await conn.getLatestBlockhash("confirmed");
        const tx = new Transaction({ ...bh, feePayer: payer.publicKey }).add(...ixs);
        return await sendAndConfirmTransaction(conn, tx, [payer, ...extra],
          { commitment: "confirmed", skipPreflight: false, maxRetries: 5 });
      } catch (e: any) {
        if (i >= 6 || !/Blockhash not found|timed out|429|Too Many Requests|block height exceeded/i.test(String(e?.message ?? e))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  /** v0 tx (lookup table ile) */
  let lut: PublicKey;
  async function sendV0(ixs: TransactionInstruction[], signers: Keypair[] = []) {
    for (let i = 0; ; i++) {
      try {
        const lutAcc = (await conn.getAddressLookupTable(lut, { commitment: "confirmed" })).value!;
        const bh = await conn.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
          payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs],
        }).compileToV0Message([lutAcc]);
        const tx = new VersionedTransaction(msg);
        return await provider.sendAndConfirm(tx, signers, { commitment: "confirmed", skipPreflight: false, maxRetries: 10 });
      } catch (e: any) {
        if (i >= 5 || !/Blockhash not found|timed out|429|Too Many Requests|invalid index|block height exceeded/i.test(String(e?.message ?? e))) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  const rpc = (m: any) => m.rpc(provider.opts) as Promise<string>;
  const errText = (e: any) => String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);

  console.log(`demo (${NET}): ${t0.toISOString()} rpc=${RPC_URL.replace(/api-key=.*/, "api-key=…")} dev=${dev.publicKey.toBase58()}`);
  const devSolStart = await conn.getBalance(dev.publicKey, "confirmed");

  // ---- 0. hazırlık: platform yetkilisi + lookup table ----
  step("Hazırlık", "Platform yetkilisi ve platform ücret cüzdanı belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye)");
  sig("set_platform", await rpc(program.methods.setPlatform(dev.publicKey, platformWallet.publicKey).accountsPartial({
    authority: dev.publicKey, config: configPda, program: program.programId, programData,
    systemProgram: SystemProgram.programId,
  })));
  await send([SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: platformWallet.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL })]);
  {
    const cfg: any = await program.account.config.fetch(configPda, "confirmed");
    note(`platform ücreti: creator ücretinin %${cfg.platformFeeBps / 100}'u → ${short(platformWallet.publicKey)} (kilitli havuzdan asla pay alınmaz)`);
  }
  {
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const sfs = setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, platformWallet.publicKey);
    const keys = [...Object.values(pa) as PublicKey[], ...Object.values(paS) as PublicKey[], ...Object.values(pb) as PublicKey[],
      ...Object.values(sfs) as PublicKey[],
      escrow, escrowTa, mint, dev.publicKey, buyer, buyerTa, manualPda, manualAta, configPda, feeAuthority, sharingConfig,
      SystemProgram.programId, program.programId];
    const uniq = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
    sig("lookup_table", await send([createIx]));
    for (let i = 0; i < uniq.length; i += 18) {
      await send([AddressLookupTableProgram.extendLookupTable({
        payer: dev.publicKey, authority: dev.publicKey, lookupTable: lut, addresses: uniq.slice(i, i + 18),
      })]);
    }
    for (let i = 0; i < 60; i++) {
      const acc = (await conn.getAddressLookupTable(lut)).value;
      if (acc && acc.state.addresses.length >= uniq.length) break;
      await sleep(500);
    }
    await sleep(1500);
    note(`tablo ${lut.toBase58()} (${uniq.length} adres)`);
  }

  // localnet 550M: 12 alım (~1,5 SOL) curve'ü tamamlamasın (gerçek rezerv 243M kalır, alımlar ~218M alır);
  // devnet 300M: gerçek SOL harcanıyor, launch alımı 0,39 SOL'e iner (baseline alımlardan sonra alındığı için yeterli)
  const AMOUNT = (DEVNET ? 300_000_000n : 550_000_000n) * DEC;
  // ---- 1. launch ----
  step("Coin basıldı ve %30'u kilitlendi",
    `Tek işlemde: pump.fun'da coin yaratıldı, dev ${Number(AMOUNT / DEC) / 1e6}M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti`);
  {
    const ix = await program.methods
      .launch("Demo Coin", "DEMO", "https://example.com/demo.json", 3000,
              new BN(AMOUNT.toString()), new BN(2.5 * LAMPORTS_PER_SOL), [...Buffer.alloc(32)], 0, false)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda, escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta, feeAuthority,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();
    before({ "escrow coin": "0 coin", "dev coin": "0 coin" });
    sig("launch", await sendV0([ix], [mintKp]));
    const st = await escrowState();
    after({ "escrow coin": tok(st.escrowed.toString()), "dev coin": tok(await coinBal(dev.publicKey)) });
    note(`coin: ${mint.toBase58()}`);
    note(`escrow: ${escrow.toBase58()}`);
  }

  // ---- 2. ücret paylaşımı ----
  step("Ücret paylaşımı kuruldu: %90 havuz, %10 platform",
    "pump.fun'ın ücret paylaşım ayarı bu coin için açıldı: her alım-satımın creator ücreti otomatik olarak %90 escrow'a, %10 platform cüzdanına gider. Bu bölünme kilitli havuza dokunmaz; yalnızca ücret bölünür");
  {
    sig("setup_fee_sharing", await program.methods.setupFeeSharing()
      .accountsPartial(setupFeeSharingAccounts(mint, escrow, program.programId, dev.publicKey, platformWallet.publicKey))
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })])
      .rpc(provider.opts));
    const st = await escrowState();
    note(`coin tipi: ${st.isHolderReward ? "holder-rewards" : "regular"} — platform payı %${st.platformFeeBps / 100}, pump'taki paylaşım kaydı ${short(sharingConfig)}`);
  }

  // ---- 3. dört cüzdan alır ----
  step("On iki cüzdan piyasadan aldı",
    "Ayşe (büyük), Burak, Ceren, Deniz ve sekiz küçük yatırımcı doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti");
  // her pozisyon ≥ 0,1 SOL (≈$20 eşiği) olmalı; Ayşe büyük
  const BUYS = [0.15, 0.12, 0.12, 0.12, ...Array(8).fill(0.12)];
  {
    for (const w of wallets) {
      await send([
        SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: w.publicKey, lamports: FUND_SOL * LAMPORTS_PER_SOL }),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, coinAta(w.publicKey), w.publicKey, mint, TOKEN_2022),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, wsolAta(w.publicKey), w.publicKey, WSOL, TOKEN),
      ]);
    }
    const vaultBefore = await conn.getBalance(paS.creatorVault, "confirmed");
    before({ "creator ücreti kasası": sol(vaultBefore) });
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const s = await send([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        directBuyIx(mint, w.publicKey, sharingConfig, BigInt(Math.round(BUYS[i] * LAMPORTS_PER_SOL)), 1n),
      ], w);
      sig(`${NAMES[i]} ${BUYS[i]} SOL ile aldı → ${tok(await coinBal(w.publicKey))}`, s);
      await sleep(800); // tutma süreleri farklı olsun
    }
    after({ "creator ücreti kasası": sol(await conn.getBalance(paS.creatorVault, "confirmed")) });
  }

  // ---- 4. baseline (alımlardan sonra: demo hacim tetikleyicisini göstermek istiyor, kilometre taşını değil) ----
  step("Tetikleyici başlangıç noktası",
    "Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür (üretimde bu kaydı keeper her dakika yapar)");
  sig("set_delay_window", await rpc(program.methods.setDelayWindow(new BN(DELAY_WINDOW))
    .accountsPartial({ platform: dev.publicKey, escrow })));
  const triggerAccounts = { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES };
  sig("check_trigger", await rpc(program.methods.checkTrigger().accountsPartial(triggerAccounts)));
  {
    const st = await escrowState();
    note(`piyasa değeri: ${sol(st.lastMilestoneMcap.toNumber())} — dağıtım gecikme penceresi demo için ~${Math.round(DELAY_WINDOW * 0.4)} sn (üretimde 60 dk)`);
  }

  // ---- 4. Deniz hepsini satar ----
  step("Deniz hepsini sattı",
    "Deniz elindeki coin'in tamamını pump.fun'a geri sattı; elinde coin kalmadı, dağıtımda sayılmayacak");
  {
    const d = wallets[SELLER];
    const bal = await coinBal(d.publicKey);
    before({ "Deniz coin": tok(bal), "Deniz SOL": sol(await conn.getBalance(d.publicKey, "confirmed")) });
    const s = await send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      directSellIx(mint, d.publicKey, sharingConfig, bal, 0n),
    ], d);
    sig("sell", s);
    after({ "Deniz coin": tok(await coinBal(d.publicKey)), "Deniz SOL": sol(await conn.getBalance(d.publicKey, "confirmed")) });
  }

  // ---- 5. collect_fees ----
  step("Biriken ücret dağıtıldı: %90 havuza, %10 platforma",
    "pump.fun kasasında biriken creator ücreti paylaşım ayarına göre ödendi: %90 escrow'a (holder'lar için harcanacak), %10 platform cüzdanına");
  {
    const vault = paS.creatorVault;
    before({ "creator ücreti kasası": sol(await conn.getBalance(vault, "confirmed")),
             "escrow SOL": sol(await conn.getBalance(escrow, "confirmed")),
             "platform cüzdanı": sol(await conn.getBalance(platformWallet.publicKey, "confirmed")) });
    const e0 = await conn.getBalance(escrow, "confirmed"), p0 = await conn.getBalance(platformWallet.publicKey, "confirmed");
    sig("collect_fees", await program.methods.collectFees()
      .accountsPartial(collectFeesAccounts(mint, escrow, program.programId, dev.publicKey))
      .remainingAccounts(shareholderMetas(feeAuthority, platformWallet.publicKey, 1000))
      .rpc(provider.opts));
    const e1 = await conn.getBalance(escrow, "confirmed"), p1 = await conn.getBalance(platformWallet.publicKey, "confirmed");
    after({ "creator ücreti kasası": sol(await conn.getBalance(vault, "confirmed")), "escrow SOL": sol(e1), "platform cüzdanı": sol(p1) });
    const st = await escrowState();
    note(`escrow +${sol(e1 - e0)} (%${e1 - e0 > 0 ? Math.round(100 * (e1 - e0) / (e1 - e0 + p1 - p0)) : 0}), platform +${sol(p1 - p0)}; programın kaydettiği toplam ücret: ${sol(st.feesCollected.toNumber())}`);
  }

  // ---- 6. bağış + buyback parçalı ----
  step("Topluluk bağışı ve parça parça geri alım",
    "Escrow'a 0.2 SOL eklendi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi");
  {
    note("Demo'da 12 küçük alım yeterli ücret üretmediği için musluğu göstermek üzere escrow'a 0.2 SOL eklendi; üretimde tek kaynak creator ücretidir.");
    sig("0.2 SOL eklendi", await send([SystemProgram.transfer({
      fromPubkey: dev.publicKey, toPubkey: escrow, lamports: 0.2 * LAMPORTS_PER_SOL,
    })]));
    const st0 = await escrowState();
    before({ "escrow SOL": sol(await conn.getBalance(escrow, "confirmed")), "havuz coin": tok(poolOf(st0)) });
    const buybackAccounts = {
      payer: dev.publicKey, escrow, buyer, mint, buyerTokenAccount: buyerTa, escrowTokenAccount: escrowTa,
      global: pb.global, quoteMint: WSOL, quoteTokenProgram: TOKEN,
      feeRecipient: pb.feeRecipient, associatedQuoteFeeRecipient: pb.associatedQuoteFeeRecipient,
      buybackFeeRecipient: pb.buybackFeeRecipient, associatedQuoteBuybackFeeRecipient: pb.associatedQuoteBuybackFeeRecipient,
      bondingCurve: pb.bondingCurve, associatedBaseBondingCurve: pb.associatedBaseBondingCurve,
      associatedQuoteBondingCurve: pb.associatedQuoteBondingCurve, associatedQuoteUser: pb.associatedQuoteUser,
      creatorVault: pb.creatorVault, associatedCreatorVault: pb.associatedCreatorVault,
      sharingConfig: pb.sharingConfig, globalVolumeAccumulator: pb.globalVolumeAccumulator,
      userVolumeAccumulator: pb.userVolumeAccumulator, associatedUserVolumeAccumulator: pb.associatedUserVolumeAccumulator,
      feeConfig: pb.feeConfig, feeProgram: pb.feeProgram, eventAuthority: pb.eventAuthority, pumpProgram: pb.pumpProgram,
      baseTokenProgram: TOKEN_2022, associatedTokenProgram: pb.associatedTokenProgram, systemProgram: SystemProgram.programId,
    };
    // Slot başına tek harcama: program aynı slotta ikinci buyback'i BuybackSameSlot
    // ile reddeder. Bir sonraki parçayı göndermeden önce zincirin son harcamanın
    // slotunu geçmesini bekliyoruz; yine de yakalanırsa (RPC'nin "confirmed"
    // okuması geride kalabiliyor) bir slot bekleyip yeniden deniyoruz.
    let lastSpendSlot = 0;
    const pastSlot = async (slot: number) => {
      while ((await conn.getSlot("processed")) <= slot) await sleep(300);
    };
    const buybackChunk = async () => {
      const st = await escrowState();
      lastSpendSlot = Math.max(lastSpendSlot, Number(st.lastBuybackSlot));
      await pastSlot(lastSpendSlot);
      const ix = await program.methods.buyback().accountsPartial(buybackAccounts).instruction();
      for (let attempt = 0; ; attempt++) {
        try {
          const s = await sendV0([ix]);
          const tx = await conn.getTransaction(s, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
          lastSpendSlot = Math.max(lastSpendSlot, tx?.slot ?? 0);
          return { s, ev: decodeBuybackDone(tx?.meta?.logMessages ?? []), slot: tx?.slot };
        } catch (e: any) {
          if (!/BuybackSameSlot|0x1772/.test(errText(e)) || attempt >= 5) throw e;
          const now = await conn.getSlot("processed");
          note(`aynı anda (blok ${now}) ikinci alım reddedildi (BuybackSameSlot) — bu bir kural: blok başına tek harcama; sonraki blok bekleniyor`);
          await pastSlot(now);
        }
      }
    };
    let chunks = 0;
    for (let i = 0; i < 5; i++) {
      const { s, ev, slot } = await buybackChunk();
      if (!ev || ev.spent === 0n) { note(`eşiğin altında kaldı, buyback durdu (${i} parçadan sonra)`); break; }
      chunks++;
      sig(`parça ${chunks}: ${sol(ev.spent)} harcandı → +${tok(ev.bought)}, sonraya ${sol(ev.left)}`, s);
      if (ev.left < 10_000_000n) break;
    }
    // Kuralı bilerek göster: tek işleme iki buyback koy (ikisi de aynı slota
    // düşer). İlki harcar, ikincisi BuybackSameSlot yer, işlem bütünüyle düşer.
    {
      await pastSlot(lastSpendSlot);
      const ix = await program.methods.buyback().accountsPartial(buybackAccounts).instruction();
      const solNow = await conn.getBalance(escrow, "confirmed");
      try {
        await sendV0([ix, ix]);
        note("UYARI: aynı slotta iki alım kabul edildi (beklenmiyordu)");
      } catch (e: any) {
        if (!/BuybackSameSlot|0x1772/.test(errText(e))) throw e;
        note(`aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz (~0,4 sn'de bir), escrow SOL değişmedi (${sol(await conn.getBalance(escrow, "confirmed"))} = ${sol(solNow)})`);
      }
    }
    note("her parça ayrı blokta (~0,4 sn): %0,5 sınırı üst üste bindirilemez, musluk blok başına bir kez akar");
    const st1 = await escrowState();
    after({ "escrow SOL": sol(await conn.getBalance(escrow, "confirmed")), "havuz coin": tok(poolOf(st1)) });
    note(`${chunks} parça, toplam ${sol(st1.buybackSpent.toNumber())} harcandı, ${tok(st1.buybackTokens.toString())} alındı`);
  }

  // ---- 7. hacim tetikler ----
  step("Hacim tetikleyiciyi kurdu",
    "Alım-satım hacmi eşiği geçti: program havuzun %1'ini dağıtmaya karar verdi ve rastgele bir gecikme belirledi (kimse dağıtım anını önceden bilemez)");
  let fireSlot = 0;
  {
    sig("check_trigger", await rpc(program.methods.checkTrigger().accountsPartial(triggerAccounts)));
    const st = await escrowState();
    if (!st.armed) throw new Error("hacim tetikleyicisi kurulmadı — alımlar yetmedi mi?");
    fireSlot = st.fireSlot.toNumber();
    const now = await conn.getSlot("confirmed");
    note(`tür: ${st.armedKind === 1 ? "hacim" : "kilometre taşı"}, serbest bırakılacak: ${tok(st.authorized.toString())} (havuzun %1'i)`);
    note(`dağıtım ~${Math.max(0, Math.round((fireSlot - now) * 0.4))} sn sonra serbest kalacak (rastgele gecikme; üretimde 0–60 dk)`);
    if (now < fireSlot) {
      try {
        await rpc(program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve }));
        note("UYARI: erken ateşleme kabul edildi (beklenmiyordu)");
      } catch (e: any) {
        note(/TooEarly/.test(errText(e)) ? "erken ateşleme denendi → reddedildi (TooEarly): süre dolmadan kimse dağıtamaz" : `erken ateşleme reddedildi: ${errText(e).slice(0, 80)}`);
      }
    }
  }

  // ---- 8. fire ----
  step("Süre doldu, dağıtım serbest bırakıldı",
    "Gecikme geçince herkesin çağırabildiği fire_trigger havuzun %1'ini dağıtıma açtı");
  {
    while ((await conn.getSlot("confirmed")) < fireSlot) await sleep(400);
    const st0 = await escrowState();
    before({ "dağıtıma açık coin": tok(st0.pending.toString()) });
    sig("fire_trigger", await rpc(program.methods.fireTrigger().accountsPartial({ escrow, bondingCurve: pa.bondingCurve })));
    const st = await escrowState();
    after({ "dağıtıma açık coin": tok(st.pending.toString()) });
  }

  // ---- 9. snapshot + paylaşım ----
  step("Holder listesi ve paylar hesaplandı",
    "Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Serbest bırakılan miktar ağırlık (bakiye × tutma süresi) oranında TÜM uygun holder'lara bölündü; tek cüzdan turun en fazla %10'unu alır, fazlası diğerlerine oransal dağıtıldı");
  const stFired = await escrowState();
  const released = BigInt(stFired.pending.toString());
  const snapSlot = await conn.getSlot("confirmed");
  // Indexer hangi zincirde koşuyorsak onu okur. ~/.airdrop-launchpad.env'deki
  // HELIUS_RPC_URL devnet'e bakar; localnet demosunda onu kullanmak "bonding
  // curve not found" demek. Bu yüzden HELIUS_RPC_URL burada bilerek yok sayılır.
  const snap = await snapshot(RPC_URL, mint.toBase58(), snapSlot, program.programId, [], released);
  const cap = released * 1000n / 10000n;
  {
    const sorted = [...snap.leaves].sort((x: any, y: any) => (BigInt(y.weight) > BigInt(x.weight) ? 1 : -1));
    for (const l of sorted) {
      const wPct = (Number(BigInt(l.weight) * 10000n / BigInt(snap.totalWeight)) / 100).toFixed(1);
      const sPct = (Number(BigInt(l.amount) * 10000n / released) / 100).toFixed(1);
      const capped = BigInt(l.amount) === cap ? " ← tavan" : "";
      note(`${nameOf(l.holder)}: ${tok(l.balance)}, ${Math.round(l.heldSlots * 0.4)} sn tutuyor, ağırlık %${wPct} → pay ${tok(l.amount)} (%${sPct})${capped}`);
    }
    const seller = wallets[SELLER].publicKey.toBase58();
    note(snap.leaves.some((l: any) => l.holder === seller)
      ? "UYARI: Deniz listede (beklenmiyordu)"
      : `Deniz (${short(seller)}) listede YOK — hepsini sattığı için`);
    note(`serbest ${tok(released)}, dağıtılan ${tok(snap.total)}; tavanın tuttuğu ${tok(released - BigInt(snap.total))} havuzda kalıyor (sızmaz, sonraki tetikleyiciyle yeniden değerlendirilir)`);
    note(`dev cüzdanı hazine sayılır, listede yok. kök: ${snap.root.slice(0, 16)}… slot ${snap.snapshotSlot}`);
    fs.writeFileSync(path.join(__dirname, "../snapshot.json"), JSON.stringify(snap, null, 2));
  }

  // ---- 10. open_round ----
  step("Paylaşım zincire mühürlendi",
    "Listenin kökü, serbest bırakılan miktar ve snapshot anı zincire yazıldı: kim ne alacak artık sabit ve herkes aynı girdilerle aynı sonucu üretebilir. Rastgelelik yok, seçim yok");
  const round = PublicKey.findProgramAddressSync(
    [Buffer.from("round"), escrow.toBuffer(), Buffer.from(new Uint32Array([0]).buffer)], program.programId)[0];
  let r: any;
  {
    sig("open_round", await rpc(program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(released.toString()), new BN(snap.total),
                 snap.leaves.length, new BN(snap.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })));
    r = await program.account.round.fetch(round, "confirmed");
    const again = await snapshot(RPC_URL, mint.toBase58(), r.snapshotSlot.toNumber(), program.programId, [], BigInt(r.released.toString()));
    note(again.root === Buffer.from(r.root).toString("hex")
      ? "zincirdeki (slot, miktar) ile yeniden üretildi: kök birebir tuttu"
      : "UYARI: yeniden üretim kökü tutmadı");
    note(`${r.holderCount} holder, ${tok(r.total.toString())} dağıtımda, tavan cüzdan başına ${tok(cap)}`);
  }

  const claimAccounts = (h: PublicKey) => ({
    holder: h, escrow, round, mint, escrowTokenAccount: escrowTa, holderTokenAccount: coinAta(h),
    receipt: PublicKey.findProgramAddressSync([Buffer.from("receipt"), round.toBuffer(), h.toBuffer()], program.programId)[0],
    bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022, systemProgram: SystemProgram.programId,
  });
  const { layers } = buildTree(snap.leaves);

  // ---- 11. Deniz sahte claim ----
  step("Satan cüzdan pay alamadı",
    "Deniz, Ayşe'nin listedeki satırını kendi cüzdanıyla kullanıp pay almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti");
  {
    const victim = snap.leaves.find((l: any) => l.holder === wallets[0].publicKey.toBase58())!;
    const d = wallets[SELLER];
    try {
      await rpc(program.methods
        .claimShare(victim.index, new BN(victim.balance), new BN(victim.amount), proofFor(layers, victim.index).map((x) => [...x]))
        .accountsPartial(claimAccounts(d.publicKey)).signers([d]));
      note("UYARI: sahte claim kabul edildi (beklenmiyordu)");
    } catch (e: any) {
      const m = errText(e).match(/Error Code: (\w+)/);
      note(`reddedildi${m ? ` (${m[1]})` : ""}: Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı`);
    }
  }

  // ---- 12. herkes payını alır ----
  step("Herkes kendi payını aldı",
    "Listedeki her holder kendi cüzdanıyla claim etti, payı havuzdan cüzdanına geçti; aynı cüzdan ikinci kez alamaz");
  {
    const b: Record<string, string> = {};
    for (const w of wallets.slice(0, 3)) b[`${nameOf(w.publicKey.toBase58())} coin`] = tok(await coinBal(w.publicKey));
    b["havuz coin"] = tok(poolOf(await escrowState()));
    before(b);
    // DEMO_LEAVE_LAST=1: son holder'ın payını claim etme, web'deki claim butonu için bırak
    const leaveLast = process.env.DEMO_LEAVE_LAST === "1";
    const order = [...snap.leaves].sort((x: any, y: any) => (BigInt(y.amount) > BigInt(x.amount) ? 1 : -1));
    for (const [i, leaf] of order.entries()) {
      const w = wallets.find((x) => x.publicKey.toBase58() === leaf.holder)!;
      if (leaveLast && i === order.length - 1) {
        note(`${nameOf(leaf.holder)} payı ${tok(leaf.amount)}, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)`);
        continue;
      }
      const s = await rpc(program.methods
        .claimShare(leaf.index, new BN(leaf.balance), new BN(leaf.amount), proofFor(layers, leaf.index).map((x) => [...x]))
        .accountsPartial(claimAccounts(w.publicKey)).signers([w]));
      sig(`${nameOf(leaf.holder)} +${tok(leaf.amount)}`, s);
    }
    // ikinci claim
    const first = order[0]; const w0 = wallets.find((x) => x.publicKey.toBase58() === first.holder)!;
    try {
      await rpc(program.methods
        .claimShare(first.index, new BN(first.balance), new BN(first.amount), proofFor(layers, first.index).map((x) => [...x]))
        .accountsPartial(claimAccounts(w0.publicKey)).signers([w0]));
      note("UYARI: ikinci claim kabul edildi (beklenmiyordu)");
    } catch {
      note(`${nameOf(first.holder)} ikinci kez denedi → reddedildi (makbuz zaten var)`);
    }
    const a: Record<string, string> = {};
    for (const w of wallets.slice(0, 3)) a[`${nameOf(w.publicKey.toBase58())} coin`] = tok(await coinBal(w.publicKey));
    a["havuz coin"] = tok(poolOf(await escrowState()));
    after(a);
    const rr = await program.account.round.fetch(round, "confirmed");
    note(`${rr.claimedCount}/${rr.holderCount} holder aldı, ${tok(rr.claimedAmount.toString())} / ${tok(rr.total.toString())}`);
    // cüzdanlar (gizli anahtarlarıyla) — Phantom'a aktarıp web'den claim denemek için; gitignore'da
    fs.writeFileSync(path.join(__dirname, "../demo-wallets.json"), JSON.stringify(
      Object.fromEntries(wallets.map((w, i) => [NAMES[i], { pubkey: w.publicKey.toBase58(), secretKey: [...w.secretKey] }])), null, 2));
  }

  // ---- devnet: throwaway wallets give their leftover SOL back (real SOL) ----
  if (DEVNET) {
    let swept = 0;
    for (const w of wallets) {
      const bal = await conn.getBalance(w.publicKey, "confirmed");
      const keep = 5_000 + 890_880; // fee + rent floor so the wallet (and its ATAs' owner) stays valid
      if (bal <= keep) continue;
      try {
        await send([SystemProgram.transfer({ fromPubkey: w.publicKey, toPubkey: dev.publicKey, lamports: bal - keep })], w);
        swept += bal - keep;
      } catch (e: any) { console.log(`    sweep ${short(w.publicKey)} atlandı: ${String(e?.message ?? e).slice(0, 60)}`); }
    }
    console.log(`\n  devnet: ${sol(swept)} demo cüzdanlarından geri alındı`);
  }

  // ---- özet ----
  const st = await escrowState();
  const devSolEnd = await conn.getBalance(dev.publicKey, "confirmed");
  const summary = {
    mint: mint.toBase58(), escrow: escrow.toBase58(), round: round.toBase58(),
    wallets: Object.fromEntries(wallets.map((w, i) => [NAMES[i], w.publicKey.toBase58()])),
    escrowed: tok(st.escrowed.toString()), allocated: tok(st.allocated.toString()), pool: tok(poolOf(st)),
    buybackSpent: sol(st.buybackSpent.toNumber()), buybackTokens: tok(st.buybackTokens.toString()),
    feesCollected: sol(st.feesCollected.toNumber()),
    devSolSpent: sol(devSolStart - devSolEnd),
    durationSec: Math.round((Date.now() - t0.getTime()) / 1000),
  };
  console.log("\n=== özet ===\n" + JSON.stringify(summary, null, 2));

  // ---- DEMO.md ----
  const md: string[] = [];
  md.push(`# Demo — uçtan uca bir dağıtım`, "",
    (DEVNET
      ? `Bu belge, ${t0.toISOString().slice(0, 10)} tarihinde **Solana devnet'te, gerçek pump.fun devnet programıyla** tek koşuda üretildi: \`npm run demo -- --devnet\`. Her adımın işlem imzası en alttaki ekte, explorer linkleriyle; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.`
      : `Bu belge, ${t0.toISOString().slice(0, 10)} tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: \`npm run demo\`. Her adımın zincir üstü işlem imzası en alttaki ekte; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.`), "",
    `**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutan herkese bakiye × tutma süresi oranında bölünür — tek cüzdan bir turun en fazla %10'unu alır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, herkes payını kendi cüzdanıyla alır.`, "",
    `## Aktörler`, "",
    `| Kim | Cüzdan | Rol |`, `|---|---|---|`,
    `| Dev | \`${dev.publicKey.toBase58()}\` | coin'i basan; hazine sayılır, dağıtıma girmez |`,
    ...wallets.map((w, i) => `| ${NAMES[i]} | \`${w.publicKey.toBase58()}\` | ${i === SELLER ? "alır, sonra hepsini satar" : i === 0 ? "büyük alır ve tutar (tavana takılır)" : "alır ve tutar"} |`),
    `| Escrow | \`${escrow.toBase58()}\` | kilitli havuz (program hesabı, insan anahtarı yok) |`, "",
    `Coin: \`${mint.toBase58()}\` (DEMO)` + (DEVNET ? ` — [explorer](https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet) · [pump.fun](https://pump.fun/coin/${mint.toBase58()})` : ""), "",
    `## Adımlar`, "");
  for (const s of steps) {
    md.push(`### ${s.n}. ${s.title}`, "", s.what + ".", "");
    if (s.before || s.after) {
      const keys = [...new Set([...Object.keys(s.before ?? {}), ...Object.keys(s.after ?? {})])];
      md.push(`| | Öncesi | Sonrası |`, `|---|---|---|`);
      for (const k of keys) md.push(`| ${k} | ${s.before?.[k] ?? "-"} | ${s.after?.[k] ?? "-"} |`);
      md.push("");
    }
    for (const n of s.notes) md.push(`- ${n}`);
    // işlemler ana metinde tek satır; imzalar ekte
    if (s.sigs.length) md.push(`- ${s.sigs.length} işlem: ${s.sigs.map((x) => x.label).join("; ")} (imzalar: ek, adım ${s.n})`);
    md.push("");
  }
  md.push(`## Sonuç`, "",
    `| | |`, `|---|---|`,
    `| Havuza kilitlenen | ${summary.escrowed} |`,
    `| Ücretlerden toplanan | ${summary.feesCollected} |`,
    `| Geri alıma harcanan | ${summary.buybackSpent} → ${summary.buybackTokens} havuza eklendi |`,
    `| Bu turda dağıtılan | ${summary.allocated} |`,
    `| Havuzda kalan | ${summary.pool} |`,
    `| Süre | ${summary.durationSec} sn |`, "",
    `Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk); pay = bakiye × tutma süresi oranı, tek cüzdan turun en fazla %10'u, fazlası diğerlerine; liste ve miktar zincire yazılır, herkes aynı sonucu yeniden üretebilir; pay yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir; geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı blokta iki kez çalışmaz.`, "",
    `## Web'de görmek`, "",
    `\`cd web && npm run dev:local\` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/${mint.toBase58()} (bu coin: holder payı, tavan, havuz, turlar, "Your share" paneli).`,
    (process.env.DEMO_LEAVE_LAST === "1"
      ? `Bir holder'ın payı bilerek claim edilmedi: cüzdanın anahtarı \`demo-wallets.json\` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel payı bulur, "claim" butonu zincire gönderir.`
      : `Bir payı web'den claim etmek için demoyu \`DEMO_LEAVE_LAST=1 npm run demo\` ile koş; cüzdanın anahtarı \`demo-wallets.json\` içine yazılır, Phantom'a aktarıp butona basarsın.`), "",
    `## Ek: işlem imzaları`, "",
    DEVNET ? `Doğrulamak için: \`solana confirm -v <imza> --url devnet\` ya da explorer linkleri.` : `Doğrulamak için: \`solana confirm -v <imza> --url http://127.0.0.1:8899\` (localnet açıkken).`, "");
  for (const s of steps) {
    if (!s.sigs.length) continue;
    md.push(`**Adım ${s.n} — ${s.title}**`, "");
    for (const x of s.sigs) md.push(DEVNET ? `- ${x.label}: [\`${x.sig.slice(0, 20)}…\`](${explorer(x.sig)})` : `- ${x.label}: \`${x.sig}\``);
    md.push("");
  }
  fs.writeFileSync(path.join(__dirname, "../" + OUT_MD), md.join("\n"));
  fs.writeFileSync(path.join(__dirname, "../demo-summary.json"), JSON.stringify({ net: NET, ...summary, steps }, null, 2));
  console.log(`\n${OUT_MD} yazıldı`);
}

main().catch((e) => { console.error("demo hata:", e?.message ?? e, e?.logs ?? ""); process.exit(1); });
