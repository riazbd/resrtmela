/**
 * The advance-collectors card printed a field the report had stopped sending.
 *
 * `collectors` used to build its rows from a `take: 300` list, and each row
 * carried the booking codes that made up the total. It was rewritten to group
 * in the database, so the total would stop understating whoever had been
 * collecting — and the rewrite dropped `codes`, because a `groupBy` cannot
 * return them. The Reports screen was never changed: it still reads
 * `r.codes.slice(0, 6)`, so the first render of that card threw on `undefined`
 * and took the whole page down with it.
 *
 * It only throws where somebody has actually taken cash in advance, which is
 * why it survived a green suite and a live API check that answered 200 — the
 * card is not drawn when there are no collectors, and only the resort in
 * production has any.
 *
 * The codes come back, named for what they are. The count and the total are
 * grouped over everything and are exact; the codes are a sample from the
 * recent receipts the report already loads, so the row can be checked at a
 * glance without a second unbounded read.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;

const reports = () => makeReportsService(asPrisma);
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const withAdvance = (code: string, daysAgo: number, advance: number) =>
  seedBooking(prisma as unknown as PrismaClient, fx, {
    code,
    checkIn: iso(new Date(Date.now() - daysAgo * DAY)),
    checkOut: iso(new Date(Date.now() - (daysAgo - 1) * DAY)),
    advance,
  });

describe("the advance-collectors report", () => {
  it("names the bookings behind a collector's total, which is what the card prints", async () => {
    await withAdvance("BK-COLL-1", 5, 1000);
    await withAdvance("BK-COLL-2", 4, 2000);

    const { rows } = await reports().collectors(admin, fx.resortId);

    expect(rows).toHaveLength(1);
    expect(rows[0].recentCodes).toEqual(expect.arrayContaining(["BK-COLL-1", "BK-COLL-2"]));
  });

  it("gives every row the field, so a card that prints it cannot meet undefined", async () => {
    await withAdvance("BK-COLL-3", 3, 500);

    const { rows } = await reports().collectors(admin, fx.resortId);

    for (const row of rows) expect(Array.isArray(row.recentCodes)).toBe(true);
  });

  it("keeps the count and the total exact, whatever the codes are a sample of", async () => {
    await withAdvance("BK-COLL-4", 6, 1500);
    await withAdvance("BK-COLL-5", 2, 2500);

    const { rows } = await reports().collectors(admin, fx.resortId);

    expect(rows[0].advances).toBe(2);
    expect(rows[0].total).toBe(4000);
  });

  it("names a booking once, however many advances were taken against it", async () => {
    const b = await withAdvance("BK-COLL-6", 7, 800);
    await prisma.payment.create({
      data: {
        bookingId: b.id,
        amount: 200,
        method: "CASH",
        paymentType: "ADVANCE",
        receivedById: fx.managerId,
      },
    });

    const { rows } = await reports().collectors(admin, fx.resortId);

    expect(rows[0].recentCodes).toEqual(["BK-COLL-6"]);
    expect(rows[0].advances).toBe(2);
  });
});
