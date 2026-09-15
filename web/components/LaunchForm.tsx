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
  /** the same curve parameters on mainnet, for the "what would this cost for real" line */
  mainnet: PumpParams | null;
  solUsd: number | null;
  config: { paused: boolean; platformFeeBps: number; maxLockedValueLamports: string; minPositionLamports: string } | null;
}

/** the curve can only sell its real reserves (79.3% of supply on pump); keep launches well inside that */
const MAX_BUY_PCT = 60;

const tok = (raw: bigint) => { const n = Number(raw) / 10 ** DECIMALS; return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0); };
const pctS = (n: number) => `${Number(n.toFixed(2))}%`;
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
  // every share is a share of the total supply pump mints (1B)
  const [holderPct, setHolderPct] = useState(30);
  const [listPct, setListPct] = useState(0);
  const [keepPct, setKeepPct] = useState(2);
  const [listText, setListText] = useState("");
  const [holderRewards, setHolderRewards] = useState(false);
  const [mode, setMode] = useState<0 | 1>(0);
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
    if (!p) return null;
    const supply = BigInt(p.pump.tokenTotalSupply);
    const buyPct = holderPct + listPct + keepPct;
    // the creator buys exactly pool + list + keep, then the program splits the buy by bps
    const amount = (supply * BigInt(Math.round(buyPct * 100))) / 10_000n;
    const holderBps = buyPct > 0 ? Math.round((holderPct / buyPct) * 10_000) : 0;
    const listBps = buyPct > 0 ? Math.round((listPct / buyPct) * 10_000) : 0;
    const lockedBps = holderBps + listBps;
    const holderTokens = (amount * BigInt(holderBps)) / 10_000n;
    const listTokens = (amount * BigInt(listBps)) / 10_000n;
    const locked = holderTokens + listTokens;
    const keepTokens = amount - locked;
    const minLock = (supply * BigInt(MIN_LOCK_SUPPLY_BPS)) / 10_000n;
    const lockedSupplyPct = supply > 0n ? Number((locked * 100_000n) / supply) / 1000 : 0;
    // what the curve charges for that buy, fees included — the SOL the wallet must have
    const lamports = amount > 0n ? solForTokens(p.pump, amount) : 0n;
    const lockedValue = amount > 0n ? (lamports * locked) / amount : 0n;
    const cap = BigInt(p.config?.maxLockedValueLamports ?? "50000000000");
    let list: ReturnType<typeof parseManualList> = [], listErr: string | null = null;
    if (listPct > 0) { try { list = parseManualList(listText); if (!list.length) listErr = "add at least one wallet"; } catch (e: any) { listErr = e.message; } }
    const listTotal = list.reduce((s, e) => s + e.bps, 0);
    const problems: string[] = [];
    if (p.config?.paused) problems.push("The platform has paused new launches; claims and rounds keep running.");
    if (!name.trim()) problems.push("Give the coin a name.");
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) problems.push("Symbol: 1–10 letters or digits.");
    if (holderPct + listPct <= 0) problems.push("Lock something for holders — a launch with nothing locked is just pump.fun.");
    if (buyPct > MAX_BUY_PCT) problems.push(`The creator buy (${pctS(buyPct)} of supply) is more than the curve can sell at launch — keep pool + list + keep under ${MAX_BUY_PCT}%.`);
    if (locked > 0n && locked < minLock) problems.push(`The lock must be at least ${MIN_LOCK_SUPPLY_BPS / 100}% of total supply.`);
    if (lockedValue > cap) problems.push(`Locked value ${sol(lockedValue)} SOL exceeds the beta cap of ${sol(cap, 0)} SOL per coin — lock a smaller share.`);
    if (listPct > 0 && listErr) problems.push(`Fixed list: ${listErr}.`);
    if (listPct > 0 && !listErr && listTotal !== 10_000) problems.push(`Fixed list percentages add up to ${listTotal / 100}%; they should add up to 100% of the list's slice.`);
    const mainnetLamports = p.mainnet && amount > 0n ? solForTokens(p.mainnet, amount) : null;
    return { supply, buyPct, amount, holderBps, listBps, lockedBps, holderTokens, listTokens, keepTokens, locked, lockedSupplyPct, lamports, lockedValue, cap, list, listErr, listTotal, problems, mainnetLamports };
  }, [p, holderPct, listPct, keepPct, listText, name, symbol]);

  /* --------------------------------------------------------------- run */
  async function run() {
    if (!publicKey || !p || !d || d.problems.length) return;
    const dev = publicKey;
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;
    const hasList = listPct > 0 && d.list.length > 0;
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
        distributionMode: mode,
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
        <span className={`pill${mode === 1 ? " warn" : " on"}`}>{mode === 1 ? "Manual" : "Auto"}</span>
      </div>
      <div className="split" style={{ marginTop: 14 }} aria-hidden="true">
        <i className="a" style={{ width: `${holderPct}%` }} />
        {listPct > 0 && <i className="b" style={{ width: `${listPct}%` }} />}
        <i className="c" style={{ width: `${keepPct}%` }} />
        <i style={{ width: `${Math.max(0, 100 - d.buyPct)}%`, background: "transparent" }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--acc)" }} />holders {pctS(holderPct)}</span>
        {listPct > 0 && <span><i style={{ background: "var(--acc2)", opacity: .55 }} />fixed list {pctS(listPct)}</span>}
        <span><i style={{ background: "var(--dim2)" }} />you keep {pctS(keepPct)}</span>
        <span><i style={{ background: "var(--line)" }} />on the curve {pctS(Math.max(0, 100 - d.buyPct))}</span>
      </div>
      <div className="grid mt2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><div className="k">Holder pool</div><div className="v sm">{tok(d.holderTokens)}</div><div className="sub">{pctS(holderPct)} of supply</div></div>
        <div><div className="k">You keep</div><div className="v sm">{tok(d.keepTokens)}</div><div className="sub">{pctS(keepPct)} of supply · excluded from rounds</div></div>
        {listPct > 0 && <div><div className="k">Fixed list</div><div className="v sm">{tok(d.listTokens)}</div><div className="sub">{pctS(listPct)} of supply</div></div>}
        <div><div className="k">Creator buy</div><div className="v sm">{sol(d.lamports)} SOL</div><div className="sub">{tok(d.amount)} = {pctS(d.buyPct)} of supply, integrated along the curve, pump fees included</div></div>
        <div><div className="k">Locked value</div><div className="v sm">{sol(d.lockedValue)} SOL</div><div className="sub">beta cap {sol(d.cap, 0)} SOL</div></div>
        <div><div className="k">Creator fee split</div><div className="v sm">{holderRewards ? "on pump" : `${100 - (p.config?.platformFeeBps ?? 1000) / 100} / ${(p.config?.platformFeeBps ?? 1000) / 100}`}</div><div className="sub">{holderRewards ? "pump's holder pool" : "escrow / platform"}</div></div>
      </div>
      {d.mainnetLamports !== null && (
        <div className="sub mt" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          On mainnet the same buy would cost <b className="num">{sol(d.mainnetLamports, 2)} SOL</b>
          {p.solUsd ? <> (≈ ${(Number(d.mainnetLamports) / 1e9 * p.solUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })} at ${p.solUsd.toFixed(0)}/SOL)</> : null}
          : the curve starts at 30 SOL virtual there, 1 SOL on devnet.
        </div>
      )}
      <div className="mt2" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="k">What holders get</div>
        <p className="small muted" style={{ marginTop: 4 }}>
          {mode === 0
            ? "1% of the remaining pool each time trading volume reaches 1% of market cap; 5% each time market cap doubles. Releases land at a random moment within the hour; you cannot trigger, delay or stop them."
            : "Whatever you release, when you release it: dev_distribute moves any amount up to the whole pool into the next round at once, with no delay. No automatic rule runs. You can never take the pool back."}
          {" "}Every round is split by balance × time held across eligible holders — you are excluded.
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
          <div className="flex between"><h2 className="h3">Distribution</h2><span className="tiny muted">fixed at launch · cannot be changed later</span></div>
          <div className="row2 mt" role="radiogroup" aria-label="distribution mode">
            {([0, 1] as const).map((m) => (
              <label key={m} className="card" style={{ cursor: "pointer", borderColor: mode === m ? "var(--acc)" : undefined, background: mode === m ? "var(--acc-soft)" : "var(--bg2)", margin: 0 }}>
                <div className="flex" style={{ gap: 10 }}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => { setMode(m); if (m === 0) setListPct(0); }} disabled={running} />
                  <b>{m === 0 ? "Auto" : "Manual"}</b>
                  <span className="pill" style={{ marginLeft: "auto" }}>{m === 0 ? "rule-driven" : "dev-driven"}</span>
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  {m === 0
                    ? "The program releases the pool on its own: 1% each time volume reaches 1% of market cap, 5% each time market cap doubles, each at a random moment within the hour. You have no trigger, no pause and no veto — holders can count on it."
                    : "Nothing releases until you say so. dev_distribute moves any amount up to the whole pool into the next round immediately — no threshold, no delay. Holders trust your timing; the pool itself can still never come back to you."}
                </p>
              </label>
            ))}
          </div>
          <p className="note mt">
            Both modes use the same distribution engine: a snapshot at the release, pro-rata by balance × time held, the eligibility
            floor, the per-wallet cap, the creator and the fixed list excluded, Merkle claims. A fixed wallet list (team, partners) can be
            added on Manual launches; an Auto coin locks everything for the holder pool.
          </p>
        </div>

        <div className="card">
          <h2 className="h3">Lock</h2>
          <p className="note" style={{ marginTop: 4 }}>
            Shares of the total supply (1B). You buy exactly pool + list + keep in the launch transaction; the program moves the
            pool and the list into escrow the same instant. The SOL that buy costs is computed from the curve below.
          </p>
          <div className="row2 mt">
            <div className="field"><label className="f" htmlFor="l-holder">Holder pool — {pctS(holderPct)} of supply{d ? ` = ${tok(d.holderTokens)}` : ""}</label>
              <input id="l-holder" type="range" min={0} max={MAX_BUY_PCT} step={1} value={holderPct} onChange={(e) => setHolderPct(Number(e.target.value))} disabled={running} />
              <div className="hint">released to holders in rounds; 30% is the usual choice, 1% of supply is the floor</div></div>
            <div className="field"><label className="f" htmlFor="l-keep">You keep — {pctS(keepPct)} of supply{d ? ` = ${tok(d.keepTokens)}` : ""}</label>
              <input id="l-keep" type="range" min={0} max={20} step={1} value={keepPct} onChange={(e) => setKeepPct(Number(e.target.value))} disabled={running} />
              <div className="hint">stays in your wallet; never takes part in a round</div></div>
          </div>
          <div className="row2">
            {mode === 1 ? (
              <div className="field"><label className="f" htmlFor="l-list">Fixed wallet list — {pctS(listPct)} of supply{d && listPct > 0 ? ` = ${tok(d.listTokens)}` : ""}</label>
                <input id="l-list" type="range" min={0} max={20} step={1} value={listPct} onChange={(e) => setListPct(Number(e.target.value))} disabled={running} />
                <div className="hint">optional: wallets committed at launch (team, partners), claimable by proof, locked 30 days</div></div>
            ) : (
              <div className="field"><div className="f">Fixed wallet list</div>
                <div className="v sm muted">—</div>
                <div className="hint">available on Manual launches; an Auto coin locks everything for the holder pool</div></div>
            )}
            <div className="field"><div className="f">Creator buy</div>
              <div className="v sm num">{d ? `${sol(d.lamports)} SOL` : "—"}</div>
              <div className="hint">{d ? `${tok(d.amount)} tokens = ${pctS(d.buyPct)} of supply at the launch price, pump fees included` : "computed from the curve"}</div></div>
          </div>
          {listPct > 0 && (
            <div className="field">
              <label className="f" htmlFor="l-rows">Fixed list · one <code>wallet, percent</code> per line (percent of the list&apos;s slice, 100% total, up to 50 rows)</label>
              <textarea id="l-rows" className="in mono" rows={5} value={listText} onChange={(e) => setListText(e.target.value)} disabled={running}
                        placeholder={"9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin, 60\n5qHyZPZFDLuQx2tWbSWqKNLt9Zv3DDJCvg4yyBR1KnQm, 40"} />
              {d?.listErr ? <div className="hint" style={{ color: "var(--bad)" }}>{d.listErr}</div>
                : d && d.list.length > 0 && <div className="hint">{d.list.length} wallet{d.list.length === 1 ? "" : "s"} · {d.listTotal / 100}% · root <span className="mono">{manualRoot(d.list).toString("hex").slice(0, 16)}…</span> · the rows are published on chain after launch so recipients can prove their share</div>}
            </div>
          )}
          <details className="more">
            <summary>Advanced</summary>
            <label className="flex small" style={{ gap: 10, marginTop: 8 }}>
              <input type="checkbox" checked={holderRewards} onChange={(e) => setHolderRewards(e.target.checked)} disabled={running} />
              <span>pump.fun holder-rewards coin — pump pays the creator fee to its own holder pool; the escrow gets no fee sweep and no buyback, only the locked supply and its rounds.</span>
            </label>
          </details>
        </div>

        <div className="card">
          <h2 className="h3">Sign</h2>
          <p className="note" style={{ marginTop: 4 }}>
            Three transactions from your wallet{listPct > 0 ? ", plus one per 25 rows of the fixed list" : ""}: two set up a one-off address
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
