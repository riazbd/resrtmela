/**
 * Does the sheet's Discount column survive the import?
 *
 * The question is not whether the number is stored — it is whether anything
 * downstream spends it. A discount that lands in a column nobody reads is the
 * same as no discount at all, and the resort finds out when a guest is asked
 * for money they were told they would not owe.
 *
 * So this walks the whole way: the CSV column, the booking row, the folio the
 * front desk reads, the payment state the sheet claimed, and the profit &
 * loss line that has to agree with all of them.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeImportService, makeBookingsService, makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

const HEADER =
  "Booking ID,Booking Date,Guest Name,Mobile,Room,Check-In,Check-Out,Room Rate,Rent,Discount,Advance,Payment Status,Booking Source,Adults,Children,Status,Remarks";

/** Two nights at 5,000 is 10,000 — the discount is the only variable. */
const sheet = (discount: string, advance: string) =>
  [
    HEADER,
    `BK-90001,01-Nov-2026,Rahima Khatun,01711000001,101,05-Nov-2026,07-Nov-2026,5000,10000,${discount},${advance},Partial,Direct,2,0,Confirmed,`,
  ].join("\r\n");

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

describe("the Discount column", () => {
  it("is written onto the booking", async () => {
    await makeImportService(asPrismaService).import(manager, fx.resortId, sheet("1500", "0"), false);

    const booking = await prisma.booking.findFirstOrThrow({ where: { resortId: fx.resortId, code: "BK-90001" } });
    expect(Number(booking.discount)).toBe(1500);
  });

  it("comes off the bill the front desk reads", async () => {
    await makeImportService(asPrismaService).import(manager, fx.resortId, sheet("1500", "0"), false);
    const booking = await prisma.booking.findFirstOrThrow({ where: { resortId: fx.resortId, code: "BK-90001" } });

    const detail = await makeBookingsService(asPrismaService).detail(manager, booking.id);

    expect(detail.rent).toBe(10000);
    expect(detail.discount).toBe(1500);
    expect(detail.total).toBe(8500);
    expect(detail.due).toBe(8500);
  });

  /**
   * The sheet says Paid when the advance covers rent *after* the discount.
   * Reading the discount is what makes that row agree with itself; ignoring it
   * would leave 1,500 outstanding on a stay the resort has closed.
   */
  it("is what makes an advance of 8,500 settle a 10,000 stay", async () => {
    await makeImportService(asPrismaService).import(manager, fx.resortId, sheet("1500", "8500"), false);
    const booking = await prisma.booking.findFirstOrThrow({ where: { resortId: fx.resortId, code: "BK-90001" } });

    const detail = await makeBookingsService(asPrismaService).detail(manager, booking.id);

    expect(detail.due).toBe(0);
    expect(detail.paymentState).toBe("PAID");
  });

  it("shows up as a discount in profit & loss, not as lost revenue", async () => {
    await makeImportService(asPrismaService).import(manager, fx.resortId, sheet("1500", "8500"), false);

    const pl = await makeReportsService(asPrismaService).pl(manager, fx.resortId, "2026-11-01", "2026-11-30");

    expect(pl.resort.roomRevenue).toBe(10000);
    expect(pl.resort.discounts).toBe(1500);
    // the discount comes off what was billed; income is what was received
    expect(pl.resort.billed).toBe(8500);
  });
});
