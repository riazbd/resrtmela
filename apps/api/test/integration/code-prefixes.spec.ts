/**
 * Document numbering belongs to the tenant, not to the binary.
 *
 * Invoice prefixes were already per-resort, but booking codes were pinned to
 * "BK" and restaurant bills to "RES" in code — so the system disagreed with
 * itself, and a resort that numbers its bookings differently could not.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { BookingsService } from "../../src/bookings/bookings.service";
import { FbService } from "../../src/fb/fb.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let claims: JwtClaims;
let bookings: BookingsService;

const fbService = () =>
  new FbService(asPrismaService, new AuditService(asPrismaService), new PermissionsService(asPrismaService));

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  claims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  bookings = makeBookingsService(asPrismaService);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const stay = (checkIn = "2026-08-15", checkOut = "2026-08-17") => ({
  resortId: fx.resortId,
  roomIds: [fx.rooms[0]!.id],
  checkIn,
  checkOut,
  adults: 2,
  children: 0,
  guest: { fullName: "Test Guest", phone: "8801711111111" },
});

describe("booking codes", () => {
  it("use BK when the resort has expressed no preference", async () => {
    const booking = await bookings.create(claims, stay() as never);
    expect(booking.code).toMatch(/^BK-\d{5}$/);
  });

  it("use the resort's own prefix when it has one", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { bookingPrefix: "SKY" } });

    const booking = await bookings.create(claims, stay() as never);
    expect(booking.code).toMatch(/^SKY-\d{5}$/);
  });

  it("keep one sequence when the prefix changes, so no number is reused", async () => {
    const first = await bookings.create(claims, stay() as never);
    await prisma.resort.update({ where: { id: fx.resortId }, data: { bookingPrefix: "SKY" } });
    const second = await bookings.create(claims, stay("2026-09-01", "2026-09-03") as never);

    expect(Number(second.code.split("-")[1])).toBe(Number(first.code.split("-")[1]) + 1);
  });
});

describe("restaurant bill codes", () => {
  it("use RES by default", async () => {
    const bill = await fbService().create(claims, fx.resortId, {
      date: "2026-08-15",
      items: [{ name: "Lunch", qty: 1, unitPrice: 450 }],
    });
    expect(bill.code).toMatch(/^RES-\d{5}$/);
  });

  it("use the resort's own prefix when it has one", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { fbPrefix: "KIT" } });

    const bill = await fbService().create(claims, fx.resortId, {
      date: "2026-08-15",
      items: [{ name: "Lunch", qty: 1, unitPrice: 450 }],
    });
    expect(bill.code).toMatch(/^KIT-\d{5}$/);
  });
});

describe("two resorts numbering differently", () => {
  it("do not collide", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await prisma.resort.update({ where: { id: other.resortId }, data: { bookingPrefix: "HILL" } });
    const otherClaims: JwtClaims = { userId: other.managerId, role: ROLE.MANAGER, resortIds: [other.resortId] };

    const mine = await bookings.create(claims, stay() as never);
    const theirs = await bookings.create(otherClaims, {
      ...stay(),
      resortId: other.resortId,
      roomIds: [other.rooms[0]!.id],
    } as never);

    expect(mine.code).toMatch(/^BK-/);
    expect(theirs.code).toMatch(/^HILL-/);
  });
});
