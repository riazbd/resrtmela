/**
 * What an agent may see of a resort's books: nothing.
 *
 * An agency is approved to *sell* a resort, and approval writes a `user_resorts`
 * row. Login turns those rows into the token's `resortIds`, and
 * `requireResortAccess` asked only one question of that list — "is this resort
 * in it?" — which an approved agent passes. Twenty-seven service methods had
 * that check and nothing else, so an agent's own token could read the resort's
 * calendar with every guest's name on it, the guest directory with phone and
 * NID, the day sheet with outstanding balances, the revenue reports, the dues
 * list, the expenses, the restaurant covers, and the API-key list.
 *
 * None of it was reachable from the console — agents have no `bookings.view`,
 * so those links are hidden — but the console is not the security boundary. A
 * token and curl were enough.
 *
 * The fix is a changed default rather than twenty-seven patches: being linked
 * to a resort now means an agent may sell it, and the paths where that is
 * genuinely enough say so by name. This file is the pair of that rule — the
 * doors that must stay shut, and, just as important, the ones that must stay
 * open, because an agency that cannot search for a room cannot work.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import {
  makeBookingsService,
  makeReportsService,
  makePaymentsService,
  makeExpensesService,
  makeFbService,
  makePlatformService,
  makeTenancyService,
  makeGuestsService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agent: JwtClaims;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  // exactly the claims a real login hands an approved agent
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A stay the resort sold itself. Nothing to do with any agency. */
const houseBooking = () =>
  seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
  });

const forbidden = async (p: Promise<unknown>) => {
  await expect(p).rejects.toMatchObject({ status: 403 });
};

describe("an approved agent is refused", () => {
  it("the resort calendar", async () => {
    await houseBooking();
    await forbidden(
      makeBookingsService(asPrismaService).calendar(agent, fx.resortId, "2026-09-25", "2026-10-10"),
    );
  });

  it("the resort's guest directory", async () => {
    await forbidden(makeBookingsService(asPrismaService).guests(agent, fx.resortId));
  });

  it("the day sheet", async () => {
    await forbidden(makeBookingsService(asPrismaService).daySheet(agent, fx.resortId, "2026-10-02"));
  });

  it("today's arrivals", async () => {
    await forbidden(makeBookingsService(asPrismaService).today(agent, fx.resortId));
  });

  it("the revenue report", async () => {
    await forbidden(makeReportsService(asPrismaService).metrics(agent, fx.resortId));
  });

  it("the outstanding dues list", async () => {
    await forbidden(makePaymentsService(asPrismaService).dues(agent, fx.resortId));
  });

  it("the resort's expenses", async () => {
    await forbidden(makeExpensesService(asPrismaService).list(agent, fx.resortId));
  });

  it("the restaurant's in-house guests", async () => {
    await forbidden(makeFbService(asPrismaService).inHouse(agent, fx.resortId));
  });

  it("the resort's API keys", async () => {
    await forbidden(makePlatformService(asPrismaService).listApiKeys(agent, fx.resortId));
  });

  it("a booking that is not the agency's", async () => {
    const b = await houseBooking();
    await forbidden(makeBookingsService(asPrismaService).detail(agent, b.id));
  });

  it("the invoice of a booking that is not the agency's", async () => {
    const b = await houseBooking();
    await prisma.booking.update({
      where: { id: b.id },
      data: { invoiceNo: "INV-00001", invoiceAt: new Date() },
    });
    await forbidden(makeBookingsService(asPrismaService).invoicePayload(agent, b.id));
  });
});

describe("but the work still works", () => {
  it("the agency can still search for a free room", async () => {
    const offers = await makeGuestsService(asPrismaService).rooms(agent, {
      from: "2026-11-01",
      to: "2026-11-03",
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]!.rooms.length).toBeGreaterThan(0);
  });

  it("the agency can still create a booking and read it back", async () => {
    const created = await makeBookingsService(asPrismaService).create(agent, {
      resortId: fx.resortId,
      roomIds: [fx.rooms[0]!.id],
      checkIn: "2026-11-01",
      checkOut: "2026-11-03",
      adults: 2,
      children: 0,
      guest: { fullName: "Agency Client", phone: "8801799999999" },
    } as never);

    const detail = await makeBookingsService(asPrismaService).detail(agent, created.id);
    expect(detail.code).toBe(created.code);

    const list = await makeBookingsService(asPrismaService).list(agent, {
      resortId: fx.resortId,
    } as never);
    expect(list.rows.map((r: { id: number }) => r.id)).toContain(created.id);
  });

  it("the agency can still open the resort it sells", async () => {
    const resort = await makeTenancyService(asPrismaService).detail(agent, fx.resortId);
    expect(resort.id).toBe(fx.resortId);
  });

  it("the resort's own manager still sees everything", async () => {
    await houseBooking();
    const cal = await makeBookingsService(asPrismaService).calendar(
      manager,
      fx.resortId,
      "2026-09-25",
      "2026-10-10",
    );
    expect(cal.bookings).toHaveLength(1);
    expect(cal.bookings[0]!.guestName).toBe("Test Guest");
  });
});
