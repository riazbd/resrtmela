/**
 * What the out-of-service rooms cost the owner, in taka.
 *
 * Sky Eco has three of ten rooms idle, one blocked for a full year, and the
 * workbook never puts a number on it. This is the cheapest persuasive thing
 * the product can say to an owner, and it is computable from data we hold.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ReportsService } from "../../src/reports/reports.service";
import { PermissionsService } from "../../src/common/permissions";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const reports = () => makeReportsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A third room, parked out of service. */
async function addIdleRoom(name = "103") {
  return prisma.room.create({
    data: {
      resortId: fx.resortId,
      roomTypeId: fx.roomTypeId,
      name,
      baseRate: 5000,
      status: "OUT_OF_SERVICE",
    },
  });
}

describe("idle inventory", () => {
  it("reports nothing owed when every room is sellable", async () => {
    const idle = await reports().idleInventory(claims, fx.resortId, "2026-08-01", "2026-08-11");

    expect(idle.outOfServiceRooms).toHaveLength(0);
    expect(idle.foregonePerYear).toBe(0);
  });

  it("prices an idle room at what the sellable rooms actually earn", async () => {
    await addIdleRoom();
    // one 5-night stay at 5000 with no discount, across 2 sellable rooms x 10 days
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-01",
      checkOut: "2026-08-06",
      unitPrice: 5000,
    });

    const idle = await reports().idleInventory(claims, fx.resortId, "2026-08-01", "2026-08-11");

    expect(idle.outOfServiceRooms.map((r) => r.name)).toEqual(["103"]);
    expect(idle.sellableRooms).toBe(2);
    expect(idle.netAdr).toBe(5000);
    expect(idle.occupancyPct).toBe(25); // 5 sold nights of 2 rooms x 10 days
    // one idle room, a year, at 25% occupancy and 5000 a night
    expect(idle.foregonePerYear).toBe(Math.round(1 * 365 * 5000 * 0.25));
    expect(idle.foregoneInRange).toBe(Math.round(1 * 10 * 5000 * 0.25));
  });

  it("prices the room net of discounts, not at rack rate", async () => {
    await addIdleRoom();
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-01",
      checkOut: "2026-08-06",
      unitPrice: 5000,
      discount: 5000, // 25000 billed, 20000 net -> 4000 a night
    });

    const idle = await reports().idleInventory(claims, fx.resortId, "2026-08-01", "2026-08-11");

    expect(idle.netAdr).toBe(4000);
  });

  it("counts every idle room", async () => {
    await addIdleRoom("103");
    await addIdleRoom("104");
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-08-01",
      checkOut: "2026-08-06",
      unitPrice: 5000,
    });

    const idle = await reports().idleInventory(claims, fx.resortId, "2026-08-01", "2026-08-11");

    expect(idle.outOfServiceRooms).toHaveLength(2);
    expect(idle.foregonePerYear).toBe(Math.round(2 * 365 * 5000 * 0.25));
  });

  it("says nothing rather than guessing when nothing has been sold yet", async () => {
    await addIdleRoom();

    const idle = await reports().idleInventory(claims, fx.resortId, "2026-08-01", "2026-08-11");

    expect(idle.netAdr).toBe(0);
    expect(idle.foregonePerYear).toBe(0);
  });
});
