/**
 * "New booking" said when the stay was in the server's clock, not in words.
 *
 * The body put two `Date` objects straight into a template string, so they
 * came out as `Tue Sep 15 2026 02:00:00 GMT+0200 (Central European Summer
 * Time)` — the production server's timezone, on a resort in Bangladesh, for a
 * stay that has no time of day at all. A stay's dates are days.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
let fx: Fixture;
let desk: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

it("names the stay's days, with no clock and no timezone", async () => {
  const b = await makeBookingsService(prisma as unknown as PrismaService).create(desk, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn: "2026-09-15",
    checkOut: "2026-09-17",
    adults: 2,
    children: 0,
    guest: { fullName: "Mia Castellio", phone: "8801711000999" },
  });

  const n = await prisma.notification.findFirstOrThrow({ where: { link: `/bookings?id=${b.id}` } });

  expect(n.body).not.toMatch(/GMT|UTC|\d\d:\d\d/);
  expect(n.body).toContain("15 Sep 2026 → 17 Sep 2026");
});
