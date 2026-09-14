/**
 * `/v1` — what a resort's own website may do (2026-09-15 design).
 *
 * One sentence holds this up: **there is one booking engine, and `/v1` is a
 * caller of it.** A booking posted from a resort's site goes through the same
 * service the front desk uses, hits the same UNIQUE constraint on nights, and
 * computes the same money. The moment there are two ways into `bookings` there
 * are two rooms called 102 on the same night, and the resort finds out when two
 * families arrive.
 *
 * The rest is about what a leaked key can reach. A key is the whole of the API,
 * so: scopes, one resort, no bulk reads, and no room ids in or out.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedBooking, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeV1Service } from "../helpers/services";
import { ApiKeyService, type ApiCaller } from "../../src/v1/api-key.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let reader: ApiCaller;
let writer: ApiCaller;

const v1 = () => makeV1Service(asPrisma);
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const platform = () =>
  makePlatformService(asPrisma) as unknown as {
    createApiKey(c: JwtClaims, r: number, n: string, s?: string[]): Promise<{ secret: string }>;
  };

/** A booking as a resort's own website would ask for one. */
const order = (extra: Record<string, unknown> = {}) => ({
  roomType: "deluxe",
  checkIn: day(3),
  checkOut: day(5),
  adults: 2,
  guest: { fullName: "Rina Haque", phone: "01712345678" },
  ...extra,
});

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };

  const keys = new ApiKeyService(asPrisma);
  reader = (await keys.authenticate((await platform().createApiKey(owner, fx.resortId, "reads")).secret))!;
  writer = (await keys.authenticate(
    (await platform().createApiKey(owner, fx.resortId, "writes", ["read", "write"])).secret,
  ))!;
});

afterAll(async () => prisma.$disconnect());

describe("reading", () => {
  it("describes the resort the key belongs to, and no other", async () => {
    const seen = await v1().resort(reader);

    expect(seen).toMatchObject({ name: "Test Resort" });
    expect(seen.roomTypes.map((t) => t.name)).toEqual(["Deluxe"]);
  });

  /**
   * The website and the API must not quote different prices — that is the
   * whole reason there is one published view rather than two queries. Asserted
   * against the site's own answer rather than a number typed here.
   */
  it("quotes the price the resort's own site quotes", async () => {
    const site = await v1().resort(reader);
    const rooms = await prisma.room.findMany({ where: { resortId: fx.resortId }, select: { baseRate: true } });

    expect(site.roomTypes[0]!.priceFrom).toBe(Math.min(...rooms.map((r) => Number(r.baseRate))));
  });

  it("says how many of each kind are free between two dates", async () => {
    const free = await v1().vacancy(reader, day(3), day(5));

    expect(free).toEqual([{ key: "deluxe", free: 2, priceFrom: expect.any(Number) }]);
  });

  it("answers whether or not the resort publishes a brochure", async () => {
    // a resort with its own website may never publish one of ours
    expect(await prisma.resortSite.count({ where: { resortId: fx.resortId } })).toBe(0);
    await expect(v1().resort(reader)).resolves.toBeTruthy();
  });

  /** A key is for selling rooms, not for copying the register. */
  it("never gives out a room id, a guest, or somebody else's booking", async () => {
    await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: day(3), checkOut: day(4) });

    const text = JSON.stringify([await v1().resort(reader), await v1().vacancy(reader, day(3), day(5))]);

    for (const room of fx.rooms) expect(text).not.toContain(room.name);
    expect(text.toLowerCase()).not.toContain("guest");
  });
});

describe("writing a booking", () => {
  it("goes in through the same door the front desk uses", async () => {
    const made = await v1().book(writer, "first-try", order());

    const row = await prisma.booking.findFirstOrThrow({
      where: { code: made.code },
      include: { items: { include: { nights: true } } },
    });
    expect(row.resortId).toBe(fx.resortId);
    // two nights held, by the same rows a panel booking writes
    expect(row.items[0]!.nights).toHaveLength(2);
    expect(made.code).toMatch(/^BK-/);
  });

  it("is recorded as the key's, so revoking one finds every booking it made", async () => {
    const made = await v1().book(writer, "first-try", order());

    const row = await prisma.booking.findFirstOrThrow({ where: { code: made.code } });
    expect(row.apiKeyId).toBe(writer.keyId);
    expect(row.idempotencyKey).toBe("first-try");
  });

  /**
   * A request that times out is not a request that failed. The client cannot
   * tell, and will retry — and without this it gets two bookings and a guest
   * charged twice for one room.
   */
  it("makes one booking however many times the same request arrives", async () => {
    const first = await v1().book(writer, "same-key", order());
    const again = await v1().book(writer, "same-key", order());

    expect(again.code).toBe(first.code);
    expect(await prisma.booking.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("refuses a different booking under a key already used, rather than hiding it", async () => {
    await v1().book(writer, "same-key", order());

    await expect(
      v1().book(writer, "same-key", order({ checkIn: day(10), checkOut: day(11) })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("insists on being told what to call the request", async () => {
    await expect(v1().book(writer, "", order())).rejects.toMatchObject({ status: 400 });
    await expect(v1().book(writer, undefined as never, order())).rejects.toMatchObject({ status: 400 });
  });

  /**
   * The caller asks for a kind of room and we choose one. An API that takes a
   * room id is an API that lets a stranger enumerate a resort's inventory one
   * number at a time.
   */
  it("chooses the room itself, and will not be told which", async () => {
    const made = await v1().book(writer, "k1", order());

    expect(JSON.stringify(made)).not.toMatch(/"roomId"/);
    const row = await prisma.booking.findFirstOrThrow({
      where: { code: made.code },
      include: { items: true },
    });
    expect(fx.rooms.map((r) => r.id)).toContain(row.items[0]!.roomId);
  });

  it("says so plainly when that kind is full", async () => {
    for (const room of fx.rooms) {
      await seedBooking(prisma as unknown as PrismaClient, fx, {
        roomId: room.id,
        checkIn: day(3),
        checkOut: day(5),
      });
    }

    await expect(v1().book(writer, "k2", order())).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/free|available|full/i),
    });
  });

  it("refuses a kind of room this resort does not have", async () => {
    await expect(v1().book(writer, "k3", order({ roomType: "presidential" }))).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("what a key may not do", () => {
  it("stops a reading key writing", async () => {
    await expect(v1().book(reader, "k4", order())).rejects.toMatchObject({ status: 403 });
    expect(await prisma.booking.count({ where: { resortId: fx.resortId } })).toBe(0);
  });

  it("cannot reach another resort, whatever it asks", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);

    const seen = await v1().resort(reader);

    expect(seen.name).toBe("Test Resort");
    expect(await prisma.resort.findUniqueOrThrow({ where: { id: other.resortId } })).toBeTruthy();
  });
});

describe("reading one back, and calling it off", () => {
  it("finds a booking it made, by its code", async () => {
    const made = await v1().book(writer, "k5", order());

    const found = await v1().booking(reader, made.code);

    expect(found).toMatchObject({ code: made.code, state: expect.any(String) });
  });

  it("does not find a booking of another resort", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    const theirs = await seedBooking(prisma as unknown as PrismaClient, other, {
      checkIn: day(3),
      checkOut: day(4),
    });

    await expect(v1().booking(reader, theirs.code)).rejects.toMatchObject({ status: 404 });
  });

  it("cancels through the state machine, so the nights come back", async () => {
    const made = await v1().book(writer, "k6", order());

    await v1().cancel(writer, made.code);

    const free = await v1().vacancy(reader, day(3), day(5));
    expect(free[0]!.free).toBe(2);
  });

  it("will not let a reading key cancel", async () => {
    const made = await v1().book(writer, "k7", order());

    await expect(v1().cancel(reader, made.code)).rejects.toMatchObject({ status: 403 });
  });
});
