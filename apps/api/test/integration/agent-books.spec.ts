/**
 * The agency's own books: what it spends, and who it pays.
 *
 * An agency keeps accounts the same way a resort does — heads of expenditure
 * with entries under them, and a salary sheet per month — so these ride on the
 * same tables the resort side already uses, with the owner being an agency
 * instead of a resort. Two tables for the same act would drift apart, and the
 * day they did, a bug fixed on one side would still be live on the other.
 *
 * Sharing the tables is only safe if the two sides cannot see each other, so
 * that is what most of this file is about.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import {
  makePlatformService,
  makeAgentService,
  makeBooksService,
  makeExpensesService,
  makePayrollService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let manager: JwtClaims;

const books = () => makeBooksService(asPrismaService);
const agents = () => makeAgentService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hire(name: string, permissions: string[]) {
  const staff = await platform().createAgentStaff(agency, {
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    password: "password123",
  });
  const role = await agents().createRole(agency, { name: `${name} role`, permissions });
  await agents().assignRole(agency, staff.id, role.id);
  return { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] } as JwtClaims;
}

describe("heads of expenditure", () => {
  it("starts empty — the agency writes its own list", async () => {
    expect(await books().heads(agency)).toEqual([]);
  });

  it("refuses the same head twice", async () => {
    await books().createHead(agency, { name: "Office rent" });

    await expect(books().createHead(agency, { name: "Office rent" })).rejects.toThrow(/already/i);
  });

  it("counts what has been filed under each head", async () => {
    const fuel = await books().createHead(agency, { name: "Fuel" });
    await books().addExpense(agency, { date: "2026-09-01", headId: fuel.id, amount: 800 });
    await books().addExpense(agency, { date: "2026-09-02", headId: fuel.id, amount: 1200 });

    const [head] = await books().heads(agency);
    expect(head).toMatchObject({ name: "Fuel", entries: 2, amount: 2000 });
  });

  it("keeps a head that has been used, by retiring it rather than deleting it", async () => {
    const fuel = await books().createHead(agency, { name: "Fuel" });
    await books().addExpense(agency, { date: "2026-09-01", headId: fuel.id, amount: 800 });

    const result = await books().deleteHead(agency, fuel.id);

    // the expense keeps its head, so last year's report still adds up
    expect(result).toEqual({ deactivated: true });
    expect((await books().heads(agency))[0]!.active).toBe(false);
  });

  it("deletes a head nothing was ever filed under", async () => {
    const typo = await books().createHead(agency, { name: "Ofice rent" });

    expect(await books().deleteHead(agency, typo.id)).toEqual({ deleted: true });
    expect(await books().heads(agency)).toEqual([]);
  });

  it("renames a head everywhere at once", async () => {
    const head = await books().createHead(agency, { name: "Fuel" });
    await books().addExpense(agency, { date: "2026-09-01", headId: head.id, amount: 800 });

    await books().updateHead(agency, head.id, { name: "Fuel & tolls" });

    const view = await books().expenses(agency, {});
    expect(view.summary.byHead).toEqual([{ headId: head.id, head: "Fuel & tolls", amount: 800 }]);
  });
});

describe("the agency's expenses", () => {
  it("adds up the selection, not the page", async () => {
    const fuel = await books().createHead(agency, { name: "Fuel" });
    const rent = await books().createHead(agency, { name: "Office rent" });
    await books().addExpense(agency, { date: "2026-09-01", headId: fuel.id, amount: 800 });
    await books().addExpense(agency, { date: "2026-09-05", headId: rent.id, amount: 25000 });
    await books().addExpense(agency, { date: "2026-10-01", headId: fuel.id, amount: 900 });

    const view = await books().expenses(agency, { from: "2026-09-01", to: "2026-10-01" });

    expect(view.summary.amount).toBe(25800);
    expect(view.summary.byHead).toEqual([
      { headId: rent.id, head: "Office rent", amount: 25000 },
      { headId: fuel.id, head: "Fuel", amount: 800 },
    ]);
  });

  it("refuses an entry with no head, because a report needs one", async () => {
    await expect(
      books().addExpense(agency, { date: "2026-09-01", headId: 0, amount: 100 }),
    ).rejects.toThrow(/head/i);
  });

  it("refuses another agency's head", async () => {
    const mine = await books().createHead(agency, { name: "Fuel" });
    const other = await prisma.user.create({
      data: { name: "Other Agency", phone: `8811${Date.now() % 100000000}`, role: "AGENT" },
    });

    await expect(
      books().addExpense(
        { userId: other.id, role: ROLE.AGENT, resortIds: [] },
        { date: "2026-09-01", headId: mine.id, amount: 100 },
      ),
    ).rejects.toThrow(/not your/i);
  });

  it("refuses money that is not money", async () => {
    const head = await books().createHead(agency, { name: "Fuel" });

    await expect(
      books().addExpense(agency, { date: "2026-09-01", headId: head.id, amount: -5 }),
    ).rejects.toThrow(/more than zero/i);
  });

  it("stores one entry when an offline device sends its write twice", async () => {
    const head = await books().createHead(agency, { name: "Fuel" });
    const body = { date: "2026-09-01", headId: head.id, amount: 800, clientRef: "device-a-9" };

    const first = await books().addExpense(agency, body);
    const second = await books().addExpense(agency, body);

    expect(second.id).toBe(first.id);
    expect((await books().expenses(agency, {})).summary.amount).toBe(800);
  });
});

describe("the two sides cannot see each other", () => {
  it("keeps the agency's costs out of the resort's expense list", async () => {
    const head = await books().createHead(agency, { name: "Fuel" });
    await books().addExpense(agency, { date: "2026-09-01", headId: head.id, amount: 800 });

    const resortSide = await makeExpensesService(asPrismaService).list(manager, fx.resortId);

    expect(resortSide.rows).toEqual([]);
    expect(resortSide.summary.amount).toBe(0);
  });

  it("keeps the resort's costs out of the agency's books", async () => {
    await makeExpensesService(asPrismaService).create(manager, fx.resortId, {
      date: "2026-09-01",
      category: "Diesel",
      amount: 5000,
    });

    const view = await books().expenses(agency, {});

    expect(view.rows).toEqual([]);
    expect(view.summary.amount).toBe(0);
  });

  it("will not let a resort delete an agency's expense", async () => {
    const head = await books().createHead(agency, { name: "Fuel" });
    const exp = await books().addExpense(agency, { date: "2026-09-01", headId: head.id, amount: 800 });

    await expect(makeExpensesService(asPrismaService).remove(manager, exp.id)).rejects.toThrow();
  });

  it("keeps the agency's staff off the resort's payroll sheet", async () => {
    await books().addEmployee(agency, { name: "Agency driver", salary: 18000 });

    const sheet = await makePayrollService(asPrismaService).sheet(manager, fx.resortId, "2026-09");

    expect(sheet.rows).toEqual([]);
  });
});

describe("the agency's payroll", () => {
  it("shows every active person with what they are owed", async () => {
    await books().addEmployee(agency, { name: "Rakib", designation: "Counter", salary: 18000 });
    await books().addEmployee(agency, { name: "Shiuli", designation: "Accounts", salary: 22000 });

    const sheet = await books().payrollSheet(agency, "2026-09");

    expect(sheet.totals).toMatchObject({ expected: 40000, paid: 0, headcount: 2, paidCount: 0 });
  });

  it("pays someone once for a month, and says so if asked twice", async () => {
    const emp = await books().addEmployee(agency, { name: "Rakib", salary: 18000 });

    await books().pay(agency, emp.id, { month: "2026-09" });

    await expect(books().pay(agency, emp.id, { month: "2026-09" })).rejects.toThrow(/already paid/i);
    const sheet = await books().payrollSheet(agency, "2026-09");
    expect(sheet.totals.paid).toBe(18000);
  });

  it("undoes a payment made by mistake", async () => {
    const emp = await books().addEmployee(agency, { name: "Rakib", salary: 18000 });
    const pay = await books().pay(agency, emp.id, { month: "2026-09" });

    await books().undoPay(agency, pay.id);

    expect((await books().payrollSheet(agency, "2026-09")).totals.paid).toBe(0);
  });

  it("refuses to pay another agency's employee", async () => {
    const emp = await books().addEmployee(agency, { name: "Rakib", salary: 18000 });
    const other = await prisma.user.create({
      data: { name: "Other Agency 2", phone: `8812${Date.now() % 100000000}`, role: "AGENT" },
    });

    await expect(
      books().pay({ userId: other.id, role: ROLE.AGENT, resortIds: [] }, emp.id, { month: "2026-09" }),
    ).rejects.toThrow(/not your/i);
  });

  it("keeps someone who has been paid, by deactivating rather than deleting", async () => {
    const emp = await books().addEmployee(agency, { name: "Rakib", salary: 18000 });
    await books().pay(agency, emp.id, { month: "2026-09" });

    expect(await books().removeEmployee(agency, emp.id)).toEqual({ deactivated: true });
    // they leave the sheet, because nobody owes them next month's salary —
    // but September's payment stays, so last month's books still add up
    expect((await books().payrollSheet(agency, "2026-09")).rows).toEqual([]);
    const paid = await prisma.payrollPayment.findFirst({ where: { employeeId: emp.id } });
    expect(Number(paid!.amount)).toBe(18000);
  });
});

describe("who may keep the books", () => {
  it("hides the money from a junior who only books", async () => {
    const junior = await hire("Junior", ["agent.book"]);

    await expect(books().expenses(junior, {})).rejects.toThrow(/agent\.expenses\.manage/);
    await expect(books().payrollSheet(junior, "2026-09")).rejects.toThrow(/agent\.payroll\.manage/);
  });

  it("lets an accountant keep the expenses without opening the payroll", async () => {
    const accounts = await hire("Accounts", ["agent.expenses.manage"]);

    const head = await books().createHead(accounts, { name: "Fuel" });
    expect(head.name).toBe("Fuel");
    await expect(books().payrollSheet(accounts, "2026-09")).rejects.toThrow(/agent\.payroll\.manage/);
  });

  it("is closed to the resort's own staff entirely", async () => {
    await expect(books().expenses(manager, {})).rejects.toThrow(/agents only/i);
  });
});
