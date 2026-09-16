/**
 * What a resort may use when its plan cannot be resolved.
 *
 * `effective()` in `plan-limits.service.ts` says it in one line: only a real
 * subscription can take a feature away. Anything else — no subscription row, a
 * cancelled one, or one naming a plan the platform no longer sells — falls back
 * to the cheapest plan on the shelf for its *limits*, and to **every feature**
 * for what it may do.
 *
 * That is a deliberate choice and a defensible one: a customer whose billing
 * has gone wrong should not find the restaurant screen gone while somebody
 * sorts it out. But it is easy to read the code and believe it can never
 * happen, so these are the three ways in, written down and run.
 *
 * The one that matters most is the third: renaming or retiring a plan row in
 * Platform → Plans silently hands every account on it the whole product, and
 * nothing anywhere would say so.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ALL_PLAN_FEATURES } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

const plans = () => new PlanLimitsService(asPrisma);

/** A plan that sells exactly one feature, so "everything" is unmistakable. */
async function shelfWithOneNarrowPlan(name = "TINY") {
  await prisma.platformPlan.deleteMany({});
  await prisma.platformPlan.create({
    data: {
      name,
      label: "Tiny",
      maxRooms: 5,
      maxResorts: 1,
      maxStaff: 2,
      trialDays: 0,
      active: true,
      sortOrder: 1,
      audience: "RESORT",
      features: ["payroll"] as never,
    },
  });
  return name;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => prisma.$disconnect());

describe("a resort whose plan resolves", () => {
  it("is held to exactly what that plan sells", async () => {
    const name = await shelfWithOneNarrowPlan();
    await prisma.subscription.create({
      data: { accountId: fx.tenantId, plan: name, status: "TRIAL", fee: 0 as never },
    });

    const features = await plans().featuresFor(fx.resortId);

    expect(features).toEqual(["payroll"]);
    expect(features).not.toContain("restaurant");
  });
});

describe("a resort whose plan does not resolve", () => {
  /** 1. Nobody ever opened a subscription — `POST /tenants` does exactly this. */
  it("gets every feature when there is no subscription at all", async () => {
    await shelfWithOneNarrowPlan();
    await prisma.subscription.deleteMany({ where: { accountId: fx.tenantId } });

    const features = await plans().featuresFor(fx.resortId);

    expect([...features].sort()).toEqual([...ALL_PLAN_FEATURES].sort());
  });

  /** 2. Cancelled, which the query excludes by name. */
  it("gets every feature when the only subscription is cancelled", async () => {
    const name = await shelfWithOneNarrowPlan();
    await prisma.subscription.deleteMany({ where: { accountId: fx.tenantId } });
    await prisma.subscription.create({
      data: { accountId: fx.tenantId, plan: name, status: "CANCELLED", fee: 0 as never },
    });

    const features = await plans().featuresFor(fx.resortId);

    expect([...features].sort()).toEqual([...ALL_PLAN_FEATURES].sort());
  });

  /**
   * 3. The quiet one. A subscription naming a plan that is not on the shelf —
   * because it was renamed or removed in Platform → Plans — resolves to
   * nothing, and nothing means everything.
   */
  it("gets every feature when its plan is no longer on the shelf", async () => {
    await shelfWithOneNarrowPlan("TINY");
    await prisma.subscription.deleteMany({ where: { accountId: fx.tenantId } });
    await prisma.subscription.create({
      data: { accountId: fx.tenantId, plan: "TINY", status: "TRIAL", fee: 0 as never },
    });
    expect(await plans().featuresFor(fx.resortId)).toEqual(["payroll"]);

    // the super admin renames the plan; every account on it is now unresolved
    await prisma.platformPlan.updateMany({ where: { name: "TINY" }, data: { name: "TINY_V2" } });

    const features = await plans().featuresFor(fx.resortId);

    expect([...features].sort()).toEqual([...ALL_PLAN_FEATURES].sort());
  });

  /**
   * And the door agrees with the menu. `requireFeature` and `featuresFor` both
   * go through `effective()` precisely so a screen cannot be offered and then
   * refused, or refused and then offered.
   */
  it("opens the doors to match, rather than offering what it then refuses", async () => {
    await shelfWithOneNarrowPlan();
    await prisma.subscription.deleteMany({ where: { accountId: fx.tenantId } });

    await expect(plans().requireFeature(fx.resortId, "website")).resolves.toBeUndefined();
    expect(await plans().hasFeature(fx.resortId, "public_api")).toBe(true);
  });
});
