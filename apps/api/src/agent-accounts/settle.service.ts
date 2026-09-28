/**
 * The doors into an agent's account.
 *
 * Six of them, and **not one is mandatory** — the requirement in the owner's own
 * words was "formal, informal shob vabei jeno amar system theke best ease pawa
 * jai". A resort that only ever uses `received` ends up with a complete and
 * correct account; a resort that wants the whole paper trail has the rest.
 *
 * | door | who |
 * | --- | --- |
 * | `received` — what came in and what the agent kept, in one form | resort |
 * | `collect` — took money from the guest | agent |
 * | `declare` — sent it by bKash, here is the TrxID | agent, resort confirms |
 * | `entry` — commission, commission paid, an advance, an adjustment | resort |
 * | `confirm` / `reject` — match a declaration against the bank | resort |
 * | `setLimit` — how much of ours they may hold | resort |
 *
 * `received` is the one that matters, because it is the one that describes what
 * actually happens: *"boro vai, ami amar commission raikha apnare baki ta die
 * ditesi."* One form — 9,000 came in, 1,000 was kept — writes the guest's
 * payment of 10,000, the remittance of 9,000 and the commission of 1,000
 * together, and the account lands on zero. Before it, the only thing the
 * software offered was "the guest paid 9,000", which left the booking owing the
 * commission for ever.
 *
 * **An agent may declare a remittance and never confirm one.** An agent writing
 * "I paid you" straight into the resort's books is not a ledger. A declared line
 * sits `PENDING`, outside the balance, until somebody at the resort matches it
 * against the money — the idiom `cancelState` already uses, where the agent asks
 * and the resort agrees.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ENTRY_SIGN,
  isStoredAgentEntryKind,
  type AgentEntryKind,
  type JwtClaims,
} from "@rh/shared";
import type { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { CommissionService } from "../common/commission.service";
import { OptionsService } from "../options/options.service";
import { PermissionsService } from "../common/permissions";
import { TaxService } from "../common/tax.service";
import { BookingsService } from "../bookings/bookings.service";
import { badRequest, forbid, notFound, requireResortAccess } from "../common/rbac";
import { dateOnly, round2, todayIn } from "../common/dates";
import { AgentAccountsService, SETTLEMENT_MANAGE } from "./agent-accounts.service";

export interface ReceivedInput {
  /** what the resort actually got */
  amount: number;
  /** what the agent kept out of it */
  commission?: number;
  /** the stay this was about, where it was about one */
  bookingId?: number;
  method: string;
  trxId?: string;
  date?: string;
  note?: string;
  clientRef?: string;
}

export interface EntryInput {
  kind: string;
  amount: number;
  bookingId?: number;
  method?: string;
  trxId?: string;
  date?: string;
  note?: string;
  clientRef?: string;
}

@Injectable()
export class SettleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(CommissionService) private readonly commission: CommissionService,
    @Inject(OptionsService) private readonly options: OptionsService,
    @Inject(TaxService) private readonly tax: TaxService,
    @Inject(AgentAccountsService) private readonly accounts: AgentAccountsService,
  ) {}

  // ─────────────────────────────── helpers ───────────────────────────────

  /** The resort's today, never the server's. Dhaka is UTC+6. */
  private async today(resortId: number): Promise<Date> {
    const r = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { timezone: true },
    });
    return todayIn(r?.timezone ?? "Asia/Dhaka");
  }

  /**
   * The booking, proven to belong to this resort *and* to this agency.
   *
   * Both halves matter. Without the resort check a crafted id reaches another
   * resort's stay; without the agency check one agency's settlement could credit
   * a booking another agency sold, which is the same money in the wrong account.
   */
  private async ownBooking(resortId: number, agencyId: number, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: true,
        payments: true,
        agentUser: { select: { id: true, parentAgentId: true } },
      },
    });
    if (!b || b.deletedAt || b.resortId !== resortId) throw notFound("Booking not found");
    const soldBy = b.agentUser ? (b.agentUser.parentAgentId ?? b.agentUser.id) : null;
    if (soldBy !== agencyId) throw badRequest("That booking was not sold by this agency");
    return b;
  }

  /** What is still owed on a booking, by the one arithmetic in `money.ts`. */
  private async dueOn(
    booking: Prisma.BookingGetPayload<{ include: { items: true; payments: true } }>,
  ): Promise<number> {
    const rules = await this.tax.rulesFor(booking.resortId);
    return BookingsService.computeTotals(booking, rules).due;
  }

  /**
   * Writes the guest's payment and keeps `paymentState` honest.
   *
   * `payments.create` is deliberately not required for this: the person settling
   * with an agency holds `settlement.manage`, and money arriving through an
   * agency is the same event whether the desk counted it or the owner did. The
   * state is recomputed here rather than by calling `BookingsService.detail`,
   * which would make this module and bookings depend on each other.
   */
  private async creditGuest(
    tx: Prisma.TransactionClient,
    booking: Prisma.BookingGetPayload<{ include: { items: true; payments: true } }>,
    input: {
      amount: number;
      method: string;
      note?: string;
      clientRef?: string;
      collectedByAgentId: number;
      receivedById: number;
      receivedAt?: Date;
    },
  ) {
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        amount: input.amount as never,
        method: input.method,
        paymentType: booking.payments.length === 0 ? "ADVANCE" : "FINAL",
        receivedById: input.receivedById,
        collectedByAgentId: input.collectedByAgentId,
        note: input.note,
        clientRef: input.clientRef,
        ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
    const rules = await this.tax.rulesFor(booking.resortId);
    const after = BookingsService.computeTotals(
      { ...booking, payments: [...booking.payments, payment] },
      rules,
    );
    if (after.paymentState !== booking.paymentState) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { paymentState: after.paymentState as never },
      });
    }
    return payment;
  }

  /**
   * The sign a line is stored with.
   *
   * `ADJUSTMENT` keeps the sign it was given, because writing off what an agency
   * owes and recording that we owe them more are the same act in two directions.
   * Everything else is forced to its own direction, so a remittance cannot be
   * filed as a figure that *increases* what the agent owes.
   */
  private signed(kind: AgentEntryKind, amount: number): number {
    const n = round2(Number(amount));
    if (!Number.isFinite(n) || n === 0) throw badRequest("The amount cannot be zero");
    const sign = AGENT_ENTRY_SIGN[kind];
    if (sign === 0) return n;
    return sign * Math.abs(n);
  }

  private async assertMethod(resortId: number, method: string | undefined | null) {
    if (method == null || method === "") return null;
    await this.options.assertAccepted(resortId, "PAYMENT_METHOD", method);
    return method;
  }

  // ──────────────────── the door that matters: received ────────────────────

  /**
   * "The agent sent 9,000 and kept 1,000." One form, three facts.
   *
   * The guest's bill is credited with the whole of it — what arrived plus what
   * was kept — because that is what the guest paid. Recording only the 9,000 is
   * the bug this module exists to end.
   */
  async received(claims: JwtClaims, resortId: number, agencyId: number, input: ReceivedInput) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_MANAGE);

    const amount = round2(Number(input.amount ?? 0));
    const commission = round2(Number(input.commission ?? 0));
    if (!Number.isFinite(amount) || amount < 0) throw badRequest("What came in cannot be negative");
    if (!Number.isFinite(commission) || commission < 0) throw badRequest("Commission cannot be negative");
    if (amount <= 0 && commission <= 0) throw badRequest("Nothing to record");

    const method = (await this.assertMethod(resortId, input.method)) ?? undefined;
    if (amount > 0 && method == null) throw badRequest("Say how the money came in");
    const date = input.date ? dateOnly(input.date) : await this.today(resortId);

    // a replay is answered with the original, never with a second receipt
    if (input.clientRef) {
      const seen = await this.prisma.agentAccountEntry.findUnique({
        where: { resortId_clientRef: { resortId, clientRef: input.clientRef } },
      });
      if (seen) return { replayed: true, ...(await this.accounts.balanceOf(resortId, agencyId)) };
    }

    const booking = input.bookingId
      ? await this.ownBooking(resortId, agencyId, input.bookingId)
      : null;

    const credit = round2(amount + commission);
    if (booking) {
      const due = await this.dueOn(booking);
      if (due <= 0.005) {
        throw badRequest(
          `${booking.code} is already paid in full. Record this against another stay, ` +
            `or leave the booking out and file it against the account.`,
        );
      }
      /**
       * An extra zero is the commonest mistake on this form, and it is the one
       * that makes a statement unarguable-with in the wrong direction. The
       * tolerance is a rounding, not a policy: genuine prepayment goes through
       * the desk, where overpaying a bill is already allowed.
       */
      if (credit > round2(due + 0.5)) {
        throw badRequest(
          `${booking.code} has ${due.toLocaleString("en-IN")} outstanding and this comes to ` +
            `${credit.toLocaleString("en-IN")}. Check the figures, or leave the booking out ` +
            `and file it against the account.`,
        );
      }
    }

    /** The terms as they read today, written down rather than recomputed later. */
    const { accountId } = await this.accounts.termsRow(resortId, agencyId);
    const terms = await this.commission.termsFor(resortId, accountId);

    const written = await this.prisma.$transaction(async (tx) => {
      if (booking && credit > 0) {
        await this.creditGuest(tx, booking, {
          amount: credit,
          method: method!,
          note: input.note,
          clientRef: input.clientRef ? `agent:${input.clientRef}` : undefined,
          // a lump arriving from an agency is the agency's, not any one
          // person's — the owner is who the account belongs to
          collectedByAgentId: agencyId,
          receivedById: claims.userId,
          receivedAt: date,
        });
      }
      const made: { id: string; kind: string; amount: number }[] = [];
      if (amount > 0) {
        const remit = await tx.agentAccountEntry.create({
          data: {
            resortId,
            agencyId,
            kind: "REMIT",
            amount: this.signed("REMIT", amount) as never,
            date,
            bookingId: booking?.id ?? null,
            method,
            trxId: input.trxId,
            note: input.note,
            createdById: claims.userId,
            clientRef: input.clientRef,
          },
        });
        made.push({ id: remit.id.toString(), kind: "REMIT", amount: Number(remit.amount) });
      }
      if (commission > 0) {
        const kept = await tx.agentAccountEntry.create({
          data: {
            resortId,
            agencyId,
            kind: "COMMISSION",
            amount: this.signed("COMMISSION", commission) as never,
            date,
            bookingId: booking?.id ?? null,
            note: input.note,
            rateKind: terms.kind,
            rate: terms.rate as never,
            createdById: claims.userId,
            clientRef: input.clientRef ? `${input.clientRef}:c` : undefined,
          },
        });
        made.push({ id: kept.id.toString(), kind: "COMMISSION", amount: Number(kept.amount) });
      }
      return made;
    });

    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.received",
      entity: "agentAccount",
      entityId: agencyId,
      diff: { amount, commission, bookingId: booking?.id ?? null, method, trxId: input.trxId },
    });

    return { replayed: false, written, ...(await this.accounts.balanceOf(resortId, agencyId)) };
  }

  // ───────────────────────── one line at a time ─────────────────────────

  /** A remittance, a commission, a payout, an advance or an adjustment. */
  async entry(claims: JwtClaims, resortId: number, agencyId: number, input: EntryInput) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_MANAGE);

    if (!isStoredAgentEntryKind(input.kind)) {
      throw badRequest(
        `Not a kind of line this account keeps: ${input.kind}. ` +
          `Guest money an agent took is recorded on the booking, not here.`,
      );
    }
    const kind = input.kind as AgentEntryKind;
    const amount = this.signed(kind, input.amount);
    const method = await this.assertMethod(resortId, input.method);
    const date = input.date ? dateOnly(input.date) : await this.today(resortId);

    if (input.clientRef) {
      const seen = await this.prisma.agentAccountEntry.findUnique({
        where: { resortId_clientRef: { resortId, clientRef: input.clientRef } },
      });
      if (seen) {
        return {
          id: seen.id.toString(),
          replayed: true,
          ...(await this.accounts.balanceOf(resortId, agencyId)),
        };
      }
    }

    const booking = input.bookingId
      ? await this.ownBooking(resortId, agencyId, input.bookingId)
      : null;

    let rateKind: string | null = null;
    let rate: number | null = null;
    if (kind === "COMMISSION") {
      const { accountId } = await this.accounts.termsRow(resortId, agencyId);
      const terms = await this.commission.termsFor(resortId, accountId);
      rateKind = terms.kind;
      rate = terms.rate;
    }

    const row = await this.prisma.agentAccountEntry.create({
      data: {
        resortId,
        agencyId,
        kind,
        amount: amount as never,
        date,
        bookingId: booking?.id ?? null,
        method,
        trxId: input.trxId,
        note: input.note,
        rateKind,
        rate: rate as never,
        createdById: claims.userId,
        clientRef: input.clientRef,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.entry.add",
      entity: "agentAccount",
      entityId: agencyId,
      diff: { kind, amount, bookingId: booking?.id ?? null, method },
    });
    return { id: row.id.toString(), replayed: false, ...(await this.accounts.balanceOf(resortId, agencyId)) };
  }

  /** Correcting a line. Audited, because somebody's balance just moved. */
  async remove(claims: JwtClaims, resortId: number, entryId: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_MANAGE);
    const row = await this.mine(resortId, entryId);
    await this.prisma.agentAccountEntry.delete({ where: { id: row.id } });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.entry.remove",
      entity: "agentAccount",
      entityId: row.agencyId,
      diff: { kind: row.kind, amount: Number(row.amount), status: row.status },
    });
    return { removed: true, ...(await this.accounts.balanceOf(resortId, row.agencyId)) };
  }

  /**
   * Matching a declaration against the money.
   *
   * The line only enters the balance here. Until somebody at the resort has seen
   * the bKash, what the agency typed is a claim.
   */
  async confirm(claims: JwtClaims, resortId: number, entryId: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_MANAGE);
    const row = await this.mine(resortId, entryId);
    if (row.status !== "PENDING") throw badRequest("That line is already confirmed");
    await this.prisma.agentAccountEntry.update({
      where: { id: row.id },
      data: { status: "CONFIRMED", confirmedById: claims.userId, confirmedAt: new Date() },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.entry.confirm",
      entity: "agentAccount",
      entityId: row.agencyId,
      diff: { kind: row.kind, amount: Number(row.amount), trxId: row.trxId },
    });
    return { confirmed: true, ...(await this.accounts.balanceOf(resortId, row.agencyId)) };
  }

  private async mine(resortId: number, entryId: string) {
    const id = BigInt(String(entryId).replace(/^e/, ""));
    const row = await this.prisma.agentAccountEntry.findUnique({ where: { id } });
    if (!row || row.resortId !== resortId) throw notFound("No such line");
    return row;
  }

  // ─────────────────────────── the credit limit ───────────────────────────

  /**
   * How much of the resort's money this agency may hold before it stops being
   * able to book. Null clears it, and null is the default everywhere.
   */
  async setLimit(claims: JwtClaims, resortId: number, agencyId: number, limit: number | null) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, SETTLEMENT_MANAGE);
    const { accountId } = await this.accounts.termsRow(resortId, agencyId);
    if (accountId == null) {
      throw badRequest(
        "This agent sells on their own, without an agency account, so there is no " +
          "trade relationship to set a limit on.",
      );
    }
    const value = limit == null ? null : round2(Number(limit));
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      throw badRequest("A credit limit cannot be negative");
    }
    await this.prisma.resortAgency.upsert({
      where: { resortId_accountId: { resortId, accountId } },
      update: { creditLimit: value as never },
      create: { resortId, accountId, creditLimit: value as never },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.limit.set",
      entity: "agentAccount",
      entityId: agencyId,
      diff: { creditLimit: value },
    });
    return { creditLimit: value };
  }

  // ───────────────────────────── the agent's doors ─────────────────────────

  /**
   * "I took money from the guest."
   *
   * Written on the booking, so the desk stops asking a guest who has already
   * paid. `collectedByAgentId` is the person who took it and `receivedById` the
   * person who recorded it — here they are the same, and at the resort's end of
   * a telephone call they are not.
   */
  async collect(
    claims: JwtClaims,
    agencyId: number,
    bookingId: number,
    input: { amount: number; method: string; note?: string; clientRef?: string; date?: string },
  ) {
    const amount = round2(Number(input.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest("The amount must be more than zero");

    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: true,
        payments: true,
        agentUser: { select: { id: true, parentAgentId: true } },
      },
    });
    if (!b || b.deletedAt) throw notFound("Booking not found");
    const soldBy = b.agentUser ? (b.agentUser.parentAgentId ?? b.agentUser.id) : null;
    if (soldBy !== agencyId) throw forbid("Not your booking");
    if (b.state === "CANCELLED") throw badRequest("That booking is cancelled");

    const method = await this.assertMethod(b.resortId, input.method);
    if (method == null) throw badRequest("Say how the guest paid");

    if (input.clientRef) {
      const seen = await this.prisma.payment.findUnique({
        where: { bookingId_clientRef: { bookingId, clientRef: input.clientRef } },
      });
      if (seen) {
        return {
          replayed: true,
          amount: Number(seen.amount),
          ...(await this.accounts.balanceOf(b.resortId, agencyId)),
        };
      }
    }

    const due = await this.dueOn(b);
    if (due <= 0.005) throw badRequest(`${b.code} is already paid in full`);
    if (amount > round2(due + 0.5)) {
      throw badRequest(
        `${b.code} has ${due.toLocaleString("en-IN")} outstanding and you have entered ` +
          `${amount.toLocaleString("en-IN")}.`,
      );
    }

    const payment = await this.prisma.$transaction((tx) =>
      this.creditGuest(tx, b, {
        amount,
        method,
        note: input.note,
        clientRef: input.clientRef,
        collectedByAgentId: claims.userId,
        receivedById: claims.userId,
        ...(input.date ? { receivedAt: dateOnly(input.date) } : {}),
      }),
    );
    await this.audit.log({
      actorId: claims.userId,
      resortId: b.resortId,
      action: "agent.collected",
      entity: "booking",
      entityId: bookingId,
      diff: { amount, method },
    });
    return {
      replayed: false,
      amount: Number(payment.amount),
      ...(await this.accounts.balanceOf(b.resortId, agencyId)),
    };
  }

  /**
   * "I sent it, here is the TrxID."
   *
   * `PENDING`, and therefore outside the balance, until the resort matches it.
   * An agency that could confirm its own remittances could reduce what it owes
   * by typing, and then the statement is not a statement.
   */
  async declare(
    claims: JwtClaims,
    agencyId: number,
    resortId: number,
    input: { amount: number; method: string; trxId?: string; note?: string; date?: string; clientRef?: string },
  ) {
    const amount = round2(Number(input.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest("The amount must be more than zero");
    const method = await this.assertMethod(resortId, input.method);
    if (method == null) throw badRequest("Say how you sent it");
    const date = input.date ? dateOnly(input.date) : await this.today(resortId);

    if (input.clientRef) {
      const seen = await this.prisma.agentAccountEntry.findUnique({
        where: { resortId_clientRef: { resortId, clientRef: input.clientRef } },
      });
      if (seen) return { id: seen.id.toString(), replayed: true, status: seen.status };
    }

    const row = await this.prisma.agentAccountEntry.create({
      data: {
        resortId,
        agencyId,
        kind: "REMIT",
        amount: this.signed("REMIT", amount) as never,
        date,
        method,
        trxId: input.trxId,
        note: input.note,
        status: "PENDING",
        createdById: claims.userId,
        clientRef: input.clientRef,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "agent.remit.declare",
      entity: "agentAccount",
      entityId: agencyId,
      diff: { amount, method, trxId: input.trxId },
    });
    return { id: row.id.toString(), replayed: false, status: "PENDING" as const };
  }

  /** An agent withdrawing a declaration nobody has matched yet. */
  async withdraw(claims: JwtClaims, agencyId: number, entryId: string) {
    const id = BigInt(String(entryId).replace(/^e/, ""));
    const row = await this.prisma.agentAccountEntry.findUnique({ where: { id } });
    if (!row || row.agencyId !== agencyId) throw notFound("No such line");
    if (row.status !== "PENDING") {
      throw badRequest("The resort has already confirmed that one — ask them to correct it");
    }
    await this.prisma.agentAccountEntry.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      resortId: row.resortId,
      action: "agent.remit.withdraw",
      entity: "agentAccount",
      entityId: agencyId,
      diff: { amount: Number(row.amount), trxId: row.trxId },
    });
    return { withdrawn: true };
  }
}
