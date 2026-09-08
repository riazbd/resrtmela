/**
 * A list that quietly stops at its cap tells the owner a number that is not
 * true. Every capped list must say how much it did not show.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ExpensesService } from "../../src/expenses/expenses.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { TenantStateService } from "../../src/common/tenant-state.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const expensesService = () =>
  new ExpensesService(
    asPrismaService,
    new AuditService(asPrismaService),
    new PermissionsService(asPrismaService),
    new TenantStateService(asPrismaService),
  );

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedExpenses(n: number) {
  await prisma.expense.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      resortId: fx.resortId,
      date: new Date("2026-08-15T00:00:00Z"),
      category: `Category ${i}`,
      amount: 100 as never,
    })),
  });
}

describe("a capped list", () => {
  it("reports the true total, not the number of rows it returned", async () => {
    await seedExpenses(12);

    const page = await expensesService().list(claims, fx.resortId, undefined, undefined, undefined, {
      take: 5,
    });

    expect(page.rows).toHaveLength(5);
    expect(page.total).toBe(12);
    expect(page.truncated).toBe(true);
  });

  it("says so plainly when nothing was left out", async () => {
    await seedExpenses(3);

    const page = await expensesService().list(claims, fx.resortId);

    expect(page.rows).toHaveLength(3);
    expect(page.total).toBe(3);
    expect(page.truncated).toBe(false);
  });

  it("can be paged past the cap", async () => {
    await seedExpenses(12);
    const svc = expensesService();

    const first = await svc.list(claims, fx.resortId, undefined, undefined, undefined, { take: 5 });
    const second = await svc.list(claims, fx.resortId, undefined, undefined, undefined, {
      take: 5,
      skip: 5,
    });

    expect(second.rows).toHaveLength(5);
    expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id);
    expect(second.total).toBe(12);
  });
});

describe("the guest directory", () => {
  it("reports how many guests exist, not just how many it listed", async () => {
    await prisma.guest.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        resortId: fx.resortId,
        fullName: `Guest ${i}`,
        phone: `88017000000${i}`,
        phoneKey: `key-${i}`,
      })),
    });

    const page = await makeBookingsService(asPrismaService).guests(claims, fx.resortId, undefined, {
      take: 3,
    });

    expect(page.rows).toHaveLength(3);
    expect(page.total).toBe(9); // 8 seeded here + 1 from the fixture
    expect(page.truncated).toBe(true);
  });
});
