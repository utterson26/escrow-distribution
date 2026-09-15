"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Customized,
} from "recharts";
import type { McapPoint } from "@/app/api/mcap/[mint]/route";

const POLL_MS = 10_000;
const CANDLE_S = 60;
/** pump moves a coin to its AMM once the curve holds this much SOL */
const MIGRATION_SOL = 85;

const cssVar = (name: string, fallback: string) =>
  typeof window === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const ago = (t: number) => { const s = Math.max(0, Math.round(Date.now() / 1000 - t)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };
const usd = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K` : `$${v.toFixed(v >= 100 ? 0 : 2)}`;

interface Candle { t: number; o: number; h: number; l: number; c: number; n: number; vol: number }

/** One-minute OHLC in USD from the trade points; quiet minutes carry the last close so the axis stays continuous. */
function candles(points: McapPoint[], solUsd: number, nowSec: number): Candle[] {
  if (!points.length) return [];
  const byMin = new Map<number, Candle>();
  for (const p of points) {
    const t = Math.floor(p.t / CANDLE_S) * CANDLE_S;
    const v = p.mcap * solUsd;
    const c = byMin.get(t);
    if (!c) byMin.set(t, { t, o: v, h: v, l: v, c: v, n: 1, vol: p.sol });
    else { c.h = Math.max(c.h, v); c.l = Math.min(c.l, v); c.c = v; c.n++; c.vol += p.sol; }
  }
  const first = Math.floor(points[0].t / CANDLE_S) * CANDLE_S;
  const last = Math.max(Math.floor(nowSec / CANDLE_S) * CANDLE_S, Math.floor(points[points.length - 1].t / CANDLE_S) * CANDLE_S);
  // cap the series so a week-old coin does not render ten thousand flat candles
  const start = Math.max(first, last - 240 * CANDLE_S);
  const out: Candle[] = [];
  let prev = byMin.get(first)?.c ?? points[0].mcap * solUsd;
  for (let t = first; t <= last; t += CANDLE_S) {
    const c = byMin.get(t);
    if (c) { if (t >= start) out.push(c); prev = c.c; }
    else if (t >= start) out.push({ t, o: prev, h: prev, l: prev, c: prev, n: 0, vol: 0 });
  }
  return out;
}

/** Draws the candles with the chart's own scales (a custom Bar shape cannot follow a log axis). */
function CandleLayer(props: any) {
  const { xAxisMap, yAxisMap, data, up, down, flat } = props;
  const xs = xAxisMap?.[0]?.scale, ys = yAxisMap?.[0]?.scale;
  if (!xs || !ys || !data?.length) return null;
  const step = data.length > 1 ? Math.abs(xs(data[1].t) - xs(data[0].t)) : 12;
  const w = Math.max(2, Math.min(12, step * 0.7));
  return (
    <g>
      {data.map((c: Candle) => {
        const x = xs(c.t);
        const yo = ys(c.o), yc = ys(c.c), yh = ys(c.h), yl = ys(c.l);
        if ([x, yo, yc, yh, yl].some((v) => !Number.isFinite(v))) return null;
        const color = c.n === 0 ? flat : c.c >= c.o ? up : down;
        const top = Math.min(yo, yc), h = Math.max(1, Math.abs(yo - yc));
        return (
          <g key={c.t}>
            <line x1={x} x2={x} y1={yh} y2={yl} stroke={color} strokeWidth={1} />
            <rect x={x - w / 2} y={top} width={w} height={h} fill={c.n === 0 ? "none" : color} stroke={color} strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

function CandleTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const c: Candle = payload[0].payload;
  return (
    <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
      <div className="muted">{new Date(c.t * 1000).toLocaleString("en-US", { hour12: false })}</div>
      <div className="num">O {usd(c.o)} · H {usd(c.h)} · L {usd(c.l)} · C {usd(c.c)}</div>
      <div className="muted num">{c.n ? `${c.n} trade${c.n === 1 ? "" : "s"} · ${c.vol.toFixed(3)} SOL` : "no trades this minute"}</div>
    </div>
  );
}

/** Market cap in USD, one-minute candles from the coin's trades; polls every 10 s. */
export default function McapChart({ mint }: { mint: string }) {
  const [points, setPoints] = useState<McapPoint[] | null>(null);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    let stop = false;
    const load = () => fetch(`/api/mcap/${mint}`).then((r) => r.json()).then((j) => {
      if (stop) return;
      if (j.points) setPoints(j.points);
      if (j.solUsd) setSolUsd(j.solUsd);
      setComplete(!!j.complete);
      setError(j.error ?? null);
      setNow(Date.now() / 1000);
    }).catch((e) => !stop && setError(String(e)));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [mint]);

  const colors = useMemo(() => ({
    acc: cssVar("--acc", "#2dd4bf"), bad: cssVar("--bad", "#f0616b"), dim: cssVar("--dim", "#8a95a3"), dim2: cssVar("--dim2", "#5f6a78"),
    line: cssVar("--line", "#1f262f"), warn: cssVar("--warn", "#e0a53a"), txt: cssVar("--txt", "#e8edf3"),
  }), []);

  const data = useMemo(() => (points && solUsd ? candles(points, solUsd, now) : []), [points, solUsd, now]);
  const last = points?.[points.length - 1];
  const first = points?.[0];
  const migration = solUsd ? MIGRATION_SOL * solUsd : null;
  const change = first && last && first.mcap > 0 ? ((last.mcap - first.mcap) / first.mcap) * 100 : null;
  const lo = data.length ? Math.min(...data.map((c) => c.l)) : 1;
  const hi = data.length ? Math.max(...data.map((c) => c.h), migration ?? 0) : migration ?? 10;
  // after graduation the candles change colour: trading has moved to pump's AMM
  const up = complete ? colors.warn : colors.acc, down = complete ? colors.dim : colors.bad;

  return (
    <div className="card">
      <div className="flex between">
        <div>
          <h3>Market cap</h3>
          <div className="sub">
            {last && solUsd ? <>
              <b className="num" style={{ color: "var(--txt)" }}>{usd(last.mcap * solUsd)}</b>
              <span className="muted num"> ({last.mcap.toFixed(3)} SOL)</span>
              {change !== null && <span className="num" style={{ color: change >= 0 ? "var(--acc)" : "var(--bad)", marginLeft: 8 }}>{change >= 0 ? "+" : ""}{change.toFixed(1)}% since launch</span>}
              {" "}· {points!.length} trade{points!.length === 1 ? "" : "s"} · last {ago(last.t)}
            </> : points ? "Awaiting first trade" : "reading the curve's trade history…"}
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {complete && <span className="pill warn">graduated · trades on pump&apos;s AMM</span>}
          <span className="pill on" title={`refreshes every ${POLL_MS / 1000} s`}><span className="dot" aria-hidden="true" />live</span>
        </div>
      </div>
      <div style={{ height: 240, marginTop: 14 }} role="img" aria-label="market cap over time in US dollars, one-minute candles">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colors.line} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={hhmm}
                     stroke={colors.line} tick={{ fill: colors.dim, fontSize: 11 }} tickLine={false} minTickGap={48} />
              <YAxis dataKey="c" scale="log" domain={[lo * 0.8, hi * 1.15]} width={64} allowDataOverflow tickFormatter={usd}
                     stroke={colors.line} tick={{ fill: colors.dim, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CandleTip />} cursor={{ stroke: colors.dim2, strokeDasharray: "3 3" }} />
              {migration && (
                <ReferenceLine y={migration} stroke={colors.dim} strokeDasharray="6 4"
                               label={{ value: `Migration ${usd(migration)} (${MIGRATION_SOL} SOL)`, position: "insideTopRight", fill: colors.dim, fontSize: 11 }} />
              )}
              <Customized component={<CandleLayer up={up} down={down} flat={colors.dim2} />} />
              {/* invisible line: gives the tooltip something to snap to */}
              <Line type="linear" dataKey="c" stroke="transparent" dot={false} activeDot={{ r: 3, fill: up }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {error ? `Could not read trades: ${error}` : points && !points.length ? "Awaiting first trade" : points && !solUsd ? "SOL price unavailable" : "…"}
          </div>
        )}
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        One-minute candles, USD, from pump.fun&apos;s trade events on this coin; priced at the current SOL rate{solUsd ? ` ($${solUsd.toFixed(2)})` : ""}.
        The dashed line is where pump.fun migrates the coin to its AMM. Refreshes every {POLL_MS / 1000} s.
      </p>
    </div>
  );
}
