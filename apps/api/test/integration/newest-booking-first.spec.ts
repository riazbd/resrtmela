/**
 * A booking list can be read in more than one order (2026-09-19).
 *
 * It had exactly one, fixed: check-in descending. So a booking taken this
 * morning for next March sat wherever March falls, and the desk's ordinary
 * question — "what did we just take?" — had no answer on the screen that
 * exists to answer it.
 *
 * The default is now what was booked most recently. The rest are named in
 * `@rh/shared`, so an option the console offers is one the API accepts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, BOOKING_SORTS, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";

const prisma = testPrisma();
let fx: Fixture;
let svc: ReturnType<typeof makeBookingsService>;

const admin = (): JwtClaims => ({ userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] });

/**
 * Three bookings whose three orders all disagree, which is the only way to
 * tell one ordering from another:
 *
 *   booked      check-in     code
 *   A oldest    latest       lowest
 *   B middle    earliest     middle
 *   C newest    middle       highest
 */
async function threeThatDisagree() {
  const mk = async (code: string, createdAt: string, checkIn: string, checkOut: string) => {
    const b = await prisma.booking.create({
      data: {
        resortId: fx.resortId,
        code,
        guestId: fx.guestId,
        state: "CONFIRMED",
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        adults: 2,
        children: 0,
        createdById: fx.managerId,
      },
    });
    // `createdAt` is @default(now()); set it after the fact so the three differ
    await prisma.booking.update({ where: { id: b.id }, data: { createdAt: new Date(createdAt) } });
    return b;
  };
  await mk("BK-00001", "2026-01-01T09:00:00Z", "2026-06-20", "2026-06-22");
  await mk("BK-00002", "2026-02-01T09:00:00Z", "2026-04-10", "2026-04-12");
  await mk("BK-00003", "2026-03-01T09:00:00Z", "2026-05-15", "2026-05-16");
}

const codes = async (sort?: string) =>
  (await svc.list(admin(), { resortId: fx.resortId, sort })).rows.map((r) => r.code);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  svc = makeBookingsService(prisma);
  await prisma.booking.deleteMany({ where: { resortId: fx.resortId } });
  await threeThatDisagree();
});

afterAll(async () => prisma.$disconnect());

describe("what a booking list shows when nobody has chosen", () => {
  it("is what was booked most recently", async () => {
    expect(await codes()).toEqual(["BK-00003", "BK-00002", "BK-00001"]);
  });

  it("is the same for a bookmark from before the orders existed", async () => {
    expect(await codes(undefined)).toEqual(await codes("newest"));
  });
});

describe("the orders a person can choose", () => {
  it("reads oldest first when asked", async () => {
    expect(await codes("oldest")).toEqual(["BK-00001", "BK-00002", "BK-00003"]);
  });

  it("reads by check-in, soonest first — and it is not the booked order", async () => {
    expect(await codes("checkin")).toEqual(["BK-00002", "BK-00003", "BK-00001"]);
  });

  it("reads by check-in, furthest away first", async () => {
    expect(await codes("checkin-last")).toEqual(["BK-00001", "BK-00003", "BK-00002"]);
  });

  it("reads by check-out, soonest first", async () => {
    expect(await codes("checkout")).toEqual(["BK-00002", "BK-00003", "BK-00001"]);
  });

  it("reads by booking number, both ways", async () => {
    expect(await codes("code")).toEqual(["BK-00001", "BK-00002", "BK-00003"]);
    expect(await codes("code-desc")).toEqual(["BK-00003", "BK-00002", "BK-00001"]);
  });

  /**
   * A stale bookmark or a hand-typed URL. A list that refuses to draw teaches
   * nobody anything; it draws in the order it would have anyway.
   */
  it("ignores an order it does not have, rather than failing", async () => {
    expect(await codes("by-guest-favourite-colour")).toEqual(await codes());
  });

  it("offers nothing the API cannot answer", async () => {
    for (const s of BOOKING_SORTS) {
      await expect(codes(s.key)).resolves.toHaveLength(3);
    }
  });
});
