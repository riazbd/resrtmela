/**
 * Plan limits had two sources of truth: a hard-coded PLANS table
 * (FREE/STANDARD/PRO) and the PlatformPlan rows (STARTER/GROWTH/CHAIN) that the
 * super admin edits in Platform -> Plans. Only the hard-coded one was ever
 * enforced, so editing a limit in the UI did nothing.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { RoomsService } from "../../src/rooms/rooms.service";
import { AuditService } from "../../src/common/audit.service";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const roomsService = () =>
  new RoomsService(asPrismaService, new AuditService(asPrismaService), new PlanLimitsService(asPrismaService));

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function subscribe(plan: "STARTER" | "GROWTH" | "CHAIN") {
  await prisma.subscription.create({
    data: { resortId: fx.resortId, plan, status: "ACTIVE", monthlyFee: 2500 },
  });
}

const addRoom = (name: string) =>
  roomsService().createRoom(claims, fx.resortId, { name, roomTypeId: fx.roomTypeId, baseRate: 5000 });

describe("plan limits", () => {
  it("enforces the room cap the super admin edited", async () => {
    await subscribe("STARTER");
    await prisma.platformPlan.upsert({
      where: { name: "STARTER" },
      create: { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 3, maxResorts: 1 },
      update: { maxRooms: 3 },
    });

    await addRoom("103"); // seed already made 101 and 102 -> this is the third
    await expect(addRoom("104")).rejects.toMatchObject({ status: 402 });
  });

  it("prefers the subscription's plan over the tenant's legacy plan", async () => {
    // legacy PRO would have allowed 500 rooms
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "PRO" } });
    await subscribe("STARTER");
    await prisma.platformPlan.upsert({
      where: { name: "STARTER" },
      create: { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 2, maxResorts: 1 },
      update: { maxRooms: 2 },
    });

    await expect(addRoom("103")).rejects.toMatchObject({ status: 402 });
  });

  it("falls back to the legacy plan when the resort has no subscription", async () => {
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "FREE" } });

    for (let i = 3; i <= 10; i++) await addRoom(`10${i}`); // up to 10 rooms
    await expect(addRoom("111")).rejects.toMatchObject({ status: 402 });
  });

  it("does not tighten a legacy tenant that was already above the new plan caps", async () => {
    // STANDARD historically allowed 50 rooms; GROWTH allows 40. An existing
    // tenant must not lose capacity just because the tables were unified.
    await prisma.tenant.update({ where: { id: fx.tenantId }, data: { plan: "STANDARD" } });

    for (let i = 3; i <= 41; i++) await addRoom(`room-${i}`);
    await expect(addRoom("room-42")).resolves.toBeTruthy();
  });
});
