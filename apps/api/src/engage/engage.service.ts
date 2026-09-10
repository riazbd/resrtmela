import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, JwtClaims , formatMoney } from "@rh/shared";
import { requireRoles, forbid, badRequest, isManagement } from "../common/rbac";
import { requireResortAccess } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { PermissionsService } from "../common/permissions";
import { EmailService } from "../notifications/email.service";
import { PlatformSettingsService, parseCreditPacks, type CreditPack } from "../common/platform-settings.service";

@Injectable()
export class EngageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  // ─────────────── in-app notifications ───────────────

  async notify(userIds: number[], n: { title: string; body?: string; kind?: string; link?: string; resortId?: number }) {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        resortId: n.resortId ?? null,
        title: n.title,
        body: n.body ?? null,
        kind: n.kind ?? "info",
        link: n.link ?? null,
      })),
    });
  }

  async listMine(claims: JwtClaims, take = 50) {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: claims.userId }, orderBy: { id: "desc" }, take: Math.min(take, 100) }),
      this.prisma.notification.count({ where: { userId: claims.userId, readAt: null } }),
    ]);
    return { unread, rows: rows.map((r) => ({ ...r, id: r.id.toString() })) };
  }

  async markRead(claims: JwtClaims, id: string) {
    await this.prisma.notification.updateMany({ where: { id: BigInt(id), userId: claims.userId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(claims: JwtClaims) {
    await this.prisma.notification.updateMany({ where: { userId: claims.userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ─────────────── agent resort discovery & access ───────────────

  async discoverResorts(claims: JwtClaims) {
    const resorts = await this.prisma.resort.findMany({
      where: { status: "active" },
      select: {
        id: true, name: true, location: true,
        roomTypes: { select: { id: true, name: true, maxAdults: true, maxChildren: true }, take: 3 },
        _count: { select: { rooms: true } },
      },
      orderBy: { id: "asc" },
    }).catch(() => []);
    const myAccess = await this.prisma.resortAccess.findMany({ where: { userId: claims.userId } });
    const accessMap = new Map(myAccess.map((a) => [a.resortId, a]));
    const linked = await this.prisma.userResort.findMany({ where: { userId: claims.userId }, select: { resortId: true } });
    const linkedSet = new Set(linked.map((l) => l.resortId));
    const priced = await Promise.all(
      resorts.map(async (r) => {
        const types = await this.prisma.roomType.findMany({
          where: { resortId: r.id, active: true },
          include: { rooms: { where: { status: "ACTIVE" }, select: { baseRate: true } } },
        });
        const prices = types.flatMap((t) => t.rooms.map((room) => Number(room.baseRate)));
        return {
          id: r.id,
          name: r.name,
          location: r.location,
          roomCount: r._count.rooms,
          roomTypeCount: types.length,
          priceFrom: prices.length ? Math.min(...prices) : null,
          access: linkedSet.has(r.id) ? "APPROVED" : (accessMap.get(r.id)?.status ?? null),
        };
      }),
    );
    return priced;
  }

  async requestAccess(claims: JwtClaims, resortId: number, note?: string) {
    const resort = await this.prisma.resort.findUnique({ where: { id: resortId }, select: { id: true, name: true, status: true } });
    if (!resort || resort.status !== "active") throw badRequest("resort not available");
    const linked = await this.prisma.userResort.findFirst({ where: { userId: claims.userId, resortId } });
    if (linked) throw badRequest("you already have access to this resort");
    const existing = await this.prisma.resortAccess.findUnique({ where: { userId_resortId: { userId: claims.userId, resortId } } });
    if (existing && existing.status === "PENDING") throw badRequest("request already pending");
    if (existing && existing.status === "APPROVED") throw badRequest("already approved");
    const req = existing
      ? await this.prisma.resortAccess.update({ where: { id: existing.id }, data: { status: "PENDING", note: note ?? existing.note, decidedAt: null } })
      : await this.prisma.resortAccess.create({ data: { userId: claims.userId, resortId, note: note ?? null } });
    // notify resort admins
    const admins = await this.prisma.userResort.findMany({
      where: { resortId, user: { role: { in: ["RESORT_ADMIN", "MANAGER"] } } },
      select: { userId: true },
    });
    await this.notify(admins.map((a) => a.userId), {
      title: "Agent access request",
      body: `${claims.userId} requested agent access to ${resort.name}.`,
      kind: "request",
      link: `/settings?tab=agent-access`,
      resortId,
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "access.request", entity: "resort_access", entityId: Number(req.id) });
    return req;
  }

  async listAccessRequests(claims: JwtClaims, resortId: number) {
    if (!isManagement(claims.role)) throw forbid("management only");
    requireResortAccess(claims, resortId);
    return this.prisma.resortAccess.findMany({
      where: { resortId },
      include: { user: { select: { id: true, name: true, phone: true, role: true, status: true } } },
      orderBy: { id: "desc" },
      take: 100,
    });
  }

  async decideAccess(claims: JwtClaims, requestId: string, approve: boolean) {
    const req = await this.prisma.resortAccess.findUnique({ where: { id: BigInt(requestId) }, include: { resort: { select: { id: true, name: true } } } });
    if (!req) throw badRequest("request not found");
    if (!isManagement(claims.role)) throw forbid("management only");
    requireResortAccess(claims, req.resortId);
    const updated = await this.prisma.resortAccess.update({
      where: { id: req.id },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date() },
    });
    if (approve) {
      /**
       * Approving an agency to sell here is not a licence to rewrite them.
       *
       * This used to set `role: "AGENT", status: "active"` unconditionally on
       * a global `users` row. So approving a request from someone who manages
       * another resort demoted them platform-wide, and approving one from a
       * suspended account silently un-suspended it — a resort's own approval
       * screen undoing a platform ban.
       */
      const applicant = await this.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
      if (applicant.status === "suspended") {
        throw badRequest("that account is suspended — the platform owner must lift it first");
      }
      if (applicant.role !== "AGENT") {
        if (applicant.role !== "GUEST") {
          throw badRequest("that account is staff at a resort and cannot also be an agency login");
        }
        await this.prisma.user.update({ where: { id: req.userId }, data: { role: "AGENT", status: "active" } });
      }
      const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId: req.userId, resortId: req.resortId } } });
      if (!linked) {
        // the commission is the resort's, set once on Settings -> Agent access
        await this.prisma.userResort.create({ data: { userId: req.userId, resortId: req.resortId } });
      }
    }
    await this.notify([req.userId], {
      title: approve ? "Access approved" : "Access rejected",
      body: approve ? `You now have agent access to ${req.resort.name}. You can book for your clients.` : `Your access request for ${req.resort.name} was rejected.`,
      kind: "request",
      link: approve ? "/agent/discover" : undefined,
      resortId: req.resortId,
    });
    await this.audit.log({ actorId: claims.userId, resortId: req.resortId, action: approve ? "access.approve" : "access.reject", entity: "resort_access", entityId: Number(req.id) });
    return updated;
  }

  // ─────────────── bulk email credits (sender.net style) ───────────────

  /**
   * The balance, and where to send money for more.
   *
   * There is no gateway, so a pack is paid for by hand and approved by the
   * platform afterwards. Showing a price and a button while saying nothing
   * about *how* to pay is the screen leaving out the only step the buyer has
   * to take on their own.
   */
  async myEmailCredits(claims: JwtClaims) {
    const row = await this.prisma.emailCredit.upsert({ where: { userId: claims.userId }, update: {}, create: { userId: claims.userId } });
    return {
      credits: row.credits,
      payTo: await this.settings.str("platform.paymentInstructions", ""),
    };
  }

  /** What the platform is selling today — the console draws its buttons from this. */
  async creditPacks(): Promise<CreditPack[]> {
    return parseCreditPacks(await this.settings.str("email.creditPacks"));
  }

  /**
   * Asks for a pack. Nothing is granted and nothing is charged here.
   *
   * This used to be `purchaseCredits`, and it did both in one call: pressing
   * the button granted the credits and raised a billable charge on the
   * tenant's platform bill. There was no confirmation and no review, so a
   * misclick on the largest pack was a charge of that size, and a resort could
   * raise unlimited charges against itself with nothing in between.
   *
   * The order waits for the platform. `price` is written down now rather than
   * looked up at approval, so what was quoted is what gets charged however the
   * price list moves in between.
   *
   * A `clientRef` makes the submit replayable: a retried request finds its own
   * order instead of queuing a second one.
   */
  async requestCredits(
    claims: JwtClaims,
    credits: number,
    opts: { clientRef?: string } = {},
  ) {
    // the charge has to land on a resort's bill; someone with no resort at all
    // has nowhere to send it
    const resortId = claims.resortIds[0];
    if (resortId == null) throw badRequest("No resort on this account to bill the pack to");
    await this.perms.require(claims, resortId, "marketing.send");
    const packs = await this.creditPacks();
    const pack = packs.find((p) => p.credits === credits);
    if (!pack) {
      throw badRequest(`Choose a pack: ${packs.map((p) => p.credits).join(", ")}`);
    }

    if (opts.clientRef) {
      const seen = await this.prisma.emailCreditOrder.findUnique({
        where: { resortId_clientRef: { resortId, clientRef: opts.clientRef } },
      });
      if (seen) return this.orderView(seen);
    }

    const order = await this.prisma.emailCreditOrder.create({
      data: {
        userId: claims.userId,
        resortId,
        credits,
        price: pack.price as never,
        clientRef: opts.clientRef ?? null,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "email.credits.request",
      entity: "email_credit_order",
      entityId: Number(order.id),
      diff: { credits, price: pack.price },
    });
    return this.orderView(order);
  }

  /** The orders this account has placed, newest first. */
  async myCreditOrders(claims: JwtClaims, take = 20) {
    const rows = await this.prisma.emailCreditOrder.findMany({
      where: { userId: claims.userId },
      orderBy: { id: "desc" },
      take: Math.min(take, 100),
    });
    return rows.map((r) => this.orderView(r));
  }

  /** The platform's queue. */
  async listCreditOrders(claims: JwtClaims, status?: string, take = 100) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const rows = await this.prisma.emailCreditOrder.findMany({
      where: status ? { status } : {},
      orderBy: { id: "desc" },
      take: Math.min(take, 200),
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        resort: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({
      ...this.orderView(r),
      buyer: r.user.name,
      buyerContact: r.user.email ?? r.user.phone ?? "",
      resortName: r.resort.name,
    }));
  }

  /**
   * The platform's decision.
   *
   * Approval is the only moment credits come into being, and it grants them
   * and raises the charge in one transaction — credits with no charge behind
   * them is the platform giving its product away and never knowing.
   */
  async decideCreditOrder(
    claims: JwtClaims,
    orderId: string | number | bigint,
    decision: "APPROVE" | "REJECT",
    /**
     * The platform's rule is that **approval only ever follows payment**: with
     * no gateway, the owner approves once the bKash or the bank transfer has
     * landed, so approving *is* issuing the receipt. `paid` therefore defaults
     * to true, and the console never offers anything else — raising the charge
     * as DUE put money already in hand into the platform's outstanding figure
     * and made the owner settle it a second time in the Dues tab.
     *
     * `paid: false` stays in the API for the one case the rule does not cover:
     * a pack given away, or released on a promise by someone who has decided
     * to. It is deliberately not a button.
     */
    opts: { note?: string; paid?: boolean; method?: string } = {},
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const id = BigInt(orderId);
    const order = await this.prisma.emailCreditOrder.findUnique({ where: { id } });
    if (!order) throw badRequest("credit order not found");
    if (order.status !== "PENDING") {
      throw badRequest(`This order has already been ${order.status.toLowerCase()}.`);
    }

    const now = new Date();
    const paid = opts.paid !== false;
    const method = opts.method?.trim();
    // what the order says afterwards: the reason, or how the money arrived
    const note =
      opts.note?.trim() ||
      (decision === "APPROVE" ? (paid ? `paid by ${method || "hand"}` : "released unpaid") : undefined);

    if (decision === "REJECT") {
      const rejected = await this.prisma.emailCreditOrder.update({
        where: { id },
        data: { status: "REJECTED", decidedById: claims.userId, decidedAt: now, note: note ?? null },
      });
      await this.notify([order.userId], {
        title: "Email credit request declined",
        body: opts.note?.trim()
          ? `${order.credits.toLocaleString("en-IN")} credits — ${opts.note.trim()}`
          : `Your request for ${order.credits.toLocaleString("en-IN")} email credits was not approved.`,
        kind: "request",
        resortId: order.resortId,
        link: "/mailbox",
      });
      await this.audit.log({
        actorId: claims.userId, resortId: order.resortId,
        action: "email.credits.reject", entity: "email_credit_order", entityId: Number(id),
        diff: { credits: order.credits, note: note ?? null },
      });
      return this.orderView(rejected);
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      await tx.emailCredit.upsert({
        where: { userId: order.userId },
        update: { credits: { increment: order.credits }, purchasedAt: now },
        create: { userId: order.userId, credits: order.credits, purchasedAt: now },
      });
      await tx.platformCharge.create({
        data: {
          resortId: order.resortId,
          kind: "EMAIL_CREDITS",
          description: `${order.credits.toLocaleString("en-IN")} email credits`,
          amount: order.price,
          // the order's own identity, so the charge cannot be raised twice
          clientRef: `credit-order:${order.id}`,
          createdById: order.userId,
          status: paid ? "PAID" : "DUE",
          paidAt: paid ? now : null,
          note: note ?? null,
        },
      });
      return tx.emailCreditOrder.update({
        where: { id },
        data: { status: "APPROVED", decidedById: claims.userId, decidedAt: now, note: note ?? null },
      });
    });

    await this.notify([order.userId], {
      title: "Email credits approved",
      body: paid
        ? `${order.credits.toLocaleString("en-IN")} credits are in your account. Payment received — thank you.`
        : `${order.credits.toLocaleString("en-IN")} credits are in your account. The pack is on your platform bill.`,
      kind: "request",
      resortId: order.resortId,
      link: "/mailbox",
    });
    await this.audit.log({
      actorId: claims.userId, resortId: order.resortId,
      action: "email.credits.approve", entity: "email_credit_order", entityId: Number(id),
      diff: { credits: order.credits, price: Number(order.price), paid, method: method ?? null },
    });
    return this.orderView(approved);
  }

  private orderView(o: {
    id: bigint; credits: number; price: unknown; status: string;
    note: string | null; createdAt: Date; decidedAt: Date | null;
  }) {
    return {
      id: o.id.toString(),
      credits: o.credits,
      price: Number(o.price),
      status: o.status,
      note: o.note,
      createdAt: o.createdAt.toISOString(),
      decidedAt: o.decidedAt?.toISOString() ?? null,
    };
  }

  async sendCampaign(
    claims: JwtClaims,
    input: { subject: string; body: string; audience: "RESORT_GUESTS" | "MY_GUESTS" | "AGENTS"; resortId?: number },
  ) {
    /**
     * The permission is checked against the resort being mailed, not the
     * caller's first one.
     *
     * It used to be `claims.resortIds[0]`, while the audience below was read
     * from `input.resortId` and never compared to anything the caller holds.
     * A manager of one resort could therefore name another tenant's id and mail
     * that tenant's entire guest list, From-named as them. The two questions —
     * "may you send" and "send to whom" — have to be asked about the same
     * resort or they are not asking anything.
     */
    if (input.resortId != null) requireResortAccess(claims, input.resortId);
    await this.perms.require(claims, input.resortId ?? claims.resortIds[0], "marketing.send");
    const credit = await this.prisma.emailCredit.findUnique({ where: { userId: claims.userId } });
    if (!credit || credit.credits <= 0) throw badRequest("no email credits — buy a pack first");

    let recipients: { email: string; name?: string }[] = [];
    if (input.audience === "AGENTS") {
      if (!input.resortId || !isManagement(claims.role)) throw badRequest("resortId required for owners");
      const agents = await this.prisma.userResort.findMany({
        where: { resortId: input.resortId, user: { role: "AGENT", email: { not: null } } },
        select: { user: { select: { email: true, name: true } } },
      });
      recipients = agents.map((a) => ({ email: a.user.email!, name: a.user.name }));
    } else if (input.audience === "RESORT_GUESTS") {
      if (!input.resortId || !isManagement(claims.role)) throw badRequest("resortId required for owners");
      const guests = await this.prisma.guest.findMany({
        where: { resortId: input.resortId, email: { not: null } },
        select: { email: true, fullName: true },
        distinct: ["email"],
      });
      recipients = guests.map((g) => ({ email: g.email!, name: g.fullName }));
    } else {
      // MY_GUESTS — guests on the agent's own bookings
      const guests = await this.prisma.guest.findMany({
        where: { bookings: { some: { agentUserId: claims.userId } }, email: { not: null } },
        select: { email: true, fullName: true },
        distinct: ["email"],
      });
      recipients = guests.map((g) => ({ email: g.email!, name: g.fullName }));
    }
    recipients = recipients.filter((r) => /.+@.+\..+/.test(r.email)).slice(0, credit.credits);
    if (recipients.length === 0) throw badRequest("no recipients with email addresses in this audience");

    let fromName: string | undefined;
    if (input.resortId) {
      const resort = await this.prisma.resort.findUnique({ where: { id: input.resortId }, select: { name: true } });
      fromName = resort?.name;
    }
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.7;color:#0f172a">${input.body.replace(/\n/g, "<br/>")}</div>`;
    const listUnsub = `${process.env.WEB_ORIGIN ?? "https://resortmela.rootcodebd.com"}/unsubscribe?u=${claims.userId}&c=${Buffer.from(`${input.subject}`).toString("base64url").slice(0, 24)}`;
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const res = await this.email.send(r.email, input.subject, html, fromName, { listUnsubscribe: listUnsub });
      if (res.sent) sent++;
      else failed++;
    }
    const used = sent + failed;
    await this.prisma.emailCredit.update({ where: { userId: claims.userId }, data: { credits: { decrement: used } } });
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        userId: claims.userId,
        resortId: input.resortId ?? null,
        subject: input.subject,
        body: input.body,
        recipients: sent,
        status: failed === 0 ? "SENT" : sent > 0 ? "PARTIAL" : "FAILED",
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId: input.resortId, action: "email.campaign", entity: "email_campaign", entityId: Number(campaign.id), diff: { subject: input.subject, sent } });
    return { sent, failed, remaining: credit.credits - used, campaignId: campaign.id.toString() };
  }

  async myCampaigns(claims: JwtClaims) {
    const rows = await this.prisma.emailCampaign.findMany({ where: { userId: claims.userId }, orderBy: { id: "desc" }, take: 50 });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }
}

