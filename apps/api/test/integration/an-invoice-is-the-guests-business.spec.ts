/**
 * What an invoice may say about the agency that sold the stay.
 *
 * The owner asked whether showing an agent and their commission on an invoice
 * is justified at all. Two different answers, and this pins both.
 *
 * **The commission: never.** An invoice is a document from a seller to a
 * buyer, and in Bangladesh it is a tax document with the resort's BIN printed
 * on it. What the resort pays an agency is not a supply to the guest and not a
 * figure the guest was charged — so it has no line to stand in. Commercially
 * it is worse than pointless: a guest who sees that a room they paid ৳10,000
 * for earned the agency ৳1,000 has been handed the argument for going around
 * them next time, which is why this trade calls them confidential rates.
 *
 * **The agency's name: yes, as a reference.** Like the booking code — it says
 * which agency to ring about the stay, on the document the guest keeps.
 *
 * **But the name has to be the agency's, not the clerk's.** The invoice was
 * the one place in this codebase that answered "who sold this" with a person:
 * a guest's tax document named whichever staff member typed the booking, who
 * has nothing to do with the supply. The Dues rollup and the agent accounts
 * both resolve to the agency, and an invoice disagreeing with them is one
 * nobody can reconcile.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import { todayIn } from "../../src/common/dates";

/** `n` days on from a date-only value, in UTC as the column stores it. */
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const bookings = () => makeBookingsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.resort.update({
    where: { id: fx.resortId },
    data: { agentCommissionKind: "PERCENT", agentCommissionRate: 10 },
  });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A stay an agency sold, with an invoice number on it. */
async function invoicedAgencyStay() {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId: fx.rooms[0]!.id,
    checkIn: "2026-08-15",
    checkOut: "2026-08-17",
    unitPrice: 5000,
  });
  await prisma.booking.update({
    where: { id: b.id },
    data: {
      agentUserId: fx.agentId,
      source: "AGENT",
      state: "CONFIRMED",
      invoiceNo: "SER-00001",
      invoiceAt: new Date(),
    },
  });
  return b;
}

describe("an invoice and the agency behind it", () => {
  /** The field is `agency`, not `agent` — on a booking row `agent` is the
   * person, and one word meaning two things across two payloads is how a
   * clerk's name reached a guest's tax document in the first place. */
  it("names the agency that sold the stay", async () => {
    const b = await invoicedAgencyStay();
    const inv = await bookings().invoicePayload(owner, b.id);

    const agency = await prisma.tenant.findUniqueOrThrow({
      where: { id: (await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } })).accountId! },
    });
    expect(inv.booking.agency).toBe(agency.name);
  });

  /**
   * The failure this replaced: a guest's tax document naming a person they
   * have never heard of, who is not a party to the sale.
   */
  it("does not name the person at the agency who typed it", async () => {
    const b = await invoicedAgencyStay();
    const clerk = await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } });
    const inv = await bookings().invoicePayload(owner, b.id);
    expect(inv.booking.agency).not.toBe(clerk.name);
  });

  /**
   * The whole point. A commission on a guest's invoice is a figure the guest
   * was not charged, on a document that exists to say what they were.
   */
  it("carries no commission anywhere in it, at any depth", async () => {
    const b = await invoicedAgencyStay();
    const inv = await bookings().invoicePayload(owner, b.id);

    const text = JSON.stringify(inv).toLowerCase();
    expect(text).not.toContain("commission");
    // the figure itself, not only the word: 10% of a ৳10,000 stay
    expect(text).not.toContain("agentprice");
    expect(text).not.toContain('"1000"');
  });

  it("charges the guest the whole rent, never the net of commission", async () => {
    const b = await invoicedAgencyStay();
    const inv = await bookings().invoicePayload(owner, b.id);
    // 2 nights × 5,000 — what the guest agreed, not the 9,000 the agent owes
    expect(inv.rent).toBe(10_000);
    expect(inv.total).toBe(10_000);
  });

  it("says nothing about an agency on a stay the resort sold itself", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: fx.rooms[1]!.id,
      checkIn: "2026-09-01",
      checkOut: "2026-09-02",
      unitPrice: 5000,
    });
    await prisma.booking.update({
      where: { id: b.id },
      data: { invoiceNo: "SER-00002", invoiceAt: new Date() },
    });
    const inv = await bookings().invoicePayload(owner, b.id);
    expect(inv.booking.agency).toBeNull();
  });
});

/**
 * The other half of the same question, and the one the owner asked next:
 * *"okhane person er name ase valo kotha but kon agency er person?"*
 *
 * A resort's booking list named the person and stopped. That is the smaller
 * half — a resort has no relationship with Rafiqul Islam, and the rate, the
 * account and the settlement all hang off Sea Breeze Travels behind him. Both
 * facts now travel, under two names that mean one thing each.
 */
describe("a booking says which agency it came from", () => {
  it("carries the firm and the person on the list", async () => {
    const b = await invoicedAgencyStay();
    const page = await bookings().list(owner, { resortId: fx.resortId, take: 50 });
    const row = page.rows.find((r) => r.id === b.id);
    expect(row).toBeTruthy();

    const clerk = await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } });
    const agency = await prisma.tenant.findUniqueOrThrow({ where: { id: clerk.accountId! } });
    expect(row!.agency).toBe(agency.name);
    expect(row!.agent).toBe(clerk.name);
  });

  it("carries both on the booking itself", async () => {
    const b = await invoicedAgencyStay();
    const detail = await bookings().detail(owner, b.id);
    const clerk = await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } });
    const agency = await prisma.tenant.findUniqueOrThrow({ where: { id: clerk.accountId! } });
    expect(detail.agency).toBe(agency.name);
    expect(detail.agent).toBe(clerk.name);
  });

  /**
   * The day sheet reads the *resort's* today rather than a date it is handed,
   * so the stay is moved onto it instead of the clock being moved back.
   */
  it("carries both on the day sheet", async () => {
    const b = await invoicedAgencyStay();
    const resort = await prisma.resort.findUniqueOrThrow({
      where: { id: fx.resortId },
      select: { timezone: true },
    });
    const today = todayIn(resort.timezone);
    await prisma.booking.update({
      where: { id: b.id },
      data: { checkIn: today, checkOut: addDays(today, 2), state: "CONFIRMED" },
    });
    const sheet = await bookings().today(owner, fx.resortId);
    // the feed is arrivals and departures; this stay arrives that morning
    const row = [...sheet.arrivals, ...sheet.departures].find((r) => r.id === b.id);
    expect(row).toBeTruthy();
    const agency = await prisma.tenant.findUniqueOrThrow({
      where: { id: (await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } })).accountId! },
    });
    expect(row!.agency).toBe(agency.name);
  });

  /** A walk-in has neither, and must not be given an invented firm. */
  it("says nothing on a stay the resort took itself", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: fx.rooms[1]!.id,
      checkIn: "2026-09-10",
      checkOut: "2026-09-11",
      unitPrice: 5000,
    });
    const detail = await bookings().detail(owner, b.id);
    expect(detail.agency).toBeNull();
    expect(detail.agent).toBeNull();
  });
});
