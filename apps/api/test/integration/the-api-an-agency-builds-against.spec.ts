/**
 * `/v1/agency` — what an agency's own website may do (2026-09-17 design, §3).
 *
 * An agency does not own rooms. It sells the resorts it is approved for and its
 * own tour packages, so its API reads those and books into them — **as the
 * agency**: a booking made through an agency key is an agent booking in every
 * respect, pending until the resort confirms, on the agency's commission, held
 * to the resort's window for agencies. One booking engine; this is a caller.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeAgencyApiService, makeAgencyKeysService, makePlatformService, makeV1Service } from "../helpers/services";
import { ApiKeyService, type ApiCaller } from "../../src/v1/api-key.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { todayIn } from "../../src/common/dates";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let reader: ApiCaller;
let writer: ApiCaller;
let slug: string;

const api = () => makeAgencyApiService(asPrisma);
const keys = () => makeAgencyKeysService(asPrisma);
const DAY = 86_400_000;
const day = (n: number) => new Date(todayIn("Asia/Dhaka").getTime() + n * DAY).toISOString().slice(0, 10);

const order = (extra: Record<string, unknown> = {}) => ({
  roomType: "deluxe",
  checkIn: day(3),
  checkOut: day(5),
  adults: 2,
  guest: { fullName: "Tania Akter", phone: "01712345000" },
  ...extra,
});

async function authenticated(secret: string): Promise<ApiCaller> {
  return (await new ApiKeyService(asPrisma).authenticate(secret))!;
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  slug = (await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug;
  reader = await authenticated((await keys().create(agency, "reads")).secret);
  writer = await authenticated((await keys().create(agency, "writes", ["read", "write"])).secret);
});

afterAll(async () => prisma.$disconnect());

describe("a key for an agency", () => {
  it("belongs to the agency's account, not to a resort", async () => {
    expect(reader.accountId).toBe(fx.agencyId);
    expect(reader.resortId).toBeNull();
  });

  it("is listed, without its secret, and can be revoked", async () => {
    const list = await keys().list(agency);
    expect(list).toHaveLength(2);
    expect(JSON.stringify(list)).not.toMatch(/rm_live_[a-z0-9]+_[a-f0-9]{32}/);

    await keys().revoke(agency, Number(list[0]!.id));
    expect((await keys().list(agency)).filter((k) => k.active)).toHaveLength(1);
  });

  it("needs the agency's plan to include the API", async () => {
    await prisma.platformPlan.create({
      data: { name: "AG_BASIC", label: "Agency Basic", maxRooms: 0, maxResorts: 0, maxStaff: 3, trialDays: 0, active: true, sortOrder: 1, audience: "AGENCY", features: [] as never },
    });
    await prisma.subscription.create({ data: { accountId: fx.agencyId, plan: "AG_BASIC", status: "ACTIVE", fee: 0 as never } });

    await expect(keys().create(agency, "another")).rejects.toThrow(/Agency Basic.*API/);
    // and a key minted while the plan had it stops opening anything
    await expect(api().agency(reader)).rejects.toThrow(/Agency Basic/);
  });

  it("is only the agency's to manage", async () => {
    const desk: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
    await expect(keys().create(desk, "not mine")).rejects.toThrow();
  });
});

describe("the two kinds of key do not open each other's door", () => {
  it("an agency key cannot read a resort's API", async () => {
    await expect(makeV1Service(asPrisma).resort(reader)).rejects.toThrow(/agency/i);
  });

  it("a resort key cannot read an agency's API", async () => {
    await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
    const owner: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
    const resortKey = await authenticated(
      (await (makePlatformService(asPrisma) as unknown as { createApiKey(c: JwtClaims, r: number, n: string): Promise<{ secret: string }> }).createApiKey(owner, fx.resortId, "site")).secret,
    );

    await expect(api().agency(resortKey)).rejects.toThrow(/resort/i);
  });
});

describe("reading", () => {
  it("names the agency, the resorts it sells and its tours", async () => {
    const pkg = await prisma.tourPackage.create({
      data: {
        agencyId: fx.agentId, name: "Sylhet tea trail", days: 3, nights: 2, pax: 2,
        items: { create: [{ label: "Hotel", qty: 2 as never, unitPrice: 4000 as never }, { label: "Car", qty: 1 as never, unitPrice: 3000 as never }] },
      },
    });
    await prisma.tourPackage.create({ data: { agencyId: fx.agentId, name: "Retired", active: false } });

    const out = await api().agency(reader);

    expect(out.agency.name).toBe("Test Agency");
    expect(out.resorts.map((r) => r.slug)).toEqual([slug]);
    expect(out.resorts[0]!.roomTypes.map((t) => t.key)).toEqual(["deluxe"]);
    expect(out.tours).toEqual([
      expect.objectContaining({ id: pkg.id, name: "Sylhet tea trail", days: 3, nights: 2, pax: 2, price: 11000 }),
    ]);
  });

  it("gives no price where the resort keeps its rates from agents", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: false } });
    expect((await api().agency(reader)).resorts[0]!.roomTypes[0]!.priceFrom).toBeNull();

    await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: true } });
    expect((await api().agency(reader)).resorts[0]!.roomTypes[0]!.priceFrom).toBe(5000);
  });

  it("says how far ahead each resort lets the agency book", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { agentBookingWindowDays: 30 } });

    expect((await api().agency(reader)).resorts[0]!.bookableUntil).toBe(day(30));
  });

  it("counts what is free at a resort it sells", async () => {
    const free = await api().vacancy(reader, slug, day(3), day(5));

    expect(free).toEqual([expect.objectContaining({ key: "deluxe", free: 2 })]);
  });

  it("refuses dates past the resort's window", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { agentBookingWindowDays: 30 } });

    await expect(api().vacancy(reader, slug, day(40), day(42))).rejects.toThrow(/30 days/);
  });

  it("knows no resort the agency does not sell", async () => {
    await expect(api().vacancy(reader, "somebody-elses", day(3), day(5))).rejects.toThrow(/No such resort/);
  });
});

describe("booking", () => {
  it("books as the agency: pending, on the agency, made by the key", async () => {
    const made = await api().book(writer, slug, "order-1", order());

    expect(made.state).toBe("PENDING");
    expect(made.roomType).toBe("Deluxe");
    const row = await prisma.booking.findFirstOrThrow({ where: { code: made.code, resortId: fx.resortId } });
    expect(row.agentUserId).toBe(fx.agentId);
    expect(row.source).toBe("AGENT");
    expect(row.apiKeyId).toBe(writer.keyId);
  });

  it("answers a retry with the same booking", async () => {
    const first = await api().book(writer, slug, "order-2", order());
    const again = await api().book(writer, slug, "order-2", order());

    expect(again.code).toBe(first.code);
    expect(await prisma.booking.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("does not collide with the resort's own site using the same key name", async () => {
    // the resort's own website already used this name for a booking of its own
    await prisma.booking.create({
      data: { code: "BK-99999", resortId: fx.resortId, guestId: fx.guestId, idempotencyKey: "shared-name", state: "CONFIRMED" },
    });

    const made = await api().book(writer, slug, "shared-name", order());

    expect(made.code).not.toBe("BK-99999");
  });

  it("needs the write scope and an idempotency key", async () => {
    await expect(api().book(reader, slug, "x", order())).rejects.toThrow(/only read/);
    await expect(api().book(writer, slug, "", order())).rejects.toThrow(/Idempotency-Key/);
  });

  it("is held to the resort's window", async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { agentBookingWindowDays: 30 } });

    await expect(api().book(writer, slug, "far", order({ checkIn: day(40), checkOut: day(42) }))).rejects.toThrow(/30 days/);
  });

  it("names the kinds when the room type is wrong", async () => {
    await expect(api().book(writer, slug, "bad", order({ roomType: "palace" }))).rejects.toThrow(/deluxe/);
  });

  it("reads back its own bookings and nobody else's", async () => {
    const made = await api().book(writer, slug, "mine", order());
    expect((await api().booking(reader, slug, made.code)).code).toBe(made.code);

    await prisma.booking.create({
      data: { code: "BK-77777", resortId: fx.resortId, guestId: fx.guestId, state: "CONFIRMED" },
    });
    await expect(api().booking(reader, slug, "BK-77777")).rejects.toThrow(/No such booking/);
  });

  it("asks the resort to cancel, since an agency cannot cancel on its own", async () => {
    const made = await api().book(writer, slug, "to-cancel", order());

    const after = await api().cancel(writer, slug, made.code, "guest changed plans");

    expect(after.cancelRequested).toBe(true);
    const row = await prisma.booking.findFirstOrThrow({ where: { code: made.code, resortId: fx.resortId } });
    expect(row.cancelState).toBe("REQUESTED");
  });
});
