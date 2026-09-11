/**
 * Two debts, two ways of collecting them.
 *
 * The dues list totalled every unpaid booking into one red number and one flat
 * table. But a guest's balance and an agency's balance are not the same debt.
 * The guest's is collected at the desk, in cash or bKash, on the morning they
 * leave — and if it is still owed after they have gone, somebody has to ring a
 * stranger. The agency's is a trade account: the rooms were sold on the
 * agency's paper, the money reaches the resort when the two businesses settle,
 * and what is owed on any one booking is a line in that settlement rather than
 * something to chase a guest for.
 *
 * Mixing them made the front desk read a guest's name beside money the guest
 * does not owe, and made "what is outstanding" a number nobody could act on.
 * These are the facts the screen needs to keep them apart.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makePaymentsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

const dues = () => makePaymentsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A booking the desk took itself: the guest owes it. */
async function walkIn() {
  return seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-10-05",
    checkOut: "2026-10-08",
    state: "CHECKED_IN",
  });
}

/** A booking an agency sold: the agency owes it. */
async function soldByAgency() {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId: fx.rooms[1]!.id,
    checkIn: "2026-10-12",
    checkOut: "2026-10-14",
    state: "CONFIRMED",
  });
  await prisma.booking.update({ where: { id: b.id }, data: { agentUserId: fx.agentId } });
  return b;
}

describe("the dues list, with two kinds of debtor on it", () => {
  it("says who owes each one — the guest, or the agency that sold it", async () => {
    await walkIn();
    await soldByAgency();
    const out = await dues().dues(manager, fx.resortId);

    const direct = out.rows.find((r) => r.agent === null);
    expect(direct, "the walk-in is nobody's agency booking").toBeTruthy();

    const sold = out.rows.find((r) => r.agent !== null);
    expect(sold!.agent).toMatchObject({ id: fx.agentId, name: "Test Agent", agency: "Test Agency" });
  });

  it("totals the two separately, because they are collected separately", async () => {
    await walkIn();
    await soldByAgency();
    const out = await dues().dues(manager, fx.resortId);

    expect(out.guestTotal).toBeGreaterThan(0);
    expect(out.agencyTotal).toBeGreaterThan(0);
    // the old number is still there, and still the sum of the two
    expect(out.total).toBeCloseTo(out.guestTotal + out.agencyTotal, 2);
    expect(out.guestCount).toBe(1);
    expect(out.agencyCount).toBe(1);
  });

  it("leaves both halves at zero when nothing is owed at all", async () => {
    const out = await dues().dues(manager, fx.resortId);
    expect(out.total).toBe(0);
    expect(out.guestTotal).toBe(0);
    expect(out.agencyTotal).toBe(0);
  });

  /**
   * The question the agency half exists to answer is "who do I ring, and for
   * how much" — which is per agency, not per booking. Four bookings from one
   * agency are one phone call.
   */
  it("adds up what each agency owes across all of its bookings", async () => {
    await walkIn();
    await soldByAgency();
    const second = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: fx.rooms[0]!.id,
      checkIn: "2026-11-01",
      checkOut: "2026-11-03",
      state: "CONFIRMED",
    });
    await prisma.booking.update({ where: { id: second.id }, data: { agentUserId: fx.agentId } });

    const out = await dues().dues(manager, fx.resortId);
    expect(out.byAgency).toHaveLength(1);
    expect(out.byAgency[0]).toMatchObject({ agency: "Test Agency", bookings: 2 });
    expect(out.byAgency[0]!.due).toBeCloseTo(out.agencyTotal, 2);
  });
});
