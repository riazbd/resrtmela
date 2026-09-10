/**
 * A resort's expense categories are a list it owns, not a memory of typos.
 *
 * `expenses.categories` did a `groupBy` over the expense rows themselves, so
 * the "list" was whatever anyone had ever typed. Nothing could be added before
 * it was used, nothing could be renamed, and "Salaries", "salary" and "Salery"
 * were three categories for ever — which is also three rows in every report
 * that groups by category.
 *
 * The resort already owns three lists this way (payment methods, booking
 * sources, activity categories). This is the fourth, and it needed no new
 * machinery — only the registry entry and a screen that reads it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeOptionsService, makeExpensesService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { OPTION_LISTS } from "../../src/options/registry";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const options = () => makeOptionsService(asPrisma);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("expense categories", () => {
  it("are one of the lists a resort owns", () => {
    expect(Object.keys(OPTION_LISTS)).toContain("EXPENSE_CATEGORY");
  });

  it("arrive with a resort, so the first expense has something to pick", async () => {
    const list = await options().list(owner, fx.resortId, "EXPENSE_CATEGORY");

    expect(list.length).toBeGreaterThan(0);
    expect(list.map((o) => o.code)).toContain("SALARY");
  });

  it("can be added to before anyone has spent anything on them", async () => {
    await options().create(owner, fx.resortId, "EXPENSE_CATEGORY", { code: "BOAT_FUEL", label: "Boat fuel" });

    const codes = (await options().list(owner, fx.resortId, "EXPENSE_CATEGORY")).map((o) => o.code);
    expect(codes).toContain("BOAT_FUEL");
  });

  it("can be renamed without touching the expenses already filed under them", async () => {
    await makeExpensesService(asPrisma).create(owner, fx.resortId, {
      date: "2027-03-01",
      category: "SALARY",
      amount: 5000,
    });

    const salary = (await options().list(owner, fx.resortId, "EXPENSE_CATEGORY"))
      .find((o) => o.code === "SALARY")!;
    await options().update(owner, fx.resortId, salary.id, { label: "Wages" });

    const list = await options().list(owner, fx.resortId, "EXPENSE_CATEGORY");
    expect(list.find((o) => o.code === "SALARY")?.label).toBe("Wages");
    const rows = await prisma.expense.findMany({ where: { resortId: fx.resortId } });
    expect(rows[0]!.category).toBe("SALARY");
  });

  it("refuse a category the resort has not got", async () => {
    await expect(
      makeExpensesService(asPrisma).create(owner, fx.resortId, {
        date: "2027-03-01",
        category: "MOONBEAMS",
        amount: 100,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
