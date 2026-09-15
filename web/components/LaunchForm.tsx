"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Buffer } from "buffer";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  PumpParams, tokensForSol, solForTokens, parseManualList, manualRoot, launchInstruction, launchAddresses,
  publishManualInstruction, lookupTableInstructions, waitForTable, buildV0, PROGRAM_ID, MIN_LOCK_SUPPLY_BPS, DECIMALS,
} from "@/lib/launch";

interface Params {
  network: string;
  pump: PumpParams;
  config: { paused: boolean; platformFeeBps: number; maxLockedValueLamports: string; minPositionLamports: string } | null;
}

/** Planning aid shown next to the form; not enforced by the program in this beta. */
const DEFAULT_SCHEDULE = [
  { mcap: 100_000, pct: 10 }, { mcap: 250_000, pct: 15 }, { mcap: 500_000, pct: 20 },
  { mcap: 1_000_000, pct: 25 }, { mcap: 3_000_000, pct: 30 },
];

const fmtK = (n: number) => n >= 1e6 ? `$${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : `$${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 })}K`;
const tok = (raw: bigint) => { const n = Number(raw) / 10 ** DECIMALS; return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0); };
const sol = (lamports: bigint | number, d = 3) => (Number(lamports) / 1e9).toLocaleString("en-US", { maximumFractionDigits: d });

type Step = { label: string; state: "todo" | "doing" | "done" | "failed"; sig?: string; note?: string };

export default function LaunchForm() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [p, setP] = useState<Params | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [buySol, setBuySol] = useState("0.5");
  const [holderPct, setHolderPct] = useState(30);
  const [listPct, setListPct] = useState(0);
  const [listText, setListText] = useState("");
  const [holderRewards, setHolderRewards] = useState(false);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const fileRef = useRef<HTMLInputElement>(null);

  const [steps, setSteps] = useState<Step[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; sig: string } | null>(null);
  const running = !!steps && !result && !fatal;

  useEffect(() => {
    fetch("/api/launch-params").then((r) => r.json())
      .then((j) => (j.error ? setPErr(j.error) : setP(j)))
      .catch((e) => setPErr(String(e)));
  }, []);

  /* ------------------------------------------------------------ derived */
  const d = useMemo(() => {
    const lamports = BigInt(Math.round((Number(buySol) || 0) * 1e9));
    if (!p) return null;
    const supply = BigInt(p.pump.tokenTotalSupply);
    const amount = lamports > 0n ? tokensForSol(p.pump, lamports) : 0n;
    const holderBps = Math.round(holderPct * 100), listBps = Math.round(listPct * 100);
    const lockedBps = holderBps + listBps;
    const locked = (amount * BigInt(lockedBps)) / 10_000n;
    const minLock = (supply * BigInt(MIN_LOCK_SUPPLY_BPS)) / 10_000n;
    const lockedSupplyPct = supply > 0n ? Number((locked * 100_000n) / supply) / 1000 : 0;
    const lockedValue = amount > 0n ? (lamports * locked) / amount : 0n;
    const cap = BigInt(p.config?.maxLockedValueLamports ?? "50000000000");
    // smallest buy that still clears the 1%-of-supply floor at this split
    const minAmount = lockedBps > 0 ? (minLock * 10_000n) / BigInt(lockedBps) + 1n : 0n;
    const minBuyLamports = lockedBps > 0 ? solForTokens(p.pump, minAmount) : 0n;
    let list: ReturnType<typeof parseManualList> = [], listErr: string | null = null;
    if (listBps > 0) { try { list = parseManualList(listText); if (!list.length) listErr = "add at least one wallet"; } catch (e: any) { listErr = e.message; } }
    const listTotal = list.reduce((s, e) => s + e.bps, 0);
    const problems: string[] = [];
    if (p.config?.paused) problems.push("The platform has paused new launches; claims and rounds keep running.");
    if (!name.trim()) problems.push("Give the coin a name.");
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) problems.push("Symbol: 1–10 letters or digits.");
    if (lamports <= 0n) problems.push("Enter the SOL the creator buys with.");
    if (lockedBps <= 0) problems.push("Lock at least something — a launch with nothing locked is just pump.fun.");
    if (lockedBps > 10_000) problems.push("The lock cannot exceed 100%.");
    if (amount > 0n && locked < minLock) problems.push(`The lock must be at least ${MIN_LOCK_SUPPLY_BPS / 100}% of total supply — buy at least ${sol(minBuyLamports)} SOL at this split, or lock a larger share.`);
    if (lockedValue > cap) problems.push(`Locked value ${sol(lockedValue)} SOL exceeds the beta cap of ${sol(cap, 0)} SOL per coin — lower the buy or the share.`);
    if (listBps > 0 && listErr) problems.push(`Fixed list: ${listErr}.`);
    if (listBps > 0 && !listErr && listTotal !== 10_000) problems.push(`Fixed list percentages add up to ${listTotal / 100}%; they should add up to 100% of the list's slice.`);
    return { lamports, supply, amount, holderBps, listBps, lockedBps, locked, lockedSupplyPct, lockedValue, cap, minBuyLamports, list, listErr, listTotal, problems, devPct: 100 - holderPct - listPct };
  }, [p, buySol, holderPct, listPct, listText, name, symbol]);

  const schedTotal = schedule.reduce((s, r) => s + (Number(r.pct) || 0), 0);

  /* --------------------------------------------------------------- run */
  async function run() {
    if (!publicKey || !p || !d || d.problems.length) return;
    const dev = publicKey;
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;
    const hasList = d.listBps > 0 && d.list.length > 0;
    const S: Step[] = [
      { label: "Upload metadata to IPFS", state: "todo" },
      { label: "Create the address lookup table", state: "todo" },
      { label: "Fill the lookup table", state: "todo" },
      { label: "Launch: create on pump.fun, buy, lock — one transaction", state: "todo" },
      ...(hasList ? [{ label: "Publish the fixed list on chain", state: "todo" as const }] : []),
    ];
    setSteps([...S]); setFatal(null); setResult(null);
    const set = (i: number, patch: Partial<Step>) => { S[i] = { ...S[i], ...patch }; setSteps([...S]); };
    const sendLegacy = async (ixs: TransactionInstruction[]) => {
      const bh = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ ...bh, feePayer: dev }).add(...ixs);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      return sig;
    };
    try {
      // 1. metadata
      set(0, { state: "doing" });
      const fd = new FormData();
      fd.set("name", name.trim()); fd.set("symbol", symbol.trim().toUpperCase()); fd.set("description", description.trim());
      if (website.trim()) fd.set("website", website.trim());
      const f = fileRef.current?.files?.[0]; if (f) fd.set("file", f);
      const meta = await fetch("/api/metadata", { method: "POST", body: fd }).then((r) => r.json());
      if (meta.error) throw new Error(meta.error);
      set(0, { state: "done", note: meta.uri });

      // 2–3. lookup table
      const root = hasList ? manualRoot(d.list) : Buffer.alloc(32);
      const ix = launchInstruction(mint, dev, p.pump, {
        name: name.trim(), symbol: symbol.trim().toUpperCase(), uri: meta.uri,
        amount: d.amount, maxSolCost: (d.lamports * 108n) / 100n,
        manualRoot: root, manualBps: d.listBps, holderBps: d.holderBps, isHolderReward: holderRewards,
      });
      const addrs = [...ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey), PROGRAM_ID];
      const slot = await connection.getSlot("finalized");
      const lut = lookupTableInstructions(dev, slot, addrs);
      set(1, { state: "doing" });
      const s1 = await sendLegacy(lut.txs[0]);
      set(1, { state: "done", sig: s1 });
      set(2, { state: "doing" });
      if (lut.txs[1]) { const s2 = await sendLegacy(lut.txs[1]); set(2, { state: "done", sig: s2 }); }
      set(2, { state: "doing", note: "waiting for the table to activate…" });
      const table = await waitForTable(connection, lut.table, lut.count);
      set(2, { state: "done", note: undefined });

      // 4. launch
      set(3, { state: "doing" });
      const { tx, bh } = await buildV0(connection, dev, [ix], table, [mintKp]);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      set(3, { state: "done", sig });

      // 5. fixed list rows, in chunks that fit
      if (hasList) {
        set(4, { state: "doing" });
        let last = "";
        for (let i = 0; i < d.list.length; i += 25) {
          last = await sendLegacy([publishManualInstruction(mint, dev, d.list.slice(i, i + 25))]);
        }
        set(4, { state: "done", sig: last });
      }
      setResult({ mint: mint.toBase58(), sig });
    } catch (e: any) {
      const i = S.findIndex((s) => s.state === "doing");
      if (i >= 0) set(i, { state: "failed" });
      setFatal(String(e?.message ?? e));
    }
  }

  /* ---------------------------------------------------------------- ui */
  if (pErr) return <div className="alert err">Could not read launch parameters: {pErr}</div>;

  const preview = d && p && (
    <div className="card sticky">
      <div className="flex between">
        <h3>{name.trim() || "Your coin"} {symbol.trim() && <span className="muted">({symbol.trim().toUpperCase()})</span>}</h3>
        <span className="pill">{p.network}</span>
      </div>
      <div className="split" style={{ marginTop: 14 }} aria-hidden="true">
        <i className="a" style={{ width: `${holderPct}%` }} />
        {listPct > 0 && <i className="b" style={{ width: `${listPct}%` }} />}
        <i className="c" style={{ width: `${Math.max(0, d.devPct)}%` }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--acc)" }} />holders {holderPct}%</span>
        {listPct > 0 && <span><i style={{ background: "var(--acc2)", opacity: .55 }} />fixed list {listPct}%</span>}
        <span><i style={{ background: "var(--dim2)" }} />you keep {Math.max(0, d.devPct)}%</span>
      </div>
      <div className="grid mt2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><div className="k">Creator buy</div><div className="v sm">{d.amount > 0n ? tok(d.amount) : "—"}</div><div className="sub">for {sol(d.lamports)} SOL · {d.supply > 0n && d.amount > 0n ? `${(Number((d.amount * 10_000n) / d.supply) / 100).toFixed(2)}% of supply` : ""}</div></div>
        <div><div className="k">Locked</div><div className="v sm">{d.locked > 0n ? tok(d.locked) : "—"}</div><div className="sub">{d.lockedSupplyPct.toFixed(2)}% of supply · min {MIN_LOCK_SUPPLY_BPS / 100}%</div></div>
        <div><div className="k">Locked value</div><div className="v sm">{sol(d.lockedValue)} SOL</div><div className="sub">beta cap {sol(d.cap, 0)} SOL</div></div>
        <div><div className="k">Creator fee split</div><div className="v sm">{holderRewards ? "on pump" : `${100 - (p.config?.platformFeeBps ?? 1000) / 100} / ${(p.config?.platformFeeBps ?? 1000) / 100}`}</div><div className="sub">{holderRewards ? "pump's holder pool" : "escrow / platform"}</div></div>
      </div>
      <div className="mt2" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="k">What holders get</div>
        <p className="small muted" style={{ marginTop: 4 }}>
          1% of the remaining pool each time volume reaches 1% of market cap; 5% each time market cap doubles.
          Rounds are split by balance × time held; you are excluded.
        </p>
      </div>
      {d.problems.length > 0 && (
        <ul className="alert mt" style={{ margin: "14px 0 0", paddingLeft: 18 }}>
          {d.problems.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </div>
  );

  return (
    <div className="form-grid">
      <div>
        {!p && <div className="card muted small" aria-busy="true">Reading the curve parameters and the platform config…</div>}

        <div className="card">
          <h2 className="h3">Coin</h2>
          <div className="row2 mt">
            <div className="field"><label className="f" htmlFor="l-name">Name</label>
              <input id="l-name" className="in" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fair Launch" disabled={running} /></div>
            <div className="field"><label className="f" htmlFor="l-symbol">Symbol</label>
              <input id="l-symbol" className="in" maxLength={10} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="FAIR" disabled={running} /></div>
          </div>
          <div className="field"><label className="f" htmlFor="l-desc">Description</label>
            <textarea id="l-desc" className="in" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the coin is, and what you locked for holders." disabled={running} /></div>
          <div className="row2">
            <div className="field"><label className="f" htmlFor="l-img">Image</label>
              <input id="l-img" ref={fileRef} className="in" type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={running} />
              <div className="hint">PNG, JPG, GIF or WebP up to 4 MB. Optional — a plain placeholder is used otherwise.</div></div>
            <div className="field"><label className="f" htmlFor="l-web">Website</label>
              <input id="l-web" className="in" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" disabled={running} /></div>
          </div>
        </div>

        <div className="card">
          <h2 className="h3">Lock</h2>
          <p className="note" style={{ marginTop: 4 }}>You buy in the same transaction that creates the coin. The share you choose moves into a program-owned escrow; nobody can withdraw it, you included.</p>
          <div className="row2 mt">
            <div className="field"><label className="f" htmlFor="l-buy">Creator buy (SOL)</label>
              <input id="l-buy" className="in num" inputMode="decimal" value={buySol} onChange={(e) => setBuySol(e.target.value)} disabled={running} />
              <div className="hint">{d && d.lockedBps > 0 ? `at least ${sol(d.minBuyLamports)} SOL for this split (1% of supply must be locked)` : "how much of the curve you take at launch"}</div></div>
            <div className="field"><label className="f" htmlFor="l-holder">Holder pool — {holderPct}% of the buy</label>
              <input id="l-holder" type="range" min={0} max={100 - listPct} step={1} value={holderPct} onChange={(e) => setHolderPct(Number(e.target.value))} disabled={running} />
              <div className="hint">released to holders by the triggers; 30% is the usual choice</div></div>
          </div>
          <div className="row2">
            <div className="field"><label className="f" htmlFor="l-list">Fixed wallet list — {listPct}% of the buy</label>
              <input id="l-list" type="range" min={0} max={100 - holderPct} step={1} value={listPct} onChange={(e) => setListPct(Number(e.target.value))} disabled={running} />
              <div className="hint">optional: a set of wallets committed at launch (team, partners), claimable by proof</div></div>
            <div className="field"><div className="f">You keep</div>
              <div className="v sm num">{d ? Math.max(0, d.devPct) : 100 - holderPct - listPct}%</div>
              <div className="hint">your wallet never takes part in a round</div></div>
          </div>
          {listPct > 0 && (
            <div className="field">
              <label className="f" htmlFor="l-rows">Fixed list · one <code>wallet, percent</code> per line (percent of the list&apos;s slice, 100% total, up to 50 rows)</label>
              <textarea id="l-rows" className="in mono" rows={5} value={listText} onChange={(e) => setListText(e.target.value)} disabled={running}
                        placeholder={"9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin, 60\n5qHyZPZFDLuQx2tWbSWqKNLt9Zv3DDJCvg4yyBR1KnQm, 40"} />
              {d?.listErr ? <div className="hint" style={{ color: "var(--bad)" }}>{d.listErr}</div>
                : d && d.list.length > 0 && <div className="hint">{d.list.length} wallet{d.list.length === 1 ? "" : "s"} · {d.listTotal / 100}% · root <span className="mono">{manualRoot(d.list).toString("hex").slice(0, 16)}…</span> · the rows are published on chain after launch so recipients can prove their share; shares stay locked for 30 days</div>}
            </div>
          )}
          <details className="more">
            <summary>Advanced</summary>
            <label className="flex small" style={{ gap: 10, marginTop: 8 }}>
              <input type="checkbox" checked={holderRewards} onChange={(e) => setHolderRewards(e.target.checked)} disabled={running} />
              <span>pump.fun holder-rewards coin — pump pays the creator fee to its own holder pool; the escrow gets no fee sweep and no buyback, only the locked supply and its triggered rounds.</span>
            </label>
          </details>
        </div>

        <div className="card">
          <div className="flex between"><h2 className="h3">Milestone schedule</h2><span className="pill">planning aid</span></div>
          <p className="note" style={{ marginTop: 4 }}>
            Market-cap tiers and the share of the locked pool you intend to have released by each. The devnet program enforces its own rule
            (5% of the remaining pool per market-cap doubling, 1% per volume trigger); per-coin schedules are on the roadmap, so this table is
            not written on chain yet.
          </p>
          <div className="flex between mt" style={{ gap: "6px 16px" }} aria-live="polite">
            <span className="small">
              Released so far <b className="num">{schedTotal}%</b> · Still locked <b className="num">{Math.max(0, 100 - schedTotal)}%</b>
            </span>
            {schedTotal !== 100 && <span className="pill warn">a full schedule adds up to 100%</span>}
          </div>
          <div className="tbl mt"><table className="milestones">
            <thead><tr><th>Market cap</th><th className="r">Released at tier</th><th className="r">Cumulative</th><th className="r">Still locked</th></tr></thead>
            <tbody>
              {schedule.map((row, i) => {
                const cum = schedule.slice(0, i + 1).reduce((s, r) => s + (Number(r.pct) || 0), 0);
                return (
                  <tr key={i}>
                    <td><input className="in num" inputMode="numeric" aria-label={`tier ${i + 1} market cap in USD`} value={row.mcap}
                               onChange={(e) => setSchedule(schedule.map((r, j) => j === i ? { ...r, mcap: Number(e.target.value) || 0 } : r))} disabled={running} /></td>
                    <td className="r"><input className="in num" inputMode="numeric" aria-label={`tier ${i + 1} percent released`} value={row.pct} style={{ textAlign: "right" }}
                               onChange={(e) => setSchedule(schedule.map((r, j) => j === i ? { ...r, pct: Number(e.target.value) || 0 } : r))} disabled={running} /></td>
                    <td className="r muted">{cum}%</td>
                    <td className="r"><b>{Math.max(0, 100 - cum)}%</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div className="small muted mt">{schedule.map((r) => fmtK(r.mcap)).join(" → ")}</div>
        </div>

        <div className="card">
          <h2 className="h3">Sign</h2>
          <p className="note" style={{ marginTop: 4 }}>
            Three transactions from your wallet{d && d.listBps > 0 ? ", plus one per 25 rows of the fixed list" : ""}: two set up a one-off address
            lookup table (the launch touches 39 accounts), the third creates the coin on pump.fun, makes your buy and moves the locked
            share into escrow — atomically. If any part fails, nothing is created.
          </p>
          {!publicKey ? (
            <div className="mt"><WalletMultiButton>Connect wallet to launch</WalletMultiButton></div>
          ) : (
            <div className="flex mt" style={{ gap: 12 }}>
              <button className="btn" disabled={!d || d.problems.length > 0 || running} onClick={run}>
                {running ? "Launching…" : `Launch on ${p?.network ?? "devnet"}`}
              </button>
              <WalletMultiButton />
              <span className="tiny muted">cost ≈ {d ? sol(d.lamports + 30_000_000n) : "—"} SOL incl. rent</span>
            </div>
          )}
          {steps && (
            <ol className="mt2" style={{ margin: "18px 0 0", paddingLeft: 0, listStyle: "none" }} aria-live="polite">
              {steps.map((s, i) => (
                <li key={i} className="flex" style={{ padding: "8px 0", borderTop: "1px solid var(--line)", gap: 10 }}>
                  <span className={`pill${s.state === "done" ? " on" : s.state === "failed" ? " bad" : s.state === "doing" ? " warn" : ""}`} style={{ minWidth: 70, justifyContent: "center" }}>
                    {s.state === "doing" ? "signing" : s.state}
                  </span>
                  <span className="small">{s.label}</span>
                  {s.note && <span className="tiny muted mono" style={{ wordBreak: "break-all" }}>{s.note}</span>}
                  {s.sig && <a className="tiny" href={`https://explorer.solana.com/tx/${s.sig}?cluster=${p?.network}`} target="_blank" rel="noreferrer">tx ↗</a>}
                </li>
              ))}
            </ol>
          )}
          {fatal && <div className="alert err mt" role="alert">{fatal}</div>}
          {result && (
            <div className="alert ok mt" role="status">
              Launched. Mint <span className="mono">{result.mint}</span> —{" "}
              <Link href={`/coin/${result.mint}`}>open the coin page</Link> ·{" "}
              <a href={`https://explorer.solana.com/tx/${result.sig}?cluster=${p?.network}`} target="_blank" rel="noreferrer">launch transaction ↗</a>
              {p?.network !== "localnet" && <> · <a href={`https://pump.fun/coin/${result.mint}`} target="_blank" rel="noreferrer">pump.fun ↗</a></>}
              <div className="tiny muted mt">Escrow {launchAddresses(new PublicKey(result.mint), publicKey!, p!.pump).escrow.toBase58()} — the fee split is set on the crank&apos;s next pass.</div>
            </div>
          )}
        </div>
      </div>
      <div>{preview}</div>
    </div>
  );
}
