/**
 * An agent's own commission figure must match the one the resort owner sees.
 * Commission is either a percentage of rent or a flat fee per booking, set
 * by the resort (Resort.agentCommissionKind), one term for every agent.
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

const reports = () => makeReportsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Two agent bookings: 2 nights x 5000 and 1 night x 5000 -> 15000 rent. */
async function twoAgentBookings() {
  for (const [i, dates] of [["2026-08-15", "2026-08-17"], ["2026-08-20", "2026-08-21"]].entries()) {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: fx.rooms[i]!.id,
      checkIn: dates[0]!,
      checkOut: dates[1]!,
      unitPrice: 5000,
    });
    await prisma.booking.update({
      where: { id: b.id },
      data: { agentUserId: fx.agentId, source: "AGENT" },
    });
  }
}

describe("agent commission", () => {
  it("pays a flat fee per booking when the agent is on FLAT terms", async () => {
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { agentCommissionKind: "FLAT", agentCommissionRate: 500 },
    });
    await twoAgentBookings();

    const agentClaims: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
    const mine = await reports().myReport(agentClaims, fx.resortId);

    expect(mine.bookings).toBe(2);
    expect(mine.commission).toBe(1000); // 2 x 500, not a percentage of 15000
  });

  it("shows the agent the same commission the owner's report shows", async () => {
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { agentCommissionKind: "FLAT", agentCommissionRate: 500 },
    });
    await twoAgentBookings();

    const ownerClaims: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
    const agentClaims: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };

    const owner = await reports().agents(ownerClaims, fx.resortId);
    const mine = await reports().myReport(agentClaims, fx.resortId);

    expect(owner.rows.find((r) => r.agentId === fx.agentId)!.commission).toBe(mine.commission);
  });

  it("still pays a percentage of rent on PERCENT terms", async () => {
    // seeded as PERCENT at 10%
    await twoAgentBookings();

    const agentClaims: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
    const mine = await reports().myReport(agentClaims, fx.resortId);

    expect(mine.rent).toBe(15000);
    expect(mine.commission).toBe(1500);
  });
});
