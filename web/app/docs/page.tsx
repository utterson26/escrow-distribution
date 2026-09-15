import type { Metadata } from "next";
import Link from "next/link";
import { fetchConfig } from "@/lib/data";
import { fmtSol, network, PROGRAM_ID, MAX_SHARE_BPS, CAP_MIN_HOLDERS, MIN_LOCK_SUPPLY_BPS, DEFAULT_MIN_POSITION_LAMPORTS, DEFAULT_MAX_LOCKED_VALUE_LAMPORTS } from "@/lib/chain";

export const metadata: Metadata = { title: "Docs" };
export const revalidate = 15;

const REPO = "https://github.com/utterson26/escrow-distribution";

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <div className="a">{children}</div>
    </details>
  );
}

export default async function Docs() {
  const net = network();
  let cfg = null;
  try { cfg = await fetchConfig(); } catch { /* the constants below still apply */ }
  const minPos = fmtSol(cfg?.minPositionLamports ?? DEFAULT_MIN_POSITION_LAMPORTS);
  const cap = fmtSol(cfg?.maxLockedValueLamports ?? DEFAULT_MAX_LOCKED_VALUE_LAMPORTS);
  const fee = (cfg?.platformFeeBps ?? 1000) / 100;

  return (
    <>
      <div className="section-head mt2" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <div className="eyebrow">Docs</div>
        <h1 style={{ fontSize: "clamp(26px,3.5vw,36px)" }}>How it works, in detail</h1>
        <p style={{ maxWidth: 680 }}>
          Everything below is enforced by the on-chain program, not by this site. The live figures come from the program&apos;s
          config on {net.name}; the rest are program constants. Source, tests and the security review are in the{" "}
          <a href={REPO} target="_blank" rel="noreferrer">repository</a>.
        </p>
      </div>

      <div className="grid mt2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <div className="card"><div className="k">Min position</div><div className="v">{minPos} SOL</div><div className="sub">to take part in a round</div></div>
        <div className="card"><div className="k">Cap per wallet</div><div className="v">{MAX_SHARE_BPS / 100}%</div><div className="sub">of a round, from {CAP_MIN_HOLDERS} holders</div></div>
        <div className="card"><div className="k">Min lock</div><div className="v">{MIN_LOCK_SUPPLY_BPS / 100}%</div><div className="sub">of total supply</div></div>
        <div className="card"><div className="k">Lock cap (beta)</div><div className="v">{cap} SOL</div><div className="sub">value per coin at launch</div></div>
        <div className="card"><div className="k">Creator fee split</div><div className="v">{100 - fee} / {fee}</div><div className="sub">escrow / platform</div></div>
      </div>

      <section className="section">
        <h2>Launching</h2>
        <div className="card faq mt" style={{ paddingBlock: 4 }}>
          <Q q="What exactly gets locked, and why are the percentages shares of supply?">
            <p>Part of the creator&apos;s own launch buy. pump.fun mints a fixed 1B tokens; on the launch form you choose the holder pool,
              the optional fixed list and what you keep as shares of that supply (say 30% + 0% + 2%), and the form prices the buy of
              exactly that much — 32% of supply — by integrating along pump&apos;s constant-product curve (vSol × amount / (vTok − amount),
              plus pump&apos;s 1.25% fees), not by multiplying the launch price by the amount: 320M tokens cost 0.43 SOL on devnet, where the
              curve starts at 1 SOL virtual, and about 12.9 SOL on mainnet, where it starts at 30. The <code>launch</code> instruction creates the coin, makes that buy and, in the
              same transaction, moves the pool and the list into an escrow account owned by the program. Nothing is minted for the escrow
              separately — what holders get is what you bought and gave up.</p>
            <p>Shares of supply are the honest unit: &quot;30% of the buy&quot; says nothing until you know the buy, while &quot;30% of supply&quot; is a
              promise anyone can check against the escrow&apos;s balance. On chain the program stores the split as basis points of the buy; the site
              converts back and forth. The pool plus the list must be at least {MIN_LOCK_SUPPLY_BPS / 100}% of total supply.</p>
          </Q>
          <Q q="Auto or Manual — what is the difference?">
            <p><b>Auto</b>: the program releases the pool on its own — 1% of what remains each time trading volume reaches 1% of market cap, 5% each
              time market cap doubles — at a random moment inside the delay window. The creator has no trigger, no pause and no veto;
              <code>dev_distribute</code> is refused on an Auto coin.</p>
            <p><b>Manual</b>: the automatic rule is off. The creator releases with <code>dev_distribute(amount)</code> — any amount up to the whole
              pool, immediately, no delay — and nothing else releases. Holders trust the creator&apos;s timing, not their honesty: the pool can never
              come back to the creator in either mode.</p>
            <p>Both modes hand every release to the same engine — snapshot at the release, pro-rata by balance × time held, the eligibility floor,
              the per-wallet cap, the creator and the fixed list excluded, Merkle claims. The mode is chosen at launch and no instruction changes
              it; the coin page shows it as a badge and each round records what released it.</p>
            <p><b>Fixed wallet list:</b> the launch form offers it on Manual launches only. An Auto coin locks everything for the holder pool, so
              its lock is exactly what the rule releases to holders; a Manual creator, who already controls the timing, may also commit a list of
              wallets and percentages (team, partners) at launch — claimable by proof, locked 30 days, never editable. (The program itself accepts
              a list in either mode; the restriction is the site&apos;s.)</p>
          </Q>
          <Q q="Can the creator get the locked tokens back?">
            <p>No. The escrow is a program-derived account; no private key exists for it, and the program has no instruction that returns
              pool tokens to the creator. The only administrative path is <code>intervene</code>, which the platform can call for a coin
              that has been flagged dead (seven consecutive days trading under 0.1% of market cap) or for a fixed-list slice nobody claimed
              within 30 days — and even then the source, target and amount are logged on chain.</p>
          </Q>
          <Q q="Why is there a lock cap, and why can launches be paused?">
            <p>Both are beta brakes. The program is not audited, so the value one coin may lock at the launch price is capped
              (currently {cap} SOL), and the platform can stop accepting new launches. Neither affects existing coins: claims, triggers and
              rounds never pause. Raising the cap goes through a proposal that takes effect seven days later, so it cannot be changed quietly.</p>
          </Q>
          <Q q="Can I set my own milestone table?">
            <p>Not in this version. Auto coins follow one rule for everyone (5% of the remaining pool per market-cap doubling, 1% per volume trigger);
              a creator who wants a specific schedule launches in Manual mode and releases on that schedule by hand. Per-coin milestone tables are a
              v2 roadmap item.</p>
          </Q>
        </div>
      </section>

      <section className="section">
        <h2>Releases and rounds</h2>
        <div className="card faq mt" style={{ paddingBlock: 4 }}>
          <Q q="What triggers a release?">
            <p>On an Auto coin, two conditions, checked by anyone who calls <code>check_trigger</code> (a keeper does it regularly); on a Manual
              coin only the creator&apos;s <code>dev_distribute</code>, see above.</p>
            <p><b>Volume</b> — trading volume since the last round reaches 1% of market cap: 1% of the remaining pool is released.<br />
              <b>Milestone</b> — market cap reaches twice the last milestone: 5% of the remaining pool is released.</p>
            <p>A release does not land immediately. It is armed for a random slot inside the next hour, chosen from the slot hashes at arming time,
              so nobody can buy just before the snapshot and sell just after.</p>
          </Q>
          <Q q="How is a round split between holders?">
            <p>At the release slot a snapshot weights every eligible wallet by <b>balance × time held</b>. The release is split pro rata over those
              weights. From {CAP_MIN_HOLDERS} eligible holders on, no single wallet may take more than {MAX_SHARE_BPS / 100}% of a round: the excess is
              redistributed to the others, and whatever cannot be placed stays in the pool for the next round.</p>
            <p>Only the Merkle root of the (wallet, amount) rows, the snapshot slot and the released amount are written on chain. Anyone can
              rebuild the snapshot from public chain history and check that the root matches — this site does exactly that before it offers a claim.</p>
          </Q>
          <Q q="What is the minimum position?">
            <p>A wallet takes part in a round only if its position is worth at least {minPos} SOL at the snapshot, priced off the bonding curve.
              The floor keeps rounds from being sliced into dust across thousands of empty wallets. It is fixed in SOL because a dollar
              figure would need a price feed; changes go through a seven-day proposal and every round keeps the floor it was built with.</p>
          </Q>
          <Q q="Who is excluded from a round?">
            <p>The creator wallet, always — it holds the largest balance right after launch and would otherwise take most of every round.
              Also the program&apos;s own accounts: the bonding curve, the escrow, the buyback and fixed-list accounts. The exclusion list is
              written into every snapshot so a rebuild applies exactly the same one.</p>
          </Q>
          <Q q="What happens if the coin never reaches a milestone?">
            <p>On an Auto coin the volume trigger still runs: every time trading since the last round adds up to 1% of market cap, 1% of the
              remaining pool goes out. A coin with steady trading keeps paying holders without ever doubling. On a Manual coin milestones play no
              part at all; the creator decides.</p>
            <p>If trading stops entirely, nothing is released — the pool simply waits. After seven consecutive days under 0.1% of market cap
              in volume the coin is flagged dead; the platform may then move the remaining pool back to the creator, on chain and logged,
              rather than leave it stranded forever. Until that flag, nobody can touch it.</p>
          </Q>
        </div>
      </section>

      <section className="section">
        <h2>Claiming</h2>
        <div className="card faq mt" style={{ paddingBlock: 4 }}>
          <Q q="How do I claim?">
            <p>Open the coin&apos;s page and connect your wallet. The site rebuilds each round&apos;s allocation from chain history, checks it
              against the root on chain, and shows every round with a share for you. <b>Claim</b> sends a single transaction with your Merkle
              proof; the program verifies the proof, the cap, and that you still hold what the snapshot credited you.</p>
          </Q>
          <Q q="I sold after the snapshot. Can I still claim?">
            <p>No. A claim requires the wallet to still hold at least the balance the snapshot recorded. Selling after the snapshot forfeits
              that round&apos;s share; it stays in the pool.</p>
          </Q>
          <Q q="Is there a deadline?">
            <p>No. Rounds do not expire, and a claim is one transaction per wallet per round. A second attempt for the same round is rejected on chain.</p>
          </Q>
          <Q q="What about the fixed wallet list?">
            <p>Wallets on a list committed at launch claim by proof against the list&apos;s root, in the same way. The creator publishes the
              rows on chain right after launch so anyone can recompute the root. List shares are locked for 30 days; after that, any
              share still unclaimed can be moved by the platform to the creator or into the holder pool.</p>
          </Q>
        </div>
      </section>

      <section className="section">
        <h2>Fees</h2>
        <div className="card faq mt" style={{ paddingBlock: 4 }}>
          <Q q="What does the platform earn?">
            <p>A cut of pump.fun&apos;s creator fee, and nothing else. The coin&apos;s creator on pump is a program-owned account; pump&apos;s
              fee-sharing config splits every trade&apos;s creator fee <b>{100 - fee}% to the escrow, {fee}% to the platform</b> (the program&apos;s default is 90 / 10; the figure here is the live rate on {net.name}). The split is written
              into the coin&apos;s pump config once and cannot be changed afterwards. The platform never takes from the locked pool, and a change to
              the rate for future launches takes effect seven days after it is proposed.</p>
          </Q>
          <Q q="What happens to the escrow's share of the fee?">
            <p>It is swept into the escrow as SOL, and anyone can call <code>buyback</code> to turn it into more of the coin. Each call spends at
              most 0.5% of the curve&apos;s reserves, so sandwiching it is not worth the gas. The tokens bought join the holder pool.</p>
          </Q>
          <Q q="What about pump.fun holder-rewards coins?">
            <p>A coin launched as a pump holder-rewards coin keeps its creator fee on pump, which pays it to pump&apos;s own holder pool. There is
              no fee sweep and no buyback for such a coin here — only the locked supply and its triggered rounds.</p>
          </Q>
          <Q q="What does a launch cost?">
            <p>Your buy, plus about 0.03 SOL in rent for the escrow, its token accounts, the lookup table and pump&apos;s own accounts. Claims cost
              a normal transaction fee plus the rent of a small receipt account.</p>
          </Q>
        </div>
      </section>

      <section className="section">
        <h2>Verifying</h2>
        <div className="card">
          <p className="note">
            Program <a href={net.explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer" className="mono">{PROGRAM_ID.toBase58()}</a> on {net.name}.
            Every coin page links its escrow&apos;s token account on the explorer, so the locked balance can be checked without trusting this site.
            The snapshot and allocation code that rebuilds a round lives in the repository under <code>indexer/</code>; the program&apos;s tests and the
            security review are alongside it. <Link href="/">Back to the coins</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
