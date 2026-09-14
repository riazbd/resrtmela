/**
 * `/v1` — what a resort's own website may do (2026-09-15 design).
 *
 * One sentence holds this up: **there is one booking engine, and this is a
 * caller of it.** Nothing here writes a booking row, a night row or a payment
 * row of its own; the guarantee that two guests never get the same room on the
 * same night is a `UNIQUE` constraint reached through `BookingsService`, and a
 * second door into that table is two families arriving for one room.
 *
 * Reading is the published view — the same module the resort's brochure renders
 * — so the site and the API cannot quote different prices.
 */
import { Inject, Injectable } from "@nestjs/common";
import { roomTypeKeys, ROLE, type JwtClaims, type PublishedResort, type PublishedVacancy } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PublishedSiteService } from "../site/published-site.service";
import { BookingsService } from "../bookings/bookings.service";
import { SYSTEM_ACTOR_ID, badRequest, forbid } from "../common/rbac";
import { ApiKeyService, type ApiCaller } from "./api-key.service";

/** A booking as a resort's own website asks for one: a kind of room, not a room. */
export interface V1BookingOrder {
  roomType: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  guest: { fullName: string; phone?: string; email?: string };
  remarks?: string;
}

/** What `/v1` says back about a booking. No ids, no room, no other guest. */
export interface V1Booking {
  code: string;
  state: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  total: number;
  paid: number;
  currency: string;
  guest: { fullName: string; phone: string | null };
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class V1Service {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublishedSiteService) private readonly published: PublishedSiteService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(ApiKeyService) private readonly keys: ApiKeyService,
  ) {}

  private must(caller: ApiCaller, scope: "read" | "write"): void {
    if (!this.keys.may(caller, scope)) {
      throw forbid(`This key may only ${caller.scopes.join(" and ")}.`);
    }
  }

  /** The resort's own slug — a key names one resort and cannot ask about another. */
  private async slug(caller: ApiCaller): Promise<string> {
    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: caller.resortId },
      select: { slug: true },
    });
    return resort.slug;
  }

  /**
   * Everything a site needs to draw its own pages.
   *
   * Answered whether or not the resort publishes a brochure with us: publishing
   * is about the brochure, and a resort with its own website may never want
   * one. `forApi` is the published view with that one gate lifted and every
   * other rule — no room ids, no register — exactly as it is for a stranger.
   */
  async resort(caller: ApiCaller): Promise<PublishedResort> {
    this.must(caller, "read");
    return this.published.forApi(caller.resortId);
  }

  async vacancy(caller: ApiCaller, from: string, to: string): Promise<PublishedVacancy[]> {
    this.must(caller, "read");
    return this.published.vacancyFor(caller.resortId, from, to);
  }

  /**
   * Books a kind of room, and chooses which one.
   *
   * The caller never names a room. An API that takes a room id is an API that
   * lets a stranger enumerate a resort's inventory one number at a time, and a
   * website has no business knowing that room 102 exists.
   */
  async book(caller: ApiCaller, idempotencyKey: string, order: V1BookingOrder): Promise<V1Booking> {
    this.must(caller, "write");
    const key = String(idempotencyKey ?? "").trim();
    if (!key) {
      throw badRequest(
        "Send an Idempotency-Key header. A request that times out is not a request that failed, and without one a retry books the room twice.",
      );
    }
    if (key.length > 120) throw badRequest("That Idempotency-Key is too long — 120 characters at most.");

    /**
     * The same key twice is the same booking.
     *
     * Read first so a genuine retry is cheap and gets the same answer; the
     * unique index underneath is what makes it correct when two retries arrive
     * at once, which is exactly when they do.
     */
    const before = await this.prisma.booking.findFirst({
      where: { resortId: caller.resortId, idempotencyKey: key },
    });
    if (before) {
      if (!sameOrder(before, order)) {
        throw Object.assign(
          new Error("That Idempotency-Key was used for a different booking. Use a new one."),
          { status: 409 },
        );
      }
      return this.render(before.code, caller.resortId);
    }

    const type = await this.roomType(caller.resortId, order.roomType);
    const roomId = await this.freeRoom(caller.resortId, type.id, order.checkIn, order.checkOut);
    if (roomId == null) {
      throw Object.assign(
        new Error(`No ${type.name} is free for those nights.`),
        { status: 409 },
      );
    }

    const claims: JwtClaims = {
      // not a person: the booking's `createdById` is null, and the key is what
      // says where it came from
      userId: SYSTEM_ACTOR_ID,
      role: ROLE.RESORT_ADMIN,
      resortIds: [caller.resortId],
      apiKeyId: caller.keyId,
    };

    try {
      const made = (await this.bookings.create(claims, {
        resortId: caller.resortId,
        roomIds: [roomId],
        checkIn: order.checkIn,
        checkOut: order.checkOut,
        adults: order.adults,
        children: order.children ?? 0,
        guest: { fullName: order.guest.fullName, phone: order.guest.phone, email: order.guest.email },
        remarks: order.remarks,
        idempotencyKey: key,
      })) as { code: string };
      return this.render(made.code, caller.resortId);
    } catch (e) {
      // two retries arriving together: the index caught the second, and the
      // first one's booking is the answer both of them wanted
      if ((e as { code?: string }).code === "P2002") {
        const won = await this.prisma.booking.findFirst({
          where: { resortId: caller.resortId, idempotencyKey: key },
        });
        if (won) return this.render(won.code, caller.resortId);
      }
      throw e;
    }
  }

  async booking(caller: ApiCaller, code: string): Promise<V1Booking> {
    this.must(caller, "read");
    return this.render(code, caller.resortId);
  }

  /** Calls it off through the state machine, so the nights come back. */
  async cancel(caller: ApiCaller, code: string): Promise<V1Booking> {
    this.must(caller, "write");
    const row = await this.prisma.booking.findFirst({
      where: { code, resortId: caller.resortId, deletedAt: null },
      select: { id: true },
    });
    if (!row) throw Object.assign(new Error("No such booking"), { status: 404 });

    await this.bookings.transition(
      {
        userId: SYSTEM_ACTOR_ID,
        role: ROLE.RESORT_ADMIN,
        resortIds: [caller.resortId],
        apiKeyId: caller.keyId,
      },
      row.id,
      "CANCELLED",
    );
    return this.render(code, caller.resortId);
  }

  /** The kind of room a caller named, by the handle the published view gives it. */
  private async roomType(resortId: number, wanted: string): Promise<{ id: number; name: string }> {
    const types = await this.prisma.roomType.findMany({
      where: { resortId, active: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    const keys = roomTypeKeys(types.map((t) => t.name));
    const i = keys.indexOf(String(wanted ?? "").trim().toLowerCase());
    if (i === -1) {
      throw badRequest(`This resort has no room type called "${wanted}". The kinds are: ${keys.join(", ")}.`);
    }
    return types[i]!;
  }

  /**
   * A room of that kind with none of those nights taken.
   *
   * The same rule the calendar runs. Picking here rather than letting the
   * caller pick is what keeps room ids out of the API entirely; the booking
   * service checks capacity again on the way in, and its `UNIQUE` index is the
   * thing that actually decides.
   */
  private async freeRoom(
    resortId: number,
    roomTypeId: number,
    checkIn: string,
    checkOut: string,
  ): Promise<number | null> {
    const from = new Date(`${checkIn}T00:00:00.000Z`);
    const to = new Date(`${checkOut}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest("Those are not dates.");
    if (to <= from) throw badRequest("checkOut must be after checkIn.");

    const rooms = await this.prisma.room.findMany({
      where: { resortId, roomTypeId, status: "ACTIVE", deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const busy = await this.prisma.bookingNight.findMany({
      where: {
        night: { gte: from, lt: to },
        room: { resortId, roomTypeId },
        item: { booking: { state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }, deletedAt: null } },
      },
      select: { roomId: true },
      distinct: ["roomId"],
    });
    const taken = new Set(busy.map((b) => b.roomId));
    return rooms.find((r) => !taken.has(r.id))?.id ?? null;
  }

  /** A booking as `/v1` describes one: what the caller asked for, and nothing else. */
  private async render(code: string, resortId: number): Promise<V1Booking> {
    const row = await this.prisma.booking.findFirst({
      where: { code, resortId, deletedAt: null },
      include: {
        guest: { select: { fullName: true, phone: true } },
        items: { include: { room: { select: { roomType: { select: { name: true } } } } } },
        payments: { select: { amount: true } },
      },
    });
    if (!row) throw Object.assign(new Error("No such booking"), { status: 404 });

    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      select: { currency: true },
    });
    if (!row.checkIn || !row.checkOut) throw Object.assign(new Error("No such booking"), { status: 404 });
    const nights = Math.round((row.checkOut.getTime() - row.checkIn.getTime()) / 86_400_000);
    const total = row.items.reduce((sum, i) => sum + Number(i.unitPrice) * nights * i.qty, 0) - Number(row.discount);

    return {
      code: row.code,
      state: row.state,
      roomType: row.items[0]?.room?.roomType.name ?? "",
      checkIn: iso(row.checkIn),
      checkOut: iso(row.checkOut),
      nights,
      adults: row.adults,
      children: row.children,
      total,
      paid: row.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      currency: resort.currency,
      guest: { fullName: row.guest.fullName, phone: row.guest.phone },
    };
  }
}

/**
 * Whether a repeated request is the same request.
 *
 * Only the parts that decide what was sold. A caller retrying with a corrected
 * spelling of a guest's name is retrying; a caller reusing a key for different
 * nights has a bug, and returning the first booking quietly would hide it until
 * somebody arrives on the wrong day.
 */
function sameOrder(
  booking: { checkIn: Date | null; checkOut: Date | null; adults: number },
  order: V1BookingOrder,
): boolean {
  // a room booking always has both; the columns are nullable for the kinds that
  // do not, and a row without them cannot be the same order as one with
  if (!booking.checkIn || !booking.checkOut) return false;
  return (
    iso(booking.checkIn) === order.checkIn &&
    iso(booking.checkOut) === order.checkOut &&
    booking.adults === order.adults
  );
}
