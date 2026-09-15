"use client";
import dynamic from "next/dynamic";

/** Recharts is loaded after the page has painted; the placeholder keeps the layout stable. */
const Chart = dynamic(() => import("./McapChart"), {
  ssr: false,
  loading: () => (
    <div className="card" aria-busy="true" style={{ minHeight: 318 }}>
      <h3>Market cap</h3><div className="sub">loading the chart…</div>
    </div>
  ),
});
export default function McapIsland({ mint }: { mint: string }) { return <Chart mint={mint} />; }
