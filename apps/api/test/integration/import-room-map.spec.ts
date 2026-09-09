/**
 * Matching a restaurant bill to a room.
 *
 * The F&B importer takes an optional map from whatever the spreadsheet writes
 * in its room column to a real room name. The map is a sensible escape hatch —
 * plenty of kitchen registers write "3" where the property calls the room
 * "Snow Drop".
 *
 * What was not sensible is that the console shipped one specific resort's map,
 * `{ "3": "Snow Drop" }`, hardcoded into the import screen and sent on every
 * import by every customer. A resort whose rooms are numbered 1-20 had bill
 * number 3 silently attached to a room called Snow Drop if it happened to have
 * one, and every other bill dropped on the floor.
 *
 * A sheet that already writes the room's real name needs no map at all, and
 * that is now the path that works by default.
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

/** The seeded resort's rooms are called "101" and "102". */
const billFor = (room: string) =>
  [
    "date,bill no,guest name,room,item,qty,unit price,total,paid,status",
    `2026-11-01,RES-00001,Farhana,${room},Lunch,2,300,600,600,PAID`,
  ].join("\n");

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("which room a bill belongs to", () => {
  it("matches a sheet that already writes the room's own name", async () => {
    await importer().importFb(manager, fx.resortId, billFor("101"));

    const bill = await prisma.fbBill.findFirst({ where: { resortId: fx.resortId } });
    expect(bill!.roomId).toBe(fx.rooms[0]!.id);
  });

  it("does not care about the case the sheet used", async () => {
    const room = await prisma.room.findFirst({ where: { id: fx.rooms[1]!.id } });
    await prisma.room.update({ where: { id: room!.id }, data: { name: "Snow Drop" } });

    await importer().importFb(manager, fx.resortId, billFor("snow drop"));

    const bill = await prisma.fbBill.findFirst({ where: { resortId: fx.resortId } });
    expect(bill!.roomId).toBe(fx.rooms[1]!.id);
  });

  it("still honours a map when the sheet writes something else entirely", async () => {
    await importer().importFb(manager, fx.resortId, billFor("3"), { "3": "102" });

    const bill = await prisma.fbBill.findFirst({ where: { resortId: fx.resortId } });
    expect(bill!.roomId).toBe(fx.rooms[1]!.id);
  });

  it("takes the bill anyway when the room cannot be matched", async () => {
    // a walk-in has no room, and losing the money because a label did not
    // match would be worse than a bill with no room on it
    await importer().importFb(manager, fx.resortId, billFor("Terrace"));

    const bill = await prisma.fbBill.findFirst({ where: { resortId: fx.resortId } });
    expect(bill).not.toBeNull();
    expect(bill!.roomId).toBeNull();
  });
});
