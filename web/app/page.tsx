import { buildRows, coinLabel, fetchConfig } from "@/lib/data";
import { fmtTokens, fmtSol, short, network, Config } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Next({ t }: { t: any }) {
  if (!t) return <span className="pill">n/a</span>;
  if (t.state === "armed") {
    const secs = Math.round((t.slotsLeft ?? 0) * 0.4);
    return (
      <span className="pill on">
        {t.kind} armed · fires in ~{secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`}
      </span>
    );
  }
  const v = Math.round(t.volumeProgressPct ?? 0);
  const m = Math.round(t.milestoneProgressPct ?? 0);
  return (
    <div style={{ minWidth: 150 }}>
      <div className="k">volume {v}% · milestone {m}%</div>
      <div className="bar"><i style={{ width: `${Math.max(v, m)}%` }} /></div>
    </div>
  );
}

export default async function Home() {
  let rows: any[] = [];
  let error: string | null = null;
  let cfg: Config | null = null;
  try { rows = await buildRows(); cfg = await fetchConfig(); } catch (e: any) { error = String(e?.message ?? e); }

  if (error) return <div className="card"><b>Could not reach the chain.</b><div className="note">{error}</div></div>;
  const net = network().name;
  if (!rows.length) return <div className="empty">No coins have been launched on {net} yet.</div>;

  return (
    <>
      <h2>Coins</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Coin</th><th>Locked</th><th>Dev share</th><th>Cap / wallet</th>
              <th>Type · platform fee</th>
              <th>Pool remaining</th><th>Market cap</th>
              <th>Last distribution</th><th>Next trigger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.escrow.address}>
                <td>
                  <a href={`/coin/${r.escrow.mint}`}><b>{coinLabel(r.escrow.mint, r.meta)}</b></a>
                  <div className="k mono">{short(r.escrow.mint, 6)}</div>
                </td>
                <td>{r.lockedPct}% <span className="k">(holders {r.escrowPct}%{r.manualPct ? ` + list ${r.manualPct}%` : ""})</span></td>
                <td>{r.devPct}%</td>
                <td>{r.capPct}% (from {r.capMinHolders} holders)</td>
                <td>{r.coinType} · {r.platformFeePct === null ? "fee split not set up" : `${r.platformFeePct}% platform`}</td>
                <td>{fmtTokens(BigInt(r.poolRemaining))}</td>
                <td>{fmtSol(BigInt(r.marketCapLamports))} SOL</td>
                <td>
                  {r.lastDistribution
                    ? <>#{r.lastDistribution.index} · {r.lastDistribution.claimed}/{r.lastDistribution.holders} holders claimed · {fmtTokens(BigInt(r.lastDistribution.total))}</>
                    : <span style={{ color: "var(--dim)" }}>none yet</span>}
                </td>
                <td><Next t={r.nextTrigger} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Every number above is read live from the program on {net}. The locked share is a slice of the
        launch buy, split between the holder pool (triggered distributions) and, optionally, a fixed
        wallet list committed at launch; it must be at least 1% of total supply. The rest stayed with the
        dev wallet — which never takes part in a distribution itself. Each round is split pro rata
        (balance × time held) over every eligible holder, no wallet taking more than the cap once
        there are enough holders. The platform fee is a cut of pump&apos;s creator fee only — it is
        written into each coin&apos;s pump fee-sharing config and never touches the locked pool.
        {cfg && <> Current platform rate for new launches: {cfg.platformFeeBps / 100}%
          {cfg.feeEffectiveSlot > 0n && ` (change to ${cfg.pendingFeeBps / 100}% pending, effective at slot ${cfg.feeEffectiveSlot})`}.</>}
      </div>
    </>
  );
}
