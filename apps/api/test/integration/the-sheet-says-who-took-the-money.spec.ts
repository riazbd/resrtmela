/**
 * What the importer knew about a payment, and what it made up.
 *
 * Every payment in the client's production database says CASH and says nobody
 * took it. Neither is a fact anybody entered: the importer wrote `method:
 * "CASH"` as a literal for every row it ever imported, and the receiver lookup
 * was a name search that missed. A resort whose bank transfers all read as
 * cash cannot count its drawer, and the money report — built last week to
 * answer *who took it* — has nothing to answer with.
 *
 * The rule this file pins is the one the importer already applies to the
 * Source column: an unreadable cell is not evidence of anything. A sheet that
 * names a method gets that method; a sheet that does not gets no method, not
 * a guess wearing a fact's clothes.
 *
 * The receiver lookup carries a second fault, and a worse one. It searched
 * `user` by name substring across the entire platform — no resort, no role, no
 * tenant — so a sheet naming "Rahim" could attach a dozen other clients' staff
 * to this resort's money. The agent-matching block ten lines above it was
 * fixed for precisely this in an earlier pass; this one was left behind.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeImportService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;

const importer = () => makeImportService(asPrismaService);

/** A sheet, built from whichever columns the test is about. */
function sheet(extraHeaders: string, extraCells: string): string {
  return [
    `Booking ID,Guest Name,Mobile,Room,Check-In,Check-Out,Room Rate,Advance${extraHeaders}`,
    `BK-7001,Rahima Khatun,8801722222222,${"{ROOM}"},2026-11-01,2026-11-03,5000,4000${extraCells}`,
  ].join("\n");
}

async function paymentFor(code: string) {
  const booking = await prisma.booking.findFirstOrThrow({ where: { code } });
  return prisma.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const room = () => fx.rooms[0]!.name;
const csv = (h: string, c: string) => sheet(h, c).replace("{ROOM}", room());

describe("the method the sheet named", () => {
  it("files a bKash advance as bKash", async () => {
    await importer().import(manager, fx.resortId, csv(",Payment Method", ",bKash"), false);
    expect((await paymentFor("BK-7001")).method).toBe("BKASH");
  });

  it("reads a bank transfer however the sheet spelled it", async () => {
    await importer().import(manager, fx.resortId, csv(",Method", ",Bank Transfer"), false);
    expect((await paymentFor("BK-7001")).method).toBe("BANK");
  });

  /**
   * The whole point. 42 production rows claim cash on the strength of a
   * literal in this file, and the owner has no way to tell them from the ones
   * where somebody actually counted notes.
   */
  it("records no method at all when the sheet has no column for one", async () => {
    await importer().import(manager, fx.resortId, csv("", ""), false);
    expect((await paymentFor("BK-7001")).method).toBeNull();
  });

  it("records no method when the cell is there but empty", async () => {
    await importer().import(manager, fx.resortId, csv(",Payment Method", ",  "), false);
    expect((await paymentFor("BK-7001")).method).toBeNull();
  });

  /**
   * A resort that does not take cards should not acquire a card payment
   * because a sheet said so. The method list is the resort's own, exactly as
   * the Source column is matched against its own channel list.
   */
  it("does not invent a method the resort does not accept", async () => {
    // this resort takes cash and bKash, and has never owned a card terminal.
    // Writing the list explicitly also stops the lazy seeder filling in the
    // platform defaults, which include CARD.
    await prisma.resortOption.createMany({
      data: [
        { resortId: fx.resortId, list: "PAYMENT_METHOD", code: "CASH", label: "Cash", sortOrder: 0 },
        { resortId: fx.resortId, list: "PAYMENT_METHOD", code: "BKASH", label: "bKash", sortOrder: 1 },
      ],
    });
    await importer().import(manager, fx.resortId, csv(",Payment Method", ",Card"), false);
    expect((await paymentFor("BK-7001")).method).toBeNull();
  });
});

describe("the person the sheet named", () => {
  it("credits a receipt to the staff member who took it", async () => {
    await importer().import(manager, fx.resortId, csv(",Received By", ",Test Manager"), false);
    expect((await paymentFor("BK-7001")).receivedById).toBe(fx.managerId);
  });

  /**
   * The leak. This user belongs to another tenant entirely and has never been
   * near this resort; the old lookup would find them by substring and write
   * their id onto this resort's money.
   */
  it("never credits a receipt to somebody from another resort", async () => {
    // a real person, at somebody else's resort, who has never seen this one
    const elsewhere = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Another Resort", slug: `another-${Date.now()}`, location: "Sylhet" },
    });
    const stranger = await prisma.user.create({
      data: {
        name: "Kamrul Hasan",
        email: `kamrul-${Date.now()}@elsewhere.test`,
        phone: `8801999${String(Date.now()).slice(-6)}`,
        passwordHash: "x",
        role: "FRONT_DESK",
        resorts: { create: { resortId: elsewhere.id } },
      },
    });

    const report = await importer().import(
      manager, fx.resortId, csv(",Received By", ",Kamrul Hasan"), false,
    );

    const payment = await paymentFor("BK-7001");
    expect(payment.receivedById).not.toBe(stranger.id);
    expect(payment.receivedById).toBeNull();
    // and the owner is told, rather than the row going quiet
    expect(report.unmatchedReceivers).toContain("Kamrul Hasan");
  });

  /**
   * A dry run exists to surface what the real import will do, and this is one
   * of the things it will do. Learning that a column matched nobody *after*
   * 168 rows are in is learning it too late — and the file already holds this
   * line about the Booking ID check: a dry run that promises something the
   * real import does not deliver is the exact fault a dry run rules out.
   */
  it("says so on a dry run, before anything is written", async () => {
    const report = await importer().import(
      manager, fx.resortId, csv(",Received By", ",Kamrul Hasan"), true,
    );
    expect(report.unmatchedReceivers).toContain("Kamrul Hasan");
    expect(await prisma.booking.count({ where: { code: "BK-7001" } })).toBe(0);
  });

  it("leaves the receipt unattributed when the sheet names nobody", async () => {
    const report = await importer().import(manager, fx.resortId, csv("", ""), false);
    expect((await paymentFor("BK-7001")).receivedById).toBeNull();
    expect(report.unmatchedReceivers).toEqual([]);
  });
});
