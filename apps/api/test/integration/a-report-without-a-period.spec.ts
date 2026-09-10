/**
 * Three reports answered a missing date range with a 500.
 *
 * The Reports screen opens on "All time", which sends no `from` and no `to`.
 * `pl`, `daily` and `idleInventory` each began with `dateOnly(fromStr)` on a
 * parameter their signature called a `string` and Nest hands over as
 * `undefined` — so `dateOnly` read `getUTCFullYear` off nothing and the tab
 * showed "Something went wrong at our end" the moment it was clicked. Three of
 * the six tabs on that screen, on a resort with real data in it.
 *
 * "All time" cannot be honoured by any of them: `pl` caps at 400 days and
 * `daily` at 120, because both pull every booking in the window into memory,
 * and `idleInventory` divides by the number of days. So the answer is not to
 * lift the caps — it is to have a period when nobody named one, and to say
 * which period that was.
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

/** How many days a report's own answer says it covered. */
const spanOf = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  await seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: iso(new Date(Date.now() - 3 * DAY)),
    checkOut: iso(new Date(Date.now() - 1 * DAY)),
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a report asked for with no period", () => {
  it("answers, rather than failing at our end", async () => {
    const pl = await reports().pl(admin, fx.resortId, undefined, undefined);

    expect(pl.resort).toBeTruthy();
  });

  it("says which period it used, so the screen is not lying about the number", async () => {
    const pl = await reports().pl(admin, fx.resortId, undefined, undefined);

    expect(spanOf(pl.from, pl.to)).toBe(30);
    // ending today rather than starting today: a report about the future is empty
    expect(Date.parse(pl.to)).toBeGreaterThan(Date.now() - DAY);
  });

  it("covers the day sheet too", async () => {
    const days = await reports().daily(admin, fx.resortId, undefined, undefined);

    expect(days.length).toBe(30);
  });

  it("and idle inventory", async () => {
    const idle = await reports().idleInventory(admin, fx.resortId, undefined, undefined);

    expect(idle).toBeTruthy();
  });

  it("counts the stay that happened inside that window", async () => {
    const days = await reports().daily(admin, fx.resortId, undefined, undefined);

    expect(days.some((d) => d.roomRevenue > 0)).toBe(true);
  });
});

describe("a report asked for with a period", () => {
  it("uses the one it was given, not the default", async () => {
    const pl = await reports().pl(admin, fx.resortId, "2026-01-01", "2026-02-01");

    expect(pl.from).toBe("2026-01-01");
    expect(pl.to).toBe("2026-02-01");
  });

  it("still refuses one that runs backwards", async () => {
    await expect(
      reports().pl(admin, fx.resortId, "2026-02-01", "2026-01-01"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("still refuses one too long to hold in memory", async () => {
    await expect(
      reports().pl(admin, fx.resortId, "2020-01-01", "2026-01-01"),
    ).rejects.toThrow(/400 days/);
  });

  it("still caps the day sheet at its own shorter limit", async () => {
    await expect(
      reports().daily(admin, fx.resortId, "2026-01-01", "2026-09-01"),
    ).rejects.toThrow(/120 days/);
  });
});
