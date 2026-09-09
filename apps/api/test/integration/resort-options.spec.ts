/**
 * How a resort takes money is the resort's business, not the schema's.
 *
 * `PaymentMethod` was a Prisma enum — CASH, BKASH, NAGAD, CARD, BANK — so the
 * set of ways a resort could be paid was a fact about the software. A resort
 * that starts taking Rocket, or Upay, or a cheque, needed a migration and a
 * deploy. Meanwhile the console wrote the same five strings into four separate
 * dropdowns and got one of them wrong: the restaurant ticket offered four,
 * missing BANK, so a bank transfer at the restaurant had to be recorded as
 * something it was not.
 *
 * It is a per-resort list now, seeded from a platform setting the super admin
 * owns, and the seed happens on first read rather than at resort creation —
 * there are four places a resort can be created and remembering all four is
 * exactly the kind of thing that rots.
 *
 * The gateway's online rails are deliberately *not* this list: which methods
 * SSLCommerz can settle is a fact about SSLCommerz. Nor is WALLET_CREDIT, which
 * the system writes when an agency pays from its wallet and no human ever
 * picks.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeOptionsService, makePaymentsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the list a resort starts with", () => {
  it("comes from the platform setting, not from the source", async () => {
    const methods = makeOptionsService(asPrisma);

    const rows = await methods.list(manager, fx.resortId, "PAYMENT_METHOD");

    expect(rows.map((r) => r.code)).toContain("CASH");
    expect(rows.length).toBeGreaterThan(1);
  });

  it("follows the setting when the platform changes it", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "options.PAYMENT_METHOD.defaults" },
      update: { value: JSON.stringify([{ code: "CASH", label: "Cash" }, { code: "UPI", label: "UPI" }]) },
      create: {
        key: "options.PAYMENT_METHOD.defaults",
        value: JSON.stringify([{ code: "CASH", label: "Cash" }, { code: "UPI", label: "UPI" }]),
      },
    });
    const other = await seedResort(prisma as unknown as PrismaClient);
    const claims: JwtClaims = { userId: other.managerId, role: ROLE.MANAGER, resortIds: [other.resortId] };

    const rows = await makeOptionsService(asPrisma).list(claims, other.resortId, "PAYMENT_METHOD");

    expect(rows.map((r) => r.code).sort()).toEqual(["CASH", "UPI"]);
  });

  it("seeds once, so editing the list survives the next read", async () => {
    const methods = makeOptionsService(asPrisma);
    const before = await methods.list(manager, fx.resortId, "PAYMENT_METHOD");
    const victim = before.find((r) => r.code !== "CASH")!;

    await methods.remove(manager, fx.resortId, victim.id);
    const after = await methods.list(manager, fx.resortId, "PAYMENT_METHOD");

    expect(after.map((r) => r.code)).not.toContain(victim.code);
  });
});

describe("what a resort may add", () => {
  it("takes a method the platform never shipped", async () => {
    const methods = makeOptionsService(asPrisma);

    await methods.create(manager, fx.resortId, "PAYMENT_METHOD", { code: "ROCKET", label: "Rocket" });
    const rows = await methods.list(manager, fx.resortId, "PAYMENT_METHOD");

    expect(rows.map((r) => r.code)).toContain("ROCKET");
  });

  it("refuses the same code twice", async () => {
    const methods = makeOptionsService(asPrisma);
    await methods.create(manager, fx.resortId, "PAYMENT_METHOD", { code: "ROCKET", label: "Rocket" });

    await expect(
      methods.create(manager, fx.resortId, "PAYMENT_METHOD", { code: "ROCKET", label: "Rocket again" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("recording a payment", () => {
  const stay = () =>
    seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: "2026-11-01", checkOut: "2026-11-03" });

  it("refuses a method this resort does not take", async () => {
    const booking = await stay();

    await expect(
      makePaymentsService(asPrisma).addPayment(manager, booking.id, {
        amount: 1000,
        method: "PAYPAL",
        type: "ADVANCE",
      } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts one the resort added itself", async () => {
    const booking = await stay();
    await makeOptionsService(asPrisma).create(manager, fx.resortId, "PAYMENT_METHOD", {
      code: "ROCKET",
      label: "Rocket",
    });

    const payment = await makePaymentsService(asPrisma).addPayment(manager, booking.id, {
      amount: 1000,
      method: "ROCKET",
      type: "ADVANCE",
    } as never);

    expect(payment).toBeDefined();
    const row = await prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(row.method).toBe("ROCKET");
  });

  it("stops accepting a method the resort switched off, and keeps the old rows", async () => {
    const methods = makeOptionsService(asPrisma);
    const booking = await stay();
    await methods.create(manager, fx.resortId, "PAYMENT_METHOD", { code: "ROCKET", label: "Rocket" });
    await makePaymentsService(asPrisma).addPayment(manager, booking.id, {
      amount: 500,
      method: "ROCKET",
      type: "ADVANCE",
    } as never);

    const rocket = (await methods.list(manager, fx.resortId, "PAYMENT_METHOD")).find((r) => r.code === "ROCKET")!;
    await methods.update(manager, fx.resortId, rocket.id, { active: false });

    await expect(
      makePaymentsService(asPrisma).addPayment(manager, booking.id, {
        amount: 500,
        method: "ROCKET",
        type: "ADVANCE",
        clientRef: "second",
      } as never),
    ).rejects.toMatchObject({ status: 400 });
    // the history keeps saying what actually happened
    expect(await prisma.payment.count({ where: { bookingId: booking.id, method: "ROCKET" } })).toBe(1);
  });
});
