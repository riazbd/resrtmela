/**
 * Income is money that came in. What is still owed is not income.
 *
 * The P&L and the summary counted every stay's full bill as income the moment
 * it was booked — so a ৳10,000 stay with a ৳2,000 advance put ৳10,000 into
 * "Income" and "NET PROFIT", and ৳8,000 nobody had paid was reported as profit.
 * An owner reading that report spends money he does not have.
 *
 * Both reports now carry three numbers and keep them apart:
 *
 *   billed    what the stays in the period are worth (after discount)
 *   income    what was actually received in the period, net of refunds and
 *             of the tax inside it — the only number profit is made from
 *   stillDue  what those stays still owe; shown, never added to profit
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;

const reports = () => makeReportsService(asPrisma);
const FROM = "2026-08-01";
const TO = "2026-09-01";

async function pay(bookingId: number, amount: number, at: string, type: "ADVANCE" | "FINAL" | "REFUND" = "FINAL") {
  await prisma.payment.create({
    data: {
      bookingId,
      amount: amount as never,
      method: "CASH",
      paymentType: type,
      receivedById: fx.managerId,
      receivedAt: new Date(`${at}T10:00:00Z`),
    },
  });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

describe("a stay that has not been paid in full", () => {
  beforeEach(async () => {
    // two nights at 5,000, 1,000 off, 2,000 paid: billed 9,000, owed 7,000
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-12",
      discount: 1000,
    });
    await pay(b.id, 2000, "2026-08-05", "ADVANCE");
  });

  it("puts only the money received into the P&L's income and profit", async () => {
    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.resort.billed).toBe(9000);
    expect(pl.resort.income).toBe(2000);
    expect(pl.resort.stillDue).toBe(7000);
    expect(pl.resort.net).toBe(2000);
    expect(pl.combined.income).toBe(2000);
    expect(pl.combined.net).toBe(2000);
    expect(pl.combined.stillDue).toBe(7000);
  });

  it("does the same on the summary", async () => {
    const m = await reports().metrics(admin, fx.resortId, FROM, TO);

    expect(m.netRoomRevenue).toBe(9000);
    expect(m.grossIncome).toBe(2000);
    expect(m.stillDue).toBe(7000);
    expect(m.netProfit).toBe(2000);
  });

  it("subtracts expenses from what came in, not from what was billed", async () => {
    await prisma.expense.create({
      data: { resortId: fx.resortId, date: new Date("2026-08-15T00:00:00Z"), category: "Power", amount: 3000 as never },
    });

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.resort.net).toBe(-1000);
    expect(pl.combined.net).toBe(-1000);
  });
});

describe("when the money arrived, not when the guest did", () => {
  it("counts a payment in the period it was received", async () => {
    // stayed in July, paid the balance in August
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-07-20",
      checkOut: "2026-07-21",
    });
    await pay(b.id, 1000, "2026-07-20");
    await pay(b.id, 4000, "2026-08-03");

    const august = await reports().pl(admin, fx.resortId, FROM, TO);
    const july = await reports().pl(admin, fx.resortId, "2026-07-01", "2026-08-01");

    expect(august.resort.billed).toBe(0);
    expect(august.resort.income).toBe(4000);
    expect(july.resort.billed).toBe(5000);
    expect(july.resort.income).toBe(1000);
  });

  it("takes a refund off the period it was paid back in", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
    });
    await pay(b.id, 5000, "2026-08-02");
    await pay(b.id, 1500, "2026-08-20", "REFUND");

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.resort.income).toBe(3500);
  });

  it("keeps an advance a cancelled stay did not get back", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
      state: "CANCELLED",
    });
    await pay(b.id, 1000, "2026-08-02", "ADVANCE");

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    // nothing billed and nothing owed — but the resort holds the ৳1,000
    expect(pl.resort.billed).toBe(0);
    expect(pl.resort.stillDue).toBe(0);
    expect(pl.resort.income).toBe(1000);
  });

  it("ignores the money on a deleted booking", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
    });
    await pay(b.id, 5000, "2026-08-02");
    await prisma.booking.update({ where: { id: b.id }, data: { deletedAt: new Date() } });

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.resort.income).toBe(0);
  });
});

describe("tax is collected for the government", () => {
  it("is taken out of income and shown on its own", async () => {
    await prisma.taxRule.create({
      data: { resortId: fx.resortId, code: "VAT", label: "VAT", ratePct: 15 as never, appliesTo: "ALL", sortOrder: 0 },
    });
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
    });
    // 5,000 + 15% = 5,750, paid in full
    await pay(b.id, 5750, "2026-08-10");

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.resort.income).toBe(5000);
    expect(pl.resort.taxCollected).toBe(750);
    expect(pl.resort.stillDue).toBe(0);
  });
});

describe("the restaurant", () => {
  it("counts a walk-in bill by what was paid on it", async () => {
    const bill = await prisma.fbBill.create({
      data: {
        resortId: fx.resortId,
        code: "RES-00001",
        billDate: new Date("2026-08-10T00:00:00Z"),
        paidAmount: 300 as never,
        items: { create: [{ name: "Lunch", qty: 2, unitPrice: 400 as never }] },
      },
    });
    void bill;

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.restaurant.revenue).toBe(800);
    expect(pl.restaurant.income).toBe(300);
    expect(pl.restaurant.stillDue).toBe(500);
    expect(pl.restaurant.net).toBe(300);
  });

  it("does not count a charged-to-room bill twice", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
    });
    const bill = await prisma.fbBill.create({
      data: {
        resortId: fx.resortId,
        code: "RES-00002",
        billDate: new Date("2026-08-10T00:00:00Z"),
        bookingId: b.id,
        paidAmount: 1000 as never,
        items: { create: [{ name: "Dinner", qty: 1, unitPrice: 1000 as never }] },
      },
    });
    await prisma.bookingItem.create({
      data: { bookingId: b.id, itemKind: "FB", fbBillId: bill.id, qty: 1, unitPrice: 1000 as never },
    });
    // the counter's payment is mirrored onto the booking, as FbService does
    await pay(b.id, 1000, "2026-08-10");

    const pl = await reports().pl(admin, fx.resortId, FROM, TO);

    expect(pl.combined.income).toBe(1000);
    // a payment against a stay pays each part of that stay's bill in proportion
    expect(pl.restaurant.income + pl.resort.income).toBe(1000);
  });
});
