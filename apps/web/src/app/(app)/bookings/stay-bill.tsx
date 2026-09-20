"use client";

import { money, currentMoneyFormat } from "@/lib/api";
import { quoteBill, type BookingQuote } from "@rh/shared";

/**
 * What the stay comes to, above the Advance box.
 *
 * The clerk was asked how much money to take before being told what the stay
 * was worth, so the figure they typed was either a guess or a sum done on
 * paper — and the paper sum could not be right, because the seasonal rate, the
 * resort's standing offers and its tax rules are all decided on the server.
 *
 * It reads like a bill rather than a total because that is what gets read out
 * to the guest: the rooms and their nights, the extra beds, what came off, what
 * tax was added, and only then the number. "Still due" is the last line for the
 * same reason it is on a restaurant bill — it is the one the conversation is
 * actually about once an advance has been agreed.
 *
 * Which rows those are, and in what order, is `quoteBill` in `@rh/shared`:
 * the phone's third booking step reads the same bill to the same guest, and
 * two clients that disagree about a total have overcharged somebody. What is
 * left here is the table.
 */
export function StayBill({ quote, advance, loading }: {
  quote: BookingQuote | null;
  advance: number;
  loading: boolean;
}) {
  if (!quote) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400">
        Pick a room to see what the stay comes to.
      </div>
    );
  }

  const rows = quoteBill(quote, { advance, money: currentMoneyFormat() });

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition-opacity ${loading ? "opacity-50" : ""}`}
      aria-busy={loading}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          This stay
        </span>
        <span className="text-[11px] text-slate-400">
          {quote.nights} night{quote.nights === 1 ? "" : "s"}
        </span>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`align-baseline ${row.kind === "total" ? "border-t border-slate-200" : ""}`}
            >
              <td
                className={`pr-2 ${row.kind === "total" || row.kind === "due" ? "pt-1.5 font-semibold text-slate-900" : row.kind === "advance" ? "py-0.5 text-slate-500" : "py-0.5 text-slate-700"}`}
              >
                {row.label}
                {row.detail && (
                  <span className="ml-1.5 text-[11px] text-slate-400">{row.detail}</span>
                )}
              </td>
              <td
                className={`text-right tabular-nums ${
                  row.kind === "total"
                    ? "pt-1.5 text-base font-bold text-slate-900"
                    : row.kind === "due"
                      ? "font-bold text-red-700"
                      : row.kind === "discount"
                        ? "py-0.5 text-emerald-700"
                        : row.kind === "advance"
                          ? "py-0.5 text-slate-600"
                          : "py-0.5 text-slate-700"
                }`}
              >
                {row.deduction ? "−" : ""}
                {money(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
