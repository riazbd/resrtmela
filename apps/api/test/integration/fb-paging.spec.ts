/**
 * The restaurant bill list, when a resort has been open a while.
 *
 * It stopped at a hard `take: 300` and returned a bare array, so a busy
 * kitchen's fourth month simply vanished — the screen showed 300 bills and
 * said nothing about the rest. This is the one list of the remaining bare
 * arrays a working resort actually reaches: a resort doing twenty covers a day
 * passes 300 bills inside three weeks.
 *
 * A list that quietly stops at its cap reports a number that is not true.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeFbService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const fb = () => makeFbService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedBills(count: number) {
  await prisma.fbBill.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      resortId: fx.resortId,
      code: `RES-${String(i + 1).padStart(5, "0")}`,
      billDate: new Date("2026-04-01"),
      guestName: `Guest ${i + 1}`,
    })),
  });
}

describe("restaurant bill paging", () => {
  it("says how many there really are, not how many it returned", async () => {
    await seedBills(12);

    const page = await fb().list(claims, fx.resortId, { take: 5 });

    expect(page.rows).toHaveLength(5);
    expect(page.total).toBe(12);
    expect(page.truncated).toBe(true);
  });

  it("pages through the rest instead of hiding them", async () => {
    await seedBills(12);

    const second = await fb().list(claims, fx.resortId, { skip: 5, take: 5 });
    const last = await fb().list(claims, fx.resortId, { skip: 10, take: 5 });

    expect(second.rows).toHaveLength(5);
    expect(last.rows).toHaveLength(2);
    expect(last.truncated).toBe(false);
  });

  it("counts what the filter selected, not the whole table", async () => {
    await seedBills(4);
    await prisma.fbBill.create({
      data: { resortId: fx.resortId, code: "RES-99999", billDate: new Date("2026-06-01"), guestName: "Later" },
    });

    const page = await fb().list(claims, fx.resortId, { from: "2026-04-01", to: "2026-04-02" });

    expect(page.total).toBe(4);
  });

  it("never counts another resort's bills", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await seedBills(3);
    await prisma.fbBill.create({
      data: { resortId: other.resortId, code: "RES-00001", billDate: new Date("2026-04-01") },
    });

    const page = await fb().list(claims, fx.resortId, {});

    expect(page.total).toBe(3);
  });
});
