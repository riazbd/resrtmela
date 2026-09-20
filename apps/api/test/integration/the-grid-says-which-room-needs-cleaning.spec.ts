/**
 * The grid says which room needs cleaning (2026-09-21).
 *
 * Housekeeping shipped on the 20th and stopped at its own screen. The
 * availability grid — the screen a clerk uses to put a walk-in into a
 * room — offered every free room with nothing said, including the one
 * whose guest had checked out that morning and which the housekeeping
 * list, two taps away, was calling DIRTY.
 *
 * So the grid carries the state. It does not decide what to do with it:
 * `roomOffer` in `@rh/shared` is the one place that turns a state into a
 * warning, and it only does so for a guest arriving today, because a
 * room dirty this morning tells nobody anything about December.
 *
 * Sent for every request rather than only for today's, because the
 * service does not know what the caller is about to ask of it and a
 * field that is sometimes absent is a field every reader has to guard.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeAvailabilityService, makeRoomsService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, addDaysIso, roomOffer, todayIn, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const grid = () => makeAvailabilityService(asPrisma);
const rooms = () => makeRoomsService(asPrisma);
const bookings = () => makeBookingsService(asPrisma);

let fx: Fixture;
let manager: JwtClaims;
let roomId: number;

/** The resort's own day. UTC is a different date for six hours of it. */
const ZONE = "Asia/Dhaka";
const today = () => todayIn(ZONE);
const plus = (days: number) => addDaysIso(todayIn(ZONE), days);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  roomId = fx.rooms[0]!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const gridToday = () => grid().roomsGrid(manager, fx.resortId, today(), plus(1));

describe("the grid says which room needs cleaning", () => {
  it("carries a state for every room", async () => {
    const rows = await gridToday();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(["DIRTY", "CLEANING", "CLEAN"]).toContain(r.housekeeping);
  });

  it("reports a room a housekeeper has started on", async () => {
    await rooms().setHousekeeping(manager, roomId, "CLEANING");
    const row = (await gridToday()).find((r) => r.roomId === roomId);
    expect(row?.housekeeping).toBe("CLEANING");
  });

  /**
   * The rule that makes the feature work, seen from the selling side:
   * a departure marks the room, and the very next person to open the
   * booking form is told.
   */
  it("shows a room dirty the moment its guest checks out", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: roomId,
      checkIn: plus(-1),
      checkOut: today(),
    });
    await bookings().transition(manager, b.id, "CHECKED_IN");
    await bookings().transition(manager, b.id, "CHECKED_OUT");
    const row = (await gridToday()).find((r) => r.roomId === roomId);
    expect(row?.housekeeping).toBe("DIRTY");
  });
});

describe("what the selling screens make of it", () => {
  it("offers the room with a warning rather than withholding it", async () => {
    await rooms().setHousekeeping(manager, roomId, "DIRTY");
    const row = (await gridToday()).find((r) => r.roomId === roomId)!;
    const offer = roomOffer(row, { arrivingToday: true });
    expect(offer.why).toBe("dirty");
    expect(offer.sellable).toBe(true);
  });

  it("says nothing about cleaning for a stay that starts next month", async () => {
    await rooms().setHousekeeping(manager, roomId, "DIRTY");
    const rows = await grid().roomsGrid(manager, fx.resortId, plus(30), plus(32));
    const row = rows.find((r) => r.roomId === roomId)!;
    expect(row.housekeeping).toBe("DIRTY");
    expect(roomOffer(row, { arrivingToday: false }).why).toBe("free");
  });
});
