/**
 * Taking an advance against a salary.
 *
 * Payroll could record one payment per employee per month — a unique index
 * said so — and that one payment was the whole salary. Real payroll at a
 * resort does not work that way: a cook on 15,000 takes 2,000 on the 8th and
 * 5,000 on the 20th, and what is handed over at the end of the month is the
 * 8,000 that is left. The screen could not say any of that. It offered "Pay",
 * and then "already paid for 2026-09 — undo it first".
 *
 * So a month holds as many payments as it took, and the sheet's question stops
 * being "paid?" and becomes "how much of this salary is still owed".
 *
 * **An advance and a settlement are the same money and a different fact.** The
 * kind is recorded because the owner asks two different questions of it — what
 * did we hand out early, and is this month closed — and because "Advance · 8
 * Sep · ৳2,000" is what the person reading the sheet needs to see.
 *
 * Money already recorded is untouched: every row that existed before this is a
 * settlement, which is what it was.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePayrollService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let cookId: number;

const MONTH = "2026-09";
const payroll = () => makePayrollService(asPrisma);

const rowFor = async (employeeId: number, month = MONTH) => {
  const sheet = await payroll().sheet(owner, fx.resortId, month);
  return sheet.rows.find((r) => r.employeeId === employeeId)!;
};

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  const cook = await payroll().addEmployee(owner, fx.resortId, {
    name: "Jamal Hossain",
    designation: "Cook",
    salary: 15000,
  });
  cookId = cook.id;
});

afterAll(async () => prisma.$disconnect());

describe("an advance", () => {
  it("is money handed over against the month, and the sheet says how much", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 2000, kind: "ADVANCE" });

    const row = await rowFor(cookId);
    expect(row.salary).toBe(15000);
    expect(row.advance).toBe(2000);
    expect(row.paid).toBe(2000);
    expect(row.remaining).toBe(13000);
    expect(row.settled).toBe(false);
  });

  /**
   * The complaint in one test. The month used to hold one payment and refuse
   * the second — "already paid for 2026-09 — undo it first" — which is not a
   * thing anybody wanted to hear about a 2,000 taka advance.
   */
  it("can be taken more than once in a month", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 2000, kind: "ADVANCE" });
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 5000, kind: "ADVANCE" });

    const row = await rowFor(cookId);
    expect(row.advance).toBe(7000);
    expect(row.remaining).toBe(8000);
    expect(row.payments).toHaveLength(2);
  });

  it("is listed with the date it was taken and how it was paid", async () => {
    await payroll().pay(owner, fx.resortId, cookId, {
      month: MONTH,
      amount: 2000,
      kind: "ADVANCE",
      method: "BKASH",
      note: "for his mother's treatment",
    });

    const [entry] = (await rowFor(cookId)).payments;
    expect(entry).toMatchObject({ kind: "ADVANCE", amount: 2000, method: "BKASH" });
    expect(entry!.note).toBe("for his mother's treatment");
    expect(entry!.paidAt).toBeInstanceOf(Date);
  });
});

describe("settling the month", () => {
  /**
   * What "Pay salary" means once an advance has been taken: the rest of it.
   * Defaulting to the full salary would hand the cook 15,000 on top of the
   * 7,000 he already has.
   */
  it("pays what is left, not the whole salary again", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 7000, kind: "ADVANCE" });

    const settlement = await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, kind: "SALARY" });

    expect(settlement.amount).toBe(8000);
    const row = await rowFor(cookId);
    expect(row.paid).toBe(15000);
    expect(row.remaining).toBe(0);
    expect(row.settled).toBe(true);
  });

  it("is the whole salary when nothing was taken early", async () => {
    const settlement = await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, kind: "SALARY" });

    expect(settlement.amount).toBe(15000);
    expect((await rowFor(cookId)).settled).toBe(true);
  });

  it("refuses to settle a month that owes nothing", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, kind: "SALARY" });

    await expect(
      payroll().pay(owner, fx.resortId, cookId, { month: MONTH, kind: "SALARY" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * But an advance against a month already settled is still allowed, because
   * it is not a mistake — it is next month's money handed over early, and the
   * owner recording it against this month is the owner saying where it goes.
   */
  it("still lets an advance be recorded after settlement", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, kind: "SALARY" });

    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 1000, kind: "ADVANCE" });

    const row = await rowFor(cookId);
    expect(row.paid).toBe(16000);
    expect(row.remaining).toBe(0);
  });
});

describe("undoing one", () => {
  it("takes back that payment and no other", async () => {
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 2000, kind: "ADVANCE" });
    const second = await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 5000, kind: "ADVANCE" });

    await payroll().undoPay(owner, second.id);

    const row = await rowFor(cookId);
    expect(row.paid).toBe(2000);
    expect(row.payments).toHaveLength(1);
  });
});

describe("the month's totals", () => {
  it("count the advances apart from the wage bill they came out of", async () => {
    const guard = await payroll().addEmployee(owner, fx.resortId, { name: "Selim", salary: 10000 });
    await payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 7000, kind: "ADVANCE" });
    await payroll().pay(owner, fx.resortId, guard.id, { month: MONTH, kind: "SALARY" });

    const sheet = await payroll().sheet(owner, fx.resortId, MONTH);

    expect(sheet.totals.expected).toBe(25000);
    expect(sheet.totals.paid).toBe(17000);
    expect(sheet.totals.advance).toBe(7000);
    expect(sheet.totals.remaining).toBe(8000);
    expect(sheet.totals.settledCount).toBe(1);
  });
});

describe("what was recorded before any of this existed", () => {
  /**
   * Every payroll row that exists today was the month's salary, written when a
   * month could hold exactly one. Reading them as anything else would rewrite
   * history at the moment of the upgrade.
   */
  it("reads as a settlement, because that is what it was", async () => {
    await prisma.payrollPayment.create({
      data: { resortId: fx.resortId, employeeId: cookId, month: MONTH, amount: 15000 as never },
    });

    const row = await rowFor(cookId);
    expect(row.advance).toBe(0);
    expect(row.paid).toBe(15000);
    expect(row.settled).toBe(true);
    expect(row.payments[0]!.kind).toBe("SALARY");
  });
});

describe("a kind nobody declared", () => {
  it("is refused rather than filed under something", async () => {
    await expect(
      payroll().pay(owner, fx.resortId, cookId, { month: MONTH, amount: 100, kind: "BONUS" as never }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
