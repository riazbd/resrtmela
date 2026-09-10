import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, JwtClaims, isPermissionKey, isPlanFeature, formatMoney, ALL_PERMISSIONS } from "@rh/shared";
import { requireRoles, requireResortAccess, forbid, badRequest } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { DiscountService } from "../common/discount.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { BillingService } from "./billing.service";
import { PlatformSettingsService, SETTING_DEFAULTS, SETTING_MAX_LENGTH, assertSettingParses } from "../common/platform-settings.service";
import { bookingTotals } from "../common/money";
import { round2 } from "../common/dates";
import { PermissionsService, ensureResortRoles, validPermissions, ADMIN_ROLE } from "../common/permissions";
import { signToken } from "../common/auth.guard";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";

/**
 * Starting plans for a brand-new platform. They are a seed, not a definition:
 * once a row exists it belongs to the super admin, who edits it in
 * Platform -> Plans. Nothing here ever writes over an existing row again --
 * the old backfill reset maxResorts on every call, silently undoing edits.
 */
const PLAN_SEEDS = [
  { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 10, maxResorts: 1, trialDays: 14, blurb: "For small resorts getting off spreadsheets", sortOrder: 1 },
  { name: "GROWTH", label: "Growth", monthlyFee: 5000, maxRooms: 40, maxResorts: 2, trialDays: 14, blurb: "For busy resorts with restaurant & agents", sortOrder: 2 },
  { name: "CHAIN", label: "Chain", monthlyFee: 12000, maxRooms: 10000, maxResorts: 10, trialDays: 14, blurb: "For multi-resort owners", sortOrder: 3 },
];

/** Seeds the starting plans on an empty platform. Never edits existing rows. */
async function ensurePlans(prisma: PrismaService) {
  if ((await prisma.platformPlan.count()) === 0) {
    await prisma.platformPlan.createMany({ data: PLAN_SEEDS as never });
  }
}

export interface PlanInput {
  name: string;
  label: string;
  monthlyFee: number;
  maxRooms: number;
  maxResorts: number;
  trialDays: number;
  /** Keys from `PLAN_FEATURES` — what this plan includes. */
  features?: string[];
  maxStaff?: number;
  blurb?: string | null;
  sortOrder?: number;
  active?: boolean;
  /** The one plan the pricing page recommends. */
  highlight?: boolean;
}

/** Every field optional, plus `name` so a rename can be refused rather than ignored. */
export type PlanPatch = Partial<PlanInput>;

/**
 * A plan name is typed once and lived with.
 *
 * It travels in the URL of `PATCH /platform/plans/:name`, it is what
 * `Subscription.plan` stores, and that column is VarChar(16). Upper case with
 * underscores is what the seeds established and what every screen prints as a
 * badge.
 */
const PLAN_NAME = /^[A-Z][A-Z0-9_]{1,15}$/;

/**
 * What the columns can actually hold.
 *
 * Plans used to be seeded in code, where the only author was a developer
 * reading the schema. They are typed into a form now, so every bound the
 * database implies has to be said out loud and refused politely — the
 * alternative is a truncated label or a 500 from the driver, depending on the
 * server's strict mode. The price list already learned that lesson the
 * expensive way, silently saving 255 characters of itself.
 */
const PLAN_BOUNDS = {
  label: 40, // VarChar(40)
  blurb: 200, // VarChar(200)
  monthlyFee: 99_999_999.99, // Decimal(10,2)
  maxRooms: 100_000,
  maxResorts: 1_000,
  maxStaff: 10_000,
  trialDays: 365,
  sortOrder: 9_999,
};

function assertWholeNumber(value: number, field: string, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} must be a whole number between ${min} and ${max}`);
  }
}

function assertPlanFields(input: PlanPatch, { creating }: { creating: boolean }) {
  if (creating) {
    if (!input.name || !PLAN_NAME.test(input.name)) {
      throw badRequest("Plan name must be 2–16 characters, A–Z, 0–9 or _, starting with a letter (e.g. SEASON)");
    }
    for (const required of ["label", "monthlyFee", "maxRooms", "maxResorts", "trialDays"] as const) {
      if (input[required] == null) throw badRequest(`${required} is required`);
    }
  }

  if (input.label != null) {
    const label = input.label.trim();
    if (!label) throw badRequest("A plan needs a label — it is the name customers read");
    if (label.length > PLAN_BOUNDS.label) throw badRequest(`Label must be ${PLAN_BOUNDS.label} characters or fewer`);
  }
  if (input.blurb != null && input.blurb.length > PLAN_BOUNDS.blurb) {
    throw badRequest(`Blurb must be ${PLAN_BOUNDS.blurb} characters or fewer`);
  }
  if (input.monthlyFee != null) {
    const fee = input.monthlyFee;
    if (!Number.isFinite(fee) || fee < 0 || fee > PLAN_BOUNDS.monthlyFee) {
      throw badRequest(`Monthly fee must be between 0 and ${PLAN_BOUNDS.monthlyFee}`);
    }
    if (Math.round(fee * 100) !== fee * 100) throw badRequest("Monthly fee cannot be finer than a paisa");
  }
  if (input.features != null) {
    if (!Array.isArray(input.features)) throw badRequest("Features must be a list");
    /**
     * A key the code has never heard of gates nothing, so storing one would
     * sell a lock with no door — the owner unticks the box, the card stops
     * promising it, and the customer carries on using it. Same reasoning as
     * `sanitizePermissions`, and the same vocabulary discipline.
     */
    const unknown = input.features.filter((k) => !isPlanFeature(k));
    if (unknown.length) throw badRequest(`Not a feature this platform can switch on: ${unknown.join(", ")}`);
  }
  // a plan that sells no rooms sells nothing; a plan for no resorts reaches nobody
  if (input.maxRooms != null) assertWholeNumber(input.maxRooms, "Room limit", 1, PLAN_BOUNDS.maxRooms);
  if (input.maxStaff != null) assertWholeNumber(input.maxStaff, "Staff limit", 1, PLAN_BOUNDS.maxStaff);
  if (input.maxResorts != null) assertWholeNumber(input.maxResorts, "Resort limit", 1, PLAN_BOUNDS.maxResorts);
  // zero is a plan with no free trial, which is a real choice
  if (input.trialDays != null) assertWholeNumber(input.trialDays, "Trial length", 0, PLAN_BOUNDS.trialDays);
  if (input.sortOrder != null) assertWholeNumber(input.sortOrder, "Sort order", 0, PLAN_BOUNDS.sortOrder);
}

/**
 * What may move through an agency's wallet.
 *
 * Deliberately short. The wallet is the agency's account with the *platform* —
 * money handed over, money handed back, and a correction when someone gets it
 * wrong. `COMMISSION` and `BOOKING_HOLD` are in the database enum because rows
 * were written with them, and are refused here: both describe money between an
 * agency and a resort, which those two settle between themselves.
 */
export const WALLET_KINDS = ["TOPUP", "PAYOUT", "ADJUST"] as const;
export type WalletKindName = (typeof WALLET_KINDS)[number];

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
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  // ─────────────────── super admin: platform overview ───────────────────

  async overview(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const [resorts, agents, subs, dues, rooms] = await Promise.all([
      this.prisma.resort.findMany({ select: { id: true, name: true, status: true, createdAt: true } }),
      this.prisma.user.findMany({ where: { role: "AGENT" }, select: { status: true } }),
      this.prisma.subscription.findMany({ select: { status: true, monthlyFee: true } }),
      this.prisma.subscriptionDue.findMany({ where: { status: { in: ["DUE", "OVERDUE"] } }, select: { amount: true } }),
      this.prisma.room.count({ where: { deletedAt: null } }),
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

  async setResortStatus(claims: JwtClaims, resortId: number, status: string, reason?: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    if (!["active", "suspended"].includes(status)) throw badRequest("status must be active|suspended");
    // A human suspension is recorded as such, so the billing sweep never lifts
    // it on the next payment -- and a human reactivation clears the mark, which
    // is how the super admin overrides a billing suspension.
    const resort = await this.prisma.resort.update({
      where: { id: resortId },
      data:
        status === "active"
          ? { status, suspendedReason: null, suspendedAt: null }
          : { status, suspendedReason: (reason ?? "manual").slice(0, 32), suspendedAt: new Date() },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: `platform.resort.${status}`, entity: "resort", entityId: resortId, diff: reason ? { reason } : undefined });
    return resort;
  }

  // ─────────────────── platform policy ───────────────────

  /** Commercial terms the super admin owns: billing windows, notice periods, platform identity. */
  async getSettings(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    return this.settings.all();
  }

  async updateSettings(claims: JwtClaims, patch: Record<string, string>) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const keys = Object.keys(patch);
    if (keys.length === 0) throw badRequest("nothing to update");
    /**
     * Values used to be sliced to 255 before writing, to fit a VARCHAR that is
     * now TEXT. Some settings are JSON, so the slice cut a price list of more
     * than about eight packs mid-object; `parseCreditPacks` fell back to the
     * shipped prices and the platform sold at rates the owner never set, with
     * the save reported as successful. Nothing is truncated now — a value too
     * long to store is refused, and a JSON setting is parsed here rather than
     * failing silently at read time.
     */
    for (const key of keys) {
      if (!(key in SETTING_DEFAULTS)) throw badRequest(`Unknown setting "${key}"`);
      const value = String(patch[key] ?? "");
      if (value.length > SETTING_MAX_LENGTH) {
        throw badRequest(`"${key}" is too long (${value.length} characters, limit ${SETTING_MAX_LENGTH}).`);
      }
      assertSettingParses(key, value);
      await this.settings.set(key, value);
    }
    await this.audit.log({ actorId: claims.userId, action: "platform.settings.update", entity: "platform_setting", diff: patch });
    return this.settings.all();
  }

  /**
   * Run the billing sweep now. It runs hourly on its own; this exists so the
   * super admin can see the effect of a policy change immediately instead of
   * waiting, and so a support call can be answered with a fact.
   */
  async runBillingSweep(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const result = await this.billing.sweep();
    await this.audit.log({ actorId: claims.userId, action: "platform.billing.sweep", entity: "subscription", diff: result });
    return result;
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
    input: { plan: string; monthlyFee?: number; note?: string; trialDays?: number },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    // one resort's terms, held to the same bounds as the plan's own
    if (input.trialDays != null) {
      assertWholeNumber(input.trialDays, "Trial length", 0, PLAN_BOUNDS.trialDays);
    }
    // the plan table is the authority: a plan added there works with no deploy
    const def = await this.prisma.platformPlan.findUnique({ where: { name: input.plan } });
    if (!def) throw badRequest(`Unknown plan "${input.plan}"`);
    if (!def.active) throw badRequest(`Plan "${def.label}" is not available`);
    const now = new Date();

    /**
     * A resort has one live subscription, and changing plan changes it.
     *
     * This used to create a new row in TRIAL every time and never cancel the
     * old one. So changing plan restarted the free trial — a way to never
     * pay — and once the second trial ended the billing sweep, which walks
     * every ACTIVE and PAST_DUE subscription, invoiced the resort twice a
     * month. MRR counted both too.
     *
     * A resort that has already started paying keeps paying: only a genuinely
     * new subscription gets a trial. The old row is cancelled rather than
     * deleted, because what a resort used to pay is a thing to be able to say.
     */
    const existing = await this.prisma.subscription.findFirst({
      where: { resortId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      orderBy: { id: "desc" },
    });

    const monthlyFee = input.monthlyFee ?? Number(def.monthlyFee);
    const sub = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: { status: "CANCELLED", cancelledAt: now },
        });
      }
      // a trial is for someone who has not had one; a paying resort changing
      // plan carries its dates and its status across
      const fresh = !existing || existing.status === "TRIAL";

      /**
       * How long this resort's trial runs, and whether it has one at all.
       *
       * The plan's length is the offer; `input.trialDays` is the owner giving
       * one customer different terms, the way `monthlyFee` already could.
       *
       * Zero means no trial, and that has to mean ACTIVE from the start rather
       * than a TRIAL whose end date is already behind it. The money was right
       * either way — the sweep bills from `trialEndsAt` — but the resort's own
       * subscription page read "Trial, ends today" until the next hourly sweep
       * corrected it, which is a strange thing to show someone who is paying.
       * `renewsAt: now` puts them in front of `raiseRenewals` instead, which
       * raises the first bill for a period starting today.
       */
      const trialDays = input.trialDays ?? def.trialDays;
      const onTrial = fresh && trialDays > 0;
      const trialEndsAt = fresh ? (onTrial ? addDays(now, trialDays) : null) : existing.trialEndsAt;

      const status = fresh ? (onTrial ? "TRIAL" : "ACTIVE") : existing.status;
      const renewsAt = fresh ? (onTrial ? trialEndsAt : now) : existing.renewsAt;

      return tx.subscription.create({
        data: {
          resortId,
          plan: input.plan,
          status,
          monthlyFee,
          startedAt: existing?.startedAt ?? now,
          trialEndsAt,
          renewsAt,
          note: input.note,
        },
      });
    });
    await this.audit.log({
      actorId: claims.userId, resortId,
      action: existing ? "platform.subscription.change" : "platform.subscription.create",
      entity: "subscription", entityId: Number(sub.id),
      diff: { ...input, from: existing?.plan ?? null, replaced: existing ? Number(existing.id) : null },
    });
    return sub;
  }

  // ── plan definitions ──
  async listPlans(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    return this.prisma.platformPlan.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async createPlan(claims: JwtClaims, input: PlanInput) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);
    assertPlanFields(input, { creating: true });

    if (await this.prisma.platformPlan.findUnique({ where: { name: input.name } })) {
      throw badRequest(`A plan named ${input.name} already exists`);
    }

    const plan = await this.prisma.platformPlan.create({
      data: {
        name: input.name,
        label: input.label,
        monthlyFee: input.monthlyFee as never,
        maxRooms: input.maxRooms,
        maxResorts: input.maxResorts,
        maxStaff: input.maxStaff ?? 1,
        trialDays: input.trialDays,
        features: (input.features ?? []) as never,
        blurb: input.blurb?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
        highlight: input.highlight ?? false,
      },
    });
    if (input.highlight) await this.featureOnly(plan.name);
    await this.audit.log({ actorId: claims.userId, action: "platform.plan.create", entity: "platform_plan", entityId: Number(plan.id), diff: input as never });
    return plan;
  }

  async updatePlan(claims: JwtClaims, name: string, input: PlanPatch) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);

    /**
     * The name is the one thing that cannot move.
     *
     * `Subscription.plan` holds it as a string rather than a foreign key, so a
     * rename does not cascade anywhere — it silently orphans every resort on
     * the plan, and the next billing sweep finds no plan to price them by. The
     * label is what a customer reads and changes freely.
     */
    if (input.name != null && input.name !== name) {
      throw badRequest("A plan's name is fixed — subscriptions point at it by name. Change the label instead.");
    }
    assertPlanFields(input, { creating: false });

    const plan = await this.prisma.platformPlan.update({
      where: { name },
      data: {
        ...(input.monthlyFee != null ? { monthlyFee: input.monthlyFee as never } : {}),
        ...(input.maxRooms != null ? { maxRooms: input.maxRooms } : {}),
        ...(input.maxResorts != null ? { maxResorts: input.maxResorts } : {}),
        ...(input.maxStaff != null ? { maxStaff: input.maxStaff } : {}),
        ...(input.trialDays != null ? { trialDays: input.trialDays } : {}),
        ...(input.features != null ? { features: input.features as never } : {}),
        ...(input.label != null ? { label: input.label } : {}),
        ...(input.blurb != null ? { blurb: input.blurb.trim() || null } : {}),
        ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
        ...(input.active != null ? { active: input.active } : {}),
        ...(input.highlight != null ? { highlight: input.highlight } : {}),
      },
    });
    if (input.highlight) await this.featureOnly(name);
    await this.audit.log({ actorId: claims.userId, action: "platform.plan.update", entity: "platform_plan", entityId: Number(plan.id), diff: input as never });
    return plan;
  }

  /**
   * "Most popular" means most popular, so only one plan may wear it.
   *
   * Enforced here rather than by a unique index: the rule is "at most one row
   * is true", which a UNIQUE column can only express by storing NULL for false
   * — and then a row means true, false, or nothing, which is one meaning too
   * many.
   */
  private async featureOnly(name: string) {
    await this.prisma.platformPlan.updateMany({
      where: { name: { not: name }, highlight: true },
      data: { highlight: false },
    });
  }

  /**
   * Delete a plan, or be told to retire it.
   *
   * The same shape as retiring a room, and for the same reason: a row that
   * anything else points at is history, not clutter. A subscription names its
   * plan by string, so deleting a plan somebody bought leaves that string
   * pointing at nothing — including a cancelled subscription, which is the
   * record of what they used to pay and has to stay readable.
   */
  async deletePlan(claims: JwtClaims, name: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    await ensurePlans(this.prisma);

    const plan = await this.prisma.platformPlan.findUnique({ where: { name } });
    if (!plan) throw badRequest("No such plan");

    const sold = await this.prisma.subscription.count({ where: { plan: name } });
    if (sold > 0) {
      throw badRequest(
        `${sold} subscription(s) name this plan. Retire it instead — it leaves the public page and its customers stay where they are.`,
      );
    }
    if ((await this.prisma.platformPlan.count()) <= 1) {
      // `ensurePlans` re-seeds an empty table, so the last deletion would
      // resurrect STARTER, GROWTH and CHAIN at prices the owner had rejected
      throw badRequest("A platform needs at least one plan to sell.");
    }

    await this.prisma.platformPlan.delete({ where: { name } });
    await this.audit.log({ actorId: claims.userId, action: "platform.plan.delete", entity: "platform_plan", entityId: Number(plan.id), diff: { name } });
    return { deleted: true as const, name };
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
      // the generated column frees the live slot on its own
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

  /**
   * What every tenant owes, subscription and one-off together.
   *
   * They were separate answers before there was anywhere to put a one-off
   * charge: the monthly dues were a table and an email credit pack was a line
   * in the audit log. Two places to look is one place to forget.
   */
  async outstanding(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const OPEN = ["DUE", "OVERDUE"];

    const [dues, charges, resorts] = await Promise.all([
      this.prisma.subscriptionDue.groupBy({
        by: ["resortId"],
        where: { status: { in: OPEN } },
        _sum: { amount: true },
      }),
      this.prisma.platformCharge.groupBy({
        by: ["resortId"],
        where: { status: { in: OPEN } },
        _sum: { amount: true },
      }),
      this.prisma.resort.findMany({ select: { id: true, name: true } }),
    ]);

    const name = new Map(resorts.map((r) => [r.id, r.name]));
    const ids = new Set([...dues.map((d) => d.resortId), ...charges.map((c) => c.resortId)]);
    const dueBy = new Map(dues.map((d) => [d.resortId, round2(Number(d._sum.amount ?? 0))]));
    const chargeBy = new Map(charges.map((c) => [c.resortId, round2(Number(c._sum.amount ?? 0))]));

    return [...ids]
      .map((resortId) => {
        const subscriptions = dueBy.get(resortId) ?? 0;
        const oneOff = chargeBy.get(resortId) ?? 0;
        return {
          resortId,
          resort: name.get(resortId) ?? `#${resortId}`,
          subscriptions,
          charges: oneOff,
          total: round2(subscriptions + oneOff),
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /** Settles a one-off charge. The subscription's own dues are payDue's job. */
  async payCharge(claims: JwtClaims, chargeId: number, method?: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const charge = await this.prisma.platformCharge.findUnique({ where: { id: BigInt(chargeId) } });
    if (!charge) throw badRequest("charge not found");
    if (charge.status === "PAID") throw badRequest("already paid");

    const updated = await this.prisma.platformCharge.update({
      where: { id: charge.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        note: method ? `paid via ${method}` : charge.note,
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId: charge.resortId,
      action: "platform.charge.paid",
      entity: "platform_charge",
      entityId: Number(charge.id),
      diff: { amount: Number(charge.amount), method },
    });
    return { ...updated, id: Number(updated.id), amount: Number(updated.amount) };
  }

  /** Every one-off charge, newest first — the invoice queue. */
  async charges(claims: JwtClaims, query: { resortId?: number; status?: string } = {}) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const rows = await this.prisma.platformCharge.findMany({
      where: {
        ...(query.resortId ? { resortId: query.resortId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { resort: { select: { id: true, name: true } } },
      orderBy: { id: "desc" },
      take: 300,
    });
    return rows.map((c) => ({
      id: Number(c.id),
      resort: c.resort,
      kind: c.kind,
      description: c.description,
      amount: Number(c.amount),
      status: c.status,
      paidAt: c.paidAt,
      createdAt: c.createdAt,
    }));
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
    // A tenant who has just paid should be working again before they can close
    // the receipt -- not at whenever the next sweep happens to run.
    const openForResort = await this.prisma.subscriptionDue.count({
      where: { resortId: due.resortId, status: { in: ["DUE", "OVERDUE"] } },
    });
    if (openForResort === 0) await this.billing.reactivate(due.resortId);
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
    await this.perms.require(claims, resortId, "users.manage");
    const rows = await this.prisma.userResort.findMany({
      /**
       * The platform is not a member of anybody's staff.
       *
       * A super admin's account is linked to a resort — that is how they get an
       * active resort at all — so this returned "Platform Owner" inside the
       * resort's own team list, with a role the resort did not grant. The list
       * is what the resort manages, and anything on it looks like theirs to
       * change.
       */
      where: { resortId, user: { role: { not: "SUPER_ADMIN" } } },
      include: {
        user: {
          // no wallet here: it is the agency's account with the platform, and
          // a resort reading it was reading the agency's trade with everyone else
          select: { id: true, name: true, phone: true, email: true, role: true, status: true, createdAt: true },
        },
        role: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({
      ...r.user,
      roleId: r.roleId,
      roleName: r.role?.name ?? null,
    }));
  }

  async createResortUser(
    claims: JwtClaims,
    resortId: number,
    /**
     * No commission here any more. It was a per-agent field, so two agents
     * selling the same room could earn different money on it; the rate is the
     * resort's now, on Settings -> Agent access, and `CommissionService` is the
     * only thing that sets it.
     */
    input: { name: string; phone: string; password: string; role: string; roleId?: number },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "users.manage");
    if (!["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"].includes(input.role)) {
      throw badRequest("role must be MANAGER | FRONT_DESK | AGENT | HOUSEKEEPING");
    }
    if (input.roleId != null) {
      const role = await this.prisma.customRole.findUnique({ where: { id: input.roleId } });
      if (!role || role.resortId !== resortId) throw badRequest("role not found in this resort");
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
      data: { userId: user.id, resortId, roleId: input.roleId },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "user.create", entity: "user", entityId: user.id, diff: { role: input.role, name: input.name, roleId: input.roleId } });
    return { id: user.id, name: user.name, phone: user.phone, role: user.role, status: user.status };
  }

  async updateResortUser(
    claims: JwtClaims,
    resortId: number,
    userId: number,
    input: { role?: string; status?: string; password?: string; name?: string; roleId?: number },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "users.manage");
    const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId, resortId } } });
    if (!linked) throw badRequest("user not in this resort");

    /**
     * This route is resort-scoped; the row it writes is not.
     *
     * `users` is global — one person, one row, however many resorts they work
     * at. Only a link to *this* resort was ever checked, so a `users.manage`
     * holder could reset the password, flip the role or suspend the account of
     * someone who also works for another tenant, and own that tenant's account
     * on the next login. Changing what the person is stays with the platform
     * when the person is not this resort's alone; naming them and giving them
     * a role inside this resort does not.
     */
    const account = input.role != null || input.status != null || input.password != null;
    if (account && claims.role !== ROLE.SUPER_ADMIN) {
      const elsewhere = await this.prisma.userResort.count({
        where: { userId, resortId: { not: resortId } },
      });
      if (elsewhere > 0) {
        throw forbid("This person also works at another resort — only the platform owner can change their account");
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.role) {
      // the same list `createResortUser` accepts. RESORT_ADMIN resolves to
      // ["*"], so allowing it only on update was a way to make an owner out of
      // a colleague in two calls rather than one.
      const allowed = ["MANAGER", "FRONT_DESK", "AGENT", "HOUSEKEEPING"];
      if (claims.role === ROLE.SUPER_ADMIN) allowed.push("RESORT_ADMIN");
      if (!allowed.includes(input.role)) throw badRequest("bad role");
      data.role = input.role as never;
    }
    if (input.status) {
      if (!["active", "pending", "suspended"].includes(input.status)) throw badRequest("bad status");
      data.status = input.status;
    }
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);
    if (input.name) data.name = input.name;
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    if (input.roleId != null) {
      if (input.roleId === 0) {
        await this.prisma.userResort.update({ where: { userId_resortId: { userId, resortId } }, data: { roleId: null } });
      } else {
        const role = await this.prisma.customRole.findUnique({ where: { id: input.roleId } });
        if (!role || role.resortId !== resortId) throw badRequest("role not found in this resort");
        await this.prisma.userResort.update({ where: { userId_resortId: { userId, resortId } }, data: { roleId: input.roleId } });
      }
    }
    await this.audit.log({ actorId: claims.userId, resortId, action: "user.update", entity: "user", entityId: userId, diff: { role: input.role, status: input.status, roleId: input.roleId } });
    return { id: user.id, name: user.name, role: user.role, status: user.status };
  }

  async activityLog(claims: JwtClaims, resortId: number, take = 100, q?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "auditlog.view");
    const search = q?.trim();
    const rows = await this.prisma.auditLog.findMany({
      where: {
        resortId,
        ...(search
          ? {
              OR: [
                { action: { contains: search } },
                { entity: { contains: search } },
                { actor: { name: { contains: search } } },
                { actor: { phone: { contains: search } } },
                { actor: { email: { contains: search } } },
              ],
            }
          : {}),
      },
      include: { actor: { select: { id: true, name: true, role: true, phone: true } } },
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

  /** owner can delete activity entries (permission: activities.delete) */
  async deleteActivity(claims: JwtClaims, id: string) {
    if (!/^\d+$/.test(id)) throw badRequest("bad id");
    const row = await this.prisma.auditLog.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw badRequest("activity not found");

    /**
     * A row with no resort is the platform's own history — a tenant created, a
     * plan changed, an owner impersonated. The old code skipped the resort
     * check entirely for exactly those rows and then resolved the permission
     * against `claims.resortIds[0]`, so any resort admin could erase them.
     *
     * The permission it asked for, `activities.delete`, is not a key that
     * exists: `validPermissions` strips it, so it could never be granted and
     * the guard was really "are you an admin". The key in the matrix — the one
     * the settings screen shows an owner — is `auditlog.delete`.
     */
    if (row.resortId == null) {
      requireRoles(claims, [ROLE.SUPER_ADMIN]);
    } else {
      requireResortAccess(claims, row.resortId);
      await this.perms.require(claims, row.resortId, "auditlog.delete");
    }
    await this.prisma.auditLog.delete({ where: { id: BigInt(id) } });
    // an audit trail whose deletions leave no trace is not an audit trail
    await this.audit.log({
      actorId: claims.userId,
      resortId: row.resortId ?? undefined,
      action: "auditlog.delete",
      entity: "auditLog",
      entityId: Number(row.id),
      diff: { action: row.action, entity: row.entity, entityId: row.entityId?.toString() ?? null, at: row.createdAt },
    });
    return { deleted: true };
  }

  // ─────────────────── permission roles (Paradox-style matrix) ───────────────────

  async listRoles(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await ensureResortRoles(this.prisma, resortId);
    const rows = await this.prisma.customRole.findMany({
      where: { resortId },
      include: { _count: { select: { users: true } } },
      orderBy: [{ system: "desc" }, { id: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      system: r.system,
      users: r._count.users,
      // what it resolves to, not what was written down years ago
      permissions:
        r.system && r.name === ADMIN_ROLE
          ? ALL_PERMISSIONS
          : Array.isArray(r.permissions)
            ? (r.permissions as string[])
            : [],
    }));
  }

  async createRole(claims: JwtClaims, resortId: number, name: string, permissions: string[]) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "roles.manage");
    const perms = validPermissions(permissions);
    if (!name.trim()) throw badRequest("role name required");
    const role = await this.prisma.customRole.create({ data: { resortId, name: name.trim(), permissions: perms } });
    await this.audit.log({ actorId: claims.userId, resortId, action: "role.create", entity: "role", entityId: role.id, diff: { name, perms: perms.length } });
    return { id: role.id, name: role.name, system: role.system, users: 0, permissions: perms };
  }

  async updateRole(claims: JwtClaims, id: number, input: { name?: string; permissions?: string[] }) {
    const role = await this.prisma.customRole.findUnique({ where: { id } });
    if (!role) throw badRequest("role not found");
    requireResortAccess(claims, role.resortId);
    await this.perms.require(claims, role.resortId, "roles.manage");
    /**
     * Administrator resolves to `*`, so its stored list decides nothing.
     * Letting it be edited would be a matrix full of boxes that change no
     * behaviour — worse than no boxes, because it reads as control.
     */
    if (role.system && role.name === ADMIN_ROLE && input.permissions != null) {
      throw badRequest(
        "Administrator always holds every permission. Create a role of your own for anything narrower.",
      );
    }
    const data: { name?: string; permissions?: string[] } = {};
    if (input.name?.trim()) data.name = input.name.trim();
    if (input.permissions != null) data.permissions = validPermissions(input.permissions);
    const updated = await this.prisma.customRole.update({ where: { id }, data });
    await this.audit.log({ actorId: claims.userId, resortId: role.resortId, action: "role.update", entity: "role", entityId: id, diff: input });
    return { id: updated.id, name: updated.name, system: updated.system, permissions: Array.isArray(updated.permissions) ? (updated.permissions as string[]) : [] };
  }

  async deleteRole(claims: JwtClaims, id: number) {
    const role = await this.prisma.customRole.findUnique({ where: { id } });
    if (!role) throw badRequest("role not found");
    requireResortAccess(claims, role.resortId);
    await this.perms.require(claims, role.resortId, "roles.manage");
    if (role.system) throw badRequest("system roles cannot be deleted");
    const userCount = await this.prisma.userResort.count({ where: { roleId: id } });
    if (userCount > 0) throw badRequest(`${userCount} user(s) still use this role — reassign them first`);
    await this.prisma.customRole.delete({ where: { id } });
    await this.audit.log({ actorId: claims.userId, resortId: role.resortId, action: "role.delete", entity: "role", entityId: id, diff: { name: role.name } });
    return { deleted: true };
  }

  // ─────────────────── agent activation + wallet ───────────────────

  async setAgentStatus(claims: JwtClaims, resortId: number, agentUserId: number, status: "active" | "suspended" | "pending") {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "agents.manage");
    const agent = await this.prisma.user.findFirst({ where: { id: agentUserId, role: "AGENT" } });
    if (!agent) throw badRequest("not an agent");
    const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId: agentUserId, resortId } } });
    if (!linked) throw badRequest("agent not linked to this resort");
    const updated = await this.prisma.user.update({ where: { id: agentUserId }, data: { status } });
    /**
     * The wallet is deliberately left alone.
     *
     * A resort is entitled to stop an agent selling *its* rooms. It is not
     * entitled to freeze money the agency lodged with the platform, which is
     * what flipping `wallet.active` did — one resort of four could strand the
     * agency's whole float, and re-activating anywhere thawed it again.
     */
    await this.audit.log({ actorId: claims.userId, resortId, action: `agent.${status}`, entity: "user", entityId: agentUserId });
    return { id: updated.id, name: updated.name, status: updated.status };
  }

  /**
   * The statement, for the agency it belongs to or the platform that holds it.
   *
   * `RESORT_ADMIN` used to be admitted, and the transactions are not filtered
   * by resort — so any resort an agent sold could read every movement the
   * agency had made anywhere, including at the resort down the road that sells
   * to the same agencies.
   */
  async getWallet(claims: JwtClaims, userId: number) {
    if (claims.userId !== userId && claims.role !== ROLE.SUPER_ADMIN) {
      throw forbid("This account is between the agency and the platform.");
    }
    const wallet = await this.prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
    const txns = await this.prisma.walletTxn.findMany({ where: { walletId: wallet.id }, orderBy: { id: "desc" }, take: 100 });
    return { balance: Number(wallet.balance), active: wallet.active, txns: txns.map((t) => ({ ...t, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter), id: t.id.toString() })) };
  }

  /**
   * Moves the money. Only the platform may, and only its own kinds of money.
   *
   * `RESORT_ADMIN` used to be allowed, so a resort could fund and drain a float
   * the agency holds with the platform, and spend it on a rival's booking.
   */
  async walletTxn(claims: JwtClaims, userId: number, kind: string, amount: number, note?: string, bookingId?: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    if (!WALLET_KINDS.includes(kind as WalletKindName)) {
      throw badRequest(
        `The wallet holds the agency's account with the platform: ${WALLET_KINDS.join(", ")}. ` +
          `What an agency owes a resort, or earns from one, is settled between them.`,
      );
    }
    if (!Number.isFinite(amount) || amount === 0) throw badRequest("amount required");
    const moved = kind as WalletKindName;
    // PAYOUT always leaves, TOPUP always arrives, ADJUST goes the way it is
    // given. This used to end in `Math.abs(amount)` for every other kind, which
    // is how paying a booking from the wallet came to *increase* the balance.
    const signed = moved === "PAYOUT" ? -Math.abs(amount) : moved === "ADJUST" ? amount : Math.abs(amount);
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
      if (!wallet.active) throw badRequest("wallet inactive");
      const next = Number(wallet.balance) + signed;
      if (next < 0) throw badRequest("insufficient wallet balance");
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
      return tx.walletTxn.create({
        data: { walletId: wallet.id, kind: moved, amount: signed, balanceAfter: next, note, bookingId },
      });
    });
    await this.audit.log({ actorId: claims.userId, action: `wallet.${moved.toLowerCase()}`, entity: "wallet", entityId: userId, diff: { amount: signed, note } });
    return { ...result, amount: Number(result.amount), balanceAfter: Number(result.balanceAfter), id: result.id.toString() };
  }

  /**
   * `payFromWallet` used to live here, and is gone rather than corrected.
   *
   * It settled a resort's booking out of the agency's platform float, which is
   * the platform standing between two parties settling with each other. A
   * booking due is the agency's account with that resort; the platform is the
   * medium they met through, not a party to it.
   *
   * It was also broken in a way nobody could see, which is why it survived so
   * long: it passed `-Math.abs(amount)` to `walletTxn`, and that function threw
   * the sign away for every kind but PAYOUT and ADJUST — so paying a booking
   * marked the stay paid **and increased the agent's balance**. No screen in
   * the console called it and no test covered it. `WALLET_CREDIT` stays in the
   * payment-method list as a reserved code, because rows recorded that way are
   * still rows.
   */

  private async recomputePaymentState(bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { items: true, payments: true, resort: { select: { taxRatePct: true } } },
    });
    if (!b) return;
    // through the shared money module: this used to multiply nothing by nights
    // and ignore tax, so a wallet payment could mark a multi-night stay paid
    const { paymentState } = bookingTotals({ ...b, taxRatePct: b.resort.taxRatePct });
    await this.prisma.booking.update({ where: { id: bookingId }, data: { paymentState } });
  }

  // ─────────────────── discount offers ───────────────────

  async listDiscounts(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    return this.prisma.discountOffer.findMany({
      where: { resortId },
      include: {
        roomType: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: { id: "desc" },
    });
  }

  async createDiscount(
    claims: JwtClaims,
    resortId: number,
    input: { scope: "RESORT" | "ROOM_TYPE" | "ROOM"; roomTypeId?: number; roomId?: number; name: string; kind: "PERCENT" | "FLAT"; value: number; validFrom?: string; validTo?: string },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "discounts.manage");
    await this.planLimits.requireFeature(resortId, "discounts");
    if (input.scope === "ROOM_TYPE" && !input.roomTypeId) throw badRequest("Pick a room type for this offer");
    if (input.scope === "ROOM" && !input.roomId) throw badRequest("Pick a room for this offer");
    if (input.kind === "PERCENT" && (input.value <= 0 || input.value > 100)) throw badRequest("percent 1-100");
    // a room or type from another resort would silently never match
    if (input.scope === "ROOM") {
      const room = await this.prisma.room.findFirst({ where: { id: input.roomId, resortId }, select: { id: true } });
      if (!room) throw badRequest("That room is not in this resort");
    }
    if (input.scope === "ROOM_TYPE") {
      const type = await this.prisma.roomType.findFirst({ where: { id: input.roomTypeId, resortId }, select: { id: true } });
      if (!type) throw badRequest("That room type is not in this resort");
    }
    const offer = await this.prisma.discountOffer.create({
      data: {
        resortId,
        scope: input.scope,
        roomTypeId: input.scope === "ROOM_TYPE" ? input.roomTypeId : null,
        roomId: input.scope === "ROOM" ? input.roomId : null,
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
    await this.perms.require(claims, offer.resortId, "discounts.manage");
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

  /** best active discount (absolute, resort currency) for a rent on a room, at a date */
  bestDiscountFor(
    resortId: number,
    roomTypeId: number | null,
    rent: number,
    at: Date,
    roomId?: number | null,
  ): Promise<number> {
    return this.discounts.bestFor(resortId, roomTypeId, rent, at, roomId);
  }

  // ─────────────────── api keys ───────────────────

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
    await this.perms.require(claims, resortId, "apikeys.manage");
    // a key is the whole of the public API; issuing one is buying the feature
    await this.planLimits.requireFeature(resortId, "public_api");
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
    await this.perms.require(claims, row.resortId, "apikeys.manage");
    await this.prisma.apiKey.update({ where: { id: BigInt(id) }, data: { active: false } });
    await this.audit.log({ actorId: claims.userId, resortId: row.resortId, action: "apikey.revoke", entity: "api_key", entityId: id });
    return { ok: true };
  }

  /** admin approves an agent booking whose full-payment deadline has passed */
  async approveLatePayment(claims: JwtClaims, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, code: true, resortId: true, state: true, agentUserId: true, paymentState: true },
    });
    if (!b) throw badRequest("booking not found");
    requireResortAccess(claims, b.resortId);
    await this.perms.require(claims, b.resortId, "agents.manage");
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
        resort: { select: { name: true, contactPhone: true, address: true, checkInTime: true, checkOutTime: true, currency: true, locale: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
    });
    if (!b) throw badRequest("booking not found");
    requireResortAccess(claims, b.resortId);
    const to = b.guest.email?.trim();
    if (!to) throw badRequest("guest has no email on file");
    const fmt = (n: number) =>
      formatMoney(n, { currency: b.resort.currency, locale: b.resort.locale, decimals: 0 });
    const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
    const paid = b.payments.filter((p) => p.paymentType !== "REFUND").reduce((s, p) => s + Number(p.amount), 0);
    const due = Math.max(0, rent - Number(b.discount) - paid);
    const rows = b.items
      .map((i) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${i.room?.name ?? i.itemKind}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${i.qty}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(Number(i.unitPrice))}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt((Number(i.unitPrice) * i.qty))}</td></tr>`)
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
          <tr><td style="padding:4px 10px">Rent</td><td style="padding:4px 10px;text-align:right">${fmt(rent)}</td></tr>
          <tr><td style="padding:4px 10px">Discount</td><td style="padding:4px 10px;text-align:right">− ${fmt(Number(b.discount))}</td></tr>
          <tr><td style="padding:4px 10px">Paid</td><td style="padding:4px 10px;text-align:right">${fmt(paid)}</td></tr>
          <tr><td style="padding:6px 10px;font-weight:bold;background:#ecfdf5">Due</td><td style="padding:6px 10px;text-align:right;font-weight:bold;background:#ecfdf5">${fmt(due)}</td></tr>
        </table>
        <div style="margin-top:14px;color:#64748b;font-size:12px">Check-in ${b.resort.checkInTime} · Check-out ${b.resort.checkOutTime}${b.resort.contactPhone ? ` · ${b.resort.contactPhone}` : ""}</div>
      </div>`;
    const r = await this.email.send(to, `Invoice ${b.code} — ${b.resort.name}`, html, b.resort.name);
    await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "invoice.email", entity: "booking", entityId: bookingId, diff: { to } });
    return r;
  }

  // ─────────────────── agent invite by email (verification email) ───────────────────

  async inviteAgentByEmail(
    claims: JwtClaims,
    resortId: number,
    input: { email: string; name?: string },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "agents.manage");
    const to = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw badRequest("valid email required");
    const existingUser = await this.prisma.user.findFirst({ where: { email: to } });
    if (existingUser) {
      const linked = await this.prisma.userResort.findUnique({ where: { userId_resortId: { userId: existingUser.id, resortId } } });
      if (linked) throw badRequest("this email already has access to the resort");
    }
    const tempPassword = `RM-${randomBytes(5).toString("hex")}`;
    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          name: input.name?.trim() || to.split("@")[0]!,
          email: to,
          passwordHash: await bcrypt.hash(tempPassword, 12),
          role: "AGENT",
          status: "pending",
        },
      }));
    await this.prisma.userResort.create({
      data: {
        userId: user.id,
        resortId,
        roleId: (await this.prisma.customRole.findFirst({ where: { resortId, name: "Agent" } }))?.id ?? null,
      },
    });
    const resort = await this.prisma.resort.findUniqueOrThrow({ where: { id: resortId }, select: { name: true } });
    if (!existingUser) {
      // fresh agent: email the credentials + verification link
      const loginUrl = `${process.env.PUBLIC_WEB_URL ?? "https://resortmela.rootcodebd.com"}/login`;
      const platformName = await this.settings.str("platform.name", "Resort Mela");
      const html = `
        <div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a;max-width:560px">
          <h2 style="margin:0 0 8px">You've been invited to ${resort.name}</h2>
          <p>${resort.name} added you as a <b>booking agent</b> on ${platformName}. Use the credentials below to sign in and verify your account:</p>
          <table style="border-collapse:collapse;font-size:14px;margin:12px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Login email</td><td style="padding:4px 0;font-weight:bold">${to}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Temporary password</td><td style="padding:4px 0;font-weight:bold;letter-spacing:1px">${tempPassword}</td></tr>
          </table>
          <p style="margin:16px 0">
            <a href="${loginUrl}" style="background:#047857;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600">Sign in &amp; verify</a>
          </p>
          <p style="color:#64748b;font-size:13px">Change your password after the first sign-in (Profile → Set password). Commission terms are set by the resort owner.</p>
        </div>`;
      const r = await this.email.send(to, `Agent invitation — ${resort.name}`, html, resort.name);
      if (!r.sent) throw badRequest(`invitation email could not be sent: ${r.error}`);
    } else {
      // existing user (e.g. an agent of another resort): notify them of the new access
      await this.prisma.notification.create({
        data: { userId: user.id, resortId, title: `Agent access granted: ${resort.name}`, body: "You can now book for guests at this resort.", kind: "info", link: "/" },
      });
    }
    await this.audit.log({ actorId: claims.userId, resortId, action: "agent.invite", entity: "user", entityId: user.id, diff: { email: to } });
    return { id: user.id, name: user.name, email: to, status: user.status, emailed: !existingUser };
  }

  // ─────────────────── agent agency staff (agent's own users & roles) ───────────────────

  /**
   * The people who work for this agency.
   *
   * This used to be inferred from "shares a resort with me", which is wrong the
   * moment two agencies sell the same resort — the normal case, not the
   * unusual one. Each agency saw the other's people, with their phone numbers
   * and email addresses. Staff now point at the agency that created them.
   */
  async agentStaffList(claims: JwtClaims) {
    if (claims.role !== ROLE.AGENT && claims.role !== ROLE.SUPER_ADMIN) throw forbid("agents only");
    return this.prisma.user.findMany({
      where: { role: "AGENT", parentAgentId: claims.userId },
      select: { id: true, name: true, phone: true, email: true, status: true, agentRoleId: true, createdAt: true },
      orderBy: { id: "asc" },
    });
  }

  async createAgentStaff(claims: JwtClaims, input: { name: string; email?: string; phone?: string; password: string }) {
    if (claims.role !== ROLE.AGENT && claims.role !== ROLE.SUPER_ADMIN) throw forbid("agents only");
    if (input.password.length < 8) throw badRequest("password must be at least 8 characters");
    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone ? input.phone.replace(/\D/g, "") : null;
    if (!email && !phone) throw badRequest("email or phone required");
    if (phone) {
      const exists = await this.prisma.user.findUnique({ where: { phone } });
      if (exists) throw badRequest("phone already registered");
    }
    if (email) {
      const exists = await this.prisma.user.findFirst({ where: { email } });
      if (exists) throw badRequest("email already registered");
    }
    // copy the agency's approved resort links so staff book at the same resorts
    const myLinks = await this.prisma.userResort.findMany({ where: { userId: claims.userId } });
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email,
        phone,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: "AGENT",
        status: "active",
        // whose staff this is; an agency itself has no parent
        parentAgentId: claims.role === ROLE.AGENT ? claims.userId : null,
      },
    });
    for (const link of myLinks) {
      await this.prisma.userResort.create({
        data: {
          userId: user.id,
          resortId: link.resortId,
          roleId: link.roleId,
        },
      });
    }
    await this.audit.log({ actorId: claims.userId, action: "agent.staff.create", entity: "user", entityId: user.id, diff: { name: input.name } });
    return { id: user.id, name: user.name, email, phone, status: user.status };
  }

  // ─────────────────── owner self-serve: add another resort (plan-gated) ───────────────────

  async ownerCreateResort(claims: JwtClaims, tenantId: number, input: { name: string; location?: string }) {
    if (claims.role === ROLE.SUPER_ADMIN) {
      // super admin bypasses plan gates
      const resort = await this.prisma.resort.create({
        data: { tenantId, name: input.name, location: input.location, timezone: "Asia/Dhaka", currency: "BDT" },
      });
      await ensureResortRoles(this.prisma, resort.id);
      await this.audit.log({ actorId: claims.userId, resortId: resort.id, action: "resort.create", entity: "resort", entityId: resort.id, diff: input });
      return resort;
    }
    const membership = await this.prisma.userResort.findFirst({
      where: { userId: claims.userId, resort: { tenantId } },
      include: { resort: { select: { tenantId: true } } },
    });
    if (!membership) throw forbid("not a member of this tenant");
    if (claims.role !== ROLE.RESORT_ADMIN) throw forbid("only the resort owner can add resorts");
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const count = await this.prisma.resort.count({ where: { tenantId } });
    await ensurePlans(this.prisma);
    const limits = await this.planLimits.forTenant(tenantId);
    const capError = PlanLimitsService.resortCapError(limits, count);
    if (capError) throw Object.assign(new Error(capError), { status: 402 });
    void tenant;
    const resort = await this.prisma.resort.create({
      data: { tenantId, name: input.name, location: input.location, timezone: "Asia/Dhaka", currency: "BDT" },
    });
    await this.prisma.userResort.create({ data: { userId: claims.userId, resortId: resort.id } });
    await ensureResortRoles(this.prisma, resort.id);
    await this.prisma.counter.create({ data: { resortId: resort.id, kind: "BOOKING", nextVal: 0 } });
    await this.audit.log({ actorId: claims.userId, resortId: resort.id, action: "resort.create", entity: "resort", entityId: resort.id, diff: input });
    return resort;
  }

  // ─────────────────── front-end CMS ───────────────────

  async getCms(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    return this.prisma.cmsSetting.findMany({ orderBy: { key: "asc" } });
  }

  /** public homepage content map (no auth) */
  async publicCms(): Promise<Record<string, string>> {
    const rows = await this.prisma.cmsSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /**
   * The price list, for the page that quotes it.
   *
   * The homepage carried its own copy — three names and three prices written
   * into the markup — while `platform_plans` was the editable source and the
   * screen that edits it. So changing what the platform charges left the
   * public page selling the old number, and there was no way to tell which
   * one a customer had read. A price belongs in one place.
   *
   * Only what is actually being sold: an inactive plan is one the owner has
   * stopped offering, and it should leave the page when they say so.
   */
  async publicPlans() {
    const rows = await this.prisma.platformPlan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        name: true, label: true, monthlyFee: true,
        maxRooms: true, maxResorts: true, maxStaff: true, trialDays: true, blurb: true, highlight: true,
        // the ticks on the card are drawn from this, not from a map in the page
        features: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      monthlyFee: Number(r.monthlyFee),
      features: Array.isArray(r.features) ? (r.features as string[]) : [],
    }));
  }

  async putCms(claims: JwtClaims, key: string, value: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    if (!/^[a-z0-9_.]{2,60}$/.test(key)) throw badRequest("key must be lowercase letters, digits, dot or underscore");
    const row = await this.prisma.cmsSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await this.audit.log({ actorId: claims.userId, action: "cms.update", entity: "cms_setting", diff: { key } });
    return row;
  }
}
