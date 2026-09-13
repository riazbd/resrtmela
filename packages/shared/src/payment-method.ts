/**
 * What to print where a payment's method is, when nobody wrote one down.
 *
 * `payments.method` became nullable on 2026-09-13. Until then the column
 * defaulted to `"CASH"`, and the importer — which had no method column to read
 * — leaned on that default for every row it created. A client's entire
 * imported history therefore claims to be notes in a drawer, and the money
 * report, whose whole job is to separate the cash a manager counts tonight
 * from the transfers they match against a statement, could only ever draw one
 * bar.
 *
 * Null is now allowed so the importer can say what it actually knows. But a
 * null reaching a table cell renders as nothing, and an empty cell in a column
 * of values reads as a broken screen rather than as an answer. So every reader
 * asks here, and they all say the same sentence.
 *
 * In `@rh/shared` because the console, the invoice and the phone each show
 * this column, and three spellings of "unknown" in three places is how a
 * report starts disagreeing with itself.
 */
export const METHOD_NOT_RECORDED = "Not recorded";

export function methodLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  return m === "" ? METHOD_NOT_RECORDED : m;
}
