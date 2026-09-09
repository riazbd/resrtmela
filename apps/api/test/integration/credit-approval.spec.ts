/**
 * Buying email credits is a request, not a transaction.
 *
 * Pressing a pack button used to grant the credits in the same request: no
 * confirmation, no review, and a charge on the tenant's platform bill that
 * nobody at the platform had agreed to. A misclick on ৳12,000 was a ৳12,000
 * charge, and a resort could raise unlimited billable charges against itself
 * with nothing between the click and the invoice.
 *
 * The owner's rule is that a purchase is **pending until the platform approves
 * it**. So:
 *
 * - The request creates an order and nothing else. No credits, no charge.
 * - A super admin approves, and *that* is the moment credits are granted and
 *   the charge is raised — in one transaction, because credits with no charge
 *   behind them is the platform giving its product away.
 * - Or rejects, and neither happens.
 *
 * The idempotency that used to protect the purchase now protects the request:
 * a retried submit finds its own order rather than queuing a second one.
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
let platform: JwtClaims;

const engage = () => makeEngageService(asPrisma);

async function setPacks(packs: { credits: number; price: number }[]) {
  await prisma.platformSetting.upsert({
    where: { key: "email.creditPacks" },
    update: { value: JSON.stringify(packs) },
    create: { key: "email.creditPacks", value: JSON.stringify(packs) },
  });
}

const creditsOf = async (userId: number) =>
  (await prisma.emailCredit.findUnique({ where: { userId } }))?.credits ?? 0;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  platform = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await setPacks([{ credits: 500, price: 500 }, { credits: 2000, price: 1800 }]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("asking for a pack", () => {
  it("queues an order and grants nothing yet", async () => {
    const r = await engage().requestCredits(owner, 2000);

    expect(r.status).toBe("PENDING");
    expect(r.credits).toBe(2000);
    expect(r.price).toBe(1800);
    expect(await creditsOf(fx.managerId)).toBe(0);
  });

  it("raises no charge until somebody agrees to it", async () => {
    await engage().requestCredits(owner, 2000);

    expect(await prisma.platformCharge.count({ where: { resortId: fx.resortId } })).toBe(0);
  });

  it("refuses a size nobody is selling", async () => {
    await expect(engage().requestCredits(owner, 12_345)).rejects.toMatchObject({ status: 400 });
  });

  it("queues one order however many times the submit is retried", async () => {
    const a = await engage().requestCredits(owner, 500, { clientRef: "desk-1" });
    const b = await engage().requestCredits(owner, 500, { clientRef: "desk-1" });

    expect(b.id).toBe(a.id);
    expect(await prisma.emailCreditOrder.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("is refused to someone who may not buy marketing", async () => {
    const role = await prisma.customRole.create({
      data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions: ["bookings.view"] },
    });
    const user = await prisma.user.create({
      data: { name: "Clerk", phone: `8809${Math.floor(Math.random() * 1e8)}`, role: ROLE.FRONT_DESK, status: "active" },
    });
    await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId: role.id } });

    await expect(
      engage().requestCredits({ userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] }, 500),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("the platform deciding", () => {
  it("grants the credits and raises the charge together, on approval", async () => {
    const order = await engage().requestCredits(owner, 2000);

    const r = await engage().decideCreditOrder(platform, order.id, "APPROVE");

    expect(r.status).toBe("APPROVED");
    expect(await creditsOf(fx.managerId)).toBe(2000);
    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(Number(charge.amount)).toBe(1800);
  });

  it("adds to credits already held rather than replacing them", async () => {
    const first = await engage().requestCredits(owner, 500, { clientRef: "a" });
    await engage().decideCreditOrder(platform, first.id, "APPROVE");
    const second = await engage().requestCredits(owner, 2000, { clientRef: "b" });

    await engage().decideCreditOrder(platform, second.id, "APPROVE");

    expect(await creditsOf(fx.managerId)).toBe(2500);
  });

  it("grants nothing and charges nothing on rejection", async () => {
    const order = await engage().requestCredits(owner, 2000);

    const r = await engage().decideCreditOrder(platform, order.id, "REJECT", "not this month");

    expect(r.status).toBe("REJECTED");
    expect(await creditsOf(fx.managerId)).toBe(0);
    expect(await prisma.platformCharge.count({ where: { resortId: fx.resortId } })).toBe(0);
  });

  it("cannot approve the same order twice", async () => {
    const order = await engage().requestCredits(owner, 2000);
    await engage().decideCreditOrder(platform, order.id, "APPROVE");

    await expect(
      engage().decideCreditOrder(platform, order.id, "APPROVE"),
    ).rejects.toMatchObject({ status: 400 });
    expect(await creditsOf(fx.managerId)).toBe(2000);
  });

  it("is the platform's decision, not the buyer's", async () => {
    const order = await engage().requestCredits(owner, 2000);

    await expect(
      engage().decideCreditOrder(owner, order.id, "APPROVE"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("prices the order at what was quoted, not at today's price list", async () => {
    const order = await engage().requestCredits(owner, 2000);
    // the platform puts its prices up after the request was made
    await setPacks([{ credits: 500, price: 500 }, { credits: 2000, price: 9999 }]);

    await engage().decideCreditOrder(platform, order.id, "APPROVE");

    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(Number(charge.amount)).toBe(1800);
  });

  it("tells the buyer either way", async () => {
    const order = await engage().requestCredits(owner, 2000);

    await engage().decideCreditOrder(platform, order.id, "REJECT");

    const told = await prisma.notification.count({
      where: { userId: fx.managerId, title: { contains: "credit" } },
    });
    expect(told).toBeGreaterThan(0);
  });
});

describe("what each side can see", () => {
  it("shows the buyer their own orders, newest first", async () => {
    await engage().requestCredits(owner, 500, { clientRef: "a" });
    await engage().requestCredits(owner, 2000, { clientRef: "b" });

    const mine = await engage().myCreditOrders(owner);

    expect(mine).toHaveLength(2);
    expect(mine[0]!.credits).toBe(2000);
  });

  it("shows the platform everything still waiting", async () => {
    const a = await engage().requestCredits(owner, 500, { clientRef: "a" });
    await engage().requestCredits(owner, 2000, { clientRef: "b" });
    await engage().decideCreditOrder(platform, a.id, "APPROVE");

    const waiting = await engage().listCreditOrders(platform, "PENDING");

    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.credits).toBe(2000);
  });

  it("keeps the queue away from a resort owner", async () => {
    await expect(engage().listCreditOrders(owner, "PENDING")).rejects.toMatchObject({ status: 403 });
  });
});

describe("sending, which still needs credits in hand", () => {
  it("refuses a campaign while the pack is only requested", async () => {
    await engage().requestCredits(owner, 2000);

    await expect(
      engage().sendCampaign(owner, {
        subject: "Eid offer", body: "Come and stay", audience: "RESORT_GUESTS", resortId: fx.resortId,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
