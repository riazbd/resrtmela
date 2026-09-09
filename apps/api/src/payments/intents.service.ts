import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireSellingAccess, badRequest, apiKeyClaims } from "../common/rbac";
import { normalizePhone, phoneKey, round2 } from "../common/dates";
import { BookingsService } from "../bookings/bookings.service";
import { NotificationsService } from "../notifications/notifications.service";
import { bookingTotals } from "../common/money";
import { type PaymentGateway, PAYMENT_GATEWAY } from "./gateway";

const ONLINE_METHODS = ["BKASH", "NAGAD"] as const;
type OnlineMethod = (typeof ONLINE_METHODS)[number];

@Injectable()
export class IntentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    /**
     * Which gateway takes the money. Injected so a test can name one, and so
     * switching from the mock to SSLCommerz is configuration rather than a
     * change anywhere in the booking code.
     */
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
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
      include: {
        payments: true,
        items: true,
        guest: { select: { fullName: true, email: true, phone: true } },
        resort: { select: { id: true, name: true, currency: true, taxRatePct: true } },
      },
    });
    if (!b || b.deletedAt) throw Object.assign(new Error("Booking not found"), { status: 404 });

    await this.assertMayPay(claims, b);
    if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.state)) {
      throw badRequest("Booking is not payable");
    }
    if (!ONLINE_METHODS.includes(input.method)) {
      throw badRequest(`method must be one of ${ONLINE_METHODS.join(", ")}`);
    }
    /**
     * What the guest owes, from the one money function.
     *
     * This used to be computed here by hand as unit price times quantity —
     * without the nights multiplier and without tax — which is the same defect
     * that was found in four other places. On a two-night stay it let the
     * guest pay half of what they owed and told them they were square.
     */
    const { due } = bookingTotals({ ...b, taxRatePct: b.resort.taxRatePct });
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
        // the gateway that will actually take it, not the wallet brand: one
        // SSLCommerz integration covers bKash, Nagad, Rocket and cards
        provider: this.gateway.name,
        providerRef: ref,
        amount: amount as never,
        method: input.method,
      },
    });

    const base = (process.env.PUBLIC_WEB_URL ?? "").replace(/\/$/, "");
    const session = await this.gateway.checkout({
      providerRef: ref,
      amount,
      currency: b.resort.currency,
      method: input.method,
      bookingCode: b.code,
      resortName: b.resort.name,
      guest: { name: b.guest.fullName, email: b.guest.email, phone: b.guest.phone },
      returnUrl: `${base}/book/payment?ref=${ref}`,
      callbackUrl: `${process.env.PUBLIC_API_URL ?? ""}/payments/webhook/${this.gateway.name}`,
    });

    return {
      intentId: String(intent.id),
      providerRef: ref,
      provider: intent.provider,
      amount,
      checkoutUrl: session.checkoutUrl,
    };
  }

  /**
   * The public webhook.
   *
   * This endpoint is an unauthenticated POST from the internet, so nothing in
   * the body is believed. The gateway adapter is asked what actually happened
   * — for SSLCommerz that means re-reading the transaction from their
   * validation endpoint with our store credentials — and the amount it reports
   * is checked against the amount we asked for, so a confirmed ৳500 cannot
   * settle a ৳5,000 stay.
   */
  async confirmFromGateway(body: Record<string, unknown>) {
    const callback = await this.gateway.parseCallback(body);
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerRef: callback.providerRef },
    });
    if (!intent) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });

    if (callback.status === "failed") {
      return this.confirm(callback.providerRef, callback.trxId, true);
    }
    if (Math.abs(callback.amount - Number(intent.amount)) > 0.01) {
      throw badRequest(
        `Gateway confirmed ${callback.amount} for a ${Number(intent.amount)} payment`,
      );
    }
    return this.confirm(callback.providerRef, callback.trxId);
  }


  /**
   * May this caller move money on this booking?
   *
   * Extracted so the mock gateway's confirm route can ask the same question.
   * It could not before: that route settled an intent by reference alone, so
   * anyone who had started a checkout — or guessed a reference — could mark a
   * booking paid without paying.
   */
  private async assertMayPay(
    claims: JwtClaims,
    booking: { resortId: number; guestId: number; agentUserId: number | null },
  ): Promise<void> {
    const isGuest = claims.role === ROLE.GUEST;
    if (isGuest) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.userId } });
      // the same rule the guest app uses, and by the same key: a raw `phone`
      // compare let `""` match every phone-less guest row, so anyone who
      // signed up by email passed the ownership check on someone else's stay
      const normalized = normalizePhone(user.phone ?? "");
      if (!normalized) throw Object.assign(new Error("Not your booking"), { status: 403 });
      const guestRows = await this.prisma.guest.findMany({
        where: { phoneKey: phoneKey(normalized) },
        select: { id: true },
      });
      if (!guestRows.some((g) => g.id === booking.guestId)) {
        throw Object.assign(new Error("Not your booking"), { status: 403 });
      }
    } else if (claims.role === ROLE.AGENT) {
      // an agency may settle the booking it made, and no other
      requireSellingAccess(claims, booking.resortId);
      const me = await this.prisma.user.findUnique({
        where: { id: claims.userId },
        select: { id: true, parentAgentId: true },
      });
      const agencyId = me?.parentAgentId ?? claims.userId;
      const staff = await this.prisma.user.findMany({
        where: { parentAgentId: agencyId },
        select: { id: true },
      });
      const mine = [agencyId, ...staff.map((x) => x.id)];
      if (booking.agentUserId == null || !mine.includes(booking.agentUserId)) {
        throw Object.assign(new Error("Not your booking"), { status: 403 });
      }
    } else {
      requireResortAccess(claims, booking.resortId);
    }
  }

  /**
   * The dev mock gateway's "I paid" button, and only that.
   *
   * `confirmFromGateway` asks the real gateway what happened and checks the
   * amount it reports against the amount we asked for. This route asks nobody:
   * it settled an intent from a reference in the URL. It was behind AuthGuard
   * and nothing else, and it was mounted in production whatever gateway was
   * configured — so any signed-in user could mark a booking paid, including
   * one that was not theirs.
   *
   * Two conditions now. It exists only while the mock gateway is the
   * configured one, which is to say only while no merchant account does; and
   * the caller must be someone who could have paid this booking.
   */
  async confirmMock(claims: JwtClaims, providerRef: string, trxId: string, failed = false) {
    if (this.gateway.name !== "mock") {
      throw Object.assign(new Error("Not found"), { status: 404 });
    }
    const intent = await this.prisma.paymentIntent.findUnique({ where: { providerRef } });
    if (!intent) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });
    const booking = await this.prisma.booking.findUnique({
      where: { id: intent.bookingId },
      select: { resortId: true, guestId: true, agentUserId: true },
    });
    if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });
    await this.assertMayPay(claims, booking);
    return this.confirm(providerRef, trxId, failed);
  }

  /** Gateway callback (webhook-shaped). Marks paid, writes ledger, notifies. */
  async confirm(providerRef: string, trxId: string, failed = false) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { providerRef } });
    if (!intent) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });

    /**
     * A gateway retries its webhook until it gets a 200, and sometimes after.
     * Answering an already-settled reference with an error makes the gateway
     * retry forever and puts a failure in our own logs for a payment that
     * worked — so a repeat is answered with the settled state.
     */
    if (intent.status === "paid") {
      const settled = await this.bookings.detail(apiKeyClaims(intent.resortId), intent.bookingId);
      return {
        status: "paid",
        booking: {
          code: settled.code,
          paymentState: settled.paymentState,
          due: settled.due,
          paid: settled.paid,
        },
      };
    }
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
      // gateway webhook: no human actor, and scoped to the paying booking's resort
      apiKeyClaims(intent.resortId),
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
