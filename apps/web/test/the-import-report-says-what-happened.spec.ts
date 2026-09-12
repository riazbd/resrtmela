/**
 * What the import report calls each row.
 *
 * The Row detail table borrowed the booking-state badge to get its colours,
 * and took the state's words with them. So a row the importer skipped was
 * labelled "Cancelled", a row it imported said "Confirmed", and a room marked
 * out of service — which creates no booking at all — was reported as a guest
 * who did not turn up.
 *
 * Nobody reading that table is looking at booking states. They are looking at
 * what the importer did with each line of their spreadsheet, and those are
 * different words. The colours were the only part worth borrowing.
 */
import { describe, expect, it } from "vitest";
import { IMPORT_OUTCOME } from "@/lib/import-outcomes";

/** Words that belong to a booking, not to a row of somebody's CSV. */
const BOOKING_WORDS = ["confirmed", "cancelled", "no show", "no-show", "pending", "checked in"];

describe("the import report", () => {
  it("has a label for every outcome the API can return", () => {
    expect(Object.keys(IMPORT_OUTCOME).sort()).toEqual(
      ["conflict_no_hold", "imported", "out_of_service", "skipped"].sort(),
    );
  });

  it("never describes a row with a booking state", () => {
    for (const [outcome, { label }] of Object.entries(IMPORT_OUTCOME)) {
      expect(
        BOOKING_WORDS,
        `"${outcome}" is shown as "${label}", which is a booking state, not what the importer did`,
      ).not.toContain(label.toLowerCase());
    }
  });

  it("does not call a blocked room a guest who never arrived", () => {
    expect(IMPORT_OUTCOME.out_of_service.label.toLowerCase()).not.toMatch(/show/);
    // the row exists to say a room was shut, so the label has to say so
    expect(IMPORT_OUTCOME.out_of_service.label.toLowerCase()).toMatch(/room|blocked|service/);
  });
});
