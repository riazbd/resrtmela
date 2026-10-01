import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtClaims } from "@rh/shared";
import { paymentKind } from "./month-of-payroll";
import { PayrollBook, dayOrClear, myPay, requireMonth } from "./payroll-book";
import { round2 } from "../common/dates";
import { requireResortAccess, badRequest } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { PlanLimitsService } from "../common/plan-limits.service";

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

  private book(resortId: number) {
    return new PayrollBook(this.prisma, { resortId });
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
    input: {
      name: string;
      phone?: string;
      designation?: string;
      salary?: number;
      joinDate?: string;
      active?: boolean;
      userId?: number;
    },
  ) {
    await this.requireManage(claims, resortId);
    if (!input.name.trim()) throw badRequest("name required");
    if (input.userId) await this.book(resortId).checkLogin(input.userId);
    const emp = await this.prisma.employee.create({
      data: {
        resortId,
        name: input.name.trim(),
        phone: input.phone?.replace(/[^\d+]/g, "") || null,
        designation: input.designation || null,
        salary: (input.salary ?? 0) as never,
        joinDate: dayOrClear(input.joinDate, "The joining date") ?? null,
        userId: input.userId || null,
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
    input: {
      name?: string;
      phone?: string;
      designation?: string;
      salary?: number;
      joinDate?: string;
      leftDate?: string;
      active?: boolean;
      userId?: number;
    },
  ) {
    await this.requireManage(claims, resortId);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    if (input.userId) await this.book(resortId).checkLogin(input.userId, employeeId);
    const joinDate = dayOrClear(input.joinDate, "The joining date");
    const leftDate = dayOrClear(input.leftDate, "The leaving date");
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.replace(/[^\d+]/g, "") || null } : {}),
        ...(input.designation !== undefined ? { designation: input.designation || null } : {}),
        ...(input.salary != null ? { salary: input.salary as never } : {}),
        ...(joinDate !== undefined ? { joinDate } : {}),
        ...(leftDate !== undefined ? { leftDate } : {}),
        ...(input.userId !== undefined ? { userId: input.userId || null } : {}),
        // back on payroll: the leaving date no longer applies
        ...(input.active != null
          ? { active: input.active, ...(input.active && leftDate === undefined ? { leftDate: null } : {}) }
          : {}),
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.employee.update", entity: "employee", entityId: employeeId, diff: input });
    return updated;
  }

  /**
   * Off payroll. Somebody who has been paid stays on the books, switched off
   * with the day they left — so their months before it still show, and the
   * month they left in is worth the days they worked.
   */
  async removeEmployee(claims: JwtClaims, resortId: number, employeeId: number, leftOn?: string) {
    await this.requireManage(claims, resortId);
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { _count: { select: { payments: true, adjustments: true } } },
    });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    if (emp._count.payments + emp._count.adjustments > 0) {
      const leftDate = dayOrClear(leftOn, "The leaving date") ?? dateOnly(await this.book(resortId).today());
      await this.prisma.employee.update({ where: { id: employeeId }, data: { active: false, leftDate } });
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
    return this.book(resortId).sheet(month);
  }

  async people(claims: JwtClaims, resortId: number) {
    await this.requireView(claims, resortId);
    return this.book(resortId).people();
  }

  async year(claims: JwtClaims, resortId: number, year: number) {
    await this.requireView(claims, resortId);
    return this.book(resortId).year(year);
  }

  /** A bonus or a deduction: what the month is worth, not money handed over. */
  async adjust(
    claims: JwtClaims,
    resortId: number,
    employeeId: number,
    input: { month: string; kind?: string; amount: number; note?: string },
  ) {
    await this.requireManage(claims, resortId);
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    const row = await this.book(resortId).adjust(claims.userId, employeeId, input);
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: `payroll.${row.kind.toLowerCase()}`,
      entity: "payroll_adjustment",
      entityId: row.id,
      diff: { employee: emp.name, month: input.month, amount: row.amount },
    });
    return row;
  }

  async unadjust(claims: JwtClaims, adjustmentId: number) {
    const row = await this.prisma.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
    // shared with the agency side, like payments
    if (!row || row.resortId == null) throw badRequest("Adjustment not found");
    await this.requireManage(claims, row.resortId);
    await this.book(row.resortId).unadjust(adjustmentId);
    await this.audit.log({
      actorId: claims.userId,
      resortId: row.resortId,
      action: "payroll.adjustment.undo",
      entity: "payroll_adjustment",
      entityId: adjustmentId,
      diff: { month: row.month, kind: row.kind },
    });
    return { deleted: true };
  }

  /** The signed-in person's own pay. Nobody else's: it reads by their user id. */
  mine(claims: JwtClaims) {
    return myPay(this.prisma, claims.userId);
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
    requireMonth(input.month);
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
      amount = await this.book(resortId).settlement(employeeId, input.month, emp.name);
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
