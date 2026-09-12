/**
 * `21-Aug-26` is the 21st of August, not the 20th.
 *
 * Reported after importing a real booking sheet: every date landed one day
 * early. It was not a timezone bug in the way those usually are — the other
 * branches of `parseSheetDate` all build UTC midnight correctly. It was the
 * year.
 *
 * The day-month-year pattern insists on four digits, and a resort's sheet
 * writes two: `17-Aug-26`, `21-Aug-26`. Nothing matched, so the value fell
 * through to `new Date(s)`, which reads it as *local* midnight. In Dhaka
 * (UTC+6) local midnight on the 21st is 18:00 UTC on the 20th, and every
 * reader that takes the UTC date part — which is all of them, because every
 * other branch stores UTC midnight — saw the 20th.
 *
 * The sheet in hand has 168 rows and every date in it is two-digit, so this
 * was not an edge case; it was the file.
 */
import { describe, expect, it } from "vitest";
import { parseSheetDate } from "../src/import/csv";

const iso = (raw: string) => parseSheetDate(raw)?.toISOString() ?? null;

describe("a two-digit year", () => {
  it("reads 21-Aug-26 as the 21st of August 2026", () => {
    expect(iso("21-Aug-26")).toBe("2026-08-21T00:00:00.000Z");
  });

  it("keeps every date in the sample sheet on its own day", () => {
    // the first, last and a month boundary from resort-mela-sample-bookings.csv
    expect(iso("17-Aug-26")).toBe("2026-08-17T00:00:00.000Z");
    expect(iso("31-Aug-26")).toBe("2026-08-31T00:00:00.000Z");
    expect(iso("1-Sep-26")).toBe("2026-09-01T00:00:00.000Z");
    expect(iso("4-Sep-26")).toBe("2026-09-04T00:00:00.000Z");
    expect(iso("16-Aug-27")).toBe("2027-08-16T00:00:00.000Z");
  });

  it("still reads a four-digit year the same way it always did", () => {
    expect(iso("17-Aug-2026")).toBe("2026-08-17T00:00:00.000Z");
    expect(iso("8/18/2026")).toBe("2026-08-18T00:00:00.000Z");
    expect(iso("2026-09-05")).toBe("2026-09-05T00:00:00.000Z");
  });

  it("reads a two-digit year in the slash format too", () => {
    // the same sheet exported from a different spreadsheet writes M/D/YY
    expect(iso("8/18/26")).toBe("2026-08-18T00:00:00.000Z");
  });

  it("puts a two-digit year in this century", () => {
    /**
     * A booking sheet is about now. `26` is 2026, and `99` on a resort's
     * register is a typo rather than 1999 — but it is somebody's typo, not
     * ours to reinterpret as 2099 either. Both land in the 2000s, where a
     * human reading the row can see what happened.
     */
    expect(iso("1-Jan-00")).toBe("2000-01-01T00:00:00.000Z");
    expect(iso("31-Dec-99")).toBe("2099-12-31T00:00:00.000Z");
  });

  it("is not confused by a day that could pass for a year", () => {
    expect(iso("26-Aug-26")).toBe("2026-08-26T00:00:00.000Z");
  });

  it("still refuses what it cannot read", () => {
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("tbd")).toBeNull();
    expect(parseSheetDate("31-Smarch-26")).toBeNull();
  });
});
