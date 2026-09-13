/**
 * A price is a ladder, and the plan carries it.
 *
 * The platform used to sell one price per rhythm — `monthlyFee`, `yearlyFee`,
 * and a two-element `BILLING_CYCLES` array in code naming the only rhythms
 * that could ever exist. "Free for a week, then half price for six months,
 * then the list price" was not something the owner could set up; it was a
 * migration and a deploy.
 *
 * So a plan carries schedules, a schedule carries phases, and a phase is the
 * only thing that knows a price. Nothing in this file is configuration: the
 * number of rungs, their lengths, their prices and how many times each repeats
 * are all rows the owner writes. What is in code is the arithmetic — which
 * rung period 14 falls on, and what date it starts.
 *
 * It lives in `@rh/shared` because four readers need the same answer: the
 * billing sweep that raises the due, the pricing page, the signup summary and
 * the owner's own billing screen. This codebase has already paid for the
 * alternative once — three private copies of `addMonths`, in perfect agreement
 * with each other and none with the calendar.
 */

/**
 * The one thing here that is not data, and cannot be.
 *
 * A unit is not a value the owner picks from; it is a instruction to the
 * calendar. `addPeriod` has to know what to do with the word, so a word nobody
 * implemented is not a unit — it is a crash. Same category as `PLAN_FEATURES`:
 * a code-declared vocabulary, validated on the way in, with the values built
 * from it left entirely to the owner.
 */
export const PERIOD_UNITS = ["DAY", "WEEK", "MONTH", "YEAR"] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

export function isPeriodUnit(value: unknown): value is PeriodUnit {
  return typeof value === "string" && (PERIOD_UNITS as readonly string[]).includes(value);
}

/** One rung: how long a period is, what it costs, how many times it repeats. */
export interface Phase {
  seq: number;
  /** How long ONE period of this phase lasts — 7 DAY, 1 MONTH, 3 MONTH. */
  count: number;
  unit: PeriodUnit;
  price: number;
  /** How many periods at this price. `null` is the last rung: forever. */
  repeats: number | null;
}

const DAY_MS = 86_400_000;

/**
 * A date moved by whole periods, in UTC, clamped to the end of a short month.
 *
 * The three `addMonths` copies this replaces all did `r.setMonth(r.getMonth()
 * + n)` and let the result overflow: 2026-01-31 plus a month was **2026-03-03**
 * — February never became a billing period — and 2024-02-29 plus a year was
 * 2025-03-01. Every renewal after one of those inherited the drift, so a
 * subscription that started on the 31st walked forward through the calendar
 * for the rest of its life.
 *
 * The 31st of a month with no 31st is that month's last day. `n` is counted
 * from a fixed anchor rather than from the previous result, so clamping cannot
 * become a ratchet: Jan 31 + 2 months is Mar 31, not Feb 28 + 1 month.
 */
export function addPeriod(from: Date, count: number, unit: PeriodUnit): Date {
  if (unit === "DAY") return new Date(from.getTime() + count * DAY_MS);
  if (unit === "WEEK") return new Date(from.getTime() + count * 7 * DAY_MS);

  const months = unit === "YEAR" ? count * 12 : count;
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const d = from.getUTCDate();
  const target = m + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  // day 0 of the following month is the last day of this one
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(d, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/**
 * Which rung period `index` (0-based, counted from the schedule's start) falls
 * on, and therefore what that period costs and how long it lasts.
 *
 * The last phase absorbs everything past the end of the ladder, which is why
 * `phasesAreSane` insists it runs forever.
 */
export function periodAt(phases: Phase[], index: number): Phase {
  let remaining = index;
  for (const phase of phases) {
    if (phase.repeats == null) return phase;
    if (remaining < phase.repeats) return phase;
    remaining -= phase.repeats;
  }
  const last = phases[phases.length - 1];
  if (!last) throw new Error("This plan has no price at all");
  return last;
}

/**
 * What is wrong with this ladder, or null if nothing is.
 *
 * A message rather than a throw, because both callers want the sentence: the
 * phase editor puts it under the form, and the service refuses the write with
 * it.
 */
export function phasesAreSane(phases: Phase[]): string | null {
  if (phases.length === 0) return "A schedule needs at least one phase";
  for (const p of phases) {
    if (!isPeriodUnit(p.unit)) return `"${p.unit}" is not a period the calendar knows`;
    if (!Number.isInteger(p.count) || p.count < 1) return "A period has to be at least 1 long";
    if (!(p.price >= 0)) return "A price cannot be negative";
    if (p.repeats != null && (!Number.isInteger(p.repeats) || p.repeats < 1)) {
      return "A phase that repeats fewer than once is a rung nobody stands on";
    }
  }
  const last = phases[phases.length - 1]!;
  if (last.repeats != null) {
    return "The last phase has to run forever, or the period after it has no price";
  }
  for (const p of phases.slice(0, -1)) {
    if (p.repeats == null) return "Only the last phase can run forever";
  }
  return null;
}

const MONTHS_IN: Record<PeriodUnit, number> = {
  DAY: 1 / 30,
  WEEK: 7 / 30,
  MONTH: 1,
  YEAR: 12,
};

const NOUN: Record<PeriodUnit, string> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "month" / "year" — the word a card prints after a slash. */
export function periodNoun(unit: PeriodUnit): string {
  return NOUN[unit];
}

/**
 * The ladder as one sentence — "Free for 7 days, then ৳500/month for 6 months,
 * then ৳1,500/month".
 *
 * Every rung is stated, the settle price included. That last clause is the
 * whole point: a card that shows only the number that gets a customer in is
 * how renewal day becomes an argument.
 *
 * `fmt` is passed in rather than imported so this stays pure — the console,
 * the public site and the phone each format money with their own currency and
 * locale, and none of that belongs in the grammar.
 */
export function scheduleSentence(phases: Phase[], fmt: (n: number) => string): string {
  return phases.map((p) => segment(p, fmt)).join(", then ");
}

function segment(p: Phase, fmt: (n: number) => string): string {
  const noun = NOUN[p.unit];
  const free = p.price === 0;
  const money = free ? "Free" : fmt(p.price);

  // forever: the price and its rhythm, nothing else
  if (p.repeats == null) {
    if (free) return money;
    return p.count === 1 ? `${money}/${noun}` : `${money} every ${plural(p.count, noun)}`;
  }
  // a single period: name it rather than counting to one
  if (p.repeats === 1) {
    return p.count === 1
      ? `${money} for the first ${noun}`
      : `${money} for ${plural(p.count, noun)}`;
  }
  // repeated: the rhythm, then how long it lasts
  const span = plural(p.repeats * p.count, noun);
  if (free) return `${money} for ${span}`;
  return p.count === 1
    ? `${money}/${noun} for ${span}`
    : `${money} every ${plural(p.count, noun)} for ${span}`;
}

/**
 * How long one period of the rung a customer settles on is, in months.
 *
 * This is the commitment rhythm — what used to be `monthsIn(cycle)`, 1 or 12,
 * and is now whatever the owner wrote. It decides whether a plan change lands
 * now or at the renewal: moving to a longer term lands at once, because the
 * customer is choosing to pay for longer up front; moving to a shorter one
 * waits, because doing it now would cancel a term already paid for.
 *
 * Deliberately the settle rung and not the first, for the same reason
 * `perMonthEquivalent` is: an introductory week must not make a yearly plan
 * look like a weekly one.
 */
export function settleMonths(phases: Phase[]): number {
  const settle = phases[phases.length - 1];
  if (!settle) return 1;
  return MONTHS_IN[settle.unit] * settle.count;
}

/**
 * The settle price as a monthly figure — what the savings badge compares.
 *
 * Deliberately the forever phase, not the first one. An intro price makes
 * every badge on the pricing page swing the moment a promotion changes, while
 * the customer's actual lifetime saving has not moved at all.
 */
export function perMonthEquivalent(phases: Phase[]): number {
  const settle = phases[phases.length - 1];
  if (!settle) return 0;
  const months = MONTHS_IN[settle.unit] * settle.count;
  if (!(months > 0)) return 0;
  return Math.round((settle.price / months) * 100) / 100;
}
