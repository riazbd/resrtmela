"use client";

/**
 * The month as a pay run — period and payday, the three steps, the sum from
 * gross to what is still to be handed over, and one button that pays
 * everyone. And, before anybody is on payroll, the three steps to get there.
 *
 * The figures are `payRunOf` in @rh/shared, which the app draws from too.
 */
import { useState } from "react";
import { CalendarDays, Check, FileText, HandCoins, Printer, UserPlus, Users } from "lucide-react";
import { MONEY_TONE, PAY_RUN_STATUS_LABEL, PAY_RUN_STEPS, monthName, type PayRun, type PayrollSheet } from "@rh/shared";
import { money } from "@/lib/api";
import { Button, Card, Field, Modal, Select, useToast } from "@/components/ui";
import type { PayrollAdapter } from "./adapter";
import { printPayslips } from "./payslip";

const METHODS = ["CASH", "BKASH", "NAGAD", "BANK", "CARD"] as const;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const STATUS_LOOK: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800",
  PART_PAID: "bg-amber-100 text-amber-800",
  TO_PAY: "bg-sky-100 text-sky-800",
  UPCOMING: "bg-slate-100 text-slate-600",
  NOBODY_THIS_MONTH: "bg-slate-100 text-slate-600",
  SETUP: "bg-slate-100 text-slate-600",
};

/** Before anybody is on payroll: what payroll is here, in three steps, and the first one to take. */
export function PayrollSetup({ onAdd, owner }: { onAdd: () => void; owner: "resort" | "agency" }) {
  const steps = [
    { icon: UserPlus, t: "Add your team", d: "Each person's name, job, monthly salary and the day they started. Link their app login if they have one." },
    { icon: CalendarDays, t: "Review each month", d: "Salary is counted by the days they were on payroll. Add a bonus or a deduction; advances already given are taken off." },
    { icon: HandCoins, t: "Pay and print payslips", d: "Pay everyone in one go — cash, bKash, Nagad or bank — and print a payslip for each." },
  ];
  return (
    <Card>
      <div className="mx-auto max-w-3xl py-4 text-center">
        <h2 className="text-xl font-black tracking-tight text-slate-900">Set up payroll in three steps</h2>
        <p className="mt-1 text-sm text-slate-500">
          Nobody is on the {owner === "agency" ? "agency's" : "resort's"} payroll yet. Once your team is in, every month is a pay run: review, pay, payslips.
        </p>
        <div className="mt-6 grid gap-4 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.t} className="rounded-2xl bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{i + 1}</span>
                <s.icon className="h-5 w-5 text-slate-500" />
              </div>
              <div className="mt-3 font-bold text-slate-900">{s.t}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.d}</p>
            </div>
          ))}
        </div>
        <Button className="mt-6" onClick={onAdd}>
          <UserPlus className="h-4 w-4" /> Add the first person
        </Button>
      </div>
    </Card>
  );
}

/** The month's pay run: where it stands, the sum, and the next thing to do. */
export function PayRunCard({ run, a, sheet, onPaid }: { run: PayRun; a: PayrollAdapter; sheet: PayrollSheet; onPaid: () => void }) {
  const { push } = useToast();
  const [paying, setPaying] = useState(false);
  const lines: { label: string; value: number; sign: "" | "+" | "−" | "="; tone?: string; strong?: boolean }[] = [
    { label: "Gross pay", value: run.gross, sign: "" },
    { label: "Bonuses", value: run.bonus, sign: "+", tone: MONEY_TONE.bonus.solid },
    { label: "Deductions", value: run.deduction, sign: "−", tone: MONEY_TONE.deduction.solid },
    { label: "Net pay", value: run.net, sign: "=", strong: true },
    { label: "Already paid", value: run.paid, sign: "−", tone: MONEY_TONE.paid.solid },
    { label: "To pay now", value: run.toPay, sign: "=", tone: run.toPay > 0 ? "#b45309" : MONEY_TONE.paid.solid, strong: true },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-slate-900">{monthName(run.month)} payroll</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_LOOK[run.status]}`}>{PAY_RUN_STATUS_LABEL[run.status]}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Pay period {day(run.period.from)} – {day(run.period.to)} · payday {day(run.payday)} · {run.headcount} {run.headcount === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.canManage && run.toPay > 0 && run.status !== "UPCOMING" && (
            <Button onClick={() => setPaying(true)}>
              <HandCoins className="h-4 w-4" /> Pay everyone {money(run.toPay)}
            </Button>
          )}
          <Button variant="ghost" onClick={() => printPayslips(a.ownerName, run.month, sheet.rows) || push("Allow pop-ups to print", "err")}>
            <Printer className="h-4 w-4" /> Payslips
          </Button>
        </div>
      </div>

      {/* the three steps, and where this month is */}
      <ol className="mt-5 grid grid-cols-3 gap-2">
        {PAY_RUN_STEPS.map((s, i) => {
          const done = i < run.step || run.status === "PAID";
          const here = i === run.step && run.status !== "PAID";
          return (
            <li key={s} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${here ? "bg-slate-900 text-white" : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-400"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${here ? "bg-white text-slate-900" : done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="truncate text-sm font-bold">{s}</span>
            </li>
          );
        })}
      </ol>

      {/* gross to what is left, the way a payslip reads */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {lines.map((l) => (
          <div key={l.label} className={`rounded-2xl px-4 py-3 ${l.strong ? "bg-slate-900 text-white" : "bg-slate-50"}`}>
            <div className={`text-[11px] font-semibold ${l.strong ? "text-slate-300" : "text-slate-500"}`}>
              {l.sign && <span className="mr-1 font-black">{l.sign}</span>}
              {l.label}
            </div>
            <div className="mt-0.5 text-lg font-black tabular-nums" style={!l.strong && l.tone ? { color: l.tone } : undefined}>
              {money(l.value)}
            </div>
          </div>
        ))}
      </div>
      {run.advance > 0 && <p className="mt-2 text-xs text-slate-500">Already paid includes {money(run.advance)} given as advances before the month was settled.</p>}
      {run.arrears > 0 && <p className="mt-1 text-xs font-medium text-red-600">{money(run.arrears)} is still due from earlier months — open those months to pay it.</p>}
      {run.status === "UPCOMING" && <p className="mt-2 text-xs text-slate-500">This month has not started. You can add bonuses, deductions and advances now; pay it on or after the payday.</p>}

      {paying && <PayEveryone run={run} a={a} onClose={() => setPaying(false)} onPaid={onPaid} />}
    </Card>
  );
}

/** Pay everybody who has something left, in one go — each settled as a salary payment. */
function PayEveryone({ run, a, onClose, onPaid }: { run: PayRun; a: PayrollAdapter; onClose: () => void; onPaid: () => void }) {
  const { push } = useToast();
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(run.payable.map((p) => p.employeeId)));
  const [method, setMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const total = run.payable.filter((p) => chosen.has(p.employeeId)).reduce((s, p) => s + p.amount, 0);

  async function payAll() {
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const p of run.payable.filter((x) => chosen.has(x.employeeId))) {
      try {
        await a.pay(p.employeeId, { month: run.month, kind: "SALARY", method });
        done += 1;
      } catch (ex) {
        failed.push(`${p.name}: ${(ex as Error).message}`);
      }
    }
    setBusy(false);
    a.invalidate();
    if (failed.length) push(`Paid ${done}; not paid — ${failed.join("; ")}`, "err");
    else push(`${done} ${done === 1 ? "person" : "people"} paid for ${monthName(run.month)}`);
    onPaid();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Pay ${monthName(run.month)}`}>
      <p className="mb-3 text-sm text-slate-500">Each person chosen is paid what is left of their month, as salary. Advances already given are counted.</p>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {run.payable.map((p) => (
          <label key={p.employeeId} className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={chosen.has(p.employeeId)}
              onChange={() => {
                const next = new Set(chosen);
                if (next.has(p.employeeId)) next.delete(p.employeeId);
                else next.add(p.employeeId);
                setChosen(next);
              }}
              className="h-4 w-4 accent-slate-900"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{p.name}</span>
              {p.designation && <span className="block truncate text-xs text-slate-400">{p.designation}</span>}
            </span>
            <span className="text-sm font-bold tabular-nums text-slate-900">{money(p.amount)}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Paid by">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end justify-end">
          <div className="text-right">
            <div className="text-[11px] font-semibold text-slate-500">Total</div>
            <div className="text-2xl font-black tabular-nums text-slate-900">{money(total)}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} disabled={chosen.size === 0} onClick={() => void payAll()}>
          <HandCoins className="h-4 w-4" /> Pay {chosen.size} · {money(total)}
        </Button>
      </div>
    </Modal>
  );
}

/** People exist, but none were on payroll in this month — say why, rather than "nobody". */
export function NobodyThisMonth({ month, people, onTeam }: { month: string; people: { name: string; joinDate: string | null; leftDate: string | null }[]; onTeam: () => void }) {
  const later = people.filter((p) => p.joinDate && p.joinDate.slice(0, 7) > month);
  const gone = people.filter((p) => p.leftDate && p.leftDate.slice(0, 7) < month);
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Users className="h-6 w-6 text-slate-400" />
        </span>
        <div className="font-bold text-slate-800">Nobody was on payroll in {monthName(month)}</div>
        <p className="max-w-md text-sm text-slate-500">
          {later.length > 0 && `${later.map((p) => p.name).join(", ")} joined later. `}
          {gone.length > 0 && `${gone.map((p) => p.name).join(", ")} had left. `}
          A month counts the people whose dates cover it.
        </p>
        <Button variant="ghost" onClick={onTeam}>
          <FileText className="h-4 w-4" /> See the team
        </Button>
      </div>
    </Card>
  );
}
