/**
 * A resort's tax rules, and the one place that reads them.
 *
 * `Resort.taxRatePct` was a single percentage passed hand-to-hand through
 * every money call site. It could not describe this market — 15% VAT, a 10%
 * service charge on the room that VAT is then charged on, a different rate in
 * the restaurant, and menu prices quoted with the VAT already inside — so it
 * is a list now, and this service is how callers get it.
 *
 * The old column survives as the fallback: a resort with no rules and a
 * non-zero rate still gets exactly the bill it got before, which is what makes
 * this safe to deploy against a live database.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "./permissions";
import { AuditService } from "./audit.service";
import { badRequest, notFound, requireResortAccess } from "./rbac";
import type { TaxRule, TaxScope } from "./money";
import type { JwtClaims } from "@rh/shared";

const SCOPES: TaxScope[] = ["ALL", "ROOM", "EXTRA_PERSON", "ACTIVITY", "FB"];
const CODE_RE = /^[A-Z0-9_]{2,24}$/;

@Injectable()
export class TaxService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * What this resort charges, ready for `bookingTotals`.
   *
   * Falls back to the legacy flat rate when no rules exist, so a resort that
   * has never opened the tax screen keeps the bill it has always produced.
   */
  async rulesFor(resortId: number): Promise<TaxRule[]> {
    const [rows, resort] = await Promise.all([
      this.prisma.taxRule.findMany({
        where: { resortId, active: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      this.prisma.resort.findUnique({ where: { id: resortId }, select: { taxRatePct: true } }),
    ]);
    if (rows.length) {
      return rows.map((r) => ({
        code: r.code,
        label: r.label,
        ratePct: Number(r.ratePct),
        appliesTo: r.appliesTo as TaxScope,
        inclusive: r.inclusive,
        compound: r.compound,
        sortOrder: r.sortOrder,
      }));
    }
    const flat = Number(resort?.taxRatePct ?? 0);
    if (flat <= 0) return [];
    return [
      { code: "TAX", label: "Tax", ratePct: flat, appliesTo: "ALL", inclusive: false, compound: false, sortOrder: 0 },
    ];
  }

  /** The settings view: switched-off rules included. */
  async list(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    return this.prisma.taxRule.findMany({
      where: { resortId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  async create(
    claims: JwtClaims,
    resortId: number,
    input: { code: string; label: string; ratePct: number; appliesTo?: string; inclusive?: boolean; compound?: boolean },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) throw badRequest("code must be 2–24 characters: A–Z, 0–9 or underscore");
    const label = input.label.trim();
    if (!label) throw badRequest("label required");
    this.assertRate(input.ratePct);
    const appliesTo = (input.appliesTo ?? "ALL").toUpperCase();
    if (!(SCOPES as string[]).includes(appliesTo)) {
      throw badRequest(`appliesTo must be one of ${SCOPES.join(", ")}`);
    }
    const clash = await this.prisma.taxRule.findUnique({ where: { resortId_code: { resortId, code } } });
    if (clash) throw badRequest(`${code} already exists on this resort`);
    const last = await this.prisma.taxRule.findFirst({
      where: { resortId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await this.prisma.taxRule.create({
      data: {
        resortId, code, label,
        ratePct: input.ratePct as never,
        appliesTo,
        inclusive: input.inclusive ?? false,
        compound: input.compound ?? false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "taxRule.create",
      entity: "taxRule", entityId: row.id, diff: { code, label, ratePct: input.ratePct, appliesTo },
    });
    return row;
  }

  async update(
    claims: JwtClaims,
    resortId: number,
    id: number,
    input: { label?: string; ratePct?: number; appliesTo?: string; inclusive?: boolean; compound?: boolean; sortOrder?: number; active?: boolean },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const row = await this.prisma.taxRule.findUnique({ where: { id } });
    if (!row || row.resortId !== resortId) throw notFound("Tax rule not found");
    const data: Record<string, unknown> = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw badRequest("label required");
      data.label = label;
    }
    if (input.ratePct !== undefined) {
      this.assertRate(input.ratePct);
      data.ratePct = input.ratePct;
    }
    if (input.appliesTo !== undefined) {
      const appliesTo = input.appliesTo.toUpperCase();
      if (!(SCOPES as string[]).includes(appliesTo)) {
        throw badRequest(`appliesTo must be one of ${SCOPES.join(", ")}`);
      }
      data.appliesTo = appliesTo;
    }
    if (input.inclusive !== undefined) data.inclusive = input.inclusive;
    if (input.compound !== undefined) data.compound = input.compound;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.active !== undefined) data.active = input.active;
    const updated = await this.prisma.taxRule.update({ where: { id }, data: data as never });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "taxRule.update",
      entity: "taxRule", entityId: id, diff: data,
    });
    return updated;
  }

  /**
   * Rules are switched off, never deleted.
   *
   * Every invoice already printed was printed under some set of rules, and a
   * resort has to be able to say what it charged and why when the VAT office
   * asks. Deleting the rule deletes the answer.
   */
  async deactivate(claims: JwtClaims, resortId: number, id: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const row = await this.prisma.taxRule.findUnique({ where: { id } });
    if (!row || row.resortId !== resortId) throw notFound("Tax rule not found");
    const off = await this.prisma.taxRule.update({ where: { id }, data: { active: false } });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "taxRule.deactivate",
      entity: "taxRule", entityId: id, diff: { code: row.code },
    });
    return off;
  }

  private assertRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw badRequest("ratePct must be between 0 and 100");
    }
  }
}
