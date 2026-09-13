/**
 * A price is a ladder, and the plan carries it.
 *
 * The platform sold one price per rhythm: `monthlyFee`, `yearlyFee`, and a
 * `BILLING_CYCLES` array in code naming the only two rhythms that could ever
 * exist. Offering "free for a week, then half price for six months, then the
 * list price" needed a migration and a deploy — which is to say the owner
 * could not do it at all.
 *
 * So a plan carries schedules, a schedule carries phases, and a phase is the
 * only thing that knows a price: how long one period lasts, what it costs, and
 * how many times it repeats before the next phase takes over. The last phase
 * runs forever, which is what makes the ladder terminate in a real price
 * rather than falling off its own end.
 *
 * Nothing here touches a database, because none of it is a lookup: which phase
 * period 14 falls in, and what date it starts, is arithmetic. It lives in
 * `@rh/shared` because the billing sweep, the pricing page, the signup summary
 * and the owner's own billing screen all four have to answer it the same way —
 * the mistake this codebase has already paid for once, with three private
 * copies of `addMonths` that agreed with each other and disagreed with the
 * calendar.
 */
import { describe, expect, it } from "vitest";
import {
  addPeriod,
  periodAt,
  phasesAreSane,
  scheduleSentence,
  perMonthEquivalent,
  type Phase,
} from "../src/plan-schedule";

/** The ladder the whole file is about, written once. */
const LADDER: Phase[] = [
  { seq: 1, count: 7, unit: "DAY", price: 0, repeats: 1 },
  { seq: 2, count: 1, unit: "MONTH", price: 500, repeats: 6 },
  { seq: 3, count: 1, unit: "MONTH", price: 1500, repeats: null },
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("moving a date by one period", () => {
  it("counts days, weeks, months and years", () => {
    expect(iso(addPeriod(day("2026-01-10"), 7, "DAY"))).toBe("2026-01-17");
    expect(iso(addPeriod(day("2026-01-10"), 2, "WEEK"))).toBe("2026-01-24");
    expect(iso(addPeriod(day("2026-01-10"), 3, "MONTH"))).toBe("2026-04-10");
    expect(iso(addPeriod(day("2026-01-10"), 1, "YEAR"))).toBe("2027-01-10");
  });

  /**
   * The bug in all three copies of `addMonths`, which used `setMonth` and let
   * it overflow. A subscription that started on the 31st renewed on 2026-03-03
   * — February never became a period at all — and every renewal after that
   * inherited the drift. The 31st of a month with no 31st is its last day.
   */
  it("clamps to the end of a short month instead of overflowing into the next", () => {
    expect(iso(addPeriod(day("2026-01-31"), 1, "MONTH"))).toBe("2026-02-28");
    expect(iso(addPeriod(day("2026-03-31"), 1, "MONTH"))).toBe("2026-04-30");
    expect(iso(addPeriod(day("2026-08-31"), 1, "MONTH"))).toBe("2026-09-30");
  });

  it("clamps a leap day to the 28th rather than sliding into March", () => {
    expect(iso(addPeriod(day("2024-02-29"), 1, "YEAR"))).toBe("2025-02-28");
  });

  /**
   * Clamping must not become a ratchet. Jan 31 → Feb 28 is right; Feb 28 →
   * Mar 28 would quietly move a subscription off the 31st forever. Every date
   * is computed from the period the schedule started on, so the anchor is an
   * argument, not the previous result.
   */
  it("returns to the anchor day once the month is long enough again", () => {
    const start = day("2026-01-31");
    expect(iso(addPeriod(start, 1, "MONTH"))).toBe("2026-02-28");
    expect(iso(addPeriod(start, 2, "MONTH"))).toBe("2026-03-31");
    expect(iso(addPeriod(start, 3, "MONTH"))).toBe("2026-04-30");
  });

  it("stays at UTC midnight, because every reader takes the UTC date part", () => {
    expect(addPeriod(day("2026-01-10"), 1, "MONTH").toISOString()).toBe(
      "2026-02-10T00:00:00.000Z",
    );
  });
});

describe("which rung a period falls on", () => {
  it("gives the first period the first phase", () => {
    expect(periodAt(LADDER, 0)).toMatchObject({ price: 0, count: 7, unit: "DAY" });
  });

  it("moves on once a phase has repeated as many times as it says", () => {
    expect(periodAt(LADDER, 1).price).toBe(500);
    expect(periodAt(LADDER, 6).price).toBe(500);
    expect(periodAt(LADDER, 7).price).toBe(1500);
  });

  it("keeps the last phase forever, however long the account stays", () => {
    expect(periodAt(LADDER, 700).price).toBe(1500);
  });

  it("says which rung it used, so a subscription can store where it is", () => {
    expect(periodAt(LADDER, 3).seq).toBe(2);
  });

  it("handles the ordinary plan, which is one price and no ladder at all", () => {
    const flat: Phase[] = [{ seq: 1, count: 1, unit: "MONTH", price: 1000, repeats: null }];
    expect(periodAt(flat, 0).price).toBe(1000);
    expect(periodAt(flat, 99).price).toBe(1000);
  });
});

describe("a schedule that would not terminate", () => {
  it("accepts a ladder whose last phase runs forever", () => {
    expect(phasesAreSane(LADDER)).toBeNull();
  });

  /**
   * The one rule worth enforcing. A bounded last phase means period N+1 has no
   * price, and the sweep would either bill nothing or throw in the middle of a
   * transaction that has already written a due.
   */
  it("refuses one whose last phase stops, because the next period has no price", () => {
    const falls: Phase[] = [{ seq: 1, count: 1, unit: "MONTH", price: 500, repeats: 6 }];
    expect(phasesAreSane(falls)).toMatch(/forever/i);
  });

  it("refuses an empty schedule rather than inventing a free one", () => {
    expect(phasesAreSane([])).toBeTruthy();
  });

  it("refuses a phase that repeats zero times, which is a rung nobody stands on", () => {
    const ghost: Phase[] = [
      { seq: 1, count: 1, unit: "MONTH", price: 500, repeats: 0 },
      { seq: 2, count: 1, unit: "MONTH", price: 1500, repeats: null },
    ];
    expect(phasesAreSane(ghost)).toBeTruthy();
  });
});

describe("the sentence a pricing card prints", () => {
  const fmt = (n: number) => `BDT ${n.toLocaleString("en-IN")}`;

  it("states every rung, including the one the customer settles on", () => {
    expect(scheduleSentence(LADDER, fmt)).toBe(
      "Free for 7 days, then BDT 500/month for 6 months, then BDT 1,500/month",
    );
  });

  it("says nothing extra for a plan that is just a price", () => {
    const flat: Phase[] = [{ seq: 1, count: 1, unit: "MONTH", price: 1000, repeats: null }];
    expect(scheduleSentence(flat, fmt)).toBe("BDT 1,000/month");
  });

  it("names the first period rather than counting to one", () => {
    const intro: Phase[] = [
      { seq: 1, count: 1, unit: "YEAR", price: 10000, repeats: 1 },
      { seq: 2, count: 1, unit: "YEAR", price: 20000, repeats: null },
    ];
    expect(scheduleSentence(intro, fmt)).toBe(
      "BDT 10,000 for the first year, then BDT 20,000/year",
    );
  });

  it("reads a multi-month period as the span it is", () => {
    const quarterly: Phase[] = [{ seq: 1, count: 3, unit: "MONTH", price: 2700, repeats: null }];
    expect(scheduleSentence(quarterly, fmt)).toBe("BDT 2,700 every 3 months");
  });
});

describe("comparing two schedules honestly", () => {
  /**
   * What the savings badge is computed from — and deliberately the price the
   * customer settles on, not the one that gets them in. An intro price makes
   * every badge on the page swing the moment a promotion changes, while the
   * customer's actual lifetime saving has not moved at all.
   */
  it("normalises the forever price to a month, whatever the period length is", () => {
    expect(perMonthEquivalent(LADDER)).toBe(1500);
    expect(
      perMonthEquivalent([{ seq: 1, count: 1, unit: "YEAR", price: 12000, repeats: null }]),
    ).toBe(1000);
    expect(
      perMonthEquivalent([{ seq: 1, count: 3, unit: "MONTH", price: 2700, repeats: null }]),
    ).toBe(900);
  });
});
