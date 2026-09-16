/**
 * More people turn up than the booking said.
 *
 * A booking for two arrives as four. The extra persons could only be set on
 * the booking form, so the desk either charged nothing or cancelled the stay
 * and booked it again — losing the advance off the ledger in the process.
 *
 * `setExtraPersons` changes the count on a live booking, before or at check-in
 * and while the guests are in the room. It goes through the same room-by-room
 * rule as the booking form, charges them for the whole stay, and a percentage
 * discount follows the new total.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let desk: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);
/** Two nights at 5,000. */
const STAY = { checkIn: "2027-04-01", checkOut: "2027-04-03", adults: 2, children: 0 };
const guest = { fullName: "Arrived As Four", phone: "8801744444555" };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  await prisma.room.update({
    where: { id: fx.rooms[0]!.id },
    data: { extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 800 as never },
  });
});

afterAll(async () => prisma.$disconnect());

const bookForTwo = (extra: { discount?: number; discountKind?: "FLAT" | "PERCENT" } = {}) =>
  bookings().create(desk, { resortId: fx.resortId, roomIds: [fx.rooms[0]!.id], ...STAY, guest, ...extra });

describe("adding the people who came", () => {
  it("charges them for every night of the stay", async () => {
    const b = await bookForTwo();

    const after = await bookings().setExtraPersons(desk, b.id, 2);

    expect(after.extraPersons).toBe(2);
    // 10,000 of room + 2 persons × 2 nights × 800
    expect(after.rent).toBe(13200);
    expect(after.due).toBe(13200);
  });

  it("works once the guests are checked in", async () => {
    const b = await bookForTwo();
    await bookings().transition(desk, b.id, "CHECKED_IN");

    const after = await bookings().setExtraPersons(desk, b.id, 1);

    expect(after.rent).toBe(11600);
  });

  it("replaces the count rather than adding to it", async () => {
    const b = await bookForTwo();
    await bookings().setExtraPersons(desk, b.id, 2);

    const after = await bookings().setExtraPersons(desk, b.id, 1);

    expect(after.extraPersons).toBe(1);
    expect(after.rent).toBe(11600);
    expect(after.items.filter((i) => i.kind === "EXTRA_PERSON")).toHaveLength(1);
  });

  it("can take them off again", async () => {
    const b = await bookForTwo();
    await bookings().setExtraPersons(desk, b.id, 2);

    const after = await bookings().setExtraPersons(desk, b.id, 0);

    expect(after.rent).toBe(10000);
    expect(after.items.filter((i) => i.kind === "EXTRA_PERSON")).toHaveLength(0);
  });

  it("keeps a percentage discount a percentage of the new total", async () => {
    const b = await bookForTwo({ discount: 10, discountKind: "PERCENT" });

    const after = await bookings().setExtraPersons(desk, b.id, 2);

    expect(after.discount).toBe(1320);
  });

  it("are charged for the new nights when the stay is lengthened", async () => {
    const b = await bookForTwo();
    await bookings().setExtraPersons(desk, b.id, 2);

    // two nights become three: 15,000 of room + 2 × 3 × 800
    const after = await bookings().update(desk, b.id, { checkOut: "2027-04-04" });

    expect(after.rent).toBe(19800);
  });

  it("is written down", async () => {
    const b = await bookForTwo();
    await bookings().setExtraPersons(desk, b.id, 2);

    const log = await prisma.auditLog.findFirst({
      where: { action: "booking.extra_persons", entityId: b.id },
    });
    expect(log).toBeTruthy();
  });
});

describe("what it refuses", () => {
  it("more people than the room takes, naming the limit", async () => {
    const b = await bookForTwo();

    await expect(bookings().setExtraPersons(desk, b.id, 3)).rejects.toThrow(/take 2/);
  });

  it("a stay that has already ended", async () => {
    const b = await bookForTwo();
    await bookings().transition(desk, b.id, "CHECKED_IN");
    await bookings().transition(desk, b.id, "CHECKED_OUT");

    await expect(bookings().setExtraPersons(desk, b.id, 1)).rejects.toThrow(/checked out|cancelled|no-show/i);
  });

  it("somebody without the edit permission", async () => {
    const b = await bookForTwo();
    const role = await prisma.customRole.create({
      data: { resortId: fx.resortId, name: "Viewer", permissions: ["bookings.view"] as never },
    });
    const viewer = await prisma.user.create({
      data: { name: "V", email: `v-${Date.now()}@example.com`, phone: `8801${Date.now() % 1e9}`, role: "FRONT_DESK" },
    });
    await prisma.userResort.create({ data: { userId: viewer.id, resortId: fx.resortId, roleId: role.id } });

    await expect(
      bookings().setExtraPersons({ userId: viewer.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] }, b.id, 1),
    ).rejects.toThrow();
  });
});
