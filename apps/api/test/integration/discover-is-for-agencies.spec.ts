/**
 * The agency directory is for agencies.
 *
 * Found by the whole-surface sweep, which is the point of having one: nothing
 * else was looking at this route, and it is the only `/agent/*` endpoint that
 * answered a resort's manager.
 *
 * The cause is a refusal that is returned rather than thrown. `agencyOf` hands
 * back `{ accountId: null, refusal: "Agents only" }` for somebody who is not an
 * agent at all, and `discoverResorts` reads any refusal as "an agency that
 * cannot sell *yet*" — which is a real and deliberate state: an unverified
 * agency may look around while it waits. A non-agent inherited that
 * affordance silently.
 *
 * What it hands over is a competitor's shopfront: every resort open to
 * agencies, with its location, how many rooms it has, and the lowest rate it
 * sells one at. A resort owner reading the starting price of every resort that
 * courts agencies is not a directory, it is a price list.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeEngageService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const engage = () => makeEngageService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.resort.update({ where: { id: fx.resortId }, data: { agentsOpen: true } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("who may read the list of resorts open to agencies", () => {
  it("refuses a resort's manager", async () => {
    const manager: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
    await expect(engage().discoverResorts(manager)).rejects.toThrow();
  });

  it("refuses the platform's own account too, which has no agency to look for", async () => {
    const superAdmin: JwtClaims = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
    await expect(engage().discoverResorts(superAdmin)).rejects.toThrow();
  });

  it("still shows an agency the resorts it may sell", async () => {
    const agent: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
    const rows = await engage().discoverResorts(agent);
    expect(rows.map((r) => r.id)).toContain(fx.resortId);
  });

  /**
   * The state the "may look, not sell" branch was actually built for, and which
   * must survive the fix: an agency waiting on the platform's verification sees
   * the list and is told why it cannot sell.
   */
  it("still shows an unverified agency the list, marked as waiting", async () => {
    await prisma.tenant.update({ where: { id: fx.agencyId }, data: { status: "pending" } });
    const agent: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };

    const rows = await engage().discoverResorts(agent);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.access).toBe("WAITING");
  });
});
