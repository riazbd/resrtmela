/**
 * The running account between a resort and an agent.
 *
 * An agent sells a 10,000 taka room, the guest hands them 5,000, they hand the
 * resort 5,000, and they have earned 1,000. Before this file the platform could
 * answer none of that. Commission was a figure `agentPricing` drew on a screen
 * and nothing stored; guest money handed to an agent was outside the system
 * entirely; and a resort receiving 9,000 from an agent who kept 1,000 had no way
 * to say so, so whoever was at the desk recorded the 9,000 as the guest's
 * payment — which left the booking owing exactly the commission for ever and put
 * the Dues screen's per-agency total out by the commission on every agency
 * booking it counted.
 *
 * **The account is the invariant; how a line gets written is not.** The owner
 * asked for a system that works "formal, informal shob vabei" — a twenty-second
 * form after a phone call, or an agent declaring a bKash transfer for the resort
 * to match, whichever actually happened. So there are several doors into one
 * account and not one of them is required: a resort that only ever uses
 * `received` still ends up with a complete, correct account.
 *
 * **The commission rate is a default in a box, never a rule.** `termsFor` says
 * what the terms would give and the form pre-fills it; the figure two businesses
 * agreed on the phone is the fact, and a ledger that refuses it is a ledger they
 * stop using. What is *written down* is the rate as it read on the day, so a
 * resort raising it in November does not restate October.
 *
 * **What is not here: the guest's money.** That an agent took it is
 * `Payment.collectedByAgentId`, one column on the row that already records money
 * arriving. A second copy in this table would be two tables disagreeing by the
 * end of the month. The balance is therefore
 *
 *     sum of payments this agency collected  +  sum of entries
 *
 * folded by `agentBalance` in `@rh/shared` so the API and both clients cannot
 * drift — the rule `commission.service.ts` exists to enforce.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  agentBalance,
  overCreditLimit,
  type AgentAccountBalance,
  type JwtClaims,
} from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionService } from "../common/commission.service";
import { OptionsService } from "../options/options.service";
import { PermissionsService } from "../common/permissions";
import { badRequest, notFound, requireResortAccess } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";

export const SETTLEMENT_VIEW = "settlement.view";
export const SETTLEMENT_MANAGE = "settlement.manage";

/** One line as a statement prints it, on either client. */
export interface AgentAccountRow {
  id: string;
  kind: string;
  /** signed, the way it moves the balance */
  amount: number;
  date: string;
  status: string;
  booking: { id: number; code: string } | null;
  method: string | null;
  methodLabel: string | null;
  trxId: string | null;
  note: string | null;
  rateKind: string | null;
  rate: number | null;
  by: string | null;
  confirmedBy: string | null;
}

export interface AgentAccountSummary extends AgentAccountBalance {
  agencyId: number;
  /** the agency's name where there is one, else the agent's own */
  name: string;
  /** null for a lone agent, who has no `tenants` row to hold terms */
  accountId: number | null;
  creditLimit: number | null;
  overLimit: boolean;
  bookings: number;
}

@Injectable()
export class AgentAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(CommissionService) private readonly commission: CommissionService,
    @Inject(OptionsService) private readonly options: OptionsService,
  ) {}

  // ─────────────────────── who an account belongs to ───────────────────────

  /**
   * The agency behind an agent: their owner, or themselves.
   *
   * `parentAgentId ?? id` makes a lone agent no special case — a one-person
   * agency is its own owner, exactly as `AgencyContext` computes it for every
   * agency-side service. Being one function means the resort side and the agency
   * side cannot key the same account two ways, which would show an agency a
   * balance the resort does not have.
   */
  async agencyOf(agentUserId: number): Promise<number> {
    const u = await this.prisma.user.findUnique({
      where: { id: agentUserId },
      select: { id: true, parentAgentId: true },
    });
    if (!u) throw notFound("No such agent");
    return u.parentAgentId ?? u.id;
  }

  /** Everyone who acts for this agency: the owner and their staff. */
  async actorIds(agencyId: number): Promise<number[]> {
    const staff = await this.prisma.user.findMany({
      where: { parentAgentId: agencyId },
      select: { id: true },
    });
    return [agencyId, ...staff.map((s) => s.id)];
  }

  // ───────────────────────────── the balance ─────────────────────────────

  /**
   * Every line on one or more accounts at this resort, bucketed by agency.
   *
   * Two reads whatever the number of agencies — the per-agency loop that would
   * read one account at a time is how a screen listing thirty agencies becomes
   * sixty queries.
   */
  private async linesFor(resortId: number, agencyIds: number[]) {
    const out = new Map<number, { kind: string; amount: number; status: string }[]>();
    if (agencyIds.length === 0) return out;
    for (const id of agencyIds) out.set(id, []);

    const actors = await this.prisma.user.findMany({
      where: { OR: [{ id: { in: agencyIds } }, { parentAgentId: { in: agencyIds } }] },
      select: { id: true, parentAgentId: true },
    });
    const actorToAgency = new Map<number, number>();
    for (const a of actors) actorToAgency.set(a.id, a.parentAgentId ?? a.id);

    const [entries, payments] = await Promise.all([
      this.prisma.agentAccountEntry.findMany({
        where: { resortId, agencyId: { in: agencyIds } },
        select: { agencyId: true, kind: true, amount: true, status: true },
      }),
      this.prisma.payment.findMany({
        where: {
          collectedByAgentId: { in: [...actorToAgency.keys()] },
          booking: { resortId, deletedAt: null },
        },
        select: { collectedByAgentId: true, amount: true, paymentType: true },
      }),
    ]);

    const push = (agencyId: number, line: { kind: string; amount: number; status: string }) => {
      const list = out.get(agencyId);
      if (list) list.push(line);
    };
    for (const e of entries) {
      push(e.agencyId, { kind: e.kind, amount: Number(e.amount), status: e.status });
    }
    for (const p of payments) {
      const agencyId = p.collectedByAgentId == null ? undefined : actorToAgency.get(p.collectedByAgentId);
      if (agencyId == null) continue;
      /**
       * A refund an agent handed back to the guest is money they are no longer
       * holding, so it comes off what they owe — rather than being skipped, the
       * way a booking's own `paid` skips it.
       */
      const amount = Number(p.amount) * (p.paymentType === "REFUND" ? -1 : 1);
      push(agencyId, { kind: "COLLECTED", amount, status: "CONFIRMED" });
    }
    return out;
  }

  /** One account's balance. The same fold both clients render. */
  async balanceOf(resortId: number, agencyId: number): Promise<AgentAccountBalance> {
    const lines = await this.linesFor(resortId, [agencyId]);
    return agentBalance(lines.get(agencyId) ?? []);
  }

  /**
   * The terms row that carries this agency's credit limit.
   *
   * Keyed by the `tenants` id, because that is what `ResortAgency` is keyed by —
   * the row that already holds the commission a resort struck with an agency,
   * and so the right place for the limit it sets on the same agency. A lone
   * agent with no account has no row and therefore no limit, which is the honest
   * answer rather than an invented one.
   */
  async termsRow(resortId: number, agencyId: number) {
    const owner = await this.prisma.user.findUnique({
      where: { id: agencyId },
      select: { accountId: true },
    });
    if (owner?.accountId == null) return { accountId: null, creditLimit: null as number | null };
    const deal = await this.prisma.resortAgency.findUnique({
      where: { resortId_accountId: { resortId, accountId: owner.accountId } },
      select: { creditLimit: true },
    });
    return {
      accountId: owner.accountId,
      creditLimit: deal?.creditLimit == null ? null : Number(deal.creditLimit),
    };
  }

  /**
   * Whether this agency may take another booking at this resort.
   *
   * Called from booking creation. Answers yes for every resort that has not set
   * a limit — which is all of them until somebody asks — so nothing changes for
   * anybody by this existing.
   */
  async assertMayBook(resortId: number, agentUserId: number): Promise<void> {
    const agencyId = await this.agencyOf(agentUserId);
    const { creditLimit } = await this.termsRow(resortId, agencyId);
    if (creditLimit == null) return;
    const { balance } = await this.balanceOf(resortId, agencyId);
    if (!overCreditLimit(balance, creditLimit)) return;
    /**
     * The figures are in the sentence. "You have reached your credit limit"
     * without them sends somebody to the telephone; with them, to their bKash.
     */
    throw badRequest(
      `This agency is holding ${round2(balance).toLocaleString("en-IN")} of the resort's money, ` +
        `which is at or over the ${round2(creditLimit).toLocaleString("en-IN")} limit. ` +
        `Settle up before booking again.`,
    );
  }

  // ─────────────────────────── the resort's list ───────────────────────────

  /**
   * Every agency this resort has anything to settle with.
   *
   * Anything, not just a balance: an agency square at zero still belongs on the
   * screen, because "have we settled with them" is answered by seeing them and
   * seeing nothing owed — not by their absence, which reads the same as never
   * having heard of them.
   */
  async accounts(
    claims: JwtClaims,
    resortId: number,
  ): Promise<{
    rows: AgentAccountSummary[];
    owedToResort: number;
    owedToAgents: number;
    pending: number;
  }> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_VIEW);

    const [sold, filed] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ["agentUserId"],
        where: { resortId, deletedAt: null, agentUserId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.agentAccountEntry.groupBy({ by: ["agencyId"], where: { resortId } }),
    ]);

    const sellers = sold.map((s) => s.agentUserId).filter((id): id is number => id != null);
    const sellerRows = sellers.length
      ? await this.prisma.user.findMany({
          where: { id: { in: sellers } },
          select: { id: true, parentAgentId: true },
        })
      : [];
    const agencyOfSeller = new Map(sellerRows.map((u) => [u.id, u.parentAgentId ?? u.id]));

    const bookingsPer = new Map<number, number>();
    for (const s of sold) {
      const agencyId = s.agentUserId == null ? undefined : agencyOfSeller.get(s.agentUserId);
      if (agencyId == null) continue;
      bookingsPer.set(agencyId, (bookingsPer.get(agencyId) ?? 0) + s._count._all);
    }

    const agencyIds = [...new Set([...bookingsPer.keys(), ...filed.map((f) => f.agencyId)])];
    if (agencyIds.length === 0) return { rows: [], owedToResort: 0, owedToAgents: 0, pending: 0 };

    const [owners, lines] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: agencyIds } },
        select: { id: true, name: true, accountId: true, account: { select: { id: true, name: true } } },
      }),
      this.linesFor(resortId, agencyIds),
    ]);

    const accountIds = owners.map((o) => o.accountId).filter((id): id is number => id != null);
    const limits = accountIds.length
      ? await this.prisma.resortAgency.findMany({
          where: { resortId, accountId: { in: accountIds } },
          select: { accountId: true, creditLimit: true },
        })
      : [];
    const limitOf = new Map(
      limits.map((l) => [l.accountId, l.creditLimit == null ? null : Number(l.creditLimit)]),
    );

    const rows: AgentAccountSummary[] = owners.map((o) => {
      const bal = agentBalance(lines.get(o.id) ?? []);
      const creditLimit = o.accountId == null ? null : (limitOf.get(o.accountId) ?? null);
      return {
        agencyId: o.id,
        // the agency's name, falling back to the person's — a lone agent is
        // named by themselves, the way the Dues screen names them
        name: o.account?.name ?? o.name,
        accountId: o.accountId ?? null,
        creditLimit,
        overLimit: overCreditLimit(bal.balance, creditLimit),
        bookings: bookingsPer.get(o.id) ?? 0,
        ...bal,
      };
    });
    rows.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

    return {
      /** Struck apart, because they are two different telephone calls. */
      owedToResort: round2(rows.reduce((s, r) => s + Math.max(0, r.balance), 0)),
      owedToAgents: round2(rows.reduce((s, r) => s + Math.max(0, -r.balance), 0)),
      pending: round2(rows.reduce((s, r) => s + r.pending, 0)),
      rows,
    };
  }

  // ───────────────────────────── one statement ─────────────────────────────

  /**
   * One account, with every line behind the figure.
   *
   * The same shape the agency reads about itself, so the statement the resort
   * prints and the statement the agency prints are one document. Two renderings
   * of one account would be the first thing argued about.
   */
  async statement(
    claims: JwtClaims,
    resortId: number,
    agencyId: number,
    query: { from?: string; to?: string } = {},
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_VIEW);
    return this.statementFor(resortId, agencyId, query);
  }

  /** Without the resort-side permission check, for an agency reading its own. */
  async statementFor(resortId: number, agencyId: number, query: { from?: string; to?: string } = {}) {
    // read once: it is two queries, and it was being asked for twice
    const { accountId, creditLimit } = await this.termsRow(resortId, agencyId);
    const [resort, owner, terms, methods] = await Promise.all([
      this.prisma.resort.findUnique({
        where: { id: resortId },
        select: { id: true, name: true, timezone: true, currency: true, locale: true },
      }),
      this.prisma.user.findUnique({
        where: { id: agencyId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          accountId: true,
          account: { select: { name: true } },
        },
      }),
      this.commission.termsFor(resortId, accountId),
      this.options.active(resortId, "PAYMENT_METHOD"),
    ]);
    if (!resort) throw notFound("No such resort");
    if (!owner) throw notFound("No such agency");

    const label = new Map(methods.map((m) => [m.code, m.label]));
    const actors = await this.actorIds(agencyId);

    const from = query.from ? dateOnly(query.from) : undefined;
    const to = query.to ? dateOnly(query.to) : undefined;
    const ranged = from != null || to != null;

    const [entries, payments] = await Promise.all([
      this.prisma.agentAccountEntry.findMany({
        where: { resortId, agencyId, ...(ranged ? { date: { gte: from, lte: to } } : {}) },
        include: {
          booking: { select: { id: true, code: true } },
          createdBy: { select: { name: true } },
          confirmedBy: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
      this.prisma.payment.findMany({
        where: {
          collectedByAgentId: { in: actors },
          booking: { resortId, deletedAt: null },
          ...(ranged ? { receivedAt: { gte: from, lte: to } } : {}),
        },
        include: {
          booking: { select: { id: true, code: true } },
          collectedByAgent: { select: { name: true } },
        },
        orderBy: { id: "desc" },
      }),
    ]);

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const rows: AgentAccountRow[] = [
      ...payments.map((p) => ({
        id: `p${p.id}`,
        kind: "COLLECTED",
        amount: round2(Number(p.amount) * (p.paymentType === "REFUND" ? -1 : 1)),
        date: iso(p.receivedAt),
        status: "CONFIRMED",
        booking: p.booking ? { id: p.booking.id, code: p.booking.code } : null,
        method: p.method,
        methodLabel: p.method ? (label.get(p.method) ?? p.method) : null,
        trxId: null,
        note: p.note,
        rateKind: null,
        rate: null,
        by: p.collectedByAgent?.name ?? null,
        confirmedBy: null,
      })),
      ...entries.map((e) => ({
        id: `e${e.id}`,
        kind: e.kind,
        amount: round2(Number(e.amount)),
        date: iso(e.date),
        status: e.status,
        booking: e.booking ? { id: e.booking.id, code: e.booking.code } : null,
        method: e.method,
        methodLabel: e.method ? (label.get(e.method) ?? e.method) : null,
        trxId: e.trxId,
        note: e.note,
        rateKind: e.rateKind,
        rate: e.rate == null ? null : Number(e.rate),
        by: e.createdBy?.name ?? null,
        confirmedBy: e.confirmedBy?.name ?? null,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    /**
     * The totals are about the account and never about the date range.
     *
     * "What is the balance" is one number about two businesses; a figure that
     * quietly meant "of the lines shown for September" is one somebody
     * reconciles against and cannot make balance. The construction book's three
     * figures follow the same rule.
     */
    const all = await this.linesFor(resortId, [agencyId]);
    const totals = agentBalance(all.get(agencyId) ?? []);

    return {
      resort: {
        id: resort.id,
        name: resort.name,
        timezone: resort.timezone,
        currency: resort.currency,
        locale: resort.locale,
      },
      agency: {
        agencyId: owner.id,
        name: owner.account?.name ?? owner.name,
        contact: owner.name,
        phone: owner.phone,
        email: owner.email,
      },
      terms: { kind: terms.kind, rate: terms.rate },
      creditLimit,
      overLimit: overCreditLimit(totals.balance, creditLimit),
      /** so the forms on both clients offer only the methods this resort takes */
      methods: methods.map((m) => ({ code: m.code, label: m.label })),
      ...totals,
      rows,
    };
  }
}
