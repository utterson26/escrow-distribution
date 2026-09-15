"use client";
import dynamic from "next/dynamic";

/** Wallet adapter + claim panel, loaded after the page has painted. */
const Inner = dynamic(() => import("./ClaimInner"), {
  ssr: false,
  loading: () => (
    <div className="card flex between" aria-busy="true">
      <div><h3>Check your claims</h3><p className="note">Connect a wallet to see what every round of this coin has set aside for you.</p></div>
      <span className="btn ghost" aria-hidden="true">Connect wallet</span>
    </div>
  ),
});
export default function ClaimIsland(props: { mint: string; escrow: string; cluster: string }) { return <Inner {...props} />; }
