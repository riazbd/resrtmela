import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import { dedupeKeyFor, renderTemplate, type TemplateName } from "./templates";
import { today } from "../common/dates";

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
        resort: { select: { name: true } },
        items: true,
        payments: true,
      },
    });
    if (!b) return;
    const paid = b.payments
      .filter((p) => p.paymentType !== "REFUND")
      .reduce((s, p) => s + Number(p.amount), 0);
    const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
    const due = Math.max(0, Math.round((rent - Number(b.discount) - paid) * 100) / 100);
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
    });
  }

  /** Payment receipt notification. */
  async notifyPayment(bookingId: number, amount: number, method: string) {
    await this.notifyBooking(bookingId, "payment_receipt", { amount, method }, `pay:${amount}:${Date.now()}`);
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
    // D-1 check-in reminder sweep
    const tomorrow = new Date(today().getTime() + 86_400_000);
    const arrivals = await this.prisma.booking.findMany({
      where: {
        checkIn: tomorrow,
        state: { in: ["CONFIRMED", "CHECKED_IN"] },
        deletedAt: null,
      },
      select: { id: true },
    });
    for (const b of arrivals) {
      const before = await this.prisma.notificationJob.count({
        where: { dedupeKey: dedupeKeyFor("checkin_reminder", `booking:${b.id}`, tomorrow.toISOString().slice(0, 10)) },
      });
      if (before === 0) {
        await this.notifyBooking(b.id, "checkin_reminder", {}, tomorrow.toISOString().slice(0, 10));
        swept++;
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
        const text = renderTemplate(
          job.template as TemplateName,
          (job.payload ?? {}) as Record<string, string | number | null | undefined>,
        );
        let error: string | undefined;
        let sentOk = false;
        if (job.channel === "EMAIL") {
          // subject: template name made human
          const subject = `${process.env.SMTP_SUBJECT_PREFIX ?? "Resort Mela"}: ${job.template.replace(/_/g, " ")}`;
          const fromName =
            typeof (job.payload as { resortName?: unknown } | null)?.resortName === "string"
              ? ((job.payload as { resortName: string }).resortName)
              : undefined;
          const r = await this.email.send(
            job.toRef,
            subject,
            `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">${text}</div>`,
            fromName,
          );
          sentOk = r.sent;
          error = r.error;
        } else {
          // SMS / WhatsApp: provider adapter (dev: console). Production: gateway HTTP call.
          this.logger.log(`[${job.channel}] to ${job.toRef}: ${text}`);
          sentOk = true;
        }
        if (sentOk) {
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: { sentAt: new Date() },
          });
          sent++;
        } else if (!this.email.configured) {
          // no SMTP configured — dev: treat as delivered, note why
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: { sentAt: new Date(), lastError: `console-only (${error ?? "no SMTP"})` },
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

  recent(take = 50) {
    return this.prisma.notificationJob.findMany({
      orderBy: { id: "desc" },
      take: Math.min(take, 200),
    });
  }
}
