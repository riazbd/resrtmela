/**
 * One commission rate, set by the resort.
 *
 * Commission was a per-agent term: `UserResort.commissionRate` and
 * `commissionKind`, typed in when the agent was created and edited per person
 * afterwards. Two agents selling the same room could earn different money on
 * it, and nobody in the console could see the spread — there was no screen
 * that listed the rates side by side, only a field buried in each agent's row.
 *
 * The owner's instruction is that the rate is the resort's, not the person's:
 * one number, set by hand, that every agent sells on. That is also the simpler
 * thing to answer questions about — "what do we pay agents" now has an answer
 * instead of a query.
 *
 * The old per-agent columns are not read for pricing any more. They are left
 * in place holding what each agent used to be on, because deleting the record
 * of a commercial term is not this change's business.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeCommissionService, makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

async function withPermissions(permissions: string[]): Promise<JwtClaims> {
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Scoped User",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      email: `8809${Math.floor(Math.random() * 1e8)}@example.com`,
      role: ROLE.FRONT_DESK,
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId: role.id } });
  return { userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
}

/** A second agent, deliberately carrying a different legacy per-agent rate. */
async function secondAgent(legacyRate: number): Promise<number> {
  const user = await prisma.user.create({
    data: {
      name: "Other Agent",
      phone: `8803${Math.floor(Math.random() * 1e8)}`,
      email: `8803${Math.floor(Math.random() * 1e8)}@example.com`,
      role: ROLE.AGENT,
      status: "active",
    },
  });
  await prisma.userResort.create({
    data: { userId: user.id, resortId: fx.resortId, commissionRate: legacyRate as never, commissionKind: "PERCENT" },
  });
  return user.id;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the resort sets the rate", () => {
  it("pays every agent the same, whatever their old per-agent rate said", async () => {
    // the fixture's agent is on a legacy 10%; this one on 25%
    const other = await secondAgent(25);
    const commission = makeCommissionService(asPrisma);
    await commission.setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 12 });

    const a = await commission.termsFor(fx.resortId);
    const earnedByFixtureAgent = await commission.on(fx.resortId, 10_000);
    const earnedByOther = await commission.on(fx.resortId, 10_000);

    expect(a.rate).toBe(12);
    expect(earnedByFixtureAgent).toBe(1200);
    expect(earnedByOther).toBe(1200);
    expect(other).toBeGreaterThan(0);
  });

  it("changes what every agent earns when the owner changes it", async () => {
    const commission = makeCommissionService(asPrisma);
    await commission.setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 10 });
    expect(await commission.on(fx.resortId, 10_000)).toBe(1000);

    await commission.setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 15 });

    expect(await commission.on(fx.resortId, 10_000)).toBe(1500);
  });

  it("pays a fixed fee per booking when the resort's terms are flat", async () => {
    const commission = makeCommissionService(asPrisma);
    await commission.setTerms(owner, fx.resortId, { kind: "FLAT", rate: 800 });

    expect(await commission.on(fx.resortId, 10_000, 1)).toBe(800);
    expect(await commission.on(fx.resortId, 30_000, 3)).toBe(2400);
  });

  it("never pays more commission than there is rent", async () => {
    const commission = makeCommissionService(asPrisma);
    await commission.setTerms(owner, fx.resortId, { kind: "FLAT", rate: 5000 });

    expect(await commission.on(fx.resortId, 1200, 1)).toBe(1200);
  });

  it("starts every resort somewhere rather than at zero", async () => {
    const terms = await makeCommissionService(asPrisma).termsFor(fx.resortId);

    expect(terms.kind).toBe("PERCENT");
    expect(terms.rate).toBeGreaterThan(0);
  });
});

describe("who may set it", () => {
  it("refuses someone who may not manage agents", async () => {
    const clerk = await withPermissions(["agents.view"]);

    await expect(
      makeCommissionService(asPrisma).setTerms(clerk, fx.resortId, { kind: "PERCENT", rate: 10 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a resort that is not theirs", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);

    await expect(
      makeCommissionService(asPrisma).setTerms(owner, other.resortId, { kind: "PERCENT", rate: 10 }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a share of the rent larger than the rent", async () => {
    await expect(
      makeCommissionService(asPrisma).setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 120 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a negative rate", async () => {
    await expect(
      makeCommissionService(asPrisma).setTerms(owner, fx.resortId, { kind: "FLAT", rate: -50 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("records the change, because it is a commercial term", async () => {
    await makeCommissionService(asPrisma).setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 9 });

    const logged = await prisma.auditLog.findFirst({
      where: { resortId: fx.resortId, action: "resort.commission.set" },
    });
    expect(logged).not.toBeNull();
  });
});

describe("one rule, not three", () => {
  it("the owner's agent report reads the resort's rate, not the agent's row", async () => {
    await makeCommissionService(asPrisma).setTerms(owner, fx.resortId, { kind: "PERCENT", rate: 20 });
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-11-01", checkOut: "2026-11-03", unitPrice: 5000,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { agentUserId: fx.agentId, state: "CHECKED_OUT" },
    });

    const report = await makeReportsService(asPrisma).agents(owner, fx.resortId, "2026-11-01", "2026-11-30");

    const agent = report.rows.find((r) => r.agentId === fx.agentId)!;
    // 10,000 rent at the resort's 20%, not the fixture agent's legacy 10%
    expect(agent.commissionRate).toBe(20);
    expect(agent.commission).toBe(2000);
  });
});
