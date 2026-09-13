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

/**
 * The name the sheet wrote, which was there all along.
 *
 * In the client's production database 39 of 42 payments carry a note reading
 * `received by Rikan (sheet)` — the owner did write down who took the money,
 * in the "Advance received" column. The importer read it, put the name in the
 * note, then looked the person up with an unscoped name search that found
 * nobody, left `receivedById` null and said nothing. The report has been
 * calling ৳1,68,750 "Unassigned" with the answer in the next column.
 *
 * The first idea was to make those names linkable to staff accounts. That is
 * the wrong shape: Rikan may be somebody who took cash at the gate and will
 * never log in, and inventing a login for them to make a report read properly
 * is a worse answer than the report reading properly. The name is evidence
 * the owner themselves recorded — so it is shown, labelled as coming from the
 * sheet rather than from an account, and nothing is written anywhere.
 */
describe("the name the sheet wrote", () => {
  /** A payment as the importer leaves one: a name in the note, nobody credited. */
  async function imported(bookingId: number, name: string | null, amount: number) {
    await prisma.payment.create({
      data: {
        bookingId, amount: amount as never, method: null, paymentType: "ADVANCE",
        receivedById: null,
        note: name ? `received by ${name} (sheet)` : "imported",
      },
    });
  }

  it("names the person the sheet named, instead of calling it Unassigned", async () => {
    const id = await aBooking();
    await imported(id, "Rikan", 5000);
    await imported(id, "Rikan", 3000);
    await imported(id, "Joshim", 7500);

    const report = await reports().collectors(manager, fx.resortId);
    const rikan = report.rows.find((r) => r.name === "Rikan");
    expect(rikan, JSON.stringify(report.rows)).toBeTruthy();
    expect(rikan!.count).toBe(2);
    expect(rikan!.total).toBe(8000);
    expect(report.rows.find((r) => r.name === "Joshim")?.total).toBe(7500);
  });

  /**
   * Shown as what it is. A name out of a spreadsheet is the owner's own
   * record, not somebody who pressed a button in the app, and a report that
   * blurs the two is lying about how much it knows.
   */
  it("marks it as the sheet's word, not the app's", async () => {
    const id = await aBooking();
    await imported(id, "Rikan", 5000);

    const report = await reports().collectors(manager, fx.resortId);
    const rikan = report.rows.find((r) => r.name === "Rikan")!;
    expect(rikan.userId).toBeNull();
    expect(rikan.fromSheet).toBe(true);

    // and a receipt in the table says so too
    const receipt = report.recent.find((p) => p.amount === 5000)!;
    expect(receipt.receivedBy).toBe("Rikan");
    expect(receipt.fromSheet).toBe(true);
  });

  it("still says Unassigned when the sheet named nobody either", async () => {
    const id = await aBooking();
    await imported(id, null, 1000);

    const report = await reports().collectors(manager, fx.resortId);
    const none = report.rows.find((r) => r.name === "Unassigned")!;
    expect(none.total).toBe(1000);
    expect(none.fromSheet).toBe(false);
  });

  /**
   * A person who does have an account keeps their account. The sheet name is
   * a fallback for rows nobody is credited with, never an override.
   */
  it("does not let a note overrule somebody the app already credited", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, {
      amount: 2000, method: "CASH", type: "ADVANCE", note: "received by Rikan (sheet)",
    });

    const report = await reports().collectors(manager, fx.resortId);
    expect(report.rows.find((r) => r.name === "Rikan")).toBeUndefined();
    expect(report.rows.find((r) => r.userId === fx.managerId)?.total).toBe(2000);
  });
});
