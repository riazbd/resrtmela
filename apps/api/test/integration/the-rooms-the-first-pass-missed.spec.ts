/**
 * The three room lists the first pass at natural ordering missed (2026-09-20).
 *
 * Natural room ordering landed on 2026-09-19 — the rooms screen, both
 * calendars, the availability list and the Rooms column of a booking row.
 * Three lists a person also reads were left in the order somebody typed the
 * rooms in, or in plain text order where "10" falls between "1" and "2":
 *
 *   - the **day sheet**, which is the screen a front desk has open all
 *     morning, one row per room, read top to bottom at the counter;
 *   - the **out-of-service rooms** on the idle-inventory report;
 *   - the **rooms sheet of a data export**, which somebody opens in Excel.
 *
 * Found by opening the day sheet on the demo resort, where it read
 * "3 Orchid, 1 Camellia, 10 Bakul, 2 Lotus…". No test could have noticed:
 * every fixture creates its rooms in the order it wants them back, which is
 * why these are created deliberately out of order below.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService, makeReportsService, makeExportService } from "../helpers/services";

const prisma = testPrisma();
let fx: Fixture;
let svc: ReturnType<typeof makeBookingsService>;
let reports: ReturnType<typeof makeReportsService>;
let exports_: ReturnType<typeof makeExportService>;

const desk = (): JwtClaims => ({
  userId: fx.managerId,
  role: ROLE.RESORT_ADMIN,
  resortIds: [fx.resortId],
});

/**
 * Created deliberately out of order, and with a two-digit number, because
 * both mistakes the ordering exists to prevent are invisible in a fixture
 * that happens to be sorted already.
 */
async function roomsTypedInAMuddle() {
  await prisma.room.deleteMany({ where: { resortId: fx.resortId } });
  for (const name of ["3 Orchid", "1 Camellia", "10 Bakul", "2 Lotus", "Annex Cabin"]) {
    await prisma.room.create({
      data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name, baseRate: 4500 },
    });
  }
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  svc = makeBookingsService(prisma);
  reports = makeReportsService(prisma);
  exports_ = makeExportService(prisma);
  await roomsTypedInAMuddle();
});

afterAll(async () => prisma.$disconnect());

describe("the rows of a day sheet", () => {
  it("are the rooms, in the order a person counts them", async () => {
    const sheet = await svc.daySheet(desk(), fx.resortId);
    expect(sheet.rooms.map((r) => r.name)).toEqual([
      "1 Camellia",
      "2 Lotus",
      "3 Orchid",
      "10 Bakul",
      "Annex Cabin",
    ]);
  });

  /**
   * The mistake plain text ordering makes, named on its own so a failure
   * says which rule broke rather than only that a list differs.
   */
  it("put ten after nine, not after one", async () => {
    const names = (await svc.daySheet(desk(), fx.resortId)).rooms.map((r) => r.name);
    expect(names.indexOf("10 Bakul")).toBeGreaterThan(names.indexOf("3 Orchid"));
  });

  it("put the rooms that are named rather than numbered at the end", async () => {
    const names = (await svc.daySheet(desk(), fx.resortId)).rooms.map((r) => r.name);
    expect(names[names.length - 1]).toBe("Annex Cabin");
  });
});

describe("the rooms a report says are out of service", () => {
  it("are listed the way the rooms screen lists them", async () => {
    await prisma.room.updateMany({
      where: { resortId: fx.resortId, name: { in: ["10 Bakul", "2 Lotus", "Annex Cabin"] } },
      data: { status: "OUT_OF_SERVICE" },
    });
    const report = await reports.idleInventory(desk(), fx.resortId);
    expect(report.outOfServiceRooms.map((r) => r.name)).toEqual([
      "2 Lotus",
      "10 Bakul",
      "Annex Cabin",
    ]);
  });
});

describe("the rooms sheet of an export", () => {
  /**
   * A spreadsheet somebody opens to check their own inventory. It came out
   * in `id` order, which is the order the rooms were typed in years ago.
   */
  it("reads in room order, like every other list of rooms", async () => {
    const archive = await exports_.archive(desk(), fx.resortId);
    const sheet = archive.datasets.rooms;
    expect(sheet.rows.map((r) => r[0])).toEqual([
      "1 Camellia",
      "2 Lotus",
      "3 Orchid",
      "10 Bakul",
      "Annex Cabin",
    ]);
  });
});
