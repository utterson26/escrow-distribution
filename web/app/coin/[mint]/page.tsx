import type { Metadata } from "next";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import ClaimIsland from "@/components/ClaimIsland";
import McapIsland from "@/components/McapIsland";
import ShareCalculator from "@/components/ShareCalculator";
import { compact, ago } from "@/components/CoinTable";
import { fetchEscrows, fetchRounds, fetchMetadata, fetchConfig, coinLabel, manualPctOf, launchedAt } from "@/lib/data";
import {
  conn, bondingCurve, decodeCurve, marketCap, fmtTokens, fmtSol, short, ata, network,
  MAX_SHARE_BPS, CAP_MIN_HOLDERS, DEFAULT_MIN_POSITION_LAMPORTS, DECIMALS, Escrow,
} from "@/lib/chain";

// Rendered from chain state and re-rendered at most every 15 s: fast for
// everyone, and never more than a few blocks behind.
export const revalidate = 15;

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;
  try {
    const meta = (await fetchMetadata([mint]))[mint];
    return { title: meta ? `${meta.name} (${meta.symbol})` : short(mint, 6) };
  } catch { return { title: short(mint, 6) }; }
}

function Stat({ k, v, sub, sm }: { k: string; v: React.ReactNode; sub?: React.ReactNode; sm?: boolean }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className={`v${sm ? " sm" : ""}`}>{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Progress({ label, pct, detail }: { label: string; pct: number; detail: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div>
      <div className="flex between small"><span><b>{label}</b></span><span className="num muted">{p}%</span></div>
      <div className="bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <i style={{ width: `${Math.max(1, p)}%` }} />
      </div>
      <div className="sub num">{detail}</div>
    </div>
  );
}

export default async function Coin({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const net = network();
  let escrows: Escrow[];
  try { escrows = await fetchEscrows(); }
  catch (e: any) { return <div className="card mt2"><b>Could not reach the chain.</b><div className="note">{String(e?.message ?? e)}</div></div>; }
  const e = escrows.find((x) => x.mint === mint);
  if (!e) return <div className="empty mt2">No launch found for this mint on {net.name}. <Link href="/">Back to coins</Link></div>;

  const mintPk = new PublicKey(mint);
  const escrowPk = new PublicKey(e.address);
  const escrowAta = ata(escrowPk, mintPk);
  const [rounds, metas, cfg, curveInfo, slot, escrowBal] = await Promise.all([
    fetchRounds(e.address), fetchMetadata([mint]), fetchConfig(),
    conn().getAccountInfo(bondingCurve(mintPk)), conn().getSlot("confirmed"),
    conn().getTokenAccountBalance(escrowAta).catch(() => null),
  ]);
  rounds.sort((a, b) => b.index - a.index);
  const meta = metas[mint];
  const curve = curveInfo ? decodeCurve(curveInfo.data as Buffer) : null;
  const mcap = curve ? marketCap(curve) : 0n;
  const escrowHeld = escrowBal ? BigInt(escrowBal.value.amount) : 0n;
  const pool = e.escrowed - e.allocated;
  const manualPct = manualPctOf(e);
  const lockedPct = e.escrowBps / 100 + manualPct;
  const lockedTotal = e.escrowed + (e.manualTotal ?? 0n);
  const launched = launchedAt(e);
  const minPos = cfg?.minPositionLamports ?? DEFAULT_MIN_POSITION_LAMPORTS;
  const claimedPct = e.allocated > 0n ? Number((e.claimed * 1000n) / e.allocated) / 10 : 0;
  // share of the holder pool that rounds have taken so far, and what is still locked
  const releasedPct = e.escrowed > 0n ? Number((e.allocated * 1000n) / e.escrowed) / 10 : 0;
  const stillLockedPct = Math.max(0, Math.round((100 - releasedPct) * 10) / 10);

  // trigger progress
  const target = (e.lastMilestoneMcap ?? 0n) * 2n;
  const msPct = target > 0n ? Number((mcap * 1000n) / target) / 10 : 0;
  const volNeeded = mcap / 100n;
  const volSince = (e.cumVolume ?? 0n) - (e.volumeAtLastDist ?? 0n);
  const volPct = volNeeded > 0n ? Number((volSince * 1000n) / volNeeded) / 10 : 0;
  const armedIn = e.armed ? Math.max(0, Number(e.fireSlot ?? 0n) - slot) * 0.4 : 0;

  // calculator inputs: wallets that can take part hold what is neither on the curve nor in program accounts
  const manualLeft = e.manualTotal ? (e.manualTotal * BigInt(10000 - (e.manualClaimedBps ?? 0))) / 10000n : 0n;
  const circulating = curve ? curve.tokenTotalSupply - curve.realTokenReserves - escrowHeld - manualLeft : 0n;
  const priceSol = curve ? Number(curve.virtualQuoteReserves) / Number(curve.virtualTokenReserves) / 1e9 * 10 ** DECIMALS : 0;
  const toNum = (v: bigint) => Number(v) / 10 ** DECIMALS;

  return (
    <>
      <div className="flex between mt2" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="flex" style={{ gap: 10 }}>
            <h1 style={{ fontSize: "clamp(24px,3.5vw,34px)" }}>{coinLabel(mint, meta)}</h1>
            {e.isHolderReward && <span className="pill">holder-rewards</span>}
            {e.dead && <span className="pill bad">flagged dead</span>}
            {e.armed && <span className="pill on"><span className="dot" aria-hidden="true" />release armed</span>}
          </div>
          <div className="small muted mt" style={{ marginTop: 8 }}>
            <span className="mono">{mint}</span>
            {launched && <> · launched {ago(launched.toISOString())}</>}
            {" "}· creator <span className="mono">{short(e.dev, 6)}</span>
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <a className="btn ghost sm" href={net.explorerAddress(mint)} target="_blank" rel="noreferrer">Mint ↗</a>
          <a className="btn ghost sm" href={net.explorerAddress(escrowAta.toBase58())} target="_blank" rel="noreferrer">Locked tokens ↗</a>
          <a className="btn ghost sm" href={net.explorerAddress(e.address)} target="_blank" rel="noreferrer">Escrow ↗</a>
          {net.name !== "localnet" && <a className="btn ghost sm" href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">pump.fun ↗</a>}
        </div>
      </div>

      <div className="card mt2">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
          <Stat k="Locked at launch" v={`${compact(lockedTotal)}`}
                sub={<><b>{lockedPct}%</b> of the creator&apos;s buy{manualPct ? ` · holders ${e.escrowBps / 100}% + list ${manualPct}%` : ""}</>} />
          <Stat k="Pool remaining" v={compact(pool)} sub={`${fmtTokens(pool)} tokens not yet released`} />
          <Stat k="Escrow holds" v={compact(escrowHeld)} sub="verifiable on the explorer" />
          <Stat k="Released" v={compact(e.allocated)} sub={`${claimedPct}% claimed · ${rounds.length} round${rounds.length === 1 ? "" : "s"}`} />
          <Stat k="Market cap" v={curve ? `${fmtSol(mcap)} SOL` : "—"} sub={curve?.complete ? "curve complete" : "on the bonding curve"} />
          <Stat k="Creator kept" v={`${100 - lockedPct}%`} sub="never takes part in a round" />
        </div>
        <div className="split" style={{ marginTop: 18 }} aria-hidden="true">
          <i className="a" style={{ width: `${e.escrowBps / 100}%` }} />
          {manualPct > 0 && <i className="b" style={{ width: `${manualPct}%` }} />}
          <i className="c" style={{ width: `${100 - lockedPct}%` }} />
        </div>
        <div className="flex between mt" style={{ gap: "6px 16px" }}>
          <span className="small">
            Released so far <b className="num">{releasedPct}%</b> · Still locked <b className="num">{stillLockedPct}%</b> · <b className="num">{rounds.length}</b> round{rounds.length === 1 ? "" : "s"}
          </span>
          <span className="tiny muted">of the holder pool locked at launch</span>
        </div>
        <div className="legend">
          <span><i style={{ background: "var(--acc)" }} />holder pool {e.escrowBps / 100}%</span>
          {manualPct > 0 && <span><i style={{ background: "var(--acc2)", opacity: .55 }} />fixed list {manualPct}%</span>}
          <span><i style={{ background: "var(--dim2)" }} />creator {100 - lockedPct}%</span>
        </div>
      </div>

      <div className="mt"><McapIsland mint={mint} /></div>

      {e.generation >= 3 && (
        <section className="section">
          <div className="section-head"><h2>Next release</h2><p>Two independent triggers; either one opens a round.</p></div>
          <div className="card">
            {e.armed ? (
              <div className="alert ok" role="status">
                The {e.armedKind === 2 ? "milestone" : "volume"} trigger fired. The release lands at slot {e.fireSlot?.toString()}
                {armedIn > 0 ? ` — about ${armedIn < 60 ? `${Math.round(armedIn)}s` : `${Math.round(armedIn / 60)} min`} from now` : " — due now"}; anyone can call it in.
              </div>
            ) : (
              <div className="row2">
                <Progress label="Milestone · market cap doubles" pct={msPct}
                          detail={target > 0n ? `${fmtSol(mcap)} of ${fmtSol(target)} SOL · releases 5% of the pool` : "baseline not recorded yet"} />
                <Progress label="Volume · 1% of market cap traded" pct={volPct}
                          detail={volNeeded > 0n ? `${fmtSol(volSince)} of ${fmtSol(volNeeded)} SOL since the last round · releases 1%` : "no market cap yet"} />
              </div>
            )}
            <div className="grid mt2" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <Stat sm k="Released, unspent" v={compact(e.pending ?? 0n)} sub="waiting for a publisher to open the round" />
              <Stat sm k="Last milestone" v={`${fmtSol(e.lastMilestoneMcap ?? 0n)} SOL`} sub="next fires at 2×" />
              {!e.isHolderReward && <Stat sm k="Buyback" v={`${fmtSol(e.buybackSpent ?? 0n)} SOL`} sub={`→ ${compact(e.buybackTokens ?? 0n)} tokens added to the pool`} />}
              <Stat sm k="Creator fee" v={e.isHolderReward ? "on pump" : e.feeSharingSet ? `${100 - (e.platformFeeBps ?? 0) / 100} / ${(e.platformFeeBps ?? 0) / 100}` : "pending"}
                    sub={e.isHolderReward ? "pump pays it to its own holder pool" : e.feeSharingSet ? "escrow / platform split, fixed on pump" : "split is set on the crank's next pass"} />
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Distribution rounds</h2><p>Each round is a Merkle root, a snapshot slot and an amount — enough for anyone to rebuild it.</p></div>
        {rounds.length === 0 ? (
          <div className="empty">No rounds opened yet. The first one follows the first trigger.</div>
        ) : (
          <div className="card pad0"><div className="tbl">
            <table>
              <thead><tr><th>#</th><th className="r">Released</th><th className="r">Distributed</th><th className="r">Holders</th><th className="r">Claimed</th><th className="r">Snapshot slot</th><th>Root</th></tr></thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.address}>
                    <td><a href={net.explorerAddress(r.address)} target="_blank" rel="noreferrer">#{r.index}</a></td>
                    <td className="r">{fmtTokens(r.released)}</td>
                    <td className="r">{fmtTokens(r.total)}</td>
                    <td className="r">{r.holderCount}</td>
                    <td className="r">
                      {r.claimedCount}/{r.holderCount}
                      <div className="bar thin" style={{ width: 80, marginLeft: "auto" }} aria-hidden="true">
                        <i style={{ width: `${r.holderCount ? (r.claimedCount / r.holderCount) * 100 : 0}%` }} />
                      </div>
                    </td>
                    <td className="r">{r.snapshotSlot.toString()}</td>
                    <td className="mono" title={r.root}>{r.root.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>Your share</h2><p>Connect a wallet to check every round for a claim; estimate the next one below.</p></div>
        <ClaimIsland mint={mint} escrow={e.address} cluster={net.name} />
        <div className="mt">
          <ShareCalculator c={{
            poolRemaining: toNum(pool), circulating: Math.max(0, toNum(circulating)), priceSol,
            minPositionSol: Number(minPos) / 1e9, capPct: MAX_SHARE_BPS / 100, capMinHolders: CAP_MIN_HOLDERS,
            symbol: meta?.symbol ?? "tokens",
          }} />
        </div>
      </section>

      {e.generation >= 4 && (e.manualTotal ?? 0n) > 0n && (
        <section className="section">
          <div className="section-head"><h2>Fixed wallet list</h2><p>Committed at launch as a Merkle root; claimed by proof, never editable.</p></div>
          <div className="card grid">
            <Stat k="Set aside" v={compact(e.manualTotal ?? 0n)} sub={`${(e.manualBps ?? 0) / 100}% of the ${e.generation >= 5 ? "launch buy" : "creator share (older layout)"}`} />
            <Stat k="Claimed" v={`${(e.manualClaimedBps ?? 0) / 100}%`} sub="of the list" />
            <Stat k="Locked until" v={e.manualUnlockTs ? new Date(Number(e.manualUnlockTs) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"} sub="unclaimed shares are untouchable before this" />
            <Stat k="List root" v={<span className="mono" style={{ fontSize: 14 }}>{(e.manualRoot ?? "").slice(0, 16)}…</span>} />
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Rules for this coin</h2></div>
        <div className="card faq" style={{ paddingBlock: 4 }}>
          <details>
            <summary>How the lock works</summary>
            <div className="a">At launch the creator bought {compact(e.bought)} tokens and {lockedPct}% of that buy was moved by the program into an
              escrow account it alone controls{manualPct ? ` (${e.escrowBps / 100}% as the holder pool, ${manualPct}% for a fixed wallet list)` : ""}.
              A lock must be at least 1% of total supply. There is no instruction that returns it to the creator.</div>
          </details>
          <details>
            <summary>Where the creator fee goes</summary>
            <div className="a">{e.isHolderReward
              ? "This is a pump.fun holder-rewards coin: pump pays the creator fee into its own holder pool, so there is no fee sweep and no buyback here — only the locked supply and its triggered rounds."
              : `The coin's creator on pump.fun is a program-owned account. pump's fee-sharing config splits every trade's creator fee ${e.feeSharingSet ? `${100 - (e.platformFeeBps ?? 0) / 100}% to the escrow and ${(e.platformFeeBps ?? 0) / 100}% to the platform` : "between the escrow and the platform"}. Anyone can turn the escrow's SOL into more of the coin (at most 0.5% of the curve's reserves per call, so sandwiching it is not worth the gas); the tokens join the pool.`}</div>
          </details>
          <details>
            <summary>How a round is split</summary>
            <div className="a">A snapshot at the release slot weights every eligible wallet by balance × time held. From {CAP_MIN_HOLDERS} holders on, no wallet takes more than {MAX_SHARE_BPS / 100}% of a round; the excess goes to the others and what cannot be placed stays in the pool. Positions worth less than {fmtSol(minPos)} SOL are skipped. Only the Merkle root, the snapshot slot and the released amount go on chain, so anyone can rebuild the allocation and check the root.</div>
          </details>
          <details>
            <summary>Why the creator wallet is excluded</summary>
            <div className="a">It holds the largest balance right after launch, and weight is balance × time, so including it would let it take most of every round. It is treated as treasury, together with the program&apos;s own accounts — the bonding curve, the escrow, the buyback and fixed-list accounts. The exclusion list is written into every snapshot, so anyone rebuilding it applies exactly the same one.</div>
          </details>
          <details>
            <summary>Claiming</summary>
            <div className="a">A holder proves their row against the round&apos;s root. The program checks the amount respects the cap and that the wallet still holds what the snapshot credited it. One claim per wallet per round; a second attempt is rejected on chain.</div>
          </details>
        </div>
      </section>
    </>
  );
}
