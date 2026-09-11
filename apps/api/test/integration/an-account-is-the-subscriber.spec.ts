/**
 * The subscriber is an account, not a resort.
 *
 * `Subscription.resortId` welded the bill to a building. That was fine while
 * every customer rented rooms, and it is wrong the moment a customer sells them:
 * a travel agency owns no resort, so under the old shape it could not hold a
 * subscription at all, and a chain owner with two resorts could be billed twice
 * for one account. The entitlement code already knew better — `PlanLimits`
 * looked the plan up by tenant and used the resort only as a bridge.
 *
 * The phase-2 gate (2026-09-11 design, §10): an account with no resort can hold
 * a subscription, be billed, fall overdue and be suspended.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBillingService, makePlatformService, makePlanLimits } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;

const T0 = new Date("2026-03-01T09:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await prisma.platformPlan.upsert({
    where: { name: "STARTER" },
    create: { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 10, maxResorts: 2, trialDays: 14 },
    update: { monthlyFee: 2500, maxRooms: 10, maxResorts: 2, trialDays: 14 },
  });
  // an agency is sold from its own shelf (phase 3), so the agency here needs a plan from it
  await prisma.platformPlan.upsert({
    where: { name: "AGENCY_START" },
    create: { name: "AGENCY_START", label: "Agency Start", monthlyFee: 1000, maxRooms: 0, maxResorts: 0, trialDays: 14, audience: "AGENCY" } as never,
    update: {},
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A customer that sells stays rather than hosting them: no resort at all. */
const agencyAccount = () =>
  prisma.tenant.create({ data: { name: "Sea Breeze Travels", slug: `sea-breeze-${Date.now()}`, kind: "AGENCY" } as never });

const tenant = (id: number) =>
  prisma.tenant.findUniqueOrThrow({ where: { id } }) as unknown as Promise<{ status: string; suspendedReason: string | null }>;

describe("an account with no resort", () => {
  it("can hold a subscription", async () => {
    const account = await agencyAccount();

    const sub = await makePlatformService(asPrisma).setAccountSubscription(superAdmin, account.id, { plan: "AGENCY_START" });

    expect((sub as unknown as { accountId: number }).accountId).toBe(account.id);
    expect(sub.status).toBe("TRIAL");
  });

  it("is billed when its trial ends", async () => {
    const account = await agencyAccount();
    await prisma.subscription.create({
      data: { accountId: account.id, plan: "STARTER", status: "TRIAL", monthlyFee: 2500, trialEndsAt: day(14), renewsAt: day(14) } as never,
    });

    await makeBillingService(asPrisma).sweep(day(15));

    const dues = await prisma.subscriptionDue.findMany();
    expect(dues).toHaveLength(1);
    expect((dues[0] as unknown as { accountId: number }).accountId).toBe(account.id);
  });

  it("falls overdue, and is suspended when it does not pay — then comes back when it does", async () => {
    const account = await agencyAccount();
    await prisma.subscription.create({
      data: { accountId: account.id, plan: "STARTER", status: "TRIAL", monthlyFee: 2500, trialEndsAt: day(14), renewsAt: day(14) } as never,
    });

    // far enough past the first bill for every window of the default policy
    await makeBillingService(asPrisma).sweep(day(60));

    const sub = await prisma.subscription.findFirstOrThrow();
    expect(sub.status).toBe("PAST_DUE");
    const overdue = await prisma.subscriptionDue.findMany({ where: { status: "OVERDUE" } });
    expect(overdue.length).toBeGreaterThan(0);
    expect(await tenant(account.id)).toMatchObject({ status: "suspended", suspendedReason: "billing" });

    for (const due of await prisma.subscriptionDue.findMany()) {
      await makePlatformService(asPrisma).payDue(superAdmin, Number(due.id), "CASH");
    }
    expect(await tenant(account.id)).toMatchObject({ status: "active", suspendedReason: null });
  });
});

describe("a chain owner's account", () => {
  it("holds one subscription that every one of its resorts is entitled by", async () => {
    const second = await prisma.resort.create({ data: { tenantId: fx.tenantId, name: "Second Resort" } as never });
    await makePlatformService(asPrisma).setSubscription(superAdmin, fx.resortId, { plan: "STARTER" });

    const limits = makePlanLimits(asPrisma);
    expect((await limits.forResort(second.id)).label).toBe("Starter");
    expect(await prisma.subscription.count()).toBe(1);
  });

  it("cannot hold two live subscriptions — the database refuses the second", async () => {
    await prisma.subscription.create({
      data: { accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", monthlyFee: 2500 } as never,
    });

    await expect(
      prisma.subscription.create({
        data: { accountId: fx.tenantId, plan: "STARTER", status: "TRIAL", monthlyFee: 2500 } as never,
      }),
    ).rejects.toThrow();
  });
});

describe("the account's shape", () => {
  it("has no second answer to \"what plan is this customer on\" — Tenant.plan is gone", async () => {
    const cols = await prisma.$queryRawUnsafe<{ c: string }[]>(
      "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'",
    );
    const names = cols.map((r) => r.c);
    expect(names).not.toContain("plan");
    expect(names).toContain("kind");
  });

  it("puts every plan on a shelf — resort plans by default", async () => {
    const plan = await prisma.platformPlan.findUniqueOrThrow({ where: { name: "STARTER" } });
    expect((plan as unknown as { audience: string }).audience).toBe("RESORT");
  });
});
