"use client";

/** Small pieces every payroll tab uses. */

import { ChevronLeft, ChevronRight, KeyRound, UserRound } from "lucide-react";
import {
  PAYROLL_MONTH_STATE_LABELS,
  PAYROLL_STATE_TONE,
  PAYROLL_MONTH_STATES,
  addMonths,
  monthName,
  type PayrollLogin,
  type PayrollMonthState,
} from "@rh/shared";

const isState = (s: string): s is PayrollMonthState => (PAYROLL_MONTH_STATES as readonly string[]).includes(s);

/** Paid, Part paid, Unpaid…: the colour and the word, the same as the year grid. */
export function StatePill({ state }: { state: string }) {
  const tone = PAYROLL_STATE_TONE[state] ?? PAYROLL_STATE_TONE.UPCOMING!;
  const label = isState(state) ? PAYROLL_MONTH_STATE_LABELS[state].label : state;
  const means = isState(state) ? PAYROLL_MONTH_STATE_LABELS[state].means : undefined;
  return (
    <span
      title={means}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: tone.soft, color: state === "UPCOMING" || state === "NOT_ON_PAYROLL" ? "#475569" : tone.solid }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.solid }} />
      {label}
    </span>
  );
}

/** "Signs in as Shirin · Front desk", or that they have no login — never silent. */
export function LoginChip({ login }: { login: PayrollLogin | null }) {
  if (!login) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-400 ring-1 ring-inset ring-slate-200" title="Paid a salary, does not sign in to the app">
        <UserRound className="h-3 w-3" /> No app login
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 ring-1 ring-inset ring-sky-200" title={`Signs in to the app as ${login.name} (${login.role})`}>
      <KeyRound className="h-3 w-3" /> {login.name} · {login.role}
      {login.status !== "active" && <span className="text-slate-400"> · {login.status}</span>}
    </span>
  );
}

/** ‹ September 2026 ›, with a menu of nearby months. */
export function MonthStepper({ month, now, onChange }: { month: string; now: string; onChange: (m: string) => void }) {
  const options = Array.from({ length: 24 }, (_, i) => addMonths(now, 2 - i));
  if (!options.includes(month)) options.push(month);
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <button aria-label="Previous month" onClick={() => onChange(addMonths(month, -1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select aria-label="Month" value={month} onChange={(e) => onChange(e.target.value)} className="rounded-lg border-0 bg-transparent px-1 py-1 text-sm font-semibold text-slate-800 focus:ring-0">
        {options.sort().reverse().map((m) => (
          <option key={m} value={m}>
            {monthName(m)}
          </option>
        ))}
      </select>
      <button aria-label="Next month" onClick={() => onChange(addMonths(month, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function YearStepper({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <button aria-label="Previous year" onClick={() => onChange(year - 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 text-sm font-semibold tabular-nums text-slate-800">{year}</span>
      <button aria-label="Next year" onClick={() => onChange(year + 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The states, with their colours, for under a chart. */
export function StateLegend() {
  const shown: PayrollMonthState[] = ["SETTLED", "PART_PAID", "UNPAID", "RUNNING", "UPCOMING", "NOT_ON_PAYROLL"];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {shown.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5" title={PAYROLL_MONTH_STATE_LABELS[s].means}>
          <span
            className="h-3 w-3 rounded"
            style={{
              background: s === "RUNNING" ? PAYROLL_STATE_TONE[s]!.soft : PAYROLL_STATE_TONE[s]!.solid,
              border: s === "NOT_ON_PAYROLL" ? "1px dashed #cbd5e1" : s === "RUNNING" ? `1px solid ${PAYROLL_STATE_TONE[s]!.solid}` : undefined,
            }}
          />
          {PAYROLL_MONTH_STATE_LABELS[s].label}
        </span>
      ))}
    </div>
  );
}
