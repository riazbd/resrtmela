/**
 * The subscription lifecycle — the thing that notices.
 *
 * P0 built the machinery to suspend a tenant; nothing ever turned it on. A
 * trial never ended, a renewal never raised a bill, and PAST_DUE was a status
 * no code path could reach. A tenant who stopped paying kept the full product,
 * because the platform had no clock.
 *
 * This is that clock. One sweep walks every subscription:
 *
 *   TRIAL   --(trial ended)-->   ACTIVE + first bill
 *   ACTIVE  --(renewal date)-->  ACTIVE + next bill
 *   bill    --(+grace)------->   OVERDUE, subscription PAST_DUE
 *   bill    --(+deadline)---->   resort suspended
 *   paid    ----------------->   resort back, subscription ACTIVE
 *
 * Three properties matter more than the transitions:
 *
 * 1. It is idempotent. Running it hourly, or twice, or after a week of
 *    downtime, produces the same bills — guaranteed underneath by the UNIQUE
 *    index on (subscriptionId, periodStart), not by application care.
 * 2. It catches up. Every step is "is this date in the past", never "did this
 *    happen yesterday", so a platform that was down for a week lands in the
 *    right state on its first sweep instead of advancing one step per day.
 * 3. It never suspends silently. Notice before the trial ends, an invoice when
 *    the bill is raised, a warning before suspension, and a message when it
 *    lands. Suspension without warning is how a platform loses a customer it
 *    could have kept.
 *
 * Every window is a platform setting, so changing a commercial term is an edit
 * by the person who owns the term, not a deploy.
 */
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PlatformSettingsService } from "../common/platform-settings.service";
import { AuditService } from "../common/audit.service";
import { SYSTEM_ACTOR_ID } from "../common/rbac";
import { reachableEmail, reachablePhone } from "../common/contact";
import type { TemplateName } from "../notifications/templates";

export interface BillingSweepResult {
  trialsEnded: number;
  duesRaised: number;
  duesOverdue: number;
  suspended: number;
  resumed: number;
  notices: number;
}

/** Suspensions the sweep is allowed to lift. Anything else was a human's decision. */
export const BILLING_SUSPENSION = "billing";

const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

/**
 * Hourly, not daily. The sweep is idempotent and every step asks "is this date
 * past", so running it often costs nothing and means a policy change or a
 * payment takes effect within the hour rather than overnight.
 */
const SWEEP_MS = 3_600_000;
/** A restart is the most likely moment for a missed sweep, so run one shortly after boot. */
const FIRST_SWEEP_MS = 60_000;

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.first = setTimeout(() => void this.safeSweep(), FIRST_SWEEP_MS);
    this.timer = setInterval(() => void this.safeSweep(), SWEEP_MS);
    this.first.unref?.();
    this.timer.unref?.();
    this.logger.log("subscription lifecycle sweep running (hourly)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.first) clearTimeout(this.first);
  }

  /** A billing error must never become an unhandled rejection and kill the API. */
  private async safeSweep(): Promise<void> {
    try {
      const r = await this.sweep();
      const touched = r.trialsEnded + r.duesRaised + r.duesOverdue + r.suspended + r.resumed;
      if (touched > 0) this.logger.log(`billing sweep: ${JSON.stringify(r)}`);
    } catch (e) {
      this.logger.error(`billing sweep failed: ${String(e).slice(0, 300)}`);
    }
  }

  /**
   * One pass over every subscription. `now` is a parameter so the whole
   * lifecycle is testable without waiting a month, and so a catch-up run after
   * downtime can be reasoned about.
   */
  async sweep(now: Date = new Date()): Promise<BillingSweepResult> {
    const policy = await this.settings.billingPolicy();
    const result: BillingSweepResult = {
      trialsEnded: 0, duesRaised: 0, duesOverdue: 0, suspended: 0, resumed: 0, notices: 0,
    };

    await this.warnEndingTrials(now, policy.noticeDays, result);
    await this.endTrials(now, result);
    await this.raiseRenewals(now, result);
    await this.markOverdue(now, policy.graceDays, result);
    await this.warnSuspensions(now, policy, result);
    await this.suspendUnpaid(now, policy.suspendAfterDays, result);
    await this.resumeSettled(result);

    return result;
  }

  // ─────────────────────────── trials ───────────────────────────

  /** A trial that ends without warning reads as a trap. */
  private async warnEndingTrials(now: Date, noticeDays: number, result: BillingSweepResult) {
    const soon = await this.prisma.subscription.findMany({
      where: { status: "TRIAL", trialEndsAt: { gt: now, lte: addDays(now, noticeDays) } },
      include: { resort: { select: { id: true, name: true } } },
    });
    for (const sub of soon) {
      const sent = await this.notify(sub.resortId, "subscription_trial_ending", {
        resort: sub.resort.name,
        plan: sub.plan,
        date: isoDay(sub.trialEndsAt!),
        days: Math.max(0, daysBetween(now, sub.trialEndsAt!)),
        amount: Number(sub.monthlyFee),
      }, `sub:${sub.id}`);
      result.notices += sent;
    }
  }

  private async endTrials(now: Date, result: BillingSweepResult) {
    const ended = await this.prisma.subscription.findMany({
      where: { status: "TRIAL", trialEndsAt: { lte: now } },
      include: { resort: { select: { id: true, name: true } } },
    });
    for (const sub of ended) {
      await this.applyPendingPlan(sub);
      // the first period starts when the trial ended, not today: a sweep that
      // ran late must not hand the tenant free days it did not sell
      const periodStart = sub.trialEndsAt!;
      const raised = await this.raiseDue(sub, periodStart, sub.resort.name);
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "ACTIVE", renewsAt: addMonths(periodStart, 1) },
      });
      result.trialsEnded++;
      if (raised) result.duesRaised++;
    }
  }

  // ─────────────────────────── invoicing ───────────────────────────

  private async raiseRenewals(now: Date, result: BillingSweepResult) {
    // CANCELLED is deliberately excluded: a tenant who left is not billed
    // again. PAST_DUE is included — falling behind on one month does not stop
    // the next month accruing, or the debt would silently stop growing.
    const dueNow = await this.prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, renewsAt: { lte: now } },
      include: { resort: { select: { id: true, name: true } } },
    });
    for (const sub of dueNow) {
      // a downgrade the owner asked for lands here, at the period boundary,
      // so the first bill of the new period is already the new price
      await this.applyPendingPlan(sub);
      let periodStart = sub.renewsAt!;
      let renewsAt = addMonths(periodStart, 1);
      // catch up month by month if the sweep has not run for a long time
      let guard = 0;
      while (guard++ < 24) {
        if (await this.raiseDue(sub, periodStart, sub.resort.name)) result.duesRaised++;
        if (renewsAt > now) break;
        periodStart = renewsAt;
        renewsAt = addMonths(periodStart, 1);
      }
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { renewsAt } });
    }
  }

  /**
   * Applies a plan change that was waiting for the renewal.
   *
   * An upgrade is immediate and billed pro rata by `SubscriptionService`; a
   * downgrade is not, because the month the resort is in has already been
   * invoiced. `pendingPlan` holds it until this moment. The row is mutated in
   * place as well as in the database so the bill raised straight after this
   * carries the new fee.
   */
  private async applyPendingPlan(sub: {
    id: bigint;
    resortId: number;
    plan: string;
    monthlyFee: unknown;
    pendingPlan: string | null;
  }): Promise<void> {
    if (!sub.pendingPlan) return;
    const target = await this.prisma.platformPlan.findUnique({ where: { name: sub.pendingPlan } });
    if (!target) {
      // the plan was deleted between the request and the renewal; keep the
      // subscription where it is rather than move it somewhere nobody chose
      this.logger.warn(`subscription ${sub.id}: pending plan ${sub.pendingPlan} no longer exists — kept on ${sub.plan}`);
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlan: null } });
      sub.pendingPlan = null;
      return;
    }
    const from = sub.plan;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: target.name, monthlyFee: target.monthlyFee, pendingPlan: null },
    });
    sub.plan = target.name;
    sub.monthlyFee = target.monthlyFee;
    sub.pendingPlan = null;
    await this.audit.log({
      actorId: SYSTEM_ACTOR_ID,
      resortId: sub.resortId,
      action: "billing.plan.applied",
      entity: "subscription",
      entityId: Number(sub.id),
      diff: { from, to: target.name, monthlyFee: Number(target.monthlyFee) },
    });
  }

  /** Creates the bill for one period. Returns false when it already existed. */
  private async raiseDue(
    sub: { id: bigint; resortId: number; monthlyFee: unknown; plan: string },
    periodStart: Date,
    resortName: string,
  ): Promise<boolean> {
    const periodEnd = addMonths(periodStart, 1);
    const amount = Number(sub.monthlyFee);
    try {
      const due = await this.prisma.subscriptionDue.create({
        data: {
          subscriptionId: sub.id,
          resortId: sub.resortId,
          amount,
          periodStart,
          periodEnd,
          // payable from the day the period starts; lateness is measured from here
          dueDate: periodStart,
        },
      });
      await this.notify(sub.resortId, "subscription_invoice", {
        resort: resortName,
        plan: sub.plan,
        amount,
        date: isoDay(periodStart),
        periodEnd: isoDay(periodEnd),
      }, `due:${due.id}`);
      await this.audit.log({
        actorId: SYSTEM_ACTOR_ID,
        resortId: sub.resortId,
        action: "billing.due.raised",
        entity: "subscription_due",
        entityId: Number(due.id),
        diff: { amount, periodStart: isoDay(periodStart) },
      });
      return true;
    } catch (e) {
      // P2002: this period is already billed. That is the sweep being safe to
      // re-run, not an error.
      if ((e as { code?: string }).code === "P2002") return false;
      throw e;
    }
  }

  // ─────────────────────────── falling behind ───────────────────────────

  private async markOverdue(now: Date, graceDays: number, result: BillingSweepResult) {
    const late = await this.prisma.subscriptionDue.findMany({
      where: { status: "DUE", dueDate: { lt: addDays(now, -graceDays) } },
      include: { resort: { select: { name: true } } },
    });
    for (const due of late) {
      await this.prisma.subscriptionDue.update({ where: { id: due.id }, data: { status: "OVERDUE" } });
      await this.prisma.subscription.updateMany({
        where: { id: due.subscriptionId, status: { in: ["ACTIVE", "TRIAL"] } },
        data: { status: "PAST_DUE" },
      });
      await this.notify(due.resortId, "subscription_overdue", {
        resort: due.resort.name,
        amount: Number(due.amount),
        date: isoDay(due.dueDate),
      }, `due:${due.id}`);
      result.duesOverdue++;
    }
  }

  private async warnSuspensions(
    now: Date,
    policy: { suspendAfterDays: number; noticeDays: number },
    result: BillingSweepResult,
  ) {
    const window = await this.prisma.subscriptionDue.findMany({
      where: {
        status: { in: ["DUE", "OVERDUE"] },
        dueDate: {
          // inside the notice window, but not yet at the deadline
          gt: addDays(now, -policy.suspendAfterDays),
          lte: addDays(now, -(policy.suspendAfterDays - policy.noticeDays)),
        },
        resort: { status: "active" },
      },
      include: { resort: { select: { name: true } } },
    });
    for (const due of window) {
      const deadline = addDays(due.dueDate, policy.suspendAfterDays);
      result.notices += await this.notify(due.resortId, "subscription_suspending", {
        resort: due.resort.name,
        amount: Number(due.amount),
        date: isoDay(deadline),
        days: Math.max(0, daysBetween(now, deadline)),
      }, `due:${due.id}`);
    }
  }

  private async suspendUnpaid(now: Date, suspendAfterDays: number, result: BillingSweepResult) {
    const unpaid = await this.prisma.subscriptionDue.findMany({
      where: {
        status: { in: ["DUE", "OVERDUE"] },
        dueDate: { lte: addDays(now, -suspendAfterDays) },
        resort: { status: "active" },
      },
      include: { resort: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    });
    const seen = new Set<number>();
    for (const due of unpaid) {
      if (seen.has(due.resortId)) continue;
      seen.add(due.resortId);
      await this.prisma.resort.update({
        where: { id: due.resortId },
        data: { status: "suspended", suspendedReason: BILLING_SUSPENSION, suspendedAt: now },
      });
      await this.notify(due.resortId, "subscription_suspended", {
        resort: due.resort.name,
        amount: Number(due.amount),
        date: isoDay(due.dueDate),
      }, `due:${due.id}`);
      await this.audit.log({
        actorId: SYSTEM_ACTOR_ID,
        resortId: due.resortId,
        action: "billing.resort.suspended",
        entity: "resort",
        entityId: due.resortId,
        diff: { dueId: Number(due.id), dueDate: isoDay(due.dueDate) },
      });
      result.suspended++;
      this.logger.warn(`suspended resort ${due.resortId} (${due.resort.name}): unpaid since ${isoDay(due.dueDate)}`);
    }
  }

  // ─────────────────────────── coming back ───────────────────────────

  /**
   * Settling the bill must restore service without anyone being asked. Only
   * suspensions this service imposed are lifted — a resort suspended by a
   * human for fraud stays suspended however much it pays.
   */
  private async resumeSettled(result: BillingSweepResult) {
    const suspended = await this.prisma.resort.findMany({
      where: { status: { not: "active" }, suspendedReason: BILLING_SUSPENSION },
      select: { id: true, name: true },
    });
    for (const resort of suspended) {
      const open = await this.prisma.subscriptionDue.count({
        where: { resortId: resort.id, status: { in: ["DUE", "OVERDUE"] } },
      });
      if (open > 0) continue;
      await this.reactivate(resort.id, resort.name);
      result.resumed++;
    }
  }

  /**
   * Called by the sweep and directly by the super admin's "mark paid" action,
   * so a tenant who pays is back inside a second rather than at the next sweep.
   */
  async reactivate(resortId: number, resortName?: string): Promise<boolean> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { status: true, name: true, suspendedReason: true },
    });
    if (!resort || resort.status === "active") return false;
    if (resort.suspendedReason !== BILLING_SUSPENSION) return false;
    await this.prisma.resort.update({
      where: { id: resortId },
      data: { status: "active", suspendedReason: null, suspendedAt: null },
    });
    await this.notify(resortId, "subscription_resumed", { resort: resortName ?? resort.name }, `resort:${resortId}:${Date.now()}`);
    await this.audit.log({
      actorId: SYSTEM_ACTOR_ID,
      resortId,
      action: "billing.resort.resumed",
      entity: "resort",
      entityId: resortId,
    });
    return true;
  }

  // ─────────────────────────── telling them ───────────────────────────

  /**
   * These messages are the platform speaking to its customer about their
   * account, so unlike guest-facing mail they are deliberately not tenant
   * editable — a tenant should not be able to rewrite their own suspension
   * notice. The platform's own name in them comes from settings, not source.
   */
  private async notify(
    resortId: number,
    template: TemplateName,
    data: Record<string, string | number | null | undefined>,
    ref: string,
  ): Promise<number> {
    const recipients = await this.billingContacts(resortId);
    if (recipients.length === 0) return 0;
    const platform = await this.settings.str("platform.name", "Resort Mela");
    let queued = 0;
    for (const to of recipients) {
      const r = await this.notifications.enqueueJob({
        channel: to.includes("@") ? "EMAIL" : "SMS",
        to,
        template,
        data: { ...data, platform },
        dedupeKey: `${template}:${ref}:${to}`,
      });
      if (r.queued) queued++;
    }
    return queued;
  }

  /** Whoever owns the account: the resort's admins, else its managers. */
  private async billingContacts(resortId: number): Promise<string[]> {
    const links = await this.prisma.userResort.findMany({
      where: { resortId, user: { role: { in: ["RESORT_ADMIN", "MANAGER"] }, status: "active" } },
      select: { user: { select: { role: true, email: true, phone: true } } },
    });
    const admins = links.filter((l) => l.user.role === "RESORT_ADMIN");
    const chosen = admins.length > 0 ? admins : links;
    // a placeholder email is not the owner's: it falls through to their phone,
    // which is where an owner who signed up with only a phone is reached
    return chosen
      .map((l) => reachableEmail(l.user.email) ?? reachablePhone(l.user.phone) ?? "")
      .filter((v) => v.length > 0);
  }
}
