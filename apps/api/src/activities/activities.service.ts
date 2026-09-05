import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest, forbid } from "../common/rbac";
import { dateOnly } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { expandSchedules, slotDateTime, ScheduleRow } from "./schedule";

const LIVE_STATES = ["PENDING", "CONFIRMED", "CHECKED_IN"];

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ── catalog CRUD ──
  async list(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    const now = new Date();
    const rows = await this.prisma.activityCatalog.findMany({
      where: { resortId },
      include: {
        activitySchedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        slots: {
          where: { startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 1,
        },
        _count: { select: { slots: { where: { startsAt: { gte: now } } } } },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      basePrice: Number(a.basePrice),
      durationMin: a.durationMin,
      minPerSlot: a.minPerSlot,
      maxPerSlot: a.maxPerSlot,
      description: a.description,
      active: a.active,
      schedules: a.activitySchedules,
      upcomingSlots: a._count.slots,
      nextSlot: a.slots[0]?.startsAt ?? null,
    }));
  }

  async create(
    claims: JwtClaims,
    resortId: number,
    data: {
      name: string; category: string; basePrice: number; durationMin: number;
      minPerSlot?: number; maxPerSlot?: number; description?: string;
    },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    const cat = await this.prisma.activityCatalog.create({
      data: {
        resortId,
        name: data.name,
        category: data.category as never,
        basePrice: data.basePrice as never,
        durationMin: data.durationMin,
        minPerSlot: data.minPerSlot ?? 1,
        maxPerSlot: data.maxPerSlot ?? 10,
        description: data.description,
      },
    });
    await this.audit.log({ actorId: claims.userId, resortId, action: "activity.create", entity: "activityCatalog", entityId: cat.id, diff: data });
    return cat;
  }

  async update(
    claims: JwtClaims,
    catalogId: number,
    data: Partial<{
      name: string; category: string; basePrice: number; durationMin: number;
      minPerSlot: number; maxPerSlot: number; description: string; active: boolean;
    }>,
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const cat = await this.prisma.activityCatalog.update({
      where: { id: catalogId },
      data: {
        ...(data.basePrice !== undefined ? { basePrice: data.basePrice as never } : {}),
        ...(data.category ? { category: data.category as never } : {}),
        name: data.name,
        durationMin: data.durationMin,
        minPerSlot: data.minPerSlot,
        maxPerSlot: data.maxPerSlot,
        description: data.description,
        active: data.active,
      },
    });
    requireResortAccess(claims, cat.resortId);
    await this.audit.log({ actorId: claims.userId, resortId: cat.resortId, action: "activity.update", entity: "activityCatalog", entityId: catalogId, diff: data });
    return cat;
  }

  /** Replace the weekly schedule template (mgmt). */
  async setSchedules(
    claims: JwtClaims,
    catalogId: number,
    rows: ScheduleRow[],
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const cat = await this.prisma.activityCatalog.findUniqueOrThrow({ where: { id: catalogId } });
    requireResortAccess(claims, cat.resortId);
    for (const r of rows) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime)) {
        throw badRequest(`Invalid time format: ${r.startTime}-${r.endTime} (use HH:MM)`);
      }
      if (r.startTime >= r.endTime) throw badRequest("endTime must be after startTime");
      if (r.capacity < 1) throw badRequest("capacity must be >= 1");
      if (r.weekday < 0 || r.weekday > 6) throw badRequest("weekday 0-6");
    }
    await this.prisma.$transaction([
      this.prisma.activitySchedule.deleteMany({ where: { catalogId } }),
      this.prisma.activitySchedule.createMany({
        data: rows.map((r) => ({
          catalogId,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          capacity: r.capacity,
          active: r.active ?? true,
        })),
      }),
    ]);
    await this.audit.log({ actorId: claims.userId, resortId: cat.resortId, action: "activity.schedules.set", entity: "activityCatalog", entityId: catalogId, diff: { count: rows.length } });
    return { saved: rows.length };
  }

  /** Generate concrete slots from the schedule template for [from, to). */
  async generate(
    claims: JwtClaims,
    catalogId: number,
    fromStr: string,
    toStr: string,
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const cat = await this.prisma.activityCatalog.findUniqueOrThrow({ where: { id: catalogId } });
    requireResortAccess(claims, cat.resortId);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) throw badRequest("to must be after from");
    if ((to.getTime() - from.getTime()) / 86400000 > 366) throw badRequest("max 366 days per run");

    const schedules = await this.prisma.activitySchedule.findMany({ where: { catalogId } });
    if (schedules.length === 0) throw badRequest("Set a weekly schedule first");
    const expanded = expandSchedules(
      schedules.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, active: s.active })),
      from, to,
    );
    const before = await this.prisma.activitySlot.count({ where: { catalogId } });
    await this.prisma.activitySlot.createMany({
      data: expanded.map(({ date, row }) => ({
        catalogId,
        startsAt: slotDateTime(date, row.startTime),
        endsAt: slotDateTime(date, row.endTime),
        capacity: row.capacity,
        bookedCount: 0,
      })),
      skipDuplicates: true,
    });
    const after = await this.prisma.activitySlot.count({ where: { catalogId } });
    await this.audit.log({ actorId: claims.userId, resortId: cat.resortId, action: "activity.slots.generate", entity: "activityCatalog", entityId: catalogId, diff: { from, to, created: after - before } });
    return { created: after - before, matched: expanded.length, totalSlots: after };
  }

  async slotsList(
    claims: JwtClaims,
    resortId: number,
    catalogId: number,
    fromStr: string,
    toStr: string,
    futureOnly: boolean,
  ) {
    requireResortAccess(claims, resortId);
    const cat = await this.prisma.activityCatalog.findFirst({ where: { id: catalogId, resortId } });
    if (!cat) throw Object.assign(new Error("Activity not found"), { status: 404 });
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    const rows = await this.prisma.activitySlot.findMany({
      where: {
        catalogId,
        startsAt: { gte: futureOnly ? new Date() : from, lt: to },
      },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    return rows.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      remaining: Math.max(0, s.capacity - s.bookedCount),
    }));
  }

  async deleteSlot(claims: JwtClaims, slotId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const slot = await this.prisma.activitySlot.findUnique({ where: { id: slotId }, include: { catalog: true } });
    if (!slot) throw Object.assign(new Error("Slot not found"), { status: 404 });
    requireResortAccess(claims, slot.catalog.resortId);
    if (slot.bookedCount > 0) throw badRequest("Slot has bookings");
    if (slot.startsAt <= new Date()) throw badRequest("Cannot delete past/started slots");
    await this.prisma.activitySlot.delete({ where: { id: slotId } });
    return { deleted: true };
  }

  // ── capacity (atomic, MySQL) ──
  /** Returns on success; throws 409 when sold out. Must run inside a tx. */
  async takeSeats(tx: Prisma.TransactionClient, slotId: number, qty: number): Promise<void> {
    const affected = await tx.$executeRaw`
      UPDATE activity_slots SET bookedCount = bookedCount + ${qty}
      WHERE id = ${slotId} AND capacity - bookedCount >= ${qty}`;
    if (affected === 0) {
      const slot = await tx.activitySlot.findUnique({ where: { id: slotId }, select: { capacity: true, bookedCount: true, startsAt: true } });
      throw Object.assign(
        new Error(`Only ${slot ? Math.max(0, slot.capacity - slot.bookedCount) : 0} seat(s) left for that time`),
        { status: 409 },
      );
    }
  }

  async releaseSeats(tx: Prisma.TransactionClient, slotId: number, qty: number): Promise<void> {
    await tx.$executeRaw`
      UPDATE activity_slots SET bookedCount = GREATEST(bookedCount - ${qty}, 0)
      WHERE id = ${slotId}`;
  }

  /** Release every activity hold on a booking (cancel / no-show / delete paths). */
  async releaseBookingActivities(tx: Prisma.TransactionClient, bookingId: number): Promise<void> {
    const items = await tx.bookingItem.findMany({
      where: { bookingId, itemKind: "ACTIVITY", activitySlotId: { not: null } },
      select: { id: true, activitySlotId: true, qty: true },
    });
    for (const item of items) {
      await this.releaseSeats(tx, item.activitySlotId!, item.qty);
    }
  }

  // ── attach / detach activities on bookings ──
  async addToBooking(
    claims: JwtClaims,
    bookingId: number,
    slotId: number,
    qty: number,
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, booking.resortId);
    if (!LIVE_STATES.includes(booking.state)) {
      throw Object.assign(new Error("Booking is not live"), { status: 409 });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.activitySlot.findUnique({
        where: { id: slotId },
        include: { catalog: { select: { id: true, name: true, basePrice: true, active: true } } },
      });
      if (!slot || !slot.catalog.active) throw badRequest("Activity slot not found");
      if (slot.startsAt <= new Date()) throw badRequest("Slot already started");
      await this.takeSeats(tx, slotId, qty);
      const item = await tx.bookingItem.create({
        data: {
          bookingId,
          itemKind: "ACTIVITY",
          activitySlotId: slotId,
          qty,
          unitPrice: slot.catalog.basePrice as never,
        },
      });
      await this.audit.log(
        {
          actorId: claims.userId, resortId: booking.resortId,
          action: "booking.activity.add", entity: "booking", entityId: bookingId,
          diff: { slotId, qty, activity: slot.catalog.name },
        },
        tx,
      );
      return item;
    });
    return { added: true, itemId: result.id };
  }

  async removeFromBooking(claims: JwtClaims, bookingId: number, itemId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, booking.resortId);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.bookingItem.findFirst({
        where: { id: itemId, bookingId, itemKind: "ACTIVITY" },
        include: { activitySlot: { include: { catalog: { select: { name: true } } } } },
      });
      if (!item) throw Object.assign(new Error("Activity item not found"), { status: 404 });
      await tx.bookingItem.delete({ where: { id: item.id } });
      await this.releaseSeats(tx, item.activitySlotId!, item.qty);
      await this.audit.log(
        {
          actorId: claims.userId, resortId: booking.resortId,
          action: "booking.activity.remove", entity: "booking", entityId: bookingId,
          diff: { itemId, activity: item.activitySlot?.catalog.name, qty: item.qty },
        },
        tx,
      );
    });
    return { removed: true };
  }

  /** Future slots for a catalog (public resort page / guest app). */
  async upcomingSlots(catalogId: number, days: number, limit: number) {
    const rows = await this.prisma.activitySlot.findMany({
      where: { catalogId, startsAt: { gte: new Date(), lt: new Date(Date.now() + days * 86400000) } },
      orderBy: { startsAt: "asc" },
      take: limit,
    });
    return rows
      .map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        remaining: Math.max(0, s.capacity - s.bookedCount),
      }))
      .filter((s) => s.remaining > 0);
  }
}
