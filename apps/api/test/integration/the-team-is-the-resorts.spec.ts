/**
 * The platform is not a member of anybody's staff.
 *
 * `resortUsers` returned every `user_resorts` row for the resort, and the
 * platform owner's account is linked to a resort — that is how a super admin
 * gets an active resort at all. So the owner of Sky Eco opened Settings → Team
 * and found "Platform Owner" listed among their own people, with a role they
 * did not grant and a Remove button that would not have helped.
 *
 * Worse than untidy: the list is what the resort manages. Anything on it looks
 * like theirs to change.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const platform = () => makePlatformService(asPrisma);

/** A platform account linked to this resort, the way a real one is. */
async function aPlatformAdminInside(resortId: number) {
  const user = await prisma.user.create({
    data: { name: "Platform Owner", phone: `88017${Math.floor(Math.random() * 1e6)}`, role: "SUPER_ADMIN" },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId } });
  return user;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the resort's team list", () => {
  it("leaves the platform out of it", async () => {
    const platformAdmin = await aPlatformAdminInside(fx.resortId);

    const team = await platform().resortUsers(owner, fx.resortId);

    expect(team.map((u) => u.id)).not.toContain(platformAdmin.id);
  });

  it("still holds the resort's own people", async () => {
    await aPlatformAdminInside(fx.resortId);

    const team = await platform().resortUsers(owner, fx.resortId);

    expect(team.map((u) => u.id)).toContain(fx.managerId);
    expect(team.map((u) => u.id)).toContain(fx.agentId);
  });

  it("counts the same way, so the screen's total is not one too many", async () => {
    const before = (await platform().resortUsers(owner, fx.resortId)).length;

    await aPlatformAdminInside(fx.resortId);

    expect((await platform().resortUsers(owner, fx.resortId)).length).toBe(before);
  });
});
