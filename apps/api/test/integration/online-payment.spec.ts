/**
 * Paying online.
 *
 * Two things this file holds down.
 *
 * The first is money, again. The checkout intent computed what a guest owes
 * with its own arithmetic — unit price times quantity, no nights multiplier
 * and no tax — which is the exact defect that was found in four other places
 * and fixed by giving the codebase one money function. On a two-night stay it
 * let the guest pay half and told them they were square.
 *
 * The second is that a payment gateway is an adapter, not an architecture.
 * Whether the money arrives through the mock gateway or SSLCommerz should
 * change one configured name, not the booking code — and until a merchant
 * account exists, the mock must keep working exactly as it does now.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeIntentsService } from "../helpers/services";
import type { GatewayCallback, PaymentGateway } from "../../src/payments/gateway";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const intents = () => makeIntentsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what the guest is allowed to pay", () => {
  it("counts every night, not one", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-03",
      unitPrice: 5000,
    });

    // the stay is 10,000; paying it in full must be allowed
    const intent = await intents().createCheckout(claims, b.id, { method: "BKASH", amount: 10000 });

    expect(intent.amount).toBe(10000);
  });

  it("includes the tax the resort charges", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: 10 as never } });
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-03",
      unitPrice: 5000,
    });

    const intent = await intents().createCheckout(claims, b.id, { method: "BKASH", amount: 11000 });

    expect(intent.amount).toBe(11000);
  });

  it("still refuses more than is owed", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-03",
      unitPrice: 5000,
      advance: 4000,
    });

    await expect(
      intents().createCheckout(claims, b.id, { method: "BKASH", amount: 6001 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      intents().createCheckout(claims, b.id, { method: "BKASH", amount: 6000 }),
    ).resolves.toBeTruthy();
  });
});

describe("the gateway is an adapter", () => {
  it("uses the mock gateway while no provider is configured", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
    });

    const intent = await intents().createCheckout(claims, b.id, { method: "BKASH", amount: 1000 });

    expect(intent.checkoutUrl).toContain("/mock-checkout/");
    expect(intent.provider).toBe("mock");
  });

  it("records the money once, however many times the gateway calls back", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
      unitPrice: 5000,
    });
    const intent = await intents().createCheckout(claims, b.id, { method: "BKASH", amount: 5000 });

    await intents().confirm(intent.providerRef, "TRX123");
    // gateways retry a webhook until they get a 200, and sometimes after
    const again = await intents().confirm(intent.providerRef, "TRX123");

    expect(again.status).toBe("paid");
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(1);
  });

  it("refuses a callback for a reference it never issued", async () => {
    await expect(intents().confirm("pi_nonsense", "TRX")).rejects.toMatchObject({ status: 404 });
  });
});

/**
 * A gateway callback is an unauthenticated POST from the public internet.
 * Anyone can send one claiming a booking is paid. What stops them is that the
 * posted values are never believed: the gateway is asked, with our own
 * credentials, what actually happened.
 */
class StubGateway implements PaymentGateway {
  readonly name = "stub";
  readonly configured = true;
  constructor(private readonly answer: GatewayCallback | Error) {}
  async checkout() {
    return { checkoutUrl: "https://gateway.example/pay" };
  }
  async parseCallback(): Promise<GatewayCallback> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

describe("a webhook is not evidence", () => {
  it("believes the gateway, not the body that was posted", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
      unitPrice: 5000,
    });
    const real = makeIntentsService(asPrismaService);
    const intent = await real.createCheckout(claims, b.id, { method: "BKASH", amount: 5000 });

    // the gateway says this transaction failed, whatever the POST claimed
    const lying = makeIntentsService(
      asPrismaService,
      new StubGateway({ providerRef: intent.providerRef, trxId: "T1", amount: 5000, status: "failed" }),
    );
    const result = await lying.confirmFromGateway({ tran_id: intent.providerRef, status: "VALID" });

    expect(result.status).toBe("failed");
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
  });

  it("refuses a confirmation for an amount that is not the one we asked for", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
      unitPrice: 5000,
    });
    const real = makeIntentsService(asPrismaService);
    const intent = await real.createCheckout(claims, b.id, { method: "BKASH", amount: 5000 });

    const short = makeIntentsService(
      asPrismaService,
      new StubGateway({ providerRef: intent.providerRef, trxId: "T1", amount: 500, status: "paid" }),
    );

    await expect(short.confirmFromGateway({ tran_id: intent.providerRef })).rejects.toMatchObject({
      status: 400,
    });
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
  });

  it("records the payment when the gateway confirms it", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
      unitPrice: 5000,
    });
    const real = makeIntentsService(asPrismaService);
    const intent = await real.createCheckout(claims, b.id, { method: "BKASH", amount: 5000 });

    const good = makeIntentsService(
      asPrismaService,
      new StubGateway({ providerRef: intent.providerRef, trxId: "BANKTRX9", amount: 5000, status: "paid" }),
    );
    const result = await good.confirmFromGateway({ tran_id: intent.providerRef });

    expect(result.status).toBe("paid");
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(Number(payment.amount)).toBe(5000);
    expect(payment.note).toContain("BANKTRX9");
  });
});
