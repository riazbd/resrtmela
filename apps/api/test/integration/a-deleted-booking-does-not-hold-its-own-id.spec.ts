/**
 * Deleting an import and doing it again.
 *
 * Reported from production, and the sequence is entirely reasonable: the owner
 * imported the wrong sheet, deleted the lot from the console, corrected the
 * spreadsheet, and imported it again with the same Booking IDs. Nothing
 * imported, and the report said something about a constraint.
 *
 * The cause is that a booking is never hard-deleted — `deletedAt`, so a closed
 * month stays reconcilable — while the uniqueness of its code is
 * `(resortId, code)` with no room for that. MariaDB has no partial index, so a
 * deleted booking goes on owning its own ID forever, against an owner who has
 * every reason to believe they got rid of it.
 *
 * A deleted booking is not part of the live books. Re-importing its ID is the
 * owner saying "that one was wrong, here is the right one", and the importer
 * should do exactly that — and say how many it did, because silently replacing
 * rows somebody deleted is its own kind of surprise.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeImportService, makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const imports = () => makeImportService(asPrismaService);
const bookings = () => makeBookingsService(asPrismaService);

const HEADER =
  "Booking ID,Booking Date,Guest Name,Mobile,NID/Passport No,Room,Check-In,Check-Out,Nights," +
  "Room Rate,Rent,Discount,Advance,Due,Payment Status,Booking Source,Advance received,Adults,Children,Status,Remarks";

/** What went in the first time, with the wrong rate and the wrong guest on 102. */
const WRONG = [
  HEADER,
  "BK-00002,17-Aug-26,Ayesha Rahman,1655741978,,101,21-Aug-26,22-Aug-26,1,6500,6500,,5000,1500,Partial,,,2,0,Confirmed,",
  "BK-00003,17-Aug-26,Wrong Person,1644416720,,102,1-Sep-26,4-Sep-26,3,1000,3000,,0,3000,,,,2,0,Confirmed,",
].join("\n");

/** The corrected sheet, same Booking IDs — which is the whole point. */
const CORRECTED = [
  HEADER,
  "BK-00002,17-Aug-26,Ayesha Rahman,1655741978,,101,21-Aug-26,22-Aug-26,1,6500,6500,,5000,1500,Partial,,,2,0,Confirmed,",
  "BK-00003,17-Aug-26,Bashir Uddin,1644416720,,102,1-Sep-26,4-Sep-26,3,8500,25500,500,2000,23000,Partial,,,2,0,Confirmed,",
].join("\n");

const ROOM_TYPE = { name: "Standard", maxAdults: 4, maxChildren: 2 };

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Imports the wrong sheet and deletes it the way the console's button does. */
async function importThenDelete() {
  await imports().import(claims, fx.resortId, WRONG, false, ROOM_TYPE);
  const rows = await prisma.booking.findMany({
    where: { resortId: fx.resortId },
    select: { id: true },
  });
  await bookings().softDeleteMany(claims, fx.resortId, rows.map((r) => r.id));
  return rows.length;
}

describe("importing again after deleting the last attempt", () => {
  it("leaves the deleted bookings in the table, which is what causes this", async () => {
    const deleted = await importThenDelete();
    expect(deleted).toBe(2);
    // gone from the books, still holding BK-00002 and BK-00003
    const live = await prisma.booking.count({ where: { resortId: fx.resortId, deletedAt: null } });
    const held = await prisma.booking.count({ where: { resortId: fx.resortId } });
    expect({ live, held }).toEqual({ live: 0, held: 2 });
  });

  it("imports the corrected sheet instead of refusing every row", async () => {
    await importThenDelete();

    const report = await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);

    expect({
      imported: report.imported,
      skipped: report.rows.filter((r) => r.outcome === "skipped").map((r) => r.detail ?? r.outcome),
    }).toEqual({ imported: 2, skipped: [] });
  });

  it("says how many deleted bookings it replaced, rather than doing it quietly", async () => {
    await importThenDelete();
    const report = await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);
    expect(report.replacedDeleted).toBe(2);
  });

  it("ends with the corrected booking, not the wrong one it replaced", async () => {
    await importThenDelete();
    await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);

    const live = await prisma.booking.findMany({
      where: { resortId: fx.resortId, deletedAt: null },
      orderBy: { code: "asc" },
      include: { items: true },
    });
    expect(live.map((b) => b.code)).toEqual(["BK-00002", "BK-00003"]);
    // the wrong rate is gone with the row that carried it: 1000 became 8500
    expect(live.map((b) => Number(b.items[0]!.unitPrice))).toEqual([6500, 8500]);
  });

  /**
   * A guest is not replaced along with the booking, and that is the existing
   * rule rather than an oversight of this change: a guest is identified by
   * phone number, and a name already on file is only overwritten when it was
   * blank. The corrected sheet here renames BK-00003's guest from "Wrong
   * Person" to "Bashir Uddin" on the same mobile, and the name on file stays.
   *
   * Leaving it alone is deliberate. Families and offices book on one number,
   * and letting each import rename that guest would have whoever booked last
   * silently retitle every stay before it. Whether a corrected sheet ought to
   * win is a real question, and a separate one from this fix — pinned here so
   * that when it is asked, it is asked about behaviour somebody chose.
   */
  it("keeps the guest already on file, because a phone number is the identity", async () => {
    await importThenDelete();
    await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);

    const booking = await prisma.booking.findFirst({
      where: { resortId: fx.resortId, code: "BK-00003", deletedAt: null },
      include: { guest: true },
    });
    expect(booking?.guest?.fullName).toBe("Wrong Person");
    // and only one guest exists for that number, rather than a second one
    const sameNumber = await prisma.guest.count({
      where: { resortId: fx.resortId, phone: { contains: "1644416720" } },
    });
    expect(sameNumber).toBe(1);
  });

  it("leaves no trace of the replaced rows to collide with next time", async () => {
    await importThenDelete();
    await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);
    const all = await prisma.booking.count({ where: { resortId: fx.resortId } });
    expect(all).toBe(2);
  });

  /**
   * The guard that keeps this from becoming a way to overwrite live bookings.
   * A code that is in use and *not* deleted is still a refusal — two different
   * stays cannot share an ID, and an importer that quietly replaced a live
   * booking would be a far worse bug than the one being fixed.
   */
  it("still refuses a Booking ID that is in use and not deleted", async () => {
    await imports().import(claims, fx.resortId, WRONG, false, ROOM_TYPE);

    const report = await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);

    expect(report.imported).toBe(0);
    expect(report.replacedDeleted).toBe(0);
    const reasons = report.rows.filter((r) => r.outcome === "skipped").map((r) => r.detail ?? "");
    expect(reasons.every((d) => /already/i.test(d))).toBe(true);
  });

  it("names the booking in the refusal, so the owner knows which row to look at", async () => {
    await imports().import(claims, fx.resortId, WRONG, false, ROOM_TYPE);
    const report = await imports().import(claims, fx.resortId, CORRECTED, false, ROOM_TYPE);
    const first = report.rows.find((r) => r.outcome === "skipped");
    expect(first?.detail).toMatch(/BK-00002/);
  });

  it("changes nothing on a dry run, however many it would replace", async () => {
    await importThenDelete();

    const report = await imports().import(claims, fx.resortId, CORRECTED, true, ROOM_TYPE);

    expect(report.replacedDeleted).toBe(2);
    // the deleted rows are still there: a dry run reports, it does not act
    const held = await prisma.booking.count({ where: { resortId: fx.resortId } });
    expect(held).toBe(2);
    const live = await prisma.booking.count({ where: { resortId: fx.resortId, deletedAt: null } });
    expect(live).toBe(0);
  });
});
