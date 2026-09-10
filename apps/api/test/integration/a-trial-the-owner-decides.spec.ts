/**
 * The free trial is the owner's to give, including the length and including
 * none at all.
 *
 * Its length became a per-plan field when plans stopped being seeded in code.
 * Two things were still not the owner's to decide.
 *
 * A plan selling no trial did not work. `setSubscription` always created the
 * row in TRIAL and set `trialEndsAt` to `now + trialDays`, so zero days meant a
 * trial that had already expired: the money came out right, because the sweep
 * bills from `trialEndsAt`, but until the next hourly sweep the resort's own
 * subscription page said TRIAL and named an end date in the past. A plan with
 * no trial should start the customer paying.
 *
 * And there was no way to give one resort different terms from the plan's. The
 * fee could be overridden per resort — `setSubscription` has taken a
 * `monthlyFee` since the beginning — but the trial could not, so "thirty days
 * for this one, they are moving from a competitor" was a plan change or
 * nothing.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeBillingService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const platform = () => makePlatformService(asPrisma);
const DAY = 86_400_000;

/** How many days from now, rounded — the clock moves during a test. */
const daysFromNow = (d: Date | null) => (d ? Math.round((d.getTime() - Date.now()) / DAY) : null);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a plan that sells no free trial", () => {
  beforeEach(async () => {
    await platform().updatePlan(owner, "STARTER", { trialDays: 0 });
  });

  it("starts the customer paying rather than on a trial that already ended", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).toBeNull();
  });

  it("is billed from the day it starts", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    const result = await makeBillingService(asPrisma).sweep(new Date());

    expect(result.duesRaised).toBe(1);
    const due = await prisma.subscriptionDue.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(Number(due.amount)).toBe(2500);
  });

  it("is not counted as a trial ending, because there was no trial", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    expect((await makeBillingService(asPrisma).sweep(new Date())).trialsEnded).toBe(0);
  });
});

describe("a trial length set for one resort", () => {
  it("overrides what the plan sells", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      trialDays: 45,
    });

    expect(sub.status).toBe("TRIAL");
    expect(daysFromNow(sub.trialEndsAt)).toBe(45);
  });

  it("can be none, for a customer paying from the first day", async () => {
    const sub = await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      trialDays: 0,
    });

    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).toBeNull();
  });

  it("falls back to the plan's when nobody says otherwise", async () => {
    await platform().updatePlan(owner, "STARTER", { trialDays: 21 });

    const sub = await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    expect(daysFromNow(sub.trialEndsAt)).toBe(21);
  });

  it("is held to the same bounds as the plan's, so nobody types a year by accident", async () => {
    await expect(
      platform().setSubscription(owner, fx.resortId, { plan: "STARTER", trialDays: 4000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cannot be negative", async () => {
    await expect(
      platform().setSubscription(owner, fx.resortId, { plan: "STARTER", trialDays: -1 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("what a trial is still not", () => {
  it("a second one, for a resort that has already started paying", async () => {
    /**
     * The rule that stopped a resort restarting its free trial by changing
     * plan. A per-resort trial length must not become the way back round it.
     */
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER", trialDays: 1 });
    await prisma.subscription.updateMany({
      where: { resortId: fx.resortId },
      data: { status: "ACTIVE", trialEndsAt: null },
    });

    const moved = await platform().setSubscription(owner, fx.resortId, {
      plan: "GROWTH",
      trialDays: 60,
    });

    expect(moved.status).toBe("ACTIVE");
    expect(moved.trialEndsAt).toBeNull();
  });
});
