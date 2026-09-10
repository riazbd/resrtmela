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
import { ALL_PLAN_FEATURES, planFeatureLabel } from "@rh/shared";
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
  source: "subscription" | "tenant" | "fallback";
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

@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger(PlanLimitsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Limits for the tenant that owns `resortId`. */
  async forResort(resortId: number): Promise<PlanLimits> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { tenantId: true },
    });
    if (!resort) return this.cheapestOnSale();
    return this.forTenant(resort.tenantId);
  }

  async forTenant(tenantId: number): Promise<PlanLimits> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { resort: { tenantId }, status: { not: "CANCELLED" } },
      orderBy: { id: "desc" },
      select: { plan: true },
    });
    if (subscription) {
      const row = await this.planByName(subscription.plan);
      if (row) return { ...row, source: "subscription" };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    if (tenant?.plan) {
      // casing drifted before the migration normalised it; a lookup that is
      // case-sensitive on a name typed by a human is a support call
      const row = await this.planByName(tenant.plan.toUpperCase());
      if (row) return { ...row, source: "tenant" };
    }

    return this.cheapestOnSale();
  }

  private async planByName(name: string): Promise<Omit<PlanLimits, "source"> | null> {
    const plan = await this.prisma.platformPlan.findUnique({ where: { name } });
    return plan
      ? {
          label: plan.label,
          maxRooms: plan.maxRooms,
          maxResorts: plan.maxResorts,
          maxStaff: plan.maxStaff,
          features: featureList(plan.features),
        }
      : null;
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

  /**
   * The entry plan — what someone gets when nothing else identifies them.
   *
   * Cheapest rather than most restrictive on purpose: the two are normally the
   * same, and when they are not, the platform's own price list is a better
   * statement of intent than picking the smallest number.
   */
  private async cheapestOnSale(): Promise<PlanLimits> {
    const plan = await this.prisma.platformPlan.findFirst({
      where: { active: true },
      orderBy: [{ monthlyFee: "asc" }, { sortOrder: "asc" }],
    });
    if (!plan) {
      this.logger.warn("platform_plans is empty — seed it; falling back to the tightest limits");
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

  /** Every plan the platform is currently selling, cheapest first. */
  async onSale() {
    return this.prisma.platformPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { monthlyFee: "asc" }],
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
