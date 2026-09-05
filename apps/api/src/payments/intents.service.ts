import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, badRequest } from "../common/rbac";
import { round2 } from "../common/dates";
import { BookingsService } from "../bookings/bookings.service";
import { NotificationsService } from "../notifications/notifications.service";

const ONLINE_METHODS = ["BKASH", "NAGAD"] as const;
type OnlineMethod = (typeof ONLINE_METHODS)[number];

@Injectable()
export class IntentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /**
   * Create a checkout intent. Guests may pay their own trip; staff any booking.
   * Returns the provider redirect URL — dev mock gateway hosted by this API.
   */
  async createCheckout(
    claims: JwtClaims,
    bookingId: number,
    input: { method: OnlineMethod; amount: number },
  ) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { payments: true, items: true, resort: { select: { id: true, name: true } } },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });

    const isGuest = claims.role === ROLE.GUEST;
    if (isGuest) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
      const guestRows = await this.prisma.guest.findMany({ where: { phone: user.phone }, select: { id: true } });
      if (!guestRows.some((g) => g.id === b.guestId)) {
        throw Object.assign(new Error("Not your booking"), { status: 403 });
      }
    } else {
      requireResortAccess(claims, b.resortId);
    }
    if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.state)) {
      throw badRequest("Booking is not payable");
    }
    if (!ONLINE_METHODS.includes(input.method)) {
      throw badRequest(`method must be one of ${ONLINE_METHODS.join(", ")}`);
    }
    const rent = b.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0);
    const paid = b.payments.filter((p) => p.paymentType !== "REFUND").reduce((s, p) => s + Number(p.amount), 0);
    const due = round2(rent - Number(b.discount) - paid);
    if (due <= 0.001) throw badRequest("Nothing due on this booking");
    const amount = round2(input.amount);
    if (amount <= 0 || amount > due + 0.001) {
      throw badRequest(`amount must be between 1 and ${due}`);
    }

    const ref = `pi_${randomBytes(12).toString("hex")}`;
    const intent = await this.prisma.paymentIntent.create({
      data: {
        resortId: b.resortId,
        bookingId,
        provider: input.method === "BKASH" ? "bkash" : "nagad",
        providerRef: ref,
        amount: amount as never,
        method: input.method,
      },
    });
    return {
      intentId: String(intent.id),
      providerRef: ref,
      provider: intent.provider,
      amount,
      // production: gateway-hosted URL. dev: our mock gateway page/endpoint.
      checkoutUrl: `/mock-checkout/${ref}`,
    };
  }

  /** Gateway callback (webhook-shaped). Marks paid, writes ledger, notifies. */
  async confirm(providerRef: string, trxId: string, failed = false) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { providerRef } });
    if (!intent) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });
    if (intent.status !== "pending") throw badRequest(`Intent already ${intent.status}`);

    if (failed) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "failed" },
      });
      return { status: "failed" };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "paid", paidAt: new Date(), trxId },
      });
      await tx.payment.create({
        data: {
          bookingId: intent.bookingId,
          amount: intent.amount,
          method: intent.method,
          paymentType: "ADVANCE",
          note: `${intent.provider} trx ${trxId}`,
        },
      });
    });

    const detail = await this.bookings.detail(
      { userId: 0, role: ROLE.SUPER_ADMIN, resortIds: [] },
      intent.bookingId,
    );
    await this.notifications.notifyPayment(intent.bookingId, Number(intent.amount), intent.method);
    return {
      status: "paid",
      booking: { code: detail.code, paymentState: detail.paymentState, due: detail.due, paid: detail.paid },
    };
  }

  async status(providerRef: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { providerRef } });
    if (!intent) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });
    return {
      providerRef: intent.providerRef,
      provider: intent.provider,
      method: intent.method,
      amount: Number(intent.amount),
      status: intent.status,
      trxId: intent.trxId,
      paidAt: intent.paidAt,
    };
  }
}
