/**
 * A room is held only by the resort's desk or by an agency.
 *
 * On 2026-09-11 the owner decided this platform sells to resorts and travel
 * agencies, never directly to a traveller: a guest is a row in a resort's
 * register, not an account with a login. Every door that let a stranger
 * browse, book or pay as themselves is gone — `guest.controller.ts`,
 * `public-api.controller.ts` and the payment intents behind them are all
 * deleted; `a-guest-has-no-door.spec.ts` proves they answer 404, not merely
 * refuse.
 *
 * This file used to prove those doors refused a guest's booking rather than
 * silently taking it — including the shipped mobile app's Book button and a
 * resort's own website posting through its API key. With both doors gone
 * there is nothing left at the threshold to test that way, so this file now
 * proves the rule that survived them, at the one layer still standing:
 * `bookings.create` sells for the resort's own desk and for an agency, and
 * still refuses a `ROLE.GUEST` claim that reaches it directly. No route can
 * construct that claim any more, but the check itself has not been deleted
 * — so it is proven here rather than assumed silent. A later task retires the
 * guest role itself and will update this file again when that check goes.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const bookings = () => makeBookingsService(asPrismaService);

/**
 * A verified guest account, the way the (now-deleted) OTP flow used to leave
 * one — the row can still exist; nothing that reaches it can any more.
 * `resortIds` includes the resort deliberately, so the claim clears the
 * ordinary access gate and the assertion below is about the `ROLE.GUEST`
 * check specifically, not about a claim that was never allowed near the
 * resort at all.
 */
async function aGuestClaims(phone: string): Promise<JwtClaims> {
  const user = await prisma.user.create({
    data: { name: "App Guest", phone, role: "GUEST", status: "active" },
  });
  return { userId: user.id, role: ROLE.GUEST, resortIds: [fx.resortId] };
}

const STAY = { checkIn: "2027-03-01", checkOut: "2027-03-03" };
const OTHER_STAY = { checkIn: "2027-04-01", checkOut: "2027-04-03" };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("who can still sell", () => {
  it("the resort's own desk", async () => {
    const desk: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };

    const created = await bookings().create(desk, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      adults: 2,
      children: 0,
      guest: { fullName: "Walk In", phone: "8801744444444" },
      source: "DIRECT",
    });

    expect(created.code).toMatch(/^BK-\d{5}$/);
    expect(await prisma.bookingNight.count()).toBe(2);
  });

  it("an agency selling this resort", async () => {
    const agency: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };

    const created = await bookings().create(agency, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[1]!.id],
      ...OTHER_STAY,
      adults: 2,
      children: 0,
      guest: { fullName: "Agency Client", phone: "8801799999999" },
    });

    expect(created.code).toMatch(/^BK-\d{5}$/);
    expect(await prisma.bookingNight.count()).toBe(2);
  });
});

describe("a guest claim reaching bookings.create directly", () => {
  it("is refused", async () => {
    const claims = await aGuestClaims("8801799000001");

    await expect(
      bookings().create(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Should Not Book", phone: "8801799000001" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("is told how a room is actually booked, because a frozen app can only show the message", async () => {
    const claims = await aGuestClaims("8801799000002");

    await expect(
      bookings().create(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Should Not Book", phone: "8801799000002" },
      }),
    ).rejects.toThrow(/resort|desk|agent/i);
  });

  it("holds no night and leaves no guest record — a refusal must not act like a sale", async () => {
    const claims = await aGuestClaims("8801799000003");
    const guestsBefore = await prisma.guest.count();

    await bookings()
      .create(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Should Not Book", phone: "8801799000003" },
      })
      .catch(() => undefined);

    expect(await prisma.bookingNight.count()).toBe(0);
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.guest.count()).toBe(guestsBefore);
  });
});
