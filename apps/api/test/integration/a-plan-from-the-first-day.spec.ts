/**
 * A workspace has a plan from the moment it exists.
 *
 * Resort signup wrote a subscription only when an offer code named one.
 * Without a code the tenant landed with none at all, which nothing on the way
 * in suggested: the signup page reads "Starter · 10 rooms · 30 days free"
 * while you type, and Settings then said "No subscription yet — the platform
 * sets the first one up" and drew the plan cards with no buttons on them. The
 * owner could neither see what they were on nor choose.
 *
 * Agency signup has always done the right thing here — it takes the plan from
 * the agency shelf and opens a trial — so this is the resort side catching up
 * to its own mirror image.
 *
 * The second half matters for the tenants already in that state: fixing signup
 * does nothing for a workspace created last week, so the owner can also start
 * a subscription from Settings when there is none.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeSubscriptionService } from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let seq = 0;

const auth = () => new AuthService(asPrismaService);
const subs = () => makeSubscriptionService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A signup body with unique contact details, the way the form sends one. */
function newOwner(over: Record<string, unknown> = {}) {
  const n = ++seq;
  const uniq = `${n}-${Math.floor(Math.random() * 1e6)}`;
  return {
    companyName: `Tripovel ${uniq}`,
    resortName: "Tripovel Retreat",
    name: "Repro Owner",
    email: `owner-${uniq}@example.com`,
    phone: `8809${String(n).padStart(4, "0")}${Math.floor(Math.random() * 1e5)}`,
    password: "Password123!",
    ...over,
  };
}

describe("a resort that has just signed up", () => {
  it("is on a plan, not on nothing", async () => {
    const body = newOwner();
    await auth().signup(body);
    const sub = await prisma.subscription.findFirst({ where: { account: { name: body.companyName } } });
    expect(sub, "signup left the workspace with no subscription at all").not.toBeNull();
  });

  it("starts on the entry plan the signup page promised", async () => {
    // the page shows the first plan on the shelf while the visitor types; the
    // account must land on that one and not on something else
    const entry = await prisma.platformPlan.findFirst({
      where: { active: true, audience: "RESORT" },
      orderBy: { sortOrder: "asc" },
    });
    const body = newOwner();
    await auth().signup(body);
    const sub = await prisma.subscription.findFirst({ where: { account: { name: body.companyName } } });
    expect(sub!.plan).toBe(entry!.name);
  });

  it("takes the plan the visitor picked on the pricing page", async () => {
    const body = newOwner({ plan: "GROWTH" });
    await auth().signup(body);
    const sub = await prisma.subscription.findFirst({ where: { account: { name: body.companyName } } });
    expect(sub!.plan).toBe("GROWTH");
  });

  it("will not open on a plan that is not sold to resorts", async () => {
    // the agency shelf is not a menu a resort can order from
    await expect(auth().signup(newOwner({ plan: "AGENCY_PRO" }))).rejects.toMatchObject({ status: 400 });
  });

  it("is in trial rather than billed on day one", async () => {
    const body = newOwner();
    await auth().signup(body);
    const sub = await prisma.subscription.findFirst({ where: { account: { name: body.companyName } } });
    expect(sub!.status).toBe("TRIAL");
    expect(sub!.trialEndsAt).not.toBeNull();
  });
});

describe("a resort that somehow has no subscription", () => {
  it("lets the owner start one", async () => {
    // the tenants created before signup was fixed are in exactly this state
    const claims: JwtClaims = {
      userId: fx.managerId,
      role: ROLE.RESORT_ADMIN,
      resortIds: [fx.resortId],
    };
    await prisma.subscription.deleteMany({ where: { accountId: fx.tenantId } });

    const out = await subs().changePlan(claims, fx.resortId, "GROWTH");

    expect(out.planLabel).toBeTruthy();
    const sub = await prisma.subscription.findFirst({ where: { accountId: fx.tenantId } });
    expect(sub, "no subscription was created").not.toBeNull();
    expect(sub!.plan).toBe("GROWTH");
    expect(sub!.status).toBe("TRIAL");
  });
});
