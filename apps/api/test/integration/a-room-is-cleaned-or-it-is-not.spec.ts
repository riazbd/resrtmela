/**
 * Housekeeping, which the platform sold and never built.
 *
 * `HOUSEKEEPING` has been in the role enum since phase 0. The platform's
 * "add a user" route accepts it, the console's team form offers it, and
 * `permissionsFor` answered it with an **empty array** — so an owner
 * could add a housekeeper, hand them a password, and that person signed
 * in to an app with nothing in it whatsoever.
 *
 * Three states and one automatic rule:
 *
 *   DIRTY → CLEANING → CLEAN, and **check-out makes a room dirty**.
 *
 * That rule is the whole feature. Without it somebody marks every
 * departure by hand, and on a busy morning they will not, and by ten
 * o'clock the list is wrong and nobody trusts it again.
 *
 * What it deliberately does *not* do is block a check-in. A guest is
 * standing at the counter; a clerk who cannot check them in because a
 * checkbox has not been ticked will work around the app, and an app
 * people work around stops being true.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeRoomsService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, addDaysIso, todayIn, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const rooms = () => makeRoomsService(asPrisma);
const bookings = () => makeBookingsService(asPrisma);

let fx: Fixture;
let manager: JwtClaims;
let keeper: JwtClaims;

/**
 * The fixture resort's own day, which is what "today" means to the
 * server — and not the machine's UTC date.
 *
 * Written the other way first, and it failed at ten past midnight in
 * Dhaka: UTC was still on the 20th while the resort was on the 21st, so
 * a booking the test called "today" arrived yesterday. `todayIn` exists
 * for exactly this, and a test that does its own date arithmetic is a
 * second implementation of the thing being tested.
 */
const ZONE = "Asia/Dhaka";
const today = () => todayIn(ZONE);
const plus = (days: number) => addDaysIso(todayIn(ZONE), days);

/** One booking in one room, so the test can name the room it means. */
const stay = (roomId: number, over: Record<string, unknown> = {}) =>
  seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId,
    checkIn: today(),
    checkOut: plus(1),
    ...over,
  });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  keeper = { userId: fx.managerId, role: ROLE.HOUSEKEEPING, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the state a room is in", () => {
  it("starts every room ready, because nobody has stayed in it", async () => {
    const list = await rooms().housekeeping(manager, fx.resortId);
    expect(list.length).toBe(fx.rooms.length);
    expect(list.every((r) => r.housekeeping === "CLEAN")).toBe(true);
  });

  it("moves to being cleaned, and then to ready", async () => {
    const id = fx.rooms[0]!.id;
    await rooms().setHousekeeping(manager, id, "DIRTY");
    await rooms().setHousekeeping(manager, id, "CLEANING");
    const mid = await rooms().housekeeping(manager, fx.resortId);
    expect(mid.find((r) => r.id === id)?.housekeeping).toBe("CLEANING");

    await rooms().setHousekeeping(manager, id, "CLEAN");
    const done = await rooms().housekeeping(manager, fx.resortId);
    expect(done.find((r) => r.id === id)?.housekeeping).toBe("CLEAN");
  });

  /** An owner asks who cleaned it, and the row is the only place that says. */
  it("records who moved it and when", async () => {
    const id = fx.rooms[0]!.id;
    await rooms().setHousekeeping(manager, id, "CLEANING");
    const row = await rooms().housekeeping(manager, fx.resortId);
    const one = row.find((r) => r.id === id)!;
    expect(one.housekeepingBy).toBeTruthy();
    expect(one.housekeepingAt).toBeTruthy();
  });

  it("refuses a state that is not one of the three", async () => {
    await expect(
      rooms().setHousekeeping(manager, fx.rooms[0]!.id, "INSPECTED"),
    ).rejects.toThrow();
  });

  it("refuses a room belonging to another resort", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await expect(
      rooms().setHousekeeping(manager, other.rooms[0]!.id, "DIRTY"),
    ).rejects.toThrow();
  });
});

describe("the role that had nothing", () => {
  it("lets a housekeeper read the list", async () => {
    const list = await rooms().housekeeping(keeper, fx.resortId);
    expect(list.length).toBe(fx.rooms.length);
  });

  it("lets a housekeeper mark a room cleaned", async () => {
    const id = fx.rooms[0]!.id;
    await rooms().setHousekeeping(keeper, id, "CLEANING");
    const list = await rooms().housekeeping(keeper, fx.resortId);
    expect(list.find((r) => r.id === id)?.housekeeping).toBe("CLEANING");
  });
});

describe("what a check-out does to the room", () => {
  /**
   * The one automatic rule. A guest leaves; the room is dirty; nobody
   * had to remember.
   */
  it("makes the room of the stay dirty", async () => {
    const id = fx.rooms[0]!.id;
    const b = await stay(id);
    await bookings().transition(manager, b.id, "CONFIRMED");
    await bookings().transition(manager, b.id, "CHECKED_IN");
    await bookings().transition(manager, b.id, "CHECKED_OUT");

    const list = await rooms().housekeeping(manager, fx.resortId);
    expect(list.find((r) => r.id === id)?.housekeeping).toBe("DIRTY");
  });

  it("leaves the rooms nobody stayed in alone", async () => {
    const id = fx.rooms[0]!.id;
    const b = await stay(id);
    await bookings().transition(manager, b.id, "CONFIRMED");
    await bookings().transition(manager, b.id, "CHECKED_IN");
    await bookings().transition(manager, b.id, "CHECKED_OUT");

    const list = await rooms().housekeeping(manager, fx.resortId);
    const untouched = list.filter((r) => r.id !== id);
    expect(untouched.length).toBeGreaterThan(0);
    expect(untouched.every((r) => r.housekeeping === "CLEAN")).toBe(true);
  });

  /**
   * A dirty room does not stop a guest being checked in. It is a warning
   * on the screen and nothing more — see the design note. What must not
   * happen is the check-in silently *cleaning* the room.
   */
  it("does not block a check-in, and does not quietly mark the room ready", async () => {
    const id = fx.rooms[0]!.id;
    const b = await stay(id);
    await rooms().setHousekeeping(manager, id, "DIRTY");
    await bookings().transition(manager, b.id, "CONFIRMED");
    await expect(bookings().transition(manager, b.id, "CHECKED_IN")).resolves.toBeTruthy();

    const list = await rooms().housekeeping(manager, fx.resortId);
    expect(list.find((r) => r.id === id)?.housekeeping).toBe("DIRTY");
  });
});

describe("what the list says beyond the state", () => {
  /**
   * The order is the design, and the ordering rule lives in
   * `@rh/shared`. What the server owes it is the two facts it cannot
   * work out: whether somebody left this room today, and whether
   * somebody arrives into it tonight.
   */
  it("says whether a guest left today and whether one arrives tonight", async () => {
    const id = fx.rooms[0]!.id;
    const b = await stay(id);
    await bookings().transition(manager, b.id, "CONFIRMED");
    const list = await rooms().housekeeping(manager, fx.resortId);
    for (const room of list) {
      expect(typeof room.departedToday).toBe("boolean");
      expect(typeof room.arrivingToday).toBe("boolean");
    }
    // this stay starts today, so its room is one somebody arrives into
    expect(list.find((r) => r.id === id)?.arrivingToday).toBe(true);
  });
});
