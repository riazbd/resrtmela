/**
 * The same stay must be worth the same money everywhere it is shown.
 * These run against a real database — see test/helpers/db.ts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { PrismaService } from "../../src/prisma/prisma.service";
import { ReportsService } from "../../src/reports/reports.service";
import { makeNotificationsService } from "../helpers/services";
import { PermissionsService } from "../../src/common/permissions";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const reports = () => new ReportsService(asPrismaService, new PermissionsService(asPrismaService));
const notifications = () => makeNotificationsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("guest notifications", () => {
  it("quotes the whole stay's due, not one night's", async () => {
    // 3 nights x 5000, 2000 collected up front -> 13000 still owed
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-15",
      checkOut: "2026-08-18",
      unitPrice: 5000,
      advance: 2000,
    });

    await notifications().notifyBooking(booking.id, "booking_confirmed");

    const job = await prisma.notificationJob.findFirst({ orderBy: { id: "desc" } });
    expect(job).not.toBeNull();
    expect((job!.payload as { due: number }).due).toBe(13000);
  });
});

describe("daily revenue report (sheet tab 11)", () => {
  it("spreads room revenue over every night of the stay", async () => {
    // 3 nights x 5000 = 15000, less a 3000 discount -> 4000 a night
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-15",
      checkOut: "2026-08-18",
      unitPrice: 5000,
      discount: 3000,
    });

    const days = await reports().daily(claims, fx.resortId, "2026-08-15", "2026-08-19");
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.roomRevenue]));

    expect(byDate["2026-08-15"]).toBe(4000);
    expect(byDate["2026-08-16"]).toBe(4000);
    expect(byDate["2026-08-17"]).toBe(4000);
    expect(byDate["2026-08-18"]).toBe(0); // checkout day is not a night
  });

  it("keeps a charged-to-room meal out of room revenue", async () => {
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-15",
      checkOut: "2026-08-16",
      unitPrice: 5000,
    });
    const bill = await prisma.fbBill.create({
      data: {
        resortId: fx.resortId,
        code: "RES-00001",
        billDate: new Date("2026-08-15T00:00:00Z"),
        bookingId: booking.id,
        items: { create: [{ name: "Dinner", qty: 2, unitPrice: 450 as never }] },
      },
    });
    // charge-to-room also posts the bill total onto the booking ledger
    await prisma.bookingItem.create({
      data: { bookingId: booking.id, itemKind: "FB", fbBillId: bill.id, qty: 1, unitPrice: 900 as never },
    });

    const days = await reports().daily(claims, fx.resortId, "2026-08-15", "2026-08-16");

    expect(days[0]!.roomRevenue).toBe(5000); // not 5900
    expect(days[0]!.fbRevenue).toBe(900);
  });
});
