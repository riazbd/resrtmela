/**
 * The public v1 API is a resort's own website, holding its own API key.
 *
 * It used to create bookings, and this file used to prove that it did — that it
 * held the nights so a website could not double-book, and that it invented no
 * user to blame. Both were true and both are gone: a guest cannot book
 * directly, and a form on a resort's homepage is a guest booking directly
 * however it reaches us. The key now reads and does not sell.
 *
 * What survives is the part that was always the point of a key: it belongs to
 * one resort and must not reach past it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { apiKeyClaims, SYSTEM_ACTOR_ID } from "../../src/common/rbac";
import { ROLE } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what an API key may read", () => {
  it("its own resort, for the website's header and contact block", async () => {
    const resort = await makePlatformService(asPrismaService).publicResort(fx.resortId);

    expect(resort?.id).toBe(fx.resortId);
    expect(resort?.name).toBe("Test Resort");
  });

  it("what is free, so the site can still show rooms and a phone number", async () => {
    const avail = await makePlatformService(asPrismaService).publicAvailability(
      fx.resortId,
      "2027-03-01",
      "2027-03-03",
    );

    expect(Array.isArray(avail)).toBe(true);
  });
});

describe("what an API key may not do", () => {
  it("create a booking", async () => {
    await expect(
      makeBookingsService(asPrismaService).create(apiKeyClaims(fx.resortId), {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        checkIn: "2027-03-01",
        checkOut: "2027-03-03",
        adults: 2,
        children: 0,
        guest: { fullName: "Website Guest", phone: "8801722222222" },
        source: "APP",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("reach another resort — and is stopped by the key's scope, not only by the sales rule", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);

    /**
     * Read, not write. Asking for a booking here would be refused twice over
     * and the test could not tell which rule did it — it would go green even if
     * the scoping were removed. `requireResortAccess` is what is under test, so
     * the call has to be one the key is otherwise entitled to make.
     */
    await expect(
      makeBookingsService(asPrismaService).calendar(
        apiKeyClaims(fx.resortId),
        other.resortId,
        "2027-03-01",
        "2027-03-03",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("the claims a key is given", () => {
  it("are scoped to one resort, and are not the platform's", () => {
    const claims = apiKeyClaims(fx.resortId);

    expect(claims.role).not.toBe(ROLE.SUPER_ADMIN);
    expect(claims.resortIds).toEqual([fx.resortId]);
  });

  it("name no human, which is what marks the request as a website's", () => {
    // `bookings.create` refuses on exactly this: nobody at the desk pressed
    // anything, so nobody at the desk is selling
    expect(apiKeyClaims(fx.resortId).userId).toBe(SYSTEM_ACTOR_ID);
  });
});
