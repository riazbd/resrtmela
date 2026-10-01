/**
 * A payroll's books, for whoever owns them — a resort or a travel agency.
 *
 * The two payroll services were near-copies, and `month-of-payroll.ts` already
 * pulled the month's arithmetic out of them so their sheets could not
 * disagree. This goes the rest of the way: who is on a month, what it is
 * worth, what earlier months left behind, the year, and the people. Each
 * service keeps only what genuinely differs — the permission check, the plan
 * gate and the audit line — and hands this an owner.
 *
 * The rules themselves are in `@rh/shared` (`payroll-rules.ts`), because the
 * screens explain them and must explain the same thing the server counts.
 */
import {
  PAYROLL_ADJUSTMENT_KINDS,
  isPayrollAdjustmentKind,
  monthsBetween,
  payrollHistory,
  todayIn,
  type PayrollHistoryMonth,
  type PayrollLogin,
  type PayrollAdjustmentKind,
} from "@rh/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";

/** Whose payroll: exactly one of the two. */
export type PayrollOwner = { resortId: number; agencyId?: undefined } | { agencyId: number; resortId?: undefined };

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/** "FRONT_DESK" → "Front desk". */
const humanRole = (role: string) => role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ");

export function requireMonth(month: string | undefined): string {
  if (!month || !MONTH_RE.test(month)) throw badRequest("The month must look like 2026-09");
  return month;
}

export function adjustmentKind(value: string | undefined): PayrollAdjustmentKind {
  if (!isPayrollAdjustmentKind(value)) {
    throw badRequest(`An adjustment is one of: ${PAYROLL_ADJUSTMENT_KINDS.join(", ").toLowerCase()}`);
  }
  return value;
}

/** A day in "YYYY-MM-DD", or "" to clear; anything else is refused. */
export function dayOrClear(value: string | undefined, what: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") return null;
  if (!DAY_RE.test(value)) throw badRequest(`${what} must look like 2026-09-15`);
  return dateOnly(value);
}

type EmployeeWithBooks = Awaited<ReturnType<PayrollBook["load"]>>[number];

export class PayrollBook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly owner: PayrollOwner,
  ) {}

  private get where() {
    return this.owner.resortId != null ? { resortId: this.owner.resortId } : { agencyId: this.owner.agencyId };
  }

  /** The month it is now where the owner is. Agencies are in Bangladesh. */
  async current(): Promise<string> {
    if (this.owner.resortId == null) return todayIn("Asia/Dhaka").slice(0, 7);
    const resort = await this.prisma.resort.findUnique({
      where: { id: this.owner.resortId },
      select: { timezone: true },
    });
    return todayIn(resort?.timezone ?? "Asia/Dhaka").slice(0, 7);
  }

  async today(): Promise<string> {
    if (this.owner.resortId == null) return todayIn("Asia/Dhaka");
    const resort = await this.prisma.resort.findUnique({
      where: { id: this.owner.resortId },
      select: { timezone: true },
    });
    return todayIn(resort?.timezone ?? "Asia/Dhaka");
  }

  /** Everyone this owner has ever had on payroll, with every payment and adjustment up to `to`. */
  async load(to: string, employeeId?: number) {
    return this.prisma.employee.findMany({
      where: { ...this.where, ...(employeeId ? { id: employeeId } : {}) },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        payments: { where: { month: { lte: to } }, orderBy: { paidAt: "asc" } },
        adjustments: { where: { month: { lte: to } }, orderBy: { createdAt: "asc" } },
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            status: true,
            agentRole: { select: { name: true } },
            resorts: { select: { resortId: true, role: { select: { name: true } } } },
          },
        },
      },
    });
  }

  /** The login a person is linked to, as the screens name it. */
  private login(e: EmployeeWithBooks): PayrollLogin | null {
    const u = e.user;
    if (!u) return null;
    const own =
      this.owner.resortId != null
        ? u.resorts.find((r) => r.resortId === this.owner.resortId)?.role?.name
        : u.agentRole?.name;
    return { userId: u.id, name: u.name, role: own ?? humanRole(u.role), status: u.status };
  }

  /** The month the books start for this person: the month they were put on payroll here. */
  private since(e: EmployeeWithBooks): string {
    const created = monthOf(e.createdAt);
    const joined = e.joinDate ? monthOf(e.joinDate) : null;
    // joined later than they were added: the books start when they started
    return joined && joined > created ? joined : created;
  }

  historyOf(e: EmployeeWithBooks, to: string, current: string): PayrollHistoryMonth[] {
    return payrollHistory({
      salary: Number(e.salary),
      joinDate: iso(e.joinDate),
      leftDate: iso(e.leftDate),
      from: this.since(e),
      to,
      current,
      payments: e.payments.map((p) => ({ month: p.month, amount: Number(p.amount), kind: p.kind })),
      adjustments: e.adjustments.map((a) => ({ month: a.month, amount: Number(a.amount), kind: a.kind })),
    });
  }

  /**
   * Who is on a month.
   *
   * Everyone whose dates cover some of it, and anybody with anything recorded
   * against it — a payment that happened is never hidden by a date. Somebody
   * taken off payroll before leaving dates existed has no `leftDate`; they
   * appear only where something was recorded, which is where they were paid.
   */
  private onMonth(e: EmployeeWithBooks, month: string, h: PayrollHistoryMonth | undefined): boolean {
    const recorded = e.payments.some((p) => p.month === month) || e.adjustments.some((a) => a.month === month);
    if (recorded) return true;
    if (!e.active && !e.leftDate) return false;
    return (h?.figures.days ?? 0) > 0;
  }

  /** The month's sheet: each person, what the month is worth, what has gone, what is left. */
  async sheet(month: string) {
    requireMonth(month);
    const current = await this.current();
    const employees = await this.load(month);
    const rows = employees
      .map((e) => {
        const months = this.historyOf(e, month, current);
        const h = months[months.length - 1];
        if (!h || h.month !== month || !this.onMonth(e, month, h)) return null;
        const f = h.figures;
        const payments = e.payments.filter((p) => p.month === month);
        const adjustments = e.adjustments.filter((a) => a.month === month);
        return {
          employeeId: e.id,
          name: e.name,
          designation: e.designation,
          phone: e.phone,
          joinDate: iso(e.joinDate),
          leftDate: iso(e.leftDate),
          login: this.login(e),
          salary: Number(e.salary),
          days: f.days,
          daysInMonth: f.daysInMonth,
          base: f.base,
          bonus: f.bonus,
          deduction: f.deduction,
          due: f.due,
          paid: f.paid,
          advance: f.advance,
          aheadUsed: f.aheadUsed,
          over: f.over,
          remaining: f.remaining,
          state: h.tracked ? f.state : "NOT_ON_PAYROLL",
          settled: f.state === "SETTLED",
          arrears: h.arrears,
          payments: payments.map((p) => ({
            id: p.id,
            kind: p.kind,
            amount: Number(p.amount),
            method: p.method,
            note: p.note,
            paidAt: p.paidAt,
          })),
          adjustments: adjustments.map((a) => ({
            id: a.id,
            kind: a.kind,
            amount: Number(a.amount),
            note: a.note,
            createdAt: a.createdAt,
          })),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const sum = (pick: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
    return {
      month,
      rows,
      totals: {
        expected: sum((r) => r.due),
        paid: sum((r) => r.paid),
        advance: sum((r) => r.advance),
        remaining: sum((r) => r.remaining),
        bonus: sum((r) => r.bonus),
        deduction: sum((r) => r.deduction),
        arrears: sum((r) => r.arrears),
        headcount: rows.length,
        settledCount: rows.filter((r) => r.settled).length,
      },
    };
  }

  /**
   * What "pay the rest" comes to for one person and month: what the month is
   * worth, less what has gone and anything paid ahead. Refused at nothing.
   */
  async settlement(employeeId: number, month: string, name: string): Promise<number> {
    const current = await this.current();
    const [e] = await this.load(month, employeeId);
    if (!e) throw badRequest("Not on this payroll");
    const months = this.historyOf(e, month, current);
    const left = months[months.length - 1]?.figures.remaining ?? 0;
    if (left <= 0) {
      throw badRequest(`${name} has already had everything ${month} is worth — record an advance instead.`);
    }
    return left;
  }

  /** Payroll's people, and the logins nobody has put on it. */
  async people() {
    const current = await this.current();
    const employees = await this.load(current);
    const people = employees.map((e) => ({
      id: e.id,
      name: e.name,
      phone: e.phone,
      designation: e.designation,
      salary: Number(e.salary),
      joinDate: iso(e.joinDate),
      leftDate: iso(e.leftDate),
      active: e.active,
      login: this.login(e),
      since: this.since(e),
    }));
    const linked = new Set(employees.filter((e) => e.active && e.userId != null).map((e) => e.userId!));
    const team = (await this.logins()).filter((u) => !linked.has(u.userId));
    return { people, team };
  }

  /**
   * The logins that could be on this payroll.
   *
   * A resort's: everyone with a seat at it except agents (they sell, and are
   * paid commission) and the platform's own staff. An agency's: its staff.
   */
  async logins(): Promise<{ userId: number; name: string; phone: string | null; role: string }[]> {
    const placeholder = (phone: string) => (phone.startsWith("placeholder-") ? null : phone);
    if (this.owner.resortId != null) {
      const seats = await this.prisma.userResort.findMany({
        where: {
          resortId: this.owner.resortId,
          user: { role: { notIn: ["AGENT", "SUPER_ADMIN"] }, status: { not: "deleted" } },
        },
        select: { user: { select: { id: true, name: true, phone: true, role: true } }, role: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      });
      return seats.map((s) => ({
        userId: s.user.id,
        name: s.user.name,
        phone: placeholder(s.user.phone),
        role: s.role?.name ?? humanRole(s.user.role),
      }));
    }
    const staff = await this.prisma.user.findMany({
      where: { parentAgentId: this.owner.agencyId, status: { not: "deleted" } },
      select: { id: true, name: true, phone: true, agentRole: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return staff.map((u) => ({
      userId: u.id,
      name: u.name,
      phone: placeholder(u.phone),
      role: u.agentRole?.name ?? "Staff",
    }));
  }

  /** A login may be linked if it belongs here and nobody else on this payroll has it. */
  async checkLogin(userId: number, employeeId?: number) {
    const logins = await this.logins();
    if (!logins.some((l) => l.userId === userId)) {
      throw badRequest("That login is not one of yours");
    }
    const taken = await this.prisma.employee.findFirst({
      where: { ...this.where, userId, active: true, ...(employeeId ? { id: { not: employeeId } } : {}) },
      select: { name: true },
    });
    if (taken) throw badRequest(`That login is already linked to ${taken.name}`);
  }

  /** A year: every person, every month, totals by month and by designation. */
  async year(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Which year?");
    const current = await this.current();
    const months = monthsBetween(`${year}-01`, `${year}-12`);
    const employees = await this.load(months[11]!);
    const zero = () => ({ due: 0, paid: 0, advance: 0, bonus: 0, deduction: 0, remaining: 0 });
    const byMonth = months.map((month) => ({ month, ...zero(), headcount: 0 }));

    const people = employees
      .map((e) => {
        const history = this.historyOf(e, months[11]!, current);
        const totals = zero();
        let any = false;
        const cells = months.map((month, i) => {
          const h = history.find((x) => x.month === month);
          const on = h && h.tracked && this.onMonth(e, month, h);
          const f = h?.figures;
          if (!on || !f) {
            return { month, state: "NOT_ON_PAYROLL", due: 0, paid: 0, advance: 0, bonus: 0, deduction: 0, remaining: 0 };
          }
          any = true;
          const cell = {
            month,
            state: f.state,
            due: f.due,
            paid: f.paid,
            advance: f.advance,
            bonus: f.bonus,
            deduction: f.deduction,
            remaining: f.remaining,
          };
          for (const k of ["due", "paid", "advance", "bonus", "deduction", "remaining"] as const) {
            totals[k] = round2(totals[k] + cell[k]);
            byMonth[i]![k] = round2(byMonth[i]![k] + cell[k]);
          }
          byMonth[i]!.headcount += 1;
          return cell;
        });
        if (!any) return null;
        return {
          employeeId: e.id,
          name: e.name,
          designation: e.designation,
          salary: Number(e.salary),
          active: e.active,
          login: this.login(e),
          cells,
          totals,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    const totals = { ...zero(), upcoming: 0 };
    for (const m of byMonth) {
      if (m.month > current) {
        totals.upcoming = round2(totals.upcoming + m.due);
        continue;
      }
      for (const k of Object.keys(zero()) as (keyof ReturnType<typeof zero>)[]) totals[k] = round2(totals[k] + m[k]);
    }

    const designations = new Map<string, { people: number; salary: number }>();
    for (const e of employees.filter((x) => x.active)) {
      const d = e.designation?.trim() || "Other";
      const row = designations.get(d) ?? { people: 0, salary: 0 };
      row.people += 1;
      row.salary = round2(row.salary + Number(e.salary));
      designations.set(d, row);
    }
    const byDesignation = [...designations.entries()]
      .map(([designation, v]) => ({ designation, ...v }))
      .sort((a, b) => b.salary - a.salary);

    return { year, months, current, people, byMonth, totals, byDesignation };
  }

  /** Adds a bonus or a deduction against a month. */
  async adjust(
    actorId: number,
    employeeId: number,
    input: { month: string; kind?: string; amount: number; note?: string },
  ) {
    requireMonth(input.month);
    const kind = adjustmentKind(input.kind);
    if (!(input.amount > 0)) throw badRequest("The amount must be more than zero");
    const row = await this.prisma.payrollAdjustment.create({
      data: {
        ...this.where,
        employeeId,
        month: input.month,
        kind,
        amount: round2(input.amount) as never,
        note: input.note?.trim() || null,
        createdById: actorId,
      },
    });
    return { id: row.id, kind, amount: round2(input.amount) };
  }

  /** Takes an adjustment back, if it is this owner's. */
  async unadjust(adjustmentId: number) {
    const row = await this.prisma.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
    const mine =
      row && (this.owner.resortId != null ? row.resortId === this.owner.resortId : row.agencyId === this.owner.agencyId);
    if (!row || !mine) throw badRequest("Adjustment not found");
    await this.prisma.payrollAdjustment.delete({ where: { id: adjustmentId } });
    return row;
  }
}

/**
 * One login's own pay, everywhere they are on payroll — the last twelve
 * months, newest first.
 *
 * So the cook can see what the owner sees about the cook, and stop having to
 * ask.
 */
export async function myPay(prisma: PrismaService, userId: number) {
  const records = await prisma.employee.findMany({
    where: { userId },
    select: {
      id: true,
      resortId: true,
      agencyId: true,
      resort: { select: { name: true } },
      agency: { select: { name: true } },
    },
  });
  const places = [];
  for (const r of records) {
    const owner: PayrollOwner = r.resortId != null ? { resortId: r.resortId } : { agencyId: r.agencyId! };
    const book = new PayrollBook(prisma, owner);
    const current = await book.current();
    const [e] = await book.load(current, r.id);
    if (!e) continue;
    const months = book
      .historyOf(e, current, current)
      .filter((h) => h.tracked && h.figures.state !== "NOT_ON_PAYROLL")
      .slice(-12)
      .reverse();
    places.push({
      employeeId: e.id,
      employer: r.resort?.name ?? r.agency?.name ?? "",
      designation: e.designation,
      salary: Number(e.salary),
      months: months.map((h) => ({
        month: h.month,
        state: h.figures.state,
        due: h.figures.due,
        paid: h.figures.paid,
        advance: h.figures.advance,
        bonus: h.figures.bonus,
        deduction: h.figures.deduction,
        remaining: h.figures.remaining,
        payments: e.payments
          .filter((p) => p.month === h.month)
          .map((p) => ({ id: p.id, kind: p.kind, amount: Number(p.amount), method: p.method, note: p.note, paidAt: p.paidAt })),
        adjustments: e.adjustments
          .filter((a) => a.month === h.month)
          .map((a) => ({ id: a.id, kind: a.kind, amount: Number(a.amount), note: a.note, createdAt: a.createdAt })),
      })),
    });
  }
  return { places };
}
