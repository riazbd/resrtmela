import { Inject, Injectable } from "@nestjs/common";
import { Prisma, Prisma as P } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, JwtClaims } from "@rh/shared";
import { isManagement, requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { PlanLimitsService } from "../common/plan-limits.service";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";

@Injectable()
export class RoomsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
  ) {}

  // ── room types ──
  async listRoomTypes(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    // the matrix showed this box and nothing asked for it: hiding the menu
    // link is not access control, and a token plus curl was the whole gap
    await this.perms.require(claims, resortId, "rooms.view");
    return this.prisma.roomType.findMany({ where: { resortId }, orderBy: { id: "asc" } });
  }

  async createRoomType(
    claims: JwtClaims,
    resortId: number,
    data: { name: string; maxAdults: number; maxChildren?: number; extraPersonAllowed?: boolean; extraPersonRate?: number; amenities?: string[] },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "rooms.manage");
    const rt = await this.prisma.roomType.create({
      data: {
        resortId,
        name: data.name,
        maxAdults: data.maxAdults,
        maxChildren: data.maxChildren ?? 0,
        extraPersonAllowed: data.extraPersonAllowed ?? false,
        extraPersonRate: data.extraPersonRate ?? 0,
        amenities: data.amenities,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "roomType.create", entity: "roomType", entityId: rt.id, diff: data });
    return rt;
  }

  async updateRoomType(
    claims: JwtClaims,
    id: number,
    data: { name?: string; maxAdults?: number; maxChildren?: number; extraPersonAllowed?: boolean; extraPersonRate?: number; active?: boolean },
  ) {
    const rt0 = await this.prisma.roomType.findUnique({ where: { id } });
    if (!rt0) throw badRequest("room type not found");
    requireResortAccess(claims, rt0.resortId);
    await this.perms.require(claims, rt0.resortId, "rooms.manage");
    const rt = await this.prisma.roomType.update({
      where: { id },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        ...(data.maxAdults != null ? { maxAdults: data.maxAdults } : {}),
        ...(data.maxChildren != null ? { maxChildren: data.maxChildren } : {}),
        ...(data.extraPersonAllowed != null ? { extraPersonAllowed: data.extraPersonAllowed } : {}),
        ...(data.extraPersonRate != null ? { extraPersonRate: data.extraPersonRate } : {}),
        ...(data.active != null ? { active: data.active } : {}),
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId: rt0.resortId, action: "roomType.update", entity: "roomType", entityId: id, diff: data });
    return rt;
  }

  // ── rooms ──
  async listRooms(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "rooms.view");
    return this.prisma.room.findMany({
      where: { resortId },
      include: { roomType: true },
      orderBy: [{ roomTypeId: "asc" }, { name: "asc" }],
    });
  }

  async createRoom(
    claims: JwtClaims,
    resortId: number,
    data: { name: string; roomTypeId: number; baseRate: number },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "rooms.manage");
    // plan cap (soft-SaaS enforcement)
    const limits = await this.planLimits.forResort(resortId);
    const roomCount = await this.prisma.room.count({ where: { resortId } });
    const capError = PlanLimitsService.roomCapError(limits, roomCount);
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
    const existing = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    requireResortAccess(claims, existing.resortId);
    await this.perms.require(claims, existing.resortId, "rooms.manage");
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
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "rooms.manage");
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
