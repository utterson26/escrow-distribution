import { fetchFeed, fetchMetadata, coinLabel } from "@/lib/data";
import { fmtTokens, short, network } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  if (error) return <div className="card"><b>Could not reach the chain.</b><div className="note">{error}</div></div>;
  if (!items.length) return <div className="empty">Nothing yet.</div>;
  const net = network();
  const metas = await fetchMetadata([...new Set(items.map((i) => i.mint).filter(Boolean))] as string[]);

  return (
    <>
      <h2>Recent airdrops</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>When</th><th>Coin</th><th>Event</th><th>Wallet</th><th>Amount</th><th>Transaction</th></tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.signature + n}>
                <td className="mono">
                  {i.blockTime ? new Date(i.blockTime * 1000).toISOString().replace("T", " ").slice(0, 16) : "—"}
                </td>
                <td>
                  {i.mint
                    ? <a href={`/coin/${i.mint}`}>{coinLabel(i.mint, metas[i.mint])}</a>
                    : <span className="mono">{i.escrow ? short(i.escrow, 5) : "—"}</span>}
                </td>
                <td>{LABEL[i.kind] ?? i.kind}</td>
                <td className="mono">{i.holder ? short(i.holder, 5) : "—"}</td>
                <td>{i.amount ? fmtTokens(BigInt(i.amount)) : "—"}</td>
                <td className="mono">
                  <a href={net.explorerTx(i.signature)}
                     target="_blank" rel="noreferrer">{short(i.signature, 5)}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">Decoded from the program&apos;s own event logs on {net.name}.</div>
    </>
  );
}
