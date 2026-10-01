"use client";

/**
 * Your own pay, if you are on somebody's payroll.
 *
 * A login linked to a person on payroll sees what the owner sees about them:
 * each month, what it was worth, what was handed over and what is left. The
 * owner was being asked these questions by his staff; now they can look.
 * Nothing shows for anybody not on a payroll.
 */

import { MONEY_TONE, monthName, percentOf, type MyPay } from "@rh/shared";
import { client, money } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { Card } from "@/components/ui";
import { StatePill } from "@/components/payroll/bits";

export function MyPayCard() {
  const q = useApi<MyPay>(keys.myPay(), () => client.payroll.mine());
  const places = q.data?.places ?? [];
  if (places.length === 0) return null;
  return (
    <>
      {places.map((p) => (
        <Card key={p.employeeId} title={`My pay — ${p.employer}`}>
          <p className="mb-3 text-sm text-slate-500">
            {p.designation ? `${p.designation} · ` : ""}
            {money(p.salary)} a month
          </p>
          {p.months.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {p.months.map((m) => (
                <li key={m.month} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{monthName(m.month)}</span>
                    <StatePill state={m.state} />
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, percentOf(m.paid, m.due))}%`, background: MONEY_TONE.paid.solid }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                    <span>Worth <b className="text-slate-800">{money(m.due)}</b></span>
                    <span>Received <b className="text-emerald-700">{money(m.paid)}</b></span>
                    {m.advance > 0 && <span>of which advance {money(m.advance)}</span>}
                    {m.bonus > 0 && <span className="text-violet-700">bonus {money(m.bonus)}</span>}
                    {m.deduction > 0 && <span>deduction {money(m.deduction)}</span>}
                    <span>Left <b className={m.remaining > 0 ? "text-amber-700" : "text-emerald-700"}>{money(m.remaining)}</b></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </>
  );
}
