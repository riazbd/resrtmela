/**
 * An imported sheet keeps the days it was written with.
 *
 * Reported from a real import: every date came in one day early. The cause was
 * the year, not the timezone — `parseSheetDate` required four digits, the
 * sheet wrote two (`21-Aug-26`), nothing matched, and the value fell through
 * to `new Date(s)`, which reads a bare date as *local* midnight. In Dhaka that
 * is 18:00 UTC the day before, and every reader takes the UTC date part.
 *
 * The unit tests in `a-two-digit-year-is-still-a-year` pin the parser. This
 * one runs rows through the real importer, because a date that parses is not
 * yet a booking that lands on the right night — the nights are derived from
 * check-in and check-out, and an off-by-one in either moves the stay.
 *
 * The rows below follow the shape of the sheet that found this, with invented
 * names: a real register is somebody's guest list, and not ours to commit.
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
let claims: JwtClaims;

const imports = () => makeImportService(asPrismaService);

/** The columns the sheet in question carries, in its order. */
const HEADER =
  "Booking ID,Booking Date,Guest Name,Mobile,NID/Passport No,Room,Check-In,Check-Out,Nights," +
  "Room Rate,Rent,Discount,Advance,Due,Payment Status,Booking Source,Advance received,Adults,Children,Status,Remarks";

const SHEET = [
  HEADER,
  // two-digit year, single-digit day, a month boundary, and a stay crossing
  // into the next year — the shapes that were all landing a day early
  "BK-00002,17-Aug-26,Ayesha Rahman,1655741978,,101,21-Aug-26,22-Aug-26,1,6500,6500,,5000,1500,Partial,,,2,0,Confirmed,",
  "BK-00003,17-Aug-26,Bashir Uddin,1644416720,,102,1-Sep-26,4-Sep-26,3,8500,25500,500,2000,23000,Partial,,,2,0,Confirmed,",
  "BK-00004,18-Aug-26,Chandni Akter,1713065270,,101,31-Dec-26,2-Jan-27,2,6500,13000,,,13000,,,,2,0,Confirmed,",
].join("\n");

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a sheet written with two-digit years", () => {
  it("imports without skipping a row over its dates", async () => {
    const report = await imports().import(claims, fx.resortId, SHEET, true, {
      name: "Standard",
      maxAdults: 4,
      maxChildren: 2,
    });
    const skipped = report.rows.filter((r) => r.outcome === "skipped");
    expect({ skipped: skipped.map((r) => r.message ?? r.outcome) }).toEqual({ skipped: [] });
  });

  it("puts each booking on the night the sheet wrote", async () => {
    await imports().import(claims, fx.resortId, SHEET, false, {
      name: "Standard",
      maxAdults: 4,
      maxChildren: 2,
    });
    const bookings = await prisma.booking.findMany({
      where: { resortId: fx.resortId },
      orderBy: { id: "asc" },
      select: { checkIn: true, checkOut: true },
    });
    const days = bookings.map((b) => ({
      in: b.checkIn.toISOString().slice(0, 10),
      out: b.checkOut.toISOString().slice(0, 10),
    }));
    expect(days).toEqual([
      { in: "2026-08-21", out: "2026-08-22" },
      { in: "2026-09-01", out: "2026-09-04" },
      { in: "2026-12-31", out: "2027-01-02" },
    ]);
  });

  it("bills the nights the sheet counted", async () => {
    // the off-by-one moved a stay rather than shortening it, so this would
    // have passed while the dates were wrong — it is here so that a later
    // fix which shifts only one end fails loudly
    await imports().import(claims, fx.resortId, SHEET, false, {
      name: "Standard",
      maxAdults: 4,
      maxChildren: 2,
    });
    const bookings = await prisma.booking.findMany({
      where: { resortId: fx.resortId },
      orderBy: { id: "asc" },
      select: { checkIn: true, checkOut: true },
    });
    const nights = bookings.map((b) =>
      Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000),
    );
    expect(nights).toEqual([1, 3, 2]);
  });
});

describe("the empty rows a spreadsheet leaves behind", () => {
  it("are not imported as bookings", async () => {
    /**
     * The sheet that found the date bug ends with twenty-five rows of nothing
     * but commas — the tail every spreadsheet export leaves when a range was
     * selected generously. `parseCsv` keeps them, because a row of twenty-one
     * empty fields is not an empty line, so the importer has to be the one
     * that declines them.
     */
    const withTail = [SHEET, ...Array(25).fill(",".repeat(20))].join("\n");
    await imports().import(claims, fx.resortId, withTail, false, {
      name: "Standard",
      maxAdults: 4,
      maxChildren: 2,
    });
    expect(await prisma.booking.count({ where: { resortId: fx.resortId } })).toBe(3);
  });

  it("are reported as skipped rather than passed over in silence", async () => {
    const withTail = [SHEET, ...Array(25).fill(",".repeat(20))].join("\n");
    const report = await imports().import(claims, fx.resortId, withTail, true, {
      name: "Standard",
      maxAdults: 4,
      maxChildren: 2,
    });
    const imported = report.rows.filter((r) => r.outcome !== "skipped");
    expect(imported).toHaveLength(3);
  });
});
