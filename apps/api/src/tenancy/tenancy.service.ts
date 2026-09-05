import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, JwtClaims } from "@rh/shared";
import { requireRoles, requireResortAccess } from "../common/rbac";
import { AuditService } from "../common/audit.service";
import { PLANS, isPlanName } from "../common/plans";

@Injectable()
export class TenancyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  mine(claims: JwtClaims) {
    if (claims.role === ROLE.SUPER_ADMIN) {
      return this.prisma.resort.findMany({
        select: { id: true, name: true, tenantId: true, status: true },
        orderBy: { id: "asc" },
      });
    }
    return this.prisma.userResort
      .findMany({
        where: { userId: claims.userId },
        select: { resort: { select: { id: true, name: true, tenantId: true, status: true } } },
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
      currency?: string;
      showRatesToAgents?: boolean;
    },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: data.tenantId }, select: { plan: true } });
    const plan = isPlanName(tenant.plan) ? tenant.plan : "FREE";
    const resortCount = await this.prisma.resort.count({ where: { tenantId: data.tenantId } });
    if (resortCount + 1 > PLANS[plan].maxResorts) {
      throw Object.assign(
        new Error(`Plan ${PLANS[plan].label} allows up to ${PLANS[plan].maxResorts} resorts. Upgrade the plan.`),
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
      taxRatePct: number;
      status: string;
      invoicePrefix: string;
      checkInTime: string;
      checkOutTime: string;
      address: string;
      website: string;
      contactPhone: string;
      fyStartMonthDay: string;
    }>,
  ) {
    if (claims.role !== ROLE.SUPER_ADMIN) {
      requireRoles(claims, [ROLE.RESORT_ADMIN, ROLE.MANAGER]);
      if (!claims.resortIds.includes(resortId)) {
        throw Object.assign(new Error("No access to this resort"), { status: 403 });
      }
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
    const plan = isPlanName(tenant.plan) ? tenant.plan : "FREE";
    const roomCount = tenant.resorts.reduce((s, r) => s + r._count.rooms, 0);
    const guestCount = tenant.resorts.reduce((s, r) => s + r._count.guests, 0);
    const staffUsers = await this.prisma.userResort.findMany({
      where: { resort: { tenantId } },
      include: { user: { select: { role: true } } },
    });
    const staffIds = new Set(
      staffUsers.filter((u) => u.user.role !== ROLE.GUEST).map((u) => u.userId),
    );
    return {
      tenantId,
      name: tenant.name,
      plan,
      planLabel: PLANS[plan].label,
      limits: { maxResorts: PLANS[plan].maxResorts, maxRoomsPerResort: PLANS[plan].maxRoomsPerResort },
      resorts: tenant.resorts.length,
      rooms: roomCount,
      staffUsers: staffIds.size,
      guests: guestCount,
    };
  }

  /** Plan change — platform team only. */
  async updatePlan(claims: JwtClaims, tenantId: number, plan: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN]);
    if (!isPlanName(plan)) {
      throw Object.assign(new Error("plan must be FREE, STANDARD or PRO"), { status: 400 });
    }
    const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: { plan } });
    await this.audit.log({
      actorId: claims.userId,
      action: "tenant.plan.change",
      entity: "tenant",
      entityId: tenantId,
      diff: { plan },
    });
    return tenant;
  }

  detail(claims: JwtClaims, resortId: number) {
    if (claims.role !== ROLE.SUPER_ADMIN && !claims.resortIds.includes(resortId)) {
      throw Object.assign(new Error("No access to this resort"), { status: 403 });
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
