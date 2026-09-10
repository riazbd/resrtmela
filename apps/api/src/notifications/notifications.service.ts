import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import { SmsService } from "./sms.service";
import { PlatformSettingsService } from "../common/platform-settings.service";
import { TemplatesService } from "./templates.service";
import { TaxService } from "../common/tax.service";
import { dedupeKeyFor, renderTemplate, emailEnvelope, emailHtml, type TemplateName, type PlatformIdentity } from "./templates";
import { todayIn } from "../common/dates";
import { bookingTotals } from "../common/money";
import { formatMoney, ROLE, type JwtClaims } from "@rh/shared";

const TICK_MS = 15_000;

export interface EnqueueInput {
  channel?: "SMS" | "WHATSAPP" | "EMAIL";
  to: string;
  template: TemplateName;
  data: Record<string, string | number | null | undefined>;
  sendAfter?: Date;
  dedupeKey?: string;
  resortId?: number | null;
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  private ticks = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TemplatesService) private readonly templates: TemplatesService,
    @Inject(TaxService) private readonly tax: TaxService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log("notification dispatcher running (15s tick, console provider)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // real implementation kept separate to stay testable
  async enqueueJob(input: {
    channel?: "SMS" | "WHATSAPP" | "EMAIL";
    to: string;
    template: TemplateName;
    data: Record<string, string | number | null | undefined>;
    sendAfter?: Date;
    dedupeKey?: string;
    /** whose message this is — the resort whose wording and name it goes out in */
    resortId?: number | null;
  }): Promise<{ queued: boolean }> {
    const key = input.dedupeKey ?? dedupeKeyFor(input.template, input.to);
    try {
      await this.prisma.notificationJob.create({
        data: {
          channel: input.channel ?? "SMS",
          toRef: input.to,
          template: input.template,
          dedupeKey: key,
          payload: input.data as object,
          resortId: input.resortId ?? null,
          sendAfter: input.sendAfter ?? new Date(),
        },
      });
      return { queued: true };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return { queued: false }; // already sent/queued
      throw e;
    }
  }

  /** Domain-level helper: booking + guest + resort → notification. */
  async notifyBooking(
    bookingId: number,
    template: TemplateName,
    extra: Record<string, string | number | null | undefined> = {},
    dedupeExtra?: string,
  ) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        guest: { select: { phone: true, email: true } },
        resort: { select: { id: true, name: true, taxRatePct: true } },
        items: true,
        payments: true,
      },
    });
    if (!b) return;
    /**
     * The same number the invoice prints, tax included.
     *
     * `bookingTotals(b)` was called without `taxRatePct`, so the balance in the
     * guest's SMS or email excluded tax while `invoicePayload` included it. The
     * guest was told one figure at booking and handed another at the desk, and
     * nothing on either side could notice — no test in the suite sets a
     * non-zero tax rate on this path.
     */
    const due = Math.max(0, bookingTotals({ ...b, taxRules: await this.tax.rulesFor(b.resortId) }).due);
    const to = b.guest.email?.trim() || b.guest.phone;
    await this.enqueueJob({
      channel: b.guest.email?.trim() ? "EMAIL" : "SMS",
      to,
      template,
      data: {
        resort: b.resort.name,
        resortName: b.resort.name,
        code: b.code,
        checkin: b.checkIn ? b.checkIn.toISOString().slice(0, 10) : "?",
        checkout: b.checkOut ? b.checkOut.toISOString().slice(0, 10) : "?",
        due,
        ...extra,
      },
      dedupeKey: dedupeKeyFor(template, `booking:${b.id}`, dedupeExtra),
      resortId: b.resortId,
    });
  }

  /** Payment receipt notification. */
  async notifyPayment(bookingId: number, amount: number, method: string) {
    await this.notifyBooking(bookingId, "payment_receipt", { amount, method }, `pay:${amount}:${Date.now()}`);
  }

  /** Who the platform is, this tick. Cached inside the settings service. */
  private async platformIdentity(): Promise<PlatformIdentity> {
    const all = await this.settings.all();
    return {
      name: all["platform.name"] ?? "Resort Mela",
      supportEmail: all["platform.supportEmail"],
      supportPhone: all["platform.supportPhone"],
    };
  }

  /**
   * One dispatcher tick: D-1 reminder sweep + send all due jobs.
   * Console "provider" in dev — swap for SMS/WhatsApp gateway in production.
   */
  async tick(): Promise<{ sent: number; swept: number; failed: number }> {
    // never let a background-tick error become an unhandled rejection (would kill the process)
    try {
      return await this.tickInner();
    } catch (e) {
      this.logger.error(`notification tick failed: ${String(e).slice(0, 300)}`);
      return { sent: 0, swept: 0, failed: 0 };
    }
  }

  private async tickInner(): Promise<{ sent: number; swept: number; failed: number }> {
    this.ticks++;
    let swept = 0;
    // agent payment deadline sweep — hourly
    if (this.ticks % 240 === 0) {
      try {
        await this.sweepAgentDeadlines();
      } catch (e) {
        this.logger.warn(`agent deadline sweep failed: ${String(e).slice(0, 200)}`);
      }
    }
    // D-1 check-in reminder sweep.
    //
    // "Tomorrow" is a civil date in the resort's own timezone. Computing it
    // from UTC meant that between midnight and 06:00 in Dhaka the sweep asked
    // for the wrong day and reminded guests who were arriving that morning.
    // Resorts are grouped by timezone so this stays one query per distinct
    // zone rather than one per resort.
    const zones = await this.prisma.resort.groupBy({ by: ["timezone"] });
    for (const { timezone } of zones) {
      const tomorrow = new Date(todayIn(timezone).getTime() + 86_400_000);
      const arrivals = await this.prisma.booking.findMany({
        where: {
          checkIn: tomorrow,
          state: { in: ["CONFIRMED", "CHECKED_IN"] },
          deletedAt: null,
          resort: { timezone },
        },
        select: { id: true },
      });
      const day = tomorrow.toISOString().slice(0, 10);
      for (const b of arrivals) {
        const before = await this.prisma.notificationJob.count({
          where: { dedupeKey: dedupeKeyFor("checkin_reminder", `booking:${b.id}`, day) },
        });
        if (before === 0) {
          await this.notifyBooking(b.id, "checkin_reminder", {}, day);
          swept++;
        }
      }
    }

    // send due jobs (oldest first)
    const due = await this.prisma.notificationJob.findMany({
      where: { sentAt: null, sendAfter: { lte: new Date() }, attempts: { lt: 3 } },
      orderBy: { id: "asc" },
      take: 50,
    });
    let sent = 0;
    let failed = 0;
    for (const job of due) {
      try {
        // the resort's own wording where they have written it, the built-in
        // one where they have not
        const text = await this.templates.render(
          job.resortId,
          job.template as TemplateName,
          (job.payload ?? {}) as Record<string, string | number | null | undefined>,
        );
        let error: string | undefined;
        let sentOk = false;
        if (job.channel === "EMAIL") {
          // A message about a stay goes out as the resort; one about a
          // subscription as the platform. Both the sender and the subject line
          // come from the template's own definition rather than from the
          // template id with its underscores taken out.
          const platform = await this.platformIdentity();
          const data = (job.payload ?? {}) as Record<string, string | number | null | undefined>;
          const { fromName, subject } = emailEnvelope(job.template as TemplateName, data, platform);
          const r = await this.email.send(job.toRef, subject, emailHtml(text, fromName, platform), fromName);
          sentOk = r.sent;
          error = r.error;
        } else {
          // SMS / WhatsApp: real gateway (SSL Wireless), console fallback in dev
          const r = await this.sms.send(job.toRef, text);
          if (r.sent) {
            sentOk = true;
          } else if (r.error === "sms-not-configured") {
            this.logger.log(`[${job.channel}] to ${job.toRef}: ${text}`);
            sentOk = true;
            error = "console-only (no SMS gateway)";
          } else {
            error = r.error;
            sentOk = false;
          }
        }
        if (sentOk) {
          // renderedText is kept so "what did the guest actually receive" has
          // an answer — it matters more now the wording is the tenant's
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: { sentAt: new Date(), renderedText: text },
          });
          sent++;
        } else if (!this.email.configured) {
          // no SMTP configured — dev: treat as delivered, note why
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: { sentAt: new Date(), renderedText: text, lastError: `console-only (${error ?? "no SMTP"})` },
          });
          sent++;
        } else {
          throw new Error(error ?? "email not sent");
        }
      } catch (e) {
        failed++;
        await this.prisma.notificationJob.update({
          where: { id: job.id },
          data: { attempts: { increment: 1 }, lastError: String(e).slice(0, 500) },
        });
      }
    }
    return { sent, swept, failed };
  }

  /**
   * The messages this caller's resorts sent.
   *
   * This used to be every message on the platform. `NotificationJob.payload`
   * carries the guest's name, what they owe and their booking code, and the
   * only gate was the caller's role — so any resort admin could read every
   * other tenant's guest correspondence. A job with no resort is the
   * platform's own mail (subscription notices), which belongs to the super
   * admin alone.
   */
  recent(claims: JwtClaims, take = 50) {
    const mine =
      claims.role === ROLE.SUPER_ADMIN ? {} : { resortId: { in: claims.resortIds } };
    return this.prisma.notificationJob.findMany({
      where: mine,
      orderBy: { id: "desc" },
      take: Math.min(take, 200),
    });
  }

  /** flag agent bookings approaching the resort's full-payment deadline (in-app alerts to admins) */
  private async sweepAgentDeadlines() {
    const resorts = await this.prisma.resort.findMany({ where: { status: "active" }, select: { id: true, name: true, agentPaymentHours: true, currency: true, locale: true, taxRatePct: true } });
    const now = new Date();
    for (const resort of resorts) {
      const taxRules = await this.tax.rulesFor(resort.id);
      const horizon = new Date(now.getTime() + resort.agentPaymentHours * 3_600_000);
      const bookings = await this.prisma.booking.findMany({
        where: {
          resortId: resort.id,
          agentUserId: { not: null },
          state: { in: ["PENDING", "CONFIRMED"] },
          deletedAt: null,
          checkIn: { lte: horizon, gte: now },
        },
        select: {
          id: true, code: true, checkIn: true, checkOut: true, discount: true,
          items: { select: { qty: true, unitPrice: true, itemKind: true } },
          payments: { select: { amount: true, paymentType: true } },
        },
      });
      for (const b of bookings) {
        /**
         * What the agent actually owes.
         *
         * This was `rent - discount - paid` over `unitPrice * qty` — no nights
         * multiplier and no tax. A ROOM item carries one night's price with
         * qty 1, so a five-night stay was reported to the owner as one night:
         * "this agent owes ৳5,000" on a ৳25,000 booking, in the alert whose
         * whole job is to say how much is outstanding before the deadline.
         */
        const due = Math.max(0, bookingTotals({ ...b, taxRules }).due);
        if (due <= 0 || !b.checkIn) continue;
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const existing = await this.prisma.notification.findFirst({
          where: { kind: "alert", link: `/bookings?id=${b.id}`, createdAt: { gte: dayStart }, title: { contains: b.code } },
        });
        if (existing) continue;
        const admins = await this.prisma.userResort.findMany({
          where: { resortId: resort.id, user: { role: { in: ["RESORT_ADMIN", "MANAGER"] } } },
          select: { userId: true },
        });
        if (admins.length === 0) continue;
        const hoursLeft = Math.max(0, Math.round((b.checkIn.getTime() - now.getTime()) / 3_600_000));
        await this.prisma.notification.createMany({
          data: admins.map((a) => ({
            userId: a.userId,
            resortId: resort.id,
            title: `${b.code} unpaid — ${hoursLeft}h to check-in`,
            body: `${formatMoney(due, { currency: resort.currency, locale: resort.locale })} due. Full payment needed ${resort.agentPaymentHours}h before check-in, or approve late payment.`,
            kind: "alert",
            link: `/bookings?id=${b.id}`,
          })),
        });
      }
    }
  }
}
