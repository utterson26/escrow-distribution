"use client";
import dynamic from "next/dynamic";

/** Wallet adapter + launch form, loaded after the page has painted. */
const Inner = dynamic(() => import("./LaunchInner"), {
  ssr: false,
  loading: () => (
    <div className="form-grid" aria-busy="true" aria-live="polite">
      <div className="card" style={{ minHeight: 640 }}>
        <h2 className="h3">Coin</h2>
        <p className="note mt">Loading the launch form…</p>
        <div className="bar thin"><i style={{ width: "30%" }} /></div>
      </div>
      <div className="card" style={{ minHeight: 320 }}><h3>Your coin</h3></div>
    </div>
  ),
});
export default function LaunchIsland() { return <Inner />; }
