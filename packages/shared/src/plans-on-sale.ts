/**
 * The price list, and which plan a signup is standing on.
 *
 * `/cms/plans` has been public since the homepage had prices, and the
 * web has drawn it from the day it launched: a visitor reads the cards,
 * presses one, and arrives at a signup that already knows which plan and
 * which way of paying for it.
 *
 * The phone had none of it. Its signup sent no plan at all, so the API
 * opened the entry plan — which meant somebody who signed up on a phone
 * got Starter whatever they had read, and could not even see what else
 * was on offer. Two clients, two products.
 *
 * The rules move here rather than being written a second time. They are
 * not arithmetic; they are decisions about what a person is buying, and
 * the two clients disagreeing about that is the most expensive kind of
 * drift there is.
 */

/** One rung of a price ladder, as Platform → Plans writes it. */
export interface PlanPhase {
  /** How many periods this rung lasts; null is "and thereafter". */
  periods: number | null;
  amount: number;
}

/**
 * One way a plan can be bought.
 *
 * Not `monthly` and `yearly`: between them those two fields could
 * express exactly two ways of selling anything, and the owner writes as
 * many as they like — a free week, six months at half price, then the
 * list price is one schedule with three phases.
 */
export interface PlanSchedule {
  id: number;
  /** "Monthly", "Yearly", "3-year deal" — the owner's own words. */
  label: string;
  phases: PlanPhase[];
  /** What the first period costs: what pressing the button actually charges. */
  openingFee: number;
  /** The settle price as a monthly figure, so two shelves can be compared. */
  perMonth: number;
  savingPerMonth: number;
  savingPct: number;
}

/** One plan as the public price list sends it. */
export interface PlanOnSale {
  name: string;
  label: string;
  /** Every way this plan is sold, in the owner's order. Never empty. */
  schedules: PlanSchedule[];
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  trialDays: number;
  blurb: string | null;
  highlight: boolean;
  /** Keys from PLAN_FEATURES. */
  features: string[];
}

export type PlanAudience = "RESORT" | "AGENCY";

/**
 * The plan a signup is for: the one asked for when the shelf has it,
 * otherwise the first.
 *
 * The web's form took `plans[0]` unconditionally once, so somebody who
 * pressed Chain was told "Starter · 15 rooms" while they typed — and
 * nobody reported it until a workspace was already open on the wrong
 * plan.
 *
 * An unrecognised name falls back rather than showing nothing. A plan
 * can be retired between somebody saving a link and opening it, and a
 * form describing no plan at all is the state this exists to prevent;
 * the API refuses an unknown name on submit and its refusal names the
 * shelf.
 */
export function plannedPlan<T extends { name: string }>(
  shelf: readonly T[] | null | undefined,
  wanted: string | null | undefined,
): T | null {
  if (!shelf?.length) return null;
  const asked = wanted?.trim().toUpperCase();
  return (asked ? shelf.find((p) => p.name.toUpperCase() === asked) : null) ?? shelf[0] ?? null;
}

/**
 * The shelf a signup is standing on: the one asked for when this plan
 * has it, otherwise the plan's first.
 *
 * A schedule id belonging to the plan somebody has just navigated away
 * from has to fall away. Carrying it to the server would be a bill for a
 * card nobody pressed.
 */
export function plannedShelf<T extends { id: number }>(
  plan: { schedules: readonly T[] } | null | undefined,
  wanted: number | null | undefined,
): T | null {
  if (!plan) return null;
  return plan.schedules.find((s) => s.id === wanted) ?? plan.schedules[0] ?? null;
}

/**
 * What a plan card claims, in one line.
 *
 * The phone has no room for the web's tick list, and a card that says
 * nothing but a price is a card nobody can choose between. Rooms and
 * resorts are the two numbers every resort plan differs on; an agency
 * plan has neither, so it says what it does have.
 */
export function planCaps(plan: PlanOnSale, audience: PlanAudience): string {
  if (audience === "AGENCY") {
    return `${plan.maxStaff > 0 ? `${plan.maxStaff} staff` : "Unlimited staff"}`;
  }
  const rooms = plan.maxRooms > 0 ? `${plan.maxRooms} rooms` : "Unlimited rooms";
  const resorts = plan.maxResorts > 1 ? `, ${plan.maxResorts} resorts` : "";
  return `${rooms}${resorts}`;
}

/**
 * The trial, when every plan agrees on it.
 *
 * Null when they do not: a single number over a list whose rows disagree
 * is a claim about a plan nobody chose.
 */
export function sharedTrialDays(plans: readonly PlanOnSale[] | null | undefined): number | null {
  if (!plans?.length) return null;
  const first = plans[0]!.trialDays;
  return plans.every((p) => p.trialDays === first) ? first : null;
}
