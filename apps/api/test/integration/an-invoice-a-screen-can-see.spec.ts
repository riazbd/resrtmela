/**
 * A booking that has an invoice says so.
 *
 * Found by opening the screen rather than by running anything. Generating an
 * invoice showed the toast, wrote `SER-00181` to the database — and the panel
 * went on offering "Generate invoice", because `GET /bookings/:id` never
 * returned the number. The owner presses it again, and again.
 *
 * Nothing caught it, and the reason is worth keeping: `BookingDetail` declares
 * `invoiceNo?: string`. Optional, so the compiler is satisfied by a server that
 * never sends it and a screen that waits forever for it. A field that is
 * sometimes absent and a field that is never present look identical through a
 * `?`.
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

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A stay to invoice. The fixture seeds rooms, not bookings. */
async function aBooking(): Promise<number> {
  const made = await bookings().create(claims, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn: "2026-08-15",
    checkOut: "2026-08-18",
    adults: 2,
    children: 0,
    guest: { fullName: "Test Guest", phone: "8801711111111" },
  } as never);
  return (made as { id: number }).id;
}

describe("a booking's own detail", () => {
  it("carries no invoice number before one is generated", async () => {
    const detail = await bookings().detail(claims, await aBooking());
    expect(detail.invoiceNo ?? null).toBeNull();
  });

  /**
   * The one that was missing. Without it the screen cannot tell "no invoice
   * yet" from "an invoice it was not told about", and those need opposite
   * buttons.
   */
  it("carries the invoice number once there is one", async () => {
    const id = await aBooking();
    const { invoiceNo } = await bookings().generateInvoice(claims, id);

    const detail = await bookings().detail(claims, id);

    expect(invoiceNo).toBeTruthy();
    expect(detail.invoiceNo).toBe(invoiceNo);
  });

  it("agrees with what the database holds, not with a value made on the way out", async () => {
    const id = await aBooking();
    await bookings().generateInvoice(claims, id);

    const detail = await bookings().detail(claims, id);
    const stored = await prisma.booking.findUnique({ where: { id }, select: { invoiceNo: true } });

    expect(detail.invoiceNo).toBe(stored!.invoiceNo);
  });

  it("keeps returning the same number when asked to generate twice", async () => {
    const id = await aBooking();
    const first = await bookings().generateInvoice(claims, id);
    const second = await bookings().generateInvoice(claims, id);
    const detail = await bookings().detail(claims, id);
    expect(second.invoiceNo).toBe(first.invoiceNo);
    expect(detail.invoiceNo).toBe(first.invoiceNo);
  });
});
