/**
 * The lists a resort owns, for the screens that offer them.
 *
 * `["CASH", "BKASH", "NAGAD", "CARD", "BANK"]` was written into four separate
 * dropdowns — bookings twice, payments, and the restaurant ticket — and the
 * restaurant's copy was missing BANK, so a bank transfer there had to be
 * recorded as something it was not. Four copies of a list is how one of them
 * ends up wrong, and none of them could be changed by the owner anyway.
 *
 * One hook over the generic endpoint, so booking sources and activity
 * categories cost a call rather than a new file.
 */
"use client";

import { client } from "@/lib/api";
import { useApi, keys } from "@/lib/query";

export interface OptionChoice {
  code: string;
  label: string;
}

/**
 * The active values of one list.
 *
 * Only active ones: a value the resort switched off keeps its history readable
 * but must not be offered for a new record. `fallback` is what to show when the
 * list has not arrived yet — for payment methods that is cash, because a desk
 * with no connection can still be handed notes.
 */
export function useResortOptions(
  resortId: number | undefined,
  list: string,
  fallback: OptionChoice[] = [],
): OptionChoice[] {
  const q = useApi(
    keys.options(resortId, list),
    () => client.options.list(resortId!, list),
    { enabled: !!resortId },
  );
  const rows = (q.data ?? []).filter((o) => o.active);
  if (!rows.length) return fallback;
  return rows.map((o) => ({ code: o.code, label: o.label }));
}

/** The four money screens all ask this. */
export function usePaymentMethods(resortId: number | undefined): OptionChoice[] {
  return useResortOptions(resortId, "PAYMENT_METHOD", [{ code: "CASH", label: "Cash" }]);
}
