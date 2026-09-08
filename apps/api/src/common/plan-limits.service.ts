/**
 * One answer to "what is this resort allowed to do".
 *
 * There were two plan tables: the hard-coded PLANS (FREE/STANDARD/PRO) in
 * plans.ts, and the PlatformPlan rows (STARTER/GROWTH/CHAIN) the super admin
 * edits in Platform -> Plans. Only the hard-coded one was enforced, so editing
 * a room limit in the UI changed nothing.
 *
 * Resolution order:
 *   1. the resort's live subscription  -> PlatformPlan (editable, authoritative)
 *   2. no subscription                 -> the tenant's legacy plan, unchanged
 *   3. neither                         -> the most restrictive legacy plan
 *
 * Step 2 deliberately keeps the old numbers rather than remapping onto the new
 * plans: GROWTH allows fewer rooms than STANDARD did, and unifying the tables
 * must not quietly take capacity away from a tenant already using it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PLANS, isPlanName } from "./plans";

export interface PlanLimits {
  label: string;
  maxRooms: number;
  maxResorts: number;
  /** Where the numbers came from — useful in error messages and support. */
  source: "subscription" | "legacy";
}

const LEGACY_FALLBACK: PlanLimits = {
  label: PLANS.FREE.label,
  maxRooms: PLANS.FREE.maxRoomsPerResort,
  maxResorts: PLANS.FREE.maxResorts,
  source: "legacy",
};

@Injectable()
export class PlanLimitsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Limits for the tenant that owns `resortId`. */
  async forResort(resortId: number): Promise<PlanLimits> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { tenantId: true },
    });
    if (!resort) return LEGACY_FALLBACK;
    return this.forTenant(resort.tenantId);
  }

  async forTenant(tenantId: number): Promise<PlanLimits> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { resort: { tenantId }, status: { not: "CANCELLED" } },
      orderBy: { id: "desc" },
      select: { plan: true },
    });

    if (subscription) {
      const definition = await this.prisma.platformPlan.findUnique({
        where: { name: subscription.plan },
      });
      if (definition) {
        return {
          label: definition.label,
          maxRooms: definition.maxRooms,
          maxResorts: definition.maxResorts,
          source: "subscription",
        };
      }
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    // stored casing has drifted ("free" and "STANDARD" both exist)
    const legacy = tenant?.plan?.toUpperCase();
    if (legacy && isPlanName(legacy)) {
      const plan = PLANS[legacy];
      return {
        label: plan.label,
        maxRooms: plan.maxRoomsPerResort,
        maxResorts: plan.maxResorts,
        source: "legacy",
      };
    }
    return LEGACY_FALLBACK;
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
