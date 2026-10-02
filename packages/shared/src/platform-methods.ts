/**
 * How money can reach the platform, from its own settings — the list the
 * console and the app both offer when a due, a charge or a credit order is
 * marked paid. Three plain methods when the setting is missing or broken,
 * so marking something paid never has no way to say how.
 */
export interface MethodChoice {
  code: string;
  label: string;
}

const FALLBACK: MethodChoice[] = [
  { code: "CASH", label: "Cash" },
  { code: "BKASH", label: "bKash" },
  { code: "BANK", label: "Bank transfer" },
];

export function paymentMethodsFrom(settings: Record<string, string>): MethodChoice[] {
  const raw = settings["options.PAYMENT_METHOD.defaults"];
  if (!raw) return FALLBACK;
  try {
    const parsed = JSON.parse(raw) as MethodChoice[];
    const usable = parsed.filter((m) => m && typeof m.code === "string" && m.code);
    return usable.length ? usable : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** What each kind of money the platform received is called. */
export const PLATFORM_MONEY_KIND: Record<string, string> = {
  SUBSCRIPTION: "Subscription",
  CHARGE: "Charge",
  WALLET_TOPUP: "Wallet top-up",
};
