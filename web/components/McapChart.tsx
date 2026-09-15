"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import type { McapPoint } from "@/app/api/mcap/[mint]/route";

const POLL_MS = 10_000;

const cssVar = (name: string, fallback: string) =>
  typeof window === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const ago = (t: number) => { const s = Math.max(0, Math.round(Date.now() / 1000 - t)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

/** Market cap over time, one point per trade on the coin's bonding curve; polls every 10 s. */
export default function McapChart({ mint }: { mint: string }) {
  const [points, setPoints] = useState<McapPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () => fetch(`/api/mcap/${mint}`).then((r) => r.json()).then((j) => {
      if (stop) return;
      if (j.points) setPoints(j.points);
      setError(j.error ?? null);
    }).catch((e) => !stop && setError(String(e)));
    load();
    const id = setInterval(() => { load(); setTick((n) => n + 1); }, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [mint]);

  const colors = useMemo(() => ({
    acc: cssVar("--acc", "#2dd4bf"), dim: cssVar("--dim", "#8a95a3"), line: cssVar("--line", "#1f262f"), panel: cssVar("--panel2", "#171c23"), txt: cssVar("--txt", "#e8edf3"),
  }), []);

  const last = points?.[points.length - 1];
  const first = points?.[0];
  const change = first && last && first.mcap > 0 ? ((last.mcap - first.mcap) / first.mcap) * 100 : null;
  void tick;

  return (
    <div className="card">
      <div className="flex between">
        <div>
          <h3>Market cap</h3>
          <div className="sub">
            {last ? <>
              <b className="num" style={{ color: "var(--txt)" }}>{last.mcap.toFixed(4)} SOL</b>
              {change !== null && <span className="num" style={{ color: change >= 0 ? "var(--acc)" : "var(--bad)", marginLeft: 8 }}>{change >= 0 ? "+" : ""}{change.toFixed(1)}% since launch</span>}
              {" "}· {points!.length} trade{points!.length === 1 ? "" : "s"} · last {ago(last.t)}
            </> : points ? "no trades yet" : "reading the curve's trade history…"}
          </div>
        </div>
        <span className="pill on" title={`refreshes every ${POLL_MS / 1000} s`}><span className="dot" aria-hidden="true" />live</span>
      </div>
      <div style={{ height: 220, marginTop: 14 }} role="img" aria-label="market cap over time, in SOL">
        {points && points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colors.line} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={hhmm}
                     stroke={colors.line} tick={{ fill: colors.dim, fontSize: 11 }} tickLine={false} minTickGap={48} />
              <YAxis dataKey="mcap" domain={["auto", "auto"]} width={58} tickFormatter={(v: number) => v.toFixed(v >= 10 ? 1 : 3)}
                     stroke={colors.line} tick={{ fill: colors.dim, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 8, fontSize: 12, color: colors.txt }}
                labelStyle={{ color: colors.dim }} itemStyle={{ color: colors.txt }}
                labelFormatter={(t: number) => new Date(t * 1000).toLocaleString("en-US", { hour12: false })}
                formatter={(v: number, _n, p: any) => [`${v.toFixed(4)} SOL`, `${p.payload.buy ? "buy" : "sell"} ${p.payload.sol.toFixed(3)} SOL → market cap`]} />
              <Line type="linear" dataKey="mcap" stroke={colors.acc} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: colors.acc }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {error ? `Could not read trades: ${error}` : points ? "The chart starts with the first trade." : "…"}
          </div>
        )}
      </div>
      <p className="sub" style={{ marginTop: 8 }}>Priced off the bonding curve after every trade, decoded from pump.fun&apos;s own trade events on {points?.length ? "this coin" : "the coin"}. Refreshes every {POLL_MS / 1000} s.</p>
    </div>
  );
}
