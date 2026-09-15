"use client";
import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { devDistributeInstruction, DECIMALS } from "@/lib/launch";

export interface DistributeProps {
  mint: string; dev: string; cluster: string; symbol: string;
  /** whole tokens, as strings so the server can pass bigints */
  poolRemaining: string; supply: string;
}

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/** Manual mode: the creator releases part of the pool into the next round. Shown only to the dev wallet. */
export default function DistributePanel(p: DistributeProps) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const pool = Number(p.poolRemaining), supply = Number(p.supply);
  const [text, setText] = useState(() => String(Math.floor(pool * 0.05)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string; sig?: string } | null>(null);
  const [done, setDone] = useState(0);

  const amount = useMemo(() => Math.max(0, Math.floor(Number(text.replace(/[^0-9.]/g, "")) || 0)), [text]);
  const left = pool - done;
  const over = amount > left;
  const isDev = publicKey?.toBase58() === p.dev;

  async function release() {
    if (!publicKey || !isDev || amount <= 0 || over) return;
    setBusy(true); setMsg(null);
    try {
      const raw = BigInt(amount) * BigInt(10 ** DECIMALS);
      const ix = devDistributeInstruction(new PublicKey(p.mint), publicKey, raw);
      const bh = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ ...bh, feePayer: publicKey }).add(ix);
      const sig = await sendTransaction(tx, connection);
      setMsg({ kind: "info", text: "Release sent, waiting for confirmation…", sig });
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setDone((d) => d + amount);
      setMsg({ kind: "ok", text: `Released ${fmt(amount)} ${p.symbol} into the next round. The crank takes the snapshot and opens it on its next pass; holders can then claim.`, sig });
    } catch (e: any) {
      setMsg({ kind: "err", text: String(e?.message ?? e) });
    } finally { setBusy(false); }
  }

  if (!publicKey) return null;
  if (!isDev) {
    return (
      <div className="card">
        <h3>Distribute now</h3>
        <p className="note">Manual mode: only the creator wallet <span className="mono">{p.dev.slice(0, 4)}…{p.dev.slice(-4)}</span> can release from the pool. Connected as a different wallet.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="flex between"><h3>Distribute now</h3><span className="pill warn">creator only</span></div>
      <p className="note" style={{ marginTop: 4 }}>
        Release part of the pool into the next round, at once. The snapshot, the pro-rata split, the floor, the cap and the claims are the
        same as an Auto round; the tokens can only reach holders.
      </p>
      <div className="row2 mt">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="f" htmlFor="dd-amount">Amount ({p.symbol})</label>
          <input id="dd-amount" className="in num" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <div className="hint">pool remaining {fmt(left)} · <button type="button" className="tiny" style={{ background: "none", border: 0, color: "var(--acc)", cursor: "pointer", padding: 0 }} onClick={() => setText(String(left))}>release all</button></div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignSelf: "end" }}>
          <div><div className="k">Of supply</div><div className="v sm">{supply > 0 ? `${((amount / supply) * 100).toFixed(2)}%` : "—"}</div></div>
          <div><div className="k">Of the pool</div><div className="v sm">{left > 0 ? `${((amount / left) * 100).toFixed(1)}%` : "—"}</div></div>
        </div>
      </div>
      {over && <div className="alert err mt" role="alert">More than the pool has left ({fmt(left)}).</div>}
      <div className="flex mt" style={{ gap: 12 }}>
        <button className="btn" disabled={busy || amount <= 0 || over} onClick={release}>{busy ? "Releasing…" : `Release ${fmt(amount)} ${p.symbol}`}</button>
        <span className="tiny muted">one signature · no delay · cannot be undone</span>
      </div>
      {msg && (
        <div className={`alert mt ${msg.kind === "err" ? "err" : msg.kind === "ok" ? "ok" : ""}`} role="status">
          {msg.text}{msg.sig && <> <a href={`https://explorer.solana.com/tx/${msg.sig}?cluster=${p.cluster}`} target="_blank" rel="noreferrer">view transaction ↗</a></>}
        </div>
      )}
    </div>
  );
}
