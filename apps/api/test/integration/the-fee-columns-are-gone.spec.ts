/**
 * The last two columns that could only hold two prices.
 *
 * `PlatformPlan.monthlyFee` and `yearlyFee` were the platform's whole pricing
 * vocabulary, and the ladder replaced them — but replacing what reads a column
 * is not the same as removing it, and three things still did: the plan form
 * wrote them, the bootstrap seeds set them, and `cheapestOnSale` sorted by one.
 * A migration dropping the columns under that code would have taken the
 * platform's own plan list down with it.
 *
 * So the reads move first, and this pins what has to keep working once they
 * have: creating a plan still gives it a price, the plan the platform falls
 * back to is still the cheapest one on sale, and both answers now come from
 * the schedules rather than from a column.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makePlanLimits } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const platform = () => makePlatformService(asPrismaService);
const limits = () => makePlanLimits(asPrismaService);
const db = () => prisma as unknown as PrismaClient;

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("creating a plan", () => {
  it("gives it a price, in the only place a price lives", async () => {
    await platform().createPlan(owner, {
      name: "ENTERPRISE",
      label: "Enterprise",
      price: 7777,
      maxRooms: 500,
      maxResorts: 5,
      trialDays: 7,
    } as never);

    const schedules = await platform().planSchedules(owner, "ENTERPRISE");
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.label).toBe("Monthly");
    expect(schedules[0]!.phases).toEqual([
      { count: 1, unit: "MONTH", price: 7777, repeats: null },
    ]);
  });

  it("puts a subscription on that price without anybody naming a fee", async () => {
    await platform().createPlan(owner, {
      name: "ENTERPRISE", label: "Enterprise", price: 7777,
      maxRooms: 500, maxResorts: 5, trialDays: 0,
    } as never);

    const sub = await platform().setSubscription(owner, fx.resortId, { plan: "ENTERPRISE" });

    expect(Number(sub.fee)).toBe(7777);
  });

  /**
   * A plan is unsellable without one, and `scheduleFor` refuses rather than
   * guessing — so the refusal belongs at the moment of creation, where the
   * person can still do something about it.
   */
  it("refuses a plan with no price at all", async () => {
    await expect(
      platform().createPlan(owner, {
        name: "FREEBIE", label: "Freebie", maxRooms: 5, maxResorts: 1, trialDays: 0,
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("the plan the platform falls back to", () => {
  /**
   * `cheapestOnSale` ordered by `monthlyFee`, a column that no longer holds a
   * price. Cheapest still means cheapest — measured per month, from the ladder,
   * so a plan sold only by the year is compared fairly against one sold by the
   * month.
   */
  it("is still the cheapest on sale, measured from its ladder", async () => {
    await platform().setSchedules(owner, "STARTER", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 9000, repeats: null }] },
    ]);
    await platform().setSchedules(owner, "GROWTH", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 400, repeats: null }] },
    ]);

    const fallback = await limits().forResort(-1);

    expect(fallback.label).toBe("Growth");
  });

  it("compares a yearly shelf per month rather than by its sticker", async () => {
    // ৳6,000 a year is ৳500 a month — cheaper than Growth's ৳900
    await platform().setSchedules(owner, "STARTER", [
      { label: "Yearly", phases: [{ count: 1, unit: "YEAR", price: 6000, repeats: null }] },
    ]);
    await platform().setSchedules(owner, "GROWTH", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 900, repeats: null }] },
    ]);
    await platform().setSchedules(owner, "CHAIN", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 800, repeats: null }] },
    ]);

    const fallback = await limits().forResort(-1);

    expect(fallback.label).toBe("Starter");
  });

  /**
   * An introductory rung must not decide it. A plan that opens free would
   * otherwise always be "the cheapest", and the platform's fallback limits
   * would follow whichever promotion happened to be running.
   */
  it("ignores an opening rung, because a promotion is not a price", async () => {
    await platform().setSchedules(owner, "STARTER", [
      {
        label: "Intro",
        phases: [
          { count: 1, unit: "MONTH", price: 0, repeats: 1 },
          { count: 1, unit: "MONTH", price: 9000, repeats: null },
        ],
      },
    ]);
    await platform().setSchedules(owner, "GROWTH", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 500, repeats: null }] },
    ]);

    const fallback = await limits().forResort(-1);

    expect(fallback.label).toBe("Growth");
  });
});
