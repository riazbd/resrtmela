/**
 * The sample file the Import screen hands out has to import.
 *
 * A sample CSV is a promise: "shape your sheet like this and it will go in".
 * It is also the easiest kind of documentation to let rot — the column list
 * lives in a string in the web app, the parser lives here, and nothing makes
 * them agree. A header the importer renamed last month leaves a download that
 * fails on the first row, which is worse than offering no sample at all,
 * because the person following it concludes the importer is broken.
 *
 * So the samples live in @rh/shared and this runs each one through the real
 * parser. If someone changes a column name on either side, this fails.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { SAMPLE_BOOKINGS_CSV, SAMPLE_EXPENSES_CSV, SAMPLE_FB_CSV } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeImportService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;

const imports = () => makeImportService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the sample sheet the Import screen offers", () => {
  it("has every column the bookings importer needs", async () => {
    const report = await imports().import(claims, fx.resortId, SAMPLE_BOOKINGS_CSV, true, {
      name: "Standard",
      maxAdults: 2,
      maxChildren: 2,
    });
    expect(report.totalRows).toBeGreaterThan(0);
    // a dry run reports per-row problems rather than throwing, so "it parsed"
    // proves nothing: a skipped row is a row the sample taught someone to write
    // wrong. An empty list is the only result that means "follow this file".
    const skipped = report.rows.filter((r) => r.outcome === "skipped");
    expect(skipped, JSON.stringify(skipped.slice(0, 3))).toHaveLength(0);
  });

  it("demonstrates an out-of-service row that the importer recognises", async () => {
    /*
     * The sample carries a blocked room because that is the question people
     * write in about. It is also the easiest row to get wrong: the importer
     * reads "out of service" from the Guest Name or Remarks column, not from
     * Status, and a sample that puts it in Status imports a phantom booking
     * for a room that was shut. The browser check caught exactly that.
     */
    const report = await imports().import(claims, fx.resortId, SAMPLE_BOOKINGS_CSV, true, {
      name: "Standard",
      maxAdults: 2,
      maxChildren: 2,
    });
    expect(report.outOfService).toBe(1);
  });

  it("still imports after the round trip through Excel", async () => {
    // the download carries a BOM so Excel reads Bangla category names as UTF-8
    // instead of mojibake; what comes back up therefore has one on the front,
    // and a header of "﻿Booking ID" matches no column at all
    const report = await imports().import(claims, fx.resortId, `﻿${SAMPLE_BOOKINGS_CSV}`, true, {
      name: "Standard",
      maxAdults: 2,
      maxChildren: 2,
    });
    expect(report.rows.filter((r) => r.outcome === "skipped")).toHaveLength(0);
  });

  it("actually imports, not just parses", async () => {
    await imports().import(claims, fx.resortId, SAMPLE_BOOKINGS_CSV, false, {
      name: "Standard",
      maxAdults: 2,
      maxChildren: 2,
    });
    const made = await prisma.booking.count({ where: { resortId: fx.resortId } });
    expect(made).toBeGreaterThan(0);
  });

  it("has every column the expenses importer needs", async () => {
    const report = await imports().importExpenses(claims, fx.resortId, SAMPLE_EXPENSES_CSV);
    expect(report.imported).toBeGreaterThan(0);
  });

  it("has every column the restaurant importer needs", async () => {
    const report = await imports().importFb(claims, fx.resortId, SAMPLE_FB_CSV);
    expect(report.imported).toBeGreaterThan(0);
  });
});
