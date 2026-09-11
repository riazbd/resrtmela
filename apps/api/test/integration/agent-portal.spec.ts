/**
 * The agent portal: roles, an activity log, and a wallet the agent can see.
 *
 * Three things were asked for on the agent side and three things were missing.
 *
 * **Roles.** An agency could add staff, and every one of them got identical
 * powers. There was no way to hire a junior who books but cannot see the
 * agency's money, which is the first thing anyone hiring a junior wants.
 *
 * **An activity log.** The owner side has one, searchable. The agent side had
 * nothing, so an agency could not answer "who cancelled that booking".
 *
 * **A wallet.** `agent.wallet.view` existed in the permission list, was
 * granted to every agent, and *nothing read it*. Money moved through the
 * wallet and the agent it belonged to could not see a balance — the platform
 * held their money and showed them no statement.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeAgentService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let agencyId: number;

const platform = () => makePlatformService(asPrismaService);
const agents = () => makeAgentService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agencyId = fx.agentId;
  agency = { userId: agencyId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hire(name: string, permissions?: string[]) {
  const staff = await platform().createAgentStaff(agency, {
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    phone: `8801${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    password: "password123",
  });
  if (permissions) {
    const role = await agents().createRole(agency, { name: `${name} role`, permissions });
    await agents().assignRole(agency, staff.id, role.id);
  }
  return { id: staff.id, claims: { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] } as JwtClaims };
}

describe("agency roles", () => {
  it("lets an agency say what a junior may do", async () => {
    const role = await agents().createRole(agency, {
      name: "Junior",
      permissions: ["agent.book"],
    });

    expect(role.permissions).toEqual(["agent.book"]);
    expect((await agents().listRoles(agency)).map((r) => r.name)).toContain("Junior");
  });

  it("refuses a permission that is not an agent's to hold", async () => {
    await expect(
      agents().createRole(agency, { name: "Sneaky", permissions: ["payroll.manage"] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("stops a junior seeing the agency's money", async () => {
    const junior = await hire("Junior", ["agent.book"]);

    await expect(agents().wallet(junior.claims)).rejects.toMatchObject({ status: 403 });
  });

  it("lets a senior see it", async () => {
    const senior = await hire("Senior", ["agent.book", "agent.wallet.view"]);

    await expect(agents().wallet(senior.claims)).resolves.toMatchObject({ balance: 0 });
  });

  it("gives an agency itself everything, without a role", async () => {
    await expect(agents().wallet(agency)).resolves.toBeTruthy();
  });

  it("never lets one agency assign another agency's role", async () => {
    const other = await prisma.user.create({
      data: { name: "Other Agency", phone: `88095${Date.now() % 1e7}`, email: `88095${Date.now() % 1e7}@example.com`, role: "AGENT", status: "active" },
    });
    const otherClaims: JwtClaims = { userId: other.id, role: ROLE.AGENT, resortIds: [fx.resortId] };
    const mine = await agents().createRole(agency, { name: "Mine", permissions: ["agent.book"] });
    const theirStaff = await platform().createAgentStaff(otherClaims, {
      name: "Their Staff",
      email: "their.staff@example.com",
      phone: `8801${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      password: "password123",
    });

    await expect(agents().assignRole(agency, theirStaff.id, mine.id)).rejects.toMatchObject({ status: 403 });
  });
});

/** The platform itself — the only authority that may move an agency's wallet. */
async function platformClaims(): Promise<JwtClaims> {
  const su = await prisma.user.create({
    data: { name: "Platform", phone: `8895${Math.floor(Math.random() * 1e8)}`, email: `8895${Math.floor(Math.random() * 1e8)}@example.com`, role: "SUPER_ADMIN" },
  });
  return { userId: su.id, role: ROLE.SUPER_ADMIN, resortIds: [] };
}

describe("agency wallet", () => {
  it("shows the agency its balance and every movement", async () => {
    // the platform funds it, not a resort: the wallet is the agency's account
    // with the platform, and `platform-wallet.spec.ts` is where that is held
    const admin = await platformClaims();
    await prisma.wallet.upsert({ where: { userId: agencyId }, update: { active: true }, create: { userId: agencyId, active: true } });
    await platform().walletTxn(admin, agencyId, "TOPUP", 5000, "advance against sales");

    const wallet = await agents().wallet(agency);

    expect(wallet.balance).toBe(5000);
    expect(wallet.txns[0]).toMatchObject({ kind: "TOPUP", amount: 5000 });
  });

  it("shows a staff member the agency's wallet, not a wallet of their own", async () => {
    const senior = await hire("Senior", ["agent.book", "agent.wallet.view"]);
    await prisma.wallet.upsert({ where: { userId: agencyId }, update: { active: true }, create: { userId: agencyId, active: true } });
    await platform().walletTxn(await platformClaims(), agencyId, "TOPUP", 1200);

    // the money belongs to the agency; staff spend it, they do not each hold some
    expect((await agents().wallet(senior.claims)).balance).toBe(1200);
  });
});

describe("agency activity log", () => {
  it("shows what the agency and its staff did, and nobody else", async () => {
    const staff = await hire("Junior");
    const stranger = await prisma.user.create({
      data: { name: "Stranger", phone: `88094${Date.now() % 1e7}`, email: `88094${Date.now() % 1e7}@example.com`, role: "AGENT", status: "active" },
    });
    await prisma.auditLog.createMany({
      data: [
        { actorId: agencyId, resortId: fx.resortId, action: "booking.create", entity: "booking", entityId: 1 },
        { actorId: staff.id, resortId: fx.resortId, action: "booking.cancel", entity: "booking", entityId: 2 },
        { actorId: stranger.id, resortId: fx.resortId, action: "booking.create", entity: "booking", entityId: 3 },
      ],
    });

    const rows = await agents().activity(agency, {});
    const bookingRows = rows.filter((r) => r.action.startsWith("booking."));

    // hiring the staff member logged an entry of its own, which belongs here too
    expect(bookingRows.map((r) => r.action).sort()).toEqual(["booking.cancel", "booking.create"]);
    expect(rows.some((r) => r.actor?.id === stranger.id)).toBe(false);
  });

  it("searches by action and by who did it", async () => {
    const staff = await hire("Junior");
    await prisma.auditLog.createMany({
      data: [
        { actorId: agencyId, resortId: fx.resortId, action: "booking.create", entity: "booking", entityId: 1 },
        { actorId: staff.id, resortId: fx.resortId, action: "payment.advance", entity: "booking", entityId: 2 },
      ],
    });

    expect(await agents().activity(agency, { q: "payment.advance" })).toHaveLength(1);
    // "Junior" matches the actor's name — the hire entry and their own payment
    const byActor = await agents().activity(agency, { q: "Junior" });
    expect(byActor.every((r) => r.actor?.name === "Junior")).toBe(true);
    expect(byActor.length).toBeGreaterThan(0);
  });

  it("is refused to staff who were not given it", async () => {
    const junior = await hire("Junior", ["agent.book"]);

    await expect(agents().activity(junior.claims, {})).rejects.toMatchObject({ status: 403 });
  });
});
