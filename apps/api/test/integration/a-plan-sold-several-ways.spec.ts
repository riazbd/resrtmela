/**
 * Selling a plan more than one way — and, since 2026-09-14, more than two.
 *
 * This file was `a-year-at-a-time.spec.ts`, and every rule in it was written
 * as monthly-versus-yearly because those were the only two rhythms that could
 * exist: `BILLING_CYCLES` was a two-element array in code, and offering a
 * quarter, a three-year deal, or a free first week meant a migration and a
 * deploy. The owner could not offer one at all.
 *
 * A plan carries schedules now, each a ladder of prices the owner wrote. Every
 * rule the old file pinned survives — what a period costs, how long it is,
 * what a switch charges, what the platform's own MRR says about an account
 * that pays once a year — but each is stated in terms of **how long a term
 * is**, which is what those rules were always really about. "Monthly" and
 * "Yearly" are rows somebody typed, not words in the source.
 *
 * The last describe block is the thing the old file could not say at all: a
 * term that is neither a month nor a year.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, scheduleOf, type Fixture } from "../helpers/db";
import { makePlatformService, makeSubscriptionService, makeBillingService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let admin: JwtClaims;

const platform = () => makePlatformService(asPrismaService);
const subs = () => makeSubscriptionService(asPrismaService);
const billing = () => makeBillingService(asPrismaService);

const DAY = 86_400_000;
const db = () => prisma as unknown as PrismaClient;

/** The fixture's shelves, by the labels the fixture wrote. */
const monthly = (plan = "STARTER") => scheduleOf(db(), plan, "Monthly");
const yearly = (plan = "STARTER") => scheduleOf(db(), plan, "Yearly");

const live = () =>
  prisma.subscription.findFirstOrThrow({
    where: { accountId: fx.tenantId, status: { not: "CANCELLED" } },
    orderBy: { id: "desc" },
  });

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  // the fixture's plans: STARTER and GROWTH are sold by the month and by the
  // year at ten months' fee; CHAIN deliberately has no yearly shelf
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a plan on more than one shelf", () => {
  it("charges the year's own price, not twelve months of the monthly one", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      scheduleId: await yearly(),
    });
    // 25,000 is ten months, not 30,000
    expect(Number(sub.fee)).toBe(25000);
    expect(sub.scheduleId).toBe(await yearly());
  });

  /**
   * Asking for a shelf a plan does not have.
   *
   * This used to be a refusal, because "YEARLY" was a word any caller could
   * say about any plan. A schedule is a row belonging to one plan, so the only
   * way to ask for one a plan does not have is a stale page or a bookmarked
   * link — and it falls back to the plan's own first schedule rather than
   * refusing a sale. What it must never do is invent a price, and it does not:
   * the reply names the schedule the account actually landed on.
   */
  it("falls back to the plan's own shelf when asked for one it does not have", async () => {
    const somebodyElses = await yearly("GROWTH");

    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "CHAIN",
      scheduleId: somebodyElses,
    });

    expect(sub.scheduleId).toBe(await monthly("CHAIN"));
    expect(Number(sub.fee)).toBe(12000);
  });

  it("offers every shelf on the public page, and the saving between them", async () => {
    const starter = (await platform().publicPlans()).find((p) => p.name === "STARTER")!;

    const year = starter.schedules.find((s) => s.label === "Yearly")!;
    expect(year.openingFee).toBe(25000);
    // ৳25,000 a year is ৳2,083.33 a month against ৳2,500 — a sixth off
    expect(year.perMonth).toBeCloseTo(2083.33, 1);
    expect(year.savingPct).toBe(17);
    expect(year.savingPerMonth).toBeCloseTo(416.67, 1);
  });

  it("says nothing about a year for a plan sold by the month only", async () => {
    const chain = (await platform().publicPlans()).find((p) => p.name === "CHAIN")!;

    expect(chain.schedules.map((s) => s.label)).toEqual(["Monthly"]);
    // one shelf means nothing to save against, and no badge to draw
    expect(chain.schedules[0]!.savingPct).toBe(0);
  });
});

describe("what a period is, once it is a year", () => {
  async function onTheYear(over: Record<string, unknown> = {}) {
    const start = new Date(Date.now() - 2 * DAY);
    return prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        scheduleId: await yearly(), fee: 25000 as never,
        startedAt: start, renewsAt: start, phaseStartedAt: start,
        ...over,
      } as never,
    });
  }

  it("bills a year at a time, and renews a year later", async () => {
    const sub = await onTheYear();

    await billing().sweep();

    const due = await prisma.subscriptionDue.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(Number(due.amount)).toBe(25000);
    // the period it covers is a year, not a month
    const months = Math.round((due.periodEnd.getTime() - due.periodStart.getTime()) / (30.44 * DAY));
    expect(months).toBe(12);

    const after = await live();
    const ahead = Math.round((after.renewsAt!.getTime() - sub.startedAt.getTime()) / (30.44 * DAY));
    expect(ahead).toBe(12);
  });

  it("does not bill a yearly account again the month after", async () => {
    await onTheYear();

    await billing().sweep();
    await billing().sweep();

    // one year, one bill — whatever the sweep does in between
    expect(await prisma.subscriptionDue.count()).toBe(1);
  });

  it("renews by the year when the platform renews it by hand", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", scheduleId: await yearly(), trialDays: 0,
    });
    const before = (await live()).renewsAt!;

    await platform().renewSubscription(owner, Number(sub.id), 1);

    const after = (await live()).renewsAt!;
    const months = Math.round((after.getTime() - before.getTime()) / (30.44 * DAY));
    expect(months, "one period of a yearly subscription is a year").toBe(12);
  });
});

describe("moving between terms of different lengths", () => {
  /** Paying monthly, out of trial, with the renewal ten days away. */
  async function payingMonthly(plan = "STARTER", fee = 2500) {
    const renewsAt = new Date(Date.now() + 10 * DAY);
    const periodStart = new Date(renewsAt);
    periodStart.setMonth(periodStart.getMonth() - 1);
    return prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan, status: "ACTIVE", scheduleId: await monthly(plan),
        fee: fee as never, startedAt: periodStart, trialEndsAt: periodStart,
        renewsAt, phaseStartedAt: periodStart,
      } as never,
    });
  }

  it("takes the longer term at once, because the customer is paying more today", async () => {
    await payingMonthly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", await yearly());

    expect(r.effective).toBe("now");
    expect(r.scheduleLabel).toBe("Yearly");
    expect(Number((await live()).fee)).toBe(25000);
  });

  it("credits the days of the month already paid for", async () => {
    await payingMonthly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", await yearly());

    // ten of about thirty days are unused, so roughly a third of ৳2,500 comes
    // off the ৳25,000 — the exact figure moves with the length of the month
    expect(r.charged).toBeGreaterThan(24000);
    expect(r.charged).toBeLessThan(25000);
  });

  it("starts the new term today rather than keeping the old renewal date", async () => {
    await payingMonthly();

    await subs().changePlan(admin, fx.resortId, "STARTER", await yearly());

    const months = Math.round(((await live()).renewsAt!.getTime() - Date.now()) / (30.44 * DAY));
    expect(months).toBe(12);
  });

  /** Paying yearly, most of the year still to run. */
  async function payingYearly() {
    const renewsAt = new Date(Date.now() + 300 * DAY);
    const periodStart = new Date(renewsAt);
    periodStart.setMonth(periodStart.getMonth() - 12);
    return prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", scheduleId: await yearly(),
        fee: 25000 as never, startedAt: periodStart, trialEndsAt: periodStart,
        renewsAt, phaseStartedAt: periodStart,
      } as never,
    });
  }

  it("makes a move to a shorter term wait for the one that is paid for", async () => {
    await payingYearly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", await monthly());

    expect(r.effective).toBe("renewal");
    expect(r.charged).toBe(0);
    const row = await live();
    expect(row.scheduleId, "still yearly until the year runs out").toBe(await yearly());
    expect(row.pendingScheduleId).toBe(await monthly());
  });

  it("applies the waiting switch at the renewal, and bills one month", async () => {
    const sub = await payingYearly();
    // bring the renewal forward so the sweep reaches it
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingScheduleId: await monthly(), renewsAt: new Date(Date.now() - DAY) },
    });

    await billing().sweep();

    const row = await live();
    expect(row.scheduleId).toBe(await monthly());
    expect(row.pendingScheduleId).toBeNull();
    expect(Number(row.fee)).toBe(2500);
    const due = await prisma.subscriptionDue.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(Number(due.amount), "the first bill of the new term is a month's").toBe(2500);
  });

  it("calls off a switch that has not happened yet", async () => {
    await payingYearly();
    await subs().changePlan(admin, fx.resortId, "STARTER", await monthly());

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", await yearly());

    expect(r.effective).toBe("cancelled");
    expect((await live()).pendingScheduleId).toBeNull();
  });

  it("charges nothing for a switch made inside a trial", async () => {
    const trialEndsAt = new Date(Date.now() + 10 * DAY);
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "TRIAL", scheduleId: await monthly(),
        fee: 2500 as never, trialEndsAt, renewsAt: trialEndsAt, phaseStartedAt: trialEndsAt,
      } as never,
    });

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", await yearly());

    expect(r.charged).toBe(0);
    const row = await live();
    expect(row.scheduleId).toBe(await yearly());
    expect(Number(row.fee)).toBe(25000);
    // the trial is untouched: changing term is not a renewal
    expect(row.renewsAt!.getTime()).toBeCloseTo(trialEndsAt.getTime(), -4);
  });

  /**
   * A plan change is not a term change. Starter Monthly to Growth Monthly
   * lands on a different schedule row — every plan has its own — but the
   * customer's rhythm has not moved, so the period they have already paid for
   * still runs and only the difference is charged. Reading "different row" as
   * "new term" billed a full month for an upgrade eleven days in.
   */
  it("does not restart the period when only the plan moves", async () => {
    const sub = await payingMonthly();

    const r = await subs().changePlan(admin, fx.resortId, "GROWTH", await monthly("GROWTH"));

    expect(r.effective).toBe("now");
    // a third of the ৳2,500 difference, not a whole month of ৳5,000
    expect(r.charged).toBeLessThan(1000);
    expect((await live()).renewsAt!.getTime()).toBe(sub.renewsAt!.getTime());
  });
});

describe("what the platform sees", () => {
  /**
   * MRR is a monthly number by definition. Counting a year's fee whole would
   * put a ৳25,000 spike in the month it was sold and nothing in the eleven
   * after it, so the figure would track the sales calendar instead of the
   * business.
   */
  it("spreads a yearly subscription across its months in the MRR", async () => {
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        scheduleId: await yearly(), fee: 24000 as never,
      } as never,
    });

    const ov = await platform().overview(owner);

    expect(ov.subscriptions.mrr).toBe(2000);
  });

  it("counts a monthly subscription at its face value", async () => {
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        scheduleId: await monthly(), fee: 2500 as never,
      } as never,
    });

    const ov = await platform().overview(owner);

    expect(ov.subscriptions.mrr).toBe(2500);
  });

  it("names the term beside the fee, so ৳25,000 is not read as a month", async () => {
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", scheduleId: await yearly(),
    });

    const [row] = await platform().allSubscriptions(owner);

    expect(row!.scheduleLabel).toBe("Yearly");
    expect(row!.fee).toBe(25000);
  });
});

describe("what the owner's own screen says", () => {
  it("gives the term's price and the month it works out to", async () => {
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", scheduleId: await yearly(), trialDays: 0,
    });

    const d = await subs().detail(admin, fx.resortId);

    expect(d.scheduleLabel).toBe("Yearly");
    expect(d.fee).toBe(25000);
    expect(d.feePerMonth).toBeCloseTo(2083.33, 1);
  });

  /**
   * A yearly customer comparing ৳25,000 against a plan's ৳5,000 would be told
   * every plan on the list is a downgrade, and every move would park until the
   * renewal. Both sides are measured per month.
   */
  it("judges a plan an upgrade or not per month, whatever the term", async () => {
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", scheduleId: await yearly(), trialDays: 0,
    });

    const d = await subs().detail(admin, fx.resortId);

    expect(d.plans.find((p) => p.name === "GROWTH")!.direction).toBe("upgrade");
    expect(d.plans.find((p) => p.name === "STARTER")!.direction).toBe("current");
  });

  it("carries every shelf and its saving for the card to show", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER", trialDays: 0 });

    const d = await subs().detail(admin, fx.resortId);

    const growth = d.plans.find((p) => p.name === "GROWTH")!;
    expect(growth.schedules.find((s) => s.label === "Yearly")!.openingFee).toBe(50000);
    expect(d.plans.find((p) => p.name === "CHAIN")!.schedules.map((s) => s.label)).toEqual([
      "Monthly",
    ]);
  });
});

/**
 * The thing the old file could not say.
 *
 * Everything above would have worked before this change, because a month and a
 * year were the only terms there were. None of the below would: a quarter, a
 * fortnight, and a ladder that starts free are rows the owner writes, and no
 * part of the platform had to be rebuilt to accept them.
 */
describe("a term the code has never heard of", () => {
  async function shelf(plan: string, label: string, rungs: { count: number; unit: string; price: number; repeats: number | null }[]) {
    const row = await prisma.platformPlan.findUniqueOrThrow({ where: { name: plan } });
    const schedule = await prisma.planSchedule.create({
      data: { planId: row.id, label, sortOrder: 9 },
    });
    await prisma.planPhase.createMany({
      data: rungs.map((r, i) => ({
        scheduleId: schedule.id, seq: i + 1,
        count: r.count, unit: r.unit, price: r.price as never, repeats: r.repeats,
      })),
    });
    return schedule.id;
  }

  it("bills a quarter every three months, at the quarter's own price", async () => {
    const quarterly = await shelf("STARTER", "Quarterly", [
      { count: 3, unit: "MONTH", price: 6750, repeats: null },
    ]);
    const start = new Date("2026-01-15T00:00:00Z");
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        scheduleId: quarterly, fee: 6750 as never,
        startedAt: start, renewsAt: start, phaseStartedAt: start,
      } as never,
    });

    await billing().sweep(new Date("2026-07-01T00:00:00Z"));

    const dues = await prisma.subscriptionDue.findMany({ orderBy: { periodStart: "asc" } });
    // two quarters have begun by 1 July; the third starts on the 15th and is
    // not billed before it does
    expect(dues.map((d) => d.periodStart.toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-04-15",
    ]);
    expect(dues.at(-1)!.periodEnd.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(dues.every((d) => Number(d.amount) === 6750)).toBe(true);
  });

  it("walks a ladder that opens free and settles at the list price", async () => {
    const intro = await shelf("STARTER", "Intro", [
      { count: 2, unit: "WEEK", price: 0, repeats: 1 },
      { count: 1, unit: "MONTH", price: 1250, repeats: 3 },
      { count: 1, unit: "MONTH", price: 2500, repeats: null },
    ]);
    const start = new Date("2026-01-01T00:00:00Z");
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        scheduleId: intro, fee: 0 as never,
        startedAt: start, renewsAt: start, phaseStartedAt: start,
      } as never,
    });

    await billing().sweep(new Date("2026-06-01T00:00:00Z"));

    const dues = await prisma.subscriptionDue.findMany({ orderBy: { periodStart: "asc" } });
    expect(dues.map((d) => Number(d.amount))).toEqual([0, 1250, 1250, 1250, 2500, 2500]);
    // two weeks, then months measured from the day the second rung began
    expect(dues.map((d) => d.periodStart.toISOString().slice(0, 10))).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
    ]);
  });
});
