/**
 * The agency's own side of the same accounts.
 *
 * One resort's console and one agency's app read the *same* figures from the
 * *same* fold — `AgentAccountsService.statementFor` and `agentBalance` — because
 * the first thing two businesses do with a statement is compare it, and a
 * balance computed twice is a balance that eventually differs. Everything here
 * is about scoping: which resorts this agency has anything with, and refusing
 * every other one.
 *
 * An agency sells across resorts, so this is a list where the resort's screen is
 * a single account. "Who do I owe, and who owes me" is one question for an
 * agency and several for a resort.
 */
import { Inject, Injectable } from "@nestjs/common";
import { agentBalance, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AgencyContextService } from "../agent/agency-context.service";
import { forbid } from "../common/rbac";
import { round2 } from "../common/dates";
import { AgentAccountsService } from "./agent-accounts.service";

export const AGENT_ACCOUNT_VIEW = "agent.account.view";
export const AGENT_COLLECT = "agent.collect";
export const AGENT_REMIT = "agent.remit";

@Injectable()
export class MyAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
    @Inject(AgentAccountsService) private readonly accounts: AgentAccountsService,
  ) {}

  /**
   * Every resort this agency has an account with, and where each stands.
   *
   * A resort it has sold at but never settled belongs in the list at zero: an
   * agency that cannot see a resort it has fifteen bookings with has no way to
   * know whether anything is owed, and an empty screen reads as "nothing to
   * settle" rather than "we have not looked".
   */
  async list(claims: JwtClaims) {
    const ctx = await this.agency.require(claims, AGENT_ACCOUNT_VIEW);
    const actors = await this.accounts.actorIds(ctx.agencyId);

    const [sold, filed] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ["resortId"],
        where: { deletedAt: null, agentUserId: { in: actors } },
        _count: { _all: true },
      }),
      this.prisma.agentAccountEntry.groupBy({
        by: ["resortId"],
        where: { agencyId: ctx.agencyId },
      }),
    ]);

    const resortIds = [...new Set([...sold.map((s) => s.resortId), ...filed.map((f) => f.resortId)])];
    if (resortIds.length === 0) return { rows: [], owedByMe: 0, owedToMe: 0, pending: 0 };

    const resorts = await this.prisma.resort.findMany({
      where: { id: { in: resortIds } },
      select: { id: true, name: true, currency: true, locale: true },
    });
    const bookingsPer = new Map(sold.map((s) => [s.resortId, s._count._all]));

    const rows = [];
    for (const r of resorts) {
      const bal = await this.accounts.balanceOf(r.id, ctx.agencyId);
      const { creditLimit } = await this.accounts.termsRow(r.id, ctx.agencyId);
      rows.push({
        resort: { id: r.id, name: r.name, currency: r.currency, locale: r.locale },
        bookings: bookingsPer.get(r.id) ?? 0,
        creditLimit,
        ...bal,
      });
    }
    rows.sort((a, b) => b.balance - a.balance || a.resort.name.localeCompare(b.resort.name));

    return {
      /** The two sides kept apart, because they are two different errands. */
      owedByMe: round2(rows.reduce((s, r) => s + Math.max(0, r.balance), 0)),
      owedToMe: round2(rows.reduce((s, r) => s + Math.max(0, -r.balance), 0)),
      pending: round2(rows.reduce((s, r) => s + r.pending, 0)),
      rows,
    };
  }

  /**
   * One resort's statement, as the agency reads it.
   *
   * Scoped by proving the agency has something at this resort first: without
   * that, a guessed resort id reads a statement belonging to somebody else.
   */
  async statement(claims: JwtClaims, resortId: number, query: { from?: string; to?: string }) {
    const ctx = await this.agency.require(claims, AGENT_ACCOUNT_VIEW);
    await this.assertMine(ctx.agencyId, resortId);
    return this.accounts.statementFor(resortId, ctx.agencyId, query);
  }

  /** The agency this caller acts for, once it holds the permission asked for. */
  async contextFor(claims: JwtClaims, permission: string): Promise<number> {
    const ctx = await this.agency.require(claims, permission);
    return ctx.agencyId;
  }

  /**
   * Whether this agency has any business at this resort at all.
   *
   * A booking or a line — either is enough. An agency about to declare its first
   * remittance has bookings and no lines, and one that has only ever deposited a
   * float has lines and no bookings.
   */
  async assertMine(agencyId: number, resortId: number): Promise<void> {
    const actors = await this.accounts.actorIds(agencyId);
    const [booking, entry] = await Promise.all([
      this.prisma.booking.findFirst({
        where: { resortId, deletedAt: null, agentUserId: { in: actors } },
        select: { id: true },
      }),
      this.prisma.agentAccountEntry.findFirst({
        where: { resortId, agencyId },
        select: { id: true },
      }),
    ]);
    if (!booking && !entry) throw forbid("You have no account with that resort");
  }

  /**
   * What this month's selling has earned, across every resort.
   *
   * Read off the ledger rather than recomputed from bookings and rates: what an
   * agent earned is what was agreed and written down, and a screen that
   * recalculated it would eventually disagree with the statement beside it.
   */
  async earnings(claims: JwtClaims, month: string) {
    const ctx = await this.agency.require(claims, AGENT_ACCOUNT_VIEW);
    const [y, m] = month.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return { month, commission: 0, bookings: 0 };
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
    const rows = await this.prisma.agentAccountEntry.findMany({
      where: {
        agencyId: ctx.agencyId,
        kind: "COMMISSION",
        status: "CONFIRMED",
        date: { gte: from, lt: to },
      },
      select: { amount: true, bookingId: true },
    });
    return {
      month,
      commission: round2(rows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0)),
      bookings: new Set(rows.map((r) => r.bookingId).filter((id) => id != null)).size,
    };
  }

  /** The fold, exported so nothing here re-implements it. */
  static balance = agentBalance;
}
