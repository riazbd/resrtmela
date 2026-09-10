/**
 * The boxes in the matrix are the boxes the API asks about.
 *
 * `permissions.spec.ts` proves the *resolver* works: a custom role's keys beat
 * the fixed role's defaults. This file asks the question one layer out — does
 * anything actually call it?
 *
 * For eleven keys the answer was no. `bookings.view`, `guests.view`,
 * `payments.view`, `expenses.view`, `rooms.view`, `restaurant.view` and the
 * rest appear in `ALL_PERMISSIONS` and in the Settings screen, and
 * `perms.require` was never once called with any of them: every read endpoint
 * was gated on resort membership alone. So an owner who unticked "View guests"
 * for the front desk saw the menu item disappear and nothing else change — the
 * clerk could still read the whole guest directory with their own token.
 *
 * Three more were worse than unused. `bookings.update` — dates, rooms, and the
 * discount — asked for no permission at all. `transition` asked the fixed role
 * enum, so unticking "Cancel bookings" changed nothing for a front-desk user,
 * whose enum entry allows it. And three reports asked for nothing while the
 * five beside them asked for `reports.view`.
 *
 * A hidden link is not access control. These are the tests that say so.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import {
  makeBookingsService,
  makeExpensesService,
  makeFbService,
  makePaymentsService,
  makeReportsService,
  makeRoomsService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

/** A user whose access is exactly `permissions` — nothing from the fixed role. */
async function withPermissions(permissions: string[]): Promise<JwtClaims> {
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Scoped User",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      role: ROLE.FRONT_DESK,
      status: "active",
    },
  });
  await prisma.userResort.create({
    data: { userId: user.id, resortId: fx.resortId, roleId: role.id },
  });
  return { userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the view permissions, which nothing used to ask for", () => {
  it("keeps the guest directory from someone who may not view guests", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeBookingsService(asPrisma).guests(claims, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the booking calendar from someone who may not view bookings", async () => {
    const claims = await withPermissions(["rooms.view"]);
    await expect(
      makeBookingsService(asPrisma).calendar(claims, fx.resortId, "2026-11-01", "2026-11-08"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the dues ledger from someone who may not view payments", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makePaymentsService(asPrisma).dues(claims, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the expense book from someone who may not view expenses", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeExpensesService(asPrisma).list(claims, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the room list from someone who may not view rooms", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeRoomsService(asPrisma).listRooms(claims, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the restaurant bills from someone who may not view the restaurant", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeFbService(asPrisma).list(claims, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still lets the person who holds the box through it", async () => {
    const claims = await withPermissions([
      "bookings.view", "guests.view", "payments.view",
      "expenses.view", "rooms.view", "restaurant.view",
    ]);
    await expect(makeBookingsService(asPrisma).guests(claims, fx.resortId)).resolves.toBeDefined();
    await expect(makePaymentsService(asPrisma).dues(claims, fx.resortId)).resolves.toBeDefined();
    await expect(makeRoomsService(asPrisma).listRooms(claims, fx.resortId)).resolves.toBeDefined();
  });
});

describe("editing and cancelling a booking", () => {
  it("refuses an edit from someone who may not edit bookings", async () => {
    const claims = await withPermissions(["bookings.view"]);
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    await expect(
      makeBookingsService(asPrisma).update(claims, booking.id, { adults: 3 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a cancellation from someone whose box is unticked, whatever the role enum says", async () => {
    // FRONT_DESK is listed as a valid CANCELLED actor in the state machine, so
    // this is exactly the case where the enum and the matrix disagreed
    const claims = await withPermissions(["bookings.view", "bookings.edit"]);
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    await expect(
      makeBookingsService(asPrisma).transition(claims, booking.id, "CANCELLED"),
    ).rejects.toMatchObject({ status: 403 });

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.state).toBe("CONFIRMED");
  });

  it("still lets the desk check a guest in", async () => {
    const claims = await withPermissions(["bookings.view", "bookings.edit"]);
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    const after = await makeBookingsService(asPrisma).transition(claims, booking.id, "CHECKED_IN");
    expect(after.state).toBe("CHECKED_IN");
  });
});

describe("the three reports that asked for nothing", () => {
  const from = "2026-11-01";
  const to = "2026-12-01";

  it("keeps the dashboard metrics from someone who may not view reports", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeReportsService(asPrisma).metrics(claims, fx.resortId, from, to),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the daily revenue ledger from them too", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeReportsService(asPrisma).daily(claims, fx.resortId, from, to),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps idle inventory from them too", async () => {
    const claims = await withPermissions(["bookings.view"]);
    await expect(
      makeReportsService(asPrisma).idleInventory(claims, fx.resortId, from, to),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still lets a reports viewer read all three", async () => {
    const claims = await withPermissions(["reports.view"]);
    await expect(makeReportsService(asPrisma).metrics(claims, fx.resortId, from, to)).resolves.toBeDefined();
    await expect(makeReportsService(asPrisma).daily(claims, fx.resortId, from, to)).resolves.toBeDefined();
    await expect(makeReportsService(asPrisma).idleInventory(claims, fx.resortId, from, to)).resolves.toBeDefined();
  });
});
