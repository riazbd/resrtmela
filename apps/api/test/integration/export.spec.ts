/**
 * Tenant data export.
 *
 * Suspension is only defensible if the tenant can still take their own records
 * with them. Without an export, "settle the bill or lose access" reads as
 * "settle the bill or lose your books" — which is the kind of thing that makes
 * a platform impossible to trust, and in this market spreads by word of mouth
 * faster than any feature.
 *
 * So the rules the tests hold to: a suspended tenant can still export, an
 * export never crosses a resort boundary, and the money in it is the money the
 * screens show — recomputed, not a stale column.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeExportService } from "../helpers/services";
import { parseCsv } from "../../src/import/csv";
import { toCsv, CSV_BOM } from "../../src/export/csv-writer";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;

const exporter = () => makeExportService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("csv writer", () => {
  it("survives the values a Bangladeshi guest register actually contains", () => {
    const csv = toCsv(["name", "note"], [
      ["Rahim, Md.", 'said "great stay"'],
      ["শাহনাজ বেগম", "line one\nline two"],
    ]);
    const table = parseCsv(csv.slice(CSV_BOM.length));
    expect(table[1]).toEqual(["Rahim, Md.", 'said "great stay"']);
    expect(table[2]).toEqual(["শাহনাজ বেগম", "line one\nline two"]);
  });

  it("starts with a byte-order mark so Excel shows Bangla instead of mojibake", () => {
    expect(toCsv(["a"], [["শাহনাজ"]]).startsWith(CSV_BOM)).toBe(true);
  });
});

describe("tenant export", () => {
  it("exports bookings with the money the screens show, not a stored column", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { taxRatePct: 10 as never } });
    await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-04-01", checkOut: "2026-04-03", unitPrice: 5000, advance: 2000, code: "BK-00001",
    });

    const csv = await exporter().csv(admin, fx.resortId, "bookings");
    const table = parseCsv(csv.slice(CSV_BOM.length));
    const header = table[0]!;
    const row = table[1]!;
    const cell = (name: string) => row[header.indexOf(name)];

    expect(cell("code")).toBe("BK-00001");
    expect(cell("nights")).toBe("2");
    expect(cell("rent")).toBe("10000"); // 5000 x 2 nights, not 5000
    expect(cell("tax")).toBe("1000");
    expect(cell("total")).toBe("11000");
    expect(cell("paid")).toBe("2000");
    expect(cell("due")).toBe("9000");
  });

  it("never lets one resort's export contain another's guests", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await prisma.guest.update({ where: { id: other.guestId }, data: { fullName: "Someone Else" } });

    const csv = await exporter().csv(admin, fx.resortId, "guests");

    expect(csv).toContain("Test Guest");
    expect(csv).not.toContain("Someone Else");
  });

  it("still works when the resort is suspended — that is the entire point", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: "2026-04-01", checkOut: "2026-04-02" });
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { status: "suspended", suspendedReason: "billing", suspendedAt: new Date() },
    });

    const archive = await exporter().archive(admin, fx.resortId);

    expect(archive.datasets.bookings!.rows).toHaveLength(1);
  });

  it("puts every dataset in the archive, with a count that matches the rows", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: "2026-04-01", checkOut: "2026-04-02", advance: 1000 });
    await prisma.expense.create({
      data: { resortId: fx.resortId, date: new Date("2026-04-01"), category: "Diesel", amount: 3000 as never },
    });

    const archive = await exporter().archive(admin, fx.resortId);

    expect(Object.keys(archive.datasets).sort()).toEqual(
      ["activities", "bookings", "expenses", "guests", "payments", "restaurant", "rooms", "staff"],
    );
    expect(archive.datasets.expenses!.rows).toHaveLength(1);
    expect(archive.datasets.payments!.rows).toHaveLength(1);
    expect(archive.datasets.rooms!.rows).toHaveLength(2);
    expect(archive.counts.bookings).toBe(1);
    expect(archive.resort.name).toBe("Test Resort");
  });

  it("refuses a dataset that does not exist rather than returning an empty file", async () => {
    await expect(exporter().csv(admin, fx.resortId, "everything")).rejects.toMatchObject({ status: 400 });
  });

  it("is gated on a permission, not on being logged in", async () => {
    const role = await prisma.customRole.create({
      data: { resortId: fx.resortId, name: "Desk", permissions: ["bookings.view"] as never },
    });
    const clerk = await prisma.user.create({
      data: { name: "Clerk", phone: `88099${Date.now() % 1e7}`, role: "FRONT_DESK" },
    });
    await prisma.userResort.create({ data: { userId: clerk.id, resortId: fx.resortId, roleId: role.id } });
    const clerkClaims: JwtClaims = { userId: clerk.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };

    await expect(exporter().csv(clerkClaims, fx.resortId, "bookings")).rejects.toMatchObject({ status: 403 });
  });

  it("does not export a resort the user has no access to", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await expect(exporter().csv(admin, other.resortId, "bookings")).rejects.toMatchObject({ status: 403 });
  });

  it("leaves deleted bookings out, the same as every other list", async () => {
    const gone = await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: "2026-05-01", checkOut: "2026-05-02" });
    await prisma.booking.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const archive = await exporter().archive(admin, fx.resortId);

    expect(archive.datasets.bookings!.rows).toHaveLength(0);
  });
});
