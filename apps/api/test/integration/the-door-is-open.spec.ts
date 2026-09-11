/**
 * The open door.
 *
 * An agency used to ask each resort for access, and a manager clicked Approve —
 * ten agencies and fifty resorts is five hundred clicks, by someone who cannot
 * vet a travel agency by reading its name (2026-09-11 design, §8). Identity is
 * the platform's job and is done once, at verification. What is left to the
 * resort is commercial: is it open to agents, which agency does it refuse, and
 * did it strike a different commission with one of them.
 *
 *   selling access = agency verified and paid up
 *                  AND resort open to agents
 *                  AND this agency not blocked by this resort
 *
 * The phase-5 gate (§10): selling access is computed, not stored — closing a
 * resort or blocking an agency takes effect on the next request, not the next
 * login; and the team list contains staff and nothing else.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeAvailabilityService, makeBookingsService, makeCommissionService, makePlatformService } from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import { EngageService } from "../../src/engage/engage.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;
// minted with no resorts at all: whatever the agent may sell, the token was
// never told, so nothing below can be the token's answer
let agent: JwtClaims;

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Terms = { blocked?: boolean; commissionKind?: string | null; commissionRate?: number | null };
const platform = () =>
  makePlatformService(asPrisma) as unknown as ReturnType<typeof makePlatformService> & {
    setAgentsOpen(c: JwtClaims, resortId: number, open: boolean): Promise<unknown>;
    setAgencyTerms(c: JwtClaims, resortId: number, accountId: number, t: Terms): Promise<unknown>;
    resortAgencies(c: JwtClaims, resortId: number): Promise<{ accountId: number; name: string; blocked: boolean; commissionRate: number | null }[]>;
  };
const commission = () =>
  makeCommissionService(asPrisma) as unknown as { termsFor(resortId: number, accountId?: number): Promise<{ kind: string; rate: number }> };

const search = (claims = agent, resortId = fx.resortId) =>
  makeAvailabilityService(asPrisma).roomsGrid(claims, resortId, today(), plusDays(1));
const book = (claims = agent, resortId = fx.resortId, roomId = fx.rooms[0]!.id) =>
  makeBookingsService(asPrisma).create(claims, {
    resortId,
    roomIds: [roomId],
    checkIn: today(),
    checkOut: plusDays(1),
    adults: 2,
    guest: { fullName: "Agency Client", phone: `0171${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}` },
  } as never);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("selling access is computed on every request", () => {
  it("lets a verified agency sell an open resort that never approved it", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);

    await expect(search(agent, elsewhere.resortId)).resolves.toHaveLength(2);
    await expect(book(agent, elsewhere.resortId, elsewhere.rooms[0]!.id)).resolves.toBeTruthy();
  });

  it("stops at the next request once the resort closes to agents — same token", async () => {
    await expect(search()).resolves.toHaveLength(2);

    await platform().setAgentsOpen(admin, fx.resortId, false);

    await expect(search()).rejects.toMatchObject({ status: 403 });
    await expect(book()).rejects.toMatchObject({ status: 403 });
  });

  it("stops at the next request once the resort blocks the agency, and resumes when it lifts the block", async () => {
    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { blocked: true });
    await expect(search()).rejects.toMatchObject({ status: 403 });

    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { blocked: false });
    await expect(search()).resolves.toHaveLength(2);
  });

  it("blocks the agency's staff with it — the agency is the unit", async () => {
    const staff = await prisma.user.create({
      data: { name: "Junior", email: "junior@agency.example", phone: "8801799000111", role: "AGENT", status: "active", parentAgentId: fx.agentId, accountId: fx.agencyId },
    });
    const staffClaims = { userId: staff.id, role: ROLE.AGENT, resortIds: [] };
    await expect(search(staffClaims)).resolves.toHaveLength(2);

    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { blocked: true });

    await expect(search(staffClaims)).rejects.toMatchObject({ status: 403 });
  });

  it("does not let an agency the platform has not verified sell, however open the resort", async () => {
    await prisma.tenant.update({ where: { id: fx.agencyId }, data: { status: "pending" } });

    await expect(search()).rejects.toMatchObject({ status: 403 });
  });

  it("tells the console which resorts the agency may sell, from the same rule", async () => {
    const me = () => new AuthService(asPrisma).me(fx.agentId) as Promise<{ resorts: { resort: { id: number } }[] } | null>;
    expect((await me())!.resorts.map((r) => r.resort.id)).toEqual([fx.resortId]);

    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { blocked: true });

    expect((await me())!.resorts).toEqual([]);
  });
});

describe("a resort's terms with one agency", () => {
  it("quotes a commission struck with one agency to that agency alone", async () => {
    const other = await prisma.tenant.create({ data: { name: "Other Agency", slug: `other-${Date.now()}`, kind: "AGENCY", status: "active" } });

    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { commissionKind: "PERCENT", commissionRate: 15 });

    expect(await commission().termsFor(fx.resortId, fx.agencyId)).toEqual({ kind: "PERCENT", rate: 15 });
    expect(await commission().termsFor(fx.resortId, other.id)).toEqual({ kind: "PERCENT", rate: 10 });
  });

  it("lists every verified agency beside this resort's terms with it", async () => {
    await platform().setAgencyTerms(admin, fx.resortId, fx.agencyId, { blocked: true });

    const rows = await platform().resortAgencies(admin, fx.resortId);

    expect(rows.find((r) => r.accountId === fx.agencyId)).toMatchObject({ name: "Test Agency", blocked: true, commissionRate: null });
  });

  it("is the resort's to set — an agent cannot unblock itself", async () => {
    await expect(platform().setAgencyTerms(agent, fx.resortId, fx.agencyId, { blocked: false })).rejects.toMatchObject({ status: 403 });
  });
});

describe("the team list", () => {
  it("holds staff and nothing else, though an agency sells the resort", async () => {
    await book();

    const team = await platform().resortUsers(admin, fx.resortId);

    expect(team.map((u) => u.id)).toContain(fx.managerId);
    expect(team.map((u) => u.role)).not.toContain("AGENT");
  });

  it("no longer takes an agent as a colleague — the resort invites the agency instead", async () => {
    await expect(
      platform().createResortUser(admin, fx.resortId, { name: "A", email: "a@agency.example", phone: "8801799000222", password: "password123", role: "AGENT" }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/invite/i) });
  });
});

describe("the approval ceremony", () => {
  it("is gone: no request, no queue, no decision", () => {
    for (const m of ["requestAccess", "listAccessRequests", "decideAccess"]) {
      expect(m in EngageService.prototype).toBe(false);
    }
  });
});

describe("onboarding asks", () => {
  it("keeps the new resort's answer, and starts closed when it gave none", async () => {
    const signup = (n: number, agentsOpen?: boolean) =>
      (new AuthService(asPrisma) as unknown as { signup(i: Record<string, unknown>): Promise<unknown> }).signup({
        companyName: `Door Group ${n}`, resortName: `Door Resort ${n}`, name: "Owner",
        email: `door${n}@example.com`, phone: `+8801766000${n}00`, password: "Password123!",
        ...(agentsOpen === undefined ? {} : { agentsOpen }),
      });

    await signup(1, true);
    await signup(2);

    const open = await prisma.resort.findFirstOrThrow({ where: { name: "Door Resort 1" } });
    const closed = await prisma.resort.findFirstOrThrow({ where: { name: "Door Resort 2" } });
    expect([open.agentsOpen, closed.agentsOpen]).toEqual([true, false]);
  });
});
