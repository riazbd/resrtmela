/**
 * Taking a room out of the inventory.
 *
 * There was no way to. `rooms.controller.ts` had no DELETE route at all, so a
 * room typed in by mistake, or a cottage that burned down, stayed on the
 * calendar and in the room cap for ever. `OUT_OF_SERVICE` was the only tool,
 * and it means something else: a room that is temporarily unsellable and still
 * part of the inventory.
 *
 * Two different things are wanted here, and they must not be confused:
 *
 * - **A room nobody has ever stayed in is a mistake.** It goes, completely.
 * - **A room with history is not a mistake, it is finished.** Deleting it would
 *   take the rooms out of last year's bookings, invoices and reports — the FK
 *   from `booking_items` is the database saying so. It is retired instead:
 *   gone from the calendar, gone from the cap, and its past still readable.
 *
 * Both need `rooms.delete`, which is its own permission rather than part of
 * `rooms.manage`: editing a rate and removing a room from the books are not
 * the same authority.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeAvailabilityService, makeRoomsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

async function withPermissions(permissions: string[]): Promise<JwtClaims> {
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Scoped User",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      email: `8809${Math.floor(Math.random() * 1e8)}@example.com`,
      role: ROLE.FRONT_DESK,
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId: role.id } });
  return { userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
}

const rooms = () => makeRoomsService(asPrisma);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a room nobody has stayed in", () => {
  it("is deleted outright", async () => {
    const room = await prisma.room.create({
      data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name: "Typo", baseRate: 3000 as never },
    });

    const r = await rooms().deleteRoom(owner, room.id);

    expect(r.removed).toBe("deleted");
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
  });

  it("frees its name for a new room", async () => {
    const room = await prisma.room.create({
      data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name: "Typo", baseRate: 3000 as never },
    });
    await rooms().deleteRoom(owner, room.id);

    const fresh = await rooms().createRoom(owner, fx.resortId, {
      name: "Typo", roomTypeId: fx.roomTypeId, baseRate: 4000,
    });

    expect(fresh.id).not.toBe(room.id);
  });
});

describe("a room with history", () => {
  it("is retired, not deleted — the bookings keep their room", async () => {
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2020-01-01", checkOut: "2020-01-02",
    });
    const roomId = fx.rooms[0]!.id;

    const r = await rooms().deleteRoom(owner, roomId);

    expect(r.removed).toBe("retired");
    const still = await prisma.room.findUnique({ where: { id: roomId } });
    expect(still).not.toBeNull();
    expect(still!.deletedAt).not.toBeNull();
    // and the stay still knows which room it was
    const items = await prisma.bookingItem.findMany({ where: { bookingId: booking.id } });
    expect(items.some((i) => i.roomId === roomId)).toBe(true);
  });

  it("disappears from the room list", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2020-01-01", checkOut: "2020-01-02",
    });
    const roomId = fx.rooms[0]!.id;
    await rooms().deleteRoom(owner, roomId);

    const list = await rooms().listRooms(owner, fx.resortId);

    expect(list.map((r) => r.id)).not.toContain(roomId);
  });

  it("disappears from the availability grid, so it cannot be sold again", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2020-01-01", checkOut: "2020-01-02",
    });
    const roomId = fx.rooms[0]!.id;
    await rooms().deleteRoom(owner, roomId);

    const grid = await makeAvailabilityService(asPrisma).roomsGrid(
      owner, fx.resortId, "2026-12-01", "2026-12-05",
    );

    expect(grid.map((g) => g.roomId)).not.toContain(roomId);
  });

  it("stops counting against the plan's room cap", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2020-01-01", checkOut: "2020-01-02",
    });
    const before = await prisma.room.count({ where: { resortId: fx.resortId, deletedAt: null } });

    await rooms().deleteRoom(owner, fx.rooms[0]!.id);

    const after = await prisma.room.count({ where: { resortId: fx.resortId, deletedAt: null } });
    expect(after).toBe(before - 1);
  });
});

describe("what it refuses", () => {
  it("will not remove a room a guest is booked into", async () => {
    // a stay that has not happened yet
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: soon, checkOut: later });

    await expect(rooms().deleteRoom(owner, fx.rooms[0]!.id)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses someone who may manage rooms but not remove them", async () => {
    const manager = await withPermissions(["rooms.view", "rooms.manage"]);

    await expect(rooms().deleteRoom(manager, fx.rooms[0]!.id)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a room belonging to another resort", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);

    await expect(rooms().deleteRoom(owner, other.rooms[0]!.id)).rejects.toMatchObject({ status: 403 });
  });

  it("says so when a room is already gone", async () => {
    const room = await prisma.room.create({
      data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name: "Gone", baseRate: 3000 as never },
    });
    await rooms().deleteRoom(owner, room.id);

    await expect(rooms().deleteRoom(owner, room.id)).rejects.toMatchObject({ status: 400 });
  });
});

describe("the record of it", () => {
  it("writes an audit entry carrying the room's name", async () => {
    const room = await prisma.room.create({
      data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name: "Rose", baseRate: 3000 as never },
    });

    await rooms().deleteRoom(owner, room.id);

    const logged = await prisma.auditLog.findFirst({
      where: { resortId: fx.resortId, action: "room.delete" },
      orderBy: { id: "desc" },
    });
    expect(logged).not.toBeNull();
    expect(JSON.stringify(logged!.diff)).toContain("Rose");
  });
});
