/**
 * A discount is either an amount or a percentage, and the booking remembers which.
 *
 * The desk could only type taka. "10% off for the corporate group" meant working
 * the figure out on a phone calculator, and the moment the dates changed the
 * figure was wrong and nobody knew it had been a percentage.
 *
 * So a booking keeps what was typed (`discountKind`, `discountValue`) beside the
 * amount it comes to (`discount`), which every money rule still reads. A
 * percentage is of the stay — the rooms and extra persons — and is worked out
 * again whenever the stay changes.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { DISCOUNT_KINDS, ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);
/** Two nights at the fixture's 5,000: a 10,000 stay. */
const STAY = { checkIn: "2026-11-05", checkOut: "2026-11-07", adults: 2, children: 0 };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

const guest = { fullName: "Percent Guest", phone: "01711000111" };

describe("the two kinds", () => {
  it("are declared once, for the API and the form", () => {
    expect([...DISCOUNT_KINDS]).toEqual(["FLAT", "PERCENT"]);
  });
});

describe("a percentage", () => {
  it("is quoted as a share of the stay", async () => {
    const q = await bookings().quote(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      discount: 10,
      discountKind: "PERCENT",
    });

    expect(q.discount).toBe(1000);
    expect(q.total).toBe(9000);
  });

  it("is booked at what it was quoted, and remembered as a percentage", async () => {
    const created = await bookings().create(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      guest,
      discount: 10,
      discountKind: "PERCENT",
    });

    expect(created.discount).toBe(1000);
    expect(created.discountKind).toBe("PERCENT");
    expect(created.discountValue).toBe(10);
    expect(created.total).toBe(9000);
  });

  it("follows the stay when the dates change", async () => {
    const created = await bookings().create(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      guest,
      discount: 10,
      discountKind: "PERCENT",
    });

    // two nights become three
    const edited = await bookings().update(claims, created.id, { checkOut: "2026-11-08" });

    expect(edited.rent).toBe(15000);
    expect(edited.discount).toBe(1500);
  });

  it("refuses more than a hundred", async () => {
    await expect(
      bookings().quote(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        discount: 120,
        discountKind: "PERCENT",
      }),
    ).rejects.toThrow(/100/);
  });

  it("refuses a kind nobody declared", async () => {
    await expect(
      bookings().quote(claims, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        ...STAY,
        discount: 5,
        discountKind: "HALF" as never,
      }),
    ).rejects.toThrow(/FLAT|PERCENT/);
  });
});

describe("a group", () => {
  it("takes the percentage off each room's own stay", async () => {
    const group = await bookings().createGroupBooking(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id, fx.rooms[1]!.id],
      ...STAY,
      guest,
      discountPerRoom: 10,
      discountKind: "PERCENT",
    });

    for (const b of group.bookings) {
      const d = await bookings().detail(claims, b.id);
      expect(d.discountKind).toBe("PERCENT");
      expect(d.discount).toBe(1000);
    }
  });
});

describe("an amount", () => {
  it("is still the default, and stays put when the dates change", async () => {
    const created = await bookings().create(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      guest,
      discount: 700,
    });
    expect(created.discountKind).toBe("FLAT");

    const edited = await bookings().update(claims, created.id, { checkOut: "2026-11-08" });

    expect(edited.discount).toBe(700);
  });
});

describe("editing the discount", () => {
  it("switches an amount to a percentage", async () => {
    const created = await bookings().create(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      guest,
      discount: 700,
    });

    const edited = await bookings().update(claims, created.id, { discount: 5, discountKind: "PERCENT" });

    expect(edited.discountKind).toBe("PERCENT");
    expect(edited.discountValue).toBe(5);
    expect(edited.discount).toBe(500);
  });

  it("switches a percentage back to an amount", async () => {
    const created = await bookings().create(claims, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      ...STAY,
      guest,
      discount: 10,
      discountKind: "PERCENT",
    });

    const edited = await bookings().update(claims, created.id, { discount: 250, discountKind: "FLAT" });

    expect(edited.discountKind).toBe("FLAT");
    expect(edited.discount).toBe(250);
  });
});
