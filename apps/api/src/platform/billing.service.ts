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
 *   bill    --(+deadline)---->   account suspended
 *   paid    ----------------->   account back, subscription ACTIVE
 *
 * The subscriber is an account — a resort owner or an agency — not a resort
 * (2026-09-11 design, phase 2). The arithmetic above knows nothing about which
 * kind it is. Two things do, and only these: who is told, and what suspension
 * means. A resort owner's resorts stop taking new entries (guests asleep in the
 * rooms tonight can still check out); an agency's account is marked suspended
 * and stops selling, while the bookings it already made stay honoured.
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
import { addPeriod, isPeriodUnit, type Phase } from "@rh/shared";
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

/** The two customers. Anything that is not an agency is a resort owner. */
export const ACCOUNT_KIND = { RESORT_OWNER: "RESORT_OWNER", AGENCY: "AGENCY" } as const;

const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The private `addMonths` that used to live here is gone, and so are the two
 * copies of it in `platform.service.ts` and `subscription.service.ts`. All
 * three were `r.setMonth(r.getMonth() + n)`, which does not clamp: 31 January
 * plus one month was **3 March**, so February was never a billing period, and
 * every renewal after it inherited the slide. `addPeriod` in @rh/shared clamps,
 * works in UTC, and knows units the calendar has other than the month.
 *
 * How far the sweep will walk in one pass. A period can now be a day long, so
 * an account whose sweep has not run for a year has a legitimate three hundred
 * and sixty-five periods to catch up on; the old bound of 24 was written when
 * the shortest period was a month. It is still a bound, because an unbounded
 * loop over a bad row is how a billing sweep becomes an outage.
 */
const MAX_CATCHUP_PERIODS = 400;

/**
 * The rung a subscription says it is standing on.
 *
 * Falls back to the **last** rung, not the first: a missing `seq` means the
 * owner edited the ladder under a live account, and the settle price is the
 * honest reading of that. Restarting them at the bottom would hand back an
 * introductory price they have already used up.
 */
const rungFor = (phases: Phase[], seq: number): Phase =>
  phases.find((p) => p.seq === seq) ?? phases[phases.length - 1]!;
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

/**
 * Hourly, not daily. The sweep is idempotent and every step asks "is this date
 * past", so running it often costs nothing and means a policy change or a
 * payment takes effect within the hour rather than overnight.
 */
const SWEEP_MS = 3_600_000;
/** A restart is the most likely moment for a missed sweep, so run one shortly after boot. */
const FIRST_SWEEP_MS = 60_000;

interface Account {
  id: number;
  name: string;
  kind: string;
  /** What the messages call the customer: its only resort's name, else the account's. */
  label: string;
  /** The resort the audit trail files an event under, when there is exactly one to choose. */
  anchorResortId: number | null;
}

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
    });
    for (const sub of soon) {
      const account = await this.account(sub.accountId);
      const sent = await this.notify(account, "subscription_trial_ending", {
        resort: account.label,
        plan: sub.plan,
        date: isoDay(sub.trialEndsAt!),
        days: Math.max(0, daysBetween(now, sub.trialEndsAt!)),
        amount: Number(sub.fee),
      }, `sub:${sub.id}`);
      result.notices += sent;
    }
  }

  private async endTrials(now: Date, result: BillingSweepResult) {
    const ended = await this.prisma.subscription.findMany({
      where: { status: "TRIAL", trialEndsAt: { lte: now } },
    });
    for (const sub of ended) {
      await this.applyPendingPlan(sub);
      /**
       * The first period starts when the trial ended, not today: a sweep that
       * ran late must not hand the account free days it did not sell.
       *
       * No bill is raised here any more. The account is put on the bottom rung
       * with `renewsAt` in the past, and `raiseRenewals` — which runs next in
       * this same pass — walks it up. One piece of code climbs the ladder, so
       * a trial ending and a sweep catching up cannot disagree about what the
       * second period costs.
       */
      const periodStart = sub.trialEndsAt!;
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          phaseSeq: 1,
          phaseDone: 0,
          phaseStartedAt: periodStart,
          renewsAt: periodStart,
        },
      });
      result.trialsEnded++;
    }
  }

  // ─────────────────────────── invoicing ───────────────────────────

  private async raiseRenewals(now: Date, result: BillingSweepResult) {
    // CANCELLED is deliberately excluded: a customer who left is not billed
    // again. PAST_DUE is included — falling behind on one month does not stop
    // the next month accruing, or the debt would silently stop growing.
    const dueNow = await this.prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, renewsAt: { lte: now } },
    });
    for (const sub of dueNow) {
      // a downgrade the owner asked for lands here, at the period boundary,
      // so the first bill of the new period is already the new price — and so
      // does a move onto a different schedule
      await this.applyPendingPlan(sub);

      const phases = await this.ladder(sub.scheduleId);
      if (!phases) {
        /**
         * A schedule is the only place a price lives. An account pointed at
         * none is skipped and said out loud, rather than billed a number
         * somebody guessed — a silent zero on an invoice is worse than a gap
         * somebody has to come and fix.
         */
        this.logger.warn(
          `subscription ${sub.id} (${sub.plan}) has no pricing schedule — not billed`,
        );
        continue;
      }

      let rung = rungFor(phases, sub.phaseSeq);
      let done = sub.phaseDone;
      /**
       * Where this rung began, and what every period inside it is measured
       * from. Chaining each date off the last is what made a month-end clamp
       * permanent; from a fixed anchor, the 31st comes back in March.
       */
      let anchor = sub.phaseStartedAt ?? sub.renewsAt!;
      let periodStart = sub.renewsAt!;

      let guard = 0;
      while (guard++ < MAX_CATCHUP_PERIODS) {
        const periodEnd = addPeriod(anchor, (done + 1) * rung.count, rung.unit);
        if (await this.raiseDue(sub, rung.price, periodStart, periodEnd)) result.duesRaised++;
        done++;
        if (rung.repeats != null && done >= rung.repeats) {
          const next = phases[phases.indexOf(rung) + 1];
          // no next rung means the ladder is malformed — `phasesAreSane`
          // refuses to store one — so stay on this price rather than stop
          // billing an account that is still being served
          if (next) {
            rung = next;
            done = 0;
            anchor = periodEnd;
          }
        }
        periodStart = periodEnd;
        if (periodEnd > now) break;
      }
      if (guard >= MAX_CATCHUP_PERIODS) {
        this.logger.warn(`subscription ${sub.id}: catch-up hit ${MAX_CATCHUP_PERIODS} periods`);
      }

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          renewsAt: periodStart,
          phaseSeq: rung.seq,
          phaseDone: done,
          phaseStartedAt: anchor,
          // what the account pays now, for the notices and the owner's screen
          fee: rung.price as never,
        },
      });
    }
  }

  /**
   * Applies a plan or rhythm change that was waiting for the renewal.
   *
   * An upgrade is immediate and billed pro rata by `SubscriptionService`; a
   * downgrade is not, because the period the account is in has already been
   * invoiced. `pendingPlan` and `pendingCycle` hold those until this moment.
   * The row is mutated in place as well as in the database so the bill raised
   * straight after this carries the new fee and the new period length.
   */
  private async applyPendingPlan(sub: {
    id: bigint;
    accountId: number;
    plan: string;
    fee: unknown;
    scheduleId: number | null;
    phaseStartedAt: Date | null;
    pendingPlan: string | null;
    pendingScheduleId: number | null;
  }): Promise<void> {
    if (!sub.pendingPlan && !sub.pendingScheduleId) return;

    // the plan stays where it is unless a change was asked for
    const name = sub.pendingPlan ?? sub.plan;
    const target = await this.prisma.platformPlan.findUnique({
      where: { name },
      include: { schedules: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!target) {
      // the plan was deleted between the request and the renewal; keep the
      // subscription where it is rather than move it somewhere nobody chose
      this.logger.warn(`subscription ${sub.id}: pending plan ${sub.pendingPlan} no longer exists — kept on ${sub.plan}`);
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { pendingPlan: null } });
      sub.pendingPlan = null;
      return;
    }

    /**
     * The schedule they asked for, if it is still on this plan's shelf.
     *
     * A schedule the owner withdrew — or one belonging to a different plan —
     * is not something to bill against, so the plan's first active schedule
     * stands in. The old code had the same shape for a narrower case: a plan
     * whose yearly price was taken away while somebody was waiting to move
     * onto it fell back to monthly rather than being billed a price nobody set.
     */
    const asked = sub.pendingScheduleId
      ? target.schedules.find((x) => x.id === sub.pendingScheduleId)
      : target.schedules.find((x) => x.id === sub.scheduleId);
    const schedule = asked ?? target.schedules[0];
    if (!schedule) {
      this.logger.warn(
        `subscription ${sub.id}: ${target.name} has no pricing schedule — kept on ${sub.plan}`,
      );
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingPlan: null, pendingScheduleId: null },
      });
      sub.pendingPlan = null;
      sub.pendingScheduleId = null;
      return;
    }
    if (sub.pendingScheduleId && schedule.id !== sub.pendingScheduleId) {
      this.logger.warn(
        `subscription ${sub.id}: schedule ${sub.pendingScheduleId} is gone — using ${schedule.label}`,
      );
    }

    const bottom = (await this.ladder(schedule.id))?.[0];
    const fee = bottom ? bottom.price : Number(sub.fee);

    /**
     * A plan change restarts the new plan's ladder at its bottom rung, with
     * today as the anchor. The customer bought this plan, so they get this
     * plan's terms — and whether those terms open with an introductory price
     * at all is the owner's decision, written in the schedule, not ours.
     */
    const from = { plan: sub.plan, scheduleId: sub.scheduleId };
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: target.name,
        fee: fee as never,
        scheduleId: schedule.id,
        phaseSeq: bottom?.seq ?? 1,
        phaseDone: 0,
        // the anchor goes with the old ladder: the caller re-reads it as the
        // period boundary this change is landing on
        phaseStartedAt: null,
        pendingPlan: null,
        pendingScheduleId: null,
      },
    });
    sub.plan = target.name;
    sub.fee = fee;
    sub.scheduleId = schedule.id;
    sub.phaseStartedAt = null;
    sub.pendingPlan = null;
    sub.pendingScheduleId = null;
    const account = await this.account(sub.accountId);
    await this.audit.log({
      actorId: SYSTEM_ACTOR_ID,
      resortId: account.anchorResortId,
      action: "billing.plan.applied",
      entity: "subscription",
      entityId: Number(sub.id),
      diff: { accountId: account.id, from, to: { plan: target.name, scheduleId: schedule.id }, fee },
    });
  }

  /**
   * The rungs of a subscription's schedule, oldest first, or null when it has
   * none to stand on.
   *
   * Read per subscription rather than joined into the sweep's query: a catch-up
   * walks one account's ladder many times over and every other account's not at
   * all, and the list is three rows.
   */
  private async ladder(scheduleId: number | null): Promise<Phase[] | null> {
    if (scheduleId == null) return null;
    const rows = await this.prisma.planPhase.findMany({
      where: { scheduleId },
      orderBy: { seq: "asc" },
    });
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      seq: r.seq,
      count: r.count,
      // a unit the calendar does not know is a row somebody hand-edited; a
      // month is the reading that bills rather than throws
      unit: isPeriodUnit(r.unit) ? r.unit : ("MONTH" as const),
      price: Number(r.price),
      repeats: r.repeats,
    }));
  }

  /**
   * Creates the bill for one period. Returns false when it already existed.
   *
   * The amount and the period's end are arguments now rather than read off the
   * subscription, because during a catch-up neither is a property of the row:
   * each missed period belongs to the rung it fell on, and must be billed at
   * that rung's price even if the account has since climbed past it.
   */
  private async raiseDue(
    sub: { id: bigint; accountId: number; plan: string },
    amount: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean> {
    try {
      const due = await this.prisma.subscriptionDue.create({
        data: {
          subscriptionId: sub.id,
          accountId: sub.accountId,
          amount,
          periodStart,
          periodEnd,
          // payable from the day the period starts; lateness is measured from here
          dueDate: periodStart,
        },
      });
      const account = await this.account(sub.accountId);
      await this.notify(account, "subscription_invoice", {
        resort: account.label,
        plan: sub.plan,
        amount,
        date: isoDay(periodStart),
        periodEnd: isoDay(periodEnd),
      }, `due:${due.id}`);
      await this.audit.log({
        actorId: SYSTEM_ACTOR_ID,
        resortId: account.anchorResortId,
        action: "billing.due.raised",
        entity: "subscription_due",
        entityId: Number(due.id),
        diff: { accountId: account.id, amount, periodStart: isoDay(periodStart) },
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
    });
    for (const due of late) {
      await this.prisma.subscriptionDue.update({ where: { id: due.id }, data: { status: "OVERDUE" } });
      await this.prisma.subscription.updateMany({
        where: { id: due.subscriptionId, status: { in: ["ACTIVE", "TRIAL"] } },
        data: { status: "PAST_DUE" },
      });
      const account = await this.account(due.accountId);
      await this.notify(account, "subscription_overdue", {
        resort: account.label,
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
      },
    });
    for (const due of window) {
      if (!(await this.hasSomethingToSuspend(due.accountId))) continue;
      const account = await this.account(due.accountId);
      const deadline = addDays(due.dueDate, policy.suspendAfterDays);
      result.notices += await this.notify(account, "subscription_suspending", {
        resort: account.label,
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
      },
      orderBy: { dueDate: "asc" },
    });
    const seen = new Set<number>();
    for (const due of unpaid) {
      if (seen.has(due.accountId)) continue;
      seen.add(due.accountId);
      const account = await this.account(due.accountId);
      if (!(await this.suspendAccount(account, now))) continue;
      await this.notify(account, "subscription_suspended", {
        resort: account.label,
        amount: Number(due.amount),
        date: isoDay(due.dueDate),
      }, `due:${due.id}`);
      await this.audit.log({
        actorId: SYSTEM_ACTOR_ID,
        resortId: account.anchorResortId,
        action: account.kind === ACCOUNT_KIND.AGENCY ? "billing.agency.suspended" : "billing.resort.suspended",
        entity: "tenant",
        entityId: account.id,
        diff: { dueId: Number(due.id), dueDate: isoDay(due.dueDate) },
      });
      result.suspended++;
      this.logger.warn(`suspended account ${account.id} (${account.label}): unpaid since ${isoDay(due.dueDate)}`);
    }
  }

  /**
   * What suspension does is the one thing that cannot be shared between the two
   * customers (design §2.2). Returns whether anything changed — an account
   * already suspended, or one suspended by a human, is left as it is.
   */
  private async suspendAccount(account: Account, now: Date): Promise<boolean> {
    if (account.kind === ACCOUNT_KIND.AGENCY) {
      const r = await this.prisma.tenant.updateMany({
        where: { id: account.id, status: "active" },
        data: { status: "suspended", suspendedReason: BILLING_SUSPENSION, suspendedAt: now },
      });
      return r.count > 0;
    }
    // a resort owner: every resort it owns stops taking new entries
    const r = await this.prisma.resort.updateMany({
      where: { tenantId: account.id, status: "active" },
      data: { status: "suspended", suspendedReason: BILLING_SUSPENSION, suspendedAt: now },
    });
    return r.count > 0;
  }

  /** Warning an account that has already been suspended, or has nothing to suspend, is noise. */
  private async hasSomethingToSuspend(accountId: number): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: accountId }, select: { kind: true, status: true } });
    if (!tenant) return false;
    if (tenant.kind === ACCOUNT_KIND.AGENCY) return tenant.status === "active";
    return (await this.prisma.resort.count({ where: { tenantId: accountId, status: "active" } })) > 0;
  }

  // ─────────────────────────── coming back ───────────────────────────

  /**
   * Settling the bill must restore service without anyone being asked. Only
   * suspensions this service imposed are lifted — an account suspended by a
   * human for fraud stays suspended however much it pays.
   */
  private async resumeSettled(result: BillingSweepResult) {
    const [agencies, resorts] = await Promise.all([
      this.prisma.tenant.findMany({ where: { suspendedReason: BILLING_SUSPENSION }, select: { id: true } }),
      this.prisma.resort.findMany({
        where: { status: { not: "active" }, suspendedReason: BILLING_SUSPENSION },
        select: { tenantId: true },
      }),
    ]);
    const accountIds = new Set([...agencies.map((a) => a.id), ...resorts.map((r) => r.tenantId)]);
    for (const accountId of accountIds) {
      const open = await this.prisma.subscriptionDue.count({
        where: { accountId, status: { in: ["DUE", "OVERDUE"] } },
      });
      if (open > 0) continue;
      if (await this.reactivateAccount(accountId)) result.resumed++;
    }
  }

  /**
   * Called by the sweep and directly by the super admin's "mark paid" action,
   * so a customer who pays is back inside a second rather than at the next sweep.
   */
  async reactivateAccount(accountId: number): Promise<boolean> {
    const [agency, resorts] = await Promise.all([
      this.prisma.tenant.updateMany({
        where: { id: accountId, suspendedReason: BILLING_SUSPENSION },
        data: { status: "active", suspendedReason: null, suspendedAt: null },
      }),
      this.prisma.resort.updateMany({
        where: { tenantId: accountId, status: { not: "active" }, suspendedReason: BILLING_SUSPENSION },
        data: { status: "active", suspendedReason: null, suspendedAt: null },
      }),
    ]);
    if (agency.count + resorts.count === 0) return false;
    const account = await this.account(accountId);
    await this.notify(account, "subscription_resumed", { resort: account.label }, `account:${accountId}:${Date.now()}`);
    await this.audit.log({
      actorId: SYSTEM_ACTOR_ID,
      resortId: account.anchorResortId,
      action: account.kind === ACCOUNT_KIND.AGENCY ? "billing.agency.resumed" : "billing.resort.resumed",
      entity: "tenant",
      entityId: accountId,
    });
    return true;
  }

  // ─────────────────────────── telling them ───────────────────────────

  /** The account and what its messages call it. */
  private async account(accountId: number): Promise<Account> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, kind: true, resorts: { select: { id: true, name: true }, take: 2, orderBy: { id: "asc" } } },
    });
    if (!tenant) return { id: accountId, name: `#${accountId}`, kind: ACCOUNT_KIND.RESORT_OWNER, label: `#${accountId}`, anchorResortId: null };
    const only = tenant.resorts.length === 1 ? tenant.resorts[0]! : null;
    return {
      id: tenant.id,
      name: tenant.name,
      kind: tenant.kind,
      // a single-resort owner knows their business by the resort's name
      label: only?.name ?? tenant.name,
      anchorResortId: only?.id ?? null,
    };
  }

  /**
   * These messages are the platform speaking to its customer about their
   * account, so unlike guest-facing mail they are deliberately not tenant
   * editable — a tenant should not be able to rewrite their own suspension
   * notice. The platform's own name in them comes from settings, not source.
   */
  private async notify(
    account: Account,
    template: TemplateName,
    data: Record<string, string | number | null | undefined>,
    ref: string,
  ): Promise<number> {
    const recipients = await this.billingContacts(account);
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

  /**
   * Whoever owns the account. For a resort owner: the admins of its resorts,
   * else their managers. For an agency: the agency itself — the AGENT with no
   * parent — never its staff, and never a resort it sells for.
   */
  private async billingContacts(account: Account): Promise<string[]> {
    const users =
      account.kind === ACCOUNT_KIND.AGENCY
        ? await this.prisma.user.findMany({
            where: { accountId: account.id, role: "AGENT", parentAgentId: null, status: "active" },
            select: { id: true, role: true, email: true, phone: true },
          })
        : (
            await this.prisma.userResort.findMany({
              where: {
                resort: { tenantId: account.id },
                user: { role: { in: ["RESORT_ADMIN", "MANAGER"] }, status: "active" },
              },
              select: { user: { select: { id: true, role: true, email: true, phone: true } } },
            })
          ).map((l) => l.user);
    const admins = users.filter((u) => u.role === "RESORT_ADMIN");
    const chosen = admins.length > 0 ? admins : users;
    // one person who admins two resorts is told once
    const unique = [...new Map(chosen.map((u) => [u.id, u])).values()];
    // a placeholder email is not the owner's: it falls through to their phone
    return unique
      .map((u) => reachableEmail(u.email) ?? reachablePhone(u.phone) ?? "")
      .filter((v) => v.length > 0);
  }
}
