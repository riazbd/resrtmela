/**
 * A booking names its agent in words (2026-09-28).
 *
 * `GET /bookings/:id` sent `agent: { id, name }`. `BookingDetail` inherits
 * `agent: string | null` from `BookingRow`, and every other route that
 * mentions an agent — the list, the day sheet, the invoice — sends the name.
 * So the description was right, four routes agreed with it, and one did not.
 *
 * Nothing caught it because nothing could: the service returns a plain object
 * and the client asserts the type onto the response. A cast is an assertion,
 * not a check. What found it was opening the screen — the app's booking
 * screen prints `Sold by {b.agent}`, React refuses an object as a child, and
 * the screen went white.
 *
 * It went white for agency bookings only. A resort's own booking has no
 * agent, so the line is not drawn and the bug is invisible — and the screen
 * an agent is sent to the moment they take a booking is exactly this one, so
 * the app's entire selling flow ended on a blank screen while the desk's did
 * not.
 *
 * This is the same shape as the note on `BookingDetail` itself, where the
 * type claimed `rooms: string[]` that the detail route has never sent. Two
 * routes describing one field two ways is the defect; the pair of them
 * agreeing is the test.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
const db = () => prisma as unknown as PrismaClient;
const bookings = () => makeBookingsService(asPrismaService);

let fx: Fixture;
let agent: JwtClaims;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A stay an agency sold, which is the only kind that has an agent at all. */
const soldByTheAgency = () =>
  bookings().create(agent, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn: "2026-11-01",
    checkOut: "2026-11-03",
    adults: 2,
    children: 0,
    guest: { fullName: "Agency Guest", phone: "8801711000222" },
  });

describe("the booking an agency sold", () => {
  it("names its agent as a string, never as a row", async () => {
    const made = await soldByTheAgency();
    const detail = await bookings().detail(agent, made.id);

    expect(typeof detail.agent).toBe("string");
    expect(detail.agent).toBe("Test Agent");
  });

  it("says the same thing on the list as it does on the booking", async () => {
    const made = await soldByTheAgency();

    const [detail, list] = await Promise.all([
      bookings().detail(agent, made.id),
      bookings().list(agent, { resortId: fx.resortId }),
    ]);
    const row = list.rows.find((r) => r.id === made.id);

    expect(row).toBeTruthy();
    expect(row!.agent).toBe(detail.agent);
  });

  it("reads the same to the resort, which is who the name is for", async () => {
    const made = await soldByTheAgency();
    const detail = await bookings().detail(manager, made.id);

    expect(detail.agent).toBe("Test Agent");
  });
});

describe("the booking the resort sold itself", () => {
  it("has no agent rather than an empty one", async () => {
    const own = await seedBooking(db(), fx, { checkIn: "2026-12-01", checkOut: "2026-12-02" });
    const detail = await bookings().detail(manager, own.id);

    expect(detail.agent).toBeNull();
  });
});
