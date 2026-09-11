/**
 * Selling email packs with no payment gateway.
 *
 * There is no merchant account, so the money arrives by hand — bKash, a bank
 * transfer, cash across a desk. That is exactly why a pack is a request the
 * platform approves rather than a purchase: **approval is the receipt.** The
 * owner takes the money, then approves, and the credits appear.
 *
 * Three things follow, and none of them were true:
 *
 * - **Approving has to record that the money came in.** The charge was raised
 *   as DUE, so the platform's outstanding figure counted money already in the
 *   owner's hand and the pack had to be chased down in the Dues tab and marked
 *   paid a second time.
 * - **The price list has to be the owner's.** `platform_settings.value` is
 *   VARCHAR(255) and `updateSettings` sliced to 255 before writing, so a list
 *   of more than about eight packs was cut mid-JSON. `parseCreditPacks` then
 *   fell back to the *shipped* list — quietly selling at prices the owner
 *   never set, with the console showing the save as successful.
 * - **The buyer has to be told where to send the money.** Nothing on the
 *   screen said how to pay for something that cannot be paid for online.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeEngageService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let platform: JwtClaims;

const engage = () => makeEngageService(asPrisma);
const admin = () => makePlatformService(asPrisma);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  const su = await prisma.user.create({
    data: { name: "Platform", phone: `8897${Math.floor(Math.random() * 1e8)}`, email: `8897${Math.floor(Math.random() * 1e8)}@example.com`, role: "SUPER_ADMIN" },
  });
  platform = { userId: su.id, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Ten packs — more than fits in 255 characters of JSON. */
const TEN_PACKS = Array.from({ length: 10 }, (_, i) => ({
  credits: (i + 1) * 1000,
  price: (i + 1) * 900,
}));

describe("the price list is the owner's", () => {
  it("sells what was saved, not what was shipped", async () => {
    await admin().updateSettings(platform, {
      "email.creditPacks": JSON.stringify([{ credits: 750, price: 640 }]),
    });

    const packs = await engage().creditPacks();

    expect(packs).toEqual([{ credits: 750, price: 640 }]);
  });

  it("keeps a long price list whole", async () => {
    // 10 packs is ~300 characters of JSON. Sliced to 255 it is broken JSON,
    // and the parser then falls back to the shipped prices — the platform
    // selling at rates the owner never agreed to, with no error anywhere.
    await admin().updateSettings(platform, {
      "email.creditPacks": JSON.stringify(TEN_PACKS),
    });

    const packs = await engage().creditPacks();

    expect(packs).toHaveLength(10);
    expect(packs[9]).toEqual({ credits: 10_000, price: 9_000 });
  });

  it("refuses a price list that is not a price list, instead of reverting later", async () => {
    await expect(
      admin().updateSettings(platform, { "email.creditPacks": "{not json" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a pack with no price attached to it", async () => {
    await expect(
      admin().updateSettings(platform, {
        "email.creditPacks": JSON.stringify([{ credits: 500 }]),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("still refuses a setting nobody has heard of", async () => {
    await expect(
      admin().updateSettings(platform, { "email.freeForever": "yes" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("approving is the receipt", () => {
  it("marks the charge paid, because the money is already in hand", async () => {
    const order = await engage().requestCredits(owner, 500);

    await engage().decideCreditOrder(platform, order.id, "APPROVE", { method: "bKash" });

    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(charge.status).toBe("PAID");
    expect(charge.paidAt).not.toBeNull();
    expect(charge.note).toMatch(/bKash/i);
  });

  it("settles the charge even when nobody typed how the money arrived", async () => {
    // the rule is that approval only ever follows payment, so the default
    // cannot be "owing" — the console has no button that says otherwise
    const order = await engage().requestCredits(owner, 500);

    await engage().decideCreditOrder(platform, order.id, "APPROVE");

    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(charge.status).toBe("PAID");
  });

  it("leaves it owing only when someone deliberately says it is unpaid", async () => {
    const order = await engage().requestCredits(owner, 500);

    await engage().decideCreditOrder(platform, order.id, "APPROVE", { paid: false, note: "pays Thursday" });

    const charge = await prisma.platformCharge.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(charge.status).toBe("DUE");
    expect(charge.paidAt).toBeNull();
  });

  it("grants the credits either way", async () => {
    const a = await engage().requestCredits(owner, 500, { clientRef: "a" });
    await engage().decideCreditOrder(platform, a.id, "APPROVE", { paid: false });

    const credit = await prisma.emailCredit.findFirstOrThrow({ where: { userId: fx.managerId } });
    expect(credit.credits).toBe(500);
  });

  it("keeps money already taken out of the outstanding figure", async () => {
    const a = await engage().requestCredits(owner, 500, { clientRef: "a" });
    const b = await engage().requestCredits(owner, 2000, { clientRef: "b" });
    await engage().decideCreditOrder(platform, a.id, "APPROVE", { method: "cash" });
    await engage().decideCreditOrder(platform, b.id, "APPROVE", { paid: false });

    const owing = await prisma.platformCharge.aggregate({
      where: { resortId: fx.resortId, status: "DUE" },
      _sum: { amount: true },
    });
    // only the pack that has not been paid for
    expect(Number(owing._sum.amount ?? 0)).toBe(1800);
  });

  it("says on the order how the money came in", async () => {
    const order = await engage().requestCredits(owner, 500);

    const decided = await engage().decideCreditOrder(platform, order.id, "APPROVE", { method: "bank transfer" });

    expect(decided.note).toMatch(/bank transfer/i);
  });
});

describe("telling the buyer where to send the money", () => {
  it("carries the platform's payment instructions to the screen they buy on", async () => {
    await admin().updateSettings(platform, {
      "platform.paymentInstructions": "bKash 01711-000000 (personal), then approve takes a few hours",
    });

    const mine = await engage().myEmailCredits(owner);

    expect(mine.payTo).toMatch(/bKash/);
  });

  it("says nothing rather than something wrong when the platform has not set them", async () => {
    const mine = await engage().myEmailCredits(owner);

    expect(mine.payTo).toBe("");
  });
});
