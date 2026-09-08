import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtClaims } from "@rh/shared";
import { requireResortAccess, badRequest } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";

const MONTH_RE = /^\d{4}-\d{2}$/;

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async requireView(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "payroll.view");
  }
  private async requireManage(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "payroll.manage");
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

  /** monthly payroll sheet: every active employee with paid status for the month */
  async sheet(claims: JwtClaims, resortId: number, month: string) {
    await this.requireView(claims, resortId);
    if (!MONTH_RE.test(month)) throw badRequest("month must look like 2026-09");
    const employees = await this.prisma.employee.findMany({
      where: { resortId, active: true },
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
        expected: rows.reduce((s, r) => s + r.salary, 0),
        paid: rows.reduce((s, r) => s + (r.paid ? r.amount : 0), 0),
        headcount: rows.length,
        paidCount: rows.filter((r) => r.paid).length,
      },
    };
  }

  async pay(
    claims: JwtClaims,
    resortId: number,
    employeeId: number,
    input: { month: string; amount?: number; method?: string; note?: string },
  ) {
    await this.requireManage(claims, resortId);
    if (!MONTH_RE.test(input.month)) throw badRequest("month must look like 2026-09");
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp || emp.resortId !== resortId) throw badRequest("employee not found");
    const existing = await this.prisma.payrollPayment.findUnique({ where: { employeeId_month: { employeeId, month: input.month } } });
    if (existing) throw badRequest(`${emp.name} is already paid for ${input.month} — undo it first`);
    const amount = input.amount ?? Number(emp.salary);
    if (!amount || amount <= 0) throw badRequest("amount required");
    const row = await this.prisma.payrollPayment.create({
      data: {
        resortId,
        employeeId,
        month: input.month,
        amount: amount as never,
        method: (input.method as never) ?? "CASH",
        note: input.note,
        createdById: claims.userId,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "payroll.pay", entity: "payroll_payment", entityId: row.id, diff: { employee: emp.name, month: input.month, amount } });
    return { ...row, amount: Number(row.amount) };
  }

  async undoPay(claims: JwtClaims, paymentId: number) {
    const row = await this.prisma.payrollPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw badRequest("payment not found");
    await this.requireManage(claims, row.resortId);
    await this.prisma.payrollPayment.delete({ where: { id: paymentId } });
    await this.audit.log({ actorId: claims.userId, resortId: row.resortId, action: "payroll.pay.undo", entity: "payroll_payment", entityId: paymentId, diff: { month: row.month } });
    return { deleted: true };
  }
}
