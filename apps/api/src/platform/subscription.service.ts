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
import {
  cycleNoun,
  feeFor,
  isBillingCycle,
  monthsIn,
  soldYearly,
  yearlySaving,
  type BillingCycle,
} from "../common/billing-cycle";

const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE"] as const;
const OPEN = ["DUE", "OVERDUE"] as const;
/** How much history the owner's screen carries. Two years of monthly bills. */
const BILL_HISTORY = 24;

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/** Which way a plan sits relative to the one the resort is on. */
export type PlanDirection = "current" | "upgrade" | "downgrade" | "available";

export interface PlanOnSale {
  name: string;
  label: string;
  monthlyFee: number;
  /** null when this plan is not sold by the year at all. */
  yearlyFee: number | null;
  /** What taking the year saves, for the badge the card wears. */
  yearlySaving: { pct: number; monthsFree: number; amount: number } | null;
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
  /** MONTHLY | YEARLY — what one period is, and therefore what `fee` covers. */
  billingCycle: BillingCycle;
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
  /** A move back to monthly billing, landing at `renewsAt`. */
  pendingCycle: BillingCycle | null;
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
  /** The rhythm the account is on, or moving to. */
  billingCycle: BillingCycle;
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
    const cycle: BillingCycle =
      sub && isBillingCycle(sub.billingCycle) ? sub.billingCycle : "MONTHLY";
    /**
     * Direction is measured against what the resort actually pays, not against
     * the plan row's list price — and per month, so the two rhythms compare.
     *
     * A super admin can discount a subscription for one customer, and
     * `changePlan` decides immediate-and-billed vs wait-for-renewal on what is
     * being paid. Labelling the button from the price list instead would let
     * it read "Upgrade" on a move the service then schedules as a downgrade —
     * the screen and the charge disagreeing about the same click. Comparing a
     * year's fee against a month's would do the same thing, more loudly.
     */
    const currentFee = sub ? Number(sub.fee) / monthsIn(cycle) : null;
    const pending = sub?.pendingPlan ? onSale.find((p) => p.name === sub.pendingPlan) : undefined;

    return {
      plan: sub?.plan ?? null,
      planLabel: current?.label ?? sub?.plan ?? null,
      blurb: current?.blurb ?? null,
      status: sub?.status ?? "NONE",
      billingCycle: cycle,
      fee: sub ? Number(sub.fee) : 0,
      feePerMonth: sub ? round2(Number(sub.fee) / monthsIn(cycle)) : 0,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      renewsAt: sub?.renewsAt?.toISOString() ?? null,
      pendingPlan: sub?.pendingPlan ?? null,
      pendingPlanLabel: pending?.label ?? sub?.pendingPlan ?? null,
      pendingCycle: isBillingCycle(sub?.pendingCycle) ? sub.pendingCycle : null,
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
      plans: onSale.map((p) => ({
        name: p.name,
        label: p.label,
        monthlyFee: Number(p.monthlyFee),
        yearlyFee: soldYearly(p) ? Number(p.yearlyFee) : null,
        yearlySaving: yearlySaving(p),
        maxRooms: p.maxRooms,
        maxResorts: p.maxResorts,
        blurb: p.blurb,
        // both sides per month, so a yearly customer is not told that every
        // plan on the list is a downgrade
        direction: this.direction(p.name, Number(p.monthlyFee), sub?.plan ?? null, currentFee),
      })),
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
    billingCycle?: string,
  ): Promise<PlanChangeResult> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "billing.manage");

    const name = plan.trim().toUpperCase();
    if (billingCycle != null && !isBillingCycle(billingCycle)) {
      throw badRequest("A subscription is billed MONTHLY or YEARLY");
    }
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
      const opened = await this.prisma.subscription.create({
        data: openingSubscription(
          await this.accountOf(resortId),
          target,
          null,
          new Date(),
          (billingCycle as BillingCycle | undefined) ?? "MONTHLY",
        ),
      });
      await this.log(claims, resortId, opened.id, { action: "opened", from: null, to: name });
      return {
        plan: target.name,
        planLabel: target.label,
        billingCycle: (billingCycle as BillingCycle | undefined) ?? "MONTHLY",
        effective: "now",
        charged: 0,
        effectiveFrom: opened.renewsAt ? opened.renewsAt.toISOString() : null,
      };
    }

    const fromCycle: BillingCycle = isBillingCycle(sub.billingCycle) ? sub.billingCycle : "MONTHLY";
    // no rhythm asked for means "keep the one I am on"
    const toCycle: BillingCycle = (billingCycle as BillingCycle | undefined) ?? fromCycle;
    if (toCycle === "YEARLY" && !soldYearly(target)) {
      throw badRequest(`${target.label} is not sold by the year.`);
    }

    // asking for exactly what you already have either calls off a pending
    // change, or is a no-op worth saying out loud
    if (name === sub.plan && toCycle === fromCycle) {
      if (!sub.pendingPlan && !sub.pendingCycle) throw badRequest(`Already on ${target.label}.`);
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingPlan: null, pendingCycle: null },
      });
      await this.log(claims, resortId, sub.id, {
        action: "cancelled", from: sub.pendingPlan ?? sub.pendingCycle, to: name,
      });
      return {
        plan: name, planLabel: target.label, billingCycle: toCycle, effective: "cancelled",
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
    const currentPerMonth = Number(sub.fee) / monthsIn(fromCycle);
    const targetFee = feeFor(target, toCycle);
    const targetPerMonth = targetFee / monthsIn(toCycle);

    /**
     * A trial has taken no money, so there is nothing to protect and nothing
     * to charge — every change inside one lands at once.
     *
     * Outside a trial the question is whether the customer would lose time
     * they have already paid for. A dearer plan takes nothing away, so it
     * lands now and is billed pro rata; a cheaper one waits for the period
     * already invoiced to run out.
     *
     * A change of rhythm is that same question, and the per-month prices
     * answer it backwards, so it is decided by direction instead:
     *
     * - **Monthly → yearly lands now.** Per month it is cheaper, which would
     *   park it until the renewal — but the customer is asking to hand over a
     *   year up front, and making them wait a month to do it helps nobody. It
     *   costs more today, and the unused days of the month come off the bill.
     * - **Yearly → monthly waits.** Per month it is dearer, which would land
     *   it at once — and at once means cancelling a year that has been paid
     *   for in full. Every system defers this, and so does this one.
     */
    const goingYearly = toCycle === "YEARLY" && fromCycle === "MONTHLY";
    const goingMonthly = toCycle === "MONTHLY" && fromCycle === "YEARLY";
    const immediate =
      sub.status === "TRIAL" ||
      (goingYearly ? true : goingMonthly ? false : targetPerMonth >= currentPerMonth);
    if (!immediate) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          ...(name === sub.plan ? {} : { pendingPlan: name }),
          ...(toCycle === fromCycle ? {} : { pendingCycle: toCycle }),
        },
      });
      await this.log(claims, resortId, sub.id, {
        action: "scheduled", from: { plan: sub.plan, cycle: fromCycle },
        to: { plan: name, cycle: toCycle }, at: sub.renewsAt,
      });
      return {
        plan: name, planLabel: target.label, billingCycle: toCycle, effective: "renewal",
        effectiveFrom: sub.renewsAt?.toISOString() ?? null, charged: 0,
      };
    }

    const cycleChanged = toCycle !== fromCycle;
    /**
     * A change of plan is not a renewal, so `renewsAt` stays where it is. A
     * change of rhythm *is* one: the customer has just bought a year, and the
     * year starts now. Inside a trial neither happens — nothing has been paid,
     * and the renewal is still the day the trial ends.
     */
    let charged = 0;
    let newRenewsAt: Date | null = null;
    if (sub.status !== "TRIAL") {
      if (cycleChanged) {
        charged = await this.startTerm(sub, fromCycle, toCycle, targetFee, now);
        newRenewsAt = addMonths(now, monthsIn(toCycle));
      } else {
        charged = await this.chargeDifference(sub, targetFee - Number(sub.fee), now);
      }
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: name,
        fee: targetFee as never,
        billingCycle: toCycle,
        pendingPlan: null,
        pendingCycle: null,
        ...(newRenewsAt ? { renewsAt: newRenewsAt } : {}),
      },
    });
    await this.log(claims, resortId, sub.id, {
      action: "upgraded",
      from: { plan: sub.plan, cycle: fromCycle },
      to: { plan: name, cycle: toCycle },
      charged,
    });

    return {
      plan: name, planLabel: target.label, billingCycle: toCycle, effective: "now",
      effectiveFrom: now.toISOString(), charged,
    };
  }

  /**
   * Starting a fresh term on the other rhythm, and billing it.
   *
   * The customer moving to yearly is buying a year that begins today, so the
   * year's fee falls due today — less whatever is left of the period they have
   * already paid for. Without that credit they would pay twice for the days
   * between now and their old renewal date, which is the complaint every
   * billing system's proration exists to prevent.
   */
  private async startTerm(
    sub: { id: bigint; accountId: number; renewsAt: Date | null; fee: unknown },
    fromCycle: BillingCycle,
    toCycle: BillingCycle,
    termFee: number,
    now: Date,
  ): Promise<number> {
    const renewsAt = sub.renewsAt;
    let credit = 0;
    if (renewsAt && renewsAt > now) {
      const periodStart = addMonths(renewsAt, -monthsIn(fromCycle));
      const total = renewsAt.getTime() - periodStart.getTime();
      const remaining = renewsAt.getTime() - now.getTime();
      const share = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
      credit = round2(Number(sub.fee) * share);
    }
    const amount = round2(termFee - credit);
    if (amount <= 0) return 0;

    const termEnd = addMonths(now, monthsIn(toCycle));
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
              ? `Switched to ${cycleNoun(toCycle)}ly billing — ${credit.toFixed(2)} credited from the ${cycleNoun(fromCycle)} already paid for`
              : `Switched to ${cycleNoun(toCycle)}ly billing`,
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

    const periodStart = addMonths(renewsAt, -1);
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
