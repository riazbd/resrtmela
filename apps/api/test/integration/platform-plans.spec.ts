/**
 * Plans are rows in a table with an editing screen, so adding or changing one
 * must not need a code change — and must not be silently undone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { PlatformService } from "../../src/platform/platform.service";
import { AuditService } from "../../src/common/audit.service";
import { EmailService } from "../../src/notifications/email.service";
import { DiscountService } from "../../src/common/discount.service";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;

const platform = () =>
  new PlatformService(
    asPrismaService,
    new AuditService(asPrismaService),
    new EmailService(),
    new DiscountService(asPrismaService),
    new PermissionsService(asPrismaService),
    new PlanLimitsService(asPrismaService),
  );

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("plan definitions", () => {
  it("keeps an edited limit instead of reverting it", async () => {
    const svc = platform();
    await svc.setSubscription(superAdmin, fx.resortId, { plan: "STARTER" });
    await svc.updatePlan(superAdmin, "STARTER", { maxResorts: 5, maxRooms: 99 });

    // anything that touches plans again must not undo the edit
    await svc.setSubscription(superAdmin, fx.resortId, { plan: "STARTER" });

    const starter = await prisma.platformPlan.findUniqueOrThrow({ where: { name: "STARTER" } });
    expect(starter.maxResorts).toBe(5);
    expect(starter.maxRooms).toBe(99);
  });

  it("accepts a plan the code has never heard of", async () => {
    await prisma.platformPlan.create({
      data: {
        name: "ENTERPRISE",
        label: "Enterprise",
        monthlyFee: 40000 as never,
        maxRooms: 500,
        maxResorts: 50,
        trialDays: 30,
      },
    });

    const sub = await platform().setSubscription(superAdmin, fx.resortId, { plan: "ENTERPRISE" });

    expect(sub.plan).toBe("ENTERPRISE");
    expect(Number(sub.fee)).toBe(40000);
  });

  it("refuses a plan that does not exist", async () => {
    await expect(
      platform().setSubscription(superAdmin, fx.resortId, { plan: "MADE_UP" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("takes the trial length from the plan, not from a constant", async () => {
    await prisma.platformPlan.create({
      data: {
        name: "ENTERPRISE",
        label: "Enterprise",
        monthlyFee: 40000 as never,
        maxRooms: 500,
        maxResorts: 50,
        trialDays: 30,
      },
    });

    const sub = await platform().setSubscription(superAdmin, fx.resortId, { plan: "ENTERPRISE" });

    const days = Math.round(
      (sub.trialEndsAt!.getTime() - sub.startedAt.getTime()) / 86_400_000,
    );
    expect(days).toBe(30);
  });

  it("prices the subscription from the plan when no fee is given", async () => {
    await platform().updatePlan(superAdmin, "GROWTH", { monthlyFee: 7777 });

    const sub = await platform().setSubscription(superAdmin, fx.resortId, { plan: "GROWTH" });

    expect(Number(sub.fee)).toBe(7777);
  });
});
