/**
 * The subscription lifecycle.
 *
 * Before this, a subscription was a row somebody typed and then forgot: a
 * trial never ended, a renewal never raised a bill, PAST_DUE was a status no
 * code could reach, and the suspension mechanism built in P0 was never turned
 * on by anything. A tenant who stopped paying kept full use of the product
 * because nobody noticed.
 *
 * The sweep is the thing that notices. Time is a parameter here, not the wall
 * clock, so a year of billing runs in milliseconds.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBillingService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;

const billing = () => makeBillingService(asPrismaService);

/** 2026-03-01, so every offset below reads as a calendar date. */
const T0 = new Date("2026-03-01T09:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  // the plan catalogue is part of the reset baseline now, the way it is in any
  // real database; this pins the numbers this file's arithmetic depends on
  await prisma.platformPlan.upsert({
    where: { name: "STARTER" },
    create: { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 10, maxResorts: 1, trialDays: 14 },
    update: { monthlyFee: 2500, maxRooms: 10, maxResorts: 1, trialDays: 14 },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A subscription in whatever state the test needs, without going through the UI path. */
async function subscription(over: Record<string, unknown> = {}) {
  return prisma.subscription.create({
    data: {
      resortId: fx.resortId,
      plan: "STARTER",
      status: "TRIAL",
      monthlyFee: 2500,
      trialEndsAt: day(14),
      renewsAt: day(14),
      ...over,
    } as never,
  });
}

const resortStatus = async () =>
  (await prisma.resort.findUnique({
    where: { id: fx.resortId },
    select: { status: true, suspendedReason: true },
  }))!;

const dues = () => prisma.subscriptionDue.findMany({ orderBy: { id: "asc" } });

describe("subscription lifecycle sweep", () => {
  it("ends a trial by raising the first bill and activating the subscription", async () => {
    const sub = await subscription();

    const result = await billing().sweep(day(15));

    expect(result.trialsEnded).toBe(1);
    const [due] = await dues();
    expect(Number(due!.amount)).toBe(2500);
    expect(due!.status).toBe("DUE");
    const after = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(after!.status).toBe("ACTIVE");
    // the next bill is a month after the trial ended, not a month after today
    expect(after!.renewsAt!.getUTCMonth()).toBe(day(14).getUTCMonth() + 1);
  });

  it("leaves a trial that has not ended alone", async () => {
    await subscription();
    const result = await billing().sweep(day(13));
    expect(result.trialsEnded).toBe(0);
    expect(await dues()).toHaveLength(0);
  });

  it("raises exactly one bill however many times it runs", async () => {
    await subscription();
    await billing().sweep(day(15));
    await billing().sweep(day(16));
    await billing().sweep(day(17));
    expect(await dues()).toHaveLength(1);
  });

  it("bills again when the renewal date passes", async () => {
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(2) });

    await billing().sweep(day(3));

    const rows = await dues();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount)).toBe(2500);
  });

  it("never bills a cancelled subscription", async () => {
    await subscription({ status: "CANCELLED", cancelledAt: day(1), renewsAt: day(2) });
    const result = await billing().sweep(day(30));
    expect(result.duesRaised).toBe(0);
    expect(await dues()).toHaveLength(0);
  });

  it("marks the bill overdue and the subscription past due once grace runs out", async () => {
    const sub = await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await billing().sweep(day(1)); // raises the bill, due that day

    // grace is 7 days by default: still fine on day 7, past due on day 9
    await billing().sweep(day(7));
    expect((await prisma.subscription.findUnique({ where: { id: sub.id } }))!.status).toBe("ACTIVE");

    const result = await billing().sweep(day(9));

    expect(result.duesOverdue).toBe(1);
    expect((await dues())[0]!.status).toBe("OVERDUE");
    expect((await prisma.subscription.findUnique({ where: { id: sub.id } }))!.status).toBe("PAST_DUE");
  });

  it("suspends the resort when the bill stays unpaid past the deadline", async () => {
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await billing().sweep(day(1));

    await billing().sweep(day(10));
    expect((await resortStatus()).status).toBe("active"); // past due, not yet suspended

    const result = await billing().sweep(day(16)); // 15 days after the due date

    expect(result.suspended).toBe(1);
    const resort = await resortStatus();
    expect(resort.status).toBe("suspended");
    expect(resort.suspendedReason).toBe("billing");
  });

  it("reads the grace and suspension windows from platform settings, not from a constant", async () => {
    // the same three days that leave a tenant merely past due on the default
    // policy suspend them outright on this one — one sweep, because a platform
    // that was down for a week must catch up rather than advance one step a day
    await prisma.platformSetting.create({ data: { key: "billing.graceDays", value: "0" } });
    await prisma.platformSetting.create({ data: { key: "billing.suspendAfterDays", value: "1" } });
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });

    const result = await billing().sweep(day(3));

    expect(result.duesRaised).toBe(1);
    expect(result.duesOverdue).toBe(1);
    expect(result.suspended).toBe(1);
  });

  it("does not touch a resort the super admin suspended by hand", async () => {
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { status: "suspended", suspendedReason: "abuse", suspendedAt: T0 },
    });
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await billing().sweep(day(1));
    await prisma.subscriptionDue.updateMany({ data: { status: "PAID", paidAt: day(2) } });

    const result = await billing().sweep(day(3));

    expect(result.resumed).toBe(0);
    const resort = await resortStatus();
    expect(resort.status).toBe("suspended");
    expect(resort.suspendedReason).toBe("abuse");
  });

  it("brings a billing-suspended resort straight back when the bill is paid", async () => {
    const sub = await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await billing().sweep(day(1));
    await billing().sweep(day(16));
    expect((await resortStatus()).status).toBe("suspended");

    const due = (await dues())[0]!;
    await makePlatformService(asPrismaService).payDue(superAdmin, Number(due.id), "bkash");

    const resort = await resortStatus();
    expect(resort.status).toBe("active");
    expect(resort.suspendedReason).toBe(null);
    expect((await prisma.subscription.findUnique({ where: { id: sub.id } }))!.status).toBe("ACTIVE");
  });

  it("warns before the trial ends instead of ending it silently", async () => {
    await subscription();

    await billing().sweep(day(12)); // 2 days out, inside the 3-day notice window

    const jobs = await prisma.notificationJob.findMany();
    expect(jobs.map((j) => j.template)).toContain("subscription_trial_ending");
    // and only once, however often the sweep runs
    await billing().sweep(day(13));
    const warned = (await prisma.notificationJob.findMany()).filter(
      (j) => j.template === "subscription_trial_ending",
    );
    expect(warned).toHaveLength(1);
  });

  it("warns before suspending, then tells them it happened", async () => {
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await billing().sweep(day(1));

    await billing().sweep(day(13)); // 2 days before the 15-day suspension deadline
    let templates = (await prisma.notificationJob.findMany()).map((j) => j.template);
    expect(templates).toContain("subscription_suspending");
    expect(templates).not.toContain("subscription_suspended");

    await billing().sweep(day(16));
    templates = (await prisma.notificationJob.findMany()).map((j) => j.template);
    expect(templates).toContain("subscription_suspended");
  });

  it("sweeps every tenant, not just the first one that is overdue", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await subscription({ status: "ACTIVE", trialEndsAt: null, renewsAt: day(0) });
    await prisma.subscription.create({
      data: {
        resortId: other.resortId,
        plan: "STARTER",
        status: "ACTIVE",
        monthlyFee: 2500,
        renewsAt: day(0),
      } as never,
    });

    const result = await billing().sweep(day(16));

    expect(result.duesRaised).toBe(2);
    expect(result.suspended).toBe(2);
  });
});
