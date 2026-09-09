/**
 * Writing the same thing twice.
 *
 * The front desk is being made offline-tolerant: a check-in or a payment
 * taken while the connection is down is queued on the device and replayed
 * when it comes back. Replay means the same request can arrive twice — the
 * first attempt may well have reached the server and had its response lost on
 * the way back, which on a hill-district connection is the common case, not
 * the rare one.
 *
 * Without a guard, that is a second receipt in a guest's hand and a booking
 * that says it was overpaid. The guard is a client-generated reference the
 * server treats as the identity of the write.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makePaymentsService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;
let bookingId: number;

const payments = () => makePaymentsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-04-01",
    checkOut: "2026-04-03",
    unitPrice: 5000,
  });
  bookingId = b.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const pay = (over: Record<string, unknown> = {}) =>
  payments().addPayment(claims, bookingId, {
    amount: 3000,
    method: "CASH",
    clientRef: "desk-1:abc123",
    ...over,
  } as never);

describe("payment idempotency", () => {
  it("takes the money once when the same request arrives twice", async () => {
    const first = await pay();
    const second = await pay();

    expect(second.payment.id).toBe(first.payment.id);
    const rows = await prisma.payment.findMany({ where: { bookingId } });
    expect(rows).toHaveLength(1);
    expect(second.booking.paid).toBe(3000);
  });

  it("returns the booking as it stands, so the replaying device sees the truth", async () => {
    await pay();
    const replay = await pay();
    expect(replay.booking.due).toBe(7000); // 5000 x 2 nights - 3000
  });

  it("still takes two payments that are genuinely two payments", async () => {
    await pay({ clientRef: "desk-1:one" });
    await pay({ clientRef: "desk-1:two" });

    const rows = await prisma.payment.findMany({ where: { bookingId } });
    expect(rows).toHaveLength(2);
  });

  it("does not make a payment without a reference idempotent by accident", async () => {
    // two identical cash notes handed over at the counter are two payments
    await pay({ clientRef: undefined });
    await pay({ clientRef: undefined });

    const rows = await prisma.payment.findMany({ where: { bookingId } });
    expect(rows).toHaveLength(2);
  });

  it("keeps one device's reference from colliding with another booking's", async () => {
    const other = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-05-01",
      checkOut: "2026-05-02",
      roomId: fx.rooms[1]!.id,
    });
    await pay();
    await payments().addPayment(claims, other.id, {
      amount: 1000,
      method: "CASH",
      clientRef: "desk-1:abc123",
    } as never);

    expect(await prisma.payment.count()).toBe(2);
  });
});

describe("replaying a state change", () => {
  it("treats moving to the state it is already in as done, not as a conflict", async () => {
    const bookings = makeBookingsService(asPrismaService);
    await bookings.transition(claims, bookingId, "CHECKED_IN");

    // the offline outbox replays the same request; the first one may well have
    // landed and only the response been lost
    const again = await bookings.transition(claims, bookingId, "CHECKED_IN");

    expect(again.state).toBe("CHECKED_IN");
  });

  it("still refuses a transition that makes no sense", async () => {
    const bookings = makeBookingsService(asPrismaService);
    await expect(bookings.transition(claims, bookingId, "CHECKED_OUT")).rejects.toMatchObject({
      status: 409,
    });
  });
});
