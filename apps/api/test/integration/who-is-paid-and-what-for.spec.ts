/**
 * Who is on payroll, from when, and what a month is worth to them.
 *
 * The owner, 2026-10-02: *"kar sathe kar connection, ke payroll e ashbe, ke
 * ashbe na, ki pabe ki pabe na, kichui bujha jay na."* Payroll was a list of
 * names and salaries, the same on every month, worth the salary and nothing
 * else — tied to nobody's login, blind to the day somebody started or left,
 * with no bonus, no deduction, and an advance bigger than the month simply
 * forgotten the month after.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBooksService, makePayrollService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let agency: JwtClaims;

const payroll = () => makePayrollService(asPrisma);
const books = () => makeBooksService(asPrisma);

const rowFor = async (employeeId: number, month: string) => {
  const sheet = await payroll().sheet(owner, fx.resortId, month);
  return sheet.rows.find((r) => r.employeeId === employeeId);
};

/** A colleague with a login at the fixture resort. */
async function colleague(name: string, role: "FRONT_DESK" | "MANAGER" | "HOUSEKEEPING" = "FRONT_DESK") {
  const n = Math.floor(Math.random() * 1e9);
  const user = await prisma.user.create({
    data: { name, email: `${n}@example.com`, phone: `8801${String(n).padStart(9, "0")}`, role },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId } });
  return user;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

describe("who is on a month", () => {
  it("pays the month somebody joined in for the days they were there", async () => {
    // 30,000 a month, joined on the 16th of a 30-day September: 15 days
    const cook = await payroll().addEmployee(owner, fx.resortId, {
      name: "Jamal",
      salary: 30000,
      joinDate: "2026-09-16",
    });
    const row = (await rowFor(cook.id, "2026-09"))!;
    expect(row.days).toBe(15);
    expect(row.daysInMonth).toBe(30);
    expect(row.due).toBe(15000);
    expect(row.remaining).toBe(15000);
  });

  it("is not on a month before joining", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, {
      name: "Jamal",
      salary: 30000,
      joinDate: "2026-09-16",
    });
    expect(await rowFor(cook.id, "2026-08")).toBeUndefined();
  });

  it("pays the month somebody left in for the days, and leaves them off the next", async () => {
    const guard = await payroll().addEmployee(owner, fx.resortId, { name: "Kalam", salary: 31000 });
    await payroll().pay(owner, fx.resortId, guard.id, { month: "2026-07", kind: "SALARY" });
    // left on the 10th of a 31-day August
    await payroll().removeEmployee(owner, fx.resortId, guard.id, "2026-08-10");

    const august = (await rowFor(guard.id, "2026-08"))!;
    expect(august.days).toBe(10);
    expect(august.due).toBe(10000);
    expect(await rowFor(guard.id, "2026-09")).toBeUndefined();
    // and the month they were paid in still shows them, so it adds up
    expect((await rowFor(guard.id, "2026-07"))!.paid).toBe(31000);
  });
});

describe("what a month is worth", () => {
  it("rises with a bonus and falls with a deduction, and paying settles that", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", salary: 15000 });
    await payroll().adjust(owner, fx.resortId, cook.id, { month: "2026-09", kind: "BONUS", amount: 3000, note: "Eid" });
    await payroll().adjust(owner, fx.resortId, cook.id, { month: "2026-09", kind: "DEDUCTION", amount: 500, note: "broken plate" });

    let row = (await rowFor(cook.id, "2026-09"))!;
    expect([row.base, row.bonus, row.deduction, row.due]).toEqual([15000, 3000, 500, 17500]);
    expect(row.adjustments.map((a) => [a.kind, a.amount, a.note])).toEqual([
      ["BONUS", 3000, "Eid"],
      ["DEDUCTION", 500, "broken plate"],
    ]);

    const paid = await payroll().pay(owner, fx.resortId, cook.id, { month: "2026-09", kind: "SALARY" });
    expect(paid.amount).toBe(17500);
    row = (await rowFor(cook.id, "2026-09"))!;
    expect(row.state).toBe("SETTLED");
  });

  /** The P&L counts money that left. A bonus not yet handed over has not. */
  it("is not money handed over: a bonus writes no payment", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", salary: 15000 });
    await payroll().adjust(owner, fx.resortId, cook.id, { month: "2026-09", kind: "BONUS", amount: 3000 });
    expect(await prisma.payrollPayment.count({ where: { employeeId: cook.id } })).toBe(0);
  });

  it("can take a bonus back", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", salary: 15000 });
    const bonus = await payroll().adjust(owner, fx.resortId, cook.id, { month: "2026-09", kind: "BONUS", amount: 3000 });
    await payroll().unadjust(owner, bonus.id);
    expect((await rowFor(cook.id, "2026-09"))!.due).toBe(15000);
  });

  /**
   * An advance bigger than the month it was taken against is next month's
   * money. It used to be forgotten: the next month asked for the whole salary
   * again, and the cook was paid twice.
   */
  it("carries an advance bigger than the month into the next one", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", salary: 15000 });
    await payroll().pay(owner, fx.resortId, cook.id, { month: "2026-09", amount: 20000, kind: "ADVANCE" });

    const october = (await rowFor(cook.id, "2026-10"))!;
    expect(october.aheadUsed).toBe(5000);
    expect(october.remaining).toBe(10000);
    const settled = await payroll().pay(owner, fx.resortId, cook.id, { month: "2026-10", kind: "SALARY" });
    expect(settled.amount).toBe(10000);
  });

  it("says what earlier months still have left to pay", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", salary: 15000 });
    await payroll().pay(owner, fx.resortId, cook.id, { month: "2025-03", amount: 7500, kind: "ADVANCE" });
    const april = (await rowFor(cook.id, "2025-04"))!;
    expect(april.arrears).toBe(7500);
  });
});

describe("who it connects to", () => {
  it("lists the logins nobody has put on payroll, and not the agents", async () => {
    const desk = await colleague("Shirin");
    const people = await payroll().people(owner, fx.resortId);
    const names = people.team.map((t) => t.name);
    expect(names).toContain("Shirin");
    expect(people.team.find((t) => t.userId === desk.id)!.role).toBe("Front desk");
    expect(people.team.some((t) => t.userId === fx.agentId)).toBe(false);
  });

  it("links a person to their login, and they leave the unlinked list", async () => {
    const desk = await colleague("Shirin");
    const emp = await payroll().addEmployee(owner, fx.resortId, { name: "Shirin Akter", salary: 12000, userId: desk.id });
    const people = await payroll().people(owner, fx.resortId);
    expect(people.people.find((p) => p.id === emp.id)!.login).toMatchObject({ userId: desk.id, name: "Shirin" });
    expect(people.team.some((t) => t.userId === desk.id)).toBe(false);
    expect((await rowFor(emp.id, "2026-09"))!.login?.userId).toBe(desk.id);
  });

  it("refuses a login from somewhere else, and one already linked", async () => {
    const desk = await colleague("Shirin");
    await payroll().addEmployee(owner, fx.resortId, { name: "Shirin", salary: 12000, userId: desk.id });
    await expect(
      payroll().addEmployee(owner, fx.resortId, { name: "Shirin again", salary: 12000, userId: desk.id }),
    ).rejects.toThrow(/already linked to Shirin/);
    await expect(
      payroll().addEmployee(owner, fx.resortId, { name: "An agent", salary: 1, userId: fx.agentId }),
    ).rejects.toThrow(/not one of yours/);
  });

  it("lets the person linked see their own pay, and nobody else's", async () => {
    const desk = await colleague("Shirin");
    const other = await colleague("Rana");
    const emp = await payroll().addEmployee(owner, fx.resortId, { name: "Shirin", salary: 12000, userId: desk.id });
    await payroll().pay(owner, fx.resortId, emp.id, { month: "2026-09", amount: 2000, kind: "ADVANCE" });

    const mine = await payroll().mine({ userId: desk.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] });
    expect(mine.places).toHaveLength(1);
    const september = mine.places[0]!.months.find((m) => m.month === "2026-09")!;
    expect([september.due, september.paid, september.remaining]).toEqual([12000, 2000, 10000]);
    expect(september.payments[0]!.kind).toBe("ADVANCE");

    const theirs = await payroll().mine({ userId: other.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] });
    expect(theirs.places).toEqual([]);
  });
});

describe("a year of payroll", () => {
  it("has every person, every month, and the totals by month", async () => {
    const cook = await payroll().addEmployee(owner, fx.resortId, { name: "Jamal", designation: "Cook", salary: 15000 });
    const guard = await payroll().addEmployee(owner, fx.resortId, { name: "Kalam", designation: "Guard", salary: 10000 });
    await payroll().pay(owner, fx.resortId, cook.id, { month: "2025-09", kind: "SALARY" });
    await payroll().pay(owner, fx.resortId, guard.id, { month: "2025-09", amount: 4000, kind: "ADVANCE" });

    const year = await payroll().year(owner, fx.resortId, 2025);
    expect(year.months).toHaveLength(12);
    const jamal = year.people.find((p) => p.employeeId === cook.id)!;
    const kalam = year.people.find((p) => p.employeeId === guard.id)!;
    const sep = (p: typeof jamal) => p.cells.find((c) => c.month === "2025-09")!;
    expect(sep(jamal).state).toBe("SETTLED");
    expect(sep(kalam).state).toBe("PART_PAID");
    // before anything was recorded for them, the months are not counted unpaid
    expect(jamal.cells.find((c) => c.month === "2025-08")!.state).toBe("NOT_ON_PAYROLL");

    const september = year.byMonth.find((m) => m.month === "2025-09")!;
    expect([september.due, september.paid, september.remaining, september.headcount]).toEqual([25000, 19000, 6000, 2]);
    expect(year.byDesignation.map((d) => d.designation)).toEqual(["Cook", "Guard"]);
  });
});

describe("an agency's payroll", () => {
  it("has the same rules, and its own staff as the logins", async () => {
    const staff = await makePlatformService(asPrisma).createAgentStaff(agency, {
      name: "Mitu",
      email: `mitu${Math.floor(Math.random() * 1e6)}@example.com`,
      phone: `8801${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      password: "password123",
    });
    let people = await books().payrollPeople(agency);
    expect(people.team.map((t) => t.name)).toEqual(["Mitu"]);

    const emp = await books().addEmployee(agency, { name: "Mitu", salary: 20000, userId: staff.id, joinDate: "2026-09-16" });
    people = await books().payrollPeople(agency);
    expect(people.team).toEqual([]);

    await books().adjust(agency, emp.id, { month: "2026-09", kind: "BONUS", amount: 1000 });
    const row = (await books().payrollSheet(agency, "2026-09")).rows[0]!;
    expect([row.base, row.bonus, row.due]).toEqual([10000, 1000, 11000]);

    const year = await books().payrollYear(agency, 2026);
    expect(year.people.map((p) => p.name)).toEqual(["Mitu"]);
  });

  it("will not let a resort touch an agency's bonus", async () => {
    const emp = await books().addEmployee(agency, { name: "Mitu", salary: 20000 });
    const bonus = await books().adjust(agency, emp.id, { month: "2026-09", kind: "BONUS", amount: 1000 });
    await expect(payroll().unadjust(owner, bonus.id)).rejects.toThrow(/not found/i);
  });
});
