/**
 * The guest app has to be told what the money is.
 *
 * The public endpoints returned prices as bare numbers and never said which
 * currency they were in, so the mobile app had its own formatter that printed
 * "Tk" onto every figure regardless. A resort keeping its books in dollars had
 * its rates shown to guests in taka — the right number, the wrong money, and
 * nothing on either side that could notice.
 *
 * The resort already carries a currency. It just was not being sent.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeGuestService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const guest = () => makeGuestService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what money these prices are in", () => {
  it("says so on the discovery list", async () => {
    const resorts = await guest().discover();

    expect(resorts.find((r) => r.id === fx.resortId)!.currency).toBe("BDT");
  });

  it("says so on a resort's own page", async () => {
    const detail = await guest().resortDetail(fx.resortId);

    expect(detail.currency).toBe("BDT");
  });

  it("sends the resort's currency, not the platform's habit", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { currency: "USD" } });

    expect((await guest().resortDetail(fx.resortId)).currency).toBe("USD");
    expect((await guest().discover()).find((r) => r.id === fx.resortId)!.currency).toBe("USD");
  });
});
