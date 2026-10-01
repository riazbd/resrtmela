/**
 * What the charts share between the console and the phone.
 *
 * The owner, 2026-10-02: *"shob hisaber oi to sundor chokh dhadhano chart,
 * art thaka uchit chilo … web console, app dui jaygatei, khali text ar
 * number."* Every money screen was a table and four numbers in boxes. The
 * charts are drawn twice — SVG in the console, views on the phone — but what
 * a colour means, how an axis is rounded and how a big number is shortened
 * are decided once, here, so a green bar means the same thing on both.
 */

/** A colour with a lighter partner for fills, tracks and hover. */
export interface Tone {
  solid: string;
  soft: string;
}

/**
 * Colours by meaning. Money that arrived or left as it should is green; money
 * still owed is amber; late is red; money handed over early is blue; a bonus
 * is violet. Nothing else uses these meanings.
 */
export const MONEY_TONE = {
  paid: { solid: "#16a34a", soft: "#dcfce7" },
  income: { solid: "#0d9488", soft: "#ccfbf1" },
  advance: { solid: "#2563eb", soft: "#dbeafe" },
  left: { solid: "#f59e0b", soft: "#fef3c7" },
  late: { solid: "#dc2626", soft: "#fee2e2" },
  bonus: { solid: "#7c3aed", soft: "#ede9fe" },
  deduction: { solid: "#64748b", soft: "#e2e8f0" },
  expense: { solid: "#e11d48", soft: "#ffe4e6" },
  neutral: { solid: "#94a3b8", soft: "#f1f5f9" },
} as const satisfies Record<string, Tone>;

/** For categories with no meaning of their own: told apart, in this order. */
export const SERIES_COLORS = [
  "#16a34a",
  "#2563eb",
  "#f59e0b",
  "#7c3aed",
  "#0d9488",
  "#e11d48",
  "#0891b2",
  "#ca8a04",
  "#9333ea",
  "#64748b",
] as const;

export const seriesColor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length]!;

/** A payroll month's colour, by its state (`PayrollMonthState`). */
export const PAYROLL_STATE_TONE: Record<string, Tone> = {
  SETTLED: MONEY_TONE.paid,
  PART_PAID: MONEY_TONE.left,
  UNPAID: MONEY_TONE.late,
  RUNNING: { solid: "#d97706", soft: "#fef3c7" },
  UPCOMING: { solid: "#cbd5e1", soft: "#f8fafc" },
  NOTHING_DUE: MONEY_TONE.deduction,
  NOT_ON_PAYROLL: { solid: "#e2e8f0", soft: "#ffffff" },
};

/**
 * A round number at or above `max` for the top of an axis: 37,400 → 40,000.
 * Never zero, so an empty chart still has an axis to draw.
 */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/** `count + 1` evenly spaced values from 0 to `niceMax(max)`. */
export function axisTicks(max: number, count = 4): number[] {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => (top * i) / count);
}

/**
 * A number short enough for an axis or a bar: 1,250 → "1.3k", 1,50,000 →
 * "1.5L", 2,40,00,000 → "2.4Cr". Lakh and crore, because that is how the
 * people reading it count; no currency sign, because the axis title has it.
 */
export function compactNumber(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const trim = (x: number) => (x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ""));
  if (a >= 1e7) return `${sign}${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}k`;
  return `${sign}${Math.round(a)}`;
}

/** A share as a whole percent, never "NaN%". */
export function percentOf(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 100);
}
