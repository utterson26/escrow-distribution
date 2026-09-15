import Link from "next/link";
import { CoinRow, coinLabel } from "@/lib/data";
import { fmtSol, short } from "@/lib/chain";

/** 84,260,000 → "84.3M" */
export const compact = (raw: bigint | string, decimals = 6) => {
  const n = Number(BigInt(raw.toString())) / 10 ** decimals;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

export const ago = (iso: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function NextRelease({ t }: { t: CoinRow["nextTrigger"] }) {
  if (!t) return <span className="muted">—</span>;
  if (t.state === "armed") {
    const secs = Math.round((t.slotsLeft ?? 0) * 0.4);
    return (
      <span className="pill on" title="the trigger fired; the release lands at a random slot inside the delay window">
        <span className="dot" aria-hidden="true" />
        {t.kind} · {secs <= 0 ? "due now" : `~${secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`}`}
      </span>
    );
  }
  const v = Math.round(t.volumeProgressPct ?? 0);
  const m = Math.round(t.milestoneProgressPct ?? 0);
  const lead = m >= v ? "milestone" : "volume";
  return (
    <div style={{ minWidth: 140 }}>
      <div className="tiny muted num">{lead} {Math.max(v, m)}%</div>
      <div className="bar thin" role="progressbar" aria-valuenow={Math.max(v, m)} aria-valuemin={0} aria-valuemax={100}
           aria-label={`progress toward the next ${lead} release`}>
        <i style={{ width: `${Math.max(2, Math.max(v, m))}%` }} />
      </div>
    </div>
  );
}

export default function CoinTable({ rows }: { rows: CoinRow[] }) {
  return (
    <div className="card pad0">
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Coin</th><th className="r">Locked</th><th className="r">Pool remaining</th>
              <th className="r">Market cap</th><th className="r">Rounds</th><th>Next release</th><th className="r">Launched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.escrow.address}>
                <td>
                  <Link href={`/coin/${r.escrow.mint}`} className="coin-name">{coinLabel(r.escrow.mint, r.meta)}</Link>
                  <div className="tiny muted mono">{short(r.escrow.mint, 6)}{r.mode !== "unknown" ? ` · ${r.mode}` : ""}{r.coinType === "holder-rewards" ? " · holder-rewards" : ""}</div>
                </td>
                <td className="r">
                  <b>{r.lockedSupplyPct !== null ? `${r.lockedSupplyPct}%` : `${r.lockedPct}%`}</b>
                  <div className="tiny muted">{compact(r.escrow.escrowed + (r.escrow.manualTotal ?? 0n))} tokens{r.lockedSupplyPct !== null ? " · of supply" : " · of the buy"}</div>
                </td>
                <td className="r">{compact(r.poolRemaining)}</td>
                <td className="r">{fmtSol(BigInt(r.marketCapLamports))} SOL</td>
                <td className="r">
                  {r.rounds}
                  {r.lastDistribution && <div className="tiny muted">last {compact(r.lastDistribution.total)} · {r.lastDistribution.claimed}/{r.lastDistribution.holders} claimed</div>}
                </td>
                <td><NextRelease t={r.nextTrigger} /></td>
                <td className="r muted">{ago(r.launchedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
