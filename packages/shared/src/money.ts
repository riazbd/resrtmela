/**
 * How money is printed, and why it is its own module.
 *
 * `quote-bill`, `stay-bill` and `room-status` all need `formatMoney`, and
 * all three took it from `./index` — which re-exports them. That is a
 * require cycle, and Metro says so on every launch of the app:
 *
 *     Require cycle: packages/shared/src/index.ts ->
 *     packages/shared/src/quote-bill.ts -> packages/shared/src/index.ts
 *     Require cycles are allowed, but can result in uninitialized values.
 *
 * Found by opening the app on a real phone. A bundler resolves it by
 * evaluation order, so whichever module loses the race sees `undefined`
 * where `formatMoney` should be — and *the API renders invoices with this
 * function*, so the failure it would eventually cause is a blank amount on
 * a bill a guest keeps.
 *
 * So money sits at the bottom of the graph, importing nothing of ours.
 * `index` re-exports it, and every existing call site is unchanged.
 */

// ───────────────────────── Money formatting ─────────────────────────

/**
 * Currency and locale belong to the tenant, not to the binary.
 *
 * `narrowSymbol` is what keeps ৳ rather than the "BDT" ICU otherwise prints
 * for Bangla taka, and it gives $ and ₹ for the currencies a second tenant
 * might use — one rule, no symbol table to maintain.
 *
 * The defaults reproduce exactly what the console rendered when the taka sign
 * was hard-coded, so existing tenants see no change. en-IN rather than en-BD
 * is deliberate: Bangladesh groups in lakh and crore, and ICU's en-BD does not.
 */
export const DEFAULT_CURRENCY = "BDT";
export const DEFAULT_LOCALE = "en-IN";

export interface MoneyFormat {
  currency?: string;
  locale?: string;
  /** fraction digits; 0 for compact displays like stat tiles */
  decimals?: number;
}

/**
 * The symbol, written down, for the currencies this platform serves.
 *
 * `currencyDisplay: "narrowSymbol"` is the correct request and it is not
 * enough. Hermes — the engine the phone runs on — ships without full ICU:
 * `Intl.NumberFormat` exists, it does not throw, it groups the digits
 * correctly, and it answers every currency with its *code*. So the first
 * real build's dashboard read "BDT 39,500" where every browser had shown
 * "৳39,500", and the longer prefix wrapped the figure mid-number.
 *
 * Nothing failed. The app simply spoke a different language about money
 * than the console did, to the same owner about the same resort — which
 * is the same shape of defect `MONTHS_SHORT` exists to prevent in
 * `day-label.ts`, and it is fixed the same way: write the handful of
 * values down, and ask the engine only for what every engine gets right.
 *
 * A currency that is not here is left to ICU. "AED 1,000" is what a
 * reader expects, and inventing a glyph would be worse than the code.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  THB: "฿",
  JPY: "¥",
  CNY: "¥",
  LKR: "Rs",
  NPR: "Rs",
  PKR: "Rs",
};

export function formatMoney(
  amount: number | string | null | undefined,
  format: MoneyFormat = {},
): string {
  const n = amount == null || amount === "" ? 0 : Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const currency = format.currency || DEFAULT_CURRENCY;
  const locale = format.locale || DEFAULT_LOCALE;
  const decimals = format.decimals ?? 2;

  /**
   * A figure that rounds away to nothing is nothing, and nothing has no
   * sign. Without this, −৳0.40 at whole-taka precision prints "-৳0",
   * which reads as a debt of zero — a sentence with no meaning on a
   * bill.
   */
  const value = Number(safe.toFixed(decimals)) === 0 ? 0 : safe;

  const known = CURRENCY_SYMBOLS[currency.toUpperCase()];

  try {
    const printed = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

    /**
     * ICU answered with a symbol: keep every bit of it.
     *
     * **Where the symbol goes is the locale's business, not ours.**
     * German and French put the euro after the number — "1.234,50 €" —
     * and the first version of this fix placed every known symbol in
     * front, which would have been wrong for both. The API renders
     * invoices with this function, so that would have been wrong on
     * paper a guest keeps.
     */
    if (!known || !printed.includes(currency.toUpperCase())) return printed;

    /**
     * ICU gave back the *code*, which is Hermes without full currency
     * data: `Intl.NumberFormat` exists, does not throw, groups the
     * digits correctly, and hands back "BDT" where "৳" belongs. Nothing
     * fails — the app simply speaks a different language about money
     * than the console does, to the same owner about the same resort.
     *
     * So only the code is replaced, and the position ICU chose for it
     * is left alone. The space beside it goes with it: "BDT 39,500"
     * becomes "৳39,500" rather than "৳ 39,500".
     */
    const code = currency.toUpperCase();
    // the separator ICU puts beside a code is a non-breaking space, not a
    // plain one, so both are matched — and it goes with the code, because
    // "৳ 39,500" is not how anybody writes taka
    return printed.replace(new RegExp(`[\\s ]?${code}[\\s ]?`), known);
  } catch {
    // an unknown currency or malformed locale must not blank out a screen
    try {
      return `${currency} ${value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    } catch {
      return `${currency} ${value.toFixed(decimals)}`;
    }
  }
}

/** Just the symbol — for field labels like "Base rate (৳/night)". */
export function currencySymbol(format: MoneyFormat = {}): string {
  const currency = format.currency || DEFAULT_CURRENCY;
  const known = CURRENCY_SYMBOLS[currency.toUpperCase()];
  if (known) return known;
  try {
    return (
      new Intl.NumberFormat(format.locale || DEFAULT_LOCALE, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}
