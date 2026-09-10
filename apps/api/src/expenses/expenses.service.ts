import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest, notFound } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { pageArgs, toPage, type PageRequest } from "../common/page";
import { AuditService } from "../common/audit.service";
import { TenantStateService } from "../common/tenant-state.service";
import { PermissionsService } from "../common/permissions";
import { OptionsService } from "../options/options.service";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(OptionsService) private readonly options: OptionsService,
    @Inject(TenantStateService) private readonly tenantState: TenantStateService,
  ) {}

  async list(
    claims: JwtClaims,
    resortId: number,
    from?: string,
    to?: string,
    scope?: string,
    page?: PageRequest,
  ) {
    requireResortAccess(claims, resortId);
    // the matrix showed this box and nothing asked for it: hiding the menu
    // link is not access control, and a token plus curl was the whole gap
    await this.perms.require(claims, resortId, "expenses.view");
    const where = {
      resortId,
      ...(scope ? { scope: scope as never } : {}),
      ...(from ? { date: { gte: dateOnly(from) } } : {}),
      ...(to ? { date: { ...((from ? { gte: dateOnly(from) } : {}) as object), lt: dateOnly(to) } } : {}),
    };
    const { skip, take } = pageArgs(page, 100);

    // the rollups describe the whole selection, not the page being shown, so
    // they are aggregated in the database rather than summed over `rows`
    const [rows, total, sum, byDayRows, byCatRows] = await Promise.all([
      this.prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], skip, take }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expense.groupBy({ by: ["date"], where, _sum: { amount: true } }),
      this.prisma.expense.groupBy({ by: ["category"], where, _sum: { amount: true } }),
    ]);

    return {
      ...toPage(rows, total, skip, take),
      summary: {
        amount: round2(Number(sum._sum.amount ?? 0)),
        byDay: byDayRows
          .map((r) => ({ date: r.date.toISOString().slice(0, 10), amount: round2(Number(r._sum.amount ?? 0)) }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byCategory: byCatRows
          .map((r) => ({ category: r.category, amount: round2(Number(r._sum.amount ?? 0)) }))
          .sort((a, b) => b.amount - a.amount),
      },
    };
  }

  async categories(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    // the matrix showed this box and nothing asked for it: hiding the menu
    // link is not access control, and a token plus curl was the whole gap
    await this.perms.require(claims, resortId, "expenses.view");
    const rows = await this.prisma.expense.groupBy({
      by: ["category"],
      where: { resortId },
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
    });
    return rows.map((r) => ({ category: r.category, uses: r._count.category }));
  }

  async create(
    claims: JwtClaims,
    resortId: number,
    data: { date: string; category: string; details?: string; amount: number; scope?: string },
  ) {
    requireResortAccess(claims, resortId);
    await this.tenantState.assertWritable(resortId);
    await this.perms.require(claims, resortId, "expenses.create");
    if (data.amount <= 0) throw badRequest("amount must be > 0");
    // the same guard payments run through: a category is one the resort keeps,
    // not whatever was typed, or the reports grow a row per spelling
    await this.options.assertAccepted(resortId, "EXPENSE_CATEGORY", data.category);
    const exp = await this.prisma.expense.create({
      data: {
        resortId,
        date: dateOnly(data.date),
        category: data.category,
        details: data.details,
        amount: data.amount as never,
        scope: (data.scope === "RESTAURANT" ? "RESTAURANT" : "RESORT") as never,
        createdBy: claims.userId,
      },
    });
    await this.audit.log({
      actorId: claims.userId, resortId,
      action: "expense.create", entity: "expense", entityId: exp.id,
      diff: data,
    });
    return { ...exp, amount: Number(exp.amount) };
  }

  async remove(claims: JwtClaims, id: number) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw notFound("Expense not found");
    // the table is shared with the agency side; an entry with no resort is an
    // agency's own cost and is none of this resort's business
    if (exp.resortId == null) throw notFound("Expense not found");
    await this.perms.require(claims, exp.resortId, "expenses.delete");
    requireResortAccess(claims, exp.resortId);
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId, resortId: exp.resortId,
      action: "expense.delete", entity: "expense", entityId: id,
    });
    return { deleted: true };
  }
}
