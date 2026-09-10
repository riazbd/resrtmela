/**
 * A guest cannot book directly.
 *
 * This is a business decision, not a technical one, and it is worth writing
 * down because the code used to say the opposite in as many words. Until now
 * `bookings.create` refused a guest with "Guests book via the mobile app flow
 * (phase 4)" — the desk's door was shut, and the app's door was the one left
 * open. That app flow went straight to `bookRoomsTx`, so a stranger with a
 * verified phone could take a room out of a resort's inventory without anyone
 * at the resort being asked. The room was held on `PENDING`, which blocks, and
 * the resort found out afterwards.
 *
 * The platform is a medium. A stay is sold by the resort's desk or by an agent,
 * and those two are now the only ways a room can be held.
 *
 * The refusals below are deliberately refusals rather than deleted routes. The
 * mobile app is frozen and shipped, and it still has a Book button: a 404 gives
 * whoever taps it a broken screen, while a 403 carrying a sentence gives them
 * something to read and a phone to call. The web console's own booking UI is
 * ours to change and loses the button outright, so only stale clients ever see
 * these messages.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeGuestService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { apiKeyClaims } from "../../src/common/rbac";
import { normalizePhone, phoneKey } from "../../src/common/dates";
import { ROLE } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const guests = () => makeGuestService(asPrismaService);
const bookings = () => makeBookingsService(asPrismaService);

/** A verified guest account, the way the OTP flow leaves one. */
async function aGuestUser(phone: string) {
  const user = await prisma.user.create({
    data: { name: "App Guest", phone, role: "GUEST", status: "active" },
  });
  return { userId: user.id, role: ROLE.GUEST, resortIds: [] as number[] };
}

const STAY = { checkIn: "2027-03-01", checkOut: "2027-03-03" };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a guest asking to book from the app", () => {
  it("is refused", async () => {
    const claims = await aGuestUser("8801799000001");

    await expect(
      guests().createBooking(claims, {
        resortId: fx.resortId,
        items: [{ roomTypeId: fx.roomTypeId, qty: 1 }],
        ...STAY,
        adults: 2,
        children: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("is told how a room is actually booked, because a frozen app can only show the message", async () => {
    const claims = await aGuestUser("8801799000002");

    await expect(
      guests().createBooking(claims, {
        resortId: fx.resortId,
        items: [{ roomTypeId: fx.roomTypeId, qty: 1 }],
        ...STAY,
        adults: 2,
        children: 0,
      }),
    ).rejects.toThrow(/resort|desk|agent/i);
  });

  it("leaves the room on sale — the refusal must not hold a night on the way out", async () => {
    const claims = await aGuestUser("8801799000003");

    await guests()
      .createBooking(claims, {
        resortId: fx.resortId,
        items: [{ roomTypeId: fx.roomTypeId, qty: 1 }],
        ...STAY,
        adults: 2,
        children: 0,
      })
      .catch(() => undefined);

    expect(await prisma.bookingNight.count()).toBe(0);
    expect(await prisma.booking.count()).toBe(0);
  });

  it("creates no guest record, so a refused stranger leaves no trace in the resort's book", async () => {
    const claims = await aGuestUser("8801799000004");
    const before = await prisma.guest.count();

    await guests()
      .createBooking(claims, {
        resortId: fx.resortId,
        items: [{ roomTypeId: fx.roomTypeId, qty: 1 }],
        ...STAY,
        adults: 2,
        children: 0,
      })
      .catch(() => undefined);

    expect(await prisma.guest.count()).toBe(before);
  });
});

describe("a resort's own website posting to the public API", () => {
  it("is refused too — an API key sells nothing a guest could not", async () => {
    await expect(
      bookings().create(apiKeyClaims(fx.resortId), {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Website Guest", phone: "8801722222222" },
        source: "APP",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("holds no night when it is turned away", async () => {
    await bookings()
      .create(apiKeyClaims(fx.resortId), {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Website Guest", phone: "8801722222222" },
        source: "APP",
      })
      .catch(() => undefined);

    expect(await prisma.bookingNight.count()).toBe(0);
  });
});

describe("what a guest keeps", () => {
  it("can still find a resort", async () => {
    const found = await guests().discover();

    expect(found.map((r) => r.id)).toContain(fx.resortId);
  });

  it("is given the number to ring, because the page now tells them to ring it", async () => {
    /**
     * Telling a guest to call the resort is only an answer if the resort's
     * number is on the page. It was not: `resortDetail` returned rooms, prices
     * and activities and no way to reach anybody. Closing the Book button
     * without this would have left the page a dead end.
     */
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { contactPhone: "8801811111111" },
    });

    const detail = await guests().resortDetail(fx.resortId);

    expect(detail.contactPhone).toBe("8801811111111");
  });

  it("can still see what is free before ringing up", async () => {
    const claims = await aGuestUser("8801799000005");

    const avail = await guests().availability(claims, fx.resortId, STAY.checkIn, STAY.checkOut);

    expect(avail).toBeTruthy();
  });

  it("can still see the trip the desk booked for them", async () => {
    const phone = normalizePhone("8801711111111");
    const claims = await aGuestUser(phone);
    // the desk's guest row and the app account are the same person, and the
    // only thing that says so is the phone key
    await prisma.guest.update({
      where: { id: fx.guestId },
      data: { phone, phoneKey: phoneKey(phone) },
    });
    await seedBooking(prisma as unknown as PrismaClient, fx, STAY);

    const trips = await guests().trips(claims);

    expect(trips.length).toBeGreaterThan(0);
  });
});

describe("who can still sell", () => {
  it("the desk, for the very nights the guest was refused", async () => {
    const created = await bookings().create(
      { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] },
      {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Walk In", phone: "8801744444444" },
        source: "DIRECT",
      },
    );

    expect(created.code).toMatch(/^BK-\d{5}$/);
    expect(await prisma.bookingNight.count()).toBe(2);
  });
});
