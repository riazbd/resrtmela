/**
 * The agency's guest list, and finding a free room by date.
 *
 * Both answer a question the agency asked and the platform could not answer:
 * *who have we served*, and *what is free that week*.
 *
 * "We" is the agency, not the person logged in. An agency that has to ask each
 * of its own staff who they sold to does not have a customer list, it has
 * several private ones — which is the same mistake the booking list made until
 * this landed.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { agentPricing, bookingTotals } from "../common/money";
import { AvailabilityService } from "../bookings/availability.service";
import { TaxService } from "../common/tax.service";
import { AgencyContextService } from "./agency-context.service";
import type { JwtClaims } from "@rh/shared";

const GUESTS = "agent.guests.view";
const BOOK = "agent.book";

export interface AgencyGuestRow {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  bookings: number;
  nights: number;
  spend: number;
  lastStay: string | null;
  resorts: string[];
}

@Injectable()
export class AgencyGuestsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(TaxService) private readonly tax: TaxService,
  ) {}

  /**
   * Everyone this agency has ever booked a room for.
   *
   * Contact details are unmasked here, unlike on a booking the resort owns.
   * The mask exists so an agency cannot harvest a resort's own guests; these
   * are the agency's own clients, whose numbers are already in their phone.
   */
  async list(claims: JwtClaims, query: { q?: string; take?: number }) {
    const ctx = await this.agency.require(claims, GUESTS);
    const actorIds = await this.agency.actorIds(ctx.agencyId);
    const search = query.q?.trim();

    const bookings = await this.prisma.booking.findMany({
      where: {
        agentUserId: { in: actorIds },
        deletedAt: null,
        state: { not: "CANCELLED" },
        ...(search
          ? {
              OR: [
                { guest: { fullName: { contains: search } } },
                { guest: { phone: { contains: search } } },
                { guest: { email: { contains: search } } },
                { code: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        checkIn: true,
        checkOut: true,
        discount: true,
        resortId: true,
        guest: { select: { id: true, fullName: true, phone: true, email: true } },
        resort: { select: { id: true, name: true, taxRatePct: true } },
        items: { select: { qty: true, unitPrice: true, itemKind: true } },
        payments: { select: { amount: true, paymentType: true } },
      },
      orderBy: { checkIn: "desc" },
      take: 2000,
    });

    const byGuest = new Map<number, AgencyGuestRow>();
    for (const b of bookings) {
      const row =
        byGuest.get(b.guest.id) ??
        ({
          id: b.guest.id,
          fullName: b.guest.fullName,
          phone: b.guest.phone,
          email: b.guest.email,
          bookings: 0,
          nights: 0,
          spend: 0,
          lastStay: null,
          resorts: [],
        } satisfies AgencyGuestRow);

      // the one place money is worked out. Adding the rent up by hand here
      // would be the seventh copy of a rule that has already been wrong in six
      // places, each time for a different reason.
      const totals = bookingTotals({
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        items: b.items.map((i) => ({
          itemKind: i.itemKind,
          qty: Number(i.qty),
          unitPrice: i.unitPrice,
        })),
        discount: b.discount,
        payments: b.payments,
        taxRules: await this.tax.rulesFor(b.resortId),
      });

      row.bookings += 1;
      row.nights += totals.nights;
      row.spend = round2(row.spend + totals.total);
      // a booking with no check-in date is a draft the desk never finished;
      // it counts towards the relationship but has no stay to be the latest one
      const stay = b.checkIn ? b.checkIn.toISOString().slice(0, 10) : null;
      if (stay && (!row.lastStay || stay > row.lastStay)) row.lastStay = stay;
      if (b.resort && !row.resorts.includes(b.resort.name)) row.resorts.push(b.resort.name);
      byGuest.set(b.guest.id, row);
    }

    const rows = [...byGuest.values()].sort((a, b) =>
      (b.lastStay ?? "").localeCompare(a.lastStay ?? ""),
    );
    return { rows: rows.slice(0, Math.min(query.take ?? 500, 1000)), total: rows.length };
  }

  /**
   * What is free between two dates, across every resort this agency sells.
   *
   * An agent quoting a client is asked "have you got anything for the 12th to
   * the 14th" and the answer spans resorts. Reading one grid per resort by
   * hand is what they were doing instead.
   */
  async rooms(
    claims: JwtClaims,
    query: { from: string; to: string; resortId?: number },
  ) {
    const ctx = await this.agency.require(claims, BOOK);
    if (!query.from || !query.to) throw badRequest("Pick the dates first");
    if (dateOnly(query.to) <= dateOnly(query.from)) {
      throw badRequest("Check-out must be after check-in");
    }

    // the agency's approved resorts, not the individual's: staff sell what the
    // agency sells
    const links = await this.prisma.userResort.findMany({
      where: {
        userId: ctx.agencyId,
        ...(query.resortId ? { resortId: query.resortId } : {}),
      },
      select: {
        resortId: true,
        commissionKind: true,
        commissionRate: true,
        resort: { select: { id: true, name: true, location: true, showRatesToAgents: true } },
      },
    });

    /**
     * The search runs on the agency's authority, not the caller's.
     *
     * Staff get a copy of the agency's resort links when they are hired, and
     * never again — so an agency approved for a new resort afterwards has
     * staff who cannot read its availability. Asking with the caller's own
     * claims made that a refusal mid-search rather than a shorter list, which
     * is a worse answer than either.
     *
     * The permission was already checked above, and every resort here is one
     * the agency is approved to sell.
     */
    const asAgency: JwtClaims = { ...claims, resortIds: links.map((l) => l.resortId) };

    const out = [];
    for (const link of links) {
      const grid = await this.availability.roomsGrid(asAgency, link.resortId, query.from, query.to);
      const free = grid
        .filter((r) => r.busyNights.length === 0 && r.status !== "OUT_OF_SERVICE")
        .map((r) => ({
          roomId: r.roomId,
          roomName: r.roomName,
          roomTypeId: r.roomTypeId,
          baseRate: r.baseRate,
          ...(link.resort.showRatesToAgents
            ? { agentRate: agentPricing(link, r.baseRate).agentPrice }
            : {}),
        }));
      if (free.length > 0) {
        out.push({
          resort: { id: link.resort.id, name: link.resort.name, location: link.resort.location },
          rooms: free,
        });
      }
    }
    return out;
  }
}
