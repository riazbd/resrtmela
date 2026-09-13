/**
 * An invoice says what it said on the day it was issued.
 *
 * Found while adding the Download button, and it is the sharper half of that
 * report: `invoicePayload` rebuilt the whole document from live rows on every
 * read. Rename the resort, correct its address, change a tax rule, edit the
 * booking — and every invoice ever issued quietly changed to match, including
 * ones already printed, emailed and filed.
 *
 * That is not a display bug. An invoice is a statement of what was charged at
 * a moment, and a resort's books, a guest's records and the VAT authority all
 * expect the copy in the drawer and the copy on the screen to agree.
 *
 * The line drawn here is the one a real invoice draws:
 *
 * - **The charge is frozen** — the seller, the guest, the line items, the
 *   nights, the tax, the total.
 * - **The settlement stays live** — what has been paid against it since. A
 *   payment taken after issue belongs on the invoice; it does not rewrite it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makePaymentsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const bookings = () => makeBookingsService(asPrismaService);
const payments = () => makePaymentsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

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

describe("an invoice already issued", () => {
  it("keeps the seller it was issued under when the resort is renamed", async () => {
    const id = await aBooking();
    const issued = await bookings().generateInvoice(claims, id);
    expect(issued.resort.name).toBeTruthy();

    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { name: "Renamed After The Fact", address: "A new address entirely" },
    });

    const reread = await bookings().invoicePayload(claims, id);
    expect(reread.resort.name).toBe(issued.resort.name);
    expect(reread.resort.address).toBe(issued.resort.address);
  });

  it("keeps the total it was issued with when a room's rate changes", async () => {
    const id = await aBooking();
    const issued = await bookings().generateInvoice(claims, id);

    await prisma.bookingItem.updateMany({
      where: { bookingId: id },
      data: { unitPrice: 99_999 as never },
    });

    const reread = await bookings().invoicePayload(claims, id);
    expect(reread.total).toBe(issued.total);
    expect(reread.items.map((i) => i.unitPrice)).toEqual(issued.items.map((i) => i.unitPrice));
  });

  it("keeps the guest it names when that guest is later corrected", async () => {
    const id = await aBooking();
    const issued = await bookings().generateInvoice(claims, id);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, select: { guestId: true } });

    await prisma.guest.update({
      where: { id: booking.guestId! },
      data: { fullName: "Somebody Else Entirely" },
    });

    const reread = await bookings().invoicePayload(claims, id);
    expect(reread.guest.fullName).toBe(issued.guest.fullName);
  });

  it("keeps its invoice number and issue date", async () => {
    const id = await aBooking();
    const issued = await bookings().generateInvoice(claims, id);
    const reread = await bookings().invoicePayload(claims, id);
    expect(reread.invoiceNo).toBe(issued.invoiceNo);
    expect(new Date(reread.issuedAt!).getTime()).toBe(new Date(issued.issuedAt!).getTime());
  });
});

/**
 * The other half of the rule, and the one that would be wrong to freeze: a
 * guest paying the balance next week must see that on their invoice, not a
 * document insisting they still owe it.
 */
describe("what is still owed on it", () => {
  it("follows the payments taken after the invoice was issued", async () => {
    const id = await aBooking();
    const issued = await bookings().generateInvoice(claims, id);
    expect(issued.due).toBeGreaterThan(0);

    await payments().addPayment(claims, id, { amount: issued.due, method: "CASH" });

    const reread = await bookings().invoicePayload(claims, id);
    expect(reread.paid).toBe(issued.total);
    expect(reread.due).toBe(0);
    expect(reread.payments.length).toBeGreaterThan(issued.payments.length);
    // and the charge itself did not move underneath the payment
    expect(reread.total).toBe(issued.total);
  });
});

/**
 * Production already holds invoices issued before this existed. They have no
 * snapshot and cannot be given an honest one — freezing today's values and
 * calling them "as issued" would be a worse lie than admitting the gap — so
 * they go on rendering live, and must keep working.
 */
describe("an invoice issued before snapshots existed", () => {
  it("still renders, from whatever the rows say now", async () => {
    const id = await aBooking();
    await bookings().generateInvoice(claims, id);
    await prisma.booking.update({ where: { id }, data: { invoiceSnapshot: null as never } });

    const reread = await bookings().invoicePayload(claims, id);

    expect(reread.invoiceNo).toBeTruthy();
    expect(reread.total).toBeGreaterThan(0);
    expect(reread.guest.fullName).toBe("Test Guest");
  });
});
