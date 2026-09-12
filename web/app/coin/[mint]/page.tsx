import { PublicKey } from "@solana/web3.js";
import ClaimPanel from "@/components/ClaimPanel";
import { fetchEscrows, fetchRounds, fetchMetadata, coinLabel } from "@/lib/data";
import {
  conn, bondingCurve, decodeCurve, marketCap, fmtTokens, fmtSol, short, ata, network,
} from "@/lib/chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {sub && <div className="k" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default async function Coin({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const escrows = await fetchEscrows();
  const e = escrows.find((x) => x.mint === mint);
  const net = network();
  if (!e) return <div className="empty">No launch found for this mint on {net.name}.</div>;

  const rounds = (await fetchRounds(e.address)).sort((a, b) => b.index - a.index);
  const meta = (await fetchMetadata([mint]))[mint];
  const info = await conn().getAccountInfo(bondingCurve(new PublicKey(mint)));
  const curve = info ? decodeCurve(info.data as Buffer) : null;
  const pool = e.escrowed - e.allocated;

  let escrowHeld = 0n;
  try {
    const bal = await conn().getTokenAccountBalance(
      ata(new PublicKey(e.address), new PublicKey(mint)));
    escrowHeld = BigInt(bal.value.amount);
  } catch { /* account may not exist */ }

  return (
    <>
      <h2>{coinLabel(mint, meta)}</h2>
      <div className="card">
        <div className="mono" style={{ marginBottom: 4 }}>
          {short(mint, 6)} ·{" "}
          <a href={net.explorerAddress(mint)} target="_blank" rel="noreferrer">{mint}</a>
        </div>
        <div className="k">escrow {short(e.address, 6)} · dev {short(e.dev, 6)}</div>
      </div>

      <div className="card">
        <div className="k">How it works</div>
        <ol className="note" style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: 1.6 }}>
          <li><b>Lock.</b> At launch the dev buys the coin and {e.escrowBps / 100}% of that buy is locked in
            an escrow account owned by the program. Nobody can withdraw it, the dev included.</li>
          <li><b>Fees.</b> The escrow is the coin&apos;s creator on pump.fun, so every trade&apos;s creator fee
            lands in the escrow instead of a person&apos;s wallet.</li>
          <li><b>Buyback.</b> Anyone can turn that SOL into more of the coin. Each call spends at most 0.5% of
            the curve&apos;s reserves, so front-running it is not worth the gas. The tokens join the pool.</li>
          <li><b>Trigger.</b> When trading volume since the last airdrop reaches 1% of market cap, 1% of the pool
            is released; when market cap doubles, 5%. The release fires at a random moment inside the next
            hour, so nobody knows the distribution slot in advance.</li>
          <li><b>Draw.</b> A snapshot of holders is taken — weight is balance × time held, the dev and the
            protocol&apos;s own accounts excluded — and only its Merkle root goes on chain, together with the
            snapshot slot so anyone can rebuild it. Randomness is drawn one slot <i>later</i>, so whoever
            publishes the root cannot pick the winners.</li>
          <li><b>Claim.</b> A winner proves their leaf against the root and that the draw landed in their weight
            range; the program checks on its own that they still hold at least 0.05 SOL worth. Each draw pays
            once. Connect a wallet below to see what this coin owes you.</li>
        </ol>
      </div>

      <div className="card grid">
        <Stat k="Locked airdrop" v={`${e.escrowBps / 100}%`} sub="of the launch buy" />
        <Stat k="Dev share" v={`${100 - e.escrowBps / 100}%`} sub="never in the airdrop" />
        <Stat k="Pool remaining" v={fmtTokens(pool)} sub="not yet committed" />
        <Stat k="Escrow holds" v={fmtTokens(escrowHeld)} sub="tokens on hand" />
        <Stat k="Market cap" v={curve ? `${fmtSol(marketCap(curve))} SOL` : "—"} />
        <Stat k="Claimed so far" v={fmtTokens(e.claimed)} />
      </div>

      {e.generation >= 3 && (
        <>
          <h2>Triggers</h2>
          <div className="card grid">
            <Stat k="Next trigger" v={e.armed ? (e.armedKind === 2 ? "Milestone armed" : "Volume armed") : "Waiting"}
                  sub={e.armed ? `fires at slot ${e.fireSlot}` : "no condition met yet"} />
            <Stat k="Released, unspent" v={fmtTokens(e.pending ?? 0n)} sub="waiting for a round" />
            <Stat k="Last milestone" v={`${fmtSol(e.lastMilestoneMcap ?? 0n)} SOL`} />
            <Stat k="Buyback spent" v={`${fmtSol(e.buybackSpent ?? 0n)} SOL`}
                  sub={`bought ${fmtTokens(e.buybackTokens ?? 0n)}`} />
          </div>
        </>
      )}

      <h2>Distribution rounds</h2>
      {rounds.length === 0 ? (
        <div className="card"><div className="note">No rounds opened yet.</div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>#</th><th>Prize each</th><th>Winners</th><th>Claimed</th><th>Drawn</th><th>Root</th></tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.address}>
                  <td>{r.index}</td>
                  <td>{fmtTokens(r.prize)}</td>
                  <td>{r.winnerCount}</td>
                  <td>{r.claimedCount}</td>
                  <td>{r.drawn ? <span className="pill on">yes</span> : <span className="pill warn">not yet</span>}</td>
                  <td className="mono">{r.root.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Your share</h2>
      <ClaimPanel mint={mint} escrow={e.address} />

      <h2>Manual airdrop list</h2>
      {e.generation >= 4 && (e.manualTotal ?? 0n) > 0n ? (
        <div className="card grid">
          <Stat k="Set aside" v={fmtTokens(e.manualTotal ?? 0n)} sub={`${(e.manualBps ?? 0) / 100}% of the dev share`} />
          <Stat k="Claimed" v={`${(e.manualClaimedBps ?? 0) / 100}%`} />
          <Stat k="Locked until" v={e.manualUnlockTs
            ? new Date(Number(e.manualUnlockTs) * 1000).toISOString().slice(0, 10) : "—"} />
          <Stat k="List root" v={(e.manualRoot ?? "").slice(0, 12) + "…"} sub="fixed at launch" />
        </div>
      ) : (
        <div className="card">
          <div className="note">
            This coin has no manual airdrop list. The feature ships with the next program
            upgrade; existing coins were launched before it and cannot gain one, because the
            list is fixed at launch and never afterwards.
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 22 }}>
        <div className="k">How the dev wallet is treated</div>
        <div className="note">
          The dev wallet does not take part in the airdrop. It holds the largest balance right
          after launch, and since weight is balance multiplied by holding time, including it
          would let it win nearly every draw. It is excluded from the snapshot as treasury,
          together with the protocol&apos;s own accounts — the bonding curve, the escrow and the
          buyback PDA. The exclusion list is written into every snapshot file, so anyone
          rebuilding the tree applies exactly the same one.
        </div>
      </div>
    </>
  );
}
