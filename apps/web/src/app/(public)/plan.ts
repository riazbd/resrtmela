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
  monthlyFee: number;
  /** What a year costs, or null where the plan is sold by the month only. */
  yearlyFee: number | null;
  /** What the year saves against twelve months — the badge on the toggle. */
  yearlySaving: { pct: number; monthsFree: number; amount: number } | null;
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
