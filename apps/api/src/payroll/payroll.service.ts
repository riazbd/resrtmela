import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtClaims } from "@rh/shared";
import { monthRow, paidSoFar, paymentKind, settlementAmount } from "./month-of-payroll";
import { round2 } from "../common/dates";
import { requireResortAccess, badRequest } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { PlanLimitsService } from "../common/plan-limits.service";

const MONTH_RE = /^\d{4}-\d{2}$/;

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
  ) {}

  private async requireView(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "payroll.view");
  }
  private async requireManage(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "payroll.manage");
    await this.planLimits.requireFeature(resortId, "payroll");
  }

  async employees(claims: JwtClaims, resortId: number) {
    await this.requireView(claims, resortId);
    return this.prisma.employee.findMany({
      where: { resortId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { payments: { orderBy: { month: "desc" }, take: 3 } },
    });
  }

  async addEmployee(
    claims: JwtClaims,
    resortId: number,
    input: { name: string; phone?: string; designation?: string; salary?: number; joinDate?: string; active?: boolean },
  ) {
    await this.requireManage(claims, resortId);
    if (!input.name.trim()) throw badRequest("name required");
    const emp = await this.prisma.employee.create({
      data: {
        resortId,
        name: input.name.trim(),
        phone: input.phone?.replace(/[^\d+]/g, "") || null,
        designation: input.designation || null,
        salary: (input.salary ?? 0) as never,
        joinDate: input.joinDate ? dateOnly(input.joinDate) : null,
        ...(input.active != null ? { active: input.active } : {}),
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.employee.create", entity: "employee", entityId: emp.id, diff: { name: emp.name } });
    return emp;
  }

  async editEmployee(
    claims: JwtClaims,
    resortId: number,
    employeeId: number,
    input: { name?: string; phone?: string; designation?: string; salary?: number; joinDate?: string; active?: boolean },
  ) {
    await this.requireManage(claims, resortId);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    const updated = await this.prisma.employee.update({
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
    await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.employee.update", entity: "employee", entityId: employeeId, diff: input });
    return updated;
  }

  async removeEmployee(claims: JwtClaims, resortId: number, employeeId: number) {
    await this.requireManage(claims, resortId);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { _count: { select: { payments: true } } } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    if (emp._count.payments > 0) {
      // keep payroll history intact — deactivate instead
      await this.prisma.employee.update({ where: { id: employeeId }, data: { active: false } });
      await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.employee.deactivate", entity: "employee", entityId: employeeId });
      return { deactivated: true };
    }
    await this.prisma.employee.delete({ where: { id: employeeId } });
    await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.employee.delete", entity: "employee", entityId: employeeId });
    return { deleted: true };
  }

  /**
   * The month's payroll: what each person is owed, what they have had, and
   * what is left.
   *
   * This used to answer a yes/no — `paid: !!pay` — because a month held one
   * payment. It cannot any more, and it should not have: the question an owner
   * asks in the middle of a month is "how much of Jamal's salary have we
   * handed over", and the answer to that is a number.
   */
  async sheet(claims: JwtClaims, resortId: number, month: string) {
    await this.requireView(claims, resortId);
    if (!MONTH_RE.test(month)) throw badRequest("month must look like 2026-09");
    const employees = await this.prisma.employee.findMany({
      where: { resortId, active: true },
      orderBy: { name: "asc" },
      include: { payments: { where: { month }, orderBy: { paidAt: "asc" } } },
    });
    const rows = employees.map((e) =>
      monthRow(e.id, e.name, e.designation, Number(e.salary), e.payments),
    );
    return {
      month,
      rows,
      totals: {
        expected: round2(rows.reduce((s, r) => s + r.salary, 0)),
        paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
        advance: round2(rows.reduce((s, r) => s + r.advance, 0)),
        remaining: round2(rows.reduce((s, r) => s + r.remaining, 0)),
        headcount: rows.length,
        settledCount: rows.filter((r) => r.settled).length,
      },
    };
  }

  /**
   * Hands money over against a month: an advance, or the settlement.
   *
   * A month used to take one payment and refuse the second — "already paid for
   * 2026-09 — undo it first" — which is not a thing anybody wanted to hear
   * about a 2,000 taka advance. It takes as many now as it took.
   *
   * **A settlement with no amount pays what is left, not the salary.** After a
   * 7,000 advance on a 15,000 wage, "pay salary" means 8,000. Defaulting to the
   * salary would hand the cook 15,000 on top of what he already has, which is
   * the one mistake this default exists to prevent.
   *
   * An advance is never refused for a settled month: that is not a mistake, it
   * is next month's money handed over early, and the person recording it
   * against this month is the one saying where it goes.
   */
  async pay(
    claims: JwtClaims,
    resortId: number,
    employeeId: number,
    input: { month: string; amount?: number; method?: string; note?: string; kind?: string },
  ) {
    await this.requireManage(claims, resortId);
    if (!MONTH_RE.test(input.month)) throw badRequest("month must look like 2026-09");
    const kind = paymentKind(input.kind);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");

    let amount: number;
    if (input.amount != null) {
      if (!(input.amount > 0)) throw badRequest("The amount must be more than zero");
      amount = round2(input.amount);
    } else if (kind === "ADVANCE") {
      // "give him some money" has no sensible number to invent for it
      throw badRequest("How much is the advance?");
    } else {
      const paid = await paidSoFar(this.prisma, employeeId, input.month);
      amount = settlementAmount(Number(emp.salary), paid, emp.name, input.month);
    }

    const row = await this.prisma.payrollPayment.create({
      data: {
        resortId,
        employeeId,
        month: input.month,
        amount: amount as never,
        kind,
        method: (input.method as never) ?? "CASH",
        note: input.note,
        createdById: claims.userId,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: kind === "ADVANCE" ? "payroll.advance" : "payroll.pay",
      entity: "payroll_payment",
      entityId: row.id,
      diff: { employee: emp.name, month: input.month, amount, kind },
    });
    return { ...row, amount: Number(row.amount) };
  }

  async undoPay(claims: JwtClaims, paymentId: number) {
    const row = await this.prisma.payrollPayment.findUnique({ where: { id: paymentId } });
    // the table is shared with the agency side; a payment with no resort was
    // made by an agency to its own staff and is none of this resort's business
    if (!row || row.resortId == null) throw badRequest("payment not found");
    await this.requireManage(claims, row.resortId);
    await this.prisma.payrollPayment.delete({ where: { id: paymentId } });
    await this.audit.log({ actorId: claims.userId, resortId: row.resortId, action: "payroll.pay.undo", entity: "payroll_payment", entityId: paymentId, diff: { month: row.month } });
    return { deleted: true };
  }
}
