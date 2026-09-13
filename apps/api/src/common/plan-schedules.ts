/**
 * Which way a customer is buying a plan.
 *
 * The platform used to answer this with `BillingCycle` — a two-element array
 * in code, `MONTHLY | YEARLY`, which meant the owner could not offer a quarter,
 * a three-year deal, or a week free without a deploy. The answer is a row now:
 * a `PlanSchedule` the owner wrote, carrying the ladder of prices underneath.
 *
 * Everything that opens or changes a subscription comes through here, so the
 * rules for picking one are written once: an explicit choice if it is still on
 * the shelf, the plan's own first schedule otherwise, and a refusal rather than
 * a guess when the plan has none at all.
 */
import type { Prisma } from "@rh/db";
import { phasesAreSane, isPeriodUnit, type Phase } from "@rh/shared";

const refuse = (message: string) => Object.assign(new Error(message), { status: 400 });

export interface ResolvedSchedule {
  id: number;
  label: string;
  /** The ladder, bottom rung first. Never empty. */
  phases: Phase[];
  /** What the first period costs — the number a signup quotes. */
  openingFee: number;
}

type Db = Prisma.TransactionClient;

/** Rows as Prisma hands them back, as the pure rules want them. */
export function toPhases(rows: { seq: number; count: number; unit: string; price: unknown; repeats: number | null }[]): Phase[] {
  return rows.map((r) => ({
    seq: r.seq,
    count: r.count,
    unit: isPeriodUnit(r.unit) ? r.unit : ("MONTH" as const),
    price: Number(r.price),
    repeats: r.repeats,
  }));
}

/**
 * The schedules a plan is actually on sale with, cheapest-ordered by the
 * owner's own `sortOrder`.
 */
export async function schedulesFor(db: Db, planId: bigint): Promise<ResolvedSchedule[]> {
  const rows = await db.planSchedule.findMany({
    where: { planId, active: true },
    orderBy: { sortOrder: "asc" },
    include: { phases: { orderBy: { seq: "asc" } } },
  });
  return rows
    .map((s) => {
      const phases = toPhases(s.phases);
      return { id: s.id, label: s.label, phases, openingFee: phases[0]?.price ?? 0 };
    })
    .filter((s) => s.phases.length > 0);
}

/**
 * The one this customer is buying on.
 *
 * `wanted` is the schedule they picked. A schedule that belongs to a different
 * plan, or that the owner has since withdrawn, is not a thing to bill against —
 * so it falls back to the plan's first, the same way a withdrawn yearly price
 * used to fall back to the monthly one.
 */
export async function scheduleFor(
  db: Db,
  plan: { id: bigint; label: string },
  wanted?: number | null,
): Promise<ResolvedSchedule> {
  const available = await schedulesFor(db, plan.id);
  if (available.length === 0) {
    throw refuse(`${plan.label} has no price yet — give it a billing schedule first.`);
  }
  const picked = wanted != null ? available.find((s) => s.id === wanted) : undefined;
  return picked ?? available[0]!;
}

/**
 * What a subscription's opening columns are, given the schedule it is on.
 *
 * The three of them travel together — the rung, how many of its periods have
 * been billed, and the date the rung began — because a subscription that knows
 * two of the three is a subscription that bills the wrong amount.
 */
export function openingPosition(schedule: ResolvedSchedule, from: Date) {
  return {
    scheduleId: schedule.id,
    phaseSeq: schedule.phases[0]!.seq,
    phaseDone: 0,
    phaseStartedAt: from,
  };
}

/** What is wrong with a ladder somebody is trying to save, or null. */
export function checkPhases(phases: Phase[]): string | null {
  return phasesAreSane(phases);
}
