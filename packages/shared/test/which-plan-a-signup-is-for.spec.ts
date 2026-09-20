/**
 * Which plan a signup is for (2026-09-21, phase 4).
 *
 * The phone's signup sent no plan at all, so the API opened the entry
 * plan — which meant somebody who read the price list and pressed Chain
 * got Starter, and could not even see what else was on offer, because
 * the phone had no price list either. The web had all of this from the
 * day it launched.
 *
 * These rules were private to the web's signup page. They are decisions
 * about what a person is buying, not arithmetic, and two clients
 * disagreeing about that is the most expensive drift there is — so they
 * moved here and the web moves onto them.
 *
 * The fault they exist to prevent already happened once on the desk: the
 * form took `plans[0]` unconditionally, so a visitor who had pressed
 * Chain was told "Starter · 15 rooms" while they typed, and nobody
 * reported it until a workspace was open on the wrong plan.
 */
import { describe, expect, it } from "vitest";
import {
  planCaps,
  plannedPlan,
  plannedShelf,
  sharedTrialDays,
  type PlanOnSale,
} from "../src/plans-on-sale";

const shelf = (id: number, label: string, perMonth: number) => ({
  id,
  label,
  phases: [{ periods: null, amount: perMonth }],
  openingFee: perMonth,
  perMonth,
  savingPerMonth: 0,
  savingPct: 0,
});

const plan = (over: Partial<PlanOnSale> = {}): PlanOnSale => ({
  name: "STARTER",
  label: "Starter",
  schedules: [shelf(1, "Monthly", 2499), shelf(2, "Yearly", 1250)],
  maxRooms: 9,
  maxResorts: 1,
  maxStaff: 3,
  trialDays: 30,
  blurb: null,
  highlight: false,
  features: [],
  ...over,
});

const SHELF_OF_PLANS = [
  plan(),
  plan({ name: "GROWTH", label: "Growth", maxRooms: 30, maxResorts: 3 }),
  plan({ name: "CHAIN", label: "Chain", maxRooms: 0, maxResorts: 0 }),
];

describe("which plan the form is describing", () => {
  it("is the one that was asked for", () => {
    expect(plannedPlan(SHELF_OF_PLANS, "GROWTH")?.name).toBe("GROWTH");
  });

  it("does not care how the link spelled it", () => {
    expect(plannedPlan(SHELF_OF_PLANS, "growth")?.name).toBe("GROWTH");
    expect(plannedPlan(SHELF_OF_PLANS, " Growth ")?.name).toBe("GROWTH");
  });

  it("is the first when nothing was asked for", () => {
    expect(plannedPlan(SHELF_OF_PLANS, null)?.name).toBe("STARTER");
  });

  /**
   * A plan can be retired between somebody saving a link and opening it.
   * A form describing no plan at all is the state this exists to
   * prevent; the API refuses an unknown name on submit and its refusal
   * names the shelf.
   */
  it("falls back rather than describing nothing", () => {
    expect(plannedPlan(SHELF_OF_PLANS, "RETIRED")?.name).toBe("STARTER");
  });

  it("has nothing to say about an empty shelf", () => {
    expect(plannedPlan([], "GROWTH")).toBeNull();
    expect(plannedPlan(null, "GROWTH")).toBeNull();
  });
});

describe("which way of paying", () => {
  it("is the one the link named", () => {
    expect(plannedShelf(plan(), 2)?.label).toBe("Yearly");
  });

  it("is the plan's first when the link named none", () => {
    expect(plannedShelf(plan(), null)?.label).toBe("Monthly");
  });

  /**
   * The one that matters. Somebody who arrives on Starter-yearly and
   * switches to Chain must not carry Starter's schedule id with them —
   * that would be a bill for a card nobody pressed.
   */
  it("falls away when it belongs to a plan they have left", () => {
    const chain = plan({ name: "CHAIN", schedules: [shelf(7, "Monthly", 7999)] });
    expect(plannedShelf(chain, 2)?.id).toBe(7);
  });

  it("has nothing to say about no plan", () => {
    expect(plannedShelf(null, 1)).toBeNull();
  });
});

describe("what a card claims in one line", () => {
  it("counts rooms for a resort", () => {
    expect(planCaps(plan(), "RESORT")).toBe("9 rooms");
  });

  it("says resorts too, once there is more than one", () => {
    expect(planCaps(plan({ maxRooms: 30, maxResorts: 3 }), "RESORT")).toBe("30 rooms, 3 resorts");
  });

  /** Zero is the platform's way of writing "no cap", not "none allowed". */
  it("reads a cap of zero as no cap", () => {
    expect(planCaps(plan({ maxRooms: 0 }), "RESORT")).toBe("Unlimited rooms");
  });

  it("counts staff for an agency, which has no rooms", () => {
    expect(planCaps(plan({ maxStaff: 5 }), "AGENCY")).toBe("5 staff");
    expect(planCaps(plan({ maxStaff: 0 }), "AGENCY")).toBe("Unlimited staff");
  });
});

describe("the trial line", () => {
  it("claims a trial when every plan agrees on it", () => {
    expect(sharedTrialDays(SHELF_OF_PLANS)).toBe(30);
  });

  /**
   * A single figure over a list whose rows disagree is a claim about a
   * plan nobody chose.
   */
  it("says nothing when they do not", () => {
    expect(sharedTrialDays([plan(), plan({ trialDays: 14 })])).toBeNull();
  });

  it("says nothing about an empty shelf", () => {
    expect(sharedTrialDays([])).toBeNull();
  });
});
