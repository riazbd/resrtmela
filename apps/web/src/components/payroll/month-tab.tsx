"use client";

/**
 * A month of payroll: what it is worth, what has gone, what is left — for
 * everyone together, then person by person.
 *
 * Each row answers the owner's question about one person without arithmetic:
 * what the month is worth to them and why (the days, the bonus, the
 * deduction), how much of it has been handed over (a bar, and the advances in
 * it), and what is left, including anything earlier months still have.
 */

import { Fragment, useState } from "react";
import {
  Banknote,
  ChevronDown,
  Gift,
  HandCoins,
  MinusCircle,
  Printer,
  Undo2,
  Wallet,
  CircleAlert,
} from "lucide-react";
import { MONEY_TONE, monthName, percentOf, type PayrollSheet } from "@rh/shared";
import { money } from "@/lib/api";
import { useApi } from "@/lib/query";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner, useToast } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { KpiCard, Meter } from "@/components/charts";
import type { PayrollAdapter } from "./adapter";
import { LoginChip, MonthStepper, StatePill } from "./bits";
import { printPayslips } from "./payslip";

type Row = PayrollSheet["rows"][number];

/** The methods the API accepts on a payroll payment. */
const METHODS = ["CASH", "BKASH", "NAGAD", "BANK", "CARD"] as const;

type Act = { row: Row; kind: "ADVANCE" | "PART" | "BONUS" | "DEDUCTION" };

const ACT_WORDS: Record<Act["kind"], { title: string; button: string; help: string }> = {
  ADVANCE: { title: "Advance", button: "Record the advance", help: "Money handed over before the month is settled. It counts towards this month." },
  PART: { title: "Pay part of it", button: "Record the payment", help: "Part of what is left, handed over now. The rest stays to be paid." },
  BONUS: { title: "Bonus", button: "Add the bonus", help: "Raises what this month is worth. Pay it with the rest of the month." },
  DEDUCTION: { title: "Deduction", button: "Take it off", help: "Lowers what this month is worth — a fine, a loan being paid back, days not worked." },
};

const dm = (iso: string | Date) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function MonthTab({ a, month, setMonth }: { a: PayrollAdapter; month: string; setMonth: (m: string) => void }) {
  const { push } = useToast();
  const q = useApi(a.sheetKey(month), () => a.sheet(month), { placeholderData: (prev: PayrollSheet | undefined) => prev });
  const [open, setOpen] = useState<number | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = q.data;

  if (q.error) return <ErrorState error={q.error as Error} />;

  async function settle(r: Row) {
    if (!window.confirm(`Pay ${r.name} ${money(r.remaining)} to settle ${monthName(month)}?`)) return;
    setBusy(true);
    try {
      await a.pay(r.employeeId, { month, kind: "SALARY" });
      push(`${r.name}'s ${monthName(month)} is settled`);
      a.invalidate();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function undo(what: "payment" | "adjustment", id: number, label: string) {
    if (!window.confirm(`Undo this ${label.toLowerCase()}?`)) return;
    try {
      if (what === "payment") await a.undoPay(id);
      else await a.unadjust(id);
      a.invalidate();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  const t = sheet?.totals;
  const salaryPaid = t ? Math.max(0, t.paid - t.advance) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthStepper month={month} now={a.today.slice(0, 7)} onChange={setMonth} />
        {sheet && sheet.rows.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => printPayslips(a.ownerName, month, sheet.rows) || push("Allow pop-ups to print", "err")}>
            <Printer className="h-4 w-4" /> Payslips for everyone
          </Button>
        )}
      </div>

      {!sheet ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="The month is worth" value={money(t!.expected)} tone="#0f172a" icon={<Banknote className="h-3.5 w-3.5" />} sub={`${t!.headcount} ${t!.headcount === 1 ? "person" : "people"} on payroll`} />
            <KpiCard label="Handed over" value={money(t!.paid)} tone={MONEY_TONE.paid.solid} icon={<HandCoins className="h-3.5 w-3.5" />} sub={`${t!.settledCount} of ${t!.headcount} fully paid`} />
            <KpiCard label="Advances in it" value={money(t!.advance)} tone={MONEY_TONE.advance.solid} icon={<Wallet className="h-3.5 w-3.5" />} sub="taken before the month was settled" />
            <KpiCard label="Still to pay" value={money(t!.remaining)} tone={t!.remaining > 0 ? "#b45309" : MONEY_TONE.paid.solid} icon={<CircleAlert className="h-3.5 w-3.5" />} sub={t!.remaining > 0 ? `${100 - percentOf(t!.remaining, t!.expected)}% of the month paid` : "nothing left this month"} />
            <KpiCard label="From earlier months" value={money(t!.arrears)} tone={t!.arrears > 0 ? MONEY_TONE.late.solid : "#94a3b8"} icon={<CircleAlert className="h-3.5 w-3.5" />} sub={t!.arrears > 0 ? "still to pay for months gone by" : "earlier months are clear"} />
          </div>

          {t!.expected > 0 && (
            <Card title={`Where ${monthName(month)} stands`}>
              <Meter
                height={16}
                total={t!.expected}
                format={money}
                parts={[
                  { label: "Paid as salary", value: salaryPaid, color: MONEY_TONE.paid.solid },
                  { label: "Paid as advances", value: t!.advance, color: MONEY_TONE.advance.solid },
                  { label: "Still to pay", value: t!.remaining, color: MONEY_TONE.left.solid },
                ]}
              />
              {(t!.bonus > 0 || t!.deduction > 0) && (
                <p className="mt-2 text-xs text-slate-500">
                  The month includes {t!.bonus > 0 ? <b className="text-violet-700">{money(t!.bonus)} in bonuses</b> : null}
                  {t!.bonus > 0 && t!.deduction > 0 ? " and " : ""}
                  {t!.deduction > 0 ? <b className="text-slate-700">{money(t!.deduction)} deducted</b> : null}.
                </p>
              )}
            </Card>
          )}

          <Card title={`Everyone on ${monthName(month)}`} className="!p-0">
            {sheet.rows.length === 0 ? (
              <Empty msg="Nobody is on payroll this month. Add people on the People tab." />
            ) : (
              <div className="divide-y divide-slate-100">
                {sheet.rows.map((r) => {
                  const expanded = open === r.employeeId;
                  const pct = percentOf(r.paid + r.aheadUsed, r.due);
                  return (
                    <Fragment key={r.employeeId}>
                      <div className="grid grid-cols-3 gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1.4fr)_1fr_1.2fr_1fr_auto] md:items-center">
                        <div className="col-span-3 min-w-0 md:col-span-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-slate-800">{r.name}</span>
                            <StatePill state={r.state} />
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                            {r.designation && <span>{r.designation}</span>}
                            <LoginChip login={r.login} />
                          </div>
                        </div>

                        <div className="text-sm">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">Worth</div>
                          <div className="font-semibold tabular-nums text-slate-800">{money(r.due)}</div>
                          <div className="text-[11px] text-slate-400">
                            {r.days < r.daysInMonth ? `${r.days} of ${r.daysInMonth} days of ${money(r.salary)}` : `salary ${money(r.salary)}`}
                            {r.bonus > 0 && <span className="text-violet-600"> + {money(r.bonus)}</span>}
                            {r.deduction > 0 && <span className="text-slate-600"> − {money(r.deduction)}</span>}
                          </div>
                        </div>

                        <div className="text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] uppercase tracking-wide text-slate-400">Handed over</span>
                            <span className="font-semibold tabular-nums text-slate-800">{money(r.paid)}</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="flex h-full">
                              <div className="rm-grow-x h-full" style={{ width: `${Math.min(100, percentOf(r.paid - r.advance, r.due))}%`, background: MONEY_TONE.paid.solid }} />
                              <div className="rm-grow-x h-full" style={{ width: `${Math.min(100, percentOf(r.advance, r.due))}%`, background: MONEY_TONE.advance.solid }} />
                              <div className="rm-grow-x h-full" style={{ width: `${Math.min(100, percentOf(r.aheadUsed, r.due))}%`, background: MONEY_TONE.bonus.solid }} />
                            </div>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {Math.min(pct, 100)}%{r.advance > 0 && <span className="text-blue-600"> · {money(r.advance)} advance</span>}
                            {r.aheadUsed > 0 && <span className="text-violet-600"> · {money(r.aheadUsed)} paid ahead</span>}
                            {r.over > 0 && <span className="text-blue-600"> · {money(r.over)} carried to next month</span>}
                          </div>
                        </div>

                        <div className="text-sm">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">Left</div>
                          <div className={`font-bold tabular-nums ${r.remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}>{money(r.remaining)}</div>
                          {r.arrears > 0 && <div className="text-[11px] font-medium text-red-600">+ {money(r.arrears)} from earlier months</div>}
                        </div>

                        <div className="col-span-3 flex flex-wrap items-center justify-end gap-1.5 md:col-span-1">
                          {a.canManage && r.remaining > 0 && (
                            <Button size="sm" onClick={() => settle(r)} disabled={busy}>
                              Pay {money(r.remaining)}
                            </Button>
                          )}
                          {a.canManage && (
                            <Button size="sm" variant="ghost" onClick={() => setAct({ row: r, kind: "ADVANCE" })}>
                              <Wallet className="h-3.5 w-3.5 text-blue-600" /> Advance
                            </Button>
                          )}
                          <button onClick={() => setOpen(expanded ? null : r.employeeId)} aria-expanded={expanded} aria-label={`More for ${r.name}`} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50">
                            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="grid gap-4 bg-slate-50/70 px-4 py-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1.5 text-xs font-semibold text-slate-600">Handed over in {monthName(month)}</div>
                            {r.payments.length === 0 ? (
                              <p className="text-xs text-slate-400">Nothing yet.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {r.payments.map((p) => (
                                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-100">
                                    <span className="min-w-0 truncate">
                                      <b className={p.kind === "ADVANCE" ? "text-blue-700" : "text-emerald-700"}>{p.kind === "ADVANCE" ? "Advance" : "Salary"}</b>
                                      <span className="text-slate-400"> · {dm(p.paidAt)}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <b className="tabular-nums">{money(p.amount)}</b>
                                      {a.canManage && (
                                        <button onClick={() => undo("payment", p.id, p.kind === "ADVANCE" ? "advance" : "payment")} title="Undo" className="text-slate-400 hover:text-red-600">
                                          <Undo2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <div className="mb-1.5 text-xs font-semibold text-slate-600">Bonuses and deductions</div>
                            {r.adjustments.length === 0 ? (
                              <p className="text-xs text-slate-400">None this month.</p>
                            ) : (
                              <ul className="space-y-1 text-sm">
                                {r.adjustments.map((x) => (
                                  <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-100">
                                    <span className="min-w-0 truncate">
                                      <b className={x.kind === "BONUS" ? "text-violet-700" : "text-slate-700"}>{x.kind === "BONUS" ? "Bonus" : "Deduction"}</b>
                                      {x.note && <span className="text-slate-400"> · {x.note}</span>}
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <b className="tabular-nums">{x.kind === "BONUS" ? "+" : "−"} {money(x.amount)}</b>
                                      {a.canManage && (
                                        <button onClick={() => undo("adjustment", x.id, x.kind === "BONUS" ? "bonus" : "deduction")} title="Undo" className="text-slate-400 hover:text-red-600">
                                          <Undo2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {a.canManage && (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => setAct({ row: r, kind: "BONUS" })}>
                                    <Gift className="h-3.5 w-3.5 text-violet-600" /> Bonus
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setAct({ row: r, kind: "DEDUCTION" })}>
                                    <MinusCircle className="h-3.5 w-3.5" /> Deduction
                                  </Button>
                                  {r.remaining > 0 && (
                                    <Button size="sm" variant="ghost" onClick={() => setAct({ row: r, kind: "PART" })}>
                                      <HandCoins className="h-3.5 w-3.5 text-emerald-600" /> Pay part
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => printPayslips(a.ownerName, month, [r]) || push("Allow pop-ups to print", "err")}>
                                <Printer className="h-3.5 w-3.5" /> Payslip
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {act && <ActForm a={a} month={month} act={act} onClose={() => setAct(null)} />}
    </div>
  );
}

/** One form for the four things done to a month: advance, part payment, bonus, deduction. */
function ActForm({ a, month, act, onClose }: { a: PayrollAdapter; month: string; act: Act; onClose: () => void }) {
  const { push } = useToast();
  const [amount, setAmount] = useState(act.kind === "PART" ? "" : "");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const words = ACT_WORDS[act.kind];
  const isPayment = act.kind === "ADVANCE" || act.kind === "PART";

  async function save() {
    const value = Number(amount);
    if (!(value > 0)) {
      push("Put in the amount", "err");
      return;
    }
    setBusy(true);
    try {
      if (isPayment) {
        await a.pay(act.row.employeeId, {
          month,
          kind: act.kind === "ADVANCE" ? "ADVANCE" : "SALARY",
          amount: value,
          method,
          note: note || undefined,
        });
      } else {
        await a.adjust(act.row.employeeId, { month, kind: act.kind, amount: value, note: note || undefined });
      }
      push(`${words.title} of ${money(value)} recorded for ${act.row.name}`);
      a.invalidate();
      onClose();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${words.title} — ${act.row.name}, ${monthName(month)}`}>
      <p className="mb-3 text-sm text-slate-500">{words.help}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How much?" hint={act.kind === "PART" ? `${money(act.row.remaining)} is left` : undefined}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        {isPayment && (
          <Field label="Paid by">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={act.kind === "DEDUCTION" ? "Why?" : "What for?"} hint="optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save}>
          {words.button}
        </Button>
      </div>
    </Modal>
  );
}
