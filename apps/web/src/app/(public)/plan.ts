import type { Phase } from "@rh/shared";

/**
 * One way a plan can be bought — a row the owner wrote, not a word in the code.
 *
 * This replaces `monthlyFee` / `yearlyFee` / `yearlySaving`, three fields that
 * between them could express exactly two ways of selling anything. A plan
 * carries as many of these as the owner cares to write, each with its own
 * ladder of prices: a free week, six months at half price, then the list
 * price, is `phases` with three entries.
 */
export interface ScheduleOnSale {
  id: number;
  /** "Monthly", "Yearly", "3-year deal" — the owner's own words. */
  label: string;
  /** The ladder itself, bottom rung first. */
  phases: Phase[];
  /** What the first period costs — what pressing the button actually charges. */
  openingFee: number;
  /** The settle price as a monthly figure, so two shelves can be compared. */
  perMonth: number;
  /** What this way of buying saves against the dearest way of buying the same plan. */
  savingPerMonth: number;
  savingPct: number;
}

/**
 * One plan as the public price list shows it.
 *
 * Lifted out of the page so the server component that fetches it and the
 * client component that draws it can share one definition rather than each
 * keeping its own — which is how a field gets renamed on one side only.
 */
export interface PublicPlan {
  name: string;
  label: string;
  /** Every shelf this plan is on, in the owner's order. Never empty. */
  schedules: ScheduleOnSale[];
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  trialDays: number;
  blurb: string | null;
  /** The one plan the owner recommends — the ribbon follows this, not position. */
  highlight: boolean;
  /** Keys from PLAN_FEATURES — what the owner ticked for this plan. */
  features: string[];
}
