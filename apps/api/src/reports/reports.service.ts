import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { BookingState } from "@rh/db";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { dateOnly, round2, nightsBetween } from "../common/dates";

const COUNTED_STATES: BookingState[] = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async rangeBookings(resortId: number, from?: string, to?: string) {
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
      const nights =
        b.checkIn && b.checkOut ? nightsBetween(b.checkIn, b.checkOut) : 1;
      const rent = b.items.reduce(
        (s, i) => s + Number(i.unitPrice) * i.qty * (i.itemKind === "ROOM" ? nights : 1),
        0,
      );
      const roomRent = b.items
        .filter((i) => i.itemKind === "ROOM")
        .reduce((s, i) => s + Number(i.unitPrice) * i.qty * nights, 0);
      const paid = b.payments
        .filter((p) => p.paymentType !== "REFUND")
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: b.id,
        state: b.state,
        source: b.source,
        agentUserId: b.agentUserId,
        agentName: b.agentUser?.name ?? null,
        rent,
        roomRent,
        paid,
        due: round2(rent - Number(b.discount) - paid),
      };
    });
  }

  /** Management dashboard metrics (sheet tab 12): resort + F&B + expenses = net. */
  async metrics(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
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
      fb.reduce((s, b) => s + b.items.reduce((t, i) => t + Number(i.unitPrice) * i.qty, 0), 0),
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

  /** Daily revenue rows (sheet tabs 7/11) for a date range. */
  async daily(claims: JwtClaims, resortId: number, fromStr: string, toStr: string) {
    requireResortAccess(claims, resortId);
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (to <= from) throw badRequest("to must be after from");
    if ((to.getTime() - from.getTime()) / 86400000 > 120) {
      throw badRequest("max 120 days per query");
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        resortId, deletedAt: null, state: { in: COUNTED_STATES },
        checkIn: { gte: from, lt: to },
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
    const days: { date: string; roomRevenue: number; fbRevenue: number; expenses: number; net: number }[] = [];
    for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const room = round2(
        bookings
          .filter((b) => b.checkIn && b.checkIn.toISOString().slice(0, 10) === key)
          .reduce((s, b) => s + b.items.reduce((t, i) => t + Number(i.unitPrice) * i.qty, 0), 0),
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
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const rows = await this.prisma.payment.findMany({
      where: {
        booking: { resortId, deletedAt: null },
        paymentType: "ADVANCE",
        ...(from && to ? { receivedAt: { gte: dateOnly(from), lt: dateOnly(to) } } : {}),
      },
      include: {
        receivedBy: { select: { id: true, name: true, role: true } },
        booking: { select: { code: true, guest: { select: { fullName: true } } } },
      },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });
    const byUser = new Map<string, { userId: number | null; name: string; advances: number; total: number; codes: string[] }>();
    for (const p of rows) {
      const k = p.receivedById ? `u${p.receivedById}` : "unassigned";
      const entry = byUser.get(k) ?? {
        userId: p.receivedById,
        name: p.receivedBy?.name ?? "Unassigned",
        advances: 0,
        total: 0,
        codes: [],
      };
      entry.advances++;
      entry.total = round2(entry.total + Number(p.amount));
      entry.codes.push(p.booking.code);
      byUser.set(k, entry);
    }
    return {
      rows: [...byUser.values()].sort((a, b) => b.total - a.total),
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
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
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
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const bookings = await this.rangeBookings(resortId, from, to);

    const staff = await this.prisma.userResort.findMany({
      where: { resortId, user: { role: ROLE.AGENT } },
      include: { user: { select: { id: true, name: true } } },
    });

    const byAgent = new Map<number, { agentId: number; name: string; commissionRate: number; bookings: number; rent: number; due: number }>();
    for (const s of staff) {
      byAgent.set(s.userId, {
        agentId: s.userId,
        name: s.user.name,
        commissionRate: Number(s.commissionRate ?? 0),
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
      commission: round2((r.rent * r.commissionRate) / 100),
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
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const bookings = await this.rangeBookings(resortId, from, to);
    const bySource = new Map<string, { source: string; bookings: number; rent: number; due: number }>();
    for (const b of bookings) {
      const entry = bySource.get(b.source) ?? { source: b.source, bookings: 0, rent: 0, due: 0 };
      entry.bookings++;
      entry.rent += b.roomRent ?? b.rent;
      entry.due += b.due;
      bySource.set(b.source, entry);
    }
    const rows = [...bySource.values()]
      .map((r) => ({ ...r, rent: round2(r.rent), due: round2(r.due) }))
      .sort((a, b) => b.rent - a.rent);
    return { from: from ?? null, to: to ?? null, rows };
  }

  /** Agent's own commission report. */
  async myReport(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    if (claims.role !== ROLE.AGENT) throw badRequest("Agents only");
    requireResortAccess(claims, resortId);
    const link = await this.prisma.userResort.findUnique({
      where: { userId_resortId: { userId: claims.userId, resortId } },
    });
    const rate = Number(link?.commissionRate ?? 0);
    const bookings = (await this.rangeBookings(resortId, from, to)).filter(
      (b) => b.agentUserId === claims.userId,
    );
    const rent = round2(bookings.reduce((s, b) => s + (b.roomRent ?? b.rent), 0));
    return {
      from: from ?? null,
      to: to ?? null,
      commissionRate: rate,
      bookings: bookings.length,
      rent,
      due: round2(bookings.reduce((s, b) => s + b.due, 0)),
      commission: round2((rent * rate) / 100),
    };
  }
}
