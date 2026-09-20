/**
 * An offer brings a customer.
 *
 * The owner's idea, generalised (2026-09-11 design, §7): "platform theke
 * invitation pathanor time e plan select kore dibe… ami kauke amar platform e
 * anar jonno amar banano ekta free trial offer korlam." One object does three
 * jobs — a private invitation (one use, one address), a campaign (a hundred
 * uses, "60 days free"), and what `invite-agent` used to do, which was create
 * an account and mail a password in the clear. That is folded in and gone: a
 * resort inviting an agency now sends a link to sign up, and the agency sets
 * its own password.
 *
 * It also answers a question nothing answered: which channel brought this
 * customer. Every account remembers the offer it came through.
 *
 * The phase-4 gate (§10): signing up through an offer lands on that plan with
 * that trial; an expired offer, and an offer past its uses, both refuse.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, scheduleOf, seedResort, type Fixture, seedPlanSchedules } from "../helpers/db";
import { makePlatformService, makePushService } from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import { PlatformService } from "../../src/platform/platform.service";
import type { EmailService } from "../../src/notifications/email.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;
let admin: JwtClaims;

const outbox: { to: string; subject: string; html: string }[] = [];
const email = {
  send: async (to: string, subject: string, html: string) => {
    outbox.push({ to, subject, html });
    return { sent: true };
  },
} as unknown as EmailService;

type OfferInput = { audience: string; plan: string; trialDays?: number; discountPct?: number; maxUses?: number; expiresAt?: Date; email?: string };
const platform = () =>
  makePlatformService(asPrisma, email) as unknown as PlatformService & {
    createOffer(c: JwtClaims, i: OfferInput): Promise<{ id: number; code: string }>;
    offers(c: JwtClaims): Promise<{ code: string; signups: number; uses: number }[]>;
    inviteAgency(c: JwtClaims, resortId: number, i: { email: string; name?: string }): Promise<unknown>;
  };
const auth = () =>
  new AuthService(asPrisma, makePushService(asPrisma)) as unknown as AuthService & {
    signup(i: Record<string, string>): Promise<unknown>;
    signupAgency(i: Record<string, string>): Promise<{ user: { id: number } }>;
  };

let n = 0;
const resortSignup = (offer?: string) => {
  n++;
  return auth().signup({
    companyName: `Offer Group ${n}`,
    resortName: `Offer Resort ${n}`,
    name: "Owner",
    email: `owner${n}@example.com`,
    phone: `+88017770${String(n).padStart(5, "0")}`,
    password: "Password123!",
    ...(offer ? { offer } : {}),
  });
};
const agencySignup = (over: Record<string, string> = {}) => {
  n++;
  return auth().signupAgency({
    agencyName: `Offer Travels ${n}`,
    name: "Agent",
    email: `agency${n}@example.com`,
    phone: `+88018880${String(n).padStart(5, "0")}`,
    password: "Password123!",
    plan: "AGENCY_BASIC",
    ...over,
  });
};
const accountOf = (slugPart: string) =>
  prisma.tenant.findFirstOrThrow({ where: { name: { contains: slugPart } }, orderBy: { id: "desc" } }) as unknown as Promise<{ id: number; offerId: number | null; status: string }>;
const liveSub = (accountId: number) => prisma.subscription.findFirstOrThrow({ where: { accountId } });

beforeEach(async () => {
  outbox.length = 0;
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  await prisma.platformPlan.createMany({
    data: [
      { name: "AGENCY_BASIC", label: "Agency Basic", trialDays: 14, audience: "AGENCY", features: [] },
      { name: "AGENCY_PRO", label: "Agency Pro", trialDays: 14, audience: "AGENCY", features: [] },
    ] as never,
  });
  // a plan this spec made itself still needs somewhere to keep its price
  await seedPlanSchedules(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("signing up through an offer", () => {
  it("lands a resort on the offer's plan with the offer's trial, and remembers the channel", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "RESORT", plan: "GROWTH", trialDays: 60, maxUses: 100 });

    await resortSignup(offer.code);

    const account = await accountOf("Offer Group");
    expect(account.offerId).toBe(offer.id);
    const sub = await liveSub(account.id);
    expect(sub).toMatchObject({ plan: "GROWTH", status: "TRIAL" });
    expect(Math.round((sub.trialEndsAt!.getTime() - Date.now()) / 86_400_000)).toBe(60);
  });

  it("lands an agency on the offer's plan and trial, whatever plan it picked", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "AGENCY", plan: "AGENCY_PRO", trialDays: 90, maxUses: 10 });

    await agencySignup({ plan: "AGENCY_BASIC", offer: offer.code });

    const sub = await liveSub((await accountOf("Offer Travels")).id);
    expect(sub).toMatchObject({ plan: "AGENCY_PRO", status: "TRIAL" });
    expect(Math.round((sub.trialEndsAt!.getTime() - Date.now()) / 86_400_000)).toBe(90);
  });

  it("charges the discounted fee when the offer carries a discount", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "RESORT", plan: "GROWTH", discountPct: 50, maxUses: 5 });
    const growth = await prisma.planPhase.findFirstOrThrow({
      where: { schedule: { plan: { name: "GROWTH" }, label: "Monthly" } },
      orderBy: { seq: "asc" },
    });

    await resortSignup(offer.code);

    const sub = await liveSub((await accountOf("Offer Group")).id);
    // the subscription pays a period's `fee`; the plan's price is a rung
    expect(Number(sub.fee)).toBe(Number(growth.price) / 2);
    // and the discount outlives that first period — it is kept on the row
    expect(sub.discountPct).toBe(50);
  });
});

describe("an offer that cannot be used", () => {
  it("refuses once it has expired, and creates nothing", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "RESORT", plan: "GROWTH", maxUses: 5, expiresAt: new Date(Date.now() - 1000) });
    const before = await prisma.tenant.count();

    await expect(resortSignup(offer.code)).rejects.toMatchObject({ status: 400 });

    expect(await prisma.tenant.count()).toBe(before);
  });

  it("refuses the signup after its last use", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "RESORT", plan: "GROWTH", maxUses: 1 });

    await resortSignup(offer.code);
    await expect(resortSignup(offer.code)).rejects.toMatchObject({ status: 400 });

    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).uses).toBe(1);
  });

  it("will not open a resort signup with an offer made for agencies", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "AGENCY", plan: "AGENCY_PRO", maxUses: 5 });

    await expect(resortSignup(offer.code)).rejects.toMatchObject({ status: 400 });
  });
});

describe("a resort inviting an agency", () => {
  it("sends a link to sign up — never a password — and makes no account", async () => {
    const users = await prisma.user.count();

    await platform().inviteAgency(admin, fx.resortId, { email: "Invitee@Example.com", name: "Invitee Travels" });

    expect(await prisma.user.count()).toBe(users);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe("invitee@example.com");
    expect(outbox[0]!.html).toMatch(/\/signup\/agency\?offer=/);
    expect(outbox[0]!.html).not.toMatch(/password/i);
    const offer = await prisma.offer.findFirstOrThrow({ orderBy: { id: "desc" } });
    expect(offer).toMatchObject({ audience: "AGENCY", maxUses: 1, email: "invitee@example.com" });
  });

  it("is an invitation for that address alone", async () => {
    await platform().inviteAgency(admin, fx.resortId, { email: "invitee@example.com" });
    const code = (await prisma.offer.findFirstOrThrow({ orderBy: { id: "desc" } })).code;

    await expect(agencySignup({ offer: code, email: "someone.else@example.com" })).rejects.toMatchObject({ status: 400 });
    await expect(agencySignup({ offer: code, email: "invitee@example.com" })).resolves.toBeTruthy();
  });

  it("tells an agency already on the platform, and makes and mails nothing", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    await prisma.user.update({ where: { id: elsewhere.agentId }, data: { email: "their.agent@example.com" } });

    await platform().inviteAgency(admin, fx.resortId, { email: "their.agent@example.com" });

    expect(await prisma.notification.count({ where: { userId: elsewhere.agentId, resortId: fx.resortId } })).toBe(1);
    expect(outbox).toHaveLength(0);
    expect(await prisma.offer.count()).toBe(0);
  });

  it("leaves the invited agency pending — the platform verifies every agency, invited or not", async () => {
    await platform().inviteAgency(admin, fx.resortId, { email: "invitee@example.com" });
    const code = (await prisma.offer.findFirstOrThrow({ orderBy: { id: "desc" } })).code;

    await agencySignup({ offer: code, email: "invitee@example.com" });

    expect((await accountOf("Offer Travels")).status).toBe("pending");
  });

  /**
   * An invitation is a promise the resort has to be able to keep. A plan
   * without agents means the invited agency signs up, is verified, and finds
   * the resort that asked for it will not sell — so the refusal happens here,
   * where somebody can read it.
   */
  it("will not invite an agency to a resort whose plan does not include agents", async () => {
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId,
        plan: "STARTER",
        status: "ACTIVE",
        fee: 2500 as never,
        scheduleId: await scheduleOf(prisma as unknown as PrismaClient, "STARTER"),
        startedAt: new Date(),
        renewsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    await expect(platform().inviteAgency(admin, fx.resortId, { email: "invitee@example.com" })).rejects.toMatchObject({ status: 403 });
    expect(outbox).toHaveLength(0);
  });

  it("has replaced the invite that mailed a password — that method is gone", () => {
    expect("inviteAgentByEmail" in PlatformService.prototype).toBe(false);
  });
});

describe("which channel brought this customer", () => {
  it("is counted per offer", async () => {
    const offer = await platform().createOffer(superAdmin, { audience: "RESORT", plan: "GROWTH", maxUses: 100 });
    await resortSignup(offer.code);
    await resortSignup(offer.code);

    const row = (await platform().offers(superAdmin)).find((o) => o.code === offer.code)!;
    expect(row).toMatchObject({ uses: 2, signups: 2 });
  });
});
