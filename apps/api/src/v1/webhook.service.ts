/**
 * Telling a resort's own website what changed (2026-09-15 design, §6).
 *
 * Two rules shape all of it.
 *
 * **A booking is never slower because somebody's website is down.** `emit` is a
 * row; delivering is the sweep's. A resort whose site has gone away must not
 * find their front desk hanging on Check in.
 *
 * **Giving up is a state, not a silence.** There are jobs stuck on this
 * platform today that nobody was told about. An endpoint failing for a day is a
 * resort losing bookings, and a row that says so — visible in the panel, with a
 * button to try again — is the least this can do.
 */
import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type WebhookEvent } from "@rh/shared";
import { signWebhook } from "./webhook-signature";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The injection token for the port below.
 *
 * A constructor parameter with a default is still a parameter as far as Nest
 * is concerned — it reads the emitted types, not the JavaScript — so without
 * this the whole application refuses to start. `app-boots` caught it, for the
 * second time in one afternoon.
 */
export const WEBHOOK_POSTER = Symbol("WEBHOOK_POSTER");

/** How a call is actually made. A port, so the tests hold the far end. */
export type Poster = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<{ status: number }>;

/**
 * A minute, then five, then twenty-five… up to a day, and then we stop.
 *
 * Widening, because a site that is down stays down for minutes rather than
 * seconds and a tight retry is a denial of service aimed at a customer. Ten
 * attempts spans about two days, which is longer than any outage somebody is
 * actually fixing.
 */
export const MAX_ATTEMPTS = 10;
const backoffMs = (attempts: number): number =>
  Math.min(24 * 60 * 60_000, 60_000 * Math.pow(5, Math.min(attempts - 1, 6)));

/** How long we wait on somebody else's server before calling it a failure. */
const TIMEOUT_MS = 10_000;

const realPoster: Poster = async (url, body, headers) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status };
};

/**
 * How often the queue is drained.
 *
 * Fifteen seconds is the notification dispatcher's rhythm and is the right one
 * here too: a resort's website learning about a cancellation a quarter of a
 * minute late is nothing, and learning about it in an hour is a room sold
 * twice.
 */
const TICK_MS = 15_000;

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(WEBHOOK_POSTER) private readonly post: Poster = realPoster,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // never hold the process open for a queue that is nearly always empty
    this.timer.unref?.();
    this.logger.log("webhook delivery running (15s tick)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** A delivery failure must never become an unhandled rejection and kill the API. */
  private async tick(): Promise<void> {
    try {
      const r = await this.deliverDue();
      if (r.delivered + r.failed > 0) this.logger.log(`webhooks: ${JSON.stringify(r)}`);
    } catch (e) {
      this.logger.error(`webhook delivery failed: ${String(e).slice(0, 300)}`);
    }
  }

  /** A secret for a new endpoint — shown once, like a key. */
  static newSecret(): string {
    return randomBytes(24).toString("hex");
  }

  /**
   * Something happened that a resort's website would want to know.
   *
   * Never throws and never blocks: it is called from the middle of a booking,
   * and a resort with no endpoints — which is nearly all of them — pays one
   * indexed query for it.
   */
  async emit(resortId: number, event: WebhookEvent, data: unknown): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { resortId, active: true },
        select: { id: true },
      });
      if (endpoints.length === 0) return;
      await this.prisma.webhookDelivery.createMany({
        data: endpoints.map((e) => ({
          endpointId: e.id,
          event,
          payload: { event, at: new Date().toISOString(), data } as never,
        })),
      });
    } catch (e) {
      // a webhook that cannot be queued must not lose the booking it is about
      this.logger.warn(`could not queue ${event} for resort ${resortId}: ${(e as Error).message}`);
    }
  }

  /**
   * Everything whose time has come, one attempt each.
   *
   * One endpoint's failure never stops another's: they are delivered one at a
   * time and each records its own outcome, because the whole point of a queue
   * is that a bad row is a bad row rather than a bad night.
   */
  async deliverDue(now = new Date()): Promise<{ delivered: number; failed: number }> {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { deliveredAt: null, nextAttemptAt: { not: null, lte: now } },
      include: { endpoint: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 200,
    });

    let delivered = 0;
    let failed = 0;
    for (const row of due) {
      /**
       * A delivery that has already given up stays given up.
       *
       * `retry()` is the only way back, and it sets the count to zero — so a
       * row at the limit with a time on it got there by some other route, and
       * honouring it would retry for ever. Put back the way it was rather than
       * attempted.
       */
      if (row.attempts >= MAX_ATTEMPTS) {
        await this.prisma.webhookDelivery.update({
          where: { id: row.id },
          data: { nextAttemptAt: null },
        });
        continue;
      }
      // the bytes that are signed are the bytes that are sent; anything else
      // makes a correct verification on their side fail
      const body = JSON.stringify(row.payload);
      const attempts = row.attempts + 1;
      try {
        const res = await this.post(row.endpoint.url, body, {
          "x-resort-signature": signWebhook(body, row.endpoint.secret),
          "x-resort-event": row.event,
          "x-resort-delivery": String(row.id),
        });
        if (res.status >= 200 && res.status < 300) {
          await this.prisma.webhookDelivery.update({
            where: { id: row.id },
            data: { attempts, deliveredAt: new Date(), nextAttemptAt: null, lastStatus: res.status, lastError: null },
          });
          delivered++;
          continue;
        }
        await this.giveUpOrRetry(row.id, attempts, res.status, `answered ${res.status}`);
        failed++;
      } catch (e) {
        await this.giveUpOrRetry(row.id, attempts, null, (e as Error).message);
        failed++;
      }
    }
    return { delivered, failed };
  }

  private async giveUpOrRetry(
    id: bigint,
    attempts: number,
    status: number | null,
    error: string,
  ): Promise<void> {
    const done = attempts >= MAX_ATTEMPTS;
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        lastStatus: status,
        lastError: error.slice(0, 255),
        // null is "nobody will try this again" — a state the panel shows and
        // somebody can act on, rather than a row that quietly stops moving
        nextAttemptAt: done ? null : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    if (done) {
      this.logger.warn(`webhook delivery ${id} given up after ${attempts} attempts: ${error}`);
    }
  }

  /** Sends one again, by hand, once their site is fixed. */
  async retry(resortId: number, id: bigint): Promise<{ queued: true }> {
    const row = await this.prisma.webhookDelivery.findFirst({
      where: { id, endpoint: { resortId } },
      select: { id: true },
    });
    if (!row) throw Object.assign(new Error("No such delivery"), { status: 404 });
    await this.prisma.webhookDelivery.update({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(), deliveredAt: null, attempts: 0 },
    });
    return { queued: true };
  }
}
