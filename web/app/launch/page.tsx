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
          Choose how much of your own launch buy goes to holders. The program moves it into escrow in the same transaction
          that creates the coin, and trading releases it in rounds anyone can verify. Read the <Link href="/docs">docs</Link> first if
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
