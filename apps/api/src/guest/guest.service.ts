import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { badRequest, forbid } from "../common/rbac";
import { dateOnly, nightsBetween, normalizePhone, phoneKey, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import { RoomsService } from "../rooms/rooms.service";
import { BookingSource } from "@rh/db";
import { ActivitiesService } from "../activities/activities.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class GuestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async assertGuest(claims: JwtClaims) {
    if (claims.role !== ROLE.GUEST) throw forbid("Guest app only");
  }

  /** Guest rows tied to this user's phone (incl. sheet-imported history). */
  private async myGuestIds(claims: JwtClaims): Promise<number[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
    const key = phoneKey(normalizePhone(user.phone));
    const rows = await this.prisma.guest.findMany({ where: { phoneKey: key }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  // ── discovery ──
  async discover() {
    const resorts = await this.prisma.resort.findMany({
      where: { status: "active" },
      select: {
        id: true, name: true, location: true,
        roomTypes: { select: { id: true, name: true, maxAdults: true, maxChildren: true, rooms: { where: { status: "ACTIVE" }, select: { baseRate: true } } } },
        _count: { select: { rooms: true } },
      },
      orderBy: { name: "asc" },
    });
    return resorts
      .map((r) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        roomCount: r._count.rooms,
        roomTypes: r.roomTypes.map((t) => ({
          id: t.id,
          name: t.name,
          maxAdults: t.maxAdults,
          maxChildren: t.maxChildren,
          priceFrom: t.rooms.length ? Math.min(...t.rooms.map((x) => Number(x.baseRate))) : null,
        })),
      }))
      .filter((r) => r.roomCount > 0);
  }

  async resortDetail(resortId: number) {
    const resort = await this.prisma.resort.findFirst({
      where: { id: resortId, status: "active" },
      include: {
        roomTypes: {
          include: { rooms: { where: { status: "ACTIVE" }, select: { baseRate: true } } },
        },
        activities: { where: { active: true }, select: { id: true, name: true, category: true, basePrice: true, durationMin: true } },
      },
    });
    if (!resort) throw Object.assign(new Error("Resort not found"), { status: 404 });
    return {
      id: resort.id,
      name: resort.name,
      location: resort.location,
      roomTypes: resort.roomTypes.map((t) => ({
        id: t.id,
        name: t.name,
        maxAdults: t.maxAdults,
        maxChildren: t.maxChildren,
        amenities: t.amenities ?? [],
        priceFrom: t.rooms.length ? Math.min(...t.rooms.map((x) => Number(x.baseRate))) : null,
        totalRooms: t.rooms.length,
      })),
      activities: resort.activities.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        price: Number(a.basePrice),
        durationMin: a.durationMin,
      })),
    };
  }

  /** Availability by room type for [from,to) — count of free rooms + effective price. */
  async availability(claims: JwtClaims, resortId: number, fromStr: string, toStr: string) {
    await this.assertGuest(claims);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) throw badRequest("Check-out must be after check-in");

    const rooms = await this.prisma.room.findMany({
      where: { resortId, status: "ACTIVE" },
      include: { roomType: { select: { id: true, name: true, maxAdults: true, maxChildren: true } } },
    });
    if (rooms.length === 0) return [];

    const busy = await this.prisma.bookingNight.findMany({
      where: {
        night: { gte: from, lt: to },
        room: { resortId },
        item: { booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null } },
      },
      select: { roomId: true },
    });
    const busySet = new Set(busy.map((b) => b.roomId));

    const nights = nightsBetween(from, to);
    const byType = new Map<number, {
      roomTypeId: number; name: string; maxAdults: number; maxChildren: number;
      total: number; available: number; sampleRoomId: number; baseRate: number;
    }>();

    for (const room of rooms) {
      const entry = byType.get(room.roomTypeId) ?? {
        roomTypeId: room.roomTypeId,
        name: room.roomType.name,
        maxAdults: room.roomType.maxAdults,
        maxChildren: room.roomType.maxChildren,
        total: 0,
        available: 0,
        sampleRoomId: room.id,
        baseRate: Number(room.baseRate),
      };
      entry.total++;
      if (!busySet.has(room.id)) entry.available++;
      if (Number(room.baseRate) < entry.baseRate) {
        entry.baseRate = Number(room.baseRate);
        entry.sampleRoomId = room.id;
      }
      byType.set(room.roomTypeId, entry);
    }

    const out = [];
    for (const t of byType.values()) {
      const sample = rooms.find((r) => r.id === t.sampleRoomId)!;
      const rates = await this.rooms.effectiveRates(
        resortId, t.roomTypeId,
        Array.from({ length: nights }, (_, i) => new Date(from.getTime() + i * 86_400_000)),
        Number(sample.baseRate),
      );
      out.push({
        roomTypeId: t.roomTypeId,
        name: t.name,
        maxAdults: t.maxAdults,
        maxChildren: t.maxChildren,
        total: t.total,
        available: t.available,
        pricePerNight: round2(rates.reduce((s, r) => s + r, 0) / (rates.length || 1)),
      });
    }
    return out;
  }

  /** Book from the app: picks free rooms of the requested types. PENDING + pay-at-resort. */
  async createBooking(
    claims: JwtClaims,
    input: {
      resortId: number;
      items: { roomTypeId: number; qty: number }[];
      checkIn: string;
      checkOut: string;
      adults: number;
      children: number;
      fullName?: string;
      remarks?: string;
    },
  ) {
    await this.assertGuest(claims);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
    const resort = await this.prisma.resort.findFirst({
      where: { id: input.resortId, status: "active" },
    });
    if (!resort) throw badRequest("Resort not available");

    const checkIn = dateOnly(input.checkIn);
    const checkOut = dateOnly(input.checkOut);
    const nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0) throw badRequest("Check-out must be after check-in");
    if (!input.items?.length) throw badRequest("Select at least one room");

    // my guest identity in this resort
    const phone = normalizePhone(user.phone);
    const key = phoneKey(phone);
    let guest = await this.prisma.guest.findFirst({
      where: { phoneKey: key, resortId: input.resortId },
    });
    if (!guest) {
      guest = await this.prisma.guest.create({
        data: {
          resortId: input.resortId,
          fullName: input.fullName?.trim() || user.name,
          phone,
          phoneKey: key,
          isGuestUser: true,
        },
      });
    } else if (input.fullName?.trim() && input.fullName.trim() !== guest.fullName) {
      await this.prisma.guest.update({ where: { id: guest.id }, data: { fullName: input.fullName.trim() } });
    }
    if (user.name === user.phone && input.fullName?.trim()) {
      await this.prisma.user.update({ where: { id: user.id }, data: { name: input.fullName.trim() } });
    }

    // pick free rooms per requested type/qty
    const wanted = Array.from({ length: nights }, (_, i) => new Date(checkIn.getTime() + i * 86_400_000));
    const picked: { id: number; name: string; roomTypeId: number; baseRate: number }[] = [];
    for (const item of input.items) {
      if (item.qty <= 0) continue;
      const typeRooms = await this.prisma.room.findMany({
        where: { resortId: input.resortId, roomTypeId: item.roomTypeId, status: "ACTIVE" },
        orderBy: { id: "asc" },
      });
      if (typeRooms.length === 0) throw badRequest("Room type not available");
      const holds = await this.prisma.bookingNight.findMany({
        where: {
          roomId: { in: typeRooms.map((r) => r.id) },
          night: { in: wanted },
          item: { booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null } },
        },
        select: { roomId: true },
      });
      const busySet = new Set(holds.map((h) => h.roomId));
      const free = typeRooms.filter((r) => !busySet.has(r.id));
      if (free.length < item.qty) {
        throw Object.assign(
          new Error(`Only ${free.length} × ${typeRooms[0]!.name} left for those dates`),
          { status: 409 },
        );
      }
      for (const r of free.slice(0, item.qty)) {
        picked.push({ id: r.id, name: r.name, roomTypeId: r.roomTypeId, baseRate: Number(r.baseRate) });
      }
    }

    const booking = await this.prisma.$transaction((tx) =>
      this.bookings.bookRoomsTx(tx, {
        resortId: input.resortId,
        guestId: guest.id,
        actorUserId: user.id,
        agentUserId: null,
        source: BookingSource.APP,
        checkIn,
        checkOut,
        adults: input.adults,
        children: input.children ?? 0,
        discount: 0,
        remarks: input.remarks ?? "booked via app — pay at resort",
        state: "PENDING",
        rooms: picked,
      }),
    );

    await this.audit.log({
      actorId: user.id,
      resortId: input.resortId,
      action: "guest.booking.create",
      entity: "booking",
      entityId: booking.id,
      diff: { code: booking.code, rooms: picked.map((r) => r.name) },
    });

    await this.notifications.notifyBooking(booking.id, "booking_received");
    return this.tripDetail(claims, booking.id);
  }

  async trips(claims: JwtClaims) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const rows = await this.prisma.booking.findMany({
      where: { guestId: { in: guestIds }, deletedAt: null },
      include: {
        resort: { select: { id: true, name: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
      orderBy: [{ checkIn: "desc" }, { id: "desc" }],
    });
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      resortId: b.resort.id,
      resortName: b.resort.name,
      state: b.state,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      rooms: b.items.map((i) => i.room?.name).filter(Boolean),
      ...BookingsService.computeTotals(b),
    }));
  }

  async tripDetail(claims: JwtClaims, bookingId: number) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        resort: { select: { id: true, name: true, location: true } },
        items: {
          include: {
            room: { select: { name: true } },
            activitySlot: { include: { catalog: { select: { id: true, name: true } } } },
          },
        },
        payments: true,
      },
    });
    if (!b || b.deletedAt || !guestIds.includes(b.guestId)) {
      throw Object.assign(new Error("Booking not found"), { status: 404 });
    }
    return {
      id: b.id,
      code: b.code,
      resort: b.resort,
      state: b.state,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      adults: b.adults,
      children: b.children,
      rooms: b.items.filter((i) => i.itemKind === "ROOM").map((i) => i.room?.name).filter(Boolean),
      activities: b.items
        .filter((i) => i.itemKind === "ACTIVITY" && i.activitySlot)
        .map((i) => ({
          itemId: i.id,
          name: i.activitySlot!.catalog.name,
          startsAt: i.activitySlot!.startsAt,
          endsAt: i.activitySlot!.endsAt,
          qty: i.qty,
          unitPrice: Number(i.unitPrice),
        })),
      remarks: b.remarks,
      payments: b.payments.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, type: p.paymentType, receivedAt: p.receivedAt })),
      ...BookingsService.computeTotals(b),
    };
  }

  /** Guest cancels their own booking while still PENDING (pre-confirmation). */
  async cancelOwn(claims: JwtClaims, bookingId: number) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt || !guestIds.includes(b.guestId)) {
      throw Object.assign(new Error("Booking not found"), { status: 404 });
    }
    if (b.state !== "PENDING") {
      throw Object.assign(
        new Error("Confirmed bookings can no longer be cancelled in-app — contact the resort"),
        { status: 409 },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { state: "CANCELLED" } });
      await tx.bookingNight.deleteMany({ where: { item: { bookingId: b.id } } });
      await this.activities.releaseBookingActivities(tx, b.id);
      await this.audit.log(
        { actorId: claims.userId, resortId: b.resortId, action: "guest.booking.cancelled", entity: "booking", entityId: b.id },
        tx,
      );
    });
    return { cancelled: true };
  }

  // ── activities: browse slots + add to stay ──

  upcomingActivitySlots(catalogId: number, days = 7) {
    return this.activities.upcomingSlots(catalogId, days, 50);
  }

  /** Add activity seats to one of the guest's own live bookings. */
  async addActivityToTrip(claims: JwtClaims, bookingId: number, slotId: number, qty: number) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt || !guestIds.includes(b.guestId)) {
      throw Object.assign(new Error("Booking not found"), { status: 404 });
    }
    if (!["PENDING", "CONFIRMED"].includes(b.state)) {
      throw Object.assign(new Error("Trip is no longer changeable"), { status: 409 });
    }

    await this.prisma.$transaction(async (tx) => {
      const slot = await tx.activitySlot.findUnique({
        where: { id: slotId },
        include: { catalog: { select: { id: true, name: true, basePrice: true, active: true, resortId: true } } },
      });
      if (!slot || !slot.catalog.active || slot.catalog.resortId !== b.resortId) {
        throw badRequest("Activity slot not found at this resort");
      }
      if (slot.startsAt <= new Date()) throw badRequest("That time has already passed");
      await this.activities.takeSeats(tx, slotId, qty);
      await tx.bookingItem.create({
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
          actorId: claims.userId, resortId: b.resortId,
          action: "guest.activity.add", entity: "booking", entityId: bookingId,
          diff: { slotId, qty, activity: slot.catalog.name },
        },
        tx,
      );
    });
    return this.tripDetail(claims, bookingId);
  }

  /** Remove an activity the guest added (before it starts). */
  async removeActivityFromTrip(claims: JwtClaims, bookingId: number, itemId: number) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt || !guestIds.includes(b.guestId)) {
      throw Object.assign(new Error("Booking not found"), { status: 404 });
    }
    if (!["PENDING", "CONFIRMED"].includes(b.state)) {
      throw Object.assign(new Error("Trip is no longer changeable"), { status: 409 });
    }
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.bookingItem.findFirst({
        where: { id: itemId, bookingId, itemKind: "ACTIVITY" },
        include: { activitySlot: { select: { startsAt: true } } },
      });
      if (!item) throw Object.assign(new Error("Activity not found on this trip"), { status: 404 });
      if (item.activitySlot && item.activitySlot.startsAt <= new Date()) {
        throw badRequest("Activity already started");
      }
      await tx.bookingItem.delete({ where: { id: item.id } });
      await this.activities.releaseSeats(tx, item.activitySlotId!, item.qty);
      await this.audit.log(
        {
          actorId: claims.userId, resortId: b.resortId,
          action: "guest.activity.remove", entity: "booking", entityId: bookingId,
          diff: { itemId, qty: item.qty },
        },
        tx,
      );
    });
    return this.tripDetail(claims, bookingId);
  }
}
