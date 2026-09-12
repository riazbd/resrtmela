/**
 * A resort always has somebody who can administer it.
 *
 * Settings → Users & Roles used to offer two role controls per person, and the
 * upper one listed RESORT_ADMIN alongside MANAGER — so an owner could demote
 * themselves, log out, and find nobody left who could reach Settings. Nothing
 * in the product refused it, and nothing in the product could undo it: making
 * somebody an administrator again is a Settings action.
 *
 * Collapsing the two controls into one (the permission set now decides the
 * role) does not fix that on its own — it is the same demotion by another
 * route. So the rule is stated where it can be enforced: the last
 * administrator cannot be demoted, and the refusal says why.
 *
 * Protecting the *invariant* and not a particular account matters. Guarding
 * "the founder" would mean a colleague promoted to Administrator could never
 * be demoted again, because they are an administrator too.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";
import { ensureResortRoles } from "../../src/common/permissions";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const platform = () => makePlatformService(asPrisma);

let fx: Fixture;
let owner: JwtClaims;
let adminRoleId: number;
let deskRoleId: number;

/** A colleague on a named role, created the way the console creates one. */
async function addStaff(name: string, roleId: number) {
  const made = await platform().createResortUser(owner, fx.resortId, {
    name,
    email: `${name.toLowerCase()}@test.example`,
    phone: `0171${Math.floor(1000000 + Math.random() * 8999999)}`,
    password: "Password123!",
    role: "FRONT_DESK",
    roleId,
  } as never);
  return made.id as number;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  await ensureResortRoles(asPrisma, fx.resortId);
  const roles = await prisma.customRole.findMany({ where: { resortId: fx.resortId } });
  adminRoleId = roles.find((r) => r.name === "Administrator")!.id;
  deskRoleId = roles.find((r) => r.name === "Front Desk")!.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the role a permission set gives an account", () => {
  it("makes somebody on the Administrator role an administrator", async () => {
    const id = await addStaff("Ayesha", adminRoleId);
    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.role).toBe("RESORT_ADMIN");
  });

  it("makes somebody on the Front Desk role a front desk", async () => {
    const id = await addStaff("Bashir", deskRoleId);
    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.role).toBe("FRONT_DESK");
  });

  it("follows the permission set when it changes", async () => {
    const id = await addStaff("Chandni", deskRoleId);
    await platform().updateResortUser(owner, fx.resortId, id, { roleId: adminRoleId } as never);
    expect((await prisma.user.findUnique({ where: { id } }))?.role).toBe("RESORT_ADMIN");
  });
});

describe("the last administrator", () => {
  it("cannot be demoted", async () => {
    const only = await addStaff("Dilruba", adminRoleId);
    // the fixture's own owner is a MANAGER row; Dilruba is the resort's only
    // administrator in the database
    await expect(
      platform().updateResortUser(owner, fx.resortId, only, { roleId: deskRoleId } as never),
    ).rejects.toThrow(/last administrator|at least one administrator/i);
    expect((await prisma.user.findUnique({ where: { id: only } }))?.role).toBe("RESORT_ADMIN");
  });

  it("can be demoted once there is a second one", async () => {
    const first = await addStaff("Eshita", adminRoleId);
    await addStaff("Farhan", adminRoleId);
    await platform().updateResortUser(owner, fx.resortId, first, { roleId: deskRoleId } as never);
    expect((await prisma.user.findUnique({ where: { id: first } }))?.role).toBe("FRONT_DESK");
  });

  it("says why, rather than failing silently", async () => {
    const only = await addStaff("Gulshan", adminRoleId);
    await expect(
      platform().updateResortUser(owner, fx.resortId, only, { roleId: deskRoleId } as never),
    ).rejects.toThrow(/administrator/i);
  });
});
