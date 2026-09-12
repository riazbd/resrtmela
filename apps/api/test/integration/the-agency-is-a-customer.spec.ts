/**
 * The agency is a customer.
 *
 * Until now an agency existed only because a resort invited it, or because a
 * guest asked for access and was promoted. It had no front door, no plan of
 * its own and no bill — so the platform could not sell to the second of its
 * two customers at all (2026-09-11 design, §6).
 *
 * Now it signs up, lands pending on a plan from its own shelf, is verified once
 * by the platform, and sells. Behind on its bill, it stops selling — and only
 * that: the bookings it already made stay live, readable and honoured, because
 * the guest did nothing wrong and the resort is expecting them.
 *
 * The phase-3 gate (§10): a resort never sees an agency plan and an agency never
 * sees a resort plan; a suspended agency cannot create a booking, while the
 * bookings it already made still read and still check in.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import {
  makeBillingService, makeBookingsService, makePlatformService, makeSubscriptionService,
} from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;
let admin: JwtClaims;

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  await prisma.platformPlan.create({
    data: { name: "AGENCY_BASIC", label: "Agency Basic", monthlyFee: 1000, trialDays: 30, audience: "AGENCY", features: [] } as never,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const signupAgency = (plan = "AGENCY_BASIC") =>
  (new AuthService(asPrisma) as unknown as {
    signupAgency(i: Record<string, string>): Promise<{ user: { id: number } }>;
  }).signupAgency({
    agencyName: "Sea Breeze Travels",
    name: "Rafiq",
    email: "rafiq@seabreeze.example",
    phone: "+8801755000111",
    password: "Password123!",
    plan,
  });

const deskBooking = (claims: JwtClaims, roomId: number, guest = "Walk-in") =>
  makeBookingsService(asPrisma).create(claims, {
    resortId: fx.resortId,
    roomIds: [roomId],
    checkIn: today(),
    checkOut: plusDays(1),
    adults: 2,
    guest: { fullName: guest, phone: `0171${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}` },
  } as never);

/** The seeded agent, made the owner of an agency account in the given state. */
async function seededAgency(status: string) {
  const account = await prisma.tenant.create({
    data: { name: "Seeded Agency", slug: `seeded-${Date.now()}`, kind: "AGENCY", status } as never,
  });
  await prisma.user.update({ where: { id: fx.agentId }, data: { accountId: account.id } as never });
  return account;
}

const agentClaims = (userId = fx.agentId): JwtClaims => ({ userId, role: ROLE.AGENT, resortIds: [fx.resortId] });

describe("the shelf splits in two", () => {
  it("shows a resort only resort plans, and an agency only agency plans", async () => {
    const platform = makePlatformService(asPrisma) as unknown as { publicPlans(a?: string): Promise<{ name: string }[]> };

    expect((await platform.publicPlans()).map((p) => p.name)).not.toContain("AGENCY_BASIC");
    expect((await platform.publicPlans("AGENCY")).map((p) => p.name)).toEqual(["AGENCY_BASIC"]);
  });

  it("never offers a resort an agency plan on its own subscription page", async () => {
    const detail = await makeSubscriptionService(asPrisma).detail(admin, fx.resortId);

    expect(detail.plans.map((p) => p.name)).not.toContain("AGENCY_BASIC");
  });

  it("will not put a resort on an agency plan, or an agency on a resort plan", async () => {
    await expect(
      makePlatformService(asPrisma).setSubscription(superAdmin, fx.resortId, { plan: "AGENCY_BASIC" }),
    ).rejects.toMatchObject({ status: 400 });

    const agency = await prisma.tenant.create({ data: { name: "A", slug: `a-${Date.now()}`, kind: "AGENCY" } as never });
    await expect(
      makePlatformService(asPrisma).setAccountSubscription(superAdmin, agency.id, { plan: "STARTER" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("an agency signing up", () => {
  it("lands pending, on a trial of the agency plan it chose", async () => {
    const { user } = await signupAgency();

    const agent = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) as unknown as { role: string; accountId: number };
    expect(agent.role).toBe("AGENT");
    const account = await prisma.tenant.findUniqueOrThrow({ where: { id: agent.accountId } }) as unknown as { kind: string; status: string };
    expect(account).toMatchObject({ kind: "AGENCY", status: "pending" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { accountId: agent.accountId } });
    expect(sub).toMatchObject({ plan: "AGENCY_BASIC", status: "TRIAL" });
    const trialDays = Math.round((sub.trialEndsAt!.getTime() - Date.now()) / 86_400_000);
    expect(trialDays).toBe(30);
  });

  it("cannot choose a plan from the resort shelf", async () => {
    await expect(signupAgency("STARTER")).rejects.toMatchObject({ status: 400 });
  });
});

describe("selling", () => {
  it("waits for the platform to verify the agency — once, not once per resort", async () => {
    const { user } = await signupAgency();
    await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId } });
    const agent = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }) as unknown as { accountId: number };

    await expect(deskBooking(agentClaims(user.id), fx.rooms[0]!.id)).rejects.toMatchObject({ status: 403 });

    await (makePlatformService(asPrisma) as unknown as { verifyAgency(c: JwtClaims, id: number): Promise<unknown> })
      .verifyAgency(superAdmin, agent.accountId);

    await expect(deskBooking(agentClaims(user.id), fx.rooms[0]!.id)).resolves.toBeTruthy();
  });

  it("stops when the agency falls behind on its bill — and only that", async () => {
    const account = await seededAgency("active");
    const kept = (await deskBooking(agentClaims(), fx.rooms[0]!.id, "Booked before")) as unknown as { id: number };

    await prisma.tenant.update({ where: { id: account.id }, data: { status: "suspended", suspendedReason: "billing" } as never });

    await expect(deskBooking(agentClaims(), fx.rooms[1]!.id)).rejects.toMatchObject({ status: 403 });
    // what it already sold is untouched: the agency still reads it, and the resort still checks the guest in
    await expect(makeBookingsService(asPrisma).detail(agentClaims(), kept.id)).resolves.toBeTruthy();
    // an agency's booking waits for the resort to confirm it, suspended agency or not
    await makeBookingsService(asPrisma).transition(admin, kept.id, "CONFIRMED" as never);
    await makeBookingsService(asPrisma).transition(admin, kept.id, "CHECKED_IN" as never);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: kept.id } })).state).toBe("CHECKED_IN");
  });

  it("tells the agency, not a resort, about its own bill", async () => {
    const account = await seededAgency("active");
    const now = new Date();
    await prisma.subscription.create({
      data: { accountId: account.id, plan: "AGENCY_BASIC", status: "TRIAL", fee: 1000, trialEndsAt: new Date(now.getTime() + 2 * 86_400_000) } as never,
    });

    await makeBillingService(asPrisma).sweep(now);

    const agent = await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } });
    const jobs = await prisma.notificationJob.findMany({ select: { toRef: true } });
    expect(jobs.map((j) => j.toRef)).toContain(agent.email);
  });
});
