import { Inject, Injectable } from "@nestjs/common";
import { Prisma as P } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { JwtClaims, Role } from "@rh/shared";
import { requireResortAccess } from "../common/rbac";
import { dateOnly, eachNight } from "../common/dates";
import { LIVE_STATES } from "./booking-state";

export interface RoomAvailability {
  roomId: number;
  roomName: string;
  roomTypeId: number;
  baseRate: number;
  status: string;
  busyNights: string[]; // ISO yyyy-mm-dd within requested range
}

@Injectable()
export class AvailabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    requireResortAccess(claims, resortId);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) {
      throw Object.assign(new Error("to must be after from"), { status: 400 });
    }

    const rooms = await this.prisma.room.findMany({
      where: { resortId },
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

    return rooms.map((r) => ({
      roomId: r.id,
      roomName: r.name,
      roomTypeId: r.roomTypeId,
      baseRate: Number(r.baseRate),
      status: r.status,
      busyNights: busyByRoom.get(r.id) ?? [],
    }));
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
