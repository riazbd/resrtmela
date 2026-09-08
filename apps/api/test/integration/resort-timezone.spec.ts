/**
 * The clock is set inside the window where UTC and Dhaka disagree — 03:00 in
 * Dhaka, still the previous day in UTC. Everything that answers "today" must
 * answer with the resort's day, not the server's.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { BookingsService } from "../../src/bookings/bookings.service";
import { FbService } from "../../src/fb/fb.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;
let bookings: BookingsService;

/** 03:11 on 9 Sep in Dhaka; 8 Sep in UTC. */
const INSIDE_THE_GAP = new Date("2026-09-08T21:11:00Z");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(INSIDE_THE_GAP);
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  bookings = makeBookingsService(asPrismaService);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("today, for a resort in Asia/Dhaka", () => {
  it("lists the arrival whose check-in is the local date, not the UTC one", async () => {
    // arriving on 9 Sep local — the day it already is in Dhaka
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-09-09",
      checkOut: "2026-09-11",
    });

    const t = await bookings.today(claims, fx.resortId);

    expect(t.arrivals).toHaveLength(1);
    expect(t.departures).toHaveLength(0);
  });

  it("does not list yesterday's arrival as today's", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-09-08",
      checkOut: "2026-09-10",
    });

    const t = await bookings.today(claims, fx.resortId);

    expect(t.arrivals).toHaveLength(0);
  });

  it("shows the in-house rooms for the local day in the restaurant POS", async () => {
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-09-09",
      checkOut: "2026-09-11",
    });

    const fb = new FbService(
      asPrismaService,
      new AuditService(asPrismaService),
      new PermissionsService(asPrismaService),
    );
    const inHouse = await fb.inHouse(claims, fx.resortId);

    expect(inHouse.map((r) => r.bookingId)).toContain(booking.id);
  });
});

describe("a resort in another timezone", () => {
  it("gets its own day, not the first resort's", async () => {
    // at the same instant it is still 8 Sep in Honolulu
    const other = await seedResort(prisma as unknown as PrismaClient);
    await prisma.resort.update({
      where: { id: other.resortId },
      data: { timezone: "Pacific/Honolulu" },
    });
    const otherClaims: JwtClaims = {
      userId: other.managerId,
      role: ROLE.MANAGER,
      resortIds: [other.resortId],
    };
    await seedBooking(prisma as unknown as PrismaClient, other, {
      checkIn: "2026-09-08",
      checkOut: "2026-09-10",
    });

    const t = await bookings.today(otherClaims, other.resortId);

    expect(t.arrivals).toHaveLength(1);
  });
});
