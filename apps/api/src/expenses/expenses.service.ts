import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    const rows = await this.prisma.expense.findMany({
      where: {
        resortId,
        ...(from ? { date: { gte: dateOnly(from) } } : {}),
        ...(to ? { date: { ...((from ? { gte: dateOnly(from) } : {}) as object), lt: dateOnly(to) } } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 500,
    });
    const total = round2(rows.reduce((s, r) => s + Number(r.amount), 0));
    // daily + category rollups (sheet tabs 4 & 12)
    const byDay = new Map<string, number>();
    const byCat = new Map<string, number>();
    for (const r of rows) {
      const d = r.date.toISOString().slice(0, 10);
      byDay.set(d, round2((byDay.get(d) ?? 0) + Number(r.amount)));
      byCat.set(r.category, round2((byCat.get(r.category) ?? 0) + Number(r.amount)));
    }
    return {
      total,
      byDay: [...byDay.entries()].sort().map(([date, amount]) => ({ date, amount })),
      byCategory: [...byCat.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      rows: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    };
  }

  /** Category autocomplete seeded from the resort's own history. */
  async categories(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
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
    data: { date: string; category: string; details?: string; amount: number },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    if (data.amount <= 0) throw badRequest("amount must be > 0");
    const exp = await this.prisma.expense.create({
      data: {
        resortId,
        date: dateOnly(data.date),
        category: data.category,
        details: data.details,
        amount: data.amount as never,
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
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw Object.assign(new Error("Expense not found"), { status: 404 });
    requireResortAccess(claims, exp.resortId);
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId, resortId: exp.resortId,
      action: "expense.delete", entity: "expense", entityId: id,
    });
    return { deleted: true };
  }
}
