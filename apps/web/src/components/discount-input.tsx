"use client";

import { DISCOUNT_KINDS, type DiscountKind } from "@rh/shared";
import { cur } from "@/lib/api";
import { Input } from "@/components/ui";

/**
 * A discount, and whether it is money or a percentage.
 *
 * One box with a switch beside it rather than two boxes: a booking has one
 * discount, and two inputs invite somebody to fill both. The switch reads the
 * kinds from `DISCOUNT_KINDS`, so the form offers exactly what the API accepts.
 *
 * Not wrapped in `Field`, which is a `<label>`: a label around the switch's
 * buttons would send a tap on them to the number box.
 */
export function DiscountInput({ kind, value, onChange, label = "Discount" }: {
  kind: DiscountKind;
  value: number;
  onChange: (next: { kind: DiscountKind; value: number }) => void;
  label?: string;
}) {
  const symbol = (k: DiscountKind) => (k === "PERCENT" ? "%" : cur());
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex gap-1.5">
        <Input
          type="number"
          min={0}
          max={kind === "PERCENT" ? 100 : undefined}
          step="any"
          aria-label={`${label} (${symbol(kind)})`}
          value={value}
          onChange={(e) => onChange({ kind, value: Math.max(0, Number(e.target.value)) })}
        />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Discount type">
          {DISCOUNT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => onChange({ kind: k, value: k === "PERCENT" ? Math.min(value, 100) : value })}
              className={`min-w-9 px-2.5 text-sm font-semibold transition ${
                kind === k ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {symbol(k)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
