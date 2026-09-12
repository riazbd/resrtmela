/**
 * What the console could not undo.
 *
 * Three gaps reported together, and they have one shape: the record was
 * write-once in places where real life is not.
 *
 *  - A room's **name and type** could not be changed. `updateRoom` took a
 *    name but the console never offered one, and neither took a `roomTypeId`
 *    at all — so a room entered as "Camelia" under the wrong type stayed
 *    wrong, or had to be deleted and re-created, which loses its history.
 *  - A booking could not be **deleted** from the console. The endpoint has
 *    existed all along, permission-gated on `bookings.delete`, and nothing
 *    called it.
 *  - Nothing could be deleted **in bulk**. An import that went in wrong is
 *    168 rows, and 168 confirmations is not a recovery path.
 *
 * Deleting stays soft, as `softDelete` already had it: the nights are freed
 * and the row leaves the lists, but it is still there. A resort's takings for
 * a month it has already closed cannot be reconciled against rows that have
 * been erased.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeRoomsService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const rooms = () => makeRoomsService(asPrisma);
const bookings = () => makeBookingsService(asPrisma);

let fx: Fixture;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("correcting a room", () => {
  it("renames it", async () => {
    const room = fx.rooms[0]!;
    await rooms().updateRoom(manager, room.id, { name: "Camellia" });
    expect((await prisma.room.findUnique({ where: { id: room.id } }))?.name).toBe("Camellia");
  });

  it("moves it to another type", async () => {
    /**
     * The room was entered under the wrong type. Deleting and re-creating it
     * would lose every booking that points at it, so the type has to be
     * something a room can be corrected to.
     */
    const suite = await prisma.roomType.create({
      data: { resortId: fx.resortId, name: "Suite", maxAdults: 4, maxChildren: 2 },
    });
    const room = fx.rooms[0]!;
    await rooms().updateRoom(manager, room.id, { roomTypeId: suite.id });
    expect((await prisma.room.findUnique({ where: { id: room.id } }))?.roomTypeId).toBe(suite.id);
  });

  it("refuses a type belonging to another resort", async () => {
    // rooms and types are a resort's own; crossing that line is a tenancy leak
    const other = await seedResort(prisma as unknown as PrismaClient);
    const theirType = await prisma.roomType.findFirstOrThrow({ where: { resortId: other.resortId } });
    await expect(
      rooms().updateRoom(manager, fx.rooms[0]!.id, { roomTypeId: theirType.id }),
    ).rejects.toThrow(/type/i);
  });

  it("keeps the bookings that already point at the room", async () => {
    const room = fx.rooms[0]!;
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-03-01",
      checkOut: "2026-03-03",
    });
    await rooms().updateRoom(manager, room.id, { name: "Renamed" });
    expect(await prisma.booking.findUnique({ where: { id: booking.id } })).not.toBeNull();
  });
});

describe("deleting bookings in bulk", () => {
  async function three() {
    const made = [];
    for (const [from, to] of [
      ["2026-04-01", "2026-04-02"],
      ["2026-04-03", "2026-04-04"],
      ["2026-04-05", "2026-04-06"],
    ] as const) {
      made.push(await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: from, checkOut: to }));
    }
    return made;
  }

  it("deletes every booking it was given", async () => {
    const made = await three();
    const out = await bookings().softDeleteMany(manager, fx.resortId, made.map((b) => b.id));
    expect(out.deleted).toBe(3);
    const left = await prisma.booking.count({ where: { resortId: fx.resortId, deletedAt: null } });
    expect(left).toBe(0);
  });

  it("keeps the rows, because a closed month has to stay reconcilable", async () => {
    const made = await three();
    await bookings().softDeleteMany(manager, fx.resortId, made.map((b) => b.id));
    expect(await prisma.booking.count({ where: { resortId: fx.resortId } })).toBe(3);
  });

  it("frees the nights, so the rooms can be sold again", async () => {
    const made = await three();
    await bookings().softDeleteMany(manager, fx.resortId, made.map((b) => b.id));
    const nights = await prisma.bookingNight.count({
      where: { item: { booking: { resortId: fx.resortId } } },
    });
    expect(nights).toBe(0);
  });

  it("refuses a booking from another resort, and deletes none of the batch", async () => {
    /**
     * All or nothing. A partial bulk delete leaves the operator guessing which
     * half went, and the half that went is the half they cannot get back by
     * pressing the button again.
     */
    const made = await three();
    const other = await seedResort(prisma as unknown as PrismaClient);
    const theirs = await seedBooking(prisma as unknown as PrismaClient, other, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
    });
    await expect(
      bookings().softDeleteMany(manager, fx.resortId, [...made.map((b) => b.id), theirs.id]),
    ).rejects.toThrow();
    expect(await prisma.booking.count({ where: { resortId: fx.resortId, deletedAt: null } })).toBe(3);
  });

  it("needs the delete permission, not merely the edit one", async () => {
    const frontDesk: JwtClaims = { userId: fx.managerId, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
    const made = await three();
    await expect(
      bookings().softDeleteMany(frontDesk, fx.resortId, made.map((b) => b.id)),
    ).rejects.toThrow(/permission/i);
  });

  it("declines an empty list rather than reporting a successful nothing", async () => {
    await expect(bookings().softDeleteMany(manager, fx.resortId, [])).rejects.toThrow();
  });
});
