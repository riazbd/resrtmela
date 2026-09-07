import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, JwtClaims } from "@rh/shared";
import { requireRoles, requireResortAccess, forbid, badRequest } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { DiscountService } from "../common/discount.service";
import { signToken } from "../common/auth.guard";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";

const PLAN_FEES: Record<string, number> = { STARTER: 2500, GROWTH: 5000, CHAIN: 12000 };
const PLAN_LIMITS: Record<string, number> = { STARTER: 10, GROWTH: 40, CHAIN: 10000 };
const TRIAL_DAYS = 14;

const PLAN_SEEDS = [
  { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 10, blurb: "For small resorts getting off spreadsheets", sortOrder: 1 },
  { name: "GROWTH", label: "Growth", monthlyFee: 5000, maxRooms: 40, blurb: "For busy resorts with restaurant & agents", sortOrder: 2 },
  { name: "CHAIN", label: "Chain", monthlyFee: 12000, maxRooms: 10000, blurb: "For multi-resort owners", sortOrder: 3 },
];

/** ensure the three plans exist (first call seeds them) */
async function ensurePlans(prisma: PrismaService) {
  const count = await prisma.platformPlan.count();
  if (count === 0) {
    await prisma.platformPlan.createMany({ data: PLAN_SEEDS as never });
  }
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

@Injectable()
export class PlatformService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(DiscountService) private readonly discounts: DiscountService,
  ) {}

  // ─────────────────── super admin: platform overview ───────────────────

  async overview(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const [resorts, agents, subs, dues, rooms] = await Promise.all([
      this.prisma.resort.findMany({ select: { id: true, name: true, status: true, createdAt: true } }),
      this.prisma.user.findMany({ where: { role: "AGENT" }, select: { status: true } }),
      this.prisma.subscription.findMany({ select: { status: true, monthlyFee: true } }),
      this.prisma.subscriptionDue.findMany({ where: { status: { in: ["DUE", "OVERDUE"] } }, select: { amount: true } }),
      this.prisma.room.count(),
    ]);
    const activeSubs = subs.filter((s) => s.status === "ACTIVE");
    return {
      resorts: {
        total: resorts.length,
        active: resorts.filter((r) => r.status === "active").length,
        suspended: resorts.filter((r) => r.status !== "active").length,
      },
      agents: {
        total: agents.length,
        pending: agents.filter((a) => a.status === "pending").length,
        active: agents.filter((a) => a.status === "active").length,
        suspended: agents.filter((a) => a.status === "suspended").length,
      },
      subscriptions: {
        trial: subs.filter((s) => s.status === "TRIAL").length,
        active: activeSubs.length,
        pastDue: subs.filter((s) => s.status === "PAST_DUE").length,
        cancelled: subs.filter((s) => s.status === "CANCELLED").length,
        mrr: activeSubs.reduce((sum, s) => sum + Number(s.monthlyFee), 0),
      },
      duesOutstanding: dues.reduce((sum, d) => sum + Number(d.amount), 0),
      rooms,
    };
  }

  async allResorts(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    return this.prisma.resort.findMany({
      select: {
        id: true,
        name: true,
        location: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true, plan: true } },
        _count: { select: { rooms: true, bookings: true, guests: true } },
        subscriptions: { orderBy: { id: "desc" }, take: 1, select: { id: true, plan: true, status: true, monthlyFee: true, renewsAt: true } },
        userResorts: {
          where: { user: { role: "RESORT_ADMIN" } },
          take: 1,
          select: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
      orderBy: { id: "asc" },
    });
  }

  async allAgents(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const agents = await this.prisma.user.findMany({
      where: { role: "AGENT" },
      select: {
        id: true, name: true, phone: true, status: true, createdAt: true,
        agentBookings: { select: { id: true, resortId: true } },
        wallet: { select: { balance: true, active: true } },
        resorts: { select: { resort: { select: { id: true, name: true } } } },
      },
      orderBy: { id: "asc" },
    });
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      status: a.status,
      createdAt: a.createdAt,
      bookings: a.agentBookings.length,
      resorts: a.resorts.map((r) => r.resort),
      wallet: a.wallet ? { balance: Number(a.wallet.balance), active: a.wallet.active } : null,
    }));
  }

  async setResortStatus(claims: JwtClaims, resortId: number, status: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    if (!["active", "suspended"].includes(status)) throw badRequest("status must be active|suspended");
    const resort = await this.prisma.resort.update({ where: { id: resortId }, data: { status } });
    await this.audit.log({ actorId: claims.userId, resortId, action: `platform.resort.${status}`, entity: "resort", entityId: resortId });
    return resort;
  }

  /** super admin impersonation: issue a real token for the target user */
  async loginAs(claims: JwtClaims, userId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!user) throw badRequest("user not found");
    if (user.role === "SUPER_ADMIN") throw badRequest("cannot impersonate another super admin");
    if (user.status !== "active") throw badRequest("user account is not active");
    const resortIds = (await this.prisma.userResort.findMany({ where: { userId }, select: { resortId: true } })).map((r) => r.resortId);
    await this.audit.log({ actorId: claims.userId, action: "platform.login_as", entity: "user", entityId: userId, diff: { name: user.name, role: user.role } });
    return {
      accessToken: signToken({ userId: user.id, role: user.role, resortIds }),
      user: { id: user.id, name: user.name, role: user.role, resortIds },
    };
  }

  // ─────────────────── subscriptions ───────────────────

  async setSubscription(
    claims: JwtClaims,
    resortId: number,
    input: { plan: "STARTER" | "GROWTH" | "CHAIN"; monthlyFee?: number; note?: string },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    const def = await this.prisma.platformPlan.findUnique({ where: { name: input.plan } });
    const now = new Date();
    const trialEndsAt = addDays(now, TRIAL_DAYS);
    const sub = await this.prisma.subscription.create({
      data: {
        resortId,
        plan: input.plan,
        status: "TRIAL",
        monthlyFee: input.monthlyFee ?? Number(def?.monthlyFee ?? PLAN_FEES[input.plan] ?? 0),
        trialEndsAt,
        renewsAt: trialEndsAt,
        note: input.note,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "platform.subscription.create", entity: "subscription", entityId: Number(sub.id), diff: input });
    return sub;
  }

  // ── plan definitions ──
  async listPlans(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    return this.prisma.platformPlan.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async updatePlan(claims: JwtClaims, name: string, input: { monthlyFee?: number; maxRooms?: number; label?: string; blurb?: string; active?: boolean }) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    const plan = await this.prisma.platformPlan.update({
      where: { name },
      data: {
        ...(input.monthlyFee != null ? { monthlyFee: input.monthlyFee } : {}),
        ...(input.maxRooms != null ? { maxRooms: input.maxRooms } : {}),
        ...(input.label != null ? { label: input.label } : {}),
        ...(input.blurb != null ? { blurb: input.blurb } : {}),
        ...(input.active != null ? { active: input.active } : {}),
      },
    });
    await this.audit.log({ actorId: claims.userId, action: "platform.plan.update", entity: "platform_plan", entityId: Number(plan.id), diff: input });
    return plan;
  }

  async renewSubscription(claims: JwtClaims, subscriptionId: number, months = 1) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const sub = await this.prisma.subscription.findUnique({ where: { id: BigInt(subscriptionId) } });
    if (!sub) throw badRequest("subscription not found");
    if (sub.status === "CANCELLED") throw badRequest("subscription cancelled — create a new one");
    const base = sub.renewsAt && sub.renewsAt > new Date() ? sub.renewsAt : new Date();
    const renewsAt = addMonths(base, months);
    await this.prisma.subscriptionDue.create({
      data: {
        subscriptionId: sub.id,
        resortId: sub.resortId,
        amount: Number(sub.monthlyFee) * months,
        periodStart: base,
        periodEnd: renewsAt,
        dueDate: renewsAt,
      },
    });
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: sub.status === "TRIAL" ? "ACTIVE" : sub.status, renewsAt },
    });
    await this.audit.log({ actorId: claims.userId, resortId: sub.resortId, action: "platform.subscription.renew", entity: "subscription", entityId: Number(sub.id), diff: { months, renewsAt } });
    return updated;
  }

  async cancelSubscription(claims: JwtClaims, subscriptionId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const sub = await this.prisma.subscription.update({
      where: { id: BigInt(subscriptionId) },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await this.audit.log({ actorId: claims.userId, resortId: sub.resortId, action: "platform.subscription.cancel", entity: "subscription", entityId: subscriptionId });
    return sub;
  }

  async listDues(claims: JwtClaims, filter: { resortId?: number; status?: string }) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    return this.prisma.subscriptionDue.findMany({
      where: {
        ...(filter.resortId ? { resortId: filter.resortId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { subscription: { select: { plan: true, status: true } }, resort: { select: { name: true } } },
      orderBy: { dueDate: "desc" },
      take: 200,
    });
  }

  async payDue(claims: JwtClaims, dueId: number, method?: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const due = await this.prisma.subscriptionDue.findUnique({ where: { id: BigInt(dueId) } });
    if (!due) throw badRequest("due not found");
    if (due.status === "PAID") throw badRequest("already paid");
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.subscriptionDue.update({
        where: { id: due.id },
        data: { status: "PAID", paidAt: new Date(), note: method ? `paid via ${method}` : due.note },
      });
      const openCount = await tx.subscriptionDue.count({ where: { subscriptionId: due.subscriptionId, status: { in: ["DUE", "OVERDUE"] } } });
      if (openCount === 0) {
        await tx.subscription.update({ where: { id: due.subscriptionId }, data: { status: "ACTIVE" } });
      }
      return d;
    });
    await this.audit.log({ actorId: claims.userId, resortId: due.resortId, action: "platform.due.paid", entity: "subscription_due", entityId: Number(due.id), diff: { amount: Number(due.amount), method } });
    return updated;
  }

  /** subscription chart data: renewals & dues on a calendar range */
  async subscriptionCalendar(claims: JwtClaims, from: string, to: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const dues = await this.prisma.subscriptionDue.findMany({
      where: { dueDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
      include: { resort: { select: { id: true, name: true } }, subscription: { select: { plan: true, status: true } } },
      orderBy: { dueDate: "asc" },
    });
    const renewals = await this.prisma.subscription.findMany({
      where: { renewsAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) }, status: { not: "CANCELLED" } },
      include: { resort: { select: { id: true, name: true } } },
      orderBy: { renewsAt: "asc" },
    });
    const byDate = new Map<string, { date: string; dues: number; dueCount: number; renewals: number }>();
    for (const d of dues) {
      const k = d.dueDate.toISOString().slice(0, 10);
      const e = byDate.get(k) ?? { date: k, dues: 0, dueCount: 0, renewals: 0 };
      e.dues += Number(d.amount);
      e.dueCount += 1;
      byDate.set(k, e);
    }
    for (const r of renewals) {
      const k = r.renewsAt!.toISOString().slice(0, 10);
      const e = byDate.get(k) ?? { date: k, dues: 0, dueCount: 0, renewals: 0 };
      e.renewals += 1;
      byDate.set(k, e);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  // ─────────────────── resort users & roles (owner) ───────────────────

  async resortUsers(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const rows = await this.prisma.userResort.findMany({
      where: { resortId },
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true, role: true, status: true, createdAt: true, wallet: { select: { balance: true, active: true } } },
        },
      },
    });
    return rows.map((r) => ({
      ...r.user,
      wallet: r.user.wallet ? { balance: Number(r.user.wallet.balance), active: r.user.wallet.active } : null,
      commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null,
      commissionKind: r.commissionKind,
    }));
  }

  async createResortUser(
    claims: JwtClaims,
    resortId: number,
    input: { name: string; phone: string; password: string; role: string; commissionRate?: number; commissionKind?: string },
  ) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN]);
    if (!["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"].includes(input.role)) {
      throw badRequest("role must be MANAGER | FRONT_DESK | AGENT | HOUSEKEEPING");
    }
    const kind = input.commissionKind === "FLAT" ? "FLAT" : "PERCENT";
    if (kind === "PERCENT" && input.commissionRate != null && (input.commissionRate <= 0 || input.commissionRate > 100)) {
      throw badRequest("percent commission 1-100");
    }
    const phone = input.phone.replace(/\D/g, "");
    const exists = await this.prisma.user.findUnique({ where: { phone } });
    if (exists) throw badRequest("phone already registered");
    const isAgent = input.role === "AGENT";
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        phone,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role as never,
        status: isAgent ? "pending" : "active",
      },
    });
    await this.prisma.userResort.create({
      data: {
        userId: user.id,
        resortId,
        commissionRate: isAgent ? (input.commissionRate ?? 5) : null,
        commissionKind: isAgent ? kind : "PERCENT",
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "user.create", entity: "user", entityId: user.id, diff: { role: input.role, name: input.name, commissionKind: kind } });
    return { id: user.id, name: user.name, phone: user.phone, role: user.role, status: user.status };
  }

  async updateResortUser(
    claims: JwtClaims,
    resortId: number,
    userId: number,
    input: { role?: string; status?: string; password?: string; commissionRate?: number; commissionKind?: string; name?: string },
  ) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN]);
    const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId, resortId } } });
    if (!linked) throw badRequest("user not in this resort");
    const data: Prisma.UserUpdateInput = {};
    if (input.role) {
      if (!["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING", "RESORT_ADMIN"].includes(input.role)) throw badRequest("bad role");
      data.role = input.role as never;
    }
    if (input.status) {
      if (!["active", "pending", "suspended"].includes(input.status)) throw badRequest("bad status");
      data.status = input.status;
    }
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);
    if (input.name) data.name = input.name;
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    if (input.commissionRate != null || input.commissionKind != null) {
      const kind = input.commissionKind === "FLAT" ? "FLAT" : input.commissionKind === "PERCENT" ? "PERCENT" : linked.commissionKind;
      if (kind === "PERCENT" && input.commissionRate != null && (input.commissionRate <= 0 || input.commissionRate > 100)) {
        throw badRequest("percent commission 1-100");
      }
      await this.prisma.userResort.update({
        where: { userId_resortId: { userId, resortId } },
        data: {
          ...(input.commissionRate != null ? { commissionRate: input.commissionRate } : {}),
          commissionKind: kind,
        },
      });
    }
    await this.audit.log({ actorId: claims.userId, resortId, action: "user.update", entity: "user", entityId: userId, diff: { role: input.role, status: input.status, commissionKind: input.commissionKind } });
    return { id: user.id, name: user.name, role: user.role, status: user.status };
  }

  async activityLog(claims: JwtClaims, resortId: number, take = 100) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const rows = await this.prisma.auditLog.findMany({
      where: { resortId },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { id: "desc" },
      take: Math.min(take, 300),
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      actor: r.actor,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId?.toString() ?? null,
      diff: r.diff,
      createdAt: r.createdAt,
    }));
  }

  // ─────────────────── agent activation + wallet ───────────────────

  async setAgentStatus(claims: JwtClaims, resortId: number, agentUserId: number, status: "active" | "suspended" | "pending") {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const agent = await this.prisma.user.findFirst({ where: { id: agentUserId, role: "AGENT" } });
    if (!agent) throw badRequest("not an agent");
    const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId: agentUserId, resortId } } });
    if (!linked) throw badRequest("agent not linked to this resort");
    const updated = await this.prisma.user.update({ where: { id: agentUserId }, data: { status } });
    if (status === "suspended") {
      await this.prisma.wallet.updateMany({ where: { userId: agentUserId }, data: { active: false } });
    }
    if (status === "active") {
      await this.prisma.wallet.updateMany({ where: { userId: agentUserId }, data: { active: true } });
    }
    await this.audit.log({ actorId: claims.userId, resortId, action: `agent.${status}`, entity: "user", entityId: agentUserId });
    return { id: updated.id, name: updated.name, status: updated.status };
  }

  async getWallet(claims: JwtClaims, userId: number) {
    if (claims.userId !== userId && claims.role !== ROLE.SUPER_ADMIN && claims.role !== ROLE.RESORT_ADMIN) {
      throw forbid("not your wallet");
    }
    if (claims.role === ROLE.RESORT_ADMIN) {
      const linked = await this.prisma.userResort.findFirst({ where: { userId, resortId: { in: claims.resortIds } } });
      if (!linked) throw forbid("user not in your resort");
    }
    const wallet = await this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
    const txns = await this.prisma.walletTxn.findMany({ where: { walletId: wallet.id }, orderBy: { id: "desc" }, take: 100 });
    return { balance: Number(wallet.balance), active: wallet.active, txns: txns.map((t) => ({ ...t, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), id: t.id.toString() })) };
  }

  async walletTxn(claims: JwtClaims, userId: number, kind: "TOPUP" | "PAYOUT" | "ADJUST" | "COMMISSION" | "BOOKING_HOLD", amount: number, note?: string, bookingId?: number) {
    if (claims.role !== ROLE.SUPER_ADMIN && claims.role !== ROLE.RESORT_ADMIN) throw forbid("owner only");
    if (claims.role === ROLE.RESORT_ADMIN) {
      const linked = await this.prisma.userResort.findFirst({ where: { userId, resortId: { in: claims.resortIds } } });
      if (!linked) throw forbid("user not in your resort");
    }
    if (!Number.isFinite(amount) || amount === 0) throw badRequest("amount required");
    const signed = kind === "PAYOUT" ? -Math.abs(amount) : kind === "ADJUST" ? amount : Math.abs(amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      if (!wallet.active) throw badRequest("wallet inactive");
      const next = Number(wallet.balance) + signed;
      if (next < 0) throw badRequest("insufficient wallet balance");
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
      return tx.walletTxn.create({
        data: { walletId: wallet.id, kind, amount: signed, balanceAfter: next, note, bookingId },
      });
    });
    await this.audit.log({ actorId: claims.userId, action: `wallet.${kind.toLowerCase()}`, entity: "wallet", entityId: userId, diff: { amount: signed, note } });
    return { ...result, amount: Number(result.amount), balanceAfter: Number(result.balanceAfter), id: result.id.toString() };
  }

  /** owner/agent pays a booking due from the agent's wallet */
  async payFromWallet(claims: JwtClaims, bookingId: number, amount: number) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, resortId: true, agentUserId: true } });
    if (!booking) throw badRequest("booking not found");
    const payer = booking.agentUserId ?? claims.userId;
    if (claims.role === ROLE.AGENT && claims.userId !== payer) throw forbid("not your booking");
    if (claims.role !== ROLE.AGENT) requireResortAccess(claims, booking.resortId);
    const txn = await this.walletTxn(claims, payer, "BOOKING_HOLD", -Math.abs(amount), `payment for booking ${bookingId}`, bookingId);
    // record as payment too
    await this.prisma.payment.create({ data: { bookingId, amount: Math.abs(amount), method: "WALLET_CREDIT", paymentType: "FINAL", receivedById: claims.userId } });
    await this.recomputePaymentState(bookingId);
    return txn;
  }

  private async recomputePaymentState(bookingId: number) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { items: true, payments: true } });
    if (!b) return;
    const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
    const paid = b.payments.filter((p) => p.paymentType !== "REFUND").reduce((s, p) => s + Number(p.amount), 0);
    const due = Math.max(0, rent - Number(b.discount) - paid);
    const state = due === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
    await this.prisma.booking.update({ where: { id: bookingId }, data: { paymentState: state } });
  }

  // ─────────────────── discount offers ───────────────────

  async listDiscounts(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    return this.prisma.discountOffer.findMany({
      where: { resortId },
      include: { roomType: { select: { id: true, name: true } } },
      orderBy: { id: "desc" },
    });
  }

  async createDiscount(
    claims: JwtClaims,
    resortId: number,
    input: { scope: "RESORT" | "ROOM"; roomTypeId?: number; name: string; kind: "PERCENT" | "FLAT"; value: number; validFrom?: string; validTo?: string },
  ) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    if (input.scope === "ROOM" && !input.roomTypeId) throw badRequest("roomTypeId required for ROOM scope");
    if (input.kind === "PERCENT" && (input.value <= 0 || input.value > 100)) throw badRequest("percent 1-100");
    const offer = await this.prisma.discountOffer.create({
      data: {
        resortId,
        scope: input.scope,
        roomTypeId: input.scope === "ROOM" ? input.roomTypeId : null,
        name: input.name,
        kind: input.kind,
        value: input.value,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "discount.create", entity: "discount_offer", entityId: offer.id, diff: input });
    return offer;
  }

  async updateDiscount(claims: JwtClaims, id: number, input: { active?: boolean; value?: number; validFrom?: string; validTo?: string }) {
    const offer = await this.prisma.discountOffer.findUnique({ where: { id } });
    if (!offer) throw badRequest("not found");
    requireResortAccess(claims, offer.resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const updated = await this.prisma.discountOffer.update({
      where: { id },
      data: {
        ...(input.active != null ? { active: input.active } : {}),
        ...(input.value != null ? { value: input.value } : {}),
        ...(input.validFrom ? { validFrom: new Date(input.validFrom) } : {}),
        ...(input.validTo ? { validTo: new Date(input.validTo) } : {}),
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId: offer.resortId, action: "discount.update", entity: "discount_offer", entityId: id, diff: input });
    return updated;
  }

  /** best active discount (absolute BDT) for a rent on a room type, at a date */
  bestDiscountFor(resortId: number, roomTypeId: number | null, rent: number, at: Date): Promise<number> {
    return this.discounts.bestFor(resortId, roomTypeId, rent, at);
  }

  // ─────────────────── api keys + public api ───────────────────

  async listApiKeys(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    return this.prisma.apiKey.findMany({
      where: { resortId },
      select: { id: true, name: true, prefix: true, active: true, lastUsedAt: true, createdAt: true },
      orderBy: { id: "desc" },
    });
  }

  async createApiKey(claims: JwtClaims, resortId: number, name: string) {
    requireResortAccess(claims, resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const secret = randomBytes(24).toString("hex");
    const prefix = `rm_live_${randomBytes(4).toString("hex")}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");
    const row = await this.prisma.apiKey.create({ data: { resortId, name, prefix, keyHash } });
    await this.audit.log({ actorId: claims.userId, resortId, action: "apikey.create", entity: "api_key", entityId: Number(row.id), diff: { name } });
    // full key is shown exactly once
    return { id: row.id.toString(), name: row.name, prefix: row.prefix, key: `${prefix}.${secret}` };
  }

  async revokeApiKey(claims: JwtClaims, id: number) {
    const row = await this.prisma.apiKey.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw badRequest("not found");
    requireResortAccess(claims, row.resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    await this.prisma.apiKey.update({ where: { id: BigInt(id) }, data: { active: false } });
    await this.audit.log({ actorId: claims.userId, resortId: row.resortId, action: "apikey.revoke", entity: "api_key", entityId: id });
    return { ok: true };
  }

  /** returns resortId when the X-Api-Key is valid, else null */
  async authenticateApiKey(rawKey: string | undefined): Promise<number | null> {
    if (!rawKey || !rawKey.includes(".")) return null;
    const [prefix, secret] = rawKey.split(".");
    if (!prefix || !secret) return null;
    const row = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (!row || !row.active) return null;
    const hash = createHash("sha256").update(secret).digest("hex");
    if (hash !== row.keyHash) return null;
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return row.resortId;
  }

  /** guest-style availability for a resort (public API) */
  async publicAvailability(resortId: number, from?: string, to?: string) {
    const roomTypes = await this.prisma.roomType.findMany({
      where: { resortId, active: true },
      include: { rooms: { where: { status: "ACTIVE" } } },
    });
    const overlapping = from && to ? await this.prisma.bookingItem.findMany({
      where: {
        room: { resortId },
        booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null, checkIn: { lt: new Date(to) }, checkOut: { gt: new Date(from) } },
      },
      select: { roomId: true },
    }) : [];
    const busy = new Set(overlapping.map((o) => o.roomId));
    return roomTypes.map((t) => ({
      roomTypeId: t.id,
      name: t.name,
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      extraPersonAllowed: t.extraPersonAllowed,
      extraPersonRate: Number(t.extraPersonRate),
      total: t.rooms.length,
      available: t.rooms.filter((r) => !busy.has(r.id)).length,
      pricePerNight: t.rooms.length ? Number(t.rooms[0]!.baseRate) : null,
    }));
  }

  async publicResort(resortId: number) {
    return this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { id: true, name: true, location: true, checkInTime: true, checkOutTime: true, address: true, website: true, contactPhone: true },
    });
  }

  /** admin approves an agent booking whose full-payment deadline has passed */
  async approveLatePayment(claims: JwtClaims, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, code: true, resortId: true, state: true, agentUserId: true, paymentState: true },
    });
    if (!b) throw badRequest("booking not found");
    requireResortAccess(claims, b.resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    if (!b.agentUserId) throw badRequest("not an agent booking");
    if (!["PENDING", "CONFIRMED"].includes(b.state)) throw badRequest("booking is not active");
    if (b.paymentState === "PAID") throw badRequest("already fully paid");
    if (b.state === "PENDING") {
      await this.prisma.booking.update({ where: { id: b.id }, data: { state: "CONFIRMED" } });
    }
    await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "booking.late_payment_approved", entity: "booking", entityId: bookingId, diff: { code: b.code } });
    await this.prisma.notification.create({
      data: {
        userId: b.agentUserId,
        resortId: b.resortId,
        title: `Late payment approved for ${b.code}`,
        body: "The resort approved your booking despite the missed full-payment deadline. Settle the dues with the guest as agreed.",
        kind: "info",
        link: `/bookings?id=${b.id}`,
      },
    });
    return { ok: true, code: b.code };
  }

  /** email the booking invoice (reuses invoice rendering) */
  async emailInvoice(claims: JwtClaims, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        guest: { select: { fullName: true, email: true, phone: true } },
        resort: { select: { name: true, contactPhone: true, address: true, checkInTime: true, checkOutTime: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
    });
    if (!b) throw badRequest("booking not found");
    requireResortAccess(claims, b.resortId);
    const to = b.guest.email?.trim();
    if (!to) throw badRequest("guest has no email on file");
    const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
    const paid = b.payments.filter((p) => p.paymentType !== "REFUND").reduce((s, p) => s + Number(p.amount), 0);
    const due = Math.max(0, rent - Number(b.discount) - paid);
    const rows = b.items
      .map((i) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${i.room?.name ?? i.itemKind}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${i.qty}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">৳${Number(i.unitPrice).toLocaleString("en-IN")}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">৳${(Number(i.unitPrice) * i.qty).toLocaleString("en-IN")}</td></tr>`)
      .join("");
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;max-width:640px">
        <h2 style="margin:0 0 4px">${b.resort.name}</h2>
        <div style="color:#64748b;font-size:12px;margin-bottom:16px">Invoice for booking ${b.code}${b.invoiceNo ? ` · ${b.invoiceNo}` : ""}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 10px;background:#f1f5f9">Guest</td><td style="padding:6px 10px;background:#f1f5f9">${b.guest.fullName}</td></tr>
          <tr><td style="padding:6px 10px">Stay</td><td style="padding:6px 10px">${b.checkIn?.toISOString().slice(0, 10)} → ${b.checkOut?.toISOString().slice(0, 10)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:14px">
          <tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #cbd5e1">Item</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #cbd5e1">Qty</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #cbd5e1">Rate</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #cbd5e1">Amount</th></tr>
          ${rows}
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
          <tr><td style="padding:4px 10px">Rent</td><td style="padding:4px 10px;text-align:right">৳${rent.toLocaleString("en-IN")}</td></tr>
          <tr><td style="padding:4px 10px">Discount</td><td style="padding:4px 10px;text-align:right">− ৳${Number(b.discount).toLocaleString("en-IN")}</td></tr>
          <tr><td style="padding:4px 10px">Paid</td><td style="padding:4px 10px;text-align:right">৳${paid.toLocaleString("en-IN")}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#ecfdf5">Due</td><td style="padding:6px 10px;text-align:right;font-weight:bold;background:#ecfdf5">৳${due.toLocaleString("en-IN")}</td></tr>
        </table>
        <div style="margin-top:14px;color:#64748b;font-size:12px">Check-in ${b.resort.checkInTime} · Check-out ${b.resort.checkOutTime}${b.resort.contactPhone ? ` · ${b.resort.contactPhone}` : ""}</div>
      </div>`;
    const subjectPrefix = process.env.SMTP_SUBJECT_PREFIX ?? "Resort Mela";
    const r = await this.email.send(to, `${subjectPrefix}: Invoice ${b.code}`, html, b.resort.name);
    await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "invoice.email", entity: "booking", entityId: bookingId, diff: { to } });
    return r;
  }
}
