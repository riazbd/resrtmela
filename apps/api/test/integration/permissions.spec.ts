/**
 * Roles are presets over a permission set, not gates in their own right.
 *
 * The Settings screen tells an owner they are ticking boxes that decide what a
 * user can do. That was mostly untrue: 40 resort-scoped endpoints ignored the
 * matrix entirely and checked the fixed role enum, so a custom role with every
 * box ticked still could not do what the enum forbade — and one with no boxes
 * could do whatever its underlying role allowed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeExpensesService, makeRoomsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { RoomsService } from "../../src/rooms/rooms.service";
import { ExpensesService } from "../../src/expenses/expenses.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { TenantStateService } from "../../src/common/tenant-state.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const rooms = () => makeRoomsService(asPrismaService);
const expenses = () =>
  makeExpensesService(asPrismaService);

/** A user whose access comes from a custom role holding exactly `permissions`. */
async function userWithPermissions(
  permissions: string[],
  fixedRole: (typeof ROLE)[keyof typeof ROLE] = ROLE.FRONT_DESK,
): Promise<JwtClaims> {
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Scoped User",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      role: fixedRole,
    },
  });
  await prisma.userResort.create({
    data: { userId: user.id, resortId: fx.resortId, roleId: role.id },
  });
  return { userId: user.id, role: fixedRole, resortIds: [fx.resortId] };
}

const newRoom = (claims: JwtClaims, name: string) =>
  rooms().createRoom(claims, fx.resortId, { name, roomTypeId: fx.roomTypeId, baseRate: 5000 });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a permission the fixed role would not have granted", () => {
  it("lets a front-desk user manage rooms when the owner ticked the box", async () => {
    const claims = await userWithPermissions(["rooms.manage"], ROLE.FRONT_DESK);

    const room = await newRoom(claims, "201");

    expect(room.name).toBe("201");
  });
});

describe("a missing permission the fixed role would have granted", () => {
  it("stops a manager from managing rooms when the owner did not tick the box", async () => {
    const claims = await userWithPermissions(["bookings.view"], ROLE.MANAGER);

    await expect(newRoom(claims, "202")).rejects.toMatchObject({ status: 403 });
  });

  it("stops a manager from deleting an expense", async () => {
    const expense = await prisma.expense.create({
      data: {
        resortId: fx.resortId,
        date: new Date("2026-08-15T00:00:00Z"),
        category: "Test",
        amount: 500 as never,
      },
    });
    const claims = await userWithPermissions(["expenses.view", "expenses.create"], ROLE.MANAGER);

    await expect(expenses().remove(claims, expense.id)).rejects.toMatchObject({ status: 403 });
  });

  it("names the permission that was missing, so the owner knows which box to tick", async () => {
    const claims = await userWithPermissions([], ROLE.MANAGER);

    await expect(newRoom(claims, "203")).rejects.toThrow(/rooms\.manage/);
  });
});

describe("the resort administrator", () => {
  it("keeps everything without needing a custom role", async () => {
    const owner = await prisma.user.create({
      data: { name: "Owner", phone: `8807${Math.floor(Math.random() * 1e8)}`, role: ROLE.RESORT_ADMIN },
    });
    await prisma.userResort.create({ data: { userId: owner.id, resortId: fx.resortId } });
    const claims: JwtClaims = {
      userId: owner.id,
      role: ROLE.RESORT_ADMIN,
      resortIds: [fx.resortId],
    };

    const room = await newRoom(claims, "301");

    expect(room.name).toBe("301");
  });
});

describe("a user with no custom role", () => {
  it("falls back to the defaults for their fixed role", async () => {
    // seeded manager, no CustomRole attached — Manager defaults include rooms.manage
    const claims: JwtClaims = {
      userId: fx.managerId,
      role: ROLE.MANAGER,
      resortIds: [fx.resortId],
    };

    const room = await newRoom(claims, "401");

    expect(room.name).toBe("401");
  });
});
