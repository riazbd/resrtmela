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
 * there is nothing left at either threshold to test that way, so this file
 * now proves the rule at the layer both of them used to reach through:
 * `bookings.create` sells for the resort's own desk and for an agency, and
 * still refuses a `ROLE.GUEST` claim and a claim carrying `SYSTEM_ACTOR_ID`.
 *
 * Neither refusal is a guard left standing against a door that no longer
 * exists. OTP login (`auth.service.ts`, `verifyOtp`) still mints a `GUEST`
 * user for any phone or email it has not seen before — that path is untouched
 * by this task — and that account's token passes `AuthGuard` exactly like any
 * other. `POST /bookings` on `BookingsController` carries no role guard of
 * its own; `bookings.create` is the only thing standing between a `GUEST`
 * token and a held room. A later task removes OTP and the `GUEST` role
 * themselves and will update this file again when that check goes — until
 * then it is live, and this proves it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { SYSTEM_ACTOR_ID } from "../../src/common/rbac";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const bookings = () => makeBookingsService(asPrismaService);

const GUEST_MESSAGE = "Rooms are booked by the resort. Call the resort or your travel agent to hold these dates.";
const SYSTEM_ACTOR_MESSAGE = "Online booking is off. This resort takes bookings at its desk or through its agents.";

/**
 * A guest account, the way OTP login still leaves one today.
 *
 * `verifyOtp` mints a `ROLE.GUEST` user for any phone or email it has not
 * seen before, and this task did not touch it. `resortIds` is set here
 * rather than left `[]` on purpose: a real OTP-issued guest token never
 * names a resort, so it would be stopped by the ordinary `requireSellingAccess`
 * gate before reaching the `ROLE.GUEST` check this test is actually about —
 * which would end up proving the wrong rule. Granting resort access isolates
 * the one thing under test.
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

  it("is told the exact sentence, not the generic access refusal", async () => {
    /**
     * `/resort|desk|agent/i` used to stand in for this. "No access to this
     * resort" — the message `requireSellingAccess` throws for anyone with no
     * link to the resort at all — matches that pattern too, so the loose
     * regex would keep passing even with the `ROLE.GUEST` check deleted
     * outright. Pinning the exact sentence is what makes this test about the
     * refusal it claims to be about.
     */
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
    ).rejects.toMatchObject({ status: 403, message: GUEST_MESSAGE });
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

describe("a claim with no human behind it reaching bookings.create directly", () => {
  /**
   * `apiKeyClaims` used to be the only thing that minted a `JwtClaims` with
   * `userId: SYSTEM_ACTOR_ID` — a resort's own website, posting through its
   * API key with nobody at the desk pressing anything. That function and the
   * route it served are both deleted, and `public-api.spec.ts` went with
   * them, which left this refusal in `bookings.create` with nothing proving
   * it any more. The check itself is untouched — the plan keeps it — so it
   * is proven here the same way the `ROLE.GUEST` refusal above is: by
   * constructing the claim directly, since no route can hand one out any
   * more.
   */
  const systemActorClaims = (): JwtClaims => ({
    userId: SYSTEM_ACTOR_ID,
    role: ROLE.RESORT_ADMIN,
    resortIds: [fx.resortId],
  });

  it("is refused", async () => {
    await expect(
      bookings().create(systemActorClaims(), {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        adults: 2,
        children: 0,
        guest: { fullName: "Website Guest", phone: "8801722222222" },
        source: "APP",
      }),
    ).rejects.toMatchObject({ status: 403, message: SYSTEM_ACTOR_MESSAGE });
  });

  it("holds no night", async () => {
    await bookings()
      .create(systemActorClaims(), {
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
