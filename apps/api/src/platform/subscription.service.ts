/**
 * The owner's own subscription — read it, and change it.
 *
 * Everything about a resort's subscription used to live on the super admin's
 * side of the wall. The owner's Settings screen had a "Change plan" row, but
 * it called `PATCH /tenants/:id/plan`, which is `requireRoles(SUPER_ADMIN)`:
 * the person whose subscription it was got a 403 from every button. And the
 * field that endpoint writes, `Tenant.plan`, is not the one the billing sweep
 * reads — so even for a super admin it changed a label while the fee, the
 * renewal date and the status stayed where they were.
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
  monthlyFee: number;
  startedAt: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  /** A downgrade already asked for, landing at `renewsAt`. */
  pendingPlan: string | null;
  pendingPlanLabel: string | null;
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

    const [sub, onSale, limits, resort] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { resortId, status: { in: [...LIVE] } },
        orderBy: { id: "desc" },
      }),
      this.planLimits.onSale(),
      this.planLimits.forResort(resortId),
      this.prisma.resort.findUnique({ where: { id: resortId }, select: { tenantId: true } }),
    ]);

    const [rooms, resorts, bills, open] = await Promise.all([
      this.prisma.room.count({ where: { resortId } }),
      resort ? this.prisma.resort.count({ where: { tenantId: resort.tenantId } }) : Promise.resolve(1),
      // by resort, not by subscription: a subscription the super admin
      // cancelled and replaced still billed this resort, and its invoices are
      // the owner's to read
      this.prisma.subscriptionDue.findMany({
        where: { resortId },
        orderBy: { periodStart: "desc" },
        take: BILL_HISTORY,
      }),
      this.prisma.subscriptionDue.aggregate({
        where: { resortId, status: { in: [...OPEN] } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const current = sub ? onSale.find((p) => p.name === sub.plan) : undefined;
    // the plan row's price decides direction, not the subscription's own fee,
    // which a super admin may have discounted for this one customer
    const currentFee = current ? Number(current.monthlyFee) : sub ? Number(sub.monthlyFee) : null;
    const pending = sub?.pendingPlan ? onSale.find((p) => p.name === sub.pendingPlan) : undefined;

    return {
      plan: sub?.plan ?? null,
      planLabel: current?.label ?? sub?.plan ?? null,
      blurb: current?.blurb ?? null,
      status: sub?.status ?? "NONE",
      monthlyFee: sub ? Number(sub.monthlyFee) : 0,
      startedAt: sub?.startedAt?.toISOString() ?? null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      renewsAt: sub?.renewsAt?.toISOString() ?? null,
      pendingPlan: sub?.pendingPlan ?? null,
      pendingPlanLabel: pending?.label ?? sub?.pendingPlan ?? null,
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
        maxRooms: p.maxRooms,
        maxResorts: p.maxResorts,
        blurb: p.blurb,
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

  async changePlan(claims: JwtClaims, resortId: number, plan: string): Promise<PlanChangeResult> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "billing.manage");

    const name = plan.trim().toUpperCase();
    const target = await this.prisma.platformPlan.findUnique({ where: { name } });
    if (!target || !target.active) {
      const onSale = await this.planLimits.onSale();
      throw badRequest(`No plan "${plan}" on sale. Available: ${onSale.map((p) => p.name).join(", ")}`);
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { resortId, status: { in: [...LIVE] } },
      orderBy: { id: "desc" },
    });
    if (!sub) {
      throw badRequest("This resort has no subscription yet — the platform sets the first one up.");
    }

    // asking for the plan you are already on either calls off a pending
    // downgrade, or is a no-op worth saying out loud
    if (name === sub.plan) {
      if (!sub.pendingPlan) throw badRequest(`Already on ${target.label}.`);
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlan: null } });
      await this.log(claims, resortId, sub.id, { action: "cancelled", from: sub.pendingPlan, to: name });
      return {
        plan: name, planLabel: target.label, effective: "cancelled",
        effectiveFrom: sub.renewsAt?.toISOString() ?? null, charged: 0,
      };
    }

    await this.assertFits(resortId, target);

    const now = new Date();
    const currentFee = Number(sub.monthlyFee);
    const targetFee = Number(target.monthlyFee);

    /**
     * A trial has taken no money, so there is nothing to protect and nothing
     * to charge — every change inside one lands at once. Outside a trial, only
     * a move that costs the same or more can: a cheaper plan has to wait for
     * the month already invoiced to run out.
     */
    const immediate = sub.status === "TRIAL" || targetFee >= currentFee;
    if (!immediate) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlan: name } });
      await this.log(claims, resortId, sub.id, { action: "scheduled", from: sub.plan, to: name, at: sub.renewsAt });
      return {
        plan: name, planLabel: target.label, effective: "renewal",
        effectiveFrom: sub.renewsAt?.toISOString() ?? null, charged: 0,
      };
    }

    const charged = sub.status === "TRIAL" ? 0 : await this.chargeDifference(sub, targetFee - currentFee, now);
    await this.prisma.subscription.update({
      where: { id: sub.id },
      // renewsAt is deliberately absent: a plan change is not a renewal
      data: { plan: name, monthlyFee: targetFee as never, pendingPlan: null },
    });
    await this.log(claims, resortId, sub.id, { action: "upgraded", from: sub.plan, to: name, charged });

    return {
      plan: name, planLabel: target.label, effective: "now",
      effectiveFrom: now.toISOString(), charged,
    };
  }

  /**
   * The pro-rata bill for the rest of the current period.
   *
   * The period is the month ending at `renewsAt`; the share is the days still
   * to run. Charging the full new fee would bill the month twice; charging
   * nothing would give the dearer plan away until the renewal.
   */
  private async chargeDifference(
    sub: { id: bigint; resortId: number; renewsAt: Date | null },
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
          resortId: sub.resortId,
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
      this.prisma.room.count({ where: { resortId } }),
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
