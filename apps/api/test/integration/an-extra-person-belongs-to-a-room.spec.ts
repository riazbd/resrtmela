/**
 * An extra person belongs to a room, not to a room type.
 *
 * Extra persons were allowed, capped and priced on `RoomType`. Sky Eco has one
 * type — "Standard Garden View" — covering nine rooms that are not one size:
 * some take a third person comfortably, some do not take one at all, and the ones
 * that do are not worth the same. A single number on the type could not say any
 * of that, so the resort left the whole feature switched off and the "Extra
 * persons" box never appeared on a single booking form.
 *
 * The type keeps its numbers as the default a new room starts with — nobody
 * wants to type the same rate nine times — and the room is what the booking
 * reads.
 *
 * Which makes the price a per-room question for the first time. A booking still
 * carries one `extraPersons` count, so the extra persons go into the rooms that were
 * picked, in the order they were picked, and each person is charged at the rate
 * of the room they are actually sleeping in. `Math.max` over the types, which is
 * what it used to do, charged everyone the dearest room's rate however small the
 * room they got.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makeRoomsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let desk: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);
const STAY = { checkIn: "2027-04-01", checkOut: "2027-04-03" }; // two nights

/** Terms for one room, the way the Rooms screen sets them. */
async function roomTakes(roomId: number, max: number, rate: number) {
  await prisma.room.update({
    where: { id: roomId },
    data: { extraPersonAllowed: max > 0, extraPersonMax: max, extraPersonRate: rate as never },
  });
}

const book = (roomIds: number[], extraPersons: number) =>
  bookings().create(desk, {
    resortId: fx.resortId,
    roomIds,
    ...STAY,
    adults: 2,
    children: 0,
    extraPersons,
    guest: { fullName: "Walk In", phone: "8801744444444" },
    source: "DIRECT",
  });

const extraItems = (bookingId: number) =>
  prisma.bookingItem.findMany({
    where: { bookingId, itemKind: "EXTRA_PERSON" },
    orderBy: { id: "asc" },
  });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what a room will take", () => {
  it("is the room's own answer, not its type's", async () => {
    const [small, big] = fx.rooms;
    await roomTakes(small!.id, 0, 0);
    await roomTakes(big!.id, 2, 900);

    await expect(book([small!.id], 1)).rejects.toMatchObject({ status: 400 });
    const ok = await book([big!.id], 1);
    expect(ok.code).toMatch(/^BK-/);
  });

  it("says which room could not take them", async () => {
    const [small] = fx.rooms;
    await roomTakes(small!.id, 0, 0);

    await expect(book([small!.id], 1)).rejects.toThrow(new RegExp(small!.name));
  });

  it("refuses more people than the picked rooms hold, however many rooms there are", async () => {
    const [a, b] = fx.rooms;
    await roomTakes(a!.id, 1, 500);
    await roomTakes(b!.id, 1, 500);

    await expect(book([a!.id, b!.id], 3)).rejects.toMatchObject({ status: 400 });
    const ok = await book([a!.id, b!.id], 2);
    expect(ok.code).toMatch(/^BK-/);
  });
});

describe("what an extra person costs", () => {
  it("is the rate of the room it is in", async () => {
    const [cheap] = fx.rooms;
    await roomTakes(cheap!.id, 1, 700);

    const created = await book([cheap!.id], 1);

    const items = await extraItems(created.id);
    expect(items).toHaveLength(1);
    expect(Number(items[0]!.unitPrice)).toBe(700);
    expect(items[0]!.qty).toBe(2); // one person, two nights
    expect(items[0]!.roomId).toBe(cheap!.id);
  });

  it("is charged per room when a booking spans two of them", async () => {
    const [cheap, dear] = fx.rooms;
    await roomTakes(cheap!.id, 1, 500);
    await roomTakes(dear!.id, 1, 1500);

    const created = await book([cheap!.id, dear!.id], 2);

    const items = await extraItems(created.id);
    expect(items).toHaveLength(2);
    expect(items.map((i) => Number(i.unitPrice)).sort((x, y) => x - y)).toEqual([500, 1500]);
  });

  it("fills the rooms in the order they were picked, so nobody is charged for a place they did not get", async () => {
    const [first, second] = fx.rooms;
    await roomTakes(first!.id, 2, 400);
    await roomTakes(second!.id, 2, 1200);

    // two people, and the first room takes both
    const created = await book([first!.id, second!.id], 2);

    const items = await extraItems(created.id);
    expect(items).toHaveLength(1);
    expect(items[0]!.roomId).toBe(first!.id);
    expect(Number(items[0]!.unitPrice)).toBe(400);
    expect(items[0]!.qty).toBe(4); // two people, two nights
  });

  it("adds nothing at all when nobody asked for an extra person", async () => {
    const [room] = fx.rooms;
    await roomTakes(room!.id, 2, 400);

    const created = await book([room!.id], 0);

    expect(await extraItems(created.id)).toHaveLength(0);
  });
});

describe("the room type", () => {
  it("still carries the terms, as what a new room starts with", async () => {
    const type = await prisma.roomType.update({
      where: { id: fx.roomTypeId },
      data: { extraPersonAllowed: true, extraPersonRate: 850 as never, extraPersonMax: 2 },
    });

    const room = await makeRoomsService(asPrisma).createRoom(desk, fx.resortId, {
      name: "New Room",
      roomTypeId: type.id,
      baseRate: 5000,
    });

    const fresh = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(fresh.extraPersonAllowed).toBe(true);
    expect(Number(fresh.extraPersonRate)).toBe(850);
    expect(fresh.extraPersonMax).toBe(2);
  });
});
