/**
 * An agency plan sells a website and an API (2026-09-17 design, §2).
 *
 * The agency shelf of `PLAN_FEATURES` was empty — "each tool arrives with its
 * gate". These are the first two, and the gate is the resort's rule: only a
 * real subscription takes a feature away.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { PLAN_FEATURES, planFeaturesFor, ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { makePlatformService } from "../helpers/services";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

const plans = () => new PlanLimitsService(asPrisma);

async function agencyPlan(name: string, features: string[]) {
  return prisma.platformPlan.create({
    data: { name, label: name, maxRooms: 0, maxResorts: 0, maxStaff: 5, trialDays: 0, active: true, sortOrder: 1, audience: "AGENCY", features: features as never },
  });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => prisma.$disconnect());

describe("the agency shelf", () => {
  it("offers a website and an API, and nothing of the resort's", () => {
    expect(planFeaturesFor("AGENCY").sort()).toEqual(["agency_api", "agency_website"]);
    for (const key of ["agency_api", "agency_website"]) {
      expect(PLAN_FEATURES.find((f) => f.key === key)!.audience).toBe("AGENCY");
    }
  });

  it("can be ticked on an agency plan and not on a resort plan", async () => {
    const platform: JwtClaims = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
    const plan = await agencyPlan("AG_PRO", []);

    await makePlatformService(asPrisma).updatePlan(platform, plan.name, { features: ["agency_website", "agency_api"] });
    const saved = await prisma.platformPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(saved.features).toEqual(["agency_website", "agency_api"]);

    const resortPlan = await prisma.platformPlan.create({
      data: { name: "R_ONE", label: "R", maxRooms: 5, maxResorts: 1, maxStaff: 2, trialDays: 0, active: true, sortOrder: 1, audience: "RESORT", features: [] as never },
    });
    await expect(
      makePlatformService(asPrisma).updatePlan(platform, resortPlan.name, { features: ["agency_website"] }),
    ).rejects.toThrow();
  });
});

describe("what an agency may use", () => {
  it("is what its subscribed plan includes", async () => {
    await agencyPlan("AG_API", ["agency_api"]);
    await prisma.subscription.create({ data: { accountId: fx.agencyId, plan: "AG_API", status: "ACTIVE", fee: 0 as never } });

    expect(await plans().featuresForAccount(fx.agencyId)).toEqual(["agency_api"]);
    await expect(plans().requireAccountFeature(fx.agencyId, "agency_api")).resolves.toBeUndefined();
    await expect(plans().requireAccountFeature(fx.agencyId, "agency_website")).rejects.toThrow(/AG_API.*website/i);
  });

  it("is everything while nobody has sold it a plan, as for a resort", async () => {
    await agencyPlan("AG_NONE", []);

    expect(await plans().featuresForAccount(fx.agencyId)).toEqual(expect.arrayContaining(["agency_api", "agency_website"]));
  });
});
