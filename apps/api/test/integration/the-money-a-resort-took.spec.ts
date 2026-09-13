/**
 * The resort's cash book, as somebody counting a drawer needs it.
 *
 * The report existed and answered only "how much did each person take". The
 * owner's word for it was that it is not clear, and on a platform with no
 * payment gateway the missing half is obvious once said: **how the money
 * arrived**. Cash is in a drawer and has to be counted tonight; bKash and a
 * bank transfer are somebody else's statement and have to be matched against
 * it. One number for both is not a reconciliation, it is an average.
 *
 * So the report gains a breakdown by method, and the same rule the totals
 * already follow: a refund is money leaving, and subtracts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeReportsService, makePaymentsService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

const reports = () => makeReportsService(asPrismaService);
const payments = () => makePaymentsService(asPrismaService);
const bookings = () => makeBookingsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function aBooking(n = 1): Promise<number> {
  const made = await bookings().create(manager, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[n - 1]!.id],
    checkIn: "2026-08-15",
    checkOut: "2026-08-18",
    adults: 2,
    children: 0,
    guest: { fullName: `Guest ${n}`, phone: `880171111111${n}` },
  } as never);
  return (made as { id: number }).id;
}

describe("how the money arrived", () => {
  it("adds up each method separately, because cash is counted and bKash is matched", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 3000, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 2000, method: "BKASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 1500, method: "CASH", type: "FINAL" });

    const report = await reports().collectors(manager, fx.resortId);

    expect(report.byMethod).toEqual([
      { method: "CASH", count: 2, total: 4500 },
      { method: "BKASH", count: 1, total: 2000 },
    ]);
  });

  it("puts the biggest first, which is the one worth checking", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 500, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 9000, method: "BANK", type: "ADVANCE" });

    const report = await reports().collectors(manager, fx.resortId);

    expect(report.byMethod.map((m) => m.method)).toEqual(["BANK", "CASH"]);
  });

  it("takes a refund off the method it went back through", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 5000, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 1000, method: "CASH", type: "REFUND" });

    const report = await reports().collectors(manager, fx.resortId);

    expect(report.byMethod).toEqual([{ method: "CASH", count: 2, total: 4000 }]);
  });

  it("reports the whole period's total once, so the cards do not have to be added up", async () => {
    const a = await aBooking(1);
    const b = await aBooking(2);
    await payments().addPayment(manager, a, { amount: 3000, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, b, { amount: 2000, method: "BKASH", type: "ADVANCE" });

    const report = await reports().collectors(manager, fx.resortId);

    expect(report.total).toBe(5000);
  });

  it("says nothing at all when nothing came in, rather than a row of zeroes", async () => {
    const report = await reports().collectors(manager, fx.resortId);
    expect(report.byMethod).toEqual([]);
    expect(report.total).toBe(0);
  });

  /**
   * The filter this card actually honours. The screen labelled it "Check-in
   * from/to", which is a different question — a stay in September and a
   * payment in September are not the same set, and an owner reconciling a
   * drawer means the second.
   */
  it("counts by when the money arrived, not by when the guest does", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 3000, method: "CASH", type: "ADVANCE" });
    await prisma.payment.updateMany({
      where: { bookingId: id },
      data: { receivedAt: new Date("2026-07-04T10:00:00Z") },
    });

    const inJuly = await reports().collectors(manager, fx.resortId, "2026-07-01", "2026-08-01");
    const inAugust = await reports().collectors(manager, fx.resortId, "2026-08-01", "2026-09-01");

    // the stay is in August; the money came in July
    expect(inJuly.total).toBe(3000);
    expect(inAugust.total).toBe(0);
  });
});
