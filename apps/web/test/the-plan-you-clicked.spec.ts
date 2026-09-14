/**
 * The pricing page sends the plan that was clicked.
 *
 * Reported from a live console: a workspace that chose **Chain** opened on
 * **Starter**. The choice was not lost in transit, it was never sent — the
 * card's link carried `?plan=` for an agency and nothing for a resort.
 *
 * The comment beside that code explained why, and was right when it was
 * written: resort signup used to create no subscription at all unless an offer
 * named one, so a `plan` parameter would have been read by nobody. Signup
 * changed (see `a-plan-from-the-first-day`), the comment did not, and the link
 * stayed as the comment described. This is the test that would have noticed.
 *
 * The href is built by a function rather than inline in the JSX for exactly
 * that reason: a branch inside a `<Link>` in a 700-line page is a branch
 * nothing can ask a question of.
 */
import { describe, expect, it } from "vitest";
import { signupHref, plannedPlan, plannedShelf } from "../src/app/(public)/signup-href";

describe("the link under a plan card", () => {
  it("names the plan for a resort", () => {
    expect(signupHref({ audience: "RESORT", plan: "CHAIN", scheduleId: null })).toBe("/signup?plan=CHAIN");
  });

  it("names the plan for an agency, as it always did", () => {
    expect(signupHref({ audience: "AGENCY", plan: "GROWTH_AGENCY", scheduleId: null })).toBe(
      "/signup/agency?plan=GROWTH_AGENCY",
    );
  });

  /**
   * This used to read "carries the billing rhythm", and carried one bit:
   * `billing=YEARLY` or nothing, because monthly and yearly were the only two
   * ways anything could be sold. The card knows which schedule it drew, and
   * says so — whichever of the owner's shelves that is.
   */
  it("carries the shelf the card was showing, alongside the plan", () => {
    expect(signupHref({ audience: "RESORT", plan: "GROWTH", scheduleId: 7 })).toBe(
      "/signup?plan=GROWTH&schedule=7",
    );
    expect(signupHref({ audience: "AGENCY", plan: "STARTER_AGENCY", scheduleId: 42 })).toBe(
      "/signup/agency?plan=STARTER_AGENCY&schedule=42",
    );
  });

  it("escapes a plan name rather than pasting it into the URL", () => {
    // plan names come from the database, where a super admin types them
    expect(signupHref({ audience: "RESORT", plan: "A&B", scheduleId: null })).toBe("/signup?plan=A%26B");
  });

  it("falls back to a plain signup when there is no plan to name", () => {
    expect(signupHref({ audience: "RESORT", plan: "", scheduleId: null })).toBe("/signup");
    expect(signupHref({ audience: "RESORT", plan: "", scheduleId: 3 })).toBe("/signup?schedule=3");
  });
});

/** The shelf as `/cms/plans` returns it: on sale, cheapest first. */
const shelf = [
  { name: "STARTER", label: "Starter", maxRooms: 15 },
  { name: "GROWTH", label: "Growth", maxRooms: 50 },
  { name: "CHAIN", label: "Chain", maxRooms: 10000 },
] as const;

describe("the plan the signup form works from", () => {
  it("is the one named in the link", () => {
    expect(plannedPlan(shelf, "CHAIN")?.label).toBe("Chain");
  });

  it("is the entry plan when the link names none", () => {
    // the plain "Start free trial" buttons elsewhere on the page send no plan,
    // and the cheapest is the right thing to describe while somebody types
    expect(plannedPlan(shelf, null)?.label).toBe("Starter");
  });

  it("reads a name in any case, because a URL is typed by people too", () => {
    expect(plannedPlan(shelf, "chain")?.label).toBe("Chain");
  });

  it("falls back rather than showing nothing when the plan is unknown", () => {
    /**
     * A plan retired between someone bookmarking the page and opening it. The
     * API refuses the name on submit, with a sentence naming the shelf — what
     * this must not do is leave the form describing no plan at all, which is
     * the state the copy was written to eliminate.
     */
    expect(plannedPlan(shelf, "RETIRED_LAST_WEEK")?.label).toBe("Starter");
  });

  it("has nothing to offer before the shelf has loaded", () => {
    expect(plannedPlan(null, "CHAIN")).toBeNull();
    expect(plannedPlan([], "CHAIN")).toBeNull();
  });
});

/**
 * Which way the plan is being bought, once the visitor can change their mind
 * on the form rather than only on the way in.
 *
 * This rule lived inside the JSX, where the only input was a query string that
 * could not change after the page loaded. A picker makes the plan change under
 * it — and a schedule id belonging to the plan they just left would otherwise
 * be carried to the server, which is a bill for something they did not press.
 */
describe("the shelf a signup is standing on", () => {
  const GROWTH = { name: "GROWTH", schedules: [{ id: 7 }, { id: 8 }] };
  const CHAIN = { name: "CHAIN", schedules: [{ id: 9 }] };

  it("uses the shelf that was asked for, when this plan has it", () => {
    expect(plannedShelf(GROWTH, 8)).toEqual({ id: 8 });
  });

  it("falls back to the plan's first shelf when the id belongs to another plan", () => {
    expect(plannedShelf(CHAIN, 8)).toEqual({ id: 9 });
  });

  it("falls back to the first shelf when nothing was asked for", () => {
    expect(plannedShelf(GROWTH, null)).toEqual({ id: 7 });
  });

  it("has nothing to stand on before the price list has loaded", () => {
    expect(plannedShelf(null, 8)).toBeNull();
    expect(plannedShelf<{ id: number }>({ schedules: [] }, null)).toBeNull();
  });
});
