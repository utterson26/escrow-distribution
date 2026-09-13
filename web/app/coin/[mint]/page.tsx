import { PublicKey } from "@solana/web3.js";
import ClaimPanel from "@/components/ClaimPanel";
import { fetchEscrows, fetchRounds, fetchMetadata, coinLabel, manualPctOf } from "@/lib/data";
import {
  conn, bondingCurve, decodeCurve, marketCap, fmtTokens, fmtSol, short, ata, network, MAX_SHARE_BPS, CAP_MIN_HOLDERS,
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
        <div className="k">
          escrow <a href={net.explorerAddress(e.address)} target="_blank" rel="noreferrer" className="mono">{e.address}</a>
          {" "}· <a href={net.explorerAddress(ata(new PublicKey(e.address), new PublicKey(mint)).toBase58())} target="_blank" rel="noreferrer">verify the locked tokens on the explorer</a>
          {" "}· creator wallet {short(e.dev, 6)}
        </div>
      </div>

      <div className="card">
        <div className="k">How it works</div>
        <ol className="note" style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: 1.6 }}>
          <li><b>Lock.</b> At launch the dev buys the coin and {e.escrowBps / 100 + manualPctOf(e)}% of that buy is
            locked by the program: {e.escrowBps / 100}% as the holder pool{manualPctOf(e) ? ` and ${manualPctOf(e)}% for a fixed wallet list committed at launch` : ""}.
            The lock must be at least 1% of total supply. Nobody can withdraw it, the dev included.</li>
          <li><b>Fees.</b> The coin&apos;s creator on pump.fun is a program-owned account, and pump&apos;s
            fee-sharing config splits every trade&apos;s creator fee {e.feeSharingSet ? `${100 - (e.platformFeeBps ?? 0) / 100}% to the escrow, ${(e.platformFeeBps ?? 0) / 100}% to the platform` : "between the escrow and the platform"}.
            The platform never takes from the locked pool. (A holder-rewards coin keeps its creator fee on pump
            for pump&apos;s own holder pool instead.)</li>
          <li><b>Buyback.</b> Anyone can turn that SOL into more of the coin. Each call spends at most 0.5% of
            the curve&apos;s reserves, so front-running it is not worth the gas. The tokens join the pool.</li>
          <li><b>Trigger.</b> When trading volume since the last distribution reaches 1% of market cap, 1% of the pool
            is released; when market cap doubles, 5%. The release fires at a random moment inside the next
            hour, so nobody knows the distribution slot in advance.</li>
          <li><b>Split.</b> A snapshot of holders is taken — weight is balance × time held, the dev and the
            protocol&apos;s own accounts excluded — and the release is split pro rata over all of them; from
            {CAP_MIN_HOLDERS} holders on no wallet takes more than {MAX_SHARE_BPS / 100}% of a round (the excess goes
            to the others, and what cannot be placed stays in the pool). Only the
            Merkle root of the (wallet, amount) rows goes on chain, with the snapshot slot and the release, so
            anyone can rebuild it. Nothing is random.</li>
          <li><b>Claim.</b> A holder proves their row against the root; the program checks on its own that the
            amount respects the cap and that they still hold what the snapshot credited them, worth at least
            0.1 SOL (about $20). One claim per wallet per round. Connect a wallet below to see what this coin has set aside for you.</li>
        </ol>
      </div>

      {e.isHolderReward && (
        <div className="card">
          <div className="k">Holder-rewards coin</div>
          <div className="note">
            Trading rewards for this coin are paid out by pump.fun itself: every trade&apos;s creator fee goes to
            pump&apos;s holder pool, not to this escrow, so there is no fee sweep and no buyback here — only the
            locked supply and its triggered distributions. See the coin on{" "}
            <a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">pump.fun</a>.
          </div>
        </div>
      )}

      <div className="card grid">
        <Stat k="Locked" v={`${e.escrowBps / 100 + manualPctOf(e)}%`}
              sub={`of the launch buy: holders ${e.escrowBps / 100}%${manualPctOf(e) ? ` + fixed list ${manualPctOf(e)}%` : ""} · min 1% of supply`} />
        <Stat k="Dev share" v={`${100 - e.escrowBps / 100 - manualPctOf(e)}%`} sub="never in a distribution" />
        <Stat k="Cap per wallet" v={`${MAX_SHARE_BPS / 100}%`} sub={`of a round, from ${CAP_MIN_HOLDERS} eligible holders on`} />
        <Stat k="Coin type" v={e.isHolderReward ? "holder-rewards" : "regular"}
              sub={e.isHolderReward ? "pump pays the creator fee to its holder pool; no sweep, no buyback here"
                                    : "creator fee → escrow (minus the platform cut)"} />
        <Stat k="Platform fee" v={e.isHolderReward ? "—" : e.feeSharingSet ? `${(e.platformFeeBps ?? 0) / 100}%` : "not set up"}
              sub={e.isHolderReward ? "not applicable" : e.feeSharingSet
                ? "of the creator fee, fixed in this coin's pump fee-sharing config; never from the locked pool"
                : "the crank sets the escrow / platform split on its next pass"} />
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
            <thead><tr><th>#</th><th>Released</th><th>Distributed</th><th>Holders</th><th>Claimed</th><th>Snapshot slot</th><th>Root</th></tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.address}>
                  <td>{r.index}</td>
                  <td>{fmtTokens(r.released)}</td>
                  <td>{fmtTokens(r.total)}</td>
                  <td>{r.holderCount}</td>
                  <td>{r.claimedCount}/{r.holderCount} · {fmtTokens(r.claimedAmount)}</td>
                  <td>{r.snapshotSlot.toString()}</td>
                  <td className="mono">{r.root.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Your share</h2>
      <ClaimPanel mint={mint} escrow={e.address} />

      <h2>Fixed wallet list</h2>
      {e.generation >= 4 && (e.manualTotal ?? 0n) > 0n ? (
        <div className="card grid">
          <Stat k="Set aside" v={fmtTokens(e.manualTotal ?? 0n)} sub={e.generation >= 5 ? `${(e.manualBps ?? 0) / 100}% of the launch buy` : `${(e.manualBps ?? 0) / 100}% of the dev share (older layout)`} />
          <Stat k="Claimed" v={`${(e.manualClaimedBps ?? 0) / 100}%`} />
          <Stat k="Locked until" v={e.manualUnlockTs
            ? new Date(Number(e.manualUnlockTs) * 1000).toISOString().slice(0, 10) : "—"} />
          <Stat k="List root" v={(e.manualRoot ?? "").slice(0, 12) + "…"} sub="fixed at launch" />
        </div>
      ) : (
        <div className="card">
          <div className="note">
            This coin has no fixed wallet list: its whole lock is the holder pool. A list can
            only be committed at launch (wallets + percentages, published on chain, claimed by
            proof) and never afterwards.
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 22 }}>
        <div className="k">How the creator wallet is treated</div>
        <div className="note">
          The creator wallet never takes part in a distribution. It holds the largest balance
          right after launch, and since weight is balance multiplied by holding time, including
          it would let it take most of every round. It is excluded from the snapshot as treasury,
          together with the protocol&apos;s own accounts — the bonding curve, the escrow, the
          buyback and fixed-list accounts. The exclusion list is written into every snapshot
          file, so anyone rebuilding the allocation applies exactly the same one.
        </div>
      </div>
    </>
  );
}
