/**
 * The team is the resort's — its staff, and nobody else.
 *
 * `resortUsers` returned every `user_resorts` row for the resort, and two kinds
 * of account that do not work there had rows: the platform owner, because a
 * super admin got an active resort by being linked to one, and every agency the
 * resort had approved, because that table was the only place the login token
 * read access from. So the owner of Sky Eco opened Settings → Team and found
 * "Platform Owner" and a travel agency among their own people, each with a role
 * they did not grant. The fix was a role exclusion in the query, then a second.
 *
 * Neither is linked now (2026-09-11 design, §8.3): an agency's selling access is
 * computed on the request, and the platform owner passes every resort without a
 * row. The phase-5 gate: the team list is staff by construction, and its query
 * excludes no role.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeAvailabilityService, makePlatformService } from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const platform = () => makePlatformService(asPrisma);
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the resort's team list", () => {
  it("holds the resort's own people, and not the agency that sells it", async () => {
    // the agency really does sell here — and still is not on the team
    await expect(
      makeAvailabilityService(asPrisma).roomsGrid({ userId: fx.agentId, role: ROLE.AGENT, resortIds: [] }, fx.resortId, today(), tomorrow()),
    ).resolves.toHaveLength(2);

    const team = await platform().resortUsers(owner, fx.resortId);

    expect(team.map((u) => u.id)).toEqual([fx.managerId]);
  });

  it("is every account linked to the resort — nothing is filtered out of it", async () => {
    const linked = await prisma.userResort.count({ where: { resortId: fx.resortId } });

    expect((await platform().resortUsers(owner, fx.resortId)).length).toBe(linked);
  });
});

describe("the platform owner", () => {
  it("gets every resort to work in without being linked to any", async () => {
    const platformOwner = await prisma.user.create({
      data: { name: "Platform Owner", phone: `88017${Math.floor(Math.random() * 1e6)}`, email: `owner-${Date.now()}@example.com`, role: "SUPER_ADMIN" },
    });
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);

    const me = (await new AuthService(asPrisma).me(platformOwner.id)) as { resorts: { resort: { id: number } }[] };

    expect(me.resorts.map((r) => r.resort.id)).toEqual([fx.resortId, elsewhere.resortId]);
    expect(await prisma.userResort.count({ where: { userId: platformOwner.id } })).toBe(0);
    expect((await platform().resortUsers(owner, fx.resortId)).map((u) => u.id)).not.toContain(platformOwner.id);
  });
});
