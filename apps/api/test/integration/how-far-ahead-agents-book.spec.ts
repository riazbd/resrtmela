/**
 * How far ahead a resort lets its agents sell.
 *
 * A resort holds its best dates back — the Eid week, the December rush — and
 * sells them at the desk first. It had no way to say so: an agency could see
 * and take any night in the calendar, however far out.
 *
 * `agentBookingWindowDays` is that fence. Empty means no limit, which is how
 * every resort was before this existed. A number means an agency may book a
 * stay only when every night of it falls within that many days from today, in
 * the resort's own timezone. The resort's own desk is never fenced.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makeCalendarService, makeGuestsService, makeTenancyService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { AGENT_BOOKING_WINDOW_PRESETS, ROLE, type JwtClaims } from "@rh/shared";
import { todayIn } from "../../src/common/dates";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let desk: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);
const DAY = 86_400_000;
/** `n` days from today, in the fixture resort's timezone. */
const day = (n: number) => new Date(todayIn("Asia/Dhaka").getTime() + n * DAY).toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

const window = (days: number | null) =>
  prisma.resort.update({ where: { id: fx.resortId }, data: { agentBookingWindowDays: days } });

const book = (claims: JwtClaims, checkIn: string, checkOut: string) =>
  bookings().create(claims, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    guest: { fullName: "Far Ahead", phone: "8801755555555" },
  });

describe("the presets the settings screen offers", () => {
  it("are thirty, sixty and ninety days", () => {
    expect([...AGENT_BOOKING_WINDOW_PRESETS]).toEqual([30, 60, 90]);
  });
});

describe("the owner setting it", () => {
  it("sets a window and clears it again", async () => {
    const admin: JwtClaims = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [fx.resortId] };

    await makeTenancyService(asPrisma).updateResort(admin, fx.resortId, { agentBookingWindowDays: 45 });
    expect((await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).agentBookingWindowDays).toBe(45);

    await makeTenancyService(asPrisma).updateResort(admin, fx.resortId, { agentBookingWindowDays: null });
    expect((await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).agentBookingWindowDays).toBeNull();
  });
});

describe("with no window", () => {
  it("lets an agency book a year out, as before", async () => {
    await window(null);

    const b = await book(agency, day(365), day(367));

    expect(b.code).toBeTruthy();
  });
});

describe("with a thirty-day window", () => {
  beforeEach(() => window(30));

  it("lets an agency book inside it", async () => {
    const b = await book(agency, day(10), day(12));

    expect(b.code).toBeTruthy();
  });

  it("lets the last night be the window's last day", async () => {
    // nights 28 and 29; check-out on day 30
    const b = await book(agency, day(28), day(30));

    expect(b.code).toBeTruthy();
  });

  it("refuses a stay whose nights run past it, saying until when", async () => {
    await expect(book(agency, day(29), day(31))).rejects.toThrow(/30 days/);
  });

  it("refuses a stay entirely beyond it", async () => {
    await expect(book(agency, day(45), day(47))).rejects.toThrow(/30 days/);
  });

  it("refuses the quote too, so the form finds out before the guest's details are typed", async () => {
    await expect(
      bookings().quote(agency, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        checkIn: day(45),
        checkOut: day(47),
        adults: 2,
        children: 0,
      }),
    ).rejects.toThrow(/30 days/);
  });

  it("never fences the resort's own desk", async () => {
    const b = await book(desk, day(200), day(202));

    expect(b.code).toBeTruthy();
  });

  it("leaves the resort out of an agency's room search beyond it", async () => {
    const offers = await makeGuestsService(asPrisma).rooms(agency, { from: day(45), to: day(47) });

    expect(offers.find((o) => o.resort.id === fx.resortId)).toBeUndefined();
  });

  it("keeps the resort in the search inside it", async () => {
    const offers = await makeGuestsService(asPrisma).rooms(agency, { from: day(5), to: day(7) });

    expect(offers.find((o) => o.resort.id === fx.resortId)).toBeTruthy();
  });

  it("tells the agency calendar where the window ends", async () => {
    const cal = await makeCalendarService(asPrisma).calendar(agency, { from: day(0), to: day(60) });

    const resort = cal.resorts.find((r) => r.resort.id === fx.resortId)!;
    expect(resort.bookableUntil).toBe(day(30));
  });
});
