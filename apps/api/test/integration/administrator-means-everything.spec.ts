/**
 * "Administrator" is a definition, not a snapshot.
 *
 * `ensureResortRoles` seeds three system roles when a resort is created, and
 * writes `ALL_PERMISSIONS` into the Administrator row — the list as it stood on
 * the day that resort signed up. It never runs again for that resort, because
 * it early-returns once any role exists.
 *
 * So every permission key added after a resort was created is missing from its
 * Administrator role for ever. `billing.manage` and `rooms.delete` arrived
 * today; a resort that signed up last month has an Administrator role that has
 * never heard of them, and a person on that role cannot change the plan or
 * remove a room. Nothing about that is visible: the matrix simply has fewer
 * boxes than the product has features, and it drifts further with every
 * release.
 *
 * A stored list of "everything" is a list that goes stale. Administrator
 * resolves to `*` instead — computed, so it cannot rot — and the matrix stops
 * offering boxes that decide nothing.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { PermissionsService, ensureResortRoles } from "../../src/common/permissions";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, ALL_PERMISSIONS, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const perms = () => new PermissionsService(asPrisma);

/** Someone whose only authority is the role they are linked to. */
async function onRole(roleId: number): Promise<JwtClaims> {
  const user = await prisma.user.create({
    data: {
      name: "Deputy",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      email: `8809${Math.floor(Math.random() * 1e8)}@example.com`,
      role: ROLE.FRONT_DESK,
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId } });
  return { userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
}

const roleNamed = (name: string) =>
  prisma.customRole.findFirstOrThrow({ where: { resortId: fx.resortId, name } });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await ensureResortRoles(asPrisma, fx.resortId);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the Administrator role", () => {
  it("holds a permission added after the resort was created", async () => {
    const admin = await roleNamed("Administrator");
    // the resort signed up before these keys existed
    await prisma.customRole.update({
      where: { id: admin.id },
      data: { permissions: ["bookings.view", "rooms.view"] },
    });
    const deputy = await onRole(admin.id);

    expect(await perms().can(deputy, fx.resortId, "billing.manage")).toBe(true);
    expect(await perms().can(deputy, fx.resortId, "rooms.delete")).toBe(true);
  });

  it("holds every key the product ships, without storing the list", async () => {
    const deputy = await onRole((await roleNamed("Administrator")).id);

    const held = await perms().resolve(deputy, fx.resortId);
    expect(held).toContain("*");
  });

  it("is not what an ordinary role gets", async () => {
    const frontDesk = await roleNamed("Front Desk");
    const clerk = await onRole(frontDesk.id);

    expect(await perms().can(clerk, fx.resortId, "billing.manage")).toBe(false);
    expect(await perms().can(clerk, fx.resortId, "rooms.delete")).toBe(false);
  });

  it("does not extend to a role somebody named Administrator themselves", async () => {
    const impostor = await prisma.customRole.create({
      data: { resortId: fx.resortId, name: "Administrator (night)", permissions: ["bookings.view"] },
    });
    const claims = await onRole(impostor.id);

    expect(await perms().can(claims, fx.resortId, "billing.manage")).toBe(false);
  });
});

describe("the matrix stops offering boxes that decide nothing", () => {
  it("reports the Administrator role as holding everything", async () => {
    // a resort seeded before today's keys existed. Without this the stored
    // list is already ALL_PERMISSIONS and the assertion passes for the wrong
    // reason — it would hold with the whole fix removed.
    await prisma.customRole.update({
      where: { id: (await roleNamed("Administrator")).id },
      data: { permissions: ["bookings.view"] },
    });

    const rows = await makePlatformService(asPrisma).listRoles(owner, fx.resortId);

    const admin = rows.find((r) => r.name === "Administrator")!;
    expect(admin.permissions).toEqual(ALL_PERMISSIONS);
  });

  it("refuses to trim it, and says what to do instead", async () => {
    const admin = await roleNamed("Administrator");

    await expect(
      makePlatformService(asPrisma).updateRole(owner, admin.id, { permissions: ["bookings.view"] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("still lets the other system roles be edited", async () => {
    const frontDesk = await roleNamed("Front Desk");

    const updated = await makePlatformService(asPrisma).updateRole(owner, frontDesk.id, {
      permissions: ["bookings.view"],
    });

    expect(updated.permissions).toEqual(["bookings.view"]);
  });
});
