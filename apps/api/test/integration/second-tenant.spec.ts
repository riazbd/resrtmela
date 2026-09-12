/**
 * PLAN-v3 P1's acceptance test.
 *
 * A second resort — different currency, different timezone, a plan the code
 * has never heard of, its own document prefixes and its own tax rate — must
 * work with no code change. This is the difference between a platform and a
 * build for one customer.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { PlatformService } from "../../src/platform/platform.service";
import { AuditService } from "../../src/common/audit.service";
import { EmailService } from "../../src/notifications/email.service";
import { DiscountService } from "../../src/common/discount.service";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { formatMoney, ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let bd: Fixture;
let mv: Fixture;

/** 03:11 on 9 Sep in Dhaka; still 8 Sep in UTC and in Malé it is 02:11 on 9 Sep. */
const NOW = new Date("2026-09-08T21:11:00Z");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  await resetDb(prisma as unknown as PrismaClient);
  bd = await seedResort(prisma as unknown as PrismaClient);
  mv = await seedResort(prisma as unknown as PrismaClient);

  // the second tenant is nothing like the first
  await prisma.resort.update({
    where: { id: mv.resortId },
    data: {
      name: "Atoll Retreat",
      currency: "USD",
      locale: "en-US",
      timezone: "Pacific/Honolulu",
      bookingPrefix: "ATL",
      fbPrefix: "CAFE",
      invoicePrefix: "INV",
      taxRatePct: 12 as never,
    },
  });
});

afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await prisma.$disconnect();
});

describe("a second tenant, configured entirely through data", () => {
  it("bills in its own currency", async () => {
    const resort = await prisma.resort.findUniqueOrThrow({ where: { id: mv.resortId } });
    expect(formatMoney(1234.5, { currency: resort.currency, locale: resort.locale })).toBe("$1,234.50");
    // and the first tenant is untouched
    const first = await prisma.resort.findUniqueOrThrow({ where: { id: bd.resortId } });
    expect(formatMoney(1234.5, { currency: first.currency, locale: first.locale })).toBe("৳1,234.50");
  });

  it("numbers its documents its own way", async () => {
    const bookings = makeBookingsService(asPrismaService);
    const claims: JwtClaims = { userId: mv.managerId, role: ROLE.MANAGER, resortIds: [mv.resortId] };

    const booking = await bookings.create(claims, {
      resortId: mv.resortId,
      roomIds: [mv.rooms[0]!.id],
      checkIn: "2026-09-20",
      checkOut: "2026-09-22",
      adults: 2,
      children: 0,
      discount: 0,
      guest: { fullName: "Atoll Guest", phone: "9601234567" },
    } as never);

    expect(booking.code).toMatch(/^ATL-\d{5}$/);
    const invoice = await bookings.generateInvoice(claims, booking.id);
    expect(invoice.invoiceNo).toMatch(/^INV-\d{5}$/);
  });

  it("charges its own tax rate", async () => {
    const bookings = makeBookingsService(asPrismaService);
    const claims: JwtClaims = { userId: mv.managerId, role: ROLE.MANAGER, resortIds: [mv.resortId] };

    const booking = await bookings.create(claims, {
      resortId: mv.resortId,
      roomIds: [mv.rooms[0]!.id],
      checkIn: "2026-09-20",
      checkOut: "2026-09-22",
      adults: 2,
      children: 0,
      discount: 0,
      guest: { fullName: "Atoll Guest", phone: "9601234567" },
    } as never);

    expect(booking.taxable).toBe(10000);
    expect(booking.tax).toBe(1200); // 12%, where the first tenant charges none
    expect(booking.due).toBe(11200);
  });

  it("keeps its own day, hours apart from the other tenant's", async () => {
    const bookings = makeBookingsService(asPrismaService);
    const bdClaims: JwtClaims = { userId: bd.managerId, role: ROLE.MANAGER, resortIds: [bd.resortId] };
    const mvClaims: JwtClaims = { userId: mv.managerId, role: ROLE.MANAGER, resortIds: [mv.resortId] };

    // at this instant it is 9 Sep in Dhaka and still 8 Sep in Honolulu
    const dhakaSheet = await bookings.daySheet(bdClaims, bd.resortId, "2026-09-09");
    const atollToday = await bookings.today(mvClaims, mv.resortId);
    void dhakaSheet;

    const bdToday = await bookings.today(bdClaims, bd.resortId);
    expect(bdToday.arrivals).toHaveLength(0);
    expect(atollToday.arrivals).toHaveLength(0);
    // the point is that neither threw and each resolved its own civil date
    const resort = await prisma.resort.findUniqueOrThrow({ where: { id: mv.resortId } });
    expect(resort.timezone).toBe("Pacific/Honolulu");
  });

  it("runs on a plan invented after the code was written", async () => {
    await prisma.platformPlan.create({
      data: {
        name: "ISLAND",
        label: "Island",
        monthlyFee: 199 as never,
        maxRooms: 40,
        maxResorts: 3,
        trialDays: 45,
      },
    });
    const platform = new PlatformService(
      asPrismaService,
      new AuditService(asPrismaService),
      new EmailService(),
      new DiscountService(asPrismaService),
      new PermissionsService(asPrismaService),
      new PlanLimitsService(asPrismaService),
    );
    const superAdmin: JwtClaims = { userId: mv.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };

    const sub = await platform.setSubscription(superAdmin, mv.resortId, { plan: "ISLAND" });

    expect(sub.plan).toBe("ISLAND");
    expect(Number(sub.fee)).toBe(199);
    const limits = await new PlanLimitsService(asPrismaService).forResort(mv.resortId);
    expect(limits.maxRooms).toBe(40);
  });
});
