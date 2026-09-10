/**
 * The homepage's price list outlives the resort-website API.
 *
 * `/v1` (a resort's own website, X-Api-Key) and `/cms` (this platform's own
 * marketing content, no auth) were declared in one file called
 * `public-api.controller.ts`. Removing `/v1` by deleting that file would take
 * the pricing cards off resortmela.app and stop anybody signing up — the
 * platform would lose its own shopfront while closing somebody else's door.
 *
 * This is the test that notices.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb } from "../helpers/db";
import { MarketingController } from "../../src/platform/marketing.controller";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  // resetDb seeds multiple plans; remove others to isolate STARTER for this test
  await prisma.platformPlan.deleteMany({ where: { name: { in: ["GROWTH", "CHAIN"] } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const controller = () => new MarketingController(makePlatformService(asPrisma));

describe("the platform's own shopfront", () => {
  it("still quotes a price list", async () => {
    const plans = await controller().plans();

    expect(plans).toHaveLength(1);
  });

  it("names a plan the owner can edit, not one written into the code", async () => {
    const plans = await controller().plans();

    expect(plans.map((p) => p.name)).toContain("STARTER");
  });

  it("carries the ticks the card draws, so an empty list is a visible failure", async () => {
    const plans = await controller().plans();

    expect(Array.isArray(plans[0]!.features)).toBe(true);
    expect(typeof plans[0]!.monthlyFee).toBe("number");
  });
});
