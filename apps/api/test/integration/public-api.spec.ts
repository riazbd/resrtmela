/**
 * The public v1 API lets a resort's own website create bookings with an API
 * key. There is no human behind the request, and the key must not be able to
 * reach past the resort it belongs to.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { apiKeyClaims } from "../../src/common/rbac";
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

describe("bookings created through an API key", () => {
  it("creates the booking without inventing a user to blame", async () => {
    const bookings = makeBookingsService(asPrismaService);

    const created = await bookings.create(apiKeyClaims(fx.resortId), {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      checkIn: "2026-08-15",
      checkOut: "2026-08-17",
      adults: 2,
      children: 0,
      guest: { fullName: "Website Guest", phone: "8801722222222" },
      source: "APP",
    });

    expect(created.code).toMatch(/^BK-\d{5}$/);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.createdById).toBeNull();
    expect(row.resortId).toBe(fx.resortId);
  });

  it("holds the nights, so the website cannot double-book a room", async () => {
    const bookings = makeBookingsService(asPrismaService);
    const input = {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      checkIn: "2026-08-15",
      checkOut: "2026-08-17",
      adults: 2,
      children: 0,
      guest: { fullName: "Website Guest", phone: "8801722222222" },
      source: "APP" as const,
    };
    await bookings.create(apiKeyClaims(fx.resortId), input);

    await expect(bookings.create(apiKeyClaims(fx.resortId), input)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("is scoped to its own resort, not granted platform-wide access", async () => {
    const claims = apiKeyClaims(fx.resortId);
    expect(claims.role).not.toBe(ROLE.SUPER_ADMIN);
    expect(claims.resortIds).toEqual([fx.resortId]);
  });

  it("cannot touch another resort even when asked to", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    const bookings = makeBookingsService(asPrismaService);

    await expect(
      bookings.create(apiKeyClaims(fx.resortId), {
        resortId: other.resortId,
        roomIds: [other.rooms[0]!.id],
        checkIn: "2026-08-15",
        checkOut: "2026-08-17",
        adults: 2,
        children: 0,
        guest: { fullName: "Cross Tenant", phone: "8801733333333" },
        source: "APP",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
