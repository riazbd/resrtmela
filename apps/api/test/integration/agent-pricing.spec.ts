/**
 * What an agent charges and what an agent pays.
 *
 * An agent sells a room at the resort's price and keeps a commission, so two
 * numbers matter to them on every screen: the **actual** price the guest pays,
 * and their **own** price — what they will owe the resort once the commission
 * is taken off. The console showed only the first, and the commission appeared
 * separately in a report at the end of the month, which is no use at the
 * moment of quoting a guest.
 *
 * Both numbers are now on the booking and on the availability grid, computed
 * from the same commission terms the owner's own report uses.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import { AvailabilityService } from "../../src/bookings/availability.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agent: JwtClaims;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  // the seed puts the agent on 10% commission; rates are visible to agents here
  await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: true } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function agentBooking() {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-04-01",
    checkOut: "2026-04-03",
    unitPrice: 5000,
  });
  await prisma.booking.update({ where: { id: b.id }, data: { agentUserId: fx.agentId, source: "AGENT" } });
  return b;
}

describe("both prices on a booking", () => {
  it("shows the agent what the guest pays and what they will owe the resort", async () => {
    const b = await agentBooking();

    const detail = await makeBookingsService(asPrismaService).detail(agent, b.id);

    // 5,000 x 2 nights = 10,000 actual; 10% commission = 1,000; agent owes 9,000
    expect(detail.agentPricing).toEqual({
      actual: 10000,
      commissionKind: "PERCENT",
      commissionRate: 10,
      commission: 1000,
      agentPrice: 9000,
    });
  });

  it("works the same for a flat fee per booking", async () => {
    await prisma.userResort.update({
      where: { userId_resortId: { userId: fx.agentId, resortId: fx.resortId } },
      data: { commissionKind: "FLAT", commissionRate: 1200 },
    });
    const b = await agentBooking();

    const detail = await makeBookingsService(asPrismaService).detail(agent, b.id);

    expect(detail.agentPricing).toMatchObject({ actual: 10000, commission: 1200, agentPrice: 8800 });
  });

  it("says nothing about agent pricing to the resort's own staff", async () => {
    const b = await agentBooking();

    const detail = await makeBookingsService(asPrismaService).detail(manager, b.id);

    expect(detail.agentPricing).toBeNull();
  });

  it("never quotes an agent price when the resort hides its rates", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: false } });
    const b = await agentBooking();

    const detail = await makeBookingsService(asPrismaService).detail(agent, b.id);

    expect(detail.agentPricing).toBeNull();
  });
});

describe("both prices while choosing a room", () => {
  it("puts the agent's own rate beside the published one", async () => {
    const grid = await new AvailabilityService(asPrismaService).roomsGrid(
      agent,
      fx.resortId,
      "2026-04-01",
      "2026-04-03",
    );

    const room = grid.find((r) => r.roomId === fx.rooms[0]!.id)!;
    expect(room.baseRate).toBe(5000);
    expect(room.agentRate).toBe(4500); // less 10%
  });

  it("shows the resort's own staff one rate, because there is only one", async () => {
    const grid = await new AvailabilityService(asPrismaService).roomsGrid(
      manager,
      fx.resortId,
      "2026-04-01",
      "2026-04-03",
    );

    expect(grid[0]!.agentRate).toBeUndefined();
  });
});
