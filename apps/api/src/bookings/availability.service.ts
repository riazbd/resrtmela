import { Inject, Injectable } from "@nestjs/common";
import { Prisma as P } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { CommissionService } from "../common/commission.service";
import { JwtClaims, Role, ROLE } from "@rh/shared";
import { agentPricing } from "../common/money";
import { agencyOf, requireSellingAccess } from "../common/selling-access";
import { dateOnly, eachNight } from "../common/dates";
import { LIVE_STATES } from "./booking-state";

export interface RoomAvailability {
  roomId: number;
  roomName: string;
  roomTypeId: number;
  baseRate: number;
  /** what this agent would owe the resort per night; absent for resort staff */
  agentRate?: number;
  status: string;
  busyNights: string[]; // ISO yyyy-mm-dd within requested range
  /**
   * What this room takes, so the booking form can offer the box for the rooms
   * that take an extra person and price it at the room's own rate. It used to ask the
   * room *type*, which one type covering nine rooms of different sizes could
   * not answer.
   */
  extraPersonAllowed: boolean;
  extraPersonRate: number;
  extraPersonMax: number;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CommissionService) private readonly commission: CommissionService,
  ) {}

  /**
   * Rooms × nights grid for [from, to). Nights occupied by live bookings
   * (PENDING / CONFIRMED / CHECKED_IN) are busy; CANCELLED and NO_SHOW do not block.
   */
  async roomsGrid(
    claims: JwtClaims,
    resortId: number,
    fromStr: string,
    toStr: string,
  ): Promise<RoomAvailability[]> {
    await requireSellingAccess(this.prisma, claims, resortId);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) {
      throw Object.assign(new Error("to must be after from"), { status: 400 });
    }

    const rooms = await this.prisma.room.findMany({
      // a retired room is history; it cannot be sold, so it is not on the grid
      where: { resortId, deletedAt: null },
      include: { roomType: { select: { id: true } } },
      orderBy: { name: "asc" },
    });

    const nights = await this.prisma.bookingNight.findMany({
      where: {
        night: { gte: from, lt: to },
        room: { resortId },
        item: { booking: { state: { in: LIVE_STATES }, deletedAt: null } },
      },
      select: { roomId: true, night: true },
    });

    const busyByRoom = new Map<number, string[]>();
    for (const n of nights) {
      const list = busyByRoom.get(n.roomId) ?? [];
      list.push(n.night.toISOString().slice(0, 10));
      busyByRoom.set(n.roomId, list);
    }

    /**
     * An agent picking a room needs their own price beside the published one,
     * at the moment they are quoting a guest — not in a commission report at
     * the end of the month.
     */
    const resortTerms =
      claims.role === ROLE.AGENT
        ? await this.commission.termsFor(resortId, (await agencyOf(this.prisma, claims.userId)).accountId)
        : null;
    const terms = resortTerms
      ? { commissionKind: resortTerms.kind, commissionRate: resortTerms.rate }
      : null;
    const showRates =
      terms == null
        ? true
        : ((await this.prisma.resort.findUnique({ where: { id: resortId }, select: { showRatesToAgents: true } }))
            ?.showRatesToAgents ?? false);

    return rooms.map((r) => {
      const baseRate = Number(r.baseRate);
      return {
        roomId: r.id,
        roomName: r.name,
        roomTypeId: r.roomTypeId,
        baseRate,
        ...(terms && showRates ? { agentRate: agentPricing(terms, baseRate).agentPrice } : {}),
        status: r.status,
        extraPersonAllowed: r.extraPersonAllowed,
        extraPersonRate: Number(r.extraPersonRate),
        extraPersonMax: r.extraPersonMax,
        busyNights: busyByRoom.get(r.id) ?? [],
      };
    });
  }

  /** Conflicting live nights for a room inside a range — used for 409 payloads. */
  async conflictsFor(
    roomId: number,
    nights: Date[],
    ignoreBookingId?: number,
    tx?: P.TransactionClient,
  ): Promise<string[]> {
    const client = (tx ?? this.prisma) as P.TransactionClient;
    const rows = await client.bookingNight.findMany({
      where: {
        roomId,
        night: { in: nights },
        ...(ignoreBookingId ? { item: { bookingId: { not: ignoreBookingId } } } : {}),
        item: { booking: { state: { in: LIVE_STATES }, deletedAt: null } },
      },
      select: { night: true },
    });
    return rows.map((r) => r.night.toISOString().slice(0, 10));
  }

  /** free nights helper: eachNight + ISO strings (grid-friendly) */
  isoNights(from: Date, nights: number): string[] {
    return eachNight(from, nights).map((d) => d.toISOString().slice(0, 10));
  }
}
