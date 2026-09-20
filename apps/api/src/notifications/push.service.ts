import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import type { JwtClaims } from "@rh/shared";

/**
 * Telling a phone something happened.
 *
 * Four events, from the design: a new booking, a payment received, a
 * check-in due, and an agent asking for access. Nothing else — a phone
 * that buzzes for everything is a phone with notifications turned off,
 * and then the four that matter are gone too.
 *
 * **Who is told is a permission question, not a role question.** The
 * matrix already answers "may this person see bookings here"; a sender
 * that keeps its own list of who cares will drift from it, and the
 * direction it drifts is one resort's trade arriving on another
 * resort's phone. So every send starts from the token, asks who owns it,
 * and asks the matrix.
 *
 * Delivery is Expo's push service (FCM underneath). It is deliberately
 * fire-and-forget: a booking must not fail because a notification did.
 * What it is not allowed to do is fail *silently* — a dropped receipt is
 * logged, because "nobody got told" and "nobody was meant to be told"
 * look identical from the outside.
 */

/** Expo's endpoint. Not configurable: it is Expo's, not ours. */
const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

/** Expo refuses a batch larger than this. */
const BATCH = 100;

export type PushEvent =
  | "booking.created"
  | "payment.received"
  | "checkin.due"
  | "agent.access.requested";

/** The permission that decides whether an event is this person's business. */
const NEEDS: Record<PushEvent, string> = {
  "booking.created": "bookings.view",
  "payment.received": "payments.view",
  "checkin.due": "bookings.view",
  "agent.access.requested": "settings.manage",
};

export interface PushMessage {
  title: string;
  body: string;
  /** What the app opens when it is tapped. A path, never a URL. */
  path?: string;
}

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
  ) {}

  /**
   * Remember a device.
   *
   * An upsert on the token, not a create: the same phone signing in as a
   * second person must **move** — two rows would keep pushing the first
   * person's resort at whoever is holding it now.
   */
  async register(userId: number, token: string, platform: string) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Forget it.
   *
   * Called on sign-out and not optional. A device that changes hands
   * must stop receiving, and the only moment we reliably know it has
   * left somebody's possession is the moment they sign out of it.
   */
  async forget(userId: number, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  /** Every device of everyone at this resort who may see this kind of thing. */
  private async audience(resortId: number, event: PushEvent, exceptUserId?: number) {
    const staff = await this.prisma.userResort.findMany({
      where: { resortId },
      select: { userId: true, user: { select: { role: true } } },
    });
    const allowed: number[] = [];
    for (const link of staff) {
      if (link.userId === exceptUserId) continue;
      /**
       * Asked per person rather than assumed from a role. A clerk whose
       * permissions were narrowed this morning should stop being told this
       * afternoon, and the matrix is the only thing that knows that.
       *
       * The role goes in the claims because `resolve` reads it: without it
       * a manager with no custom role row resolves to nothing and is never
       * told anything, which is a silence no one would notice.
       */
      const claims = {
        userId: link.userId,
        role: link.user.role,
        resortIds: [resortId],
      } as JwtClaims;
      if (await this.perms.can(claims, resortId, NEEDS[event])) allowed.push(link.userId);
    }
    if (allowed.length === 0) return [];
    return this.prisma.deviceToken.findMany({
      where: { userId: { in: allowed } },
      select: { token: true },
    });
  }

  /**
   * Send, and never throw.
   *
   * Every caller is inside a booking or a payment. A notification that
   * can fail a sale is worse than no notification at all.
   */
  async toResort(
    resortId: number,
    event: PushEvent,
    message: PushMessage,
    opts: { exceptUserId?: number } = {},
  ) {
    try {
      const devices = await this.audience(resortId, event, opts.exceptUserId);
      await this.deliver(devices.map((d) => d.token), message, event);
    } catch (ex) {
      this.log.warn(`[push] ${event} for resort ${resortId} failed: ${(ex as Error).message}`);
    }
  }

  /** The platform's own people — for an agency asking a resort for access. */
  async toUsers(userIds: number[], event: PushEvent, message: PushMessage) {
    try {
      if (userIds.length === 0) return;
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });
      await this.deliver(devices.map((d) => d.token), message, event);
    } catch (ex) {
      this.log.warn(`[push] ${event} to users failed: ${(ex as Error).message}`);
    }
  }

  private async deliver(tokens: string[], message: PushMessage, event: PushEvent) {
    if (tokens.length === 0) return;
    for (let i = 0; i < tokens.length; i += BATCH) {
      const slice = tokens.slice(i, i + BATCH);
      const body = slice.map((to) => ({
        to,
        sound: "default",
        title: message.title,
        body: message.body,
        data: message.path ? { path: message.path } : {},
      }));
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.log.warn(`[push] ${event}: Expo answered ${res.status}`);
        continue;
      }
      /**
       * A token Expo calls dead is deleted, here and now.
       *
       * Otherwise every send carries the same corpses forever, and the
       * batch limit starts being spent on phones that were wiped months
       * ago.
       */
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const dead = (out.data ?? [])
        .map((r, at) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? slice[at] : null))
        .filter((t): t is string => t !== null);
      if (dead.length > 0) {
        await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
        this.log.log(`[push] dropped ${dead.length} token(s) Expo no longer knows`);
      }
    }
  }
}
