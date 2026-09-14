/**
 * The published view — the one surface a stranger can read (2026-09-14 design).
 *
 * Everything public about a resort comes through here: the site renders it, and
 * `/v1` will wrap it. So this file is two tests wearing one coat.
 *
 * **It must agree with the panel.** A price on the front page that is not the
 * price in the calendar is the support call nobody can diagnose, so the price
 * is asserted against the resort's own rooms and its own discount rules rather
 * than against a number typed into this file.
 *
 * **It must give nothing else away.** A public endpoint is reachable by anyone
 * who can type a URL. Room ids, room names, guest names, bookings, and the
 * existence of a resort that has not published are each a separate way to leak,
 * and each is pinned below. A count of free rooms is inventory; which room, and
 * why it came free, is somebody's private business.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, scheduleOf, seedBooking, seedResort, type Fixture } from "../helpers/db";
import { makePublishedSiteService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let slug: string;

const site = () => makePublishedSiteService(asPrisma);

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** One live booking holding one room for one night — the fixture's own shape. */
const hold = (roomId: number, night: string) =>
  seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId,
    checkIn: night,
    checkOut: new Date(new Date(`${night}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10),
  });

/** What the resort's rooms actually cost — the fixture carries names, not rates. */
const cheapestRate = async () => {
  const rooms = await prisma.room.findMany({ where: { resortId: fx.resortId }, select: { baseRate: true } });
  return Math.min(...rooms.map((r) => Number(r.baseRate)));
};

/** The resort publishes, which is the state everything below assumes. */
async function publish(extra: Record<string, unknown> = {}) {
  await prisma.resortSite.upsert({
    where: { resortId: fx.resortId },
    create: { resortId: fx.resortId, published: true, ...extra },
    update: { published: true, ...extra },
  });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  slug = (await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what a published resort says about itself", () => {
  it("gives its name, where it is, and how to reach it", async () => {
    await publish({ headline: "Tea gardens, ten minutes from town", intro: "A quiet place." });

    const page = await site().resort(slug);

    expect(page).toMatchObject({
      slug,
      name: "Test Resort",
      location: "Cox's Bazar",
      headline: "Tea gardens, ten minutes from town",
      intro: "A quiet place.",
      currency: "BDT",
    });
  });

  it("lists the kinds of room, each with a handle that is not a database id", async () => {
    await publish();

    const page = await site().resort(slug);

    expect(page!.roomTypes).toHaveLength(1);
    expect(page!.roomTypes[0]).toMatchObject({ key: "deluxe", name: "Deluxe" });
    expect(JSON.stringify(page)).not.toContain(String(fx.rooms[0]!.id));
  });

  /**
   * The number on the page is the number in the calendar. Asserted against the
   * resort's own rooms rather than a literal, so a change to how a room is
   * priced fails here rather than going quietly out to the public.
   */
  it("quotes the cheapest room of each kind, at the price the panel quotes", async () => {
    await publish();
    const cheapest = await cheapestRate();

    const page = await site().resort(slug);

    expect(page!.roomTypes[0]!.priceFrom).toBe(cheapest);
  });

  it("takes the resort's own discount off that price, the way a booking would", async () => {
    await publish();
    const cheapest = await cheapestRate();
    await prisma.discountOffer.create({
      data: { resortId: fx.resortId, name: "Monsoon", scope: "RESORT", kind: "PERCENT", value: 10, active: true },
    });

    const page = await site().resort(slug);

    expect(page!.roomTypes[0]!.priceFrom).toBe(cheapest - Math.round(cheapest * 0.1));
  });

  it("says nothing about a room type the resort retired", async () => {
    await publish();
    await prisma.roomType.create({
      data: { resortId: fx.resortId, name: "Old Cabin", maxAdults: 2, active: false },
    });

    const page = await site().resort(slug);

    expect(page!.roomTypes.map((t) => t.name)).toEqual(["Deluxe"]);
  });

  it("offers a kind with no sellable room at all as a price nobody has to guess", async () => {
    await publish();
    await prisma.roomType.create({
      data: { resortId: fx.resortId, name: "Tent", maxAdults: 2, active: true },
    });

    const page = await site().resort(slug);

    expect(page!.roomTypes.find((t) => t.name === "Tent")!.priceFrom).toBeNull();
  });
});

describe("what a published resort never says", () => {
  it("names no room, no guest and no booking", async () => {
    await publish();
    await prisma.booking.findMany({ where: { resortId: fx.resortId } });

    const text = JSON.stringify(await site().resort(slug));

    for (const room of fx.rooms) expect(text).not.toContain(room.name);
    expect(text.toLowerCase()).not.toContain("booking");
    expect(text.toLowerCase()).not.toContain("guest");
  });
});

describe("who is published at all", () => {
  it("is nobody, until the owner publishes", async () => {
    await prisma.resortSite.create({ data: { resortId: fx.resortId, published: false } });

    expect(await site().resort(slug)).toBeNull();
  });

  it("is nobody, when the owner never opened the editor", async () => {
    expect(await site().resort(slug)).toBeNull();
  });

  /**
   * A suspended resort's site goes dark. It is not a 404 that reads like the
   * business closed — the caller is told the resort is not available — but
   * nothing of its inventory or its prices is served.
   */
  it("is not a suspended resort, however published it was yesterday", async () => {
    await publish();
    await prisma.resort.update({ where: { id: fx.resortId }, data: { status: "suspended" } });

    expect(await site().resort(slug)).toBeNull();
  });

  /**
   * The feature and its gate ship together. A plan that does not include
   * `website` does not serve one, and a resort that loses the feature stops
   * serving without anybody having to remember to unpublish it.
   */
  it("is not a resort whose plan does not include a website", async () => {
    await publish();
    expect(await site().resort(slug)).not.toBeNull();

    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId,
        plan: "STARTER",
        status: "ACTIVE",
        fee: 2500 as never,
        scheduleId: await scheduleOf(prisma as unknown as PrismaClient, "STARTER"),
        startedAt: new Date(),
        renewsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    expect(await site().resort(slug)).toBeNull();
  });

  it("does not exist at an address nobody has", async () => {
    await publish();
    expect(await site().resort("no-such-resort")).toBeNull();
  });
});

describe("how many rooms are free, to a stranger", () => {
  it("counts the rooms of each kind that are free for the whole stay", async () => {
    await publish();

    const free = await site().vacancy(slug, day(1), day(3));

    expect(free).toEqual([{ key: "deluxe", free: 2, priceFrom: await cheapestRate() }]);
  });

  it("stops counting a room that is booked for even one night of the stay", async () => {
    await publish();
    await hold(fx.rooms[0]!.id, day(2));

    const free = await site().vacancy(slug, day(1), day(3));

    expect(free[0]!.free).toBe(1);
  });

  it("counts nothing when the whole resort is taken", async () => {
    await publish();
    for (const room of fx.rooms) await hold(room.id, day(1));

    const free = await site().vacancy(slug, day(1), day(2));

    expect(free[0]!.free).toBe(0);
  });

  it("quotes the cheapest of the rooms that are actually free, not of all of them", async () => {
    await publish();
    const [cheap, dear] = fx.rooms;
    await prisma.room.update({ where: { id: dear!.id }, data: { baseRate: 9000 } });
    await hold(cheap!.id, day(1));

    const free = await site().vacancy(slug, day(1), day(2));

    expect(free[0]).toMatchObject({ free: 1, priceFrom: 9000 });
  });

  it("refuses a range that runs backwards, and one that runs for years", async () => {
    await publish();
    await expect(site().vacancy(slug, day(3), day(1))).rejects.toMatchObject({ status: 400 });
    await expect(site().vacancy(slug, day(1), day(400))).rejects.toMatchObject({ status: 400 });
  });

  it("tells an unpublished resort's vacancy to nobody", async () => {
    await expect(site().vacancy(slug, day(1), day(2))).rejects.toMatchObject({ status: 404 });
  });
});
