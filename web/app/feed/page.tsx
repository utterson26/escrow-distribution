import type { Metadata } from "next";
import Link from "next/link";
import { fetchFeed, fetchMetadata, coinLabel } from "@/lib/data";
import { fmtTokens, short, network } from "@/lib/chain";

export const metadata: Metadata = { title: "Activity" };
// Rendered from chain state and re-rendered at most every 15 s: fast for
// everyone, and never more than a few blocks behind.
export const revalidate = 15;

const LABEL: Record<string, string> = {
  ShareClaimed: "Share claimed", ManualClaimed: "Manual share claimed",
  TriggerFired: "Trigger fired", RoundOpened: "Round opened",
  BuybackDone: "Buyback", Launched: "Coin launched",
  DeadCoinFlagged: "Flagged dead", Intervened: "Platform intervention",
};

export default async function Feed() {
  let items: any[] = [];
  let error: string | null = null;
  try { items = await fetchFeed(30); } catch (e: any) { error = String(e?.message ?? e); }

  const net = network();
  const head = (
    <div className="section-head mt2" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      <div className="eyebrow">Activity</div>
      <h1 style={{ fontSize: "clamp(26px,3.5vw,36px)" }}>What the program did last</h1>
      <p>The most recent events on {net.name}, decoded straight from the program&apos;s logs — nothing is indexed off-chain.</p>
    </div>
  );
  if (error) return <>{head}<div className="card"><b>Could not reach the chain.</b><div className="note">{error}</div></div></>;
  if (!items.length) return <>{head}<div className="empty">No activity yet.</div></>;
  const metas = await fetchMetadata([...new Set(items.map((i) => i.mint).filter(Boolean))] as string[]);

  return (
    <>
      {head}
      <div className="card pad0 mt"><div className="tbl">
        <table>
          <thead>
            <tr><th>When</th><th>Coin</th><th>Event</th><th>Wallet</th><th className="r">Amount</th><th>Transaction</th></tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.signature + n}>
                <td className="mono">
                  {i.blockTime ? new Date(i.blockTime * 1000).toISOString().replace("T", " ").slice(0, 16) : "—"}
                </td>
                <td>
                  {i.mint
                    ? <Link href={`/coin/${i.mint}`} className="coin-name">{coinLabel(i.mint, metas[i.mint])}</Link>
                    : <span className="mono">{i.escrow ? short(i.escrow, 5) : "—"}</span>}
                </td>
                <td>{LABEL[i.kind] ?? i.kind}</td>
                <td className="mono">{i.holder ? short(i.holder, 5) : "—"}</td>
                <td className="r">{i.amount ? fmtTokens(BigInt(i.amount)) : "—"}</td>
                <td className="mono">
                  <a href={net.explorerTx(i.signature)}
                     target="_blank" rel="noreferrer">{short(i.signature, 5)}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      <p className="note mt">Amounts are in the coin&apos;s own units. Times are UTC.</p>
    </>
  );
}
