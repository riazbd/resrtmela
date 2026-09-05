import { Inject, Injectable } from "@nestjs/common";
import { Prisma, Prisma as P } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, JwtClaims } from "@rh/shared";
import { isManagement, requireResortAccess, requireRoles } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { checkRoomCap } from "../common/plans";
import { AuditService } from "../common/audit.service";

@Injectable()
export class RoomsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ── room types ──
  listRoomTypes(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    return this.prisma.roomType.findMany({ where: { resortId }, orderBy: { id: "asc" } });
  }

  async createRoomType(
    claims: JwtClaims,
    resortId: number,
    data: { name: string; maxAdults: number; maxChildren?: number; amenities?: string[] },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    const rt = await this.prisma.roomType.create({
      data: { resortId, name: data.name, maxAdults: data.maxAdults, maxChildren: data.maxChildren ?? 0, amenities: data.amenities },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "roomType.create", entity: "roomType", entityId: rt.id, diff: data });
    return rt;
  }

  // ── rooms ──
  listRooms(claims: JwtClaims, resortId: number, opts?: { includeInactive?: boolean }) {
    requireResortAccess(claims, resortId);
    return this.prisma.room.findMany({
      where: { resortId, ...(opts?.includeInactive ? {} : {}) },
      include: { roomType: true },
      orderBy: [{ roomTypeId: "asc" }, { name: "asc" }],
    });
  }

  async createRoom(
    claims: JwtClaims,
    resortId: number,
    data: { name: string; roomTypeId: number; baseRate: number },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    // plan cap (soft-SaaS enforcement)
    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      include: { tenant: { select: { plan: true } } },
    });
    const roomCount = await this.prisma.room.count({ where: { resortId } });
    const capError = checkRoomCap(resort.tenant.plan, roomCount);
    if (capError) {
      throw Object.assign(new Error(capError), { status: 402 });
    }
    const room = await this.prisma.room.create({
      data: {
        resortId,
        name: data.name,
        roomTypeId: data.roomTypeId,
        baseRate: data.baseRate as never,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "room.create", entity: "room", entityId: room.id, diff: data });
    return room;
  }

  async updateRoom(
    claims: JwtClaims,
    roomId: number,
    data: { baseRate?: number; status?: "ACTIVE" | "OUT_OF_SERVICE"; name?: string },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const room = await this.prisma.room.update({
      where: { id: roomId },
      data: {
        ...(data.baseRate !== undefined ? { baseRate: data.baseRate as never } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.name ? { name: data.name } : {}),
      },
    });
    requireResortAccess(claims, room.resortId);
    await this.audit.log({ actorId: claims.userId, resortId: room.resortId, action: "room.update", entity: "room", entityId: roomId, diff: data });
    return room;
  }

  // ── rate plans (seasonal) ──
  listRatePlans(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    return this.prisma.ratePlan.findMany({
      where: { resortId, active: true },
      include: { roomType: { select: { id: true, name: true } } },
      orderBy: { dateFrom: "asc" },
    });
  }

  async createRatePlan(
    claims: JwtClaims,
    resortId: number,
    data: { roomTypeId: number; dateFrom: string; dateTo: string; price: number },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    if (dateOnly(data.dateFrom) >= dateOnly(data.dateTo)) {
      throw Object.assign(new Error("dateTo must be after dateFrom"), { status: 400 });
    }
    const rp = await this.prisma.ratePlan.create({
      data: {
        resortId,
        roomTypeId: data.roomTypeId,
        dateFrom: dateOnly(data.dateFrom),
        dateTo: dateOnly(data.dateTo),
        price: data.price as never,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "ratePlan.create", entity: "ratePlan", entityId: rp.id, diff: data });
    return rp;
  }

  /** Resolve the effective rate for a room across [from, to): rate plan overrides base. */
  async effectiveRates(
    resortId: number,
    roomTypeId: number,
    nights: Date[],
    baseRate: number,
    tx?: P.TransactionClient,
  ): Promise<number[]> {
    const client = (tx ?? this.prisma) as P.TransactionClient;
    const plans = await client.ratePlan.findMany({
      where: {
        resortId,
        roomTypeId,
        active: true,
        dateFrom: { lte: nights[nights.length - 1] ?? new Date(0) },
        dateTo: { gte: nights[0] ?? new Date(0) },
      },
    });
    return nights.map((night) => {
      const plan = plans.find(
        (p) => dateOnly(p.dateFrom) <= night && night < dateOnly(p.dateTo),
      );
      return plan ? Number(plan.price) : baseRate;
    });
  }
}
