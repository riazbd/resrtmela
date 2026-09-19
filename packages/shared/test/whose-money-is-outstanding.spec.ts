/**
 * Splitting one red total into two questions (2026-09-20).
 *
 * A guest's balance is collected at the desk on the morning they leave. An
 * agency's is a trade account settled between two businesses. They were one
 * table and one number until the dues report learned to tell them apart, and
 * the front desk read a guest's name beside money that guest does not owe.
 *
 * The console does that split inline, in its page file. The phone needs the
 * same three lenses, and two screens that each decide for themselves what
 * counts as an agency booking is the disagreement this package exists to
 * prevent — especially since the rule is one an eye skips over: it is the
 * *agent* on the row that decides, not who the money is from.
 */
import { describe, expect, it } from "vitest";
import { DUES_LENSES, duesThrough, type DuesLens } from "../src/index";
import type { DuesReport } from "../src/api-types";

const row = (over: Partial<DuesReport["rows"][number]> = {}): DuesReport["rows"][number] =>
  ({
    id: 41,
    code: "BK-00041",
    state: "CONFIRMED",
    guest: { fullName: "Rafiq Hasan", phone: "01811110001" },
    agent: null,
    checkIn: "2026-09-18",
    checkOut: "2026-09-20",
    rooms: 1,
    nights: 2,
    rent: 9000,
    discount: 0,
    tax: 0,
    total: 9000,
    paid: 5000,
    due: 4000,
    ...over,
  }) as DuesReport["rows"][number];

const soldByAnAgency = row({
  id: 42,
  code: "BK-00042",
  agent: { id: 7, name: "Riaz", accountId: 6, agency: "Demo Travels" },
  due: 23000,
});

const report: DuesReport = {
  total: 27000,
  count: 2,
  guestTotal: 4000,
  guestCount: 1,
  agencyTotal: 23000,
  agencyCount: 1,
  byAgency: [{ accountId: 6, agency: "Demo Travels", bookings: 1, due: 23000 }],
  rows: [row(), soldByAnAgency],
};

describe("the three lenses", () => {
  it("are named once, so both clients offer the same three", () => {
    expect(DUES_LENSES).toEqual(["Everyone", "Guests", "Agencies"]);
  });

  it("shows everything, and the report's own totals, by default", () => {
    const seen = duesThrough(report, "Everyone");
    expect(seen.rows).toHaveLength(2);
    expect(seen.total).toBe(27000);
    expect(seen.count).toBe(2);
  });

  /**
   * It is the agent on the row that decides, not the guest. A booking a
   * resort took itself has no agent; one an agency sold has one, whoever
   * eventually hands over the money.
   */
  it("keeps only what a guest will be asked for", () => {
    const seen = duesThrough(report, "Guests");
    expect(seen.rows.map((r) => r.code)).toEqual(["BK-00041"]);
    expect(seen.total).toBe(4000);
    expect(seen.count).toBe(1);
  });

  it("keeps only what an agency will be invoiced for", () => {
    const seen = duesThrough(report, "Agencies");
    expect(seen.rows.map((r) => r.code)).toEqual(["BK-00042"]);
    expect(seen.total).toBe(23000);
    expect(seen.count).toBe(1);
  });

  /**
   * The totals come off the report, not off the rows. The API computes them
   * with the tax rules and the report is paged in principle; adding the rows
   * up here would be a second, quieter implementation of the same sum, and
   * the first time they disagreed nobody would know which was right.
   */
  it("takes its totals from the report rather than adding the rows up", () => {
    const lying: DuesReport = { ...report, guestTotal: 1 };
    expect(duesThrough(lying, "Guests").total).toBe(1);
  });
});

describe("how many each lens would show", () => {
  it("answers without filtering, because a tab needs the number before it is picked", () => {
    const counts = (["Everyone", "Guests", "Agencies"] as DuesLens[]).map(
      (lens) => duesThrough(report, lens).count,
    );
    expect(counts).toEqual([2, 1, 1]);
  });
});

describe("a resort that owes nothing", () => {
  it("is empty through every lens without throwing", () => {
    const clean: DuesReport = {
      total: 0, count: 0,
      guestTotal: 0, guestCount: 0,
      agencyTotal: 0, agencyCount: 0,
      byAgency: [], rows: [],
    };
    for (const lens of DUES_LENSES) {
      expect(duesThrough(clean, lens)).toEqual({ rows: [], total: 0, count: 0 });
    }
  });
});
