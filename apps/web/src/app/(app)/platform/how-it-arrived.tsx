"use client";

import type { OptionChoice } from "@/lib/resort-options";

/**
 * How a payment reached the platform.
 *
 * The Dues and Charges tabs sent `method: "CASH"` as a literal, so every bKash
 * transfer and every bank transfer was filed as cash. The note it writes
 * ("paid via bKash") is the only record of how the money came in, and it is
 * what a merchant statement has to be reconciled against — a ledger that says
 * cash for all of it cannot be reconciled against anything.
 *
 * The list is not ours to invent. `options.PAYMENT_METHOD.defaults` is a
 * platform setting the super admin can already edit, which is the same lesson
 * lib/resort-options.ts records for the resort screens: four hardcoded copies
 * of the same array, one of them missing a method, and none of them changeable
 * by the person whose money it was.
 */

/** Cash, because money can be handed over before any screen has loaded. */
/** Moved to `@rh/shared` so the app offers the same methods; re-exported for this page. */
export { paymentMethodsFrom } from "@rh/shared";

export function HowItArrived({
  methods,
  what,
  onPick,
  onCancel,
}: {
  methods: OptionChoice[];
  /** what is being collected, so the wrong row cannot be marked paid */
  what?: string;
  onPick: (code: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <div className="text-sm font-bold text-slate-900">How did the money arrive?</div>
        {what && <div className="mt-0.5 text-xs text-slate-500">{what}</div>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <button
              key={m.code}
              onClick={() => onPick(m.code)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
            >
              {m.label || m.code}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
