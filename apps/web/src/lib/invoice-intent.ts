/**
 * Why the invoice page was opened.
 *
 * The owner asked for the choice to be offered when the invoice is made:
 * download it, or print it. What existed was one link that opened the invoice
 * and fired the print dialog at it — so saving a copy meant letting a dialog
 * open, dismissing it, finding a second button, and pressing that.
 *
 * The intent travels in the URL because the two halves live on different
 * screens: the bookings row writes it, the invoice page reads it. Keeping both
 * halves here is what stops them drifting — the old reader matched on
 * `search.includes("print=1")`, which is also true of `?noprint=1`.
 */
export type InvoiceIntent = "print" | "download" | "view";

/** Reads a `window.location.search`. */
export function invoiceIntent(search: string): InvoiceIntent {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const on = (key: string) => params.get(key) === "1";
  // download wins if somebody asks for both: a print dialog opening over a
  // file save is the worse of the two mistakes to make
  if (on("download")) return "download";
  if (on("print")) return "print";
  return "view";
}

/** Writes the link a bookings row puts on an invoice button. */
export function invoiceHref(bookingId: number, intent: InvoiceIntent): string {
  if (intent === "view") return `/invoice/${bookingId}`;
  return `/invoice/${bookingId}?${intent}=1`;
}
