/**
 * Whose money is outstanding.
 *
 * A guest's balance is collected at the desk on the morning they leave. An
 * agency's is a trade account settled between two businesses. They were one
 * table and one red total until the dues report learned to tell them apart,
 * and the front desk read a guest's name beside money that guest does not
 * owe — "what is outstanding" was a number nobody could act on.
 *
 * The console did the split inline. It is here because the phone needs the
 * same three lenses, and because the rule is one an eye skips over: what
 * decides is the *agent* on the row, not who eventually hands over the cash.
 * Two clients each deciding that for themselves is exactly the disagreement
 * this package exists to prevent.
 */
import type { DuesReport } from "./api-types";

/** The three questions the screen can ask. A lens, not a filter that hides money. */
export const DUES_LENSES = ["Everyone", "Guests", "Agencies"] as const;

export type DuesLens = (typeof DUES_LENSES)[number];

export interface DuesThroughLens {
  rows: DuesReport["rows"];
  /** The money this lens is about, and how many bookings it is spread over. */
  total: number;
  count: number;
}

/**
 * The report seen one way.
 *
 * The totals are the report's own, never a sum of the rows. The API computes
 * them with the resort's tax rules; adding the rows up here would be a
 * second, quieter implementation of the same sum, and the first time the two
 * disagreed nobody would know which one was right.
 */
export function duesThrough(report: DuesReport, lens: DuesLens): DuesThroughLens {
  if (lens === "Guests") {
    return {
      rows: report.rows.filter((r) => r.agent === null),
      total: report.guestTotal,
      count: report.guestCount,
    };
  }
  if (lens === "Agencies") {
    return {
      rows: report.rows.filter((r) => r.agent !== null),
      total: report.agencyTotal,
      count: report.agencyCount,
    };
  }
  return { rows: report.rows, total: report.total, count: report.count };
}
