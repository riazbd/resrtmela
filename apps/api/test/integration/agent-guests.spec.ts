/**
 * The agency's guest list, and finding a room by date.
 *
 * Two things an agency asked for that the platform could not do.
 *
 * **Who have we served?** The agency's own clients, across every resort it
 * sells and every person on its team — not one agent's private list. An agency
 * that cannot answer this cannot call last year's customers.
 *
 * **What is free that week?** An agent quoting a client is asked "do you have
 * anything for the 12th to the 14th", and the answer has to span every resort
 * they sell. Before this they had to open each resort in turn and read a grid.
 *
 * Along the way this file pins down a defect the agent portal left behind: a
 * booking list scoped to the person rather than the agency, so an agency owner
 * could not see what their own staff had booked.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import {
  makePlatformService,
  makeAgentService,
  makeGuestsService,
  makeBookingsService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;

const guests = () => makeGuestsService(asPrismaService);
const agents = () => makeAgentService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: true } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hire(name: string, permissions: string[]) {
  const staff = await platform().createAgentStaff(agency, {
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    password: "password123",
  });
  const role = await agents().createRole(agency, { name: `${name} role`, permissions });
  await agents().assignRole(agency, staff.id, role.id);
  return { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] } as JwtClaims;
}

/** A stay the agency sold, optionally through one of its staff. */
async function soldStay(opts: {
  checkIn: string;
  checkOut: string;
  by?: number;
  guestId?: number;
  unitPrice?: number;
}) {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: opts.checkIn,
    checkOut: opts.checkOut,
    unitPrice: opts.unitPrice ?? 5000,
  });
  await prisma.booking.update({
    where: { id: b.id },
    data: {
      agentUserId: opts.by ?? fx.agentId,
      source: "AGENT",
      ...(opts.guestId ? { guestId: opts.guestId } : {}),
    },
  });
  return b;
}

async function anotherGuest(name: string, phone: string) {
  return prisma.guest.create({
    data: {
      resortId: fx.resortId,
      fullName: name,
      phone,
      phoneKey: `key-${phone}`,
      email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    },
  });
}

describe("everyone the agency has served", () => {
  it("counts the stays and the money, per guest", async () => {
    await soldStay({ checkIn: "2026-04-01", checkOut: "2026-04-03" });
    await soldStay({ checkIn: "2026-06-01", checkOut: "2026-06-02" });

    const list = await guests().list(agency, {});

    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({
      id: fx.guestId,
      fullName: "Test Guest",
      bookings: 2,
      nights: 3,
      // 5,000 × 2 nights + 5,000 × 1 night
      spend: 15000,
      lastStay: "2026-06-01",
    });
  });

  it("includes what the agency's staff sold, not just the owner", async () => {
    const junior = await hire("Junior", ["agent.book"]);
    const theirs = await anotherGuest("Nusrat Jahan", "8801799999999");
    await soldStay({ checkIn: "2026-05-01", checkOut: "2026-05-02", by: junior.userId, guestId: theirs.id });

    const list = await guests().list(agency, {});

    expect(list.rows.map((r) => r.fullName)).toContain("Nusrat Jahan");
  });

  it("leaves out guests the resort booked itself", async () => {
    // a walk-in the resort took: no agent on it at all
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
    });

    expect((await guests().list(agency, {})).rows).toEqual([]);
  });

  it("leaves out another agency's guests", async () => {
    await soldStay({ checkIn: "2026-04-01", checkOut: "2026-04-03" });
    const other = await prisma.user.create({
      data: { name: "Other Agency", phone: `8815${Date.now() % 100000000}`, role: "AGENT" },
    });

    const theirs = await guests().list({ userId: other.id, role: ROLE.AGENT, resortIds: [] }, {});

    expect(theirs.rows).toEqual([]);
  });

  it("shows the agency the contact details of the client it brought in", async () => {
    await soldStay({ checkIn: "2026-04-01", checkOut: "2026-04-03" });

    const [row] = (await guests().list(agency, {})).rows;

    // masking a client's phone from the agency that introduced them is
    // theatre: they have it in their own phone already
    expect(row!.phone).toBe("8801711111111");
    expect(row!.email).toBe("guest@example.com");
  });

  it("finds a guest by name or by phone", async () => {
    const nusrat = await anotherGuest("Nusrat Jahan", "8801788888888");
    await soldStay({ checkIn: "2026-04-01", checkOut: "2026-04-03" });
    await soldStay({ checkIn: "2026-05-01", checkOut: "2026-05-02", guestId: nusrat.id });

    expect((await guests().list(agency, { q: "Nusrat" })).rows).toHaveLength(1);
    expect((await guests().list(agency, { q: "88888888" })).rows[0]!.fullName).toBe("Nusrat Jahan");
  });

  it("is closed to a junior without the permission", async () => {
    const junior = await hire("Junior2", ["agent.book"]);

    await expect(guests().list(junior, {})).rejects.toThrow(/agent\.guests\.view/);
  });
});

describe("finding a room by date", () => {
  it("lists what is free across every resort the agency sells", async () => {
    const free = await guests().rooms(agency, { from: "2026-07-01", to: "2026-07-03" });

    expect(free).toHaveLength(1);
    expect(free[0]!.resort.id).toBe(fx.resortId);
    expect(free[0]!.rooms.map((r) => r.roomName).sort()).toEqual(["101", "102"]);
  });

  it("drops a room that is busy for any night of the stay", async () => {
    await soldStay({ checkIn: "2026-07-02", checkOut: "2026-07-03" });

    const free = await guests().rooms(agency, { from: "2026-07-01", to: "2026-07-03" });

    expect(free[0]!.rooms.map((r) => r.roomName)).toEqual(["102"]);
  });

  it("quotes the agent's own price beside the published one", async () => {
    const free = await guests().rooms(agency, { from: "2026-07-01", to: "2026-07-03" });

    expect(free[0]!.rooms[0]).toMatchObject({ baseRate: 5000, agentRate: 4500 });
  });

  it("shows staff every resort the agency sells, not only the ones they were hired with", async () => {
    // an agency approved for a resort after someone was hired: the staff
    // member has no link of their own to it, but the agency does, and it is
    // the agency's approval that decides what may be sold
    const junior = await hire("Junior4", ["agent.book"]);
    const second = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Second Resort", location: "Sajek" },
    });
    const type = await prisma.roomType.create({
      data: { resortId: second.id, name: "Cottage", maxAdults: 2, maxChildren: 1 },
    });
    await prisma.room.create({
      data: { resortId: second.id, roomTypeId: type.id, name: "C1", baseRate: 4000 },
    });
    await prisma.userResort.create({
      data: { userId: fx.agentId, resortId: second.id, commissionRate: 10, commissionKind: "PERCENT" },
    });

    const free = await guests().rooms(junior, { from: "2026-07-01", to: "2026-07-03" });

    expect(free.map((r) => r.resort.name).sort()).toEqual(["Second Resort", "Test Resort"]);
  });

  it("refuses a stay that ends before it starts", async () => {
    await expect(guests().rooms(agency, { from: "2026-07-03", to: "2026-07-01" })).rejects.toThrow(
      /after/i,
    );
  });
});

describe("a booking list that belongs to the agency", () => {
  it("shows an owner what their own staff booked", async () => {
    const junior = await hire("Junior3", ["agent.book"]);
    await soldStay({ checkIn: "2026-08-01", checkOut: "2026-08-02", by: junior.userId });

    const list = await makeBookingsService(asPrismaService).list(agency, { resortId: fx.resortId });

    // the agency is the unit: the owner sees the agency's book of business,
    // not only the bookings they typed in themselves
    expect(list.rows).toHaveLength(1);
  });

  it("still shows an agency nothing of another agency's bookings", async () => {
    await soldStay({ checkIn: "2026-08-01", checkOut: "2026-08-02" });
    const other = await prisma.user.create({
      data: { name: "Other Agency 2", phone: `8816${Date.now() % 100000000}`, role: "AGENT" },
    });
    await prisma.userResort.create({ data: { userId: other.id, resortId: fx.resortId } });

    const list = await makeBookingsService(asPrismaService).list(
      { userId: other.id, role: ROLE.AGENT, resortIds: [fx.resortId] },
      { resortId: fx.resortId },
    );

    expect(list.rows).toEqual([]);
  });
});
