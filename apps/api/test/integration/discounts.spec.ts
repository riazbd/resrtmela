/**
 * Discounts, at the three scopes an owner actually thinks in.
 *
 * The requirement was "an individual room discount, or applicable on the whole
 * resort's rooms". What existed was resort-wide or by *room type* — which is
 * not the same thing and cannot express the common case: one particular room
 * is noisy, or faces the generator, or is the last one left on a slow
 * Tuesday, so it goes cheaper than its identical neighbour.
 *
 * All three now exist, and the most specific one that applies wins on value:
 * an owner setting a room-level offer expects it to be honoured, not averaged
 * against a resort-wide one.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { DiscountService } from "../../src/common/discount.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const discounts = () => new DiscountService(asPrismaService);
const AT = new Date("2026-04-01T00:00:00Z");

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const offer = (data: Record<string, unknown>) =>
  prisma.discountOffer.create({
    data: { resortId: fx.resortId, name: "Offer", kind: "FLAT", value: 0, ...data } as never,
  });

describe("discount scopes", () => {
  it("applies a resort-wide offer to every room", async () => {
    await offer({ scope: "RESORT", kind: "PERCENT", value: 10 });

    const off = await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id);

    expect(off).toBe(1000);
  });

  it("applies an offer to one room and not to its identical neighbour", async () => {
    // 102 faces the generator, so it goes cheaper than 101 of the same type
    await offer({ scope: "ROOM", roomId: fx.rooms[1]!.id, kind: "FLAT", value: 800 });

    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[1]!.id)).toBe(800);
    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id)).toBe(0);
  });

  it("still applies an offer to a whole room type", async () => {
    await offer({ scope: "ROOM_TYPE", roomTypeId: fx.roomTypeId, kind: "FLAT", value: 500 });

    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id)).toBe(500);
    expect(await discounts().bestFor(fx.resortId, 99999, 10000, AT, fx.rooms[0]!.id)).toBe(0);
  });

  it("gives the guest the better of two offers that both apply", async () => {
    await offer({ scope: "RESORT", kind: "PERCENT", value: 5 }); // 500
    await offer({ scope: "ROOM", roomId: fx.rooms[0]!.id, kind: "FLAT", value: 900 });

    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id)).toBe(900);
  });

  it("never discounts more than the rent", async () => {
    await offer({ scope: "RESORT", kind: "FLAT", value: 50000 });

    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id)).toBe(10000);
  });

  it("honours the dates an offer is valid between", async () => {
    await offer({
      scope: "ROOM",
      roomId: fx.rooms[0]!.id,
      kind: "FLAT",
      value: 700,
      validFrom: new Date("2026-05-01"),
      validTo: new Date("2026-05-31"),
    });

    expect(await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, AT, fx.rooms[0]!.id)).toBe(0);
    expect(
      await discounts().bestFor(fx.resortId, fx.roomTypeId, 10000, new Date("2026-05-10"), fx.rooms[0]!.id),
    ).toBe(700);
  });

  it("never lets one resort's offer reach another's rooms", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await offer({ scope: "RESORT", kind: "PERCENT", value: 20 });

    expect(await discounts().bestFor(other.resortId, other.roomTypeId, 10000, AT, other.rooms[0]!.id)).toBe(0);
  });
});
