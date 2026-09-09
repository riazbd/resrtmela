/**
 * The agency's own books: heads of expenditure with entries under them, and a
 * salary sheet per month.
 *
 * These ride on the same `expenses`, `employees` and `payroll_payments` tables
 * the resort side uses. A resort paying its cook and an agency paying its
 * counter clerk are the same act, and two tables for it would drift — the day
 * they did, a bug fixed on one side would still be live on the other.
 *
 * What makes sharing safe is that a row belongs to exactly one owner: a resort
 * row carries `resortId` and no `agencyId`, an agency row the reverse. Every
 * query on both sides filters on its own column, so neither side can read or
 * delete the other's rows even by guessing an id.
 *
 * The one thing an agency does that a resort does not is name its own heads.
 * A resort types a category per entry; an agency defines the list first and
 * files under it, which is what the agency asked for and what makes a monthly
 * head-by-head report possible at all.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest, forbid, notFound } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { pageArgs, toPage, type PageRequest } from "../common/page";
import { AuditService } from "../common/audit.service";
import { AgencyContextService } from "./agency-context.service";
import type { JwtClaims } from "@rh/shared";

const EXPENSES = "agent.expenses.manage";
const PAYROLL = "agent.payroll.manage";
const MONTH_RE = /^\d{4}-\d{2}$/;

export interface ExpenseQuery extends PageRequest {
  from?: string;
  to?: string;
  headId?: number;
}

@Injectable()
export class BooksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── heads ───────────────────────────

  async heads(claims: JwtClaims) {
    const ctx = await this.agency.require(claims, EXPENSES);
    const [heads, totals] = await Promise.all([
      this.prisma.expenseHead.findMany({
        where: { agencyId: ctx.agencyId },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      this.prisma.expense.groupBy({
        by: ["headId"],
        where: { agencyId: ctx.agencyId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const used = new Map(totals.map((t) => [t.headId, t]));
    return heads.map((h) => ({
      id: h.id,
      name: h.name,
      active: h.active,
      entries: used.get(h.id)?._count._all ?? 0,
      amount: round2(Number(used.get(h.id)?._sum.amount ?? 0)),
    }));
  }

  async createHead(claims: JwtClaims, input: { name: string }) {
    const ctx = await this.agency.require(claims, EXPENSES);
    const name = input.name?.trim();
    if (!name) throw badRequest("The head needs a name");
    const clash = await this.prisma.expenseHead.findUnique({
      where: { agencyId_name: { agencyId: ctx.agencyId, name } },
      select: { id: true },
    });
    if (clash) throw badRequest(`"${name}" already exists`);
    const head = await this.prisma.expenseHead.create({ data: { agencyId: ctx.agencyId, name } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.expense.head.create",
      entity: "expense_head",
      entityId: head.id,
      diff: { name },
    });
    return { id: head.id, name: head.name, active: head.active };
  }

  /**
   * Renaming a head renames it in every report at once, because reports group
   * by the link, not by the name copied onto each entry. The copy on the entry
   * is left alone on purpose: an exported CSV should say what the head was
   * called on the day the money was spent.
   */
  async updateHead(claims: JwtClaims, id: number, input: { name?: string; active?: boolean }) {
    const ctx = await this.agency.require(claims, EXPENSES);
    await this.ownHead(ctx.agencyId, id);
    const name = input.name?.trim();
    if (name) {
      const clash = await this.prisma.expenseHead.findUnique({
        where: { agencyId_name: { agencyId: ctx.agencyId, name } },
        select: { id: true },
      });
      if (clash && clash.id !== id) throw badRequest(`"${name}" already exists`);
    }
    const head = await this.prisma.expenseHead.update({
      where: { id },
      data: { ...(name ? { name } : {}), ...(input.active != null ? { active: input.active } : {}) },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.expense.head.update",
      entity: "expense_head",
      entityId: id,
      diff: input,
    });
    return { id: head.id, name: head.name, active: head.active };
  }

  /**
   * A head with money against it is retired, not deleted: deleting it would
   * empty a column of last year's report and nobody would know why. A head
   * created by a typo, with nothing under it, simply goes.
   */
  async deleteHead(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, EXPENSES);
    await this.ownHead(ctx.agencyId, id);
    const used = await this.prisma.expense.count({ where: { headId: id } });
    if (used > 0) {
      await this.prisma.expenseHead.update({ where: { id }, data: { active: false } });
      await this.audit.log({
        actorId: claims.userId,
        action: "agent.expense.head.deactivate",
        entity: "expense_head",
        entityId: id,
      });
      return { deactivated: true };
    }
    await this.prisma.expenseHead.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.expense.head.delete",
      entity: "expense_head",
      entityId: id,
    });
    return { deleted: true };
  }

  private async ownHead(agencyId: number, id: number) {
    const head = await this.prisma.expenseHead.findUnique({
      where: { id },
      select: { id: true, name: true, agencyId: true },
    });
    if (!head || head.agencyId !== agencyId) throw forbid("Not your expense head");
    return head;
  }

  // ─────────────────────────── expenses ───────────────────────────

  async expenses(claims: JwtClaims, query: ExpenseQuery) {
    const ctx = await this.agency.require(claims, EXPENSES);
    const where = {
      agencyId: ctx.agencyId,
      ...(query.headId ? { headId: query.headId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: dateOnly(query.from) } : {}),
              ...(query.to ? { lt: dateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    const { skip, take } = pageArgs(query, 100);

    // the rollups describe the whole selection, not the page on screen
    const [rows, total, sum, byHeadRows, heads] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip,
        take,
        include: { head: { select: { id: true, name: true } } },
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expense.groupBy({ by: ["headId"], where, _sum: { amount: true } }),
      this.prisma.expenseHead.findMany({
        where: { agencyId: ctx.agencyId },
        select: { id: true, name: true },
      }),
    ]);
    const headName = new Map(heads.map((h) => [h.id, h.name]));

    return {
      ...toPage(
        rows.map((r) => ({
          id: r.id,
          date: r.date.toISOString().slice(0, 10),
          headId: r.headId,
          head: r.head?.name ?? r.category,
          details: r.details,
          amount: Number(r.amount),
        })),
        total,
        skip,
        take,
      ),
      summary: {
        amount: round2(Number(sum._sum.amount ?? 0)),
        byHead: byHeadRows
          .map((r) => ({
            headId: r.headId,
            head: r.headId == null ? "—" : (headName.get(r.headId) ?? "—"),
            amount: round2(Number(r._sum.amount ?? 0)),
          }))
          .sort((a, b) => b.amount - a.amount),
      },
    };
  }

  async addExpense(
    claims: JwtClaims,
    input: { date: string; headId: number; details?: string; amount: number; clientRef?: string },
  ) {
    const ctx = await this.agency.require(claims, EXPENSES);
    if (!input.headId) throw badRequest("Pick a head to file this under");
    const head = await this.ownHead(ctx.agencyId, input.headId);
    const amount = Number(input.amount);
    if (!(amount > 0)) throw badRequest("The amount must be more than zero");

    if (input.clientRef) {
      const seen = await this.prisma.expense.findUnique({
        where: { agencyId_clientRef: { agencyId: ctx.agencyId, clientRef: input.clientRef } },
        select: { id: true },
      });
      if (seen) return { id: seen.id, amount };
    }

    const exp = await this.prisma.expense.create({
      data: {
        agencyId: ctx.agencyId,
        headId: head.id,
        // the head's name as it read on the day, for an export to be readable
        category: head.name,
        date: dateOnly(input.date),
        details: input.details ?? null,
        amount: amount as never,
        scope: "AGENCY",
        createdBy: claims.userId,
        clientRef: input.clientRef ?? null,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.expense.create",
      entity: "expense",
      entityId: exp.id,
      diff: { head: head.name, amount },
    });
    return { id: exp.id, amount };
  }

  async removeExpense(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, EXPENSES);
    const exp = await this.prisma.expense.findUnique({ where: { id }, select: { agencyId: true } });
    if (!exp) throw notFound("Expense not found");
    if (exp.agencyId !== ctx.agencyId) throw forbid("Not your expense");
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.expense.delete",
      entity: "expense",
      entityId: id,
    });
    return { deleted: true };
  }

  // ─────────────────────────── payroll ───────────────────────────

  async employees(claims: JwtClaims) {
    const ctx = await this.agency.require(claims, PAYROLL);
    const rows = await this.prisma.employee.findMany({
      where: { agencyId: ctx.agencyId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { payments: { orderBy: { month: "desc" }, take: 3 } },
    });
    return rows.map((e) => ({
      id: e.id,
      name: e.name,
      phone: e.phone,
      designation: e.designation,
      salary: Number(e.salary),
      joinDate: e.joinDate ? e.joinDate.toISOString().slice(0, 10) : null,
      active: e.active,
      recent: e.payments.map((p) => ({ month: p.month, amount: Number(p.amount) })),
    }));
  }

  async addEmployee(
    claims: JwtClaims,
    input: { name: string; phone?: string; designation?: string; salary?: number; joinDate?: string },
  ) {
    const ctx = await this.agency.require(claims, PAYROLL);
    const name = input.name?.trim();
    if (!name) throw badRequest("The person needs a name");
    const emp = await this.prisma.employee.create({
      data: {
        agencyId: ctx.agencyId,
        name,
        phone: input.phone?.replace(/[^\d+]/g, "") || null,
        designation: input.designation || null,
        salary: (input.salary ?? 0) as never,
        joinDate: input.joinDate ? dateOnly(input.joinDate) : null,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.payroll.employee.create",
      entity: "employee",
      entityId: emp.id,
      diff: { name },
    });
    return { id: emp.id, name: emp.name };
  }

  async editEmployee(
    claims: JwtClaims,
    employeeId: number,
    input: {
      name?: string;
      phone?: string;
      designation?: string;
      salary?: number;
      joinDate?: string;
      active?: boolean;
    },
  ) {
    const ctx = await this.agency.require(claims, PAYROLL);
    await this.ownEmployee(ctx.agencyId, employeeId);
    const emp = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.replace(/[^\d+]/g, "") || null } : {}),
        ...(input.designation !== undefined ? { designation: input.designation || null } : {}),
        ...(input.salary != null ? { salary: input.salary as never } : {}),
        ...(input.joinDate ? { joinDate: dateOnly(input.joinDate) } : {}),
        ...(input.active != null ? { active: input.active } : {}),
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.payroll.employee.update",
      entity: "employee",
      entityId: employeeId,
      diff: input,
    });
    return { id: emp.id, name: emp.name };
  }

  /** Someone who has been paid is deactivated, so the history stays true. */
  async removeEmployee(claims: JwtClaims, employeeId: number) {
    const ctx = await this.agency.require(claims, PAYROLL);
    await this.ownEmployee(ctx.agencyId, employeeId);
    const paid = await this.prisma.payrollPayment.count({ where: { employeeId } });
    if (paid > 0) {
      await this.prisma.employee.update({ where: { id: employeeId }, data: { active: false } });
      await this.audit.log({
        actorId: claims.userId,
        action: "agent.payroll.employee.deactivate",
        entity: "employee",
        entityId: employeeId,
      });
      return { deactivated: true };
    }
    await this.prisma.employee.delete({ where: { id: employeeId } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.payroll.employee.delete",
      entity: "employee",
      entityId: employeeId,
    });
    return { deleted: true };
  }

  async payrollSheet(claims: JwtClaims, month: string) {
    const ctx = await this.agency.require(claims, PAYROLL);
    if (!MONTH_RE.test(month)) throw badRequest("The month must look like 2026-09");
    const employees = await this.prisma.employee.findMany({
      where: { agencyId: ctx.agencyId, active: true },
      orderBy: { name: "asc" },
      include: { payments: { where: { month } } },
    });
    const rows = employees.map((e) => {
      const pay = e.payments[0];
      const salary = Number(e.salary);
      return {
        employeeId: e.id,
        name: e.name,
        designation: e.designation,
        salary,
        paid: !!pay,
        amount: pay ? Number(pay.amount) : salary,
        method: pay?.method ?? null,
        note: pay?.note ?? null,
        paidAt: pay?.paidAt ?? null,
        paymentId: pay?.id ?? null,
      };
    });
    return {
      month,
      rows,
      totals: {
        expected: round2(rows.reduce((s, r) => s + r.salary, 0)),
        paid: round2(rows.reduce((s, r) => s + (r.paid ? r.amount : 0), 0)),
        headcount: rows.length,
        paidCount: rows.filter((r) => r.paid).length,
      },
    };
  }

  async pay(
    claims: JwtClaims,
    employeeId: number,
    input: { month: string; amount?: number; method?: string; note?: string },
  ) {
    const ctx = await this.agency.require(claims, PAYROLL);
    if (!MONTH_RE.test(input.month)) throw badRequest("The month must look like 2026-09");
    const emp = await this.ownEmployee(ctx.agencyId, employeeId);
    const existing = await this.prisma.payrollPayment.findUnique({
      where: { employeeId_month: { employeeId, month: input.month } },
    });
    if (existing) throw badRequest(`${emp.name} is already paid for ${input.month} — undo it first`);
    const amount = Number(input.amount ?? emp.salary);
    if (!(amount > 0)) throw badRequest("The amount must be more than zero");

    const row = await this.prisma.payrollPayment.create({
      data: {
        agencyId: ctx.agencyId,
        employeeId,
        month: input.month,
        amount: amount as never,
        method: (input.method as never) ?? "CASH",
        note: input.note,
        createdById: claims.userId,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.payroll.pay",
      entity: "payroll_payment",
      entityId: row.id,
      diff: { employee: emp.name, month: input.month, amount },
    });
    return { id: row.id, amount };
  }

  async undoPay(claims: JwtClaims, paymentId: number) {
    const ctx = await this.agency.require(claims, PAYROLL);
    const row = await this.prisma.payrollPayment.findUnique({
      where: { id: paymentId },
      select: { agencyId: true, month: true },
    });
    if (!row) throw notFound("Payment not found");
    if (row.agencyId !== ctx.agencyId) throw forbid("Not your payment");
    await this.prisma.payrollPayment.delete({ where: { id: paymentId } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.payroll.pay.undo",
      entity: "payroll_payment",
      entityId: paymentId,
      diff: { month: row.month },
    });
    return { deleted: true };
  }

  private async ownEmployee(agencyId: number, employeeId: number) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.agencyId !== agencyId) throw forbid("Not your employee");
    return emp;
  }
}
