/**
 * Things the database refuses, whatever the code does.
 *
 * The engine's best guarantee has always been `UNIQUE(roomId, night)`: a room
 * cannot be sold twice, not because the application checks but because the
 * database will not have it. These are the other rules that deserved the same
 * treatment and were being kept by hand, or not at all.
 *
 * Every test here goes *around* the services deliberately. A rule enforced by a
 * service is a rule the next service can forget.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { anonGuestKey, phoneKey, normalizePhone } from "../../src/common/dates";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a guest is one guest", () => {
  it("refuses a second row for the same number at the same resort", async () => {
    const key = phoneKey(normalizePhone("01711111112"));
    await prisma.guest.create({
      data: { resortId: fx.resortId, fullName: "Rina", phone: "8801711111112", phoneKey: key },
    });

    await expect(
      prisma.guest.create({
        data: { resortId: fx.resortId, fullName: "Rina again", phone: "8801711111112", phoneKey: key },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("lets the same number be a guest of two resorts", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    const key = phoneKey(normalizePhone("01711111113"));
    await prisma.guest.create({
      data: { resortId: fx.resortId, fullName: "Rina", phone: "8801711111113", phoneKey: key },
    });

    const second = await prisma.guest.create({
      data: { resortId: other.resortId, fullName: "Rina", phone: "8801711111113", phoneKey: key },
    });

    expect(second.id).toBeGreaterThan(0);
  });

  it("keeps two phone-less walk-ins of the same name apart", async () => {
    const bookings = makeBookingsService(asPrisma);
    const walkIn = (name: string) =>
      bookings.createGroupBooking(manager, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        checkIn: "2026-11-01",
        checkOut: "2026-11-02",
        guest: { fullName: name },
        adults: 2,
      } as never);

    await walkIn("local");
    await prisma.bookingNight.deleteMany({});
    await walkIn("local");

    const guests = await prisma.guest.findMany({ where: { resortId: fx.resortId, fullName: "local" } });
    // two people, both called local, neither of whom left a number
    expect(guests).toHaveLength(2);
  });
});

describe("an invoice serial is a serial", () => {
  it("refuses the same invoice number twice at one resort", async () => {
    const a = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-02", code: "BK-91001",
    });
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-03", checkOut: "2026-11-04", code: "BK-91002",
    });
    await prisma.booking.update({ where: { id: a.id }, data: { invoiceNo: "SER-00001" } });

    await expect(
      prisma.booking.update({ where: { id: b.id }, data: { invoiceNo: "SER-00001" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("lets any number of bookings have no invoice yet", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-02", code: "BK-91003",
    });
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-03", checkOut: "2026-11-04", code: "BK-91004",
    });

    const unbilled = await prisma.booking.count({ where: { resortId: fx.resortId, invoiceNo: null } });
    expect(unbilled).toBe(2);
  });
});

describe("an offline write replayed is one write", () => {
  it("refuses a second expense carrying the same client reference", async () => {
    await prisma.expense.create({
      data: {
        resortId: fx.resortId, date: new Date("2026-11-01T00:00:00Z"),
        category: "Fuel", amount: 500 as never, clientRef: "desk-1",
      },
    });

    await expect(
      prisma.expense.create({
        data: {
          resortId: fx.resortId, date: new Date("2026-11-01T00:00:00Z"),
          category: "Fuel", amount: 500 as never, clientRef: "desk-1",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("a row belongs to a resort that exists", () => {
  it("refuses a notification job for a resort that does not", async () => {
    await expect(
      prisma.notificationJob.create({
        data: {
          channel: "EMAIL", toRef: "someone@example.com", template: "booking_confirmed",
          dedupeKey: "orphan-1", resortId: 999_999,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("takes the resort's messages with it when the resort goes", async () => {
    // a resort of its own, with nothing else attached to get in the way
    const doomed = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Closing down", location: "nowhere" },
    });
    await prisma.notificationJob.create({
      data: {
        channel: "EMAIL", toRef: "guest@example.com", template: "booking_confirmed",
        dedupeKey: "cascade-1", resortId: doomed.id,
      },
    });

    await prisma.resort.delete({ where: { id: doomed.id } });

    expect(await prisma.notificationJob.count({ where: { dedupeKey: "cascade-1" } })).toBe(0);
  });
});

describe("the anonymous guest key", () => {
  it("is different every time, because there is nothing to match on", () => {
    expect(anonGuestKey()).not.toBe(anonGuestKey());
  });
});
