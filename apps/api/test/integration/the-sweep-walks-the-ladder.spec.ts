/**
 * The billing sweep, once a price stopped being a single number.
 *
 * `Subscription.fee` was what an account paid every period, for as long as it
 * stayed — frozen at signup and moved only by a plan change. A plan now carries
 * a schedule, a schedule carries rungs, and what a period costs depends on
 * which rung the account is standing on. So the sweep has a new job: walk up.
 *
 * Two things are pinned here that are easy to get wrong and expensive to
 * notice late.
 *
 * **The ladder is walked in order, including through a catch-up.** A sweep that
 * has not run for months raises every missed period at once; each of those
 * periods must be billed at the price of the rung it belonged to, not at
 * whatever the account's rung is by the time the sweep gets around to it.
 *
 * **Period dates are measured from an anchor, not chained.** Every date used to
 * be computed from the one before it, which turns a single month-end clamp into
 * a permanent slide: a subscription renewing on the 31st hits February, lands
 * on the 28th, and never sees the 31st again. It was worse than that before —
 * `setMonth` overflowed rather than clamping, so 2026-01-31 renewed on
 * 2026-03-03 and February was never a billing period at all.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBillingService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const billing = () => makeBillingService(asPrismaService);

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** A rung, as the caller writes one. */
type Rung = { count: number; unit: string; price: number; repeats: number | null };

/** A plan of the caller's own making, with the ladder they asked for. */
async function planWithLadder(name: string, rungs: Rung[]): Promise<number> {
  const plan = await prisma.platformPlan.create({
    data: { name, label: name, monthlyFee: 0 as never, maxRooms: 10, sortOrder: 50 },
  });
  const schedule = await prisma.planSchedule.create({
    data: { planId: plan.id, label: "Ladder", sortOrder: 0 },
  });
  await prisma.planPhase.createMany({
    data: rungs.map((r, i) => ({
      scheduleId: schedule.id,
      seq: i + 1,
      count: r.count,
      unit: r.unit,
      price: r.price as never,
      repeats: r.repeats,
    })),
  });
  return schedule.id;
}

/** An account already past its trial, standing on the first rung. */
async function subscribed(scheduleId: number, plan: string, from: Date) {
  return prisma.subscription.create({
    data: {
      accountId: fx.tenantId,
      plan,
      status: "ACTIVE",
      fee: 0 as never,
      scheduleId,
      phaseSeq: 1,
      phaseDone: 0,
      phaseStartedAt: from,
      startedAt: from,
      renewsAt: from,
    },
  });
}

/** Every bill raised, oldest first — the ladder as the customer experienced it. */
async function bills() {
  const rows = await prisma.subscriptionDue.findMany({
    where: { accountId: fx.tenantId },
    orderBy: { periodStart: "asc" },
  });
  return rows.map((d) => ({
    from: isoDay(d.periodStart),
    to: isoDay(d.periodEnd),
    amount: Number(d.amount),
  }));
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  // the fixture's own subscription would bill alongside ours and muddy the
  // ledger these tests read
  await prisma.subscriptionDue.deleteMany({});
  await prisma.subscription.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a subscription walking up its plan's ladder", () => {
  /** Free for a week, half price for two months, then the real price. */
  const LADDER: Rung[] = [
    { count: 7, unit: "DAY", price: 0, repeats: 1 },
    { count: 1, unit: "MONTH", price: 500, repeats: 2 },
    { count: 1, unit: "MONTH", price: 1500, repeats: null },
  ];

  it("bills each period at the price of the rung it belongs to", async () => {
    const scheduleId = await planWithLadder("LADDER", LADDER);
    await subscribed(scheduleId, "LADDER", day("2026-01-01"));

    // one sweep, three months late: every missed period comes out at once
    await billing().sweep(day("2026-04-01"));

    expect(await bills()).toEqual([
      { from: "2026-01-01", to: "2026-01-08", amount: 0 },
      { from: "2026-01-08", to: "2026-02-08", amount: 500 },
      { from: "2026-02-08", to: "2026-03-08", amount: 500 },
      { from: "2026-03-08", to: "2026-04-08", amount: 1500 },
    ]);
  });

  it("remembers which rung it reached, so the next sweep does not start over", async () => {
    const scheduleId = await planWithLadder("LADDER", LADDER);
    const sub = await subscribed(scheduleId, "LADDER", day("2026-01-01"));

    await billing().sweep(day("2026-04-01"));

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.phaseSeq).toBe(3);
    expect(isoDay(after.phaseStartedAt)).toBe("2026-03-08");
    expect(isoDay(after.renewsAt)).toBe("2026-04-08");
    expect(Number(after.fee)).toBe(1500);
  });

  it("stays on the last rung however long the account stays", async () => {
    const scheduleId = await planWithLadder("LADDER", LADDER);
    await subscribed(scheduleId, "LADDER", day("2026-01-01"));

    await billing().sweep(day("2027-01-01"));

    const raised = await bills();
    expect(raised.at(-1)!.amount).toBe(1500);
    expect(raised.filter((b) => b.amount === 1500).length).toBeGreaterThan(8);
    // and nothing was billed twice
    expect(new Set(raised.map((b) => b.from)).size).toBe(raised.length);
  });

  it("raises nothing the second time it is run, which is what makes it safe", async () => {
    const scheduleId = await planWithLadder("LADDER", LADDER);
    await subscribed(scheduleId, "LADDER", day("2026-01-01"));

    const first = await billing().sweep(day("2026-04-01"));
    const again = await billing().sweep(day("2026-04-01"));

    expect(first.duesRaised).toBe(4);
    expect(again.duesRaised).toBe(0);
  });

  it("handles the ordinary plan, which is one price and no ladder at all", async () => {
    const scheduleId = await planWithLadder("FLAT", [
      { count: 1, unit: "MONTH", price: 1000, repeats: null },
    ]);
    await subscribed(scheduleId, "FLAT", day("2026-01-10"));

    await billing().sweep(day("2026-03-01"));

    expect(await bills()).toEqual([
      { from: "2026-01-10", to: "2026-02-10", amount: 1000 },
      { from: "2026-02-10", to: "2026-03-10", amount: 1000 },
    ]);
  });
});

describe("a subscription that renews on the 31st", () => {
  /**
   * The whole reason `phaseStartedAt` exists. Chaining each date off the last
   * makes February permanent; anchoring means the 31st comes back the moment a
   * month is long enough to hold it.
   */
  it("comes back to the 31st after a short month instead of staying on the 28th", async () => {
    const scheduleId = await planWithLadder("FLAT31", [
      { count: 1, unit: "MONTH", price: 1000, repeats: null },
    ]);
    await subscribed(scheduleId, "FLAT31", day("2026-01-31"));

    await billing().sweep(day("2026-06-01"));

    expect((await bills()).map((b) => b.from)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  /**
   * The bug as it actually shipped. `setMonth` overflowed instead of clamping,
   * so the period after 31 January began on 3 March — February was not a
   * billing period at all, and the account got a month it never paid for.
   */
  it("does not skip February by overflowing into March", async () => {
    const scheduleId = await planWithLadder("FEB", [
      { count: 1, unit: "MONTH", price: 1000, repeats: null },
    ]);
    await subscribed(scheduleId, "FEB", day("2026-01-31"));

    await billing().sweep(day("2026-03-15"));

    const raised = await bills();
    expect(raised.map((b) => b.from)).not.toContain("2026-03-03");
    expect(raised[1]).toEqual({ from: "2026-02-28", to: "2026-03-31", amount: 1000 });
  });
});

describe("a subscription whose plan says nothing about prices", () => {
  /**
   * A schedule is the only place a price lives now. An account pointed at
   * nothing must not be billed a number somebody guessed — it is skipped, and
   * loudly, so the gap is a thing somebody fixes rather than a silent zero.
   */
  it("is left alone rather than billed a price nobody set", async () => {
    const plan = await prisma.platformPlan.create({
      data: { name: "NOPRICE", label: "No price", monthlyFee: 0 as never, maxRooms: 10, sortOrder: 51 },
    });
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId,
        plan: plan.name,
        status: "ACTIVE",
        fee: 0 as never,
        scheduleId: null,
        startedAt: day("2026-01-01"),
        renewsAt: day("2026-01-01"),
      },
    });

    const result = await billing().sweep(day("2026-04-01"));

    expect(result.duesRaised).toBe(0);
    expect(await bills()).toEqual([]);
  });
});
