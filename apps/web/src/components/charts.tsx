"use client";

/**
 * The console's charts.
 *
 * The owner, 2026-10-02: every money screen was "khali text ar number" —
 * tables, and four numbers in boxes. These are the pictures: columns for
 * money by month, a smooth line for a trend, a ring for shares, ranked bars
 * for categories, a segmented meter for "how much of it is done", and a
 * timeline grid — people down the side, months across — for who was paid
 * when.
 *
 * Plain SVG and HTML, no chart library: what a colour means and how an axis
 * rounds is decided in `@rh/shared/chart` and the phone draws the same
 * meanings with views, so a library here would be a third opinion. Every
 * chart sizes itself to its container, says its values on hover, and is
 * readable with the hover gone — a figure that only exists under a mouse
 * does not exist on a phone.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { axisTicks, compactNumber, niceMax, percentOf } from "@rh/shared";

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** A row of data: a label for the axis and one value per series key. */
export interface Datum {
  label: string;
  /** a longer name for the tooltip — "September 2026" under "Sep" */
  title?: string;
  values: Record<string, number>;
}

/** The width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

export function Legend({ items, className = "" }: { items: { label: string; color: string; value?: string }[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 ${className}`}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="font-semibold text-slate-800">{i.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** The floating box a hovered column or point explains itself in. */
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 90), width - 90);
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[10rem] -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  );
}

function TipRows({ title, rows, total }: { title: string; rows: { label: string; color: string; value: string }[]; total?: string }) {
  return (
    <>
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-semibold tabular-nums">{r.value}</span>
        </div>
      ))}
      {total && (
        <div className="mt-1 flex justify-between gap-4 border-t border-white/15 pt-1">
          <span className="text-slate-300">Total</span>
          <span className="font-semibold tabular-nums">{total}</span>
        </div>
      )}
    </>
  );
}

/** A path for a bar whose top corners are rounded and bottom square. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/**
 * Columns, stacked: money by month, each month split by what it was.
 *
 * `marker` draws a short dash across each column at another value — what a
 * month was worth, over what was paid — so "short of it" is visible without
 * reading a number.
 */
export function ColumnChart({
  data,
  series,
  height = 240,
  format = compactNumber,
  formatFull = format,
  active,
  onPick,
  marker,
}: {
  data: Datum[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  formatFull?: (n: number) => string;
  /** the column to draw as chosen — the month on screen, today */
  active?: number;
  onPick?: (index: number) => void;
  marker?: { key: string; label: string; color: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const pad = { top: 14, right: 8, bottom: 26, left: 44 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const totals = data.map((d) => series.reduce((s, x) => s + Math.max(0, d.values[x.key] ?? 0), 0));
  const markerMax = marker ? Math.max(0, ...data.map((d) => d.values[marker.key] ?? 0)) : 0;
  const top = niceMax(Math.max(0, ...totals, markerMax));
  const ticks = axisTicks(top);
  const slot = data.length ? innerW / data.length : innerW;
  const barW = Math.max(6, Math.min(38, slot * 0.62));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="1" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.78" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const x = cx - barW / 2;
          let acc = 0;
          const shown = series.filter((s) => (d.values[s.key] ?? 0) > 0);
          const isActive = active === i;
          return (
            <g
              key={d.label + i}
              onMouseEnter={() => setHover(i)}
              onClick={onPick ? () => onPick(i) : undefined}
              className={onPick ? "cursor-pointer" : undefined}
            >
              <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill={hover === i || isActive ? "#f1f5f9" : "transparent"} rx={8} />
              {shown.map((s, k) => {
                const v = d.values[s.key] ?? 0;
                const y0 = y(acc + v);
                const h = y(acc) - y0;
                acc += v;
                const last = k === shown.length - 1;
                return last ? (
                  <path key={s.key} d={roundedTop(x, y0, barW, h, 6)} fill={`url(#${gid}-${s.key})`} className="rm-grow-y" style={{ animationDelay: `${i * 35}ms` }} />
                ) : (
                  <rect key={s.key} x={x} y={y0} width={barW} height={Math.max(0, h)} fill={`url(#${gid}-${s.key})`} className="rm-grow-y" style={{ animationDelay: `${i * 35}ms` }} />
                );
              })}
              {marker && (d.values[marker.key] ?? 0) > 0 && (
                <line x1={x - 4} x2={x + barW + 4} y1={y(d.values[marker.key]!)} y2={y(d.values[marker.key]!)} stroke={marker.color} strokeWidth={2.5} strokeLinecap="round" className="rm-fade" />
              )}
              <text x={cx} y={height - 8} textAnchor="middle" className={`text-[10px] ${isActive ? "fill-slate-900 font-semibold" : "fill-slate-500"}`}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <Tip x={pad.left + slot * hover + slot / 2} y={y(Math.max(totals[hover]!, marker ? data[hover]!.values[marker.key] ?? 0 : 0))} width={width}>
          <TipRows
            title={data[hover]!.title ?? data[hover]!.label}
            rows={[
              ...series.map((s) => ({ label: s.label, color: s.color, value: formatFull(data[hover]!.values[s.key] ?? 0) })),
              ...(marker ? [{ label: marker.label, color: marker.color, value: formatFull(data[hover]!.values[marker.key] ?? 0) }] : []),
            ]}
            total={series.length > 1 ? formatFull(totals[hover]!) : undefined}
          />
        </Tip>
      )}
    </div>
  );
}

/** A smooth path through points (monotone, so it never overshoots a value). */
function smooth(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0]![0]},${points[0]![1]}` : "";
  const n = points.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1]![0] - points[i]![0]);
    m.push((points[i + 1]![1] - points[i]![1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2);
  t.push(m[n - 2]!);
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C${x0 + h},${y0 + t[i]! * h} ${x1 - h},${y1 - t[i + 1]! * h} ${x1},${y1}`;
  }
  return d;
}

/** Lines over time, each with a soft fill beneath: a trend, not a total. */
export function AreaChart({
  data,
  series,
  height = 220,
  format = compactNumber,
  formatFull = format,
  everyNth,
}: {
  data: Datum[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  formatFull?: (n: number) => string;
  /** label every nth point on the axis, for a month of days */
  everyNth?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const pad = { top: 14, right: 12, bottom: 26, left: 44 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const top = niceMax(max);
  const ticks = axisTicks(top);
  const x = (i: number) => pad.left + (data.length <= 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const nth = everyNth ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56))));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left - pad.left;
    const i = data.length <= 1 ? 0 : Math.round((px / innerW) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  }

  return (
    <div ref={ref} className="relative w-full min-w-0 select-none">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % nth === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {d.label}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const pts = data.map((d, i) => [x(i), y(d.values[s.key] ?? 0)] as [number, number]);
          const line = smooth(pts);
          const area = pts.length ? `${line} L${pts[pts.length - 1]![0]},${y(0)} L${pts[0]![0]},${y(0)} Z` : "";
          return (
            <g key={s.key}>
              <path d={area} fill={`url(#${gid}-${s.key})`} className="rm-fade" />
              <path d={line} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="rm-draw" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#94a3b8" strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(data[hover]!.values[s.key] ?? 0)} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}
      </svg>
      {hover != null && data[hover] && (
        <Tip x={x(hover)} y={y(Math.max(...series.map((s) => data[hover]!.values[s.key] ?? 0)))} width={width}>
          <TipRows
            title={data[hover]!.title ?? data[hover]!.label}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: formatFull(data[hover]!.values[s.key] ?? 0) }))}
          />
        </Tip>
      )}
    </div>
  );
}

/** A ring of shares, with the whole in the middle and the parts beside it. */
export function Donut({
  parts,
  center,
  size = 168,
  thickness = 22,
  format = compactNumber,
}: {
  parts: { label: string; value: number; color: string }[];
  center?: { value: string; label: string };
  size?: number;
  thickness?: number;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 2 : 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {total > 0 &&
            parts.map((p, i) => {
              const len = (Math.max(0, p.value) / total) * c;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={p.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={hover === i ? thickness + 6 : thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  className="rm-fade cursor-default transition-[stroke-width]"
                  style={{ animationDelay: `${i * 80}ms` }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover != null && parts[hover] ? (
            <>
              <div className="text-lg font-bold tabular-nums text-slate-900">{percentOf(parts[hover]!.value, total)}%</div>
              <div className="max-w-[6.5rem] truncate text-[11px] text-slate-500">{parts[hover]!.label}</div>
            </>
          ) : center ? (
            <>
              <div className="text-lg font-bold tabular-nums text-slate-900">{center.value}</div>
              <div className="text-[11px] text-slate-500">{center.label}</div>
            </>
          ) : null}
        </div>
      </div>
      <ul className="min-w-[14rem] flex-1 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className={`flex items-center justify-between gap-3 rounded-lg px-1.5 py-0.5 ${hover === i ? "bg-slate-50" : ""}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-slate-800">{format(p.value)}</span>
              <span className="ml-1.5 text-xs text-slate-400">{percentOf(p.value, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars: the biggest first, each with its number. */
export function BarList({
  rows,
  format = compactNumber,
  color = "#16a34a",
  limit,
}: {
  rows: { label: string; value: number; sub?: string; color?: string }[];
  format?: (n: number) => string;
  color?: string;
  limit?: number;
}) {
  const shown = (limit ? rows.slice(0, limit) : rows).filter((r) => r.value > 0);
  const max = Math.max(1, ...shown.map((r) => r.value));
  if (shown.length === 0) return <div className="py-6 text-center text-sm text-slate-400">Nothing to show yet</div>;
  return (
    <ul className="space-y-2.5">
      {shown.map((r, i) => (
        <li key={r.label + i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">
              {r.label}
              {r.sub && <span className="ml-1.5 text-xs text-slate-400">{r.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-800">{format(r.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="rm-grow-x h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color, animationDelay: `${i * 50}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into parts of a whole: "how much of it is done". */
export function Meter({
  parts,
  total,
  height = 12,
  showLegend = true,
  format = compactNumber,
}: {
  parts: { label: string; value: number; color: string }[];
  /** the whole; defaults to the sum of the parts */
  total?: number;
  height?: number;
  showLegend?: boolean;
  format?: (n: number) => string;
}) {
  const whole = Math.max(total ?? 0, parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-slate-100" style={{ height }}>
        {whole > 0 &&
          parts.map((p, i) =>
            p.value > 0 ? (
              <div key={p.label} title={`${p.label}: ${format(p.value)}`} className="rm-grow-x h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / whole) * 100}%`, background: p.color, animationDelay: `${i * 90}ms` }} />
            ) : null,
          )}
      </div>
      {showLegend && <Legend className="mt-2" items={parts.map((p) => ({ label: p.label, color: p.color, value: format(p.value) }))} />}
    </div>
  );
}

/** A small line with no axes, for beside a figure. */
export function Sparkline({ values, color = "#16a34a", height = 36, width = 120 }: { values: number[]; color?: string; height?: number; width?: number }) {
  const gid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(width * i) / (values.length - 1), height - 3 - ((v - min) / (max - min || 1)) * (height - 6)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg width={width} height={height} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" pathLength={1} className="rm-draw" />
    </svg>
  );
}

/**
 * A timeline grid: rows down the side, periods across, each cell coloured by
 * what happened in it — the Gantt view of who was paid when.
 */
export function TimelineGrid<C>({
  columns,
  rows,
  cell,
  onPick,
  activeColumn,
}: {
  columns: { key: string; label: string }[];
  rows: { key: string; label: string; sub?: string; cells: C[] }[];
  /** how a cell looks: its colours, its words on hover, and a short figure inside */
  cell: (c: C, row: number, col: number) => { fill: string; ink?: string; text?: string; title: string; dashed?: boolean };
  onPick?: (row: number, col: number) => void;
  activeColumn?: number;
}) {
  const template = useMemo(() => `minmax(9rem, 1.4fr) repeat(${columns.length}, minmax(2.6rem, 1fr))`, [columns.length]);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="grid gap-1 pb-1.5 text-[11px] font-medium text-slate-500" style={{ gridTemplateColumns: template }}>
          <div />
          {columns.map((c, i) => (
            <div key={c.key} className={`text-center ${activeColumn === i ? "font-bold text-slate-900" : ""}`}>
              {c.label}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {rows.map((r, ri) => (
            <div key={r.key} className="grid items-center gap-1" style={{ gridTemplateColumns: template }}>
              <div className="min-w-0 pr-2">
                <div className="truncate text-sm font-medium text-slate-800">{r.label}</div>
                {r.sub && <div className="truncate text-[11px] text-slate-400">{r.sub}</div>}
              </div>
              {r.cells.map((c, ci) => {
                const look = cell(c, ri, ci);
                return (
                  <button
                    key={ci}
                    type="button"
                    title={look.title}
                    aria-label={look.title}
                    onClick={onPick ? () => onPick(ri, ci) : undefined}
                    disabled={!onPick}
                    className={`rm-fade flex h-9 items-center justify-center rounded-lg text-[10px] font-semibold tabular-nums transition hover:scale-[1.06] hover:shadow-md disabled:cursor-default ${look.dashed ? "border border-dashed border-slate-200" : ""} ${activeColumn === ci ? "ring-2 ring-slate-900/70 ring-offset-1" : ""}`}
                    style={{ background: look.fill, color: look.ink ?? "#fff", animationDelay: `${(ri * 12 + ci) * 12}ms` }}
                  >
                    {look.text}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A figure with a word under it and, when given, a little line of its history. */
export function KpiCard({
  label,
  value,
  sub,
  tone = "#0f172a",
  icon,
  trend,
  trendColor,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: string;
  icon?: ReactNode;
  trend?: number[];
  trendColor?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.08]" style={{ background: tone }} />
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: `${tone}18`, color: tone }}>
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: tone }}>
          {value}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} color={trendColor ?? tone} width={84} height={30} />}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
