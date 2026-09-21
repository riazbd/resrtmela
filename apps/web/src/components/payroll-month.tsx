"use client";

/**
 * A month of payroll, drawn once for both panels.
 *
 * A resort and an agency each have a payroll screen, and they were near-copies
 * — the same table, the same Pay button, the same Undo. That was survivable
 * while the row said "PAID" or "DUE"; it is not now that a row carries four
 * numbers that have to agree and a list of payments underneath it. The server
 * already counts a month in one place (`month-of-payroll.ts`); this is the
 * other half of the same argument.
 *
 * What each panel keeps is what actually differs between them: which two
 * calls settle and undo a payment. It used to be two URL-building
 * functions, so a component drew four screens' worth of table and still
 * held its own copy of two routes.
 *
 * **The two buttons are two different acts, and the screen says so.** "Pay
 * salary" settles the month and needs no amount — the server works out what is
 * left, which after a 7,000 advance on a 15,000 wage is 8,000, not 15,000.
 * "Advance" needs an amount, because "give him some money" has no number to
 * invent for it.
 */

import { useState } from "react";
import {
  PAYROLL_PAYMENT_LABELS,
  isPayrollPaymentKind,
  type PayrollPay,
  type PayrollSheet,
} from "@rh/shared";
import { money } from "@/lib/api";
import { Card, Empty, Input, Select, Stat, Td, Th, useToast } from "@/components/ui";
import { Table } from "@/components/patterns";
import { Check, Undo2, Wallet } from "lucide-react";

/** The methods the API accepts on a payroll payment. */
const METHODS = ["CASH", "BKASH", "NAGAD", "BANK", "CARD"] as const;

const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function PayrollMonth({
  sheet,
  month,
  canManage,
  pay,
  undoPay,
  onDone,
}: {
  sheet: PayrollSheet | null;
  month: string;
  canManage: boolean;
  /** how a payment for this employee is made */
  pay: (employeeId: number, body: PayrollPay) => Promise<unknown>;
  /** how one payment is taken back */
  undoPay: (paymentId: number) => Promise<unknown>;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [advanceFor, setAdvanceFor] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function closeAdvance() {
    setAdvanceFor(null);
    setAmount("");
    setNote("");
    setMethod("CASH");
  }

  async function settle(employeeId: number, name: string, remaining: number) {
    // money leaving the resort; Undo beside it has always asked and the action
    // that takes the money did not
    if (!window.confirm(`Pay ${name} ${money(remaining)} to settle ${month}?`)) return;
    setBusy(true);
    try {
      await pay(employeeId, { month, kind: "SALARY" });
      push(`${name}'s salary for ${month} is settled`);
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function giveAdvance(employeeId: number, name: string) {
    const value = Number(amount);
    if (!(value > 0)) {
      push("How much is the advance?", "err");
      return;
    }
    setBusy(true);
    try {
      await pay(employeeId, { month, kind: "ADVANCE", amount: value, method, note: note || undefined });
      push(`${money(value)} advance recorded for ${name}`);
      closeAdvance();
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function undo(paymentId: number, label: string) {
    if (!window.confirm(`Undo this ${label.toLowerCase()}?`)) return;
    try {
      await undoPay(paymentId);
      onDone();
    } catch (ex) {
      push((ex as Error).message, "err");
    }
  }

  return (
    <>
      {sheet && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Staff" value={String(sheet.totals.headcount)} />
          <Stat label="Settled" value={`${sheet.totals.settledCount}/${sheet.totals.headcount}`} />
          <Stat label="Wage bill" value={money(sheet.totals.expected)} />
          {/* advances stand apart from the bill: the owner's question is not
              "what have we paid" but "what did we hand out early" */}
          <Stat label="Advances" value={money(sheet.totals.advance)} />
          <Stat label="Still due" value={money(sheet.totals.remaining)} />
        </div>
      )}

      <Card title={`Salary sheet — ${month}`}>
        {!sheet ? (
          <Empty msg="Loading…" />
        ) : (
          <>
            <Table minWidth={0} tableClassName="text-sm">
              <thead>
                <tr>
                  <Th>Staff</Th>
                  <Th>Salary</Th>
                  <Th>Taken</Th>
                  <Th>Due</Th>
                  <Th>Payments</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-slate-100 align-top">
                    <Td>
                      <div className="font-semibold text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.designation ?? ""}</div>
                    </Td>
                    <Td>{money(r.salary)}</Td>
                    <Td>
                      <div>{money(r.paid)}</div>
                      {r.advance > 0 && (
                        <div className="text-xs text-amber-600">{money(r.advance)} in advance</div>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          r.settled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.settled ? "SETTLED" : money(r.remaining)}
                      </span>
                    </Td>
                    {/* every payment, not just the last: an advance the owner
                        has forgotten is the number they came here to find */}
                    <Td className="text-xs text-slate-500">
                      {r.payments.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="space-y-0.5">
                          {r.payments.map((p) => {
                            const label = isPayrollPaymentKind(p.kind)
                              ? PAYROLL_PAYMENT_LABELS[p.kind]
                              : p.kind;
                            return (
                              <li key={p.id} className="flex items-baseline gap-1.5">
                                <span
                                  className={`font-semibold ${
                                    p.kind === "ADVANCE" ? "text-amber-600" : "text-slate-600"
                                  }`}
                                >
                                  {label}
                                </span>
                                <span>{money(p.amount)}</span>
                                <span className="text-slate-400">
                                  · {dmy(p.paidAt)}
                                  {p.method ? ` · ${p.method}` : ""}
                                </span>
                                {canManage && (
                                  <button
                                    onClick={() => undo(p.id, label)}
                                    title={`Undo this ${label.toLowerCase()}`}
                                    className="text-slate-400 hover:text-red-600"
                                  >
                                    <Undo2 className="inline h-3 w-3" />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {r.payments.some((p) => p.note) && (
                        <div className="mt-0.5 italic text-slate-400">
                          {r.payments.filter((p) => p.note).map((p) => p.note).join(" · ")}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {advanceFor === r.employeeId ? (
                        <div className="w-full max-w-[13rem] space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-2 text-left">
                          <p className="text-[11px] font-semibold text-amber-800">
                            Advance for {r.name}
                          </p>
                          <Input
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            inputMode="decimal"
                            placeholder="How much?"
                            className="!py-1 text-xs"
                          />
                          <Select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="!py-1 text-xs"
                          >
                            {METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </Select>
                          <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What for? (optional)"
                            className="!py-1 text-xs"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => giveAdvance(r.employeeId, r.name)}
                              disabled={busy}
                              className="rounded-lg border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                            >
                              Record it
                            </button>
                            <button
                              onClick={closeAdvance}
                              disabled={busy}
                              className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canManage && (
                            <button
                              onClick={() => {
                                closeAdvance();
                                setAdvanceFor(r.employeeId);
                              }}
                              className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              <Wallet className="inline h-3.5 w-3.5" /> Advance
                            </button>
                          )}
                          {/* nothing to settle on a month already covered */}
                          {canManage && !r.settled && (
                            <button
                              onClick={() => settle(r.employeeId, r.name, r.remaining)}
                              disabled={busy}
                              className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <Check className="inline h-3.5 w-3.5" /> Pay {money(r.remaining)}
                            </button>
                          )}
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {sheet.rows.length === 0 && <Empty msg="No active staff yet — add them below" />}
          </>
        )}
      </Card>
    </>
  );
}
