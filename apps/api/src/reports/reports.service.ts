import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { BookingState } from "@rh/db";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireSellingAccess, requireRoles, badRequest } from "../common/rbac";
import { dateOnly, round2, nightsBetween } from "../common/dates";
import { bookingTotals, fbBillTotals, perNightRevenue, agentCommission, monthsInRange, payrollShareOfRange } from "../common/money";
import { PermissionsService } from "../common/permissions";
import { TaxService } from "../common/tax.service";
import { CommissionService } from "../common/commission.service";

const COUNTED_STATES: BookingState[] = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];

/** The bucket for stays nobody said anything about. Not a source; the absence of one. */
export const UNRECORDED_SOURCE = "__UNRECORDED__";

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(TaxService) private readonly tax: TaxService,
    @Inject(CommissionService) private readonly commission: CommissionService,
  ) {}

  /**
   * The bookings in a range, with their money from the one money function.
   *
   * This used to reimplement `bookingTotals`: its own nights multiplier, its
   * own `paid` that dropped refunds, and `due = rent - discount - paid` with
   * no tax at all. So every report here disagreed with the booking screen and
   * the invoice for any resort that charges tax, and a refunded stay still
   * counted as collected. A second copy of a money rule is how the first one
   * stops being true.
   */
  private async rangeBookings(resortId: number, from?: string, to?: string) {
    const taxRules = await this.tax.rulesFor(resortId);
    const rows = await this.prisma.booking.findMany({
      where: {
        resortId,
        deletedAt: null,
        state: { in: COUNTED_STATES },
        ...(from && to
          ? { checkIn: { gte: dateOnly(from), lt: dateOnly(to) } }
          : {}),
      },
      include: {
        items: true,
        payments: true,
        agentUser: { select: { id: true, name: true } },
      },
    });
    return rows.map((b) => {
      const t = bookingTotals({ ...b, taxRules });
      return {
        id: b.id,
        state: b.state,
        source: b.source,
        agentUserId: b.agentUserId,
        agentName: b.agentUser?.name ?? null,
        rent: t.rent,
        roomRent: t.roomRent,
        paid: t.paid,
        refunded: t.refunded,
        due: t.due,
      };
    });
  }

  /** Management dashboard metrics (sheet tab 12): resort + F&B + expenses = net. */
  async metrics(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const taxRules = await this.tax.rulesFor(resortId);
    const bookings = await this.rangeBookings(resortId, from, to);
    const gross = round2(bookings.reduce((s, b) => s + (b.roomRent ?? b.rent), 0));
    const discounts = await this.prisma.booking.aggregate({
      _sum: { discount: true },
      where: {
        resortId, deletedAt: null, state: { in: COUNTED_STATES },
        ...(from && to ? { checkIn: { gte: dateOnly(from), lt: dateOnly(to) } } : {}),
      },
    });
    const discount = round2(Number(discounts._sum.discount ?? 0));
    const fb = await this.prisma.fbBill.findMany({
      where: {
        resortId, deletedAt: null,
        ...(from && to ? { billDate: { gte: dateOnly(from), lt: dateOnly(to) } } : {}),
      },
      include: { items: true },
    });
    const fbRevenue = round2(
      // net of tax: what the resort earned, not what it collected for the
      // government. The room side has always reported net; the restaurant
      // could not, because a restaurant bill had nowhere to put tax.
      fb.reduce((s, b) => s + fbBillTotals(b, taxRules).net, 0),
    );
    const expenses = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        resortId,
        ...(from && to ? { date: { gte: dateOnly(from), lt: dateOnly(to) } } : {}),
      },
    });
    const expenseTotal = round2(Number(expenses._sum.amount ?? 0));
    const netRoom = round2(gross - discount);
    const grossIncome = round2(netRoom + fbRevenue);
    return {
      resortRevenue: gross,
      discount,
      netRoomRevenue: netRoom,
      restaurantRevenue: fbRevenue,
      grossIncome,
      expenses: expenseTotal,
      netProfit: round2(grossIncome - expenseTotal),
      bookings: bookings.length,
    };
  }

  /** Profit & Loss statement: separate resort / restaurant columns + payroll, per date range. */
  /**
   * The period a report covers when nobody named one.
   *
   * The Reports screen opens on "All time" and sends neither date, and these
   * three reports cannot honour "all time": `pl` caps at 400 days and `daily`
   * at 120, because both load every booking in the window, and
   * `idleInventory` divides by the number of days. They used to answer the
   * missing parameter with a 500 — `dateOnly(undefined)` — which is three of
   * the six tabs on that screen broken on a resort with data in it.
   *
   * Thirty days ending today: one number, inside every cap, and the answer
   * carries the dates back so a screen can say what it is showing.
   */
  private static readonly DEFAULT_DAYS = 30;

  private period(fromStr?: string, toStr?: string): { from: Date; to: Date; fromStr: string; toStr: string } {
    const day = 86_400_000;
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const resolvedTo = toStr ?? iso(new Date(Date.now() + day));
    const resolvedFrom =
      fromStr ?? iso(new Date(Date.parse(resolvedTo) - ReportsService.DEFAULT_DAYS * day));
    return {
      from: dateOnly(resolvedFrom),
      to: dateOnly(resolvedTo),
      fromStr: resolvedFrom,
      toStr: resolvedTo,
    };
  }

  async pl(claims: JwtClaims, resortId: number, fromStr?: string, toStr?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.pl");
    const taxRules = await this.tax.rulesFor(resortId);
    const period = this.period(fromStr, toStr);
    const { from, to } = period;
    fromStr = period.fromStr;
    toStr = period.toStr;
    if (to <= from) throw badRequest("to must be after from");
    // `daily` has always capped its range; this one pulled a decade of bookings
    // into memory if asked
    if ((to.getTime() - from.getTime()) / 86_400_000 > 400) {
      throw badRequest("max 400 days per query");
    }

    // resort revenue: ROOM + EXTRA_PERSON items on counted bookings
    const bookings = await this.prisma.booking.findMany({
      where: { resortId, deletedAt: null, state: { in: COUNTED_STATES }, checkIn: { gte: from, lt: to } },
      include: { items: true },
    });
    let roomRevenue = 0;
    let extraPersonRevenue = 0;
    let otherRevenue = 0; // activities etc.
    let discounts = 0;
    for (const b of bookings) {
      const nights = b.checkIn && b.checkOut ? nightsBetween(b.checkIn, b.checkOut) : 1;
      for (const i of b.items) {
        if (i.itemKind === "ROOM") roomRevenue += Number(i.unitPrice) * i.qty * nights;
        else if (i.itemKind === "EXTRA_PERSON") extraPersonRevenue += Number(i.unitPrice) * i.qty;
        else if (i.itemKind === "ACTIVITY") otherRevenue += Number(i.unitPrice) * i.qty;
      }
      discounts += Number(b.discount);
    }
    roomRevenue = round2(roomRevenue);
    extraPersonRevenue = round2(extraPersonRevenue);
    otherRevenue = round2(otherRevenue);

    // restaurant revenue: all F&B bills in range (charged-to-room stay in restaurant P&L;
    // the matching FB booking item is excluded from resort revenue above)
    const fb = await this.prisma.fbBill.findMany({
      where: { resortId, deletedAt: null, billDate: { gte: from, lt: to } },
      include: { items: true },
    });
    const restaurantRevenue = round2(fb.reduce((s, b) => s + fbBillTotals(b, taxRules).net, 0));

    // expenses split by scope
    const expenses = await this.prisma.expense.findMany({
      where: { resortId, date: { gte: from, lt: to } },
      select: { amount: true, scope: true, category: true },
    });
    let resortExpenses = 0;
    let restaurantExpenses = 0;
    const resortByCat = new Map<string, number>();
    const restByCat = new Map<string, number>();
    for (const e of expenses) {
      const amt = Number(e.amount);
      if (e.scope === "RESTAURANT") {
        restaurantExpenses += amt;
        restByCat.set(e.category, round2((restByCat.get(e.category) ?? 0) + amt));
      } else {
        resortExpenses += amt;
        resortByCat.set(e.category, round2((resortByCat.get(e.category) ?? 0) + amt));
      }
    }
    resortExpenses = round2(resortExpenses);
    restaurantExpenses = round2(restaurantExpenses);

    /**
     * Payroll, for the part of each month the range actually covers.
     *
     * Two defects here. The month list was walked with
     * `d.setUTCMonth(d.getUTCMonth() + 1)`, which overflows from a 31st — 31
     * January plus a month is 3 March — so February was skipped and a whole
     * month's wages vanished. And every month the range touched was charged in
     * full, so a report for 1–10 September showed September's entire wage bill
     * against ten days of revenue.
     */
    const months = monthsInRange(fromStr, toStr);
    const payroll = await this.prisma.payrollPayment.findMany({
      where: { resortId, month: { in: months } },
      select: { amount: true, month: true },
    });
    const payrollTotal = round2(
      payroll.reduce((s, p) => s + Number(p.amount) * payrollShareOfRange(p.month, fromStr, toStr), 0),
    );

    const resortIncome = round2(roomRevenue + extraPersonRevenue + otherRevenue - discounts);
    const resortNet = round2(resortIncome - resortExpenses - payrollTotal);
    const restaurantNet = round2(restaurantRevenue - restaurantExpenses);
    return {
      from: fromStr,
      to: toStr,
      resort: {
        roomRevenue,
        extraPersonRevenue,
        otherRevenue,
        discounts: round2(discounts),
        income: resortIncome,
        expenses: resortExpenses,
        payroll: payrollTotal,
        net: resortNet,
        expenseCategories: [...resortByCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      },
      restaurant: {
        revenue: restaurantRevenue,
        expenses: restaurantExpenses,
        net: restaurantNet,
        expenseCategories: [...restByCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      },
      combined: {
        income: round2(resortIncome + restaurantRevenue),
        expenses: round2(resortExpenses + restaurantExpenses + payrollTotal),
        net: round2(resortNet + restaurantNet),
      },
    };
  }

  /**
   * What the out-of-service rooms cost the owner, in taka.
   *
   * Priced at what the sellable rooms actually earned over the window — net of
   * discounts, at the occupancy they actually achieved — not at rack rate.
   * A room parked for a year is the largest silent expense a small resort has,
   * and nothing in the owner's spreadsheet puts a number on it.
   */
  async idleInventory(claims: JwtClaims, resortId: number, fromStr?: string, toStr?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const { from, to } = this.period(fromStr, toStr);
    if (to <= from) throw badRequest("to must be after from");
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);

    const rooms = await this.prisma.room.findMany({
      // occupancy is measured against what the resort can sell today
      where: { resortId, deletedAt: null },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    });
    const idle = rooms.filter((r) => r.status === "OUT_OF_SERVICE");
    const sellable = rooms.length - idle.length;

    // what the sellable rooms earned, and how full they ran
    const stays = await this.prisma.booking.findMany({
      where: {
        resortId, deletedAt: null, state: { in: COUNTED_STATES },
        checkIn: { lt: to }, checkOut: { gt: from },
      },
      include: { items: true },
    });
    let netRevenue = 0;
    let soldNights = 0;
    for (const b of stays) {
      const t = bookingTotals({ ...b, payments: [] });
      if (t.nights <= 0) continue;
      const perNight = perNightRevenue(t.roomRent, t.discount, t.nights);
      // only the nights that fall inside the window
      for (let n = 0; n < t.nights; n++) {
        const night = new Date(b.checkIn!.getTime() + n * 86_400_000);
        if (night >= from && night < to) {
          netRevenue += perNight;
          soldNights += b.items.filter((i) => i.itemKind === "ROOM").length;
        }
      }
    }

    const sellableNights = sellable * days;
    const occupancy = sellableNights > 0 ? soldNights / sellableNights : 0;
    const netAdr = soldNights > 0 ? round2(netRevenue / soldNights) : 0;

    return {
      from: fromStr,
      to: toStr,
      outOfServiceRooms: idle.map((r) => ({ id: r.id, name: r.name })),
      sellableRooms: sellable,
      occupancyPct: Math.round(occupancy * 1000) / 10,
      netAdr,
      foregoneInRange: Math.round(idle.length * days * netAdr * occupancy),
      foregonePerYear: Math.round(idle.length * 365 * netAdr * occupancy),
    };
  }

  /** Daily revenue rows (sheet tabs 7/11) for a date range. */
  async daily(claims: JwtClaims, resortId: number, fromStr?: string, toStr?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const { from, to } = this.period(fromStr, toStr);
    if (to <= from) throw badRequest("to must be after from");
    if ((to.getTime() - from.getTime()) / 86400000 > 120) {
      throw badRequest("max 120 days per query");
    }
    // every stay that covers a night in the range, not just those starting in it
    const bookings = await this.prisma.booking.findMany({
      where: {
        resortId, deletedAt: null, state: { in: COUNTED_STATES },
        checkIn: { lt: to }, checkOut: { gt: from },
      },
      include: { items: true },
    });
    const fb = await this.prisma.fbBill.findMany({
      where: { resortId, deletedAt: null, billDate: { gte: from, lt: to } },
      include: { items: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { resortId, date: { gte: from, lt: to } },
    });
    // revenue per night of stay (rent - discount), the sheet tab 11 rule — the
    // same number the Day Sheet shows. F&B is reported in its own column, so a
    // charged-to-room bill must not also land in room revenue.
    const nightly = bookings.map((b) => {
      const t = bookingTotals({ ...b, payments: [] });
      return {
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        revenue: perNightRevenue(t.roomRent, t.discount, t.nights),
      };
    });

    const days: { date: string; roomRevenue: number; fbRevenue: number; expenses: number; net: number }[] = [];
    for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const night = new Date(key);
      const room = round2(
        nightly
          .filter((n) => n.checkIn && n.checkOut && n.checkIn <= night && night < n.checkOut)
          .reduce((s, n) => s + n.revenue, 0),
      );
      const fbRev = round2(
        fb.filter((b) => b.billDate.toISOString().slice(0, 10) === key)
          .reduce((s, b) => s + b.items.reduce((t, i) => t + Number(i.unitPrice) * i.qty, 0), 0),
      );
      const exp = round2(
        expenses.filter((e) => e.date.toISOString().slice(0, 10) === key)
          .reduce((s, e) => s + Number(e.amount), 0),
      );
      days.push({ date: key, roomRevenue: room, fbRevenue: fbRev, expenses: exp, net: round2(room + fbRev - exp) });
    }
    return days;
  }

  /** Advance collectors (sheet tab 2): who received cash advances. */
  async collectors(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const where = {
      booking: { resortId, deletedAt: null },
      paymentType: "ADVANCE" as const,
      ...(from && to ? { receivedAt: { gte: dateOnly(from), lt: dateOnly(to) } } : {}),
    };

    /**
     * Who collected what, over everything — not over the last 300 rows.
     *
     * The totals were summed in memory from a `take: 300` list and presented as
     * the answer, so on a busy month the report quietly understated whoever had
     * been collecting. This is the one report an owner opens to ask where the
     * cash went; a total that stops at 300 is worse than no total. The database
     * groups it now, and the list underneath stays capped because a list of
     * recent receipts is meant to be recent.
     */
    const grouped = await this.prisma.payment.groupBy({
      by: ["receivedById"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const names = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.receivedById).filter((id): id is number => id != null) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(names.map((u) => [u.id, u.name]));

    const rows = await this.prisma.payment.findMany({
      where,
      include: {
        receivedBy: { select: { id: true, name: true, role: true } },
        booking: { select: { code: true, guest: { select: { fullName: true } } } },
      },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });
    return {
      rows: grouped
        .map((g) => ({
          userId: g.receivedById,
          name: g.receivedById == null ? "Unassigned" : nameOf.get(g.receivedById) ?? "Unknown",
          advances: g._count._all,
          total: round2(Number(g._sum.amount ?? 0)),
        }))
        .sort((a, b) => b.total - a.total),
      recent: rows.map((p) => ({
        id: p.id,
        at: p.receivedAt,
        amount: Number(p.amount),
        method: p.method,
        bookingCode: p.booking.code,
        guest: p.booking.guest.fullName,
        receivedBy: p.receivedBy?.name ?? null,
      })),
    };
  }

  /** Recent audit trail for a resort (mgmt view). */
  async audit(claims: JwtClaims, resortId: number, take = 100) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "auditlog.view");
    const rows = await this.prisma.auditLog.findMany({
      where: { resortId },
      orderBy: { id: "desc" },
      take: Math.min(take, 200),
      include: { actor: { select: { name: true, role: true } } },
    });
    return rows.map((r) => ({
      id: String(r.id),
      actor: r.actor?.name ?? "system",
      role: r.actor?.role ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ? String(r.entityId) : null,
      diff: r.diff,
      at: r.createdAt,
    }));
  }

  /** Per-agent performance + commission (staff view). */
  async agents(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const bookings = await this.rangeBookings(resortId, from, to);

    const staff = await this.prisma.userResort.findMany({
      where: { resortId, user: { role: ROLE.AGENT } },
      include: { user: { select: { id: true, name: true } } },
    });
    // one rate for the resort, not one per row: this used to read
    // `s.commissionRate`, so the report showed whatever each agent had been
    // typed in as, and two agents on the same booking earned differently
    const terms = await this.commission.termsFor(resortId);

    const byAgent = new Map<number, { agentId: number; name: string; commissionRate: number; commissionKind: string; bookings: number; rent: number; due: number }>();
    for (const s of staff) {
      byAgent.set(s.userId, {
        agentId: s.userId,
        name: s.user.name,
        commissionRate: terms.rate,
        commissionKind: terms.kind,
        bookings: 0,
        rent: 0,
        due: 0,
      });
    }
    for (const b of bookings) {
      if (b.agentUserId === null) continue;
      const entry = byAgent.get(b.agentUserId);
      if (!entry) continue;
      entry.bookings++;
      entry.rent += b.roomRent ?? b.rent;
      entry.due += b.due;
    }
    const rows = [...byAgent.values()].map((r) => ({
      ...r,
      rent: round2(r.rent),
      due: round2(r.due),
      commission: agentCommission(r, r.rent, r.bookings),
    }));
    return {
      from: from ?? null,
      to: to ?? null,
      rows: rows.sort((a, b) => b.rent - a.rent),
    };
  }

  /** Per-source performance (staff view). */
  async sources(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "reports.view");
    const bookings = await this.rangeBookings(resortId, from, to);
    const bySource = new Map<string, { source: string; bookings: number; rent: number; due: number }>();
    for (const b of bookings) {
      // a booking nobody recorded a source for is its own row, not Direct's.
      // It used to be Direct's, because the column defaulted to DIRECT.
      const key = b.source ?? UNRECORDED_SOURCE;
      const entry = bySource.get(key) ?? { source: key, bookings: 0, rent: 0, due: 0 };
      entry.bookings++;
      entry.rent += b.roomRent ?? b.rent;
      entry.due += b.due;
      bySource.set(key, entry);
    }
    const rows = [...bySource.values()]
      .map((r) => ({ ...r, rent: round2(r.rent), due: round2(r.due) }))
      .sort((a, b) => b.rent - a.rent);
    return { from: from ?? null, to: to ?? null, rows };
  }

  /**
   * Agent's own commission report.
   *
   * The one report an agency is entitled to, and the only reason this file
   * needs selling access at all: every row below is filtered to the caller's
   * own bookings, so what it adds up is money the agency earned. Everything
   * else in this service is the resort's own trading figures.
   */
  async myReport(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    if (claims.role !== ROLE.AGENT) throw badRequest("Agents only");
    requireSellingAccess(claims, resortId);
    // the same terms the owner's report reads, so the two cannot disagree
    const { rate, kind } = await this.commission.termsFor(resortId);
    const bookings = (await this.rangeBookings(resortId, from, to)).filter(
      (b) => b.agentUserId === claims.userId,
    );
    const rent = round2(bookings.reduce((s, b) => s + (b.roomRent ?? b.rent), 0));
    return {
      from: from ?? null,
      to: to ?? null,
      commissionRate: rate,
      commissionKind: kind,
      bookings: bookings.length,
      rent,
      due: round2(bookings.reduce((s, b) => s + b.due, 0)),
      commission: agentCommission({ commissionKind: kind, commissionRate: rate }, rent, bookings.length),
    };
  }
}
