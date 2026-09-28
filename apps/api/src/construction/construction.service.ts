/**
 * The construction book: what went in, what went out, what is left.
 *
 * Three questions the owner asked, which nothing else here could answer —
 * *who has put money in*, *what has the money gone on*, and *what is in
 * hand*. It is not the expense book: an expense is a cost of running a
 * resort that is open, and this is the cost of building one that is not.
 * Mixing them would put the roof in last month's profit and loss.
 *
 * One ledger with a sign, so the balance is a single SUM and cannot be half
 * written the way a figure added across two tables can.
 *
 * The rollups are aggregated in the database, not summed over the page being
 * shown — a "what is in hand" that quietly means "of the fifty lines on
 * screen" is a figure somebody reconciles against and cannot make balance.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { type JwtClaims } from "@rh/shared";
import { requireResortAccess, badRequest, notFound } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { PermissionsService } from "../common/permissions";
import { OptionsService } from "../options/options.service";

const VIEW = "construction.view";
const MANAGE = "construction.manage";

/** Money in, or money out. The two sides of the one book. */
export const CONSTRUCTION_KINDS = ["IN", "OUT"] as const;
export type ConstructionKind = (typeof CONSTRUCTION_KINDS)[number];

export interface ConstructionEntryInput {
  kind: ConstructionKind;
  date: string;
  amount: number;
  /** IN: an existing contributor. OUT: an existing purpose. */
  contributorId?: number;
  purposeId?: number;
  /** A new one, typed into the same box — the list is built as it is used. */
  contributorName?: string;
  purposeName?: string;
  paidTo?: string;
  method?: string;
  note?: string;
  clientRef?: string;
}

@Injectable()
export class ConstructionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(OptionsService) private readonly options: OptionsService,
  ) {}

  private async mayRead(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, VIEW);
  }

  private async mayWrite(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, MANAGE);
  }

  /**
   * The whole screen in one read.
   *
   * Entries, the two summaries, the totals, and the lists the form chooses
   * from — because every one of them is on screen at once and six requests
   * to draw one page is six chances for a hill-road connection to show half
   * of it.
   */
  async book(
    claims: JwtClaims,
    resortId: number,
    q: {
      kind?: string;
      from?: string;
      to?: string;
      contributorId?: number;
      purposeId?: number;
      search?: string;
      take?: number;
    } = {},
  ) {
    await this.mayRead(claims, resortId);

    const where = {
      resortId,
      ...(q.kind === "IN" || q.kind === "OUT" ? { kind: q.kind } : {}),
      ...(q.contributorId ? { contributorId: q.contributorId } : {}),
      ...(q.purposeId ? { purposeId: q.purposeId } : {}),
      ...(q.search?.trim()
        ? {
            OR: [
              { label: { contains: q.search.trim() } },
              { paidTo: { contains: q.search.trim() } },
              { note: { contains: q.search.trim() } },
            ],
          }
        : {}),
      ...(q.from || q.to
        ? {
            date: {
              ...(q.from ? { gte: dateOnly(q.from) } : {}),
              ...(q.to ? { lte: dateOnly(q.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total, byKind, byContributor, byPurpose, contributors, purposes] =
      await Promise.all([
        this.prisma.constructionEntry.findMany({
          where,
          orderBy: [{ date: "desc" }, { id: "desc" }],
          take: Math.min(q.take ?? 200, 500),
          include: { createdBy: { select: { id: true, name: true } } },
        }),
        this.prisma.constructionEntry.count({ where }),
        /**
         * The totals answer for the *whole* book and not for the filter.
         * "What is in hand" is one number about the resort; narrowing the
         * list to one mason must not change what the till holds.
         */
        this.prisma.constructionEntry.groupBy({
          by: ["kind"],
          where: { resortId },
          _sum: { amount: true },
        }),
        this.prisma.constructionEntry.groupBy({
          by: ["contributorId", "label"],
          where: { resortId, kind: "IN" },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.constructionEntry.groupBy({
          by: ["purposeId", "label"],
          where: { resortId, kind: "OUT" },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.constructionContributor.findMany({
          where: { resortId, active: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.constructionPurpose.findMany({
          where: { resortId, active: true },
          orderBy: { name: "asc" },
        }),
      ]);

    const sumOf = (kind: string) =>
      round2(Number(byKind.find((k) => k.kind === kind)?._sum.amount ?? 0));
    const received = sumOf("IN");
    const spent = sumOf("OUT");

    /**
     * Grouped by the link where there is one and by the name where there is
     * not. A contributor deleted after they gave money keeps their line —
     * `label` is what it read on the day — rather than the money vanishing
     * from the answer to "who gave how much".
     */
    const foldName = (
      groups: { label: string; _sum: { amount: unknown }; _count: { _all: number } }[],
    ) => {
      const by = new Map<string, { name: string; amount: number; entries: number }>();
      for (const g of groups) {
        const row = by.get(g.label) ?? { name: g.label, amount: 0, entries: 0 };
        row.amount = round2(row.amount + Number(g._sum.amount ?? 0));
        row.entries += g._count._all;
        by.set(g.label, row);
      }
      return [...by.values()].sort((a, b) => b.amount - a.amount);
    };

    return {
      totals: { received, spent, inHand: round2(received - spent) },
      byContributor: foldName(byContributor),
      byPurpose: foldName(byPurpose),
      contributors: contributors.map((c) => ({ id: c.id, name: c.name, note: c.note })),
      purposes: purposes.map((p) => ({ id: p.id, name: p.name })),
      total,
      rows: rows.map((e) => ({
        id: e.id,
        kind: e.kind,
        date: e.date,
        amount: round2(Number(e.amount)),
        label: e.label,
        contributorId: e.contributorId,
        purposeId: e.purposeId,
        paidTo: e.paidTo,
        method: e.method,
        note: e.note,
        enteredBy: e.createdBy?.name ?? null,
      })),
    };
  }

  /**
   * A heading, found or made.
   *
   * The form has one box: choose from the list, or type a name that is not
   * on it yet. Asking somebody to go and create "Cement" on a settings screen
   * before they can write down that they bought cement is how a book stops
   * being kept.
   */
  private async headingFor(
    resortId: number,
    kind: ConstructionKind,
    input: ConstructionEntryInput,
  ): Promise<{ contributorId?: number; purposeId?: number; label: string }> {
    if (kind === "IN") {
      if (input.contributorId) {
        const found = await this.prisma.constructionContributor.findFirst({
          where: { id: input.contributorId, resortId },
        });
        if (!found) throw notFound("That contributor is not on this resort's list");
        return { contributorId: found.id, label: found.name };
      }
      const name = (input.contributorName ?? "").trim();
      if (!name) throw badRequest("Say who put the money in");
      const made = await this.prisma.constructionContributor.upsert({
        where: { resortId_name: { resortId, name } },
        update: { active: true },
        create: { resortId, name },
      });
      return { contributorId: made.id, label: made.name };
    }

    if (input.purposeId) {
      const found = await this.prisma.constructionPurpose.findFirst({
        where: { id: input.purposeId, resortId },
      });
      if (!found) throw notFound("That heading is not on this resort's list");
      return { purposeId: found.id, label: found.name };
    }
    const name = (input.purposeName ?? "").trim();
    if (!name) throw badRequest("Say what the money was spent on");
    const made = await this.prisma.constructionPurpose.upsert({
      where: { resortId_name: { resortId, name } },
      update: { active: true },
      create: { resortId, name },
    });
    return { purposeId: made.id, label: made.name };
  }

  /**
   * The method has to be one *this resort* takes.
   *
   * Not a global enum: the payments service learned that the hard way, where
   * `@IsEnum` accepted BKASH for a resort that has never taken bKash. The
   * question is per resort, so the check is too, and it is the same
   * `PAYMENT_METHOD` list the rest of the money screens read.
   */
  private async validate(resortId: number, input: ConstructionEntryInput) {
    if (!CONSTRUCTION_KINDS.includes(input.kind)) {
      throw badRequest("An entry is either money in or money out");
    }
    if (!(input.amount > 0)) throw badRequest("The amount has to be more than nothing");
    await this.options.assertAccepted(resortId, "PAYMENT_METHOD", input.method ?? "CASH");
  }

  async add(claims: JwtClaims, resortId: number, input: ConstructionEntryInput) {
    await this.mayWrite(claims, resortId);
    await this.validate(resortId, input);

    /**
     * The same line replayed is still one line. A phone that lost its
     * connection between sending and hearing back sends it again, and the
     * resort should not find the roof paid for twice.
     */
    if (input.clientRef) {
      const already = await this.prisma.constructionEntry.findFirst({
        where: { resortId, clientRef: input.clientRef },
      });
      if (already) return already;
    }

    const heading = await this.headingFor(resortId, input.kind, input);
    const made = await this.prisma.constructionEntry.create({
      data: {
        resortId,
        kind: input.kind,
        date: dateOnly(input.date),
        amount: input.amount as never,
        contributorId: heading.contributorId ?? null,
        purposeId: heading.purposeId ?? null,
        label: heading.label,
        // only on the way out: money coming in has a giver, not a payee
        paidTo: input.kind === "OUT" ? (input.paidTo?.trim() || null) : null,
        method: input.method ?? "CASH",
        note: input.note?.trim() || null,
        createdById: claims.userId,
        clientRef: input.clientRef ?? null,
      },
    });

    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: input.kind === "IN" ? "construction.received" : "construction.spent",
      entity: "constructionEntry",
      entityId: made.id,
      diff: { amount: input.amount, label: heading.label },
    });
    return made;
  }

  async update(claims: JwtClaims, resortId: number, id: number, input: ConstructionEntryInput) {
    await this.mayWrite(claims, resortId);
    await this.validate(resortId, input);
    const existing = await this.prisma.constructionEntry.findFirst({ where: { id, resortId } });
    if (!existing) throw notFound("That entry is not in this resort's construction book");

    const heading = await this.headingFor(resortId, input.kind, input);
    const saved = await this.prisma.constructionEntry.update({
      where: { id },
      data: {
        kind: input.kind,
        date: dateOnly(input.date),
        amount: input.amount as never,
        contributorId: heading.contributorId ?? null,
        purposeId: heading.purposeId ?? null,
        label: heading.label,
        paidTo: input.kind === "OUT" ? (input.paidTo?.trim() || null) : null,
        method: input.method ?? "CASH",
        note: input.note?.trim() || null,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "construction.corrected",
      entity: "constructionEntry",
      entityId: id,
      diff: { was: round2(Number(existing.amount)), now: input.amount },
    });
    return saved;
  }

  async remove(claims: JwtClaims, resortId: number, id: number) {
    await this.mayWrite(claims, resortId);
    const existing = await this.prisma.constructionEntry.findFirst({ where: { id, resortId } });
    if (!existing) throw notFound("That entry is not in this resort's construction book");
    await this.prisma.constructionEntry.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "construction.removed",
      entity: "constructionEntry",
      entityId: id,
      diff: { amount: round2(Number(existing.amount)), label: existing.label },
    });
    return { deleted: true };
  }

  /** Somebody who is going to put money in, named before they do. */
  async addContributor(claims: JwtClaims, resortId: number, name: string, note?: string) {
    await this.mayWrite(claims, resortId);
    const clean = name.trim();
    if (!clean) throw badRequest("Give them a name");
    return this.prisma.constructionContributor.upsert({
      where: { resortId_name: { resortId, name: clean } },
      update: { active: true, ...(note?.trim() ? { note: note.trim() } : {}) },
      create: { resortId, name: clean, note: note?.trim() || null },
    });
  }

  /** A heading to file spending under. */
  async addPurpose(claims: JwtClaims, resortId: number, name: string) {
    await this.mayWrite(claims, resortId);
    const clean = name.trim();
    if (!clean) throw badRequest("Give the heading a name");
    return this.prisma.constructionPurpose.upsert({
      where: { resortId_name: { resortId, name: clean } },
      update: { active: true },
      create: { resortId, name: clean },
    });
  }
}
