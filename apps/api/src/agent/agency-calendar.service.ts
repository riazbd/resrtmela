/**
 * The month, as an agency is allowed to see it.
 *
 * An agent quoting a group wants the shape of the month, not a yes/no for two
 * dates: which nights are already gone, where the gaps are, which of the taken
 * nights are their own agency's so they can move a client rather than turn
 * them away. The room search answers "is the 12th free"; this answers "what
 * does November look like".
 *
 * What it deliberately does not answer is *who* is in the room. An agency is an
 * outside business, and the next agency along sells the same resort — a
 * calendar with names on it is a customer list with a date attached, and
 * handing one agency another's clients is the thing a resort would never agree
 * to. So a stay the agency did not sell comes back as an occupied span and
 * nothing else: no name, no booking code, no payment state, not even which
 * agency it belongs to.
 *
 * The resort can decide otherwise. `showGuestNamesToAgents` is off for every
 * resort until someone turns it on, and it is the resort's switch, not the
 * platform's — the same shape as `showRatesToAgents`, which already lets a
 * resort choose how much of its pricing an agency sees.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AgencyContextService } from "./agency-context.service";
import { badRequest } from "../common/rbac";
import { agencyOf, sellableFor } from "../common/selling-access";
import type { JwtClaims } from "@rh/shared";

/** A span of nights one room is not free, from the agency's side of the desk. */
export interface AgencyStay {
  roomId: number;
  checkIn: Date;
  checkOut: Date;
  /** the agency's own booking — theirs to open, move or cancel */
  mine: boolean;
  state: string;
  /** null unless it is theirs, or the resort chose to show names */
  guestName: string | null;
  code: string | null;
}

export interface AgencyResortMonth {
  resort: { id: number; name: string; location: string | null };
  rooms: { id: number; name: string; roomTypeId: number | null; roomTypeName: string | null }[];
  stays: AgencyStay[];
}

const MAX_RANGE_DAYS = 92;

@Injectable()
export class AgencyCalendarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
  ) {}

  async calendar(
    claims: JwtClaims,
    query: { from: string; to: string; resortId?: number },
  ): Promise<{ from: Date; to: Date; resorts: AgencyResortMonth[] }> {
    const ctx = await this.agency.require(claims, "agent.book");

    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw badRequest("from and to must be dates (YYYY-MM-DD)");
    }
    if (to <= from) throw badRequest("to must be after from");
    /**
     * A quarter is the longest anyone plans a group over, and the query grows
     * with the range — a five-year window would pull the resort's whole history
     * through a screen that shows one month.
     */
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      throw badRequest(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
    }

    // the resorts the agency may sell right now, by the one rule — the
    // agency's, not the caller's (same reason as the room search)
    const agency = await agencyOf(this.prisma, ctx.agencyId);
    const ids = agency.refusal ? [] : await sellableFor(this.prisma, agency.accountId, query.resortId);
    const links = (
      await this.prisma.resort.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, location: true, showGuestNamesToAgents: true },
        orderBy: { id: "asc" },
      })
    ).map((resort) => ({ resortId: resort.id, resort }));
    if (links.length === 0) return { from, to, resorts: [] };

    const resortIds = links.map((l) => l.resortId);
    const mine = await this.agency.actorIds(ctx.agencyId);

    const [rooms, bookings] = await Promise.all([
      this.prisma.room.findMany({
        where: { resortId: { in: resortIds }, status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          name: true,
          resortId: true,
          roomTypeId: true,
          roomType: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.booking.findMany({
        where: {
          resortId: { in: resortIds },
          deletedAt: null,
          // a cancelled or no-show stay releases the room, so it is not on the
          // calendar at all — an agent seeing it would read a free night as taken
          state: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
          checkIn: { lt: to },
          checkOut: { gt: from },
        },
        select: {
          id: true,
          code: true,
          state: true,
          resortId: true,
          checkIn: true,
          checkOut: true,
          agentUserId: true,
          guest: { select: { fullName: true } },
          items: { where: { itemKind: "ROOM" }, select: { roomId: true } },
        },
        orderBy: { checkIn: "asc" },
      }),
    ]);

    return {
      from,
      to,
      resorts: links.map((link) => {
        const showNames = link.resort.showGuestNamesToAgents;
        const stays: AgencyStay[] = [];
        for (const b of bookings) {
          if (b.resortId !== link.resortId) continue;
          // a booking without both dates occupies no night anyone can plan around
          if (b.checkIn == null || b.checkOut == null) continue;
          const isMine = b.agentUserId != null && mine.includes(b.agentUserId);
          const named = isMine || showNames;
          for (const item of b.items) {
            if (item.roomId == null) continue;
            stays.push({
              roomId: item.roomId,
              checkIn: b.checkIn,
              checkOut: b.checkOut,
              mine: isMine,
              state: b.state,
              guestName: named ? b.guest.fullName : null,
              code: named ? b.code : null,
            });
          }
        }
        return {
          resort: { id: link.resort.id, name: link.resort.name, location: link.resort.location },
          rooms: rooms
            .filter((r) => r.resortId === link.resortId)
            .map((r) => ({
              id: r.id,
              name: r.name,
              roomTypeId: r.roomTypeId,
              roomTypeName: r.roomType?.name ?? null,
            })),
          stays,
        };
      }),
    };
  }
}
