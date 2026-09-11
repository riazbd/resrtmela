/**
 * The month, as an agency sees it.
 *
 * An agent planning a group needs the shape of the month — which nights are
 * gone, where the gaps are, which of the taken nights are their own so they can
 * move a client instead of turning them away. What they must not get with it is
 * the resort's customer list: the agency down the road sells the same rooms.
 *
 * So the same calendar answers two different questions depending on who is
 * asking, and this file pins down both halves — that the occupancy is honest,
 * and that the identity is not there.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeCalendarService, makePlatformService, makeAgentService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;

const cal = () => makeCalendarService(asPrismaService);
const RANGE = { from: "2026-10-01", to: "2026-10-31" };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A stay sold by someone else — the resort's own desk, or a rival agency. */
async function otherStay(state?: "CANCELLED") {
  return seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-10-05",
    checkOut: "2026-10-08",
    ...(state ? { state } : {}),
  });
}

/** A stay this agency sold. */
async function ourStay() {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId: fx.rooms[1]!.id,
    checkIn: "2026-10-12",
    checkOut: "2026-10-14",
  });
  await prisma.booking.update({ where: { id: b.id }, data: { agentUserId: fx.agentId } });
  return b;
}

describe("the agency calendar", () => {
  it("shows every room the resort has, so a gap is visible as a gap", async () => {
    const out = await cal().calendar(agency, RANGE);
    expect(out.resorts).toHaveLength(1);
    expect(out.resorts[0]!.rooms.map((r) => r.name).sort()).toEqual(["101", "102"]);
  });

  it("shows another party's stay as occupied, with no name and no code", async () => {
    await otherStay();
    const [resort] = (await cal().calendar(agency, RANGE)).resorts;
    expect(resort!.stays).toHaveLength(1);
    const stay = resort!.stays[0]!;
    expect(stay.roomId).toBe(fx.rooms[0]!.id);
    expect(stay.mine).toBe(false);
    expect(stay.guestName).toBeNull();
    expect(stay.code).toBeNull();
  });

  it("names the guest on the agency's own stay", async () => {
    const mine = await ourStay();
    const [resort] = (await cal().calendar(agency, RANGE)).resorts;
    const stay = resort!.stays.find((s) => s.mine);
    expect(stay).toBeTruthy();
    expect(stay!.guestName).toBe("Test Guest");
    expect(stay!.code).toBe(mine.code);
  });

  it("names other guests too once the resort turns the switch on", async () => {
    await otherStay();
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { showGuestNamesToAgents: true },
    });
    const [resort] = (await cal().calendar(agency, RANGE)).resorts;
    expect(resort!.stays[0]!.guestName).toBe("Test Guest");
    expect(resort!.stays[0]!.mine).toBe(false);
  });

  it("leaves a cancelled stay off, because that room is free again", async () => {
    await otherStay("CANCELLED");
    const [resort] = (await cal().calendar(agency, RANGE)).resorts;
    expect(resort!.stays).toHaveLength(0);
  });

  it("refuses a range longer than a quarter", async () => {
    await expect(
      cal().calendar(agency, { from: "2026-01-01", to: "2027-01-01" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * The resort's own calendar is a working screen: a stay opens from it, the
   * colour says what state it is in, a red stripe says money is owed, and a
   * room under maintenance is drawn as unavailable rather than deleted. An
   * agency was given a read-only picture of the same month, so everything it
   * is entitled to act on — its own bookings — it could only look at.
   *
   * The line stays where it was: this is about the agency's own stays. Nothing
   * here reaches another agency's money or hands over a way to open its
   * booking.
   */
  describe("what an agency may do with its own nights", () => {
    it("carries the booking id on its own stay, so the bar opens it", async () => {
      const mine = await ourStay();
      const [resort] = (await cal().calendar(agency, RANGE)).resorts;
      const stay = resort!.stays.find((s) => s.mine)!;
      expect(stay.bookingId).toBe(mine.id);
    });

    it("carries what is still owed on its own stay", async () => {
      await ourStay();
      const [resort] = (await cal().calendar(agency, RANGE)).resorts;
      const stay = resort!.stays.find((s) => s.mine)!;
      expect(stay.paymentState).toBe("UNPAID");
    });

    it("gives neither the id nor the money state for somebody else's stay", async () => {
      await otherStay();
      await prisma.resort.update({
        where: { id: fx.resortId },
        // even with names on, the handle and the money stay behind the line
        data: { showGuestNamesToAgents: true },
      });
      const [resort] = (await cal().calendar(agency, RANGE)).resorts;
      const stay = resort!.stays.find((s) => !s.mine)!;
      expect(stay.bookingId).toBeNull();
      expect(stay.paymentState).toBeNull();
    });

    it("keeps a room that is out of service on the grid, and says so", async () => {
      await prisma.room.update({
        where: { id: fx.rooms[1]!.id },
        data: { status: "OUT_OF_SERVICE" },
      });
      const [resort] = (await cal().calendar(agency, RANGE)).resorts;
      const room = resort!.rooms.find((r) => r.id === fx.rooms[1]!.id);
      expect(room, "an unsellable room is not a missing room").toBeTruthy();
      expect(room!.status).toBe("OUT_OF_SERVICE");
    });

    it("shows the room's rate only where the resort shares its rates", async () => {
      await prisma.resort.update({
        where: { id: fx.resortId },
        data: { showRatesToAgents: true },
      });
      const shown = (await cal().calendar(agency, RANGE)).resorts[0]!;
      expect(shown.rooms[0]!.baseRate).toBe(5000);

      await prisma.resort.update({
        where: { id: fx.resortId },
        data: { showRatesToAgents: false },
      });
      const hidden = (await cal().calendar(agency, RANGE)).resorts[0]!;
      expect(hidden.rooms[0]!.baseRate).toBeNull();
    });
  });

  it("refuses anyone who is not an agent", async () => {
    const manager: JwtClaims = {
      userId: fx.managerId,
      role: ROLE.RESORT_ADMIN,
      resortIds: [fx.resortId],
    };
    await expect(cal().calendar(manager, RANGE)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses agency staff who were not given the booking permission", async () => {
    const staff = await makePlatformService(asPrismaService).createAgentStaff(agency, {
      name: "Books Only",
      email: "booksonly@example.com",
      phone: `8801${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      password: "password123",
    });
    const role = await makeAgentService(asPrismaService).createRole(agency, {
      name: "Books only",
      permissions: ["agent.expenses.manage"],
    });
    await makeAgentService(asPrismaService).assignRole(agency, staff.id, role.id);
    const claims: JwtClaims = { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] };
    await expect(cal().calendar(claims, RANGE)).rejects.toMatchObject({ status: 403 });
  });
});
