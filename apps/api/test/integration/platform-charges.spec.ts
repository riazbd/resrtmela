/**
 * One-off amounts a tenant owes the platform.
 *
 * Buying an email credit pack granted the credits and charged nothing. The
 * price was recorded in an audit row, which is a record but not a ledger: the
 * platform had to read the log to find out who owed what, and nothing marked a
 * charge as settled.
 *
 * `SubscriptionDue` could not take these. Its
 * `UNIQUE(subscriptionId, periodStart)` is what makes the monthly billing sweep
 * idempotent — run it twice on the same period and the second raises nothing —
 * and a second credit pack bought in the same month would collide with the
 * first. Weakening that index to fit one-off charges would trade the only
 * guarantee recurring billing has for a convenience, so one-off charges get
 * their own ledger with their own idempotency: the identity of the act that
 * raised them.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeEngageService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;
let superAdmin: JwtClaims;

const engage = () => makeEngageService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  const su = await prisma.user.create({
    data: { name: "Platform", phone: `8898${Date.now() % 100000000}`, role: "SUPER_ADMIN" },
  });
  superAdmin = { userId: su.id, role: ROLE.SUPER_ADMIN, resortIds: [] };
  await prisma.platformSetting.upsert({
    where: { key: "email.creditPacks" },
    update: { value: JSON.stringify([{ credits: 750, price: 600 }]) },
    create: { key: "email.creditPacks", value: JSON.stringify([{ credits: 750, price: 600 }]) },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("taking a credit pack", () => {
  it("raises a charge for what it costs", async () => {
    await engage().purchaseCredits(manager, 750);

    const charges = await prisma.platformCharge.findMany({ where: { resortId: fx.resortId } });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ kind: "EMAIL_CREDITS", status: "DUE" });
    expect(Number(charges[0]!.amount)).toBe(600);
  });

  it("says what the charge was for, in words a person can invoice from", async () => {
    await engage().purchaseCredits(manager, 750);

    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(charge.description).toMatch(/750/);
  });

  it("grants the credits and raises the charge together, or does neither", async () => {
    // the two used to be separate statements: credits could land with no
    // charge behind them if anything failed in between
    await engage().purchaseCredits(manager, 750);

    const credit = await prisma.emailCredit.findFirstOrThrow({ where: { userId: fx.managerId } });
    const charges = await prisma.platformCharge.count({ where: { resortId: fx.resortId } });
    expect(credit.credits).toBe(750);
    expect(charges).toBe(1);
  });

  it("charges once when the same purchase is replayed", async () => {
    const body = { clientRef: "device-c-7" };

    await engage().purchaseCredits(manager, 750, body);
    await engage().purchaseCredits(manager, 750, body);

    const credit = await prisma.emailCredit.findFirstOrThrow({ where: { userId: fx.managerId } });
    expect(await prisma.platformCharge.count({ where: { resortId: fx.resortId } })).toBe(1);
    expect(credit.credits).toBe(750);
  });

  it("charges twice for two genuine purchases in one month", async () => {
    // exactly what SubscriptionDue's period index would have refused
    await engage().purchaseCredits(manager, 750);
    await engage().purchaseCredits(manager, 750);

    expect(await prisma.platformCharge.count({ where: { resortId: fx.resortId } })).toBe(2);
  });
});

describe("what the platform is owed", () => {
  it("counts one-off charges alongside subscription dues", async () => {
    const sub = await prisma.subscription.create({
      data: { resortId: fx.resortId, plan: "STARTER", status: "ACTIVE", monthlyFee: 2500 },
    });
    await prisma.subscriptionDue.create({
      data: {
        subscriptionId: sub.id,
        resortId: fx.resortId,
        amount: 2500,
        periodStart: new Date("2026-09-01"),
        periodEnd: new Date("2026-10-01"),
        dueDate: new Date("2026-09-01"),
      },
    });
    await engage().purchaseCredits(manager, 750);

    const owed = await platform().outstanding(superAdmin);

    const row = owed.find((r) => r.resortId === fx.resortId)!;
    expect(row.subscriptions).toBe(2500);
    expect(row.charges).toBe(600);
    expect(row.total).toBe(3100);
  });

  it("stops counting a charge once it is settled", async () => {
    await engage().purchaseCredits(manager, 750);
    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });

    await platform().payCharge(superAdmin, Number(charge.id), "bKash");

    const owed = await platform().outstanding(superAdmin);
    expect(owed.find((r) => r.resortId === fx.resortId)?.charges ?? 0).toBe(0);
  });

  it("refuses to settle the same charge twice", async () => {
    await engage().purchaseCredits(manager, 750);
    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });

    await platform().payCharge(superAdmin, Number(charge.id), "bKash");

    await expect(platform().payCharge(superAdmin, Number(charge.id), "bKash")).rejects.toThrow(
      /already/i,
    );
  });

  it("is the platform team's screen alone", async () => {
    await expect(platform().outstanding(manager)).rejects.toThrow();
  });
});
