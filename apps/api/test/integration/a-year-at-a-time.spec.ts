/**
 * Selling the year, not just the month.
 *
 * Every subscription business of any size offers both, for reasons that have
 * nothing to do with software: a year paid up front is a year of churn that
 * cannot happen, and cash that arrives now. The customer's half of the bargain
 * is a discount, which is almost always stated as "two months free".
 *
 * The shape is the one every billing system converges on — one plan carrying
 * the limits and the features, a price per rhythm hung off it — and the rules
 * for moving between rhythms are the rules for moving between plans, because
 * it is the same question: does the customer start paying more, or less?
 *
 * What this file pins down is that the money is right at each of those points:
 * what a period costs, how long it is, what a switch charges, and what the
 * platform's own MRR says about an account that pays once a year.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
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
const live = () =>
  prisma.subscription.findFirstOrThrow({
    where: { accountId: fx.tenantId, status: { not: "CANCELLED" } },
    orderBy: { id: "desc" },
  });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  // the fixture's plans: STARTER and GROWTH carry a yearly price at ten
  // months' fee; CHAIN deliberately does not
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a plan sold two ways", () => {
  it("charges the year's own price, not twelve months of the monthly one", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      billingCycle: "YEARLY",
    });
    // 25,000 is ten months, not 30,000
    expect(Number(sub.fee)).toBe(25000);
    expect(sub.billingCycle).toBe("YEARLY");
  });

  it("refuses to sell a year of a plan that has no yearly price", async () => {
    await expect(
      platform().setSubscription(owner, fx.resortId, { plan: "CHAIN", billingCycle: "YEARLY" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("offers both prices on the public page, and the saving between them", async () => {
    const [starter] = await platform().publicPlans();
    expect(starter!.yearlyFee).toBe(25000);
    expect(starter!.yearlySaving).toMatchObject({ pct: 17, monthsFree: 2, amount: 5000 });
  });

  it("says nothing about a year for a plan sold by the month only", async () => {
    const chain = (await platform().publicPlans()).find((p) => p.name === "CHAIN")!;
    expect(chain.yearlyFee).toBeNull();
    expect(chain.yearlySaving).toBeNull();
  });
});

describe("what a period is, once it is a year", () => {
  it("bills a year at a time, and renews a year later", async () => {
    const start = new Date(Date.now() - 2 * DAY);
    const sub = await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        billingCycle: "YEARLY", fee: 25000 as never,
        startedAt: start, renewsAt: start,
      } as never,
    });

    await billing().sweep();

    const due = await prisma.subscriptionDue.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(Number(due.amount)).toBe(25000);
    // the period it covers is a year, not a month
    const months = Math.round((due.periodEnd.getTime() - due.periodStart.getTime()) / (30.44 * DAY));
    expect(months).toBe(12);

    const after = await live();
    const ahead = Math.round((after.renewsAt!.getTime() - start.getTime()) / (30.44 * DAY));
    expect(ahead).toBe(12);
  });

  it("does not bill a yearly account again the month after", async () => {
    const start = new Date(Date.now() - 2 * DAY);
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE",
        billingCycle: "YEARLY", fee: 25000 as never,
        startedAt: start, renewsAt: start,
      } as never,
    });

    await billing().sweep();
    await billing().sweep();

    // one year, one bill — whatever the sweep does in between
    expect(await prisma.subscriptionDue.count()).toBe(1);
  });

  it("renews by the year when the platform renews it by hand", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", billingCycle: "YEARLY", trialDays: 0,
    });
    const before = (await live()).renewsAt!;

    await platform().renewSubscription(owner, Number(sub.id), 1);

    const after = (await live()).renewsAt!;
    const months = Math.round((after.getTime() - before.getTime()) / (30.44 * DAY));
    expect(months, "one period of a yearly subscription is a year").toBe(12);
  });
});

describe("moving between the two rhythms", () => {
  /** Paying monthly, out of trial, with the renewal ten days away. */
  async function payingMonthly(plan = "STARTER", fee = 2500) {
    const renewsAt = new Date(Date.now() + 10 * DAY);
    const periodStart = new Date(renewsAt);
    periodStart.setMonth(periodStart.getMonth() - 1);
    return prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan, status: "ACTIVE", billingCycle: "MONTHLY",
        fee: fee as never, startedAt: periodStart, trialEndsAt: periodStart, renewsAt,
      } as never,
    });
  }

  it("takes the year at once, because the customer is paying more today", async () => {
    await payingMonthly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", "YEARLY");

    expect(r.effective).toBe("now");
    expect(r.billingCycle).toBe("YEARLY");
    expect(Number((await live()).fee)).toBe(25000);
  });

  it("credits the days of the month already paid for", async () => {
    await payingMonthly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", "YEARLY");

    // ten of about thirty days are unused, so roughly a third of ৳2,500 comes
    // off the ৳25,000 — the exact figure moves with the length of the month
    expect(r.charged).toBeGreaterThan(24000);
    expect(r.charged).toBeLessThan(25000);
  });

  it("starts the year today rather than keeping the old renewal date", async () => {
    await payingMonthly();

    await subs().changePlan(admin, fx.resortId, "STARTER", "YEARLY");

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
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", billingCycle: "YEARLY",
        fee: 25000 as never, startedAt: periodStart, trialEndsAt: periodStart, renewsAt,
      } as never,
    });
  }

  it("makes a move back to monthly wait for the year that is paid for", async () => {
    await payingYearly();

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", "MONTHLY");

    expect(r.effective).toBe("renewal");
    expect(r.charged).toBe(0);
    const row = await live();
    expect(row.billingCycle, "still yearly until the year runs out").toBe("YEARLY");
    expect(row.pendingCycle).toBe("MONTHLY");
  });

  it("applies the waiting switch at the renewal, and bills a month", async () => {
    const sub = await payingYearly();
    // bring the renewal forward so the sweep reaches it
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingCycle: "MONTHLY", renewsAt: new Date(Date.now() - DAY) },
    });

    await billing().sweep();

    const row = await live();
    expect(row.billingCycle).toBe("MONTHLY");
    expect(row.pendingCycle).toBeNull();
    expect(Number(row.fee)).toBe(2500);
    const due = await prisma.subscriptionDue.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(Number(due.amount), "the first bill of the new rhythm is a month's").toBe(2500);
  });

  it("calls off a switch that has not happened yet", async () => {
    await payingYearly();
    await subs().changePlan(admin, fx.resortId, "STARTER", "MONTHLY");

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", "YEARLY");

    expect(r.effective).toBe("cancelled");
    expect((await live()).pendingCycle).toBeNull();
  });

  it("refuses a year of a plan that is not sold by the year", async () => {
    await payingMonthly();
    await expect(
      subs().changePlan(admin, fx.resortId, "CHAIN", "YEARLY"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("charges nothing for a switch made inside a trial", async () => {
    const trialEndsAt = new Date(Date.now() + 10 * DAY);
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "TRIAL", billingCycle: "MONTHLY",
        fee: 2500 as never, trialEndsAt, renewsAt: trialEndsAt,
      } as never,
    });

    const r = await subs().changePlan(admin, fx.resortId, "STARTER", "YEARLY");

    expect(r.charged).toBe(0);
    const row = await live();
    expect(row.billingCycle).toBe("YEARLY");
    expect(Number(row.fee)).toBe(25000);
    // the trial is untouched: a rhythm is not a renewal
    expect(row.renewsAt!.getTime()).toBeCloseTo(trialEndsAt.getTime(), -4);
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
        billingCycle: "YEARLY", fee: 24000 as never,
      } as never,
    });

    const ov = await platform().overview(owner);

    expect(ov.subscriptions.mrr).toBe(2000);
  });

  it("counts a monthly subscription at its face value", async () => {
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", fee: 2500 as never,
      } as never,
    });

    const ov = await platform().overview(owner);

    expect(ov.subscriptions.mrr).toBe(2500);
  });

  it("shows the rhythm beside the fee, so ৳25,000 is not read as a month", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER", billingCycle: "YEARLY" });

    const [row] = await platform().allSubscriptions(owner);

    expect(row!.billingCycle).toBe("YEARLY");
    expect(row!.fee).toBe(25000);
  });
});

describe("what the owner's own screen says", () => {
  it("gives the year's price and the month it works out to", async () => {
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", billingCycle: "YEARLY", trialDays: 0,
    });

    const d = await subs().detail(admin, fx.resortId);

    expect(d.billingCycle).toBe("YEARLY");
    expect(d.fee).toBe(25000);
    expect(d.feePerMonth).toBeCloseTo(2083.33, 1);
  });

  /**
   * A yearly customer comparing ৳25,000 against a plan's ৳5,000 would be told
   * every plan on the list is a downgrade, and every move would park until the
   * renewal. Both sides are measured per month.
   */
  it("judges a plan an upgrade or not per month, whatever the rhythm", async () => {
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER", billingCycle: "YEARLY", trialDays: 0,
    });

    const d = await subs().detail(admin, fx.resortId);

    expect(d.plans.find((p) => p.name === "GROWTH")!.direction).toBe("upgrade");
    expect(d.plans.find((p) => p.name === "STARTER")!.direction).toBe("current");
  });

  it("carries each plan's yearly price and saving for the card to show", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER", trialDays: 0 });

    const d = await subs().detail(admin, fx.resortId);

    const growth = d.plans.find((p) => p.name === "GROWTH")!;
    expect(growth.yearlyFee).toBe(50000);
    expect(growth.yearlySaving!.pct).toBe(17);
    expect(d.plans.find((p) => p.name === "CHAIN")!.yearlyFee).toBeNull();
  });
});
