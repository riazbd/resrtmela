/**
 * taxRatePct was editable in Settings and applied to nothing — the interface
 * promised a charge the system never made. A rate set on the resort must reach
 * every place money is shown.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makeReportsService } from "../helpers/services";
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

const setTax = (pct: number) =>
  prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: pct as never } });

/** 2 nights x 5000 = 10000. */
const stay = () => ({
  resortId: fx.resortId,
  roomIds: [fx.rooms[0]!.id],
  checkIn: "2026-08-15",
  checkOut: "2026-08-17",
  adults: 2,
  children: 0,
  discount: 0,
  guest: { fullName: "Test Guest", phone: "8801711111111" },
});

describe("a resort that charges tax", () => {
  it("adds it to the booking's due", async () => {
    await setTax(15);

    const booking = await bookings.create(claims, stay() as never);

    expect(booking.taxable).toBe(10000);
    expect(booking.tax).toBe(1500);
    expect(booking.total).toBe(11500);
    expect(booking.due).toBe(11500);
  });

  it("shows it as its own line on the invoice", async () => {
    await setTax(15);
    const booking = await bookings.create(claims, stay() as never);

    const invoice = await bookings.generateInvoice(claims, booking.id);

    expect(invoice.taxRatePct).toBe(15);
    expect(invoice.tax).toBe(1500);
    expect(invoice.total).toBe(11500);
  });

  it("carries it into the Day Sheet's due, so one stay is not worth two numbers", async () => {
    await setTax(15);
    const booking = await bookings.create(claims, stay() as never);

    const sheet = await bookings.daySheet(claims, fx.resortId, "2026-08-15");
    const cell = sheet.rooms.find((r) => r.roomId === fx.rooms[0]!.id)!.cell as { due: number };

    expect(cell.due).toBe(booking.due);
  });

  it("counts a guest as paid only once the tax is covered too", async () => {
    await setTax(15);
    const booking = await bookings.create(claims, stay() as never);

    await prisma.payment.create({
      data: { bookingId: booking.id, amount: 10000 as never, method: "CASH", paymentType: "ADVANCE" },
    });
    const partly = await bookings.detail(claims, booking.id);
    expect(partly.paymentState).toBe("PARTIAL");
    expect(partly.due).toBe(1500);

    await prisma.payment.create({
      data: { bookingId: booking.id, amount: 1500 as never, method: "CASH", paymentType: "ADVANCE" },
    });
    const settled = await bookings.detail(claims, booking.id);
    expect(settled.paymentState).toBe("PAID");
    expect(settled.due).toBe(0);
  });

  it("keeps tax out of revenue — it is collected for the government, not earned", async () => {
    await setTax(15);
    await bookings.create(claims, stay() as never);

    const { ReportsService } = await import("../../src/reports/reports.service");
    const { PermissionsService } = await import("../../src/common/permissions");
    const reports = makeReportsService(asPrismaService);

    const metrics = await reports.metrics(claims, fx.resortId, "2026-08-01", "2026-09-01");
    expect(metrics.resortRevenue).toBe(10000); // not 11500
  });
});

describe("a resort with no tax rate", () => {
  it("is completely unaffected", async () => {
    const booking = await bookings.create(claims, stay() as never);

    expect(booking.tax).toBe(0);
    expect(booking.due).toBe(10000);
  });
});
