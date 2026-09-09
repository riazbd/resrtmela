/**
 * What the importer calls the rooms it creates.
 *
 * A spreadsheet import into a resort with no room types had to attach the rooms
 * to something, and it invented one: "Standard", two adults, no children. A
 * resort importing family cottages got its whole inventory typed as a double,
 * and nothing on screen said where that had come from.
 *
 * The import screen is an interactive, one-time setup step — the cheapest place
 * in the whole product to ask a question. So it asks, with the old invention as
 * the prefilled suggestion: the fast path is still one keypress, but the answer
 * belongs to the person who knows it.
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
let emptyResortId: number;

const importer = () => makeImportService(asPrismaService);

/** One booking row for a room the resort does not have yet. */
const CSV = [
  "code,guest,phone,room,checkIn,checkOut,rate",
  "BK-9001,Farhana Rahman,8801711111111,Cottage-1,2026-11-01,2026-11-03,4000",
].join("\n");

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };

  // a resort with nothing in it, which is what a real first import looks like
  const bare = await prisma.resort.create({
    data: { tenantId: fx.tenantId, name: "Bare Resort", location: "Sajek" },
  });
  emptyResortId = bare.id;
  await prisma.userResort.create({ data: { userId: fx.managerId, resortId: bare.id } });
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId, bare.id] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a first import into an empty resort", () => {
  it("uses the type the owner named, not one it made up", async () => {
    await importer().import(manager, emptyResortId, CSV, false, {
      name: "Family cottage",
      maxAdults: 4,
      maxChildren: 2,
    });

    const types = await prisma.roomType.findMany({ where: { resortId: emptyResortId } });
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({ name: "Family cottage", maxAdults: 4, maxChildren: 2 });
  });

  it("still works when nothing is said, because an import must not fail on a label", async () => {
    await importer().import(manager, emptyResortId, CSV, false);

    const types = await prisma.roomType.findMany({ where: { resortId: emptyResortId } });
    expect(types).toHaveLength(1);
    expect(types[0]!.name).toBe("Standard");
  });

  it("says in the report that it had to name the type itself", async () => {
    const report = await importer().import(manager, emptyResortId, CSV, false);

    // the old importer did this silently, so nobody knew there was anything to
    // go back and correct
    expect(report.roomTypeCreated).toMatchObject({ name: "Standard", assumed: true });
  });

  it("does not claim it named anything when the owner said what to call it", async () => {
    const report = await importer().import(manager, emptyResortId, CSV, false, {
      name: "Family cottage",
    });

    expect(report.roomTypeCreated).toMatchObject({ name: "Family cottage", assumed: false });
  });

  it("leaves an existing resort's types alone", async () => {
    const report = await importer().import(manager, fx.resortId, CSV, false, { name: "Ignored" });

    const types = await prisma.roomType.findMany({ where: { resortId: fx.resortId } });
    expect(types.map((t) => t.name)).toEqual(["Deluxe"]);
    expect(report.roomTypeCreated).toBeNull();
  });

  it("changes nothing on a dry run", async () => {
    await importer().import(manager, emptyResortId, CSV, true, { name: "Family cottage" });

    expect(await prisma.roomType.count({ where: { resortId: emptyResortId } })).toBe(0);
  });
});
