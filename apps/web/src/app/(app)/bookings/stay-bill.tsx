"use client";

import { money } from "@/lib/api";
import type { BookingQuote, QuoteLine } from "@rh/shared";

/**
 * The arithmetic behind a line, in words.
 *
 * Phrased here rather than sent down as a string: the amounts have to be
 * formatted in the resort's own currency and grouping (en-IN groups in lakh),
 * and the console has a Bangla toggle. A server-built sentence can do neither.
 */
function workingOut(line: QuoteLine): string {
  const nights = `${line.nights} night${line.nights === 1 ? "" : "s"}`;
  if (line.kind === "EXTRA_PERSON" && line.persons) {
    return `${line.persons} × ${nights} × ${money(line.unitPrice)}`;
  }
  return `${nights} × ${money(line.unitPrice)}`;
}

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
  const due = Math.max(0, quote.total - (advance || 0));
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
          {quote.lines.map((line, i) => (
            <tr key={`${line.kind}-${line.label}-${i}`} className="align-baseline">
              <td className="py-0.5 pr-2 text-slate-700">
                {line.label}
                <span className="ml-1.5 text-[11px] text-slate-400">{workingOut(line)}</span>
              </td>
              <td className="py-0.5 text-right tabular-nums text-slate-700">{money(line.amount)}</td>
            </tr>
          ))}

          {quote.discount > 0 && (
            <tr className="align-baseline">
              <td className="py-0.5 pr-2 text-slate-700">
                Discount
                {/* a discount nobody typed needs saying so, or it reads as a mistake */}
                {quote.discountIsAutomatic && (
                  <span className="ml-1.5 text-[11px] text-slate-400">standing offer</span>
                )}
              </td>
              <td className="py-0.5 text-right tabular-nums text-emerald-700">−{money(quote.discount)}</td>
            </tr>
          )}

          {/*
            * A rule that adds nothing to this bill does not belong on it. The
            * resort's set includes a rate for the restaurant, and printing
            * "VAT on food 5% ৳0.00" under a room-only stay invites the clerk
            * to explain a charge that was never made.
            */}
          {quote.taxLines.filter((t) => t.amount > 0).map((t) => (
            <tr key={t.code} className="align-baseline">
              <td className="py-0.5 pr-2 text-slate-700">
                {t.label}
                <span className="ml-1.5 text-[11px] text-slate-400">{t.ratePct}%</span>
              </td>
              <td className="py-0.5 text-right tabular-nums text-slate-700">{money(t.amount)}</td>
            </tr>
          ))}

          <tr className="border-t border-slate-200">
            <td className="pt-1.5 pr-2 font-semibold text-slate-900">Total</td>
            <td className="pt-1.5 text-right text-base font-bold tabular-nums text-slate-900">
              {money(quote.total)}
            </td>
          </tr>

          {advance > 0 && (
            <>
              <tr>
                <td className="py-0.5 pr-2 text-slate-500">Advance now</td>
                <td className="py-0.5 text-right tabular-nums text-slate-600">−{money(advance)}</td>
              </tr>
              <tr>
                <td className="pr-2 font-semibold text-slate-900">Still due</td>
                <td className="text-right font-bold tabular-nums text-red-700">{money(due)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
