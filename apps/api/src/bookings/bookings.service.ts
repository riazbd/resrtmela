import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims, BOOKING_CODE_PREFIX } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest, forbid } from "../common/rbac";
import { normalizePhone, phoneKey, dateOnly, nightsBetween, eachNight, round2, today } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { assertTransition } from "./booking-state";
import { AvailabilityService } from "./availability.service";
import { RoomsService } from "../rooms/rooms.service";
import { ActivitiesService } from "../activities/activities.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../notifications/email.service";
import { BookingSource, type BookingState } from "@rh/db";

export interface CreateBookingInput {
  resortId: number;
  roomIds: number[];
  checkIn: string;
  checkOut: string;
  guestId?: number;
  guest?: { fullName: string; phone?: string; nidPassportNo?: string; email?: string };
  adults: number;
  children: number;
  discount?: number;
  remarks?: string;
  source?: BookingSource;
  advancePayment?: { amount: number; method: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK" };
}

export interface RoomBookingTxParams {
  resortId: number;
  guestId: number;
  actorUserId: number;
  agentUserId: number | null;
  source: BookingSource;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  discount: number;
  remarks?: string;
  state: "PENDING" | "CONFIRMED";
  groupTag?: string;
  rooms: { id: number; name: string; roomTypeId: number; baseRate: number }[];
  advancePayment?: { amount: number; method: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK" };
}

function stayDates(inv: { booking: { checkIn: Date | string | null; checkOut: Date | string | null } }): string {
  const fmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "?";
  return `${fmt(inv.booking.checkIn)} → ${fmt(inv.booking.checkOut)}`;
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  // ── computed money (never stored — doc §5.2) ──
  static computeTotals(
    booking: Prisma.BookingGetPayload<{
      include: { items: true; payments: true };
    }>,
  ) {
    let rent = 0;
    let nights = 0;
    for (const item of booking.items) {
      const itemNights =
        item.itemKind === "ROOM" && booking.checkIn && booking.checkOut
          ? nightsBetween(booking.checkIn, booking.checkOut)
          : 1;
      rent += Number(item.unitPrice) * item.qty * itemNights;
      if (item.itemKind === "ROOM") nights = itemNights;
    }
    const discount = Number(booking.discount);
    const paid = booking.payments
      .filter((p) => p.paymentType !== "REFUND")
      .reduce((s, p) => s + Number(p.amount), 0);
    const refunded = booking.payments
      .filter((p) => p.paymentType === "REFUND")
      .reduce((s, p) => s + Number(p.amount), 0);
    const due = round2(rent - discount - paid);
    const paymentState =
      due <= 0.001 && paid > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
    return {
      nights,
      rent: round2(rent),
      discount,
      paid: round2(paid),
      refunded: round2(refunded),
      due,
      paymentState,
    };
  }

  async create(claims: JwtClaims, input: CreateBookingInput) {
    requireResortAccess(claims, input.resortId);
    const checkIn = dateOnly(input.checkIn);
    const checkOut = dateOnly(input.checkOut);
    const nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0) throw badRequest("checkOut must be after checkIn");
    if (input.roomIds.length === 0) throw badRequest("At least one room required");

    // role rules: agents create under their own name, no discount (doc §1)
    const isAgent = claims.role === ROLE.AGENT;
    const guest = claims.role === ROLE.GUEST;
    if (guest) throw forbid("Guests book via the mobile app flow (phase 4)");
    const discount = isAgent ? 0 : Number(input.discount ?? 0);
    let source = input.source ?? BookingSource.DIRECT;
    let agentUserId: number | null = null;
    if (isAgent) {
      source = BookingSource.AGENT;
      agentUserId = claims.userId;
    }

    // resolve guest
    let guestId = input.guestId;
    if (!guestId) {
      if (!input.guest?.fullName) {
        throw badRequest("guestId or guest{fullName} required");
      }
      const phone = input.guest.phone ? normalizePhone(input.guest.phone) : "";
      const key = phoneKey(phone);
      const existing = await this.prisma.guest.findFirst({
        where: { phoneKey: key, resortId: input.resortId },
      });
      if (existing && input.guest.email && !existing.email) {
        await this.prisma.guest.update({ where: { id: existing.id }, data: { email: input.guest.email } });
      }
      guestId = existing
        ? existing.id
        : (
            await this.prisma.guest.create({
              data: {
                resortId: input.resortId,
                fullName: input.guest.fullName,
                email: input.guest.email || null,
                phone,
                nidPassportNo: input.guest.nidPassportNo,
                phoneKey: key,
              },
            })
          ).id;
    } else {
      const g = await this.prisma.guest.findFirst({
        where: { id: guestId, resortId: input.resortId },
      });
      if (!g) throw badRequest("guestId not in this resort");
    }

    // precheck rooms exist in resort
    const roomRows = await this.prisma.room.findMany({
      where: { id: { in: input.roomIds }, resortId: input.resortId, status: "ACTIVE" },
    });
    if (roomRows.length !== input.roomIds.length) {
      throw badRequest("One or more rooms missing/inactive for this resort");
    }

    // fast-fail conflict listing before tx (nice 409 payload)
    const wanted = eachNight(checkIn, nights);
    const preConflicts = await this.prisma.bookingNight.findMany({
      where: {
        roomId: { in: input.roomIds },
        night: { in: wanted },
        item: { booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null } },
      },
      select: { roomId: true, night: true },
    });
    if (preConflicts.length > 0) {
      const names = new Map(roomRows.map((r) => [r.id, r.name]));
      throw Object.assign(
        new Error(
          `Room(s) already booked: ${preConflicts
            .map((c) => `${names.get(c.roomId)} @ ${c.night.toISOString().slice(0, 10)}`)
            .join(", ")}`,
        ),
        { status: 409 },
      );
    }

    const booking = await this.prisma.$transaction((tx) =>
      this.bookRoomsTx(tx, {
        resortId: input.resortId,
        guestId,
        actorUserId: claims.userId,
        agentUserId,
        source,
        checkIn,
        checkOut,
        adults: input.adults,
        children: input.children,
        discount,
        remarks: input.remarks,
        state: isAgent ? "PENDING" : "CONFIRMED",
        rooms: roomRows.map((r) => ({
          id: r.id,
          name: r.name,
          roomTypeId: r.roomTypeId,
          baseRate: Number(r.baseRate),
        })),
        advancePayment: input.advancePayment,
      }),
    );

    await this.audit.log({
      actorId: claims.userId,
      resortId: input.resortId,
      action: "booking.create",
      entity: "booking",
      entityId: booking.id,
      diff: { code: booking.code, roomIds: input.roomIds, checkIn, checkOut },
    });

    await this.notifications.notifyBooking(
      booking.id,
      booking.state === "CONFIRMED" ? "booking_confirmed" : "booking_received",
    );
    return this.detail(claims, booking.id);
  }

  /**
   * Shared room-booking transaction: BK-code counter, booking row, per-room
   * rate resolution (rate plan override → base), booking_nights materialization
   * (UNIQUE guard; P2002 → friendly 409), optional advance payment.
   */
  async bookRoomsTx(tx: Prisma.TransactionClient, p: RoomBookingTxParams) {
    const nights = nightsBetween(p.checkIn, p.checkOut);
    const wanted = eachNight(p.checkIn, nights);

    const counter = await tx.counter.upsert({
      where: { resortId_kind: { resortId: p.resortId, kind: "BOOKING" } },
      create: { resortId: p.resortId, kind: "BOOKING", nextVal: 0 },
      update: { nextVal: { increment: 1 } },
    });
    const code = `${BOOKING_CODE_PREFIX}-${String(counter.nextVal).padStart(5, "0")}`;

    const created = await tx.booking.create({
      data: {
        code,
        resortId: p.resortId,
        kind: "ROOM",
        guestId: p.guestId,
        createdById: p.actorUserId,
        agentUserId: p.agentUserId,
        source: p.source,
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        adults: p.adults,
        children: p.children,
        discount: p.discount as never,
        remarks: p.remarks,
        ...(p.groupTag ? { groupTag: p.groupTag } : {}),
        state: p.state,
      },
    });

    for (const room of p.rooms) {
      const rates = await this.rooms.effectiveRates(
        p.resortId,
        room.roomTypeId,
        wanted,
        room.baseRate,
        tx,
      );
      const unitPrice = rates.length
        ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) / 100
        : room.baseRate;
      const item = await tx.bookingItem.create({
        data: { bookingId: created.id, itemKind: "ROOM", roomId: room.id, qty: 1, unitPrice: unitPrice as never },
      });
      try {
        await tx.bookingNight.createMany({
          data: wanted.map((night) => ({ itemId: item.id, roomId: room.id, night })),
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          throw Object.assign(
            new Error(`Room ${room.name} was just booked for the selected nights`),
            { status: 409 },
          );
        }
        throw e;
      }
    }

    if (p.advancePayment && p.advancePayment.amount > 0) {
      await tx.payment.create({
        data: {
          bookingId: created.id,
          amount: p.advancePayment.amount as never,
          method: p.advancePayment.method,
          paymentType: "ADVANCE",
          receivedById: p.actorUserId,
        },
      });
    }

    return tx.booking.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: true, payments: true },
    });
  }

  async list(
    claims: JwtClaims,
    q: {
      resortId: number;
      state?: BookingState;
      from?: string;
      to?: string;
      guestId?: number;
      source?: BookingSource;
      group?: string;
      mine?: boolean;
      skip?: number;
      take?: number;
    },
  ) {
    requireResortAccess(claims, q.resortId);
    const isAgent = claims.role === ROLE.AGENT;
    const where: Prisma.BookingWhereInput = {
      resortId: q.resortId,
      deletedAt: null,
      ...(q.state ? { state: q.state } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.guestId ? { guestId: q.guestId } : {}),
      ...(isAgent ? { agentUserId: claims.userId } : {}),
      ...(q.group ? { groupTag: q.group } : {}),
      ...(q.from && q.to
        ? { checkIn: { lt: dateOnly(q.to) }, checkOut: { gt: dateOnly(q.from) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          guest: { select: { id: true, fullName: true, phone: true } },
          agentUser: { select: { id: true, name: true } },
          items: { include: { room: { select: { id: true, name: true } } } },
          payments: true,
        },
        orderBy: [{ checkIn: "desc" }, { id: "desc" }],
        skip: q.skip ?? 0,
        take: Math.min(q.take ?? 50, 200),
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((b) => ({
        id: b.id,
        code: b.code,
        state: b.state,
        source: b.source,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guest: b.guest,
        agent: b.agentUser?.name ?? null,
        rooms: b.items.map((i) => i.room?.name).filter(Boolean),
        adults: b.adults,
        children: b.children,
        ...BookingsService.computeTotals(b),
      })),
    };
  }

  async detail(claims: JwtClaims, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        guest: true,
        agentUser: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { room: { include: { roomType: true } }, activitySlot: { include: { catalog: { select: { id: true, name: true } } } }, nights: true } },
        payments: { include: { receivedBy: { select: { id: true, name: true } } }, orderBy: { receivedAt: "asc" } },
      },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);

    const totals = BookingsService.computeTotals(b);
    // persist paymentState so filtered lists stay consistent
    if (totals.paymentState !== b.paymentState) {
      await this.prisma.booking.update({
        where: { id: b.id },
        data: { paymentState: totals.paymentState as never },
      });
    }

    // agents: masked guest PII unless resort allows (doc §1 ⚠)
    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: b.resortId },
      select: { showRatesToAgents: true },
    });
    const isAgent = claims.role === ROLE.AGENT;
    const maskedGuest = isAgent
      ? {
          id: b.guest.id,
          fullName: b.guest.fullName,
          phone: b.guest.phone.slice(0, 6) + "****" + b.guest.phone.slice(-2),
          nidPassportNo: b.guest.nidPassportNo ? "••••" + b.guest.nidPassportNo.slice(-3) : null,
        }
      : b.guest;

    return {
      id: b.id,
      code: b.code,
      resortId: b.resortId,
      kind: b.kind,
      state: b.state,
      cancelState: b.cancelState,
      source: b.source,
      agent: b.agentUser,
      createdBy: b.createdBy,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      adults: b.adults,
      children: b.children,
      remarks: b.remarks,
      guest: maskedGuest,
      items: b.items.map((i) => ({
        id: i.id,
        kind: i.itemKind,
        room: i.room ? { id: i.room.id, name: i.room.name, type: i.room.roomType.name } : null,
        slot: i.activitySlot
          ? { id: i.activitySlot.id, name: i.activitySlot.catalog.name, startsAt: i.activitySlot.startsAt, endsAt: i.activitySlot.endsAt }
          : null,
        qty: i.qty,
        unitPrice: isAgent && !resort.showRatesToAgents ? null : Number(i.unitPrice),
        nights: i.nights.length,
      })),
      payments: b.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        type: p.paymentType,
        receivedBy: p.receivedBy?.name ?? null,
        receivedAt: p.receivedAt,
        note: p.note,
      })),
      ...totals,
    };
  }

  /** Edit rules per doc §1. Date/room changes re-run the availability guard. */
  async update(
    claims: JwtClaims,
    bookingId: number,
    patch: {
      checkIn?: string;
      checkOut?: string;
      roomIds?: number[];
      adults?: number;
      children?: number;
      discount?: number;
      remarks?: string;
    },
  ) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { items: true, payments: true },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);

    const role = claims.role;
    const isAgent = role === ROLE.AGENT;
    if (isAgent) {
      if (b.agentUserId !== claims.userId) throw forbid("Not your booking");
      if (!["PENDING", "CONFIRMED"].includes(b.state)) {
        throw Object.assign(new Error("Editable only before check-in"), { status: 409 });
      }
      if (patch.discount !== undefined) throw forbid("Agents cannot change discount");
    } else if (role === ROLE.FRONT_DESK) {
      if (!["PENDING", "CONFIRMED"].includes(b.state)) {
        throw Object.assign(new Error("Front desk can edit only Pending/Confirmed"), { status: 409 });
      }
    }

    const newCheckIn = patch.checkIn ? dateOnly(patch.checkIn) : b.checkIn;
    const newCheckOut = patch.checkOut ? dateOnly(patch.checkOut) : b.checkOut;
    const newRoomIds = patch.roomIds ?? b.items.map((i) => i.roomId!).filter(Boolean);
    const nights = newCheckIn && newCheckOut ? nightsBetween(newCheckIn, newCheckOut) : 0;
    if (nights <= 0) throw badRequest("Invalid date range");

    const datesChanged =
      (newCheckIn?.getTime() ?? 0) !== (b.checkIn?.getTime() ?? 0) ||
      (newCheckOut?.getTime() ?? 0) !== (b.checkOut?.getTime() ?? 0);
    const roomsChanged =
      JSON.stringify([...newRoomIds].sort()) !==
      JSON.stringify([...b.items.map((i) => i.roomId!).filter(Boolean)].sort());
    const rateChanged = patch.discount !== undefined && Number(b.discount) !== patch.discount;

    await this.prisma.$transaction(async (tx) => {
      if (datesChanged || roomsChanged) {
        // re-materialize nights under the guard
        await tx.bookingNight.deleteMany({ where: { item: { bookingId: b.id } } });
        const wanted = eachNight(newCheckIn!, nights);
        if (roomsChanged) {
          await tx.bookingItem.deleteMany({ where: { bookingId: b.id, itemKind: "ROOM" } });
          for (const roomId of newRoomIds) {
            const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
            const rates = await this.rooms.effectiveRates(
              b.resortId,
              room.roomTypeId,
              wanted,
              Number(room.baseRate),
              tx,
            );
            const unitPrice = round2(rates.reduce((s, r) => s + r, 0) / (rates.length || 1));
            const item = await tx.bookingItem.create({
              data: { bookingId: b.id, itemKind: "ROOM", roomId, qty: 1, unitPrice: unitPrice as never },
            });
            await tx.bookingNight.createMany({
              data: wanted.map((night) => ({ itemId: item.id, roomId, night })),
            });
          }
        } else {
          for (const item of b.items.filter((i) => i.itemKind === "ROOM")) {
            const room = await tx.room.findUniqueOrThrow({ where: { id: item.roomId! } });
            const rates = await this.rooms.effectiveRates(
              b.resortId,
              room.roomTypeId,
              wanted,
              Number(room.baseRate),
              tx,
            );
            const unitPrice = round2(rates.reduce((s, r) => s + r, 0) / (rates.length || 1));
            await tx.bookingItem.update({ where: { id: item.id }, data: { unitPrice: unitPrice as never } });
            await tx.bookingNight.createMany({
              data: wanted.map((night) => ({ itemId: item.id, roomId: item.roomId!, night })),
            });
          }
        }
      }

      const updated = await tx.booking.update({
        where: { id: b.id },
        data: {
          ...(datesChanged ? { checkIn: newCheckIn!, checkOut: newCheckOut! } : {}),
          ...(patch.adults !== undefined ? { adults: patch.adults } : {}),
          ...(patch.children !== undefined ? { children: patch.children } : {}),
          ...(rateChanged ? { discount: patch.discount as never } : {}),
          ...(patch.remarks !== undefined ? { remarks: patch.remarks } : {}),
        },
      });
      await this.audit.log(
        {
          actorId: claims.userId,
          resortId: b.resortId,
          action: "booking.update",
          entity: "booking",
          entityId: b.id,
          diff: { datesChanged, roomsChanged, newRoomIds, patch },
        },
        tx,
      );
      void updated;
    });

    return this.detail(claims, bookingId);
  }

  async transition(claims: JwtClaims, bookingId: number, to: BookingState) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    assertTransition(b.state, to, claims.role);

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { state: to } });
      // nights rows are live holds only — released on cancel / no-show / checkout
      if (to === "CANCELLED" || to === "NO_SHOW" || to === "CHECKED_OUT") {
        await tx.bookingNight.deleteMany({ where: { item: { bookingId: b.id } } });
      }
      if (to === "CANCELLED" || to === "NO_SHOW") {
        await this.activities.releaseBookingActivities(tx, b.id);
      }
      await this.notifications.notifyBooking(b.id, "booking_confirmed");

      await this.audit.log(
        {
          actorId: claims.userId,
          resortId: b.resortId,
          action: `booking.${to.toLowerCase()}`,
          entity: "booking",
          entityId: b.id,
          diff: { from: b.state, to },
        },
        tx,
      );
    });
    return this.detail(claims, bookingId);
  }

  // ── agent cancel-request queue (doc §1 ❌ must request via admin) ──
  async requestCancel(claims: JwtClaims, bookingId: number, reason?: string) {
    if (claims.role !== ROLE.AGENT) throw forbid("Only agents use the request flow");
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    if (b.agentUserId !== claims.userId) throw forbid("Not your booking");
    if (b.cancelState !== "NONE") throw badRequest("A cancel request already exists");
    if (!["PENDING", "CONFIRMED"].includes(b.state)) {
      throw Object.assign(new Error("Booking not in cancellable state"), { status: 409 });
    }
    await this.prisma.booking.update({
      where: { id: b.id },
      data: { cancelState: "REQUESTED", remarks: reason ? `${b.remarks ?? ""}\n[cancel-request] ${reason}`.trim() : b.remarks },
    });
    await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "booking.cancelRequested", entity: "booking", entityId: b.id, diff: { reason } });
    return { requested: true };
  }

  listCancelRequests(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    if (claims.role === ROLE.AGENT) throw forbid("Agents cannot view the queue");
    return this.prisma.booking.findMany({
      where: { resortId, cancelState: "REQUESTED", deletedAt: null },
      include: {
        guest: { select: { id: true, fullName: true } },
        agentUser: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "asc" },
    });
  }

  async decideCancel(claims: JwtClaims, bookingId: number, approve: boolean) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    requireRoles(claims, [
      ROLE.SUPER_ADMIN,
      ROLE.RESORT_ADMIN,
      ROLE.MANAGER,
      ROLE.FRONT_DESK,
    ]);
    if (b.cancelState !== "REQUESTED") throw badRequest("No pending cancel request");

    if (!approve) {
      await this.prisma.booking.update({ where: { id: b.id }, data: { cancelState: "REJECTED" } });
      await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "booking.cancelRejected", entity: "booking", entityId: b.id });
      return { approved: false };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { state: "CANCELLED", cancelState: "APPROVED" } });
      await tx.bookingNight.deleteMany({ where: { item: { bookingId: b.id } } });
      await this.activities.releaseBookingActivities(tx, b.id);
      await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "booking.cancelApproved", entity: "booking", entityId: b.id }, tx);
    });
    return { approved: true };
  }

  /** Soft-delete (admin only) — never hard delete history. */
  async softDelete(claims: JwtClaims, bookingId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { deletedAt: new Date() } });
      await tx.bookingNight.deleteMany({ where: { item: { bookingId: b.id } } });
      await this.activities.releaseBookingActivities(tx, b.id);
      await this.audit.log({ actorId: claims.userId, resortId: b.resortId, action: "booking.delete", entity: "booking", entityId: b.id }, tx);
    });
    return { deleted: true };
  }

  /** Calendar data: bookings overlapping [from,to) — client paints the matrix (doc §3.3). */
  async calendar(claims: JwtClaims, resortId: number, fromStr: string, toStr: string) {
    requireResortAccess(claims, resortId);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) throw badRequest("to must be after from");

    const rows = await this.prisma.booking.findMany({
      where: {
        resortId,
        deletedAt: null,
        checkIn: { lt: to },
        checkOut: { gt: from },
      },
      include: {
        guest: { select: { fullName: true } },
        agentUser: { select: { name: true } },
        items: { include: { room: { select: { id: true, name: true } } } },
      },
      orderBy: { checkIn: "asc" },
    });
    return {
      from,
      to,
      bookings: rows.map((b) => ({
        id: b.id,
        code: b.code,
        state: b.state,
        paymentState: b.paymentState,
        guestName: b.guest.fullName,
        agentName: b.agentUser?.name ?? null,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        rooms: b.items.map((i) => ({ id: i.roomId, name: i.room?.name ?? "?" })),
      })),
    };
  }

  /** Guest directory w/ booking stats (doc §3.5) */
  async guests(claims: JwtClaims, resortId: number, search?: string) {
    requireResortAccess(claims, resortId);
    const guests = await this.prisma.guest.findMany({
      where: {
        resortId,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search } },
                { phone: { contains: search.replace(/\D/g, "") || search } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { bookings: true } } },
      orderBy: { fullName: "asc" },
      take: 200,
    });
    const withLast = await Promise.all(
      guests.map(async (g) => {
        const last = await this.prisma.booking.findFirst({
          where: { guestId: g.id, deletedAt: null },
          orderBy: [{ checkIn: "desc" }, { id: "desc" }],
          select: { checkIn: true, checkOut: true, code: true, state: true },
        });
        return {
          id: g.id,
          fullName: g.fullName,
          phone: g.phone,
          nidPassportNo: g.nidPassportNo,
          bookingCount: g._count.bookings,
          lastStay: last,
        };
      }),
    );
    return withLast;
  }



  /**
   * THE Day Sheet (sheet tabs 7+8+11 computed): per room, for one night.
   * - balance cell: guest + full remaining due, shown on the FIRST night only
   * - revenue per night: (rent - discount) / nights for every covered night
   * - occupancy: BOOKED/AVAILABLE/out-of-service
   * Computed from bookings (not night holds) so history works forever.
   */
  async daySheet(claims: JwtClaims, resortId: number, dateStr: string) {
    requireResortAccess(claims, resortId);
    const date = dateOnly(dateStr);
    const nextDay = new Date(date.getTime() + 86_400_000);

    const rooms = await this.prisma.room.findMany({
      where: { resortId },
      include: { roomType: { select: { maxAdults: true, maxChildren: true } } },
      orderBy: { id: "asc" },
    });

    const stays = await this.prisma.booking.findMany({
      where: {
        resortId,
        deletedAt: null,
        state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
        checkIn: { lt: nextDay },
        checkOut: { gt: date },
      },
      include: {
        guest: { select: { fullName: true } },
        items: true,
        payments: true,
      },
      orderBy: { checkIn: "asc" },
    });

    const expenses = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: { resortId, date },
    });

    const byRoom = new Map<number, typeof stays>();
    for (const b of stays) {
      for (const item of b.items) {
        if (item.itemKind !== "ROOM" || !item.roomId) continue;
        const list = byRoom.get(item.roomId) ?? [];
        list.push(b);
        byRoom.set(item.roomId, list);
      }
    }

    let balanceDue = 0;
    let revenue = 0;
    let arrivals = 0;
    let departures = 0;

    const roomRows = rooms.map((room) => {
      const covering = byRoom.get(room.id) ?? [];
      const b = covering[0];
      let cell: Record<string, unknown> = { mode: room.status === "OUT_OF_SERVICE" ? "oos" : "available" };
      if (b && b.checkIn && b.checkOut) {
        const nights = nightsBetween(b.checkIn, b.checkOut) || 1;
        const t = BookingsService.computeTotals(b);
        const isFirstNight = b.checkIn.getTime() === date.getTime();
        const isLastNight = nextDay.getTime() === b.checkOut.getTime();
        const roomRent = b.items
          .filter((i) => i.itemKind === "ROOM")
          .reduce((s, i) => s + Number(i.unitPrice) * i.qty * nights, 0);
        const perNightRevenue = Math.round(((roomRent - t.discount) / nights) * 100) / 100;
        if (isFirstNight) balanceDue += t.due;
        revenue += perNightRevenue;
        if (isFirstNight) arrivals++;
        if (isLastNight) departures++;
        cell = {
          mode: "booked",
          bookingId: b.id,
          code: b.code,
          state: b.state,
          guestName: b.guest.fullName,
          due: isFirstNight ? t.due : null,
          revenue: perNightRevenue,
          arrives: isFirstNight,
          departs: isLastNight,
        };
      }
      return {
        roomId: room.id,
        name: room.name,
        capacity: room.roomType ? room.roomType.maxAdults + room.roomType.maxChildren : null,
        status: room.status,
        cell,
      };
    });

    revenue = Math.round(revenue * 100) / 100;

    return {
      date,
      rooms: roomRows,
      strip: {
        balanceDue: Math.round(balanceDue * 100) / 100,
        revenue,
        expenses: Number(expenses._sum.amount ?? 0),
        arrivals,
        departures,
        occupancy: rooms.filter((r) => r.status === "ACTIVE" && (byRoom.get(r.id)?.length ?? 0) > 0).length,
        totalRooms: rooms.filter((r) => r.status === "ACTIVE").length,
      },
    };
  }

  /**
   * Tour-group booking (the "Kaktaruya Tour" pattern): one flow creates N
   * one-room bookings sharing a guest, dates, and a group tag. Each keeps its
   * own BK-code, ledger, and lifecycle.
   */
  async createGroupBooking(
    claims: JwtClaims,
    input: {
      resortId: number;
      roomIds: number[];
      checkIn: string;
      checkOut: string;
      guest: { fullName: string; phone?: string; nidPassportNo?: string; email?: string };
      adults: number;
      children?: number;
      discountPerRoom?: number;
      advancePerRoom?: number;
      advanceMethod?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
      remarks?: string;
      source?: BookingSource;
    },
  ) {
    requireResortAccess(claims, input.resortId);
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const checkIn = dateOnly(input.checkIn);
    const checkOut = dateOnly(input.checkOut);
    if (nightsBetween(checkIn, checkOut) <= 0) throw badRequest("checkOut must be after checkIn");
    if (!input.roomIds?.length) throw badRequest("At least one room required");

    // guest resolved once, shared by all rooms
    const phone = input.guest.phone ? normalizePhone(input.guest.phone) : "";
    const key = phone ? phoneKey(phone) : phoneKey("n:" + input.guest.fullName.toLowerCase().trim());
    let guest = await this.prisma.guest.findFirst({
      where: { phoneKey: key, resortId: input.resortId },
    });
    if (!guest) {
      guest = await this.prisma.guest.create({
        data: {
          resortId: input.resortId,
          fullName: input.guest.fullName,
          email: input.guest.email || null,
          phone,
          nidPassportNo: input.guest.nidPassportNo,
          phoneKey: key,
        },
      });
    }

    const roomRows = await this.prisma.room.findMany({
      where: { id: { in: input.roomIds }, resortId: input.resortId, status: "ACTIVE" },
    });
    if (roomRows.length !== input.roomIds.length) {
      throw badRequest("One or more rooms missing/inactive for this resort");
    }
    // conflict precheck across the whole block
    const nights = nightsBetween(checkIn, checkOut);
    const wanted = eachNight(checkIn, nights);
    const pre = await this.prisma.bookingNight.findMany({
      where: {
        roomId: { in: input.roomIds },
        night: { in: wanted },
        item: { booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null } },
      },
      select: { roomId: true, night: true },
    });
    if (pre.length > 0) {
      const names = new Map(roomRows.map((r) => [r.id, r.name]));
      throw Object.assign(
        new Error(`Room(s) already booked: ${pre.map((p) => `${names.get(p.roomId)} @ ${p.night.toISOString().slice(0, 10)}`).join(", ")}`),
        { status: 409 },
      );
    }

    // group tag: sequential per resort
    const groupTag = await this.prisma.$transaction(async (tx) => {
      await tx.counter.upsert({
        where: { resortId_kind: { resortId: input.resortId, kind: "GROUP" } },
        create: { resortId: input.resortId, kind: "GROUP", nextVal: 0 },
        update: {},
      });
      const c = await tx.counter.update({
        where: { resortId_kind: { resortId: input.resortId, kind: "GROUP" } },
        data: { nextVal: { increment: 1 } },
      });
      return `GRP-${String(c.nextVal).padStart(4, "0")}`;
    });

    const created: { id: number; code: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const roomId of input.roomIds) {
        const room = roomRows.find((r) => r.id === roomId)!;
        const b = await this.bookRoomsTx(tx, {
          resortId: input.resortId,
          guestId: guest.id,
          actorUserId: claims.userId,
          agentUserId: null,
          source: input.source ?? BookingSource.DIRECT,
          checkIn,
          checkOut,
          adults: input.adults,
          children: input.children ?? 0,
          discount: input.discountPerRoom ?? 0,
          remarks: input.remarks,
          state: "CONFIRMED",
          groupTag,
          rooms: [{ id: room.id, name: room.name, roomTypeId: room.roomTypeId, baseRate: Number(room.baseRate) }],
          advancePayment:
            input.advancePerRoom && input.advancePerRoom > 0
              ? { amount: input.advancePerRoom, method: input.advanceMethod ?? "CASH" }
              : undefined,
        });
        created.push({ id: b.id, code: b.code });
      }
      await this.audit.log(
        {
          actorId: claims.userId,
          resortId: input.resortId,
          action: "booking.group.create",
          entity: "booking",
          diff: { groupTag, codes: created.map((x) => x.code), rooms: input.roomIds },
        },
        tx,
      );
    });

    return { groupTag, count: created.length, bookings: created };
  }

  /** Email the invoice to the guest (requires guest email on record). */
  async emailInvoice(claims: JwtClaims, bookingId: number) {
    // ensure the invoice exists first (payload requires invoiceNo)
    const existing = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { invoiceNo: true },
    });
    if (!existing) throw Object.assign(new Error("Booking not found"), { status: 404 });
    if (!existing.invoiceNo) await this.generateInvoice(claims, bookingId);

    const inv = await this.invoicePayload(claims, bookingId);
    const guestEmail = (inv.guest as unknown as { email?: string }).email ?? null;
    if (!guestEmail) {
      throw Object.assign(new Error("Guest has no email on record"), { status: 400 });
    }
    const money = (n: number) => `৳${n.toLocaleString("en-IN")}`;
    const rows = inv.items
      .map(
        (i) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.description}${i.nights ? ` × ${i.nights}n` : ""}</td><td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eee">${i.qty}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee">${money(i.unitPrice)}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee">${money(i.amount)}</td></tr>`,
      )
      .join("");
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a">
        <h2 style="color:#166534">${inv.resort.name}</h2>
        <p>Invoice <b>${inv.invoiceNo}</b> · ${inv.booking.code}<br/>
        ${inv.guest.fullName} · ${stayDates(inv)}<br/>
        Check-in ${inv.resort.checkInTime} · Check-out ${inv.resort.checkOutTime}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f0fdf4"><th style="text-align:left;padding:6px 8px">Description</th><th style="padding:6px 8px">Qty</th><th style="text-align:right;padding:6px 8px">Rate</th><th style="text-align:right;padding:6px 8px">Amount</th></tr>
          ${rows}
        </table>
        <p style="text-align:right">Rent ${money(inv.rent)}<br/>${inv.discount ? `Discount ${money(inv.discount)}<br/>` : ""}${inv.paid ? `Paid ${money(inv.paid)}<br/>` : ""}<b style="font-size:16px">Due ${money(inv.due)}</b></p>
        <p style="color:#64748b;font-size:12px">${inv.resort.location ?? ""} — Thank you for staying with us! / অবস্থানের জন্য ধন্যবাদ!</p>
      </div>`;
    const r = await this.email.send(
      guestEmail,
      `${process.env.SMTP_SUBJECT_PREFIX ?? "Resort Mela"}: Invoice ${inv.invoiceNo} (${inv.booking.code})`,
      html,
      inv.resort.name,
    );
    if (!inv.invoiceNo) await this.generateInvoice(claims, bookingId);
    await this.audit.log({
      actorId: claims.userId,
      resortId: inv.resort.id,
      action: "booking.invoice.emailed",
      entity: "booking",
      entityId: bookingId,
      diff: { to: guestEmail, sent: r.sent },
    });
    return { to: guestEmail, sent: r.sent, error: r.error ?? (r.sent ? undefined : "SMTP not configured — logged to console") };
  }
  /** Generate the resort invoice for a booking (SER-##### per resort). */
  async generateInvoice(claims: JwtClaims, bookingId: number) {
    requireRoles(claims, [
      ROLE.SUPER_ADMIN,
      ROLE.RESORT_ADMIN,
      ROLE.MANAGER,
      ROLE.FRONT_DESK,
    ]);
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { items: true, payments: true },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    if (b.invoiceNo) return this.invoicePayload(claims, bookingId);
    if (["CANCELLED", "NO_SHOW"].includes(b.state)) {
      throw badRequest("Cannot invoice a cancelled/no-show booking");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const resort = await tx.resort.findUniqueOrThrow({
        where: { id: b.resortId },
        select: { invoicePrefix: true },
      });
      await tx.counter.upsert({
        where: { resortId_kind: { resortId: b.resortId, kind: "INVOICE" } },
        create: { resortId: b.resortId, kind: "INVOICE", nextVal: 0 },
        update: {},
      });
      const counter = await tx.counter.update({
        where: { resortId_kind: { resortId: b.resortId, kind: "INVOICE" } },
        data: { nextVal: { increment: 1 } },
      });
      const invoiceNo = `${resort.invoicePrefix}-${String(counter.nextVal).padStart(5, "0")}`;
      return tx.booking.update({
        where: { id: b.id },
        data: { invoiceNo, invoiceAt: new Date() },
      });
    });
    await this.audit.log({
      actorId: claims.userId, resortId: b.resortId,
      action: "booking.invoice.generate", entity: "booking", entityId: bookingId,
      diff: { invoiceNo: updated.invoiceNo },
    });
    return this.invoicePayload(claims, bookingId);
  }

  async invoicePayload(claims: JwtClaims, bookingId: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        resort: true,
        guest: true,
        items: { include: { room: { include: { roomType: true } }, activitySlot: { include: { catalog: { select: { name: true } } } } } },
        payments: { include: { receivedBy: { select: { name: true } } } },
        agentUser: { select: { name: true } },
      },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    if (!b.invoiceNo) throw Object.assign(new Error("Invoice not generated yet"), { status: 404 });
    const totals = BookingsService.computeTotals(b);
    return {
      invoiceNo: b.invoiceNo,
      issuedAt: b.invoiceAt,
      resort: {
        id: b.resort.id,
        name: b.resort.name,
        location: b.resort.location,
        address: b.resort.address,
        phone: b.resort.contactPhone,
        website: b.resort.website,
        checkInTime: b.resort.checkInTime,
        checkOutTime: b.resort.checkOutTime,
      },
      booking: {
        code: b.code,
        state: b.state,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        nights: BookingsService.computeTotals(b).nights,
        adults: b.adults,
        children: b.children,
        remarks: b.remarks,
        agent: b.agentUser?.name ?? null,
      },
      guest: { fullName: b.guest.fullName, phone: b.guest.phone, nidPassportNo: b.guest.nidPassportNo, email: b.guest.email },
      items: b.items.map((i) => ({
        description:
          i.itemKind === "ROOM"
            ? `${i.room?.name ?? "Room"} (${i.room?.roomType.name ?? ""})`
            : `${i.activitySlot?.catalog.name ?? "Activity"} � ${i.qty}`,
        nights: i.itemKind === "ROOM" ? totals.nights : null,
        qty: i.qty,
        unitPrice: Number(i.unitPrice),
        amount: round2(Number(i.unitPrice) * i.qty * (i.itemKind === "ROOM" ? totals.nights : 1)),
      })),
      payments: b.payments.map((p) => ({
        date: p.receivedAt,
        method: p.method,
        type: p.paymentType,
        amount: Number(p.amount),
        receivedBy: p.receivedBy?.name ?? null,
      })),
      ...totals,
    };
  }

  // today dashboard feed
  async today(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    const t = today();
    const rows = await this.prisma.booking.findMany({
      where: {
        resortId,
        deletedAt: null,
        OR: [{ checkIn: t }, { checkOut: t }],
      },
      include: {
        guest: { select: { fullName: true, phone: true } },
        agentUser: { select: { name: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
    });
    const withTotals = rows.map((b) => ({
      id: b.id,
      code: b.code,
      arriving: b.checkIn?.getTime() === t.getTime(),
      departing: b.checkOut?.getTime() === t.getTime(),
      guest: b.guest,
      agent: b.agentUser?.name,
      rooms: b.items.map((i) => i.room?.name),
      state: b.state,
      ...BookingsService.computeTotals(b),
    }));
    const occupied = await this.prisma.bookingNight.count({
      where: { night: t, item: { booking: { resortId, state: "CHECKED_IN", deletedAt: null } } },
    });
    const totalRooms = await this.prisma.room.count({ where: { resortId } });
    const dues = withTotals.filter((b) => b.arriving && b.due > 0);
    return {
      arrivals: withTotals.filter((b) => b.arriving),
      departures: withTotals.filter((b) => b.departing),
      occupancyPct: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
      duesTotal: round2(dues.reduce((s, b) => s + b.due, 0)),
      duesCount: dues.length,
    };
  }
}