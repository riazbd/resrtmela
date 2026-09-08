import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, JwtClaims , formatMoney } from "@rh/shared";
import { requireRoles, forbid, badRequest, isManagement } from "../common/rbac";
import { requireResortAccess } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { PermissionsService } from "../common/permissions";
import { EmailService } from "../notifications/email.service";

@Injectable()
export class EngageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
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
      await this.prisma.user.update({ where: { id: req.userId }, data: { role: "AGENT", status: "active" } });
      const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId: req.userId, resortId: req.resortId } } });
      if (!linked) {
        await this.prisma.userResort.create({ data: { userId: req.userId, resortId: req.resortId, commissionRate: 5 } });
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

  async myEmailCredits(claims: JwtClaims) {
    const row = await this.prisma.emailCredit.upsert({ where: { userId: claims.userId }, update: {}, create: { userId: claims.userId } });
    return { credits: row.credits };
  }

  async purchaseCredits(claims: JwtClaims, credits: number) {
    await this.perms.require(claims, claims.resortIds[0], "marketing.send");
    if (![500, 2000, 10000].includes(credits)) throw badRequest("choose a pack: 500, 2000 or 10000");
    const row = await this.prisma.emailCredit.upsert({
      where: { userId: claims.userId },
      update: { credits: { increment: credits }, purchasedAt: new Date() },
      create: { userId: claims.userId, credits, purchasedAt: new Date() },
    });
    await this.audit.log({ actorId: claims.userId, action: "email.credits.purchase", entity: "email_credit", entityId: Number(row.id), diff: { credits } });
    return { credits: row.credits, added: credits };
  }

  async sendCampaign(
    claims: JwtClaims,
    input: { subject: string; body: string; audience: "RESORT_GUESTS" | "MY_GUESTS" | "AGENTS"; resortId?: number },
  ) {
    await this.perms.require(claims, claims.resortIds[0], "marketing.send");
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

  // ─────────────── agent payment deadline sweep ───────────────

  /** sweep: flag agent bookings whose full-payment deadline is near/past; alert resort admins once per booking per day */
  async sweepPaymentDeadlines() {
    const resorts = await this.prisma.resort.findMany({ where: { status: "active" }, select: { id: true, name: true, agentPaymentHours: true, currency: true, locale: true } });
    const now = new Date();
    for (const resort of resorts) {
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
          id: true, code: true, checkIn: true, discount: true, agentUserId: true,
          items: { select: { qty: true, unitPrice: true } },
          payments: { select: { amount: true, paymentType: true } },
        },
      });
      for (const b of bookings) {
        const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
        const paid = b.payments.filter((p) => p.paymentType !== "REFUND").reduce((s, p) => s + Number(p.amount), 0);
        const due = Math.max(0, rent - Number(b.discount) - paid);
        if (due <= 0) continue;
        // dedupe: one alert per booking per day
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const existing = await this.prisma.notification.findFirst({
          where: {
            kind: "alert",
            link: `/bookings?id=${b.id}`,
            createdAt: { gte: dayStart },
            title: { contains: b.code },
          },
        });
        if (existing) continue;
        const admins = await this.prisma.userResort.findMany({
          where: { resortId: resort.id, user: { role: { in: ["RESORT_ADMIN", "MANAGER"] } } },
          select: { userId: true },
        });
        const hoursLeft = Math.max(0, Math.round((b.checkIn!.getTime() - now.getTime()) / 3_600_000));
        await this.notify(admins.map((a) => a.userId), {
          title: `${b.code} unpaid — ${hoursLeft}h to check-in`,
          body: `Agent booking ${b.code}: ${formatMoney(due, { currency: resort.currency, locale: resort.locale })} due. Full payment needed ${resort.agentPaymentHours}h before check-in, or approve late payment.`,
          kind: "alert",
          link: `/bookings?id=${b.id}`,
          resortId: resort.id,
        });
      }
    }
  }
}

