/**
 * The open door.
 *
 * An agency used to ask each resort for access, and a manager clicked Approve —
 * ten agencies and fifty resorts is five hundred clicks, by someone who cannot
 * vet a travel agency by reading its name (2026-09-11 design, §8). Identity is
 * the platform's job and is done once, at verification. What is left to the
 * resort is commercial: which agency does it refuse, and did it strike a
 * different commission with one of them.
 *
 *   selling access = agency verified and paid up
 *                  AND the resort's plan includes agents
 *                  AND this agency not blocked by this resort
 *
 * The middle line used to be `agentsOpen`, a switch on the resort that started
 * off. Every resort therefore began closed and had to be opened one at a time,
 * which is the five hundred clicks again wearing a different hat — and it made
 * "Agents with wallets" a plan feature that gated one button rather than the
 * thing it names. The switch is gone. What a resort buys is what it gets, and
 * refusing one agency is still the resort's to do.
 *
 * The phase-5 gate (§10): selling access is computed, not stored — closing a
 * resort or blocking an agency takes effect on the next request, not the next
 * login; and the team list contains staff and nothing else.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, scheduleOf, seedResort, type Fixture } from "../helpers/db";
import { makeAvailabilityService, makeBookingsService, makeCommissionService, makePlatformService } from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import { EngageService } from "../../src/engage/engage.service";
import { PlatformService } from "../../src/platform/platform.service";
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

  /**
   * Only a real subscription can take a feature away — a tenant held to no plan
   * at all may use everything, which is what the fixture is and why every other
   * test here sells without arranging anything.
   */
  const onPlan = async (name: string) =>
    prisma.subscription.create({
      data: {
        accountId: fx.tenantId,
        plan: name,
        status: "ACTIVE",
        fee: 2500 as never,
        scheduleId: await scheduleOf(prisma as unknown as PrismaClient, name),
        startedAt: new Date(),
        renewsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

  it("stops at the next request once the plan stops including agents — same token", async () => {
    await expect(search()).resolves.toHaveLength(2);

    // STARTER carries no features in the catalogue, so buying it is the resort
    // deciding not to pay for agencies
    await onPlan("STARTER");

    await expect(search()).rejects.toMatchObject({ status: 403 });
    await expect(book()).rejects.toMatchObject({ status: 403 });
  });

  it("sells again the moment the platform puts agents in that plan", async () => {
    await onPlan("STARTER");
    await expect(search()).rejects.toMatchObject({ status: 403 });

    await prisma.platformPlan.update({
      where: { name: "STARTER" },
      data: { features: ["agents"] as never },
    });

    await expect(search()).resolves.toHaveLength(2);
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

  /**
   * And neither is there a switch to forget to flip. A resort that had to be
   * opened by hand is the approval queue with one fewer participant.
   */
  it("left no switch behind on the platform service", () => {
    expect("setAgentsOpen" in PlatformService.prototype).toBe(false);
  });
});

describe("onboarding", () => {
  /**
   * The signup form used to make this a required question, with the submit
   * button dead until it was answered — the very first thing a new customer was
   * asked to have an opinion about, before they had seen a single screen.
   *
   * Nothing asks now, and nothing is stored. Whether the resort sells through
   * agencies is a consequence of the plan it is on, which is a thing it can be
   * sold rather than a switch it can leave off by accident.
   */
  it("does not ask, keeps no answer, and needs no switch thrown afterwards", async () => {
    await (new AuthService(asPrisma) as unknown as { signup(i: Record<string, unknown>): Promise<unknown> }).signup({
      companyName: "Door Group", resortName: "Door Resort", name: "Owner",
      email: "door@example.com", phone: "+8801766000100", password: "Password123!",
    });

    const resort = await prisma.resort.findFirstOrThrow({ where: { name: "Door Resort" } });
    expect("agentsOpen" in resort).toBe(false);

    // the entry plan a signup lands on carries no features in this catalogue,
    // so the new resort does not sell through agencies — and that is the plan
    // talking, not an unticked box
    const sub = await prisma.subscription.findFirstOrThrow({
      where: { account: { resorts: { some: { id: resort.id } } } },
    });
    await expect(search(agent, resort.id)).rejects.toMatchObject({ status: 403 });

    await prisma.platformPlan.update({
      where: { name: sub.plan },
      data: { features: ["agents"] as never },
    });

    // no second step: the resort never had to be opened
    await expect(search(agent, resort.id)).resolves.toBeTruthy();
  });
});
