import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, JwtClaims } from "@rh/shared";
import { requireRoles, requireResortAccess, requireSellingAccess } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { PermissionsService } from "../common/permissions";

@Injectable()
export class TenancyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
  ) {}

  mine(claims: JwtClaims) {
    if (claims.role === ROLE.SUPER_ADMIN) {
      return this.prisma.resort.findMany({
        select: { id: true, name: true, tenantId: true, status: true, currency: true, locale: true },
        orderBy: { id: "asc" },
      });
    }
    return this.prisma.userResort
      .findMany({
        where: { userId: claims.userId },
        select: { resort: { select: { id: true, name: true, tenantId: true, status: true, currency: true, locale: true } } },
        orderBy: { resortId: "asc" },
      })
      .then((rows) => rows.map((r) => r.resort));
  }

  listTenants(claims: JwtClaims) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    return this.prisma.tenant.findMany({
      include: { resorts: { select: { id: true, name: true, status: true } } },
      orderBy: { id: "asc" },
    });
  }

  async createTenant(claims: JwtClaims, data: { name: string; slug: string; plan?: string }) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const tenant = await this.prisma.tenant.create({ data });
    await this.audit.log({
      actorId: claims.userId,
      action: "tenant.create",
      entity: "tenant",
      entityId: tenant.id,
      diff: data,
    });
    return tenant;
  }

  async createResort(
    claims: JwtClaims,
    data: {
      tenantId: number;
      name: string;
      location?: string;
      timezone?: string;
      locale?: string;
      currency?: string;
      showRatesToAgents?: boolean;
    },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const limits = await this.planLimits.forTenant(data.tenantId);

    const resortCount = await this.prisma.resort.count({ where: { tenantId: data.tenantId } });
    const capError = PlanLimitsService.resortCapError(limits, resortCount);
    if (capError) {
      throw Object.assign(
        new Error(capError),
        { status: 402 },
      );
    }
    const resort = await this.prisma.resort.create({ data });
    await this.audit.log({
      actorId: claims.userId,
      action: "resort.create",
      entity: "resort",
      entityId: resort.id,
      diff: data,
    });
    return resort;
  }

  async updateResort(
    claims: JwtClaims,
    resortId: number,
    data: Partial<{
      name: string;
      location: string;
      timezone: string;
      currency: string;
      showRatesToAgents: boolean;
      showGuestNamesToAgents: boolean;
      taxRatePct: number;
      status: string;
      invoicePrefix: string;
      bookingPrefix: string;
      fbPrefix: string;
      checkInTime: string;
      checkOutTime: string;
      address: string;
      website: string;
      contactPhone: string;
      fyStartMonthDay: string;
      agentPaymentHours: number;
    }>,
  ) {
    if (claims.role !== ROLE.SUPER_ADMIN) {
      if (!claims.resortIds.includes(resortId)) {
        throw Object.assign(new Error("No access to this resort"), { status: 403 });
      }
      await this.perms.require(claims, resortId, "settings.manage");
      // tenants can't flip status/plan themselves
      const { status: _status, ...safe } = data as Record<string, unknown>;
      data = safe as typeof data;
    }
    const resort = await this.prisma.resort.update({ where: { id: resortId }, data });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "resort.update",
      entity: "resort",
      entityId: resortId,
      diff: data,
    });
    return resort;
  }

  /** Available financial years for reports (from first booking to today). */
  async fiscalYears(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      select: { fyStartMonthDay: true },
    });
    const [mm, dd] = resort.fyStartMonthDay.split("-").map(Number);
    const first = await this.prisma.booking.findFirst({
      where: { resortId, deletedAt: null },
      orderBy: { checkIn: "asc" },
      select: { checkIn: true },
    });
    const today = new Date();
    const startYear =
      first?.checkIn && first.checkIn < new Date(Date.UTC(today.getUTCFullYear(), (mm ?? 7) - 1, dd ?? 1))
        ? first.checkIn.getUTCFullYear()
        : today.getUTCMonth() + 1 > (mm ?? 7) || (today.getUTCMonth() + 1 === (mm ?? 7) && today.getUTCDate() >= (dd ?? 1))
          ? today.getUTCFullYear()
          : today.getUTCFullYear() - 1;
    const years: { label: string; from: string; to: string }[] = [];
    for (let y = startYear; y <= today.getUTCFullYear(); y++) {
      years.push({
        label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`,
        from: `${y}-${String(mm ?? 7).padStart(2, "0")}-${String(dd ?? 1).padStart(2, "0")}`,
        to: `${y + 1}-${String(mm ?? 7).padStart(2, "0")}-${String(dd ?? 1).padStart(2, "0")}`,
      });
    }
    return { fyStartMonthDay: resort.fyStartMonthDay, years: years.reverse() };
  }

  /** Tenant usage snapshot — super_admin or any member of the tenant. */
  async usage(claims: JwtClaims, tenantId: number) {
    if (claims.role !== ROLE.SUPER_ADMIN) {
      const mine = await this.prisma.userResort.findMany({
        where: { userId: claims.userId },
        include: { resort: { select: { tenantId: true } } },
      });
      if (!mine.some((m) => m.resort.tenantId === tenantId)) {
        throw Object.assign(new Error("No access to this tenant"), { status: 403 });
      }
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        resorts: {
          include: { _count: { select: { rooms: true, guests: true } } },
        },
      },
    });

    const roomCount = tenant.resorts.reduce((s, r) => s + r._count.rooms, 0);
    const guestCount = tenant.resorts.reduce((s, r) => s + r._count.guests, 0);
    // every account linked to a resort is staff (or an agency selling it) — a
    // guest is a row in the register, never a login, so there is nobody to leave out
    const staffUsers = await this.prisma.userResort.findMany({
      where: { resort: { tenantId } },
      select: { userId: true },
    });
    const staffIds = new Set(staffUsers.map((u) => u.userId));
    const [limits, subscription] = await Promise.all([
      this.planLimits.forTenant(tenantId),
      // the plan is the subscription's; `Tenant.plan` was a label that drifted from it
      this.prisma.subscription.findFirst({
        where: { accountId: tenantId, status: { not: "CANCELLED" } },
        orderBy: { id: "desc" },
        select: { plan: true },
      }),
    ]);
    return {
      tenantId,
      name: tenant.name,
      plan: subscription?.plan ?? null,
      planLabel: limits.label,
      limits: { maxResorts: limits.maxResorts, maxRoomsPerResort: limits.maxRooms },
      resorts: tenant.resorts.length,
      rooms: roomCount,
      staffUsers: staffIds.size,
      guests: guestCount,
    };
  }

  async detail(claims: JwtClaims, resortId: number) {
    // an agency sells this resort, so it may read the shop window: rooms,
    // room types, activities. Everything behind the counter goes through
    // `requireResortAccess`, which agents do not pass.
    requireSellingAccess(claims, resortId);

    /**
     * An agency gets the window, and only the window.
     *
     * `requireSellingAccess` answers "may you be here", so an agency reached
     * this route legitimately — and then received the whole `resorts` row:
     * the tax rate, the street address, the contact phone, how many guests
     * and bookings the resort has, and every room's `baseRate` even when
     * `showRatesToAgents` is off, which every other agent-facing path
     * honours. The gate was right; the projection behind it was not.
     */
    if (claims.role === ROLE.AGENT) {
      const resort = await this.prisma.resort.findUniqueOrThrow({
        where: { id: resortId },
        select: {
          id: true, name: true, location: true, website: true,
          currency: true, locale: true, timezone: true,
          checkInTime: true, checkOutTime: true, showRatesToAgents: true,
          roomTypes: {
            select: { id: true, name: true, maxAdults: true, maxChildren: true, extraPersonAllowed: true },
          },
          rooms: {
            where: { status: "ACTIVE" },
            select: { id: true, name: true, roomTypeId: true, baseRate: true },
            orderBy: { name: "asc" },
          },
          activities: {
            where: { active: true },
            select: { id: true, name: true, category: true, basePrice: true, durationMin: true },
          },
        },
      });
      // the rate is the one thing here the resort decides to share or not
      const rooms = resort.showRatesToAgents
        ? resort.rooms
        : resort.rooms.map(({ baseRate: _hidden, ...room }) => room);
      return { ...resort, rooms };
    }

    return this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      include: {
        roomTypes: true,
        rooms: { orderBy: { name: "asc" } },
        activities: { where: { active: true } },
        _count: { select: { bookings: true, guests: true } },
      },
    });
  }
}
