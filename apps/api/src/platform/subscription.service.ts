/**
 * The owner's own subscription — read it, and change it.
 *
 * Everything about a resort's subscription used to live on the super admin's
 * side of the wall. The Settings screen had a "Change plan" row, but it
 * rendered only for `SUPER_ADMIN` and called `PATCH /tenants/:id/plan`, which
 * is `requireRoles(SUPER_ADMIN)` as well — so the person whose subscription it
 * was had no control at all. And the field that endpoint writes, `Tenant.plan`,
 * is not the one the billing sweep reads, so even for a super admin it changed
 * a label while the fee, the renewal date and the status stayed where they
 * were.
 *
 * There was also nothing to read. What am I paying, when does it renew, what
 * is outstanding, what would the next plan up cost me — none of it was
 * anywhere in the console. A platform that bills monthly and answers none of
 * those questions is one the customer has to phone.
 *
 * Four rules decide the money here, and `subscription-self-service.spec.ts`
 * holds each of them:
 *
 * 1. **An upgrade is immediate and pro rata.** The bill is the difference in
 *    monthly fee, for the days left in the period — not a full month, and not
 *    nothing.
 * 2. **A downgrade waits for the renewal.** The current month is paid for;
 *    taking the plan away now would be taking back something already invoiced.
 *    The request parks in `pendingPlan` and the sweep applies it.
 * 3. **The renewal date never moves.** A plan change is not a renewal.
 * 4. **A trial holds no money,** so a change inside one is immediate and free —
 *    and never restarts the trial.
 *
 * The plan row is the authority throughout: a plan the super admin adds or
 * withdraws in Platform → Plans takes effect here with no deploy.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuditService } from "../common/audit.service";
import { badRequest, requireResortAccess } from "../common/rbac";
import { round2 } from "../common/dates";
import { openingSubscription } from "../common/offers";
import { addPeriod, perMonthEquivalent, settleMonths, type Phase } from "@rh/shared";
import { scheduleFor, schedulesFor, toPhases, type ResolvedSchedule } from "../common/plan-schedules";

const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE"] as const;
const OPEN = ["DUE", "OVERDUE"] as const;
/** How much history the owner's screen carries. Two years of monthly bills. */
const BILL_HISTORY = 24;



/** Which way a plan sits relative to the one the resort is on. */
export type PlanDirection = "current" | "upgrade" | "downgrade" | "available";

/** One way a plan can be bought, as a card has to draw it. */
export interface ScheduleOnSale {
  id: number;
  label: string;
  /**
   * The ladder itself. Sent raw rather than as a sentence because the sentence
   * needs a currency and a locale, and those belong to whoever is drawing it —
   * `scheduleSentence` in @rh/shared takes the formatter for exactly this
   * reason. The console, the public site and the phone each call it.
   */
  phases: Phase[];
  /** What the first period costs — the number a signup actually charges. */
  openingFee: number;
  /** The settle price as a monthly figure: what the saving badge compares. */
  perMonth: number;
}

export interface PlanOnSale {
  name: string;
  label: string;
  /** Every way this plan is sold, in the owner's own order. Never empty. */
  schedules: ScheduleOnSale[];
  maxRooms: number;
  maxResorts: number;
  blurb: string | null;
  direction: PlanDirection;
}

export interface SubscriptionDetail {
  plan: string | null;
  planLabel: string | null;
  blurb: string | null;
  /** TRIAL | ACTIVE | PAST_DUE, or NONE when the resort has no subscription. */
  status: string;
  /** The `PlanSchedule` this account bought on — what a period is, and what it costs. */
  scheduleId: number | null;
  scheduleLabel: string | null;
  /** What this account pays each period: a month's fee, or a year's. */
  fee: number;
  /** The same money per month, so the two rhythms can be compared at a glance. */
  feePerMonth: number;
  startedAt: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  /** A downgrade already asked for, landing at `renewsAt`. */
  pendingPlan: string | null;
  pendingPlanLabel: string | null;
  /** A move to a different schedule, landing at `renewsAt`. */
  pendingScheduleId: number | null;
  pendingScheduleLabel: string | null;
  limits: { maxRooms: number; maxResorts: number; label: string };
  usage: { rooms: number; resorts: number };
  outstanding: { amount: number; count: number };
  bills: {
    id: string;
    amount: number;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    status: string;
    paidAt: string | null;
    note: string | null;
  }[];
  plans: PlanOnSale[];
}

export interface PlanChangeResult {
  plan: string;
  planLabel: string;
  /** The schedule the account is on, or moving to. */
  scheduleId: number;
  scheduleLabel: string;
  /** now — applied; renewal — parked until the period ends; cancelled — a pending change called off. */
  effective: "now" | "renewal" | "cancelled";
  effectiveFrom: string | null;
  /** The pro-rata charge raised, in taka. Zero for a downgrade or a trial. */
  charged: number;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── reading ───────────────────────────

  async detail(claims: JwtClaims, resortId: number): Promise<SubscriptionDetail> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "billing.view");

    // the console is per resort; the subscription is the account's
    const accountId = await this.accountOf(resortId);
    const [sub, onSale, limits] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { accountId, status: { in: [...LIVE] } },
        orderBy: { id: "desc" },
      }),
      this.planLimits.onSale(),
      this.planLimits.forResort(resortId),
    ]);

    const [rooms, resorts, bills, open] = await Promise.all([
      this.prisma.room.count({ where: { resortId, deletedAt: null } }),
      this.prisma.resort.count({ where: { tenantId: accountId } }),
      // by account, not by subscription: a subscription the super admin
      // cancelled and replaced still billed this account, and its invoices are
      // the owner's to read
      this.prisma.subscriptionDue.findMany({
        where: { accountId },
        orderBy: { periodStart: "desc" },
        take: BILL_HISTORY,
      }),
      this.prisma.subscriptionDue.aggregate({
        where: { accountId, status: { in: [...OPEN] } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const current = sub ? onSale.find((p) => p.name === sub.plan) : undefined;
    const mine = await this.scheduleOf(sub?.scheduleId ?? null);
    const pendingSchedule = await this.scheduleOf(sub?.pendingScheduleId ?? null);
    const months = mine ? settleMonths(mine.phases) : 1;
    /**
     * Direction is measured against what the resort actually pays, not against
     * the plan row's list price — and per month, so terms of different lengths
     * compare.
     *
     * A super admin can discount a subscription for one customer, and
     * `changePlan` decides immediate-and-billed vs wait-for-renewal on what is
     * being paid. Labelling the button from the price list instead would let
     * it read "Upgrade" on a move the service then schedules as a downgrade —
     * the screen and the charge disagreeing about the same click. Comparing a
     * year's fee against a month's would do the same thing, more loudly.
     */
    const currentFee = sub ? Number(sub.fee) / months : null;
    const pending = sub?.pendingPlan ? onSale.find((p) => p.name === sub.pendingPlan) : undefined;
    const shelves = new Map<string, ScheduleOnSale[]>();
    for (const p of onSale) {
      shelves.set(
        p.name,
        (await schedulesFor(this.prisma, p.id)).map((x) => ({
          id: x.id,
          label: x.label,
          phases: x.phases,
          openingFee: x.openingFee,
          perMonth: perMonthEquivalent(x.phases),
        })),
      );
    }

    return {
      plan: sub?.plan ?? null,
      planLabel: current?.label ?? sub?.plan ?? null,
      blurb: current?.blurb ?? null,
      status: sub?.status ?? "NONE",
      scheduleId: mine?.id ?? null,
      scheduleLabel: mine?.label ?? null,
      fee: sub ? Number(sub.fee) : 0,
      feePerMonth: sub ? round2(Number(sub.fee) / months) : 0,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      renewsAt: sub?.renewsAt?.toISOString() ?? null,
      pendingPlan: sub?.pendingPlan ?? null,
      pendingPlanLabel: pending?.label ?? sub?.pendingPlan ?? null,
      pendingScheduleId: pendingSchedule?.id ?? null,
      pendingScheduleLabel: pendingSchedule?.label ?? null,
      limits: { maxRooms: limits.maxRooms, maxResorts: limits.maxResorts, label: limits.label },
      usage: { rooms, resorts },
      outstanding: { amount: round2(Number(open._sum.amount ?? 0)), count: open._count },
      bills: bills.map((b) => ({
        id: b.id.toString(),
        amount: Number(b.amount),
        periodStart: b.periodStart.toISOString(),
        periodEnd: b.periodEnd.toISOString(),
        dueDate: b.dueDate.toISOString(),
        status: b.status,
        paidAt: b.paidAt?.toISOString() ?? null,
        note: b.note,
      })),
      plans: onSale
        .map((p) => {
          const schedules = shelves.get(p.name) ?? [];
          return {
            name: p.name,
            label: p.label,
            schedules,
            maxRooms: p.maxRooms,
            maxResorts: p.maxResorts,
            blurb: p.blurb,
            // both sides per month, so a customer on a long term is not told
            // that every plan on the list is a downgrade
            direction: this.direction(
              p.name,
              schedules[0]?.perMonth ?? 0,
              sub?.plan ?? null,
              currentFee,
            ),
          };
        })
        // a plan with no schedule has no price, and a card with no price is
        // not something to put in front of somebody being asked to choose
        .filter((p) => p.schedules.length > 0),
    };
  }

  private direction(
    name: string,
    fee: number,
    currentPlan: string | null,
    currentFee: number | null,
  ): PlanDirection {
    if (currentPlan == null || currentFee == null) return "available";
    if (name === currentPlan) return "current";
    return fee > currentFee ? "upgrade" : "downgrade";
  }

  // ─────────────────────────── changing ───────────────────────────

  /**
   * Move to another plan, another billing rhythm, or both at once.
   *
   * The rhythm follows exactly the rules the plan does, because it is the same
   * question wearing a different hat: paying more lands now and is billed pro
   * rata, paying less waits for the period that has already been invoiced to
   * run out. Going from monthly to yearly costs more today, so it is immediate;
   * going back to monthly would be asking for a year already paid for to be
   * refunded, so it parks in `pendingCycle` and the sweep applies it.
   */
  async changePlan(
    claims: JwtClaims,
    resortId: number,
    plan: string,
    scheduleId?: number,
  ): Promise<PlanChangeResult> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "billing.manage");

    const name = plan.trim().toUpperCase();
    const target = await this.prisma.platformPlan.findUnique({ where: { name } });
    // the resort's own screen sells from the resort shelf only
    if (!target || !target.active || target.audience !== "RESORT") {
      const onSale = await this.planLimits.onSale();
      throw badRequest(`No plan "${plan}" on sale. Available: ${onSale.map((p) => p.name).join(", ")}`);
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { accountId: await this.accountOf(resortId), status: { in: [...LIVE] } },
      orderBy: { id: "desc" },
    });
    if (!sub) {
      /**
       * No subscription, so this is the first one — start it rather than refuse.
       *
       * This used to say "the platform sets the first one up", which was true
       * of the code and true of nothing else: the owner was shown the plan
       * cards, told what each cost, and given no way to pick one. Signup opens
       * a trial now, but that does nothing for the workspaces created before
       * it did, and they are the ones stuck on this screen.
       *
       * It opens on the same terms signup would have given them — the plan's
       * own trial — because arriving late at this screen is not a reason to
       * lose the trial everybody else gets.
       */
      const first = await scheduleFor(this.prisma, target, scheduleId);
      const opened = await this.prisma.subscription.create({
        data: openingSubscription(await this.accountOf(resortId), target, first, null, new Date()),
      });
      await this.log(claims, resortId, opened.id, { action: "opened", from: null, to: name });
      return {
        plan: target.name,
        planLabel: target.label,
        scheduleId: first.id,
        scheduleLabel: first.label,
        effective: "now",
        charged: 0,
        effectiveFrom: opened.renewsAt ? opened.renewsAt.toISOString() : null,
      };
    }

    // no schedule asked for means "keep the one I am on"
    const from = await this.scheduleOf(sub.scheduleId);
    const to = await scheduleFor(this.prisma, target, scheduleId ?? sub.scheduleId);
    const sameSchedule = from != null && to.id === from.id;

    // asking for exactly what you already have either calls off a pending
    // change, or is a no-op worth saying out loud
    if (name === sub.plan && sameSchedule) {
      if (!sub.pendingPlan && !sub.pendingScheduleId) throw badRequest(`Already on ${target.label}.`);
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingPlan: null, pendingScheduleId: null },
      });
      await this.log(claims, resortId, sub.id, {
        action: "cancelled", from: sub.pendingPlan ?? sub.pendingScheduleId, to: name,
      });
      return {
        plan: name, planLabel: target.label, scheduleId: to.id, scheduleLabel: to.label,
        effective: "cancelled",
        effectiveFrom: sub.renewsAt?.toISOString() ?? null, charged: 0,
      };
    }

    await this.assertFits(resortId, target);

    const now = new Date();
    /**
     * Both sides per month, so the comparison is between like and like.
     *
     * A yearly customer's ৳25,000 against a plan's ৳5,000 would read as a
     * downgrade on every move they could make, and park all of them until the
     * renewal. What decides immediate-or-deferred is whether the account starts
     * paying more per month, which is the same question for a change of plan
     * and a change of rhythm.
     */
    const currentPerMonth = from ? perMonthEquivalent(from.phases) : Number(sub.fee);
    const targetFee = to.openingFee;
    const targetPerMonth = perMonthEquivalent(to.phases);

    /**
     * A trial has taken no money, so there is nothing to protect and nothing
     * to charge — every change inside one lands at once.
     *
     * Outside a trial the question is whether the customer would lose time
     * they have already paid for. A dearer plan takes nothing away, so it
     * lands now and is billed pro rata; a cheaper one waits for the period
     * already invoiced to run out.
     *
     * A change of term is that same question, and the per-month prices answer
     * it backwards, so it is decided by the length of the term instead. This
     * used to be written as monthly-versus-yearly, which was the only choice
     * there was; it is the same rule, said in a way that survives the owner
     * inventing a quarter or a three-year deal:
     *
     * - **A longer term lands now.** Per month it is usually cheaper, which
     *   would park it until the renewal — but the customer is asking to hand
     *   over more up front, and making them wait to do it helps nobody. It
     *   costs more today, and the unused days of the current period come off
     *   the bill.
     * - **A shorter term waits.** Per month it is usually dearer, which would
     *   land it at once — and at once means cancelling a term that has been
     *   paid for in full. Every system defers this, and so does this one.
     */
    const fromMonths = from ? settleMonths(from.phases) : 1;
    const toMonths = settleMonths(to.phases);
    const immediate =
      sub.status === "TRIAL" ||
      (toMonths > fromMonths
        ? true
        : toMonths < fromMonths
          ? false
          : targetPerMonth >= currentPerMonth);
    if (!immediate) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          ...(name === sub.plan ? {} : { pendingPlan: name }),
          ...(sameSchedule ? {} : { pendingScheduleId: to.id }),
        },
      });
      await this.log(claims, resortId, sub.id, {
        action: "scheduled", from: { plan: sub.plan, scheduleId: sub.scheduleId },
        to: { plan: name, scheduleId: to.id }, at: sub.renewsAt,
      });
      return {
        plan: name, planLabel: target.label, scheduleId: to.id, scheduleLabel: to.label,
        effective: "renewal",
        effectiveFrom: sub.renewsAt?.toISOString() ?? null, charged: 0,
      };
    }

    /**
     * A change of *term*, not a change of schedule row.
     *
     * Moving from Starter Monthly to Growth Monthly lands on a different
     * schedule — every plan has its own — but the customer's rhythm has not
     * changed, so the period they have already paid for still runs and only
     * the difference is charged. Reading "different row" as "new term" would
     * have restarted the period on every plan change and billed a full month
     * for an upgrade eleven days in.
     */
    const termChanged = toMonths !== fromMonths;
    /**
     * A change of plan is not a renewal, so `renewsAt` stays where it is. A
     * change of term *is* one: the customer has just bought a year, and the
     * year starts now. Inside a trial neither happens — nothing has been paid,
     * and the renewal is still the day the trial ends.
     */
    const bottom = to.phases[0]!;
    let charged = 0;
    let newRenewsAt: Date | null = null;
    if (sub.status !== "TRIAL") {
      if (termChanged) {
        charged = await this.startTerm(sub, fromMonths, to, now);
        newRenewsAt = addPeriod(now, bottom.count, bottom.unit);
      } else {
        charged = await this.chargeDifference(sub, targetFee - Number(sub.fee), now);
      }
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: name,
        fee: targetFee as never,
        scheduleId: to.id,
        pendingPlan: null,
        pendingScheduleId: null,
        // a new term starts at the bottom of the new ladder, anchored on the
        // day it starts; staying on the same schedule keeps the rung
        ...(termChanged
          ? { phaseSeq: bottom.seq, phaseDone: 0, phaseStartedAt: newRenewsAt ? now : sub.renewsAt }
          : {}),
        ...(newRenewsAt ? { renewsAt: newRenewsAt } : {}),
      },
    });
    await this.log(claims, resortId, sub.id, {
      action: "upgraded",
      from: { plan: sub.plan, scheduleId: sub.scheduleId },
      to: { plan: name, scheduleId: to.id },
      charged,
    });

    return {
      plan: name, planLabel: target.label, scheduleId: to.id, scheduleLabel: to.label,
      effective: "now", effectiveFrom: now.toISOString(), charged,
    };
  }

  /** The ladder a subscription is standing on, or null if it has none yet. */
  private async scheduleOf(scheduleId: number | null): Promise<ResolvedSchedule | null> {
    if (scheduleId == null) return null;
    const row = await this.prisma.planSchedule.findUnique({
      where: { id: scheduleId },
      include: { phases: { orderBy: { seq: "asc" } } },
    });
    if (!row || row.phases.length === 0) return null;
    const phases = toPhases(row.phases);
    return { id: row.id, label: row.label, phases, openingFee: phases[0]!.price };
  }

  /**
   * Starting a fresh term on the other rhythm, and billing it.
   *
   * The customer moving to a longer term is buying one that begins today, so
   * its fee falls due today — less whatever is left of the period they have
   * already paid for. Without that credit they would pay twice for the days
   * between now and their old renewal date, which is the complaint every
   * billing system's proration exists to prevent.
   */
  private async startTerm(
    sub: { id: bigint; accountId: number; renewsAt: Date | null; fee: unknown },
    fromMonths: number,
    to: ResolvedSchedule,
    now: Date,
  ): Promise<number> {
    const termFee = to.openingFee;
    const bottom = to.phases[0]!;
    const renewsAt = sub.renewsAt;
    let credit = 0;
    if (renewsAt && renewsAt > now) {
      const periodStart = addPeriod(renewsAt, -fromMonths, "MONTH");
      const total = renewsAt.getTime() - periodStart.getTime();
      const remaining = renewsAt.getTime() - now.getTime();
      const share = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
      credit = round2(Number(sub.fee) * share);
    }
    const amount = round2(termFee - credit);
    if (amount <= 0) return 0;

    const termEnd = addPeriod(now, bottom.count, bottom.unit);
    try {
      await this.prisma.subscriptionDue.create({
        data: {
          subscriptionId: sub.id,
          accountId: sub.accountId,
          amount: amount as never,
          periodStart: now,
          periodEnd: termEnd,
          dueDate: now,
          note:
            credit > 0
              ? `Switched to ${to.label} billing — ${credit.toFixed(2)} credited from the term already paid for`
              : `Switched to ${to.label} billing`,
        },
      });
    } catch (e) {
      // P2002 on (subscriptionId, periodStart): the same click arriving twice
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
    return amount;
  }

  /**
   * The pro-rata bill for the rest of the current period.
   *
   * The period is the month ending at `renewsAt`; the share is the days still
   * to run. Charging the full new fee would bill the month twice; charging
   * nothing would give the dearer plan away until the renewal.
   */
  private async chargeDifference(
    sub: { id: bigint; accountId: number; renewsAt: Date | null },
    feeDifference: number,
    now: Date,
  ): Promise<number> {
    const renewsAt = sub.renewsAt;
    // no renewal date, or one already past: the sweep is about to bill the
    // whole period at the new price anyway, so there is nothing to top up
    if (!renewsAt || renewsAt <= now) return 0;

    const periodStart = addPeriod(renewsAt, -1, "MONTH");
    const total = renewsAt.getTime() - periodStart.getTime();
    const remaining = renewsAt.getTime() - now.getTime();
    const share = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
    const amount = round2(feeDifference * share);
    if (amount <= 0) return 0;

    try {
      await this.prisma.subscriptionDue.create({
        data: {
          subscriptionId: sub.id,
          accountId: sub.accountId,
          amount: amount as never,
          periodStart: now,
          periodEnd: renewsAt,
          dueDate: now,
          note: `Plan upgrade — ${Math.round(share * 100)}% of the month remaining`,
        },
      });
    } catch (e) {
      // P2002 on (subscriptionId, periodStart): the same upgrade arriving
      // twice in one millisecond. One charge is the right answer.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
    return amount;
  }

  /** A plan the resort has already outgrown is not a plan it can move to. */
  private async assertFits(
    resortId: number,
    target: { label: string; maxRooms: number; maxResorts: number },
  ): Promise<void> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { tenantId: true },
    });
    const [rooms, resorts] = await Promise.all([
      this.prisma.room.count({ where: { resortId, deletedAt: null } }),
      resort ? this.prisma.resort.count({ where: { tenantId: resort.tenantId } }) : Promise.resolve(1),
    ]);
    if (rooms > target.maxRooms) {
      throw badRequest(
        `${target.label} allows ${target.maxRooms} rooms and this resort has ${rooms}. Remove rooms first, or stay on your plan.`,
      );
    }
    if (resorts > target.maxResorts) {
      throw badRequest(
        `${target.label} allows ${target.maxResorts} resort(s) and you have ${resorts}.`,
      );
    }
  }

  /** The account a resort belongs to — the subscriber its bills are raised against. */
  private async accountOf(resortId: number): Promise<number> {
    const resort = await this.prisma.resort.findUnique({ where: { id: resortId }, select: { tenantId: true } });
    if (!resort) throw badRequest("resort not found");
    return resort.tenantId;
  }

  private log(
    claims: JwtClaims,
    resortId: number,
    subscriptionId: bigint,
    diff: Record<string, unknown>,
  ) {
    return this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "subscription.plan.change",
      entity: "subscription",
      entityId: Number(subscriptionId),
      diff,
    });
  }
}
