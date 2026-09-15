import { Suspense } from "react";
import Link from "next/link";
import { buildRows, fetchConfig, CoinRow } from "@/lib/data";
import { fmtSol, network, Config } from "@/lib/chain";
import CoinTable, { compact } from "@/components/CoinTable";

// Rendered from chain state and re-rendered at most every 15 s: fast for
// everyone, and never more than a few blocks behind.
export const revalidate = 15;

const NET = network().name;

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="hero">
      <div>
        <div className="eyebrow">Fair launches on pump.fun</div>
        <h1>Locks the share devs promise to holders. Distributes it on-chain.</h1>
        <p className="lead">
          A launch on drop.chain puts part of the creator&apos;s own buy into a program-owned escrow
          nobody can withdraw — the dev included. Trading releases it to holders in verifiable rounds.
        </p>
        <div className="cta">
          <Link href="/launch" className="btn">Launch a coin</Link>
          <a href="#coins" className="btn ghost">See live coins</a>
        </div>
      </div>
      <Suspense fallback={<HeroArt />}>
        <HeroLive />
      </Suspense>
    </section>
  );
}

function HeroArt({ totals }: { totals?: { coins: number; locked: bigint; rounds: number; claimed: bigint } }) {
  return (
    <div className="hero-art" aria-label="what a launch locks">
      <div className="k">A typical launch</div>
      <div className="v sm">Creator buys · 30% locked for holders</div>
      <div className="split" aria-hidden="true">
        <i className="a" style={{ width: "30%" }} /><i className="c" style={{ width: "70%" }} />
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--acc)" }} />holder pool, program-owned</span>
        <span><i style={{ background: "var(--dim2)" }} />stays with the creator</span>
      </div>
      <div className="grid" style={{ marginTop: 22, gridTemplateColumns: "repeat(2,1fr)" }}>
        <div><div className="k">Volume release</div><div className="v sm">1% of pool</div><div className="sub">each time volume hits 1% of market cap</div></div>
        <div><div className="k">Milestone release</div><div className="v sm">5% of pool</div><div className="sub">each time market cap doubles</div></div>
      </div>
      <div className="grid" style={{ marginTop: 18, gridTemplateColumns: "repeat(2,1fr)", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
        <div><div className="k">On {NET} so far</div>
          <div className="v sm">{totals ? `${totals.coins} coins` : "…"}</div>
          <div className="sub">{totals ? `${compact(totals.locked)} tokens locked` : "reading the chain"}</div></div>
        <div><div className="k">Distributed</div>
          <div className="v sm">{totals ? `${totals.rounds} rounds` : "…"}</div>
          <div className="sub">{totals ? `${compact(totals.claimed)} tokens claimed` : ""}</div></div>
      </div>
    </div>
  );
}

async function HeroLive() {
  try {
    const rows = await buildRows();
    const totals = rows.reduce((t, r) => ({
      coins: t.coins + 1,
      locked: t.locked + r.escrow.escrowed + (r.escrow.manualTotal ?? 0n),
      rounds: t.rounds + r.rounds,
      claimed: t.claimed + r.escrow.claimed,
    }), { coins: 0, locked: 0n, rounds: 0, claimed: 0n });
    return <HeroArt totals={totals} />;
  } catch { return <HeroArt />; }
}

/* ------------------------------------------------------------ how it works */

function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="section-head">
        <h2>How it works</h2>
        <p>One transaction to launch. Everything after that is permissionless and reproducible.</p>
      </div>
      <div className="steps">
        <div className="step">
          <div className="n">1</div>
          <h3>Lock at launch</h3>
          <p>The creator launches on pump.fun and buys in the same transaction. The share they choose (at least 1% of supply) moves into a program-owned escrow. No key exists that can withdraw it.</p>
        </div>
        <div className="step">
          <div className="n">2</div>
          <h3>Trading releases it</h3>
          <p>When volume since the last round reaches 1% of market cap, 1% of the pool is released; when market cap doubles, 5%. The release lands at a random slot inside the next hour, so nobody can front-run it.</p>
        </div>
        <div className="step">
          <div className="n">3</div>
          <h3>Holders claim by proof</h3>
          <p>A snapshot weights every eligible wallet by balance × time held; the creator is excluded. Only the Merkle root goes on chain — anyone can rebuild it — and each holder claims their row with a proof.</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ coins */

function BetaStatus({ cfg }: { cfg: Config | null }) {
  if (!cfg || cfg.paused === undefined) return null;
  const cap = cfg.maxLockedValueLamports ?? 0n;
  const floor = cfg.minPositionLamports ?? 0n;
  return (
    <div className="flex small muted" style={{ marginBottom: 12, gap: "6px 18px" }}>
      <span className={`pill${cfg.paused ? " warn" : " on"}`}
            title={cfg.paused ? "the platform paused new launches; claims, triggers and rounds keep running" : "new launches are accepted"}>
        <span className="dot" aria-hidden="true" />launches {cfg.paused ? "paused" : "open"}
      </span>
      <span>lock cap <b className="num">{fmtSol(cap)} SOL</b> per coin</span>
      <span>eligibility floor <b className="num">{fmtSol(floor)} SOL</b> per wallet</span>
      <span>platform fee <b className="num">{cfg.platformFeeBps / 100}%</b> of the creator fee</span>
    </div>
  );
}

function CoinsSkeleton() {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <div className="muted small">Reading every escrow on {NET}…</div>
      <div className="bar thin" style={{ marginTop: 12 }}><i style={{ width: "35%" }} /></div>
    </div>
  );
}

async function Coins() {
  let rows: CoinRow[] = [];
  let cfg: Config | null = null;
  try { [rows, cfg] = await Promise.all([buildRows(), fetchConfig()]); }
  catch (e: any) {
    return <div className="card"><b>Could not reach the chain.</b><div className="note">{String(e?.message ?? e)}</div></div>;
  }
  if (!rows.length) return <><BetaStatus cfg={cfg} /><div className="empty">No coins have been launched on {NET} yet.</div></>;

  // the current program layout up front; escrows written by earlier builds lack
  // trigger state and go under a fold so they do not dilute the list
  const current = rows.filter((r) => r.escrow.generation >= 5);
  const older = rows.filter((r) => r.escrow.generation < 5);
  return (
    <>
      <BetaStatus cfg={cfg} />
      <CoinTable rows={current.length ? current : rows} />
      {current.length > 0 && older.length > 0 && (
        <details className="more">
          <summary>{older.length} earlier test launches from previous program builds</summary>
          <CoinTable rows={older} />
        </details>
      )}
      <p className="note mt">
        Every number is read live from the program on {NET}. Locked tokens sit in a program-owned account you can
        verify on the explorer from each coin&apos;s page. The platform&apos;s only revenue is a cut of pump.fun&apos;s
        creator fee; it never touches the locked pool.
      </p>
    </>
  );
}

export default function Home() {
  return (
    <>
      <div className="beta" role="note">
        <span className="pill warn">beta</span>
        <span><b>Unaudited.</b> The program is live on devnet only. Each coin may lock at most a capped value at launch and the
          platform can pause new launches; claims and distributions never pause. Source, tests and the security review are public.</span>
      </div>
      <Hero />
      <HowItWorks />
      <section className="section" id="coins">
        <div className="section-head">
          <h2>Live coins</h2>
          <p>Every launch the program has made on {NET}, newest first.</p>
        </div>
        <Suspense fallback={<CoinsSkeleton />}>
          <Coins />
        </Suspense>
      </section>
    </>
  );
}
