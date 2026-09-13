/**
 * Uçtan uca demo, tek koşu. Localnet'te (scripts/localnet.sh ayakta olmalı):
 *
 *   coin bas + escrow'a kilitle → 4 cüzdan alır, biri hepsini satar →
 *   creator ücreti birikir → escrow süpürür → buyback parça parça →
 *   hacim tetikler → rastgele gecikme → dağıtım serbest →
 *   snapshot → kök zincire → çekiliş → kazananlar claim eder →
 *   tam satan cüzdan snapshot'ta yok, sahte claim reddedilir.
 *
 * Her adımda tx imzası ve tek satır Türkçe açıklama basar, sonunda DEMO.md yazar.
 *
 *   HELIUS_RPC_URL=http://127.0.0.1:8899 ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
 *     npm run demo
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
import { createHash } from "crypto";
import {
  pumpAccounts, escrowPda, escrowAta, buyerPda, baseAtaOf, directBuyIx, directSellIx,
  TOKEN_2022, TOKEN, WSOL,
} from "../tests/pump";
import { snapshot, buildTree, proofFor } from "../indexer/snapshot";

const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
const SLOT_HASHES = new PublicKey("SysvarS1otHashes111111111111111111111111111");
const DELAY_WINDOW = 150;        // ~1 dk: demo bekleyebilsin, ama gecikme görünsün
const WINNERS = 3;
const DEC = 1_000_000n;          // coin 6 ondalık

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (k: PublicKey | string) => { const s = typeof k === "string" ? k : k.toBase58(); return `${s.slice(0, 4)}…${s.slice(-4)}`; };
const sol = (lamports: number | bigint) => `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
const tok = (raw: bigint | string | number) => {
  const n = Number(BigInt(raw.toString())) / 1e6;
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M coin` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K coin` : `${n.toFixed(0)} coin`;
};
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const leBytesToBigInt = (b: Buffer) => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; };

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
    commitment: "confirmed", preflightCommitment: "confirmed",
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
  const pa = pumpAccounts(mint, dev.publicKey, escrow);
  const pb = pumpAccounts(mint, buyer, escrow);
  const manualPda = PublicKey.findProgramAddressSync([Buffer.from("manual"), mint.toBuffer()], program.programId)[0];
  const manualAta = getAssociatedTokenAddressSync(mint, manualPda, true, TOKEN_2022);
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"))[0];
  const coinAta = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
  const wsolAta = (owner: PublicKey) => getAssociatedTokenAddressSync(WSOL, owner, true, TOKEN);

  const NAMES = ["Ayşe", "Burak", "Ceren", "Deniz"];
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
        if (i >= 4 || !/Blockhash not found|timed out/i.test(String(e?.message ?? e))) throw e;
        await sleep(1000);
      }
    }
  }
  /** v0 tx (lookup table ile) */
  let lut: PublicKey;
  async function sendV0(ixs: TransactionInstruction[], signers: Keypair[] = []) {
    const lutAcc = (await conn.getAddressLookupTable(lut)).value!;
    const bh = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: dev.publicKey, recentBlockhash: bh.blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs],
    }).compileToV0Message([lutAcc]);
    const tx = new VersionedTransaction(msg);
    return provider.sendAndConfirm(tx, signers, { commitment: "confirmed", skipPreflight: false, maxRetries: 10 });
  }
  const rpc = (m: any) => m.rpc({ commitment: "confirmed" }) as Promise<string>;
  const errText = (e: any) => String(e?.message ?? e) + JSON.stringify(e?.logs ?? []);

  console.log(`demo: ${t0.toISOString()} rpc=${RPC_URL} dev=${dev.publicKey.toBase58()}`);
  const devSolStart = await conn.getBalance(dev.publicKey, "confirmed");

  // ---- 0. hazırlık: platform yetkilisi + lookup table ----
  step("Hazırlık", "Platform yetkilisi belirlendi, adres tablosu kuruldu (büyük işlemler sığsın diye)");
  sig("set_platform", await rpc(program.methods.setPlatform(dev.publicKey).accountsPartial({
    authority: dev.publicKey, config: configPda, program: program.programId, programData,
    systemProgram: SystemProgram.programId,
  })));
  {
    const slot = await conn.getSlot("finalized");
    const [createIx, addr] = AddressLookupTableProgram.createLookupTable({
      authority: dev.publicKey, payer: dev.publicKey, recentSlot: slot,
    });
    lut = addr;
    const keys = [...Object.values(pa) as PublicKey[], ...Object.values(pb) as PublicKey[],
      escrow, escrowTa, mint, dev.publicKey, buyer, buyerTa, manualPda, manualAta, configPda,
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

  // ---- 1. launch ----
  step("Coin basıldı ve %30'u kilitlendi",
    "Tek işlemde: pump.fun'da coin yaratıldı, dev 400M coin aldı, bunun %30'u escrow'a (kilitli havuza) gitti");
  const AMOUNT = 400_000_000n * DEC;
  {
    const ix = await program.methods
      .launch("Demo Coin", "DEMO", "https://example.com/demo.json", 3000,
              new BN(AMOUNT.toString()), new BN(1.5 * LAMPORTS_PER_SOL), [...Buffer.alloc(32)], 0)
      .accountsPartial({
        dev: dev.publicKey, mint, escrow, config: configPda, escrowTokenAccount: escrowTa,
        manualAuthority: manualPda, manualTokenAccount: manualAta,
        ...pa, systemProgram: SystemProgram.programId,
      }).instruction();
    before({ "escrow coin": "0 coin", "dev coin": "0 coin" });
    sig("launch", await sendV0([ix], [mintKp]));
    const st = await escrowState();
    after({ "escrow coin": tok(st.escrowed.toString()), "dev coin": tok(await coinBal(dev.publicKey)) });
    note(`coin: ${mint.toBase58()}`);
    note(`escrow: ${escrow.toBase58()}`);
  }

  // ---- 2. baseline ----
  step("Tetikleyici başlangıç noktası",
    "Program piyasa değerini ilk kez kaydetti; bundan sonraki hacim ve fiyat hareketleri bu noktaya göre ölçülür");
  sig("set_delay_window", await rpc(program.methods.setDelayWindow(new BN(DELAY_WINDOW))
    .accountsPartial({ platform: dev.publicKey, escrow })));
  const triggerAccounts = { escrow, bondingCurve: pa.bondingCurve, slotHashes: SLOT_HASHES };
  sig("check_trigger", await rpc(program.methods.checkTrigger().accountsPartial(triggerAccounts)));
  {
    const st = await escrowState();
    note(`piyasa değeri: ${sol(st.lastMilestoneMcap.toNumber())} — dağıtım gecikme penceresi demo için ${DELAY_WINDOW} slot (~1 dk; üretimde 60 dk)`);
  }

  // ---- 3. dört cüzdan alır ----
  step("Dört cüzdan piyasadan aldı",
    "Ayşe, Burak, Ceren ve Deniz doğrudan pump.fun'dan coin aldı; her alımın küçük bir kısmı creator ücreti olarak birikti");
  const BUYS = [0.12, 0.10, 0.08, 0.06];
  {
    for (const w of wallets) {
      await send([
        SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: w.publicKey, lamports: 0.6 * LAMPORTS_PER_SOL }),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, coinAta(w.publicKey), w.publicKey, mint, TOKEN_2022),
        createAssociatedTokenAccountIdempotentInstruction(dev.publicKey, wsolAta(w.publicKey), w.publicKey, WSOL, TOKEN),
      ]);
    }
    const vaultBefore = await conn.getBalance(pa.creatorVault, "confirmed");
    before({ "creator ücreti kasası": sol(vaultBefore) });
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const s = await send([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        directBuyIx(mint, w.publicKey, escrow, BigInt(Math.round(BUYS[i] * LAMPORTS_PER_SOL)), 1n),
      ], w);
      sig(`${NAMES[i]} ${BUYS[i]} SOL ile aldı → ${tok(await coinBal(w.publicKey))}`, s);
      await sleep(1500); // tutma süreleri farklı olsun
    }
    after({ "creator ücreti kasası": sol(await conn.getBalance(pa.creatorVault, "confirmed")) });
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
      directSellIx(mint, d.publicKey, escrow, bal, 0n),
    ], d);
    sig("sell", s);
    after({ "Deniz coin": tok(await coinBal(d.publicKey)), "Deniz SOL": sol(await conn.getBalance(d.publicKey, "confirmed")) });
  }

  // ---- 5. collect_fees ----
  step("Biriken ücret havuza süpürüldü",
    "Alım-satımlardan biriken creator ücreti pump.fun kasasından escrow'a çekildi; bu para holder'lar için harcanacak");
  {
    before({ "escrow SOL": sol(await conn.getBalance(escrow, "confirmed")), "creator ücreti kasası": sol(await conn.getBalance(pa.creatorVault, "confirmed")) });
    sig("collect_fees", await rpc(program.methods.collectFees().accountsPartial({
      payer: dev.publicKey, escrow,
      creatorTokenAccount: wsolAta(escrow), creatorVault: pa.creatorVault,
      creatorVaultTokenAccount: wsolAta(pa.creatorVault),
      quoteMint: WSOL, quoteTokenProgram: TOKEN, associatedTokenProgram: pa.associatedTokenProgram,
      eventAuthority: pa.eventAuthority, pumpProgram: pa.pumpProgram, systemProgram: SystemProgram.programId,
    })));
    after({ "escrow SOL": sol(await conn.getBalance(escrow, "confirmed")), "creator ücreti kasası": sol(await conn.getBalance(pa.creatorVault, "confirmed")) });
    const st = await escrowState();
    note(`programın kaydettiği toplam ücret: ${sol(st.feesCollected.toNumber())}`);
  }

  // ---- 6. bağış + buyback parçalı ----
  step("Topluluk bağışı ve parça parça geri alım",
    "Escrow'a 0.2 SOL bağış geldi. Buyback bunu tek seferde değil, her çağrıda piyasanın en fazla %0,5'i kadar harcayarak coin'e çevirdi (demo 5 parça gösterir, kalan sonraki çağrılara kalır); alınan coin havuza eklendi");
  {
    sig("bağış 0.2 SOL", await send([SystemProgram.transfer({
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
          note(`aynı slotta (${now}) ikinci alım reddedildi (BuybackSameSlot) — bu bir kural: slot başına tek harcama; sonraki slot bekleniyor`);
          await pastSlot(now);
        }
      }
    };
    let chunks = 0;
    for (let i = 0; i < 5; i++) {
      const { s, ev, slot } = await buybackChunk();
      if (!ev || ev.spent === 0n) { note(`eşiğin altında kaldı, buyback durdu (${i} parçadan sonra)`); break; }
      chunks++;
      sig(`parça ${chunks} (slot ${slot}): ${sol(ev.spent)} harcandı → +${tok(ev.bought)}, sonraya ${sol(ev.left)}`, s);
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
        note(`aynı slotta ikinci alım reddedildi (BuybackSameSlot), sonraki slot bekleniyor — tek işleme iki alım sığdırılamaz, escrow SOL değişmedi (${sol(await conn.getBalance(escrow, "confirmed"))} = ${sol(solNow)})`);
      }
    }
    note("her parça ayrı slotta: %0,5 sınırı üst üste bindirilemez, musluk slot başına bir kez akar");
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
    note(`ateşleme slotu ${fireSlot}, şu an ${now} → ~${Math.max(0, Math.round((fireSlot - now) * 0.4))} sn sonra`);
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

  // ---- 9. snapshot ----
  step("Holder listesi çıkarıldı",
    "Herkesin yeniden üretebileceği deterministik snapshot: kimin ne kadar coin'i var, ne zamandır tutuyor. Ağırlık = bakiye × tutma süresi");
  const snapSlot = await conn.getSlot("confirmed");
  const snap = await snapshot(process.env.HELIUS_RPC_URL ?? RPC_URL, mint.toBase58(), snapSlot, program.programId);
  {
    for (const l of snap.leaves) {
      const pct = (Number(BigInt(l.weight) * 10000n / BigInt(snap.totalWeight)) / 100).toFixed(1);
      note(`${nameOf(l.holder)}: ${tok(l.balance)}, ${l.heldSlots} slottur tutuyor → şans %${pct}`);
    }
    const seller = wallets[SELLER].publicKey.toBase58();
    note(snap.leaves.some((l: any) => l.holder === seller)
      ? "UYARI: Deniz listede (beklenmiyordu)"
      : `Deniz (${short(seller)}) listede YOK — hepsini sattığı için`);
    note(`dev cüzdanı hazine sayılır, listede yok. kök: ${snap.root.slice(0, 16)}… slot ${snap.snapshotSlot}`);
    fs.writeFileSync(path.join(__dirname, "../snapshot.json"), JSON.stringify(snap, null, 2));
  }

  // ---- 10. open_round + draw ----
  step("Kök zincire yazıldı, sonra çekiliş",
    `Liste önce zincire mühürlendi (kök), rastgelelik ancak ondan sonra üretildi: ${WINNERS} kazanan, eşit ödül. Sıra önemli — önce liste, sonra zar`);
  const round = PublicKey.findProgramAddressSync(
    [Buffer.from("round"), escrow.toBuffer(), Buffer.from(new Uint32Array([0]).buffer)], program.programId)[0];
  let r: any;
  {
    const st = await escrowState();
    const prize = new BN(st.pending.toString()).divn(WINNERS);
    sig("open_round", await rpc(program.methods
      .openRound(0, [...Buffer.from(snap.root, "hex")], new BN(snap.totalWeight), WINNERS, prize, new BN(snap.snapshotSlot))
      .accountsPartial({ publisher: dev.publicKey, escrow, round, systemProgram: SystemProgram.programId })));
    r = await program.account.round.fetch(round, "confirmed");
    note(`ödül: ${WINNERS} × ${tok(r.prize.toString())}; zar slotu ${r.drawSlot} (kök yazıldıktan 2 slot sonra)`);
    while ((await conn.getSlot("confirmed")) <= r.drawSlot.toNumber()) await sleep(400);
    sig("draw", await rpc(program.methods.draw().accountsPartial({ round, slotHashes: SLOT_HASHES })));
    r = await program.account.round.fetch(round, "confirmed");
    note(`rastgele tohum: ${Buffer.from(r.seed).toString("hex").slice(0, 16)}…`);
  }

  // ---- 11. Deniz sahte claim (kazananlardan önce: ret sebebi ispat olsun, 'zaten ödendi' değil) ----
  step("Satan cüzdan ödül alamadı",
    "Kazananlar almadan önce Deniz, 1. çekilişi kazanan satırı kendi cüzdanıyla kullanıp ödül almayı denedi; program ispatı imzalayan cüzdana göre kontrol ettiği için reddetti");
  {
    const { layers } = buildTree(snap.leaves);
    // 1. çekilişi gerçekten kazanan satır: bilet aralığı tutsun ki ret sebebi
    // "yanlış cüzdan" olsun, "bu satır bu çekilişi kazanmadı" değil
    const h0 = createHash("sha256").update(Buffer.concat([Buffer.from(r.seed), u16le(0)])).digest();
    const t0k = leBytesToBigInt(h0.subarray(0, 16)) % BigInt(snap.totalWeight);
    const victim = snap.leaves.find((l: any) => BigInt(l.cumStart) <= t0k && t0k < BigInt(l.cumStart) + BigInt(l.weight))!;
    const d = wallets[SELLER];
    note(`1. çekilişi ${nameOf(victim.holder)} kazandı; Deniz o satırla deniyor`);
    try {
      await rpc(program.methods
        .claimPrize(0, victim.index, new BN(victim.balance), new BN(victim.weight), new BN(victim.cumStart),
                    proofFor(layers, victim.index).map((x) => [...x]))
        .accountsPartial({
          holder: d.publicKey, escrow, round, mint, escrowTokenAccount: escrowTa,
          holderTokenAccount: coinAta(d.publicKey), bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
        }).signers([d]));
      note("UYARI: sahte claim kabul edildi (beklenmiyordu)");
    } catch (e: any) {
      const m = errText(e).match(/Error Code: (\w+)/);
      note(`reddedildi${m ? ` (${m[1]})` : ""}: Deniz listede yok, başkasının satırı kendi cüzdanıyla işe yaramadı`);
    }
  }

  // ---- 12. kazananlar claim ----
  step("Kazananlar ödülünü aldı",
    "Her çekiliş ağırlığa göre bir holder'a düştü; kazananlar kendi cüzdanlarıyla claim etti, ödül havuzdan cüzdanlarına geçti");
  {
    const seed = Buffer.from(r.seed);
    const total = BigInt(snap.totalWeight);
    const { layers } = buildTree(snap.leaves);
    const b: Record<string, string> = {};
    for (const w of wallets.slice(0, 3)) b[`${nameOf(w.publicKey.toBase58())} coin`] = tok(await coinBal(w.publicKey));
    b["havuz coin"] = tok(poolOf(await escrowState()));
    before(b);
    const won: string[] = [];
    // DEMO_LEAVE_LAST=1: son çekilişi claim etme, web'deki claim butonu için bırak
    const leaveLast = process.env.DEMO_LEAVE_LAST === "1";
    for (let k = 0; k < r.winnerCount; k++) {
      const h = createHash("sha256").update(Buffer.concat([seed, u16le(k)])).digest();
      const ticket = leBytesToBigInt(h.subarray(0, 16)) % total;
      const leaf = snap.leaves.find((l: any) => BigInt(l.cumStart) <= ticket && ticket < BigInt(l.cumStart) + BigInt(l.weight))!;
      const w = wallets.find((x) => x.publicKey.toBase58() === leaf.holder)!;
      if (leaveLast && k === r.winnerCount - 1) {
        note(`çekiliş ${k + 1} → ${nameOf(leaf.holder)} kazandı, claim edilmedi: web'de "claim" butonuyla alınacak (cüzdan demo-wallets.json'da)`);
        continue;
      }
      const s = await rpc(program.methods
        .claimPrize(k, leaf.index, new BN(leaf.balance), new BN(leaf.weight), new BN(leaf.cumStart),
                    proofFor(layers, leaf.index).map((x) => [...x]))
        .accountsPartial({
          holder: w.publicKey, escrow, round, mint, escrowTokenAccount: escrowTa,
          holderTokenAccount: coinAta(w.publicKey), bondingCurve: pa.bondingCurve, baseTokenProgram: TOKEN_2022,
        }).signers([w]));
      sig(`çekiliş ${k + 1} → ${nameOf(leaf.holder)} +${tok(r.prize.toString())}`, s);
      won.push(nameOf(leaf.holder));
    }
    const a: Record<string, string> = {};
    for (const w of wallets.slice(0, 3)) a[`${nameOf(w.publicKey.toBase58())} coin`] = tok(await coinBal(w.publicKey));
    a["havuz coin"] = tok(poolOf(await escrowState()));
    after(a);
    const rr = await program.account.round.fetch(round, "confirmed");
    note(`${rr.claimedCount}/${WINNERS} ödül ödendi`);
    // cüzdanlar (gizli anahtarlarıyla) — Phantom'a aktarıp web'den claim denemek için; gitignore'da
    fs.writeFileSync(path.join(__dirname, "../demo-wallets.json"), JSON.stringify(
      Object.fromEntries(wallets.map((w, i) => [NAMES[i], { pubkey: w.publicKey.toBase58(), secretKey: [...w.secretKey] }])), null, 2));
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
    `Bu belge, ${t0.toISOString().slice(0, 10)} tarihinde yerel test ağında (localnet, pump.fun programı devnet'ten kopyalanmış) tek koşuda üretildi: \`npm run demo\`. Her adımın zincir üstü işlem imzası var; aynı komut her koşuda yeni bir coin ile aynı akışı yeniden üretir.`, "",
    `**Fikir tek cümlede:** coin basılırken bir kısmı kilitli havuza gider; alım-satım ücretleri o havuzu coin'le büyütür; piyasa hareket ettikçe havuzdan bir dilim, coin'i tutanlar arasında ağırlıklı çekilişle dağıtılır. Havuza kimse dokunamaz, dağıtım anı önceden bilinemez, kazananlar kendi cüzdanıyla alır.`, "",
    `## Aktörler`, "",
    `| Kim | Cüzdan | Rol |`, `|---|---|---|`,
    `| Dev | \`${dev.publicKey.toBase58()}\` | coin'i basan; hazine sayılır, çekilişe girmez |`,
    ...wallets.map((w, i) => `| ${NAMES[i]} | \`${w.publicKey.toBase58()}\` | ${i === SELLER ? "alır, sonra hepsini satar" : "alır ve tutar"} |`),
    `| Escrow | \`${escrow.toBase58()}\` | kilitli havuz (program hesabı, insan anahtarı yok) |`, "",
    `Coin: \`${mint.toBase58()}\` (DEMO)`, "",
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
    if (s.notes.length) md.push("");
    if (s.sigs.length) {
      md.push(`İmzalar:`, "");
      for (const x of s.sigs) md.push(`- ${x.label}: \`${x.sig}\``);
      md.push("");
    }
  }
  md.push(`## Sonuç`, "",
    `| | |`, `|---|---|`,
    `| Havuza kilitlenen | ${summary.escrowed} |`,
    `| Ücretlerden toplanan | ${summary.feesCollected} |`,
    `| Geri alıma harcanan | ${summary.buybackSpent} → ${summary.buybackTokens} havuza eklendi |`,
    `| Dağıtılan | ${summary.allocated} |`,
    `| Havuzda kalan | ${summary.pool} |`,
    `| Süre | ${summary.durationSec} sn |`, "",
    `Kurallar özet: dağıtım anı rastgele gecikmeli (üretimde 0–60 dk), holder listesi zincire yazıldıktan sonra zar atılır, ödül yalnızca listedeki cüzdana ve hâlâ tutuyorsa ödenir, geri alım tek seferde piyasanın %0,5'inden fazlasını harcamaz ve aynı slotta iki kez çalışmaz.`, "",
    `Doğrulamak için: \`solana confirm -v <imza> --url http://127.0.0.1:8899\` (localnet açıkken).`, "",
    `## Web'de görmek`, "",
    `\`cd web && npm run dev:local\` → http://localhost:3000 (coin listesi), http://localhost:3000/coin/${mint.toBase58()} (bu coin: havuz, son dağıtım, sıradaki tetikleyici, "Your share" paneli).`,
    (process.env.DEMO_LEAVE_LAST === "1"
      ? `Son çekiliş bilerek claim edilmedi: kazanan cüzdanın anahtarı \`demo-wallets.json\` içinde; Phantom'a aktarıp (ağ: localhost:8899) coin sayfasında cüzdanı bağlayınca panel ödülü bulur, "claim" butonu zincire gönderir.`
      : `Bir çekilişi web'den claim etmek için demoyu \`DEMO_LEAVE_LAST=1 npm run demo\` ile koş; kazanan cüzdanın anahtarı \`demo-wallets.json\` içine yazılır, Phantom'a aktarıp butona basarsın.`), "");
  fs.writeFileSync(path.join(__dirname, "../DEMO.md"), md.join("\n"));
  fs.writeFileSync(path.join(__dirname, "../demo-summary.json"), JSON.stringify({ ...summary, steps }, null, 2));
  console.log("\nDEMO.md yazıldı");
}

main().catch((e) => { console.error("demo hata:", e?.message ?? e, e?.logs ?? ""); process.exit(1); });
