/**
 * An agency's own website is told about its own bookings (2026-09-17).
 *
 * The same queue, signature and retry rules as a resort's webhooks. What
 * differs is whose news it is: an agency hears about the bookings it made —
 * created, confirmed, checked in, cancelled, its cancellation request answered
 * — and never about anybody else's at the same resort.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBookingsService } from "../helpers/services";
import { AgencyWebhooksService } from "../../src/v1/agency-webhooks.service";
import { WebhookService } from "../../src/v1/webhook.service";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { AuditService } from "../../src/common/audit.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { todayIn } from "../../src/common/dates";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let desk: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);
const hooks = () =>
  new AgencyWebhooksService(asPrisma, new WebhookService(asPrisma, async () => ({ status: 200 })), new PermissionsService(asPrisma), new PlanLimitsService(asPrisma), new AuditService(asPrisma));
const day = (n: number) => new Date(todayIn("Asia/Dhaka").getTime() + n * 86_400_000).toISOString().slice(0, 10);

const book = (claims: JwtClaims, name: string) =>
  bookings().create(claims, {
    resortId: fx.resortId, roomIds: [fx.rooms[0]!.id], checkIn: day(3), checkOut: day(4), adults: 2, children: 0,
    guest: { fullName: name, phone: `017110${Math.floor(Math.random() * 1e5)}` },
  });

const eventsFor = async (endpointId: number) =>
  (await prisma.webhookDelivery.findMany({ where: { endpointId }, orderBy: { id: "asc" } })).map((d) => ({
    event: d.event,
    data: (d.payload as { data: Record<string, unknown> }).data,
  }));

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

describe("an agency's endpoint", () => {
  it("is added once with its secret shown, listed without it, and removed", async () => {
    const made = await hooks().add(agency, "https://agency.example/hooks");
    expect(made.secret).toMatch(/^[a-f0-9]{48}$/);

    const list = await hooks().list(agency);
    expect(list).toEqual([expect.objectContaining({ url: "https://agency.example/hooks" })]);
    expect(JSON.stringify(list)).not.toContain(made.secret);

    await hooks().remove(agency, made.id);
    expect(await hooks().list(agency)).toEqual([]);
  });

  it("must be https", async () => {
    await expect(hooks().add(agency, "http://agency.example/hooks")).rejects.toThrow(/https/);
  });

  it("needs the plan to include the API", async () => {
    await prisma.platformPlan.create({
      data: { name: "AG_B", label: "Agency Basic", maxRooms: 0, maxResorts: 0, maxStaff: 3, trialDays: 0, active: true, sortOrder: 1, audience: "AGENCY", features: [] as never },
    });
    await prisma.subscription.create({ data: { accountId: fx.agencyId, plan: "AG_B", status: "ACTIVE", fee: 0 as never } });

    await expect(hooks().add(agency, "https://agency.example/hooks")).rejects.toThrow(/Agency Basic/);
  });

  it("belongs to the agency and not to a resort", async () => {
    const made = await hooks().add(agency, "https://agency.example/hooks");
    const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.accountId).toBe(fx.agencyId);
    expect(row.resortId).toBeNull();
  });
});

describe("what it hears", () => {
  let endpointId: number;
  beforeEach(async () => {
    endpointId = (await hooks().add(agency, "https://agency.example/hooks")).id;
  });

  it("its own booking, made and then confirmed by the resort, with the resort named", async () => {
    const b = await book(agency, "Agency Guest");
    await bookings().transition(desk, b.id, "CONFIRMED");

    const events = await eventsFor(endpointId);
    expect(events.map((e) => e.event)).toEqual(["booking.created", "booking.changed"]);
    expect(events[0]!.data).toMatchObject({ code: b.code, resort: expect.any(String) });
    expect(events[1]!.data).toMatchObject({ code: b.code, state: "CONFIRMED" });
  });

  it("nothing about a booking the resort's own desk made", async () => {
    await book(desk, "Walk In");

    expect(await eventsFor(endpointId)).toEqual([]);
  });

  it("the answer to its cancellation request, either way", async () => {
    const kept = await book(agency, "Keeps It");
    await bookings().requestCancel(agency, kept.id, "maybe");
    await bookings().decideCancel(desk, kept.id, false);

    const gone = await bookings().create(agency, {
      resortId: fx.resortId, roomIds: [fx.rooms[1]!.id], checkIn: day(3), checkOut: day(4), adults: 2, children: 0,
      guest: { fullName: "Changes Mind", phone: "01711099999" },
    });
    await bookings().requestCancel(agency, gone.id, "sorry");
    await bookings().decideCancel(desk, gone.id, true);

    const answered = (await eventsFor(endpointId)).filter((e) => e.event !== "booking.created");
    expect(answered).toEqual([
      { event: "booking.changed", data: expect.objectContaining({ code: kept.code, cancelRequest: "REJECTED" }) },
      { event: "booking.cancelled", data: expect.objectContaining({ code: gone.code, state: "CANCELLED" }) },
    ]);
  });

  it("and the resort hears an approved cancellation too, which it used not to", async () => {
    const resortEndpoint = await prisma.webhookEndpoint.create({
      data: { resortId: fx.resortId, url: "https://resort.example/hooks", secret: "s" },
    });
    const b = await book(agency, "Changes Mind");
    await bookings().requestCancel(agency, b.id, "sorry");
    await bookings().decideCancel(desk, b.id, true);

    expect((await eventsFor(resortEndpoint.id)).map((e) => e.event)).toContain("booking.cancelled");
  });
});

describe("what it can see and retry", () => {
  it("lists its own deliveries and retries one", async () => {
    await hooks().add(agency, "https://agency.example/hooks");
    await book(agency, "Agency Guest");

    const list = await hooks().deliveries(agency);
    expect(list).toHaveLength(1);
    await expect(hooks().retry(agency, BigInt(list[0]!.id))).resolves.toEqual({ queued: true });
  });

  it("cannot retry a resort's delivery", async () => {
    const resortEndpoint = await prisma.webhookEndpoint.create({
      data: { resortId: fx.resortId, url: "https://resort.example/hooks", secret: "s" },
    });
    await book(desk, "Walk In");
    const theirs = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: resortEndpoint.id } });

    await expect(hooks().retry(agency, theirs.id)).rejects.toThrow(/No such delivery/);
  });
});
