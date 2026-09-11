/**
 * One plan vocabulary.
 *
 * There were two, and they did not know about each other. The code held
 * FREE / STANDARD / PRO with limits of 10 / 50 / 500 rooms; the database held
 * STARTER / GROWTH / CHAIN with 10 / 40 / 10,000, editable by the super admin.
 * `PlanLimitsService` silently chose between them.
 *
 * The consequences were not theoretical. Signup put every new tenant on "FREE",
 * a name that did not exist in the plan table at all, so a new customer's
 * limits lived in a constant nobody could change without a deploy. And the
 * super admin's own plan-change screen refused every plan the platform actually
 * sells, because it validated against the code list.
 *
 * The database is the vocabulary now. The legacy names survive as inactive rows
 * carrying exactly the limits they always had, so no existing tenant's capacity
 * moves by a single room on the day this lands — which is the whole point of
 * doing it this way rather than mapping old names onto new plans.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeTenancyService, makePlanLimits } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;

const limits = () => makePlanLimits(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  const su = await prisma.user.create({
    data: { name: "Platform", phone: `8899${Date.now() % 100000000}`, email: `8899${Date.now() % 100000000}@example.com`, role: "SUPER_ADMIN" },
  });
  superAdmin = { userId: su.id, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("where a limit comes from", () => {
  it("reads the plan table, so the super admin can change it without a deploy", async () => {
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "STARTER" } });
    await prisma.platformPlan.update({ where: { name: "STARTER" }, data: { maxRooms: 3 } });

    expect((await limits().forTenant(fx.tenantId)).maxRooms).toBe(3);
  });

  it("keeps a legacy tenant on exactly the limits it always had", async () => {
    // STANDARD gave 50 rooms in code; GROWTH, the plan nearest to it, gives 40.
    // Unifying the tables must not quietly take ten rooms off a paying customer.
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "STANDARD" } });

    expect((await limits().forTenant(fx.tenantId)).maxRooms).toBe(50);
  });

  it("does not offer the legacy names for sale", async () => {
    const legacy = await prisma.platformPlan.findMany({
      where: { name: { in: ["FREE", "STANDARD", "PRO"] } },
    });

    expect(legacy).toHaveLength(3);
    expect(legacy.every((p) => !p.active)).toBe(true);
  });

  it("survives a plan name nobody recognises by falling to the cheapest plan on sale", async () => {
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "ENTERPRISE_XL" } });

    const found = await limits().forTenant(fx.tenantId);

    expect(found.label).toBe("Starter");
    expect(found.source).toBe("fallback");
  });

  it("still prefers a subscription over whatever the tenant row says", async () => {
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "PRO" } });
    await prisma.subscription.create({
      data: { resortId: fx.resortId, plan: "STARTER", status: "ACTIVE", monthlyFee: 2500 },
    });

    expect((await limits().forTenant(fx.tenantId)).maxRooms).toBe(10);
  });
});

describe("changing a tenant's plan", () => {
  it("accepts any plan the platform actually sells", async () => {
    const tenant = await makeTenancyService(asPrismaService).updatePlan(superAdmin, fx.tenantId, "GROWTH");

    // the old code list refused this outright: it had never heard of GROWTH,
    // so the super admin could not set a tenant to a plan on the price list
    expect(tenant.plan).toBe("GROWTH");
  });

  it("refuses a plan that does not exist, and says what does", async () => {
    await expect(
      makeTenancyService(asPrismaService).updatePlan(superAdmin, fx.tenantId, "PLATINUM"),
    ).rejects.toThrow(/STARTER/);
  });

  it("is closed to everyone but the platform team", async () => {
    const owner: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };

    await expect(
      makeTenancyService(asPrismaService).updatePlan(owner, fx.tenantId, "GROWTH"),
    ).rejects.toThrow();
  });
});
