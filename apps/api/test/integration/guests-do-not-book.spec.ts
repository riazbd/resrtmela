/**
 * A room is held only by the resort's desk or by an agency.
 *
 * On 2026-09-11 the owner decided this platform sells to resorts and travel
 * agencies, never directly to a traveller: a guest is a row in a resort's
 * register, not an account with a login. Every door that let a stranger
 * browse, book or pay as themselves is gone — `guest.controller.ts`,
 * `public-api.controller.ts` and the payment intents behind them — and so is
 * the login code that minted a guest account in the first place. There is no
 * GUEST role left to hold: not in `ROLE`, not in the `users.role` column.
 * `a-guest-has-no-door.spec.ts` proves each of those absences.
 *
 * This file proves the rule those doors used to reach through, at
 * `bookings.create`: the resort's own desk sells, an agency sells, and a
 * claim with nobody behind it is refused.
 *
 * It used to prove one more thing — that `bookings.create` refused a
 * `ROLE.GUEST` claim by name. That check is gone, because nothing can carry
 * the role any more, with one exception: a session signed before the deploy
 * still verifies for up to seven days. So one describe below follows such a
 * session the whole way. `AuthGuard` refuses it first; and if it somehow got
 * past, `bookings.create` would refuse it anyway — it names no resort, and
 * holds no permission in one — without holding a night.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { SYSTEM_ACTOR_ID } from "../../src/common/rbac";
import { AuthGuard, signToken } from "../../src/common/auth.guard";
import { ROLE, type JwtClaims, type Role } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const bookings = () => makeBookingsService(asPrismaService);

const SYSTEM_ACTOR_MESSAGE = "Online booking is off. This resort takes bookings at its desk or through its agents.";

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

describe("a guest session signed before the deploy", () => {
  /**
   * What such a token carries. The account it was minted for was deleted by
   * `20260911110000_no_guest_accounts`, so its id belongs to nobody — any id
   * no seeded user holds stands in for it. The role has to be cast: it is
   * exactly the value the type no longer admits.
   */
  const staleGuest = (resortIds: number[]): JwtClaims => ({
    userId: 424242,
    role: "GUEST" as unknown as Role,
    resortIds,
  });

  const aBooking = (phone: string) => ({
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    ...STAY,
    adults: 2,
    children: 0,
    guest: { fullName: "Should Not Book", phone },
  });

  it("is stopped at the guard, before it reaches any booking", () => {
    const req = { headers: { authorization: `Bearer ${signToken(staleGuest([]))}` } };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;

    expect(() => new AuthGuard().canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("would still be refused by bookings.create if it got past — it names no resort", async () => {
    /**
     * `issueToken` fills `resortIds` from `user_resorts`, and a guest never
     * had a row there, so this is the shape a real guest token had. The
     * refusal is the ordinary one anyone with no link to the resort meets.
     */
    await expect(bookings().create(staleGuest([]), aBooking("8801799000001"))).rejects.toMatchObject({
      status: 403,
      message: "No access to this resort",
    });
  });

  it("and holds no permission to sell even where it names the resort", async () => {
    /**
     * Naming the resort is deliberate: it gets the claim past
     * `requireSellingAccess`, so the permission check behind it is what
     * answers. A role that is not a role holds no permission anywhere — which
     * is the rule the deleted `ROLE.GUEST` check was standing in for.
     */
    await expect(
      bookings().create(staleGuest([fx.resortId]), aBooking("8801799000002")),
    ).rejects.toMatchObject({ status: 403, message: "Missing permission: bookings.create" });
  });

  it("holds no night and leaves no guest record — a refusal must not act like a sale", async () => {
    const guestsBefore = await prisma.guest.count();

    await bookings().create(staleGuest([]), aBooking("8801799000003")).catch(() => undefined);
    await bookings().create(staleGuest([fx.resortId]), aBooking("8801799000004")).catch(() => undefined);

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
   * is proven here the same way the stale guest session above is: by
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
