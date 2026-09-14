/**
 * Changing a password: your own, and somebody else's.
 *
 * Until now a password could only be set at the moment an account was created.
 * After that there was one route back — "Forgot password?", an email, a link —
 * and it belongs to the person who owns the account. So a front-desk clerk who
 * had forgotten theirs could not be helped by the owner standing next to them,
 * and nobody at all could change their own password from inside the console:
 * `POST /auth/me/password` existed and no screen called it.
 *
 * Two different acts, and the difference is the whole design.
 *
 * **Your own** needs the current one. It is the proof that the person typing
 * is the person who owns the account, and without it a borrowed unlocked
 * laptop is a stolen account.
 *
 * **Somebody else's** needs no current password — the owner does not know it —
 * and that is exactly why it is its own permission. Setting a colleague's
 * password is impersonation: it hands you their account. `users.manage` means
 * "add and edit staff", which a duty manager may well need; it must not carry
 * "become the owner" along with it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import * as bcrypt from "bcryptjs";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
/** A colleague whose password is about to be changed for them. */
let clerkId: number;

const platform = () => makePlatformService(asPrisma);

/** A staff member on a custom role holding exactly the keys given. */
async function staffWith(permissions: string[]): Promise<JwtClaims> {
  const tag = Math.random().toString(36).slice(2, 8);
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `role-${tag}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Duty Manager",
      email: `duty-${tag}@example.com`,
      phone: `0171${Math.floor(1000000 + Math.random() * 8999999)}`,
      passwordHash: await bcrypt.hash("Password123!", 10),
      role: "MANAGER",
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId: role.id } });
  return { userId: user.id, role: ROLE.MANAGER, resortIds: [fx.resortId] };
}

const passwordOf = async (userId: number) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } })).passwordHash!;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  const clerk = await platform().createResortUser(owner, fx.resortId, {
    name: "Karim Uddin",
    email: "karim@skyeco.example",
    phone: "01712345678",
    password: "FirstPassword1",
    role: "FRONT_DESK",
  });
  clerkId = clerk.id;
});

afterAll(async () => prisma.$disconnect());

describe("setting a colleague's password", () => {
  it("is done by somebody holding the permission for it", async () => {
    await platform().setResortUserPassword(owner, fx.resortId, clerkId, "BrandNewPass9");

    expect(await bcrypt.compare("BrandNewPass9", await passwordOf(clerkId))).toBe(true);
    expect(await bcrypt.compare("FirstPassword1", await passwordOf(clerkId))).toBe(false);
  });

  /**
   * The point of the new key. A duty manager who may add and edit staff is not
   * thereby allowed to take over the owner's account.
   */
  it("is refused to somebody who may only manage users", async () => {
    const duty = await staffWith(["users.manage"]);

    await expect(platform().setResortUserPassword(duty, fx.resortId, clerkId, "BrandNewPass9")).rejects.toMatchObject({
      status: 403,
    });
    expect(await bcrypt.compare("FirstPassword1", await passwordOf(clerkId))).toBe(true);
  });

  it("is allowed to somebody given that key on their role", async () => {
    const duty = await staffWith(["users.manage", "users.password"]);

    await platform().setResortUserPassword(duty, fx.resortId, clerkId, "BrandNewPass9");

    expect(await bcrypt.compare("BrandNewPass9", await passwordOf(clerkId))).toBe(true);
  });

  it("will not reach somebody who does not work at this resort", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);

    await expect(
      platform().setResortUserPassword(owner, fx.resortId, elsewhere.managerId, "BrandNewPass9"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a password too short to be one", async () => {
    await expect(platform().setResortUserPassword(owner, fx.resortId, clerkId, "short")).rejects.toMatchObject({
      status: 400,
    });
  });

  /**
   * Somebody else holding your password is the single event an activity log
   * exists to carry. It records who did it and to whom, and never the password.
   */
  it("is written to the activity log, without the password in it", async () => {
    await platform().setResortUserPassword(owner, fx.resortId, clerkId, "BrandNewPass9");

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { resortId: fx.resortId, action: "user.password.set" },
      orderBy: { id: "desc" },
    });
    expect(entry.actorId).toBe(owner.userId);
    expect(Number(entry.entityId)).toBe(clerkId);
    expect(JSON.stringify(entry.diff)).not.toContain("BrandNewPass9");
  });

  /**
   * Not your own, not through here.
   *
   * This route asks for no current password, because the person using it does
   * not know the one they are replacing. Turned on yourself that becomes a way
   * to change your own password without proving you know it — so an unlocked
   * laptop on a desk is an account somebody keeps. Your own goes through
   * Account, which asks.
   */
  it("is not a way to change your own without knowing the current one", async () => {
    const duty = await staffWith(["users.manage", "users.password"]);

    await expect(
      platform().setResortUserPassword(duty, fx.resortId, duty.userId, "BrandNewPass9"),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * Somebody who works at two resorts has one account between them. Setting
   * their password here would hand this resort the keys to the other one — and
   * the person doing it need never have been near that tenant. It is the same
   * line the edit form already draws around a role and a status.
   */
  it("will not set the password of somebody who also works somewhere else", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    await prisma.userResort.create({ data: { userId: clerkId, resortId: elsewhere.resortId } });

    await expect(platform().setResortUserPassword(owner, fx.resortId, clerkId, "BrandNewPass9")).rejects.toMatchObject({
      status: 403,
    });
  });

  /**
   * One door, not two. The edit form used to accept a password beside the name
   * and the role, on `users.manage` — so the new permission would have been a
   * lock on the front door with the back one left open.
   */
  it("cannot be done through the ordinary edit form instead", async () => {
    const duty = await staffWith(["users.manage"]);

    await platform().updateResortUser(duty, fx.resortId, clerkId, {
      name: "Karim U",
      password: "SneakyPass123",
    } as never);

    expect(await bcrypt.compare("SneakyPass123", await passwordOf(clerkId))).toBe(false);
    expect(await bcrypt.compare("FirstPassword1", await passwordOf(clerkId))).toBe(true);
  });
});

describe("an agency setting its staff's password", () => {
  let agencyOwner: JwtClaims;
  let staffId: number;

  beforeEach(async () => {
    agencyOwner = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
    const staff = await platform().createAgentStaff(agencyOwner, {
      name: "Junior",
      email: "junior@agency.example",
      phone: "01898765432",
      password: "FirstPassword1",
    });
    staffId = staff.id;
  });

  it("is done by the agency owner, who holds every agency permission", async () => {
    await platform().setAgentStaffPassword(agencyOwner, staffId, "BrandNewPass9");

    expect(await bcrypt.compare("BrandNewPass9", await passwordOf(staffId))).toBe(true);
  });

  it("is refused to a junior who was never given the key", async () => {
    const junior: JwtClaims = { userId: staffId, role: ROLE.AGENT, resortIds: [] };

    await expect(platform().setAgentStaffPassword(junior, staffId, "BrandNewPass9")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("will not reach another agency's staff", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    const stranger: JwtClaims = { userId: other.agentId, role: ROLE.AGENT, resortIds: [other.resortId] };

    await expect(platform().setAgentStaffPassword(stranger, staffId, "BrandNewPass9")).rejects.toMatchObject({
      status: 403,
    });
  });

  /**
   * And the door beside it, found while fitting this lock: creating an agency's
   * staff was gated on being an agent at all, never on `agent.staff.manage`. A
   * junior with the booking screen could add themselves a colleague.
   */
  it("and creating staff is no longer open to any agent who asks", async () => {
    const junior: JwtClaims = { userId: staffId, role: ROLE.AGENT, resortIds: [] };

    await expect(
      platform().createAgentStaff(junior, {
        name: "Their own hire",
        email: "hire@agency.example",
        phone: "01811111111",
        password: "FirstPassword1",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
