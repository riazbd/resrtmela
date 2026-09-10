import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { badRequest, forbid } from "../common/rbac";
import { anonGuestKey, dateOnly, nightsBetween, normalizePhone, phoneKey, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { TaxService } from "../common/tax.service";
import { BookingsService } from "../bookings/bookings.service";
import { RoomsService } from "../rooms/rooms.service";
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
    @Inject(TaxService) private readonly tax: TaxService,
  ) {}

  private async assertGuest(claims: JwtClaims) {
    if (claims.role !== ROLE.GUEST) throw forbid("Guest app only");
  }

  /** Guest rows tied to this user's phone (incl. sheet-imported history). */
  private async myGuestIds(claims: JwtClaims): Promise<number[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
    /**
     * No phone number is not an identity.
     *
     * `phoneKey("")` is a constant — sha256 of the empty string — and the desk
     * writes exactly that key for any walk-in taken without a number. So a user
     * who signed up by email, whose `phone` is null, used to match every
     * phone-less guest row on the platform and was handed all of their stays.
     * The match is deliberately cross-resort (one guest, many resorts); it must
     * therefore be a real number or nothing.
     */
    const normalized = normalizePhone(user.phone ?? "");
    if (!normalized) return [];
    const rows = await this.prisma.guest.findMany({
      where: { phoneKey: phoneKey(normalized) },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ── discovery ──
  async discover() {
    const resorts = await this.prisma.resort.findMany({
      where: { status: "active" },
      select: {
        id: true, name: true, location: true, currency: true,
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
        // a bare number is not a price; the guest app had its own formatter
        // stamping "Tk" on every figure because nothing ever told it otherwise
        currency: r.currency,
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
      currency: resort.currency,
      /**
       * How to reach the resort.
       *
       * Added when guests stopped being able to book for themselves. The page
       * now says "call the resort", and a page that says that without a number
       * on it is a dead end. Public detail already carried these for the v1
       * API; the guest app was the one screen that could not see them.
       */
      contactPhone: resort.contactPhone,
      address: resort.address,
      website: resort.website,
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
  async availability(claims: JwtClaims | null | undefined, resortId: number, fromStr: string, toStr: string) {
    // public before login: any visitor may browse availability; guests still get it post-login
    if (claims?.userId) await this.assertGuest(claims);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) throw badRequest("Check-out must be after check-in");

    const rooms = await this.prisma.room.findMany({
      where: { resortId, status: "ACTIVE", deletedAt: null },
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

  /**
   * The app cannot book. It asks, and is told who can.
   *
   * This used to pick free rooms and call `bookRoomsTx` directly, which put a
   * PENDING hold on real nights — inventory off the market on a stranger's say
   * so, with nobody at the resort consulted. A stay is sold by the resort or by
   * an agent; the platform carries the conversation, it does not make the sale.
   *
   * Kept as a refusal rather than deleted because the shipped mobile app still
   * has the button and cannot be updated. It gets a sentence it can display.
   */
  async createBooking(claims: JwtClaims, _input: unknown): Promise<never> {
    await this.assertGuest(claims);
    throw forbid(
      "Rooms are booked by the resort. Call the resort or your travel agent to hold these dates.",
    );
  }



  /** Tax rules for several resorts at once — a guest's trips can span them. */
  private async taxRulesByResort(resortIds: number[]) {
    const unique = [...new Set(resortIds)];
    const pairs = await Promise.all(
      unique.map(async (id) => [id, await this.tax.rulesFor(id)] as const),
    );
    return new Map(pairs);
  }

  async trips(claims: JwtClaims) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const rows = await this.prisma.booking.findMany({
      where: { guestId: { in: guestIds }, deletedAt: null },
      include: {
        resort: { select: { id: true, name: true, taxRatePct: true, currency: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
      orderBy: [{ checkIn: "desc" }, { id: "desc" }],
    });
    // one lookup per resort, not one per stay: a guest's trips can span resorts
    const rulesByResort = await this.taxRulesByResort(rows.map((b) => b.resortId));
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      resortId: b.resort.id,
      resortName: b.resort.name,
      currency: b.resort.currency,
      state: b.state,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      rooms: b.items.map((i) => i.room?.name).filter(Boolean),
      ...BookingsService.computeTotals(b, rulesByResort.get(b.resortId) ?? []),
    }));
  }

  async tripDetail(claims: JwtClaims, bookingId: number) {
    await this.assertGuest(claims);
    const guestIds = await this.myGuestIds(claims);
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        resort: { select: { id: true, name: true, location: true, taxRatePct: true } },
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
      ...BookingsService.computeTotals(b, await this.tax.rulesFor(b.resortId)),
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
