import type { Metadata } from "next";
import Link from "next/link";
import LaunchIsland from "@/components/LaunchIsland";
import { network } from "@/lib/chain";

export const metadata: Metadata = { title: "Launch" };

export default function Launch() {
  const net = network().name;
  return (
    <>
      <div className="section-head mt2" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <div className="eyebrow">Launch</div>
        <h1 style={{ fontSize: "clamp(26px,3.5vw,36px)" }}>Lock what you promise. Then launch.</h1>
        <p style={{ maxWidth: 680 }}>
          Choose what share of the supply is locked for holders and how it is released — by the program&apos;s rule (Auto) or
          on your call (Manual). You buy that share in the transaction that creates the coin; the program moves it into escrow the same
          instant, and every release is a round anyone can verify. Read the <Link href="/docs">docs</Link> first if
          this is your first launch.
        </p>
      </div>
      <div className="beta mt" role="note" style={{ marginBottom: 20 }}>
        <span className="pill warn">beta</span>
        <span>Unaudited program on Solana <b>{net}</b>. Launch with a devnet wallet and devnet SOL; the lock cap and the pause switch are
          platform brakes that apply while the program earns trust.</span>
      </div>
      <LaunchIsland />
    </>
  );
}
