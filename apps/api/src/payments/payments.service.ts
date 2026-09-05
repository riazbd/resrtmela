import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /**
   * Append to the payment ledger (doc §5.6) — never a single "Advance" column.
   * Recomputes booking.paymentState (UNPAID → PARTIAL → PAID).
   */
  async addPayment(
    claims: JwtClaims,
    bookingId: number,
    input: { amount: number; method: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK"; type?: "ADVANCE" | "FINAL" | "REFUND"; note?: string },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: true },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });
    requireResortAccess(claims, b.resortId);
    if (input.amount <= 0) throw badRequest("amount must be > 0");
    if (b.state === "CANCELLED" && input.type !== "REFUND") {
      throw badRequest("Cancelled bookings accept refunds only");
    }

    const type =
      input.type ??
      (b.payments.length === 0 && b.paymentState === "UNPAID" ? "ADVANCE" : "FINAL");

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId,
          amount: input.amount as never,
          method: input.method,
          paymentType: type,
          receivedById: claims.userId,
          note: input.note,
        },
      });

      const paid = b.payments
        .filter((p) => p.paymentType !== "REFUND")
        .reduce((s, p) => s + Number(p.amount), 0);
      void paid;
      await this.audit.log(
        {
          actorId: claims.userId,
          resortId: b.resortId,
          action: `payment.${type.toLowerCase()}`,
          entity: "booking",
          entityId: bookingId,
          diff: { amount: input.amount, method: input.method },
        },
        tx,
      );
      return created;
    });

    const detail = await this.bookings.detail(claims, bookingId); // recompute + persist state
    if (input.type !== "REFUND") {
      await this.notifications.notifyPayment(bookingId, Number(payment.amount), input.method);
    }
    return { payment: { ...payment, amount: Number(payment.amount) }, booking: detail };
  }

  /** Outstanding dues across a resort (doc §3.6) */
  async dues(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    const bookings = await this.prisma.booking.findMany({
      where: { resortId, deletedAt: null, state: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
      include: { payments: true, guest: { select: { fullName: true, phone: true } }, items: true },
      orderBy: { checkIn: "asc" },
    });
    const rows = bookings
      .map((b) => ({ b, t: BookingsService.computeTotals(b) }))
      .filter(({ t }) => t.due > 0.001)
      .map(({ b, t }) => ({
        id: b.id,
        code: b.code,
        state: b.state,
        guest: b.guest,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        rooms: b.items.map((i) => i.roomId).length,
        ...t,
      }));
    return {
      total: round2(rows.reduce((s, r) => s + r.due, 0)),
      count: rows.length,
      rows,
    };
  }
}
