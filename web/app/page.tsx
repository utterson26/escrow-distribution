import { buildRows } from "@/lib/data";
import { fmtTokens, fmtSol, short } from "@/lib/chain";

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
  try { rows = await buildRows(); } catch (e: any) { error = String(e?.message ?? e); }

  if (error) return <div className="card"><b>Could not reach the chain.</b><div className="note">{error}</div></div>;
  if (!rows.length) return <div className="empty">No launches found on devnet yet.</div>;

  return (
    <>
      <h2>Coins</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Coin</th><th>Locked airdrop</th><th>Dev share</th>
              <th>Pool remaining</th><th>Market cap</th>
              <th>Last distribution</th><th>Next trigger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.escrow.address}>
                <td>
                  <a className="mono" href={`/coin/${r.escrow.mint}`}>{short(r.escrow.mint, 6)}</a>
                </td>
                <td>{r.escrowPct}%</td>
                <td>{r.devPct}%</td>
                <td>{fmtTokens(BigInt(r.poolRemaining))}</td>
                <td>{fmtSol(BigInt(r.marketCapLamports))} SOL</td>
                <td>
                  {r.lastDistribution
                    ? <>#{r.lastDistribution.index} · {r.lastDistribution.claimed}/{r.lastDistribution.winners} claimed</>
                    : <span style={{ color: "var(--dim)" }}>none yet</span>}
                </td>
                <td><Next t={r.nextTrigger} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Every number above is read live from the program on devnet. Percentages are of the
        launch buy: the locked share went into escrow for airdrops, the rest stayed with the
        dev wallet — which never takes part in the airdrop itself.
      </div>
    </>
  );
}
