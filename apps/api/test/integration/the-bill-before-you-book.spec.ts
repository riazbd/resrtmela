/**
 * What the booking form shows before anyone takes money.
 *
 * The clerk was asked for an Advance without ever being told the total. So the
 * number they typed was a guess, or a sum they did on paper — and the paper sum
 * could not be right, because three of the inputs are not on that screen:
 *
 *   - the nightly rate can be a seasonal rate, not the room's base rate
 *   - leaving Discount at zero does not mean zero; a standing offer applies
 *   - the resort's tax rules are not in the browser at all
 *
 * So the total comes from the server, through the same code that will charge
 * it. The binding promise of this file is the last test: whatever the quote
 * said, that is what the booking is worth once it exists. Any drift between
 * the two paths — a rate resolved differently, an offer applied in one and not
 * the other — fails there rather than on somebody's bill.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const bookings = () => makeBookingsService(asPrismaService);

/** Two nights in the fixture's first room, at its 5000 base rate. */
const STAY = { checkIn: "2026-11-05", checkOut: "2026-11-07", adults: 2, children: 0 };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the bill the form shows before the advance", () => {
  it("prices the nights, not the night", async () => {
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
    });
    expect(q.nights).toBe(2);
    expect(q.rent).toBe(10000);
    expect(q.total).toBe(10000);
  });

  it("names each room and what it comes to, so the guest can be told", async () => {
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id, fx.rooms[1]!.id],
      ...STAY,
    });
    expect(q.lines.map((l) => l.label)).toEqual(["101", "102"]);
    for (const line of q.lines) {
      expect(line.unitPrice).toBe(5000);
      expect(line.nights).toBe(2);
      expect(line.amount).toBe(10000);
    }
    expect(q.rent).toBe(20000);
  });

  it("charges an extra person at the rate of the room they sleep in", async () => {
    await prisma.room.update({
      where: { id: fx.rooms[0]!.id },
      data: { extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 1000 },
    });
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      extraPersons: 2,
    });
    // 2 people x 2 nights x 1000, on top of 2 nights of room
    expect(q.lines.find((l) => l.kind === "EXTRA_PERSON")?.amount).toBe(4000);
    expect(q.rent).toBe(14000);
  });

  it("shows the tax the resort actually charges", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: 15 } });
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
    });
    expect(q.tax).toBe(1500);
    expect(q.total).toBe(11500);
  });

  it("takes the discount off before the tax", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: 15 } });
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      discount: 2000,
    });
    // (10000 - 2000) = 8000, +15% = 9200
    expect(q.taxable).toBe(8000);
    expect(q.total).toBe(9200);
  });

  it("refuses to quote a stay that cannot be sold", async () => {
    await expect(
      bookings().quote(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        checkIn: "2026-11-07",
        checkOut: "2026-11-05",
        adults: 2,
        children: 0,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * The one that matters. Everything above pins a rule; this pins the promise:
   * the number on the form is the number on the bill.
   */
  it("promises exactly what the booking turns out to be worth", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: 15 } });
    await prisma.room.update({
      where: { id: fx.rooms[0]!.id },
      data: { extraPersonAllowed: true, extraPersonMax: 2, extraPersonRate: 800 },
    });
    const input = {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      extraPersons: 1,
      discount: 1500,
    };

    const quoted = await bookings().quote(claims, input);
    const made = await bookings().create(claims, {
      ...input,
      guest: { fullName: "Abir", phone: "8801736256789" },
    });

    // `detail` spreads the totals at the top level
    expect(made.rent).toBe(quoted.rent);
    expect(made.discount).toBe(quoted.discount);
    expect(made.tax).toBe(quoted.tax);
    expect(made.total).toBe(quoted.total);
  });
});
