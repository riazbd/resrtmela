/**
 * An agency is a customer, and customers can buy things.
 *
 * Bulk Email is offered to agencies — the nav shows it, and an agent's copy
 * writes to the agency's own guest list. Sending spends credits. Buying credits
 * refused an agency outright:
 *
 *     // the charge has to land on a resort's bill; someone with no resort at
 *     // all has nowhere to send it
 *     const resortId = claims.resortIds[0];
 *     if (resortId == null) throw badRequest("No resort on this account…");
 *
 * So the screen told them "no email credits — buy a pack first" and the buying
 * told them they had nowhere to be billed. A closed loop with no exit.
 *
 * The cause is one inconsistency, and the product already states the right
 * answer elsewhere. `SubscriptionDue.accountId` is documented as "the customer
 * billed — a resort owner or an agency, not a resort", which is why an agency
 * can hold a subscription at all. `PlatformCharge` and `EmailCreditOrder` were
 * keyed to a resort instead. The customer is the account; which resort asked is
 * context worth keeping, not the thing being billed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeEngageService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let agent: JwtClaims;
let platform: JwtClaims;

const engage = () => makeEngageService(asPrisma);

const creditsOf = async (userId: number) =>
  (await prisma.emailCredit.findUnique({ where: { userId } }))?.credits ?? 0;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  // an agent sells resorts; they hold no resort of their own
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  platform = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await prisma.platformSetting.upsert({
    where: { key: "email.creditPacks" },
    update: { value: JSON.stringify([{ credits: 500, price: 500 }]) },
    create: { key: "email.creditPacks", value: JSON.stringify([{ credits: 500, price: 500 }]) },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("an agency buying email credits", () => {
  it("can ask for a pack at all", async () => {
    const order = await engage().requestCredits(agent, 500);
    expect(order.status).toBe("PENDING");
    expect(order.credits).toBe(500);
  });

  it("is billed as the agency, not as somebody's resort", async () => {
    await engage().requestCredits(agent, 500);
    const order = await prisma.emailCreditOrder.findFirst({ where: { userId: fx.agentId } });
    expect(order!.accountId).toBe(fx.agencyId);
    // the agency has no resort, and inventing one would put the bill on a
    // business that did not order anything
    expect(order!.resortId).toBeNull();
  });

  it("gets its credits and its charge when the platform approves", async () => {
    const order = await engage().requestCredits(agent, 500);
    await engage().decideCreditOrder(platform, Number(order.id), "APPROVE");

    expect(await creditsOf(fx.agentId)).toBe(500);
    const charge = await prisma.platformCharge.findFirst({ where: { accountId: fx.agencyId } });
    expect(charge, "no charge was raised against the agency").not.toBeNull();
    expect(Number(charge!.amount)).toBe(500);
  });
});

describe("a resort buying email credits", () => {
  it("still works, and is billed to the owner's account", async () => {
    const order = await engage().requestCredits(owner, 500);
    const row = await prisma.emailCreditOrder.findFirst({ where: { id: BigInt(order.id) } });
    expect(row!.accountId).toBe(fx.tenantId);
    // which resort asked is worth keeping — an owner with three of them wants
    // to know which one is sending the mail
    expect(row!.resortId).toBe(fx.resortId);
  });

  it("raises the charge against the owner's account", async () => {
    const order = await engage().requestCredits(owner, 500);
    await engage().decideCreditOrder(platform, Number(order.id), "APPROVE");
    const charge = await prisma.platformCharge.findFirst({ where: { accountId: fx.tenantId } });
    expect(charge).not.toBeNull();
    expect(charge!.resortId).toBe(fx.resortId);
  });
});
