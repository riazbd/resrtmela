/**
 * An agency can see what it sold (2026-09-28).
 *
 * `GET /bookings` narrows an agent to their own agency's rows already — but
 * it takes a `resortId`, and that is not the question an agency asks. An
 * agency sells across several resorts, so "what have we sold" had no answer
 * anywhere: neither client had a screen for it, and the only list that
 * existed was one resort's at a time.
 *
 * `agencyList` is that question. What it must get right:
 *
 *  - the agency is the unit, not the person — an owner sees what their staff
 *    sold, which is the rule the guest list settled years of confusion with
 *  - one agency never sees another's, whatever resort they share
 *  - a resort's own staff cannot call it at all; it is not a back door into
 *    the bookings an agency is otherwise refused
 *  - every row says which resort it is at, because "102" is a room at three
 *    different hotels once they are on one list
 *  - the money is worked out with the tax rules of the resort each row
 *    belongs to, not of whichever resort happened to be first
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
const db = () => prisma as unknown as PrismaClient;
const bookings = () => makeBookingsService(asPrismaService);

let fx: Fixture;
let agent: JwtClaims;
let manager: JwtClaims;

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  manager = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * One stay, sold by whoever is given as the caller.
 *
 * The phone number varies with the name, and that is not decoration: a
 * booking made with a number the resort already knows attaches to *that*
 * guest, so two bookings sharing a number are two bookings on one guest —
 * which made the search spec find two rows for one name and look like a bug
 * in the search.
 */
let guestSeq = 0;
const sell = (claims: JwtClaims, checkIn: string, checkOut: string, name = "Agency Guest") =>
  bookings().create(claims, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    guest: { fullName: name, phone: `88017110003${String(++guestSeq).padStart(2, "0")}` },
  });

describe("an agency's own list", () => {
  it("has the bookings it made, with the resort named on each", async () => {
    const made = await sell(agent, "2026-11-01", "2026-11-03");

    const page = await bookings().agencyList(agent, {});
    const row = page.rows.find((r) => r.id === made.id);

    expect(page.total).toBe(1);
    expect(row).toBeTruthy();
    expect(row!.resort).toEqual({ id: fx.resortId, name: "Test Resort" });
    expect(row!.agent).toBe("Test Agent");
  });

  it("counts what the agency's staff sold, not only the owner's own", async () => {
    const staff = await db().user.create({
      data: {
        name: "Agency Clerk",
        phone: `8803${Math.floor(Math.random() * 1e8)}`,
        email: `clerk-${Math.floor(Math.random() * 1e8)}@example.com`,
        role: "AGENT",
        status: "active",
        accountId: fx.agencyId,
        parentAgentId: fx.agentId,
      },
    });
    await db().userResort.create({ data: { userId: staff.id, resortId: fx.resortId } });
    const theirs = { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] };

    await sell(agent, "2026-11-01", "2026-11-03");
    await sell(theirs, "2026-11-05", "2026-11-07", "The Clerk's Guest");

    // both directions: the owner sees the clerk's, and the clerk sees the
    // owner's. An agency whose staff each hold a private list does not have
    // a customer list, it has several.
    expect((await bookings().agencyList(agent, {})).total).toBe(2);
    expect((await bookings().agencyList(theirs, {})).total).toBe(2);
  });

  it("narrows to one resort when asked, and to none when asked for another", async () => {
    await sell(agent, "2026-11-01", "2026-11-03");

    expect((await bookings().agencyList(agent, { resortId: fx.resortId })).total).toBe(1);
    expect((await bookings().agencyList(agent, { resortId: fx.resortId + 9999 })).total).toBe(0);
  });

  it("finds a booking by the guest's name, not by the page it is on", async () => {
    await sell(agent, "2026-11-01", "2026-11-03", "Findable Person");
    await sell(agent, "2026-11-05", "2026-11-07", "Somebody Else");

    const found = await bookings().agencyList(agent, { search: "Findable" });
    expect(found.total).toBe(1);
    expect(found.rows[0]!.guest.fullName).toBe("Findable Person");
  });
});

describe("what the list must never show", () => {
  it("another agency's bookings, even at a resort they both sell", async () => {
    await sell(agent, "2026-11-01", "2026-11-03");

    const other = await db().user.create({
      data: {
        name: "Other Agent",
        phone: `8804${Math.floor(Math.random() * 1e8)}`,
        email: `other-${Math.floor(Math.random() * 1e8)}@example.com`,
        role: "AGENT",
        status: "active",
        account: {
          create: {
            name: "Other Agency",
            slug: `other-agency-${Math.floor(Math.random() * 1e8)}`,
            kind: "AGENCY",
            status: "active",
          },
        },
      },
    });
    await db().userResort.create({ data: { userId: other.id, resortId: fx.resortId } });

    const theirs = await bookings().agencyList(
      { userId: other.id, role: ROLE.AGENT, resortIds: [fx.resortId] },
      {},
    );
    expect(theirs.total).toBe(0);
  });

  it("anything at all to the resort's own staff", async () => {
    await sell(agent, "2026-11-01", "2026-11-03");
    await expect(bookings().agencyList(manager, {})).rejects.toMatchObject({ status: 403 });
  });

  it("a booking the agency's own booking was deleted from under it", async () => {
    const made = await sell(agent, "2026-11-01", "2026-11-03");
    await db().booking.update({ where: { id: made.id }, data: { deletedAt: new Date() } });

    expect((await bookings().agencyList(agent, {})).total).toBe(0);
  });

  it("a stay the resort sold itself", async () => {
    await seedBooking(db(), fx, { checkIn: "2026-12-01", checkOut: "2026-12-02" });
    expect((await bookings().agencyList(agent, {})).total).toBe(0);
  });
});
