"use client";
import { useMemo, useState } from "react";

export interface CalcInput {
  /** all as plain numbers in whole tokens / SOL so the client needs no bigint */
  poolRemaining: number;      // tokens not yet released
  circulating: number;        // tokens held by wallets that can take part (supply − curve − escrow − list)
  priceSol: number;           // SOL per token, off the curve
  minPositionSol: number;     // eligibility floor
  capPct: number;             // most of one round a single wallet may take
  capMinHolders: number;      // ...once a round has this many holders
  symbol: string;
}

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/**
 * What a position would receive from the next round, assuming every eligible
 * wallet has held for the same time (the real snapshot weights by balance ×
 * time held, so a long-standing position does better than this, a fresh one worse).
 */
export default function ShareCalculator({ c }: { c: CalcInput }) {
  // start from a position that clears the floor comfortably, so the numbers are not all dashes
  const [tokens, setTokens] = useState<string>(() =>
    String(Math.round(c.priceSol > 0 ? (c.minPositionSol * 2.5) / c.priceSol : Math.max(1, c.circulating * 0.01))));
  const [holders, setHolders] = useState<string>("25");

  const r = useMemo(() => {
    const pos = Math.max(0, Number(tokens.replace(/[^0-9.]/g, "")) || 0);
    const n = Math.max(1, Math.floor(Number(holders) || 1));
    const valueSol = pos * c.priceSol;
    const eligible = valueSol >= c.minPositionSol && pos > 0;
    const rawShare = c.circulating > 0 ? Math.min(1, pos / c.circulating) : 0;
    const capped = n >= c.capMinHolders && rawShare > c.capPct / 100;
    const share = capped ? c.capPct / 100 : rawShare;
    return {
      pos, valueSol, eligible, share, capped,
      volume: c.poolRemaining * 0.01 * share,
      milestone: c.poolRemaining * 0.05 * share,
    };
  }, [tokens, holders, c]);

  return (
    <div className="card">
      <div className="flex between">
        <h3>Estimate your share</h3>
        <span className="tiny muted">estimate · the real snapshot also weights by time held</span>
      </div>
      <div className="row2 mt">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="f" htmlFor="calc-tokens">Your position ({c.symbol})</label>
          <input id="calc-tokens" className="in num" inputMode="decimal" value={tokens}
                 onChange={(e) => setTokens(e.target.value)} />
          <div className="hint num">≈ {r.valueSol.toFixed(4)} SOL at the current curve price · floor {c.minPositionSol} SOL</div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="f" htmlFor="calc-holders">Eligible holders in the round</label>
          <input id="calc-holders" className="in num" inputMode="numeric" value={holders}
                 onChange={(e) => setHolders(e.target.value)} />
          <div className="hint">the {c.capPct}% cap applies from {c.capMinHolders} holders on</div>
        </div>
      </div>
      <div className="grid mt2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <div>
          <div className="k">Your weight</div>
          <div className="v sm">{r.eligible ? `${(r.share * 100).toFixed(2)}%` : "—"}</div>
          <div className="sub">{r.capped ? `capped at ${c.capPct}% of the round` : "of eligible supply"}</div>
        </div>
        <div>
          <div className="k">Volume release</div>
          <div className="v sm">{r.eligible ? `${fmt(r.volume)}` : "—"}</div>
          <div className="sub">1% of {fmt(c.poolRemaining)} pool</div>
        </div>
        <div>
          <div className="k">Milestone release</div>
          <div className="v sm">{r.eligible ? `${fmt(r.milestone)}` : "—"}</div>
          <div className="sub">5% of the pool</div>
        </div>
      </div>
      {!r.eligible && r.pos > 0 && (
        <div className="alert mt" role="status">
          Below the eligibility floor: a position must be worth at least {c.minPositionSol} SOL at the snapshot to take part.
        </div>
      )}
    </div>
  );
}
