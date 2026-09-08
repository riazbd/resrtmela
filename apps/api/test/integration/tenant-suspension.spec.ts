/**
 * A platform that cannot enforce its own terms cannot charge for itself.
 *
 * Suspending a resort set a status column that nothing read: a tenant who
 * stopped paying kept full use of the product. Suspension now blocks the money
 * paths and leaves reads open on purpose — an owner behind on a bill must
 * still be able to see and export their own data, or the product is holding it
 * hostage and they will never come back.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { BookingsService } from "../../src/bookings/bookings.service";
import { ExpensesService } from "../../src/expenses/expenses.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { TenantStateService } from "../../src/common/tenant-state.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;
let bookings: BookingsService;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  bookings = makeBookingsService(asPrismaService);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const suspend = () =>
  prisma.resort.update({ where: { id: fx.resortId }, data: { status: "suspended" } });

const stay = () => ({
  resortId: fx.resortId,
  roomIds: [fx.rooms[0]!.id],
  checkIn: "2026-08-15",
  checkOut: "2026-08-17",
  adults: 2,
  children: 0,
  guest: { fullName: "Test Guest", phone: "8801711111111" },
});

describe("a suspended resort", () => {
  it("cannot take new bookings", async () => {
    await suspend();

    await expect(bookings.create(claims, stay() as never)).rejects.toMatchObject({ status: 402 });
  });

  it("explains that it is a billing problem, not a permission problem", async () => {
    await suspend();

    await expect(bookings.create(claims, stay() as never)).rejects.toThrow(/suspend/i);
  });

  it("cannot record expenses", async () => {
    await suspend();
    const expenses = new ExpensesService(
      asPrismaService,
      new AuditService(asPrismaService),
      new PermissionsService(asPrismaService),
      new TenantStateService(asPrismaService),
    );

    await expect(
      expenses.create(claims, fx.resortId, { date: "2026-08-15", category: "Test", amount: 500 }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it("can still read its own data, so the owner is never locked out of it", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-15",
      checkOut: "2026-08-17",
    });
    await suspend();

    const list = await bookings.list(claims, { resortId: fx.resortId });
    expect(list.rows).toHaveLength(1);

    const sheet = await bookings.daySheet(claims, fx.resortId, "2026-08-15");
    expect(sheet.rooms.length).toBeGreaterThan(0);
  });

  it("works normally again once it is reactivated", async () => {
    await suspend();
    await prisma.resort.update({ where: { id: fx.resortId }, data: { status: "active" } });

    const booking = await bookings.create(claims, stay() as never);
    expect(booking.code).toMatch(/^BK-\d{5}$/);
  });
});

describe("an active resort", () => {
  it("is unaffected", async () => {
    const booking = await bookings.create(claims, stay() as never);
    expect(booking.code).toMatch(/^BK-\d{5}$/);
  });
});
