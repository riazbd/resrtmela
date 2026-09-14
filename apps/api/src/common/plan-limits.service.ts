/**
 * One answer to "what is this resort allowed to do".
 *
 * There were two plan tables that did not know about each other: the hard-coded
 * PLANS (FREE / STANDARD / PRO, 10 / 50 / 500 rooms) in plans.ts, and the
 * PlatformPlan rows (STARTER / GROWTH / CHAIN, 10 / 40 / 10,000) the super
 * admin edits in Platform → Plans. This service silently chose between them,
 * and signup put every new tenant on "FREE" — a name that did not exist in the
 * plan table at all, so a new customer's limits lived in a constant nobody
 * could change without a deploy.
 *
 * The table is the vocabulary now. The legacy names live on as inactive rows
 * carrying exactly the limits they always had (migration
 * 20260909250000_one_plan_vocabulary), which is what makes this change cost no
 * tenant a single room: remapping STANDARD onto GROWTH would have taken ten.
 *
 * Resolution order:
 *   1. the resort's live subscription → that plan's row
 *   2. no subscription                → the tenant's own plan name, as a row
 *   3. neither, or a name nobody sells → the cheapest plan still on sale
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ALL_PLAN_FEATURES, planFeatureLabel, isPeriodUnit, perMonthEquivalent } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { forbid } from "./rbac";

export interface PlanLimits {
  label: string;
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  /** Keys from `PLAN_FEATURES` — what the owner ticked for this plan. */
  features: string[];
  /** Where the numbers came from — useful in error messages and support. */
  source: "subscription" | "fallback";
}

/**
 * What a resort may use, given how its plan was resolved.
 *
 * Only a real subscription can take something away — see `hasFeature`. This is
 * the single place that rule is written, so the lock and the menu cannot come
 * to different conclusions.
 */
function effective(limits: PlanLimits): string[] {
  return limits.source === "subscription" ? limits.features : [...ALL_PLAN_FEATURES];
}

/** `features` is JSON in the database, so it is whatever was written into it. */
function featureList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : [];
}

/**
 * What to allow when `platform_plans` is empty.
 *
 * That is not a state a real database reaches — a migration seeds the table and
 * the console cannot empty it — so this is a guard against a broken install,
 * not a plan. It is deliberately the tightest thing that still lets someone log
 * in and see their data, and it logs, because the fix is to seed the table.
 */
const NO_CATALOGUE: PlanLimits = {
  label: "Unconfigured",
  maxRooms: 10,
  maxResorts: 1,
  maxStaff: 1,
  /**
   * Everything, unlike the room count.
   *
   * A tight room limit on a broken install is a wall someone hits while adding
   * their eleventh room. A missing feature list would instead present itself to
   * a paying customer as a downgrade — their restaurant gone, their agents
   * gone — because the catalogue failed to load. Locks are for plans that were
   * sold; an empty table sold nothing.
   */
  features: [],
  source: "fallback",
};

/**
 * Everything this file needs of Prisma, so the rule can be asked outside a Nest
 * injection context.
 *
 * `selling-access.ts` is a set of plain functions taking a client — the shape
 * every caller of it already holds — and it now has to ask which plan a resort
 * is on. The alternatives were threading a service through seven constructors
 * to answer one question, or writing the rule a second time, which is how a
 * menu and a door come to disagree.
 */
type Db = Pick<PrismaService, "resort" | "subscription" | "platformPlan" | "tenant">;

const logger = new Logger("PlanLimits");

const limitsOf = (plan: {
  label: string;
  maxRooms: number;
  maxResorts: number;
  maxStaff: number;
  features: unknown;
}): Omit<PlanLimits, "source"> => ({
  label: plan.label,
  maxRooms: plan.maxRooms,
  maxResorts: plan.maxResorts,
  maxStaff: plan.maxStaff,
  features: featureList(plan.features),
});

/**
 * The entry plan — what someone gets when nothing else identifies them.
 *
 * Cheapest rather than most restrictive on purpose: the two are normally the
 * same, and when they are not, the platform's own price list is a better
 * statement of intent than picking the smallest number.
 */
async function cheapestOnSale(prisma: Db, audience: "RESORT" | "AGENCY"): Promise<PlanLimits> {
  /**
   * Cheapest, out of a ladder rather than out of a column.
   *
   * This was `orderBy: monthlyFee`, which the database could do because a
   * price was one number. A price is a list of rungs now, so the comparison
   * happens here — per month, from the rung the customer settles on, so a
   * plan sold only by the year is judged against a monthly one fairly and a
   * plan running an introductory promotion does not become "the cheapest"
   * for as long as the promotion lasts.
   *
   * The whole list is read because the platform sells a handful of plans and
   * every one of them has to be compared; `sortOrder` breaks a tie, which is
   * the owner's own opinion about which comes first.
   */
  const rows = await prisma.platformPlan.findMany({
    where: { active: true, audience },
    orderBy: { sortOrder: "asc" },
    include: {
      schedules: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: { phases: { orderBy: { seq: "asc" } } },
      },
    },
  });
  const priced = rows
    .map((r) => {
      const rates = r.schedules
        .filter((sch) => sch.phases.length > 0)
        .map((sch) =>
          perMonthEquivalent(
            sch.phases.map((ph) => ({
              seq: ph.seq,
              count: ph.count,
              unit: isPeriodUnit(ph.unit) ? ph.unit : ("MONTH" as const),
              price: Number(ph.price),
              repeats: ph.repeats,
            })),
          ),
        );
      return { plan: r, rate: rates.length ? Math.min(...rates) : null };
    })
    .filter((x): x is { plan: (typeof rows)[number]; rate: number } => x.rate != null);

  const plan = priced.reduce<(typeof priced)[number] | null>(
    (best, x) => (best == null || x.rate < best.rate ? x : best),
    null,
  )?.plan;
  if (!plan) {
    logger.warn("platform_plans is empty — seed it; falling back to the tightest limits");
    return NO_CATALOGUE;
  }
  return {
    label: plan.label,
    maxRooms: plan.maxRooms,
    maxResorts: plan.maxResorts,
    maxStaff: plan.maxStaff,
    features: featureList(plan.features),
    source: "fallback",
  };
}

/**
 * The plan each of these accounts is held to — in a fixed number of queries
 * rather than three per account.
 *
 * Batch because the selling rule asks it about every resort on the platform at
 * once, on a screen an agency keeps open all day.
 */
export async function limitsForTenants(prisma: Db, tenantIds: number[]): Promise<Map<number, PlanLimits>> {
  const out = new Map<number, PlanLimits>();
  const ids = [...new Set(tenantIds)];
  if (ids.length === 0) return out;

  // the subscription belongs to the account itself; the resort that used to sit
  // in this `where` was only ever a bridge to the tenant
  const subs = await prisma.subscription.findMany({
    where: { accountId: { in: ids }, status: { not: "CANCELLED" } },
    orderBy: { id: "desc" },
    select: { accountId: true, plan: true },
  });
  // newest first, so the first row seen for an account is the one that counts —
  // the same row `findFirst` used to pick, for the same reason
  const planOf = new Map<number, string>();
  for (const row of subs) if (!planOf.has(row.accountId)) planOf.set(row.accountId, row.plan);

  const rows = planOf.size
    ? await prisma.platformPlan.findMany({ where: { name: { in: [...new Set(planOf.values())] } } })
    : [];
  const byName = new Map(rows.map((r) => [r.name, limitsOf(r)]));

  /**
   * `Tenant.plan` used to be consulted as a second answer. It diverged from the
   * subscription the first time a plan changed, and it is gone. An account with
   * no subscription — or one naming a plan nobody sells — is held to the
   * cheapest plan on its own shelf; an agency is never measured against a
   * resort plan.
   */
  const unresolved: number[] = [];
  for (const id of ids) {
    const name = planOf.get(id);
    const row = name != null ? byName.get(name) : undefined;
    if (row) out.set(id, { ...row, source: "subscription" });
    else unresolved.push(id);
  }
  if (unresolved.length === 0) return out;

  const kinds = await prisma.tenant.findMany({
    where: { id: { in: unresolved } },
    select: { id: true, kind: true },
  });
  const kindOf = new Map(kinds.map((t) => [t.id, t.kind]));
  // at most two lookups, however many accounts are being resolved
  const shelf = new Map<string, PlanLimits>();
  for (const id of unresolved) {
    const audience = kindOf.get(id) === "AGENCY" ? "AGENCY" : "RESORT";
    let fallback = shelf.get(audience);
    if (!fallback) {
      fallback = await cheapestOnSale(prisma, audience);
      shelf.set(audience, fallback);
    }
    out.set(id, fallback);
  }
  return out;
}

/** The same question about one account. */
export async function limitsForTenant(prisma: Db, tenantId: number): Promise<PlanLimits> {
  const found = (await limitsForTenants(prisma, [tenantId])).get(tenantId);
  return found ?? cheapestOnSale(prisma, "RESORT");
}

/**
 * What each of these resorts may actually use — through `effective()`, the same
 * gate `hasFeature` puts one resort through, so a menu and a door cannot part
 * company.
 */
export async function featuresForResorts(prisma: Db, resortIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const ids = [...new Set(resortIds)];
  if (ids.length === 0) return out;
  const resorts = await prisma.resort.findMany({
    where: { id: { in: ids } },
    select: { id: true, tenantId: true },
  });
  const limits = await limitsForTenants(prisma, resorts.map((r) => r.tenantId));
  for (const r of resorts) {
    const held = limits.get(r.tenantId);
    if (held) out.set(r.id, effective(held));
  }
  return out;
}

@Injectable()
export class PlanLimitsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Limits for the tenant that owns `resortId`. */
  async forResort(resortId: number): Promise<PlanLimits> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { tenantId: true },
    });
    if (!resort) return cheapestOnSale(this.prisma, "RESORT");
    return this.forTenant(resort.tenantId);
  }

  async forTenant(tenantId: number): Promise<PlanLimits> {
    return limitsForTenant(this.prisma, tenantId);
  }

  /**
   * Does this resort's plan include `key`?
   *
   * Only a real subscription can answer no. A resort resolved through its
   * tenant's plan name, or through the fallback because nothing identified it,
   * is not a downgraded customer — it is one the platform has never billed, and
   * every resort in the live database is in exactly that state today, several
   * of them running a restaurant. Taking a working module away from them on the
   * strength of a plan nobody put them on would be a bug wearing a feature's
   * clothes.
   */
  async hasFeature(resortId: number, key: string): Promise<boolean> {
    return (await this.featuresFor(resortId)).includes(key);
  }

  /**
   * Everything this resort may actually use.
   *
   * The console asks for this when it loads a resort, so it can leave a link
   * out rather than draw one that ends in a 403. It must be the same answer
   * `requireFeature` gives — a menu and a door that disagree are worse than
   * either being wrong on its own — so both go through `effective()`.
   */
  async featuresFor(resortId: number): Promise<string[]> {
    return effective(await this.forResort(resortId));
  }

  /** Throws 403 naming the feature and the plan, so the owner knows what to buy. */
  async requireFeature(resortId: number, key: string): Promise<void> {
    const limits = await this.forResort(resortId);
    if (effective(limits).includes(key)) return;
    throw forbid(
      `Your ${limits.label} plan does not include ${planFeatureLabel(key)}. Change the plan to switch it on.`,
    );
  }

  /** Every plan the platform is currently selling, cheapest first. */
  /** The plans on one shelf. A resort's screens ask for RESORT and never see an agency plan. */
  async onSale(audience: "RESORT" | "AGENCY" = "RESORT") {
    // `sortOrder` alone: the secondary key used to be `monthlyFee`, a column
    // that no longer holds a price, and the owner's own order is the better
    // answer to "which plan comes first" anyway
    return this.prisma.platformPlan.findMany({
      where: { active: true, audience },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** null when the room fits, otherwise the message to show the owner. */
  static roomCapError(limits: PlanLimits, currentRooms: number, adding = 1): string | null {
    if (currentRooms + adding <= limits.maxRooms) return null;
    return `Plan ${limits.label} allows up to ${limits.maxRooms} rooms per resort (you have ${currentRooms}). Upgrade the plan to add more.`;
  }

  /** null when another resort fits, otherwise the message to show the owner. */
  static resortCapError(limits: PlanLimits, currentResorts: number, adding = 1): string | null {
    if (currentResorts + adding <= limits.maxResorts) return null;
    return `Your ${limits.label} plan allows up to ${limits.maxResorts} resort(s). Upgrade the subscription to add more.`;
  }
}
