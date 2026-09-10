/**
 * What belongs on the booking grid.
 *
 * `calendar()` had no state filter, so a cancelled or no-show booking came back
 * with its dates and the console painted it as an occupied block — red and
 * dark-yellow squares sitting on nights the resort could sell that evening. A
 * front desk reading the grid turns a guest away from a room that is empty.
 *
 * The engine has always known better: `availability` filters on `LIVE_STATES`,
 * and `UNIQUE(roomId, night)` frees the night the moment a booking is
 * cancelled. Only this one read disagreed. The seven colours the console needed
 * to paint the result were a symptom of that, not a taste problem.
 *
 * `CHECKED_OUT` stays: the stay happened, and a month grid that forgets last
 * week is a month grid nobody can reconcile against.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { BookingsService } from "../../src/bookings/bookings.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;
let bookings: BookingsService;

const ids = (cal: { bookings: { id: number }[] }) => cal.bookings.map((b) => b.id);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  bookings = makeBookingsService(asPrisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a cancelled stay is a free night", () => {
  it("leaves a cancelled booking off the grid", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-10", checkOut: "2026-11-12", state: "CANCELLED",
    });

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    expect(ids(cal)).not.toContain(b.id);
  });

  it("leaves a no-show off the grid", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-14", checkOut: "2026-11-16", state: "NO_SHOW",
    });

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    expect(ids(cal)).not.toContain(b.id);
  });

  it("frees the room in the same breath as the availability engine", async () => {
    // both reads now answer the same question the same way
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-18", checkOut: "2026-11-20", state: "CANCELLED",
    });

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    expect(ids(cal)).not.toContain(b.id);
    // nothing on the grid claims that room on those nights
    const claimed = cal.bookings.filter((x) =>
      x.rooms.some((r) => r.id === fx.rooms[0]!.id),
    );
    expect(claimed).toHaveLength(0);
  });
});

describe("what stays on it", () => {
  it("keeps a stay that has already ended, because it happened", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-10", checkOut: "2026-11-12", state: "CHECKED_OUT",
    });

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    expect(ids(cal)).toContain(b.id);
  });

  it("keeps every state that actually holds a room", async () => {
    const made: number[] = [];
    const states = ["PENDING", "CONFIRMED", "CHECKED_IN"] as const;
    for (const [i, state] of states.entries()) {
      const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
        roomId: fx.rooms[i % 2]!.id,
        checkIn: `2026-11-${String(2 + i * 3).padStart(2, "0")}`,
        checkOut: `2026-11-${String(4 + i * 3).padStart(2, "0")}`,
        state,
      });
      made.push(b.id);
    }

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    for (const id of made) expect(ids(cal)).toContain(id);
  });

  it("says which room a stay is in, so the grid can draw one bar for it", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-10", checkOut: "2026-11-13", state: "CONFIRMED",
    });

    const cal = await bookings.calendar(manager, fx.resortId, "2026-11-01", "2026-12-01");

    const row = cal.bookings.find((x) => x.id === b.id)!;
    expect(row.rooms.map((r) => r.id)).toContain(fx.rooms[0]!.id);
    expect(row.guestName).toBeTruthy();
  });
});
