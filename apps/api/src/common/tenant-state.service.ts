/**
 * Whether a tenant is currently entitled to use the platform.
 *
 * `Resort.status` existed and was set by the super admin, but nothing read it:
 * a suspended tenant kept full use of the product, so the platform had no way
 * to enforce its own commercial terms.
 *
 * Suspension blocks the paths that create new obligations — bookings, money,
 * inventory — and deliberately leaves reads open. An owner behind on a bill
 * must still be able to open their books and export them. Holding a tenant's
 * own data hostage is how you guarantee they never come back, and it is the
 * kind of thing that makes a platform hard to trust.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** HTTP 402 Payment Required — distinct from 403, which would read as a permissions bug. */
export const SUSPENDED_STATUS = 402;

@Injectable()
export class TenantStateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Throws 402 when the resort may not accept new work. */
  async assertWritable(resortId: number): Promise<void> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { status: true, name: true },
    });
    if (!resort) return; // the caller's own not-found handling is more specific
    if (resort.status === "active") return;

    throw Object.assign(
      new Error(
        `${resort.name} is suspended, so new entries cannot be saved. ` +
          `Existing records stay readable and exportable. Settle the subscription to resume.`,
      ),
      { status: SUSPENDED_STATUS },
    );
  }
}
