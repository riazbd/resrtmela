/**
 * What an "agent" actually is, and where the model does not hold.
 *
 * An agent here is a travel agent: a third party who sells a resort's rooms,
 * earns commission on what they sell, holds a wallet, and is not staff of the
 * resort. An agency has people working under it — the requirement calls this
 * "User and Roles" on the agent side.
 *
 * But there is no agency in the data model. There are only individual users
 * with role AGENT, and "my staff" is inferred from "shares a resort with me".
 * Two agencies selling the same resort — which is the normal case, not the
 * unusual one — therefore see each other.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** An independent agency selling the same resort. */
async function agencyAt(resortId: number, name: string) {
  const user = await prisma.user.create({
    data: {
      name,
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
      role: "AGENT",
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId, commissionRate: 10 } });
  const claims: JwtClaims = { userId: user.id, role: ROLE.AGENT, resortIds: [resortId] };
  return { user, claims };
}

describe("two agencies at one resort", () => {
  it("does not show one agency the other agency's people", async () => {
    const dhaka = await agencyAt(fx.resortId, "Dhaka Travels");
    const chittagong = await agencyAt(fx.resortId, "Chittagong Tours");

    // each hires one person of their own
    await platform().createAgentStaff(dhaka.claims, {
      name: "Dhaka Staff",
      email: "dhaka.staff@example.com",
      password: "password123",
    });
    await platform().createAgentStaff(chittagong.claims, {
      name: "Chittagong Staff",
      email: "ctg.staff@example.com",
      password: "password123",
    });

    const dhakaSeesNames = (await platform().agentStaffList(dhaka.claims)).map((s) => s.name);

    expect(dhakaSeesNames).toContain("Dhaka Staff");
    // a competitor's staff — with their phone and email — must not be in this list
    expect(dhakaSeesNames).not.toContain("Chittagong Tours");
    expect(dhakaSeesNames).not.toContain("Chittagong Staff");
  });
});
