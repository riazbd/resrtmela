/**
 * Tour packages: the agency's own tree of what a trip is made of, and the
 * packages it builds by picking leaves off that tree and pricing them.
 *
 * The platform ships no categories. An agency running hill treks and one
 * running beach weekends do not buy the same things, and a starting list
 * nobody asked for is a list everybody has to delete first.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest, forbid, notFound } from "../common/rbac";
import { round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { AgencyContextService } from "./agency-context.service";
import type { JwtClaims } from "@rh/shared";

export interface CategoryNode {
  id: number;
  name: string;
  active: boolean;
  children: CategoryNode[];
}

export interface PackageLineInput {
  categoryId?: number | null;
  label: string;
  qty?: number;
  unitCost?: number;
  unitPrice?: number;
}

export interface PackageInput {
  name: string;
  summary?: string;
  days?: number;
  nights?: number;
  pax?: number;
  active?: boolean;
  items?: PackageLineInput[];
  clientRef?: string;
}

const TOURS = "agent.tours.manage";

@Injectable()
export class ToursService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── the tree ───────────────────────────

  /** Every category this agency has, nested. Reading needs no permission. */
  async categories(claims: JwtClaims): Promise<CategoryNode[]> {
    const ctx = await this.agency.of(claims);
    const rows = await this.prisma.tourCategory.findMany({
      where: { agencyId: ctx.agencyId },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, name: true, active: true, parentId: true },
    });

    const byId = new Map<number, CategoryNode>();
    for (const r of rows) byId.set(r.id, { id: r.id, name: r.name, active: r.active, children: [] });
    const roots: CategoryNode[] = [];
    for (const r of rows) {
      const node = byId.get(r.id)!;
      const parent = r.parentId == null ? null : byId.get(r.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async createCategory(claims: JwtClaims, input: { name: string; parentId?: number | null; sort?: number }) {
    const ctx = await this.agency.require(claims, TOURS);
    const name = input.name?.trim();
    if (!name) throw badRequest("The category needs a name");
    const parentId = input.parentId ?? null;
    if (parentId != null) await this.ownCategory(ctx.agencyId, parentId);
    await this.refuseDuplicateSibling(ctx.agencyId, parentId, name, null);

    const row = await this.prisma.tourCategory.create({
      data: { agencyId: ctx.agencyId, parentId, name, sort: input.sort ?? 0 },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.category.create",
      entity: "tour_category",
      entityId: row.id,
      diff: { name, parentId },
    });
    return { id: row.id, name: row.name, parentId: row.parentId, active: row.active };
  }

  async updateCategory(
    claims: JwtClaims,
    id: number,
    input: { name?: string; active?: boolean; sort?: number },
  ) {
    const ctx = await this.agency.require(claims, TOURS);
    const current = await this.ownCategory(ctx.agencyId, id);
    const name = input.name?.trim();
    if (name) await this.refuseDuplicateSibling(ctx.agencyId, current.parentId, name, id);

    const row = await this.prisma.tourCategory.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(input.active != null ? { active: input.active } : {}),
        ...(input.sort != null ? { sort: input.sort } : {}),
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.category.update",
      entity: "tour_category",
      entityId: id,
      diff: input,
    });
    return { id: row.id, name: row.name, parentId: row.parentId, active: row.active };
  }

  /**
   * Deleting is refused rather than cascaded.
   *
   * A tree that silently loses a branch takes the packages sold from it with
   * it, and an agency finds out when a quotation it sent last week no longer
   * says what it is for. Naming what is in the way is the only useful answer.
   */
  async deleteCategory(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, TOURS);
    await this.ownCategory(ctx.agencyId, id);

    const children = await this.prisma.tourCategory.findMany({
      where: { parentId: id },
      select: { name: true },
      take: 5,
    });
    if (children.length > 0) {
      throw badRequest(`Move or delete what is under it first: ${children.map((c) => c.name).join(", ")}`);
    }
    const used = await this.prisma.tourPackageItem.count({ where: { categoryId: id } });
    if (used > 0) {
      throw badRequest(`${used} package line${used === 1 ? "" : "s"} still use this category`);
    }

    await this.prisma.tourCategory.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.category.delete",
      entity: "tour_category",
      entityId: id,
    });
    return { deleted: true };
  }

  /**
   * MySQL treats NULLs as distinct in a unique index, so a database constraint
   * on (agencyId, parentId, name) would let an agency create "Food" twice at
   * the top level and catch it nowhere else. The check lives here instead.
   */
  private async refuseDuplicateSibling(
    agencyId: number,
    parentId: number | null,
    name: string,
    exceptId: number | null,
  ) {
    const clash = await this.prisma.tourCategory.findFirst({
      where: {
        agencyId,
        parentId,
        name,
        ...(exceptId != null ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw badRequest(`"${name}" already exists here`);
  }

  private async ownCategory(agencyId: number, id: number) {
    const row = await this.prisma.tourCategory.findUnique({
      where: { id },
      select: { id: true, agencyId: true, parentId: true },
    });
    if (!row || row.agencyId !== agencyId) throw forbid("Not your category");
    return row;
  }

  // ─────────────────────────── packages ───────────────────────────

  async packages(claims: JwtClaims, query: { q?: string; active?: boolean } = {}) {
    const ctx = await this.agency.of(claims);
    const search = query.q?.trim();
    const rows = await this.prisma.tourPackage.findMany({
      where: {
        agencyId: ctx.agencyId,
        ...(query.active != null ? { active: query.active } : {}),
        ...(search ? { name: { contains: search } } : {}),
      },
      include: { items: { select: { qty: true, unitCost: true, unitPrice: true } } },
      orderBy: { id: "desc" },
      take: 200,
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      days: p.days,
      nights: p.nights,
      pax: p.pax,
      active: p.active,
      lines: p.items.length,
      totals: lineTotals(p.items),
    }));
  }

  async package(claims: JwtClaims, id: number) {
    const ctx = await this.agency.of(claims);
    const pkg = await this.prisma.tourPackage.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sort: "asc" }, { id: "asc" }],
          include: { category: { select: { id: true, name: true } } },
        },
      },
    });
    if (!pkg) throw notFound("Package not found");
    if (pkg.agencyId !== ctx.agencyId) throw forbid("Not your package");

    return {
      id: pkg.id,
      name: pkg.name,
      summary: pkg.summary,
      days: pkg.days,
      nights: pkg.nights,
      pax: pkg.pax,
      active: pkg.active,
      items: pkg.items.map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        category: i.category?.name ?? null,
        label: i.label,
        qty: Number(i.qty),
        unitCost: Number(i.unitCost),
        unitPrice: Number(i.unitPrice),
      })),
      totals: lineTotals(pkg.items),
    };
  }

  async createPackage(claims: JwtClaims, input: PackageInput) {
    const ctx = await this.agency.require(claims, TOURS);
    const name = input.name?.trim();
    if (!name) throw badRequest("The package needs a name");

    // an offline device that replays its write must not create a second
    // package; the (agencyId, clientRef) index is what makes that true
    if (input.clientRef) {
      const seen = await this.prisma.tourPackage.findUnique({
        where: { agencyId_clientRef: { agencyId: ctx.agencyId, clientRef: input.clientRef } },
        select: { id: true },
      });
      if (seen) return { id: seen.id, name };
    }

    const items = await this.checkLines(ctx.agencyId, input.items ?? []);
    const pkg = await this.prisma.tourPackage.create({
      data: {
        agencyId: ctx.agencyId,
        name,
        summary: input.summary ?? null,
        days: input.days ?? 1,
        nights: input.nights ?? 0,
        pax: input.pax ?? 1,
        ...(input.active != null ? { active: input.active } : {}),
        clientRef: input.clientRef ?? null,
        createdById: claims.userId,
        items: { create: items },
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.package.create",
      entity: "tour_package",
      entityId: pkg.id,
      diff: { name, lines: items.length },
    });
    return { id: pkg.id, name: pkg.name };
  }

  /**
   * Editing replaces the lines rather than merging them.
   *
   * The console sends the whole list every time, so merging would mean an
   * agency could never remove a line — and a package that keeps a line the
   * agency deleted is a package that quotes the wrong price.
   */
  async updatePackage(claims: JwtClaims, id: number, input: Partial<PackageInput>) {
    const ctx = await this.agency.require(claims, TOURS);
    const pkg = await this.prisma.tourPackage.findUnique({ where: { id }, select: { agencyId: true } });
    if (!pkg) throw notFound("Package not found");
    if (pkg.agencyId !== ctx.agencyId) throw forbid("Not your package");

    const items = input.items ? await this.checkLines(ctx.agencyId, input.items) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.tourPackage.update({
        where: { id },
        data: {
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
          ...(input.summary !== undefined ? { summary: input.summary ?? null } : {}),
          ...(input.days != null ? { days: input.days } : {}),
          ...(input.nights != null ? { nights: input.nights } : {}),
          ...(input.pax != null ? { pax: input.pax } : {}),
          ...(input.active != null ? { active: input.active } : {}),
        },
      });
      if (items) {
        await tx.tourPackageItem.deleteMany({ where: { packageId: id } });
        if (items.length > 0) {
          await tx.tourPackageItem.createMany({ data: items.map((i) => ({ ...i, packageId: id })) });
        }
      }
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.package.update",
      entity: "tour_package",
      entityId: id,
      diff: { name: input.name, lines: items?.length },
    });
    return { id };
  }

  async deletePackage(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, TOURS);
    const pkg = await this.prisma.tourPackage.findUnique({ where: { id }, select: { agencyId: true } });
    if (!pkg) throw notFound("Package not found");
    if (pkg.agencyId !== ctx.agencyId) throw forbid("Not your package");
    await this.prisma.tourPackage.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.tour.package.delete",
      entity: "tour_package",
      entityId: id,
    });
    return { deleted: true };
  }

  /** Lines are the agency's own, priced with money that makes sense. */
  private async checkLines(agencyId: number, lines: PackageLineInput[]) {
    const ids = [...new Set(lines.map((l) => l.categoryId).filter((v): v is number => v != null))];
    if (ids.length > 0) {
      const mine = await this.prisma.tourCategory.count({ where: { id: { in: ids }, agencyId } });
      if (mine !== ids.length) throw forbid("Not your category");
    }
    return lines.map((l, index) => {
      const label = l.label?.trim();
      if (!label) throw badRequest("Every line needs a label");
      const qty = Number(l.qty ?? 1);
      const unitCost = Number(l.unitCost ?? 0);
      const unitPrice = Number(l.unitPrice ?? 0);
      if (qty <= 0) throw badRequest(`"${label}": quantity must be more than zero`);
      if (unitCost < 0 || unitPrice < 0) throw badRequest(`"${label}": money cannot be negative`);
      return {
        categoryId: l.categoryId ?? null,
        label,
        qty: qty as never,
        unitCost: unitCost as never,
        unitPrice: unitPrice as never,
        sort: index,
      };
    });
  }
}

/** What the package costs the agency, what it charges, and the difference. */
function lineTotals(items: { qty: unknown; unitCost: unknown; unitPrice: unknown }[]) {
  let cost = 0;
  let price = 0;
  for (const i of items) {
    const qty = Number(i.qty);
    cost += qty * Number(i.unitCost);
    price += qty * Number(i.unitPrice);
  }
  return { cost: round2(cost), price: round2(price), margin: round2(price - cost) };
}
