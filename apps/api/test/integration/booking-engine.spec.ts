/**
 * The booking engine's guarantees, exercised against a real database.
 *
 * These are the promises the whole product rests on -- a room cannot be sold
 * twice, a stay is worth one number, cancelling frees the nights -- and they
 * are enforced by the database (UNIQUE(roomId, night)), so nothing short of a
 * real MySQL proves them.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { BookingsService } from "../../src/bookings/bookings.service";
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

const stay = (overrides: Record<string, unknown> = {}) => ({
  resortId: fx.resortId,
  roomIds: [fx.rooms[0]!.id],
  checkIn: "2026-08-15",
  checkOut: "2026-08-18",
  adults: 2,
  children: 0,
  guest: { fullName: "Test Guest", phone: "8801711111111" },
  ...overrides,
});

describe("the double-booking guard", () => {
  it("sells a room to exactly one of two simultaneous requests", async () => {
    const results = await Promise.allSettled([
      bookings.create(claims, stay() as never),
      bookings.create(claims, stay() as never),
    ]);

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
  });

  it("rejects a stay that merely overlaps an existing one", async () => {
    await bookings.create(claims, stay() as never);

    await expect(
      bookings.create(claims, stay({ checkIn: "2026-08-17", checkOut: "2026-08-20" }) as never),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows a stay starting the day the previous guest leaves", async () => {
    await bookings.create(claims, stay() as never);

    // checkout on the 18th frees the 18th as a night for the next guest
    const next = await bookings.create(
      claims,
      stay({ checkIn: "2026-08-18", checkOut: "2026-08-20" }) as never,
    );
    expect(next.code).toMatch(/^BK-\d{5}$/);
  });

  it("frees the nights when a booking is cancelled", async () => {
    const first = await bookings.create(claims, stay() as never);
    await bookings.transition(claims, first.id, "CANCELLED");

    const replacement = await bookings.create(claims, stay() as never);
    expect(replacement.id).not.toBe(first.id);
  });
});

describe("booking codes", () => {
  it("issues one unbroken per-resort sequence", async () => {
    const a = await bookings.create(claims, stay() as never);
    const b = await bookings.create(claims, stay({ roomIds: [fx.rooms[1]!.id] }) as never);

    expect(Number(b.code.slice(3))).toBe(Number(a.code.slice(3)) + 1);
  });
});

describe("what a stay is worth", () => {
  it("charges the room rate for every night booked", async () => {
    const booking = await bookings.create(claims, stay({ discount: 0 }) as never);

    expect(booking.nights).toBe(3);
    expect(booking.rent).toBe(15000);
    expect(booking.due).toBe(15000);
    expect(booking.paymentState).toBe("UNPAID");
  });

  it("records an advance against the due", async () => {
    const booking = await bookings.create(
      claims,
      stay({ discount: 0, advancePayment: { amount: 5000, method: "CASH" } }) as never,
    );

    expect(booking.paid).toBe(5000);
    expect(booking.due).toBe(10000);
    expect(booking.paymentState).toBe("PARTIAL");
  });

  it("shows the same due on the Day Sheet as on the booking", async () => {
    const booking = await bookings.create(
      claims,
      stay({ discount: 3000, advancePayment: { amount: 2000, method: "CASH" } }) as never,
    );

    const sheet = await bookings.daySheet(claims, fx.resortId, "2026-08-15");
    const cell = sheet.rooms.find((r) => r.roomId === fx.rooms[0]!.id)!.cell as {
      mode: string;
      due: number;
      revenue: number;
    };

    expect(cell.mode).toBe("booked");
    expect(cell.due).toBe(booking.due); // 15000 - 3000 - 2000
    expect(cell.revenue).toBe(4000); // (15000 - 3000) / 3 nights
  });
});

describe("the booking lifecycle", () => {
  it("walks a stay from confirmed through to checked out", async () => {
    const booking = await bookings.create(claims, stay() as never);
    expect(booking.state).toBe("CONFIRMED");

    const checkedIn = await bookings.transition(claims, booking.id, "CHECKED_IN");
    expect(checkedIn.state).toBe("CHECKED_IN");

    const checkedOut = await bookings.transition(claims, booking.id, "CHECKED_OUT");
    expect(checkedOut.state).toBe("CHECKED_OUT");
  });

  it("refuses to skip check-in", async () => {
    const booking = await bookings.create(claims, stay() as never);

    await expect(bookings.transition(claims, booking.id, "CHECKED_OUT")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("keeps a checked-out stay on the Day Sheet for its own nights", async () => {
    const booking = await bookings.create(claims, stay() as never);
    await bookings.transition(claims, booking.id, "CHECKED_IN");
    await bookings.transition(claims, booking.id, "CHECKED_OUT");

    // night rows are released on checkout, but history is computed from the
    // booking itself, so past days must still show the stay
    const sheet = await bookings.daySheet(claims, fx.resortId, "2026-08-16");
    const cell = sheet.rooms.find((r) => r.roomId === fx.rooms[0]!.id)!.cell as { mode: string };
    expect(cell.mode).toBe("booked");
  });
});

describe("tour groups", () => {
  it("books several rooms under one guest and one group tag", async () => {
    const group = await bookings.createGroupBooking(claims, {
      resortId: fx.resortId,
      roomIds: fx.rooms.map((r) => r.id),
      checkIn: "2026-09-01",
      checkOut: "2026-09-03",
      guest: { fullName: "Kaktaruya Tour", phone: "8801755555555" },
      adults: 4,
    });

    expect(group.groupTag).toMatch(/^GRP-\d{4}$/);
    expect(group.count).toBe(2);

    const rows = await prisma.booking.findMany({ where: { groupTag: group.groupTag } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.guestId)).size).toBe(1); // one guest, N stays
  });
});
