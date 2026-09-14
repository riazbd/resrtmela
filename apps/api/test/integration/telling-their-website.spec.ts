/**
 * Webhooks (2026-09-15 design, §6).
 *
 * A resort's own website has to know when a booking changes in the panel — a
 * walk-in took the last room, the front desk cancelled something. That is
 * outbound HTTP with retries, and outbound HTTP with retries is a queue whether
 * or not anybody calls it one.
 *
 * Two rules shape everything here.
 *
 * **A booking is never slower because somebody's website is down.** Enqueueing
 * is a row; delivering is the sweep's job. A resort whose site has gone away
 * must not find their front desk hanging on Check in.
 *
 * **Giving up is a state, not a silence.** There are stuck jobs on this
 * platform today that nobody was told about. An endpoint failing for a day is a
 * resort losing bookings, and a row that says so is the least this can do.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { signWebhook, webhookSignatureMatches } from "../../src/v1/webhook-signature";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { WebhookService, type Poster } from "../../src/v1/webhook.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let endpointId: number;
let secret: string;

/** Every call the world received, and what we answered with. */
let sent: { url: string; body: string; signature: string | undefined }[];
let answer: { status: number } | Error;

const poster: Poster = async (url, body, headers) => {
  sent.push({ url, body, signature: headers["x-resort-signature"] });
  if (answer instanceof Error) throw answer;
  return answer;
};

const hooks = () => new WebhookService(asPrisma, poster);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  sent = [];
  answer = { status: 200 };
  secret = "a-shared-secret";
  const row = await prisma.webhookEndpoint.create({
    data: { resortId: fx.resortId, url: "https://skyecoresort.example/hooks", secret },
  });
  endpointId = row.id;
});

afterAll(async () => prisma.$disconnect());

describe("something happened", () => {
  it("is written down, not sent, at the moment it happens", async () => {
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-00300" });

    expect(sent).toHaveLength(0);
    const queued = await prisma.webhookDelivery.findMany({ where: { endpointId } });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ event: "booking.created", attempts: 0, deliveredAt: null });
  });

  it("goes to every endpoint the resort has, and to no other resort's", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    await prisma.webhookEndpoint.create({
      data: { resortId: elsewhere.resortId, url: "https://somebody-else.example/hooks", secret: "s" },
    });
    await prisma.webhookEndpoint.create({
      data: { resortId: fx.resortId, url: "https://skyecoresort.example/other", secret: "s2" },
    });

    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    const rows = await prisma.webhookDelivery.findMany({ include: { endpoint: true } });
    expect(rows.map((r) => r.endpoint.url).sort()).toEqual([
      "https://skyecoresort.example/hooks",
      "https://skyecoresort.example/other",
    ]);
  });

  it("is not queued for an endpoint the resort switched off", async () => {
    await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { active: false } });

    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("costs nothing at a resort nobody is listening to", async () => {
    await prisma.webhookEndpoint.deleteMany({});

    await expect(hooks().emit(fx.resortId, "booking.created", { code: "BK-1" })).resolves.toBeUndefined();
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });
});

describe("delivering it", () => {
  it("posts the payload, signed, and marks it delivered", async () => {
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-00300" });

    const result = await hooks().deliverDue();

    expect(result).toMatchObject({ delivered: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(webhookSignatureMatches(sent[0]!.body, sent[0]!.signature, secret)).toBe(true);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      event: "booking.created",
      data: { code: "BK-00300" },
    });

    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
    expect(row.deliveredAt).not.toBeNull();
    expect(row.nextAttemptAt).toBeNull();
  });

  /**
   * The bytes that were signed are the bytes that were sent. Re-serialising on
   * either side reorders keys and changes whitespace, and a correct
   * verification then fails — the most common way a webhook is abandoned as
   * broken.
   */
  it("signs exactly what it sends", async () => {
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1", nested: { b: 2, a: 1 } });

    await hooks().deliverDue();

    expect(sent[0]!.signature).toBe(signWebhook(sent[0]!.body, secret));
  });

  it("does not send the same thing twice", async () => {
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    await hooks().deliverDue();
    await hooks().deliverDue();

    expect(sent).toHaveLength(1);
  });
});

describe("when their website is having a bad day", () => {
  it("keeps the row, counts the attempt, and comes back later", async () => {
    answer = { status: 500 };
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    const result = await hooks().deliverDue();

    expect(result).toMatchObject({ delivered: 0, failed: 1 });
    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
    expect(row).toMatchObject({ attempts: 1, deliveredAt: null, lastStatus: 500 });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("waits longer each time rather than hammering a site that is already down", async () => {
    answer = { status: 500 };
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    const gaps: number[] = [];
    for (let i = 0; i < 3; i++) {
      await prisma.webhookDelivery.updateMany({ where: { endpointId }, data: { nextAttemptAt: new Date() } });
      const before = Date.now();
      await hooks().deliverDue();
      const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
      gaps.push(row.nextAttemptAt!.getTime() - before);
    }

    expect(gaps[1]).toBeGreaterThan(gaps[0]!);
    expect(gaps[2]).toBeGreaterThan(gaps[1]!);
  });

  it("remembers a refusal that was not even an answer", async () => {
    answer = new Error("ECONNREFUSED skyecoresort.example");
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    await hooks().deliverDue();

    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
    expect(row.lastError).toMatch(/ECONNREFUSED/);
    expect(row.lastStatus).toBeNull();
  });

  /**
   * Giving up is a state somebody can see, not a row that quietly stops
   * moving. A delivery nobody is retrying and nobody was told about is the
   * failure this platform already has seven of.
   */
  it("gives up after enough tries, and says so rather than going quiet", async () => {
    answer = { status: 500 };
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });

    for (let i = 0; i < 12; i++) {
      await prisma.webhookDelivery.updateMany({
        where: { endpointId, deliveredAt: null },
        data: { nextAttemptAt: new Date() },
      });
      await hooks().deliverDue();
    }

    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
    expect(row.nextAttemptAt).toBeNull();
    expect(row.deliveredAt).toBeNull();
    expect(row.attempts).toBeLessThanOrEqual(10);
  });

  it("can be sent again by hand once their site is fixed", async () => {
    answer = { status: 500 };
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });
    for (let i = 0; i < 12; i++) {
      await prisma.webhookDelivery.updateMany({ where: { endpointId }, data: { nextAttemptAt: new Date() } });
      await hooks().deliverDue();
    }
    const dead = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });
    expect(dead.nextAttemptAt).toBeNull();

    answer = { status: 200 };
    await hooks().retry(fx.resortId, dead.id);
    await hooks().deliverDue();

    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { id: dead.id } });
    expect(row.deliveredAt).not.toBeNull();
  });

  it("will not resend another resort's delivery", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });
    const mine = await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId } });

    await expect(hooks().retry(elsewhere.resortId, mine.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("what the sweep does not do", () => {
  it("leaves a delivery whose time has not come", async () => {
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });
    await prisma.webhookDelivery.updateMany({
      where: { endpointId },
      data: { nextAttemptAt: new Date(Date.now() + 600_000) },
    });

    const result = await hooks().deliverDue();

    expect(result).toMatchObject({ delivered: 0, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("does not let one broken endpoint stop the others", async () => {
    const second = await prisma.webhookEndpoint.create({
      data: { resortId: fx.resortId, url: "https://second.example/hooks", secret: "s2" },
    });
    await hooks().emit(fx.resortId, "booking.created", { code: "BK-1" });
    // the first one throws, the second must still be tried
    const flaky: Poster = vi.fn(async (url, body, headers) => {
      sent.push({ url, body, signature: headers["x-resort-signature"] });
      if (url.includes("skyecoresort")) throw new Error("boom");
      return { status: 200 };
    });

    const result = await new WebhookService(asPrisma, flaky).deliverDue();

    expect(result).toMatchObject({ delivered: 1, failed: 1 });
    expect(
      (await prisma.webhookDelivery.findFirstOrThrow({ where: { endpointId: second.id } })).deliveredAt,
    ).not.toBeNull();
  });
});
