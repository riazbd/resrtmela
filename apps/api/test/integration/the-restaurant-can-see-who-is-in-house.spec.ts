/**
 * The picker and the writer agreeing about who is in the building.
 *
 * Reported as *"restaurant bill in house hocche nah"* — the restaurant's
 * in-house list would not produce the guest. Read as a report about the
 * app it looks like a screen fault; read against the service it is the
 * API contradicting itself.
 *
 * `FbService.create` accepts a bill charged to a booking in **PENDING,
 * CONFIRMED or CHECKED_IN**. `FbService.inHouse` — the list the POS draws
 * that picker from — offered only CONFIRMED and CHECKED_IN. So there was
 * a whole class of stay the writer would have taken and the picker could
 * not offer.
 *
 * It is not a rare class. A booking made through an agency is created
 * PENDING (`bookings.service.ts`: `state: isAgent ? "PENDING" :
 * "CONFIRMED"`), so a resort selling through agents had those guests
 * missing from the restaurant list for the whole stay unless somebody
 * remembered to press Check in. The bill then had to be written as a
 * counter sale — off the stay — and checking out would never collect it,
 * which is the other half of what the owner asked for: *when check-in
 * client pay their total bill automatic paid restaurant bill.*
 *
 * The day sheet has counted PENDING all along, which is how two screens
 * came to disagree about who was staying.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeFbService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

/** Mid-stay for every booking below: in on the 9th, out on the 11th. */
const TODAY = "2026-09-10";

beforeEach(async () => {
  // `inHouse` asks the resort what day it is, so the day has to be one of
  // the nights these bookings cover rather than whenever the suite is run
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  await prisma.resort.update({
    where: { id: fx.resortId },
    // the fixture's own zone, stated rather than assumed: `inHouse` asks the
    // resort what day it is, and this spec is not about the clock
    data: { timezone: "UTC" },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const staying = async (state: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW") =>
  seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-09-09",
    checkOut: "2026-09-11",
    state,
  });

describe("who the restaurant is offered", () => {
  it.each(["PENDING", "CONFIRMED", "CHECKED_IN"] as const)(
    "offers a %s stay that is in the building",
    async (state) => {
      const booking = await staying(state);
      const fb = makeFbService(asPrismaService);

      const rows = await fb.inHouse(claims, fx.resortId);

      expect(rows.map((r) => r.bookingId)).toContain(booking.id);
    },
  );

  it.each(["CANCELLED", "NO_SHOW"] as const)(
    "does not offer a %s stay, whose room is free again",
    async (state) => {
      const booking = await staying(state);
      const fb = makeFbService(asPrismaService);

      const rows = await fb.inHouse(claims, fx.resortId);

      expect(rows.map((r) => r.bookingId)).not.toContain(booking.id);
    },
  );

  /**
   * The claim that matters, and the one the defect broke: every stay the
   * picker offers is a stay the writer will take. Asserting the two lists
   * agree is worth more than asserting either one's contents, because the
   * contents are what drifted.
   */
  it("offers only stays a bill can actually be charged to", async () => {
    const pending = await staying("PENDING");
    const fb = makeFbService(asPrismaService);

    const rows = await fb.inHouse(claims, fx.resortId);
    expect(rows.map((r) => r.bookingId)).toContain(pending.id);

    // the writer takes it, rather than answering "Booking is not live"
    const bill = await fb.create(claims, fx.resortId, {
      date: TODAY,
      items: [{ name: "Lunch", qty: 2, unitPrice: 300 }],
      bookingId: pending.id,
    });

    expect(bill.id).toBeGreaterThan(0);
  });
});

/**
 * The other half of the report: a bill charged to the room has to reach
 * the stay, or checking out cannot collect it.
 */
describe("a bill charged to the room", () => {
  it("lands on the stay, so leaving settles it", async () => {
    const booking = await staying("PENDING");
    const fb = makeFbService(asPrismaService);

    await fb.create(claims, fx.resortId, {
      date: TODAY,
      items: [{ name: "Dinner", qty: 2, unitPrice: 350 }],
      bookingId: booking.id,
    });

    const items = await prisma.bookingItem.findMany({
      where: { bookingId: booking.id, itemKind: "FB" },
    });

    expect(items).toHaveLength(1);
    expect(Number(items[0]!.unitPrice)).toBe(700);
  });
});
