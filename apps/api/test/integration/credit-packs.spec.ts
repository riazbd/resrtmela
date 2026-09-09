/**
 * What an email credit pack costs, and who decides.
 *
 * The packs were written out three times — in the console, in the request
 * validator, and again in the service — and the *prices* existed only in the
 * console, as strings. So the platform could not change what it sells without
 * a deploy, and the three lists could disagree with each other in the meantime.
 *
 * Worse: the console showed a price and the server took no money. A resort
 * clicked "৳1,800 for 2,000 credits" and was granted 2,000 credits, free. A
 * price on a button that charges nothing is not a bug in pricing, it is the
 * software lying about what it just did.
 *
 * Packs are commercial terms, so they belong where the platform's other
 * commercial terms already live: platform settings, owned by the super admin,
 * read by both sides.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeEngageService, makePlatformSettings } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

const engage = () => makeEngageService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** What the super admin has decided to sell today. */
async function setPacks(packs: { credits: number; price: number }[]) {
  await prisma.platformSetting.upsert({
    where: { key: "email.creditPacks" },
    update: { value: JSON.stringify(packs) },
    create: { key: "email.creditPacks", value: JSON.stringify(packs) },
  });
  makePlatformSettings(asPrismaService); // fresh instance: the cache is per-service
}

describe("what is on sale", () => {
  it("ships a starting list, so a fresh platform sells something", async () => {
    const packs = await engage().creditPacks();

    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.price).toBeGreaterThanOrEqual(0);
    }
  });

  it("sells what the super admin says, not what was compiled in", async () => {
    await setPacks([{ credits: 750, price: 600 }]);

    const packs = await engage().creditPacks();

    expect(packs).toEqual([{ credits: 750, price: 600 }]);
  });

  it("falls back to the shipped list rather than selling nothing when the setting is nonsense", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "email.creditPacks" },
      update: { value: "not json at all" },
      create: { key: "email.creditPacks", value: "not json at all" },
    });

    expect((await engage().creditPacks()).length).toBeGreaterThan(0);
  });
});

describe("buying one", () => {
  it("grants exactly the pack that was bought", async () => {
    await setPacks([{ credits: 750, price: 600 }]);

    const result = await engage().purchaseCredits(manager, 750);

    expect(result).toMatchObject({ added: 750, credits: 750 });
  });

  it("refuses a size nobody is selling, however plausible", async () => {
    await setPacks([{ credits: 750, price: 600 }]);

    await expect(engage().purchaseCredits(manager, 2000)).rejects.toThrow(/750/);
  });

  it("records what is owed, because nothing was actually charged", async () => {
    await setPacks([{ credits: 750, price: 600 }]);

    await engage().purchaseCredits(manager, 750);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "email.credits.purchase" },
      orderBy: { id: "desc" },
    });
    // the platform has to be able to invoice this later; an audit row that
    // records only the credits leaves no record of the amount
    expect(entry!.diff).toMatchObject({ credits: 750, price: 600 });
  });

  it("adds to what is already there rather than replacing it", async () => {
    await setPacks([{ credits: 750, price: 600 }]);

    await engage().purchaseCredits(manager, 750);
    const second = await engage().purchaseCredits(manager, 750);

    expect(second.credits).toBe(1500);
  });
});
