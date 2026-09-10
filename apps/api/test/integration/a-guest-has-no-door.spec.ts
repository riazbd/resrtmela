/**
 * A guest has no door — not a locked one, none.
 *
 * Guest booking was already refused: `bookings.create` threw for ROLE.GUEST
 * and `/v1/bookings` answered a polite 400. But refusing at the threshold
 * leaves the building standing — the availability endpoints, the trips page,
 * the OTP that minted the account, the checkout that took the money. The
 * owner's decision is that the building goes.
 *
 * This spec asserts absence, which is harder than it looks: a test that a
 * route refuses will keep passing after the route is gone for the wrong
 * reason. So it asserts the module cannot be imported at all, and then it
 * walks every door those modules used to answer behind and asks it directly
 * over HTTP — not "does it refuse", but "does anything answer the knock at
 * all". A 401, a 400 or a 200 before this task proves the knock reached a
 * real handler; a 404 after it proves the handler is gone, not merely
 * guarded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { testDatabaseUrl, testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import type { PrismaClient } from "@rh/db";

const gone = async (path: string) => {
  try {
    await import(path);
    return false;
  } catch {
    return true;
  }
};

describe("the guest surface", () => {
  it("has no API module", async () => {
    expect(await gone("../../src/guest/guest.module")).toBe(true);
  });

  it("has no service", async () => {
    expect(await gone("../../src/guest/guest.service")).toBe(true);
  });

  it("has no online checkout", async () => {
    expect(await gone("../../src/payments/intents.service")).toBe(true);
  });
});

describe("the resort-website API", () => {
  it("is gone, and so are the claims it minted", async () => {
    expect(await gone("../../src/platform/public-api.controller")).toBe(true);

    const rbac = await import("../../src/common/rbac");
    expect("apiKeyClaims" in rbac).toBe(false);
  });
});

/**
 * The module-absence tests above prove the source cannot be imported. They
 * cannot prove Nest never wires an equivalent route back in from somewhere
 * else, and they cannot prove `/cms/plans` — which Task 3 moved out of the
 * same file `public-api.controller.ts` used to share — still answers. So
 * this describe boots the real application, exactly as production does
 * (the same `ValidationPipe`, no supertest standing in front of it), and
 * knocks on every door the three removed controllers used to declare.
 */
describe("every door, walked over HTTP", () => {
  process.env.DATABASE_URL = testDatabaseUrl();

  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl: string;
  let fx: Fixture;
  /**
   * A payment intent the mock gateway's webhook could actually settle.
   *
   * Without a matching intent, `POST /payments/webhook/:provider` answers 404
   * for "unknown payment reference" whether or not the route exists at all —
   * which made the pre-deletion red for that one door indistinguishable from
   * the post-deletion green, and would keep doing so if the route were ever
   * wired back in by accident: it would still 404 on a reference nobody
   * seeded, and this test would report the regression as a pass. Seeding a
   * real, matchable intent is what makes 404 mean "the route is gone" and
   * nothing else, both now and if this ever needs to catch a comeback.
   */
  let webhookRef: string;

  beforeAll(async () => {
    const prisma = testPrisma();
    await resetDb(prisma as unknown as PrismaClient);
    fx = await seedResort(prisma as unknown as PrismaClient);
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-01-01",
      checkOut: "2026-01-03",
    });
    webhookRef = `wh-${fx.resortId}-test`;
    await prisma.paymentIntent.create({
      data: {
        resortId: fx.resortId,
        bookingId: booking.id,
        provider: "mock",
        providerRef: webhookRef,
        amount: 100 as never,
        method: "BKASH",
      },
    });
    await prisma.$disconnect();

    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Every route the three removed controllers declared, method and path as
   * written in `guest.controller.ts`, `public-api.controller.ts` and
   * `intents.controller.ts`. Params are filled with a real, seeded id where
   * the handler runs far enough to look one up before this task (so the
   * pre-deletion answer is not itself an accidental 404); everywhere else —
   * every route behind `AuthGuard`, and the API-key routes — the guard or
   * the key check answers first regardless of the id, so a placeholder id
   * is enough.
   */
  const doors: { name: string; method: string; path: () => string }[] = [
    // guest.controller.ts — @Controller("guest")
    { name: "GET /guest/resorts", method: "GET", path: () => "/guest/resorts" },
    { name: "GET /guest/resorts/:id", method: "GET", path: () => `/guest/resorts/${fx.resortId}` },
    {
      name: "GET /guest/resorts/:id/availability",
      method: "GET",
      path: () => `/guest/resorts/${fx.resortId}/availability?from=2026-01-01&to=2026-01-05`,
    },
    { name: "POST /guest/bookings", method: "POST", path: () => "/guest/bookings" },
    { name: "GET /guest/bookings", method: "GET", path: () => "/guest/bookings" },
    { name: "GET /guest/bookings/:id", method: "GET", path: () => "/guest/bookings/999999" },
    { name: "POST /guest/bookings/:id/cancel", method: "POST", path: () => "/guest/bookings/999999/cancel" },
    { name: "GET /guest/activities/:catalogId/slots", method: "GET", path: () => "/guest/activities/999999/slots" },
    { name: "POST /guest/bookings/:id/activities", method: "POST", path: () => "/guest/bookings/999999/activities" },
    {
      name: "DELETE /guest/bookings/:id/activities/:itemId",
      method: "DELETE",
      path: () => "/guest/bookings/999999/activities/999999",
    },
    // public-api.controller.ts — @Controller("v1")
    { name: "GET /v1/resort", method: "GET", path: () => "/v1/resort" },
    { name: "GET /v1/availability", method: "GET", path: () => "/v1/availability" },
    { name: "POST /v1/bookings", method: "POST", path: () => "/v1/bookings" },
    // intents.controller.ts — @Controller()
    { name: "POST /bookings/:bookingId/checkout", method: "POST", path: () => "/bookings/999999/checkout" },
    { name: "POST /payments/webhook/:provider", method: "POST", path: () => "/payments/webhook/mock" },
    { name: "POST /mock-checkout/:ref/confirm", method: "POST", path: () => "/mock-checkout/999999/confirm" },
    { name: "GET /payments/:ref/status", method: "GET", path: () => "/payments/999999/status" },
  ];

  for (const door of doors) {
    it(`${door.name} is gone — 404, not refused`, async () => {
      const isWebhook = door.name === "POST /payments/webhook/:provider";
      const res = await fetch(`${baseUrl}${door.path()}`, {
        method: door.method,
        headers: { "Content-Type": "application/json" },
        body: door.method === "POST" ? JSON.stringify(isWebhook ? { providerRef: webhookRef, amount: 100 } : {}) : undefined,
      });
      expect(res.status).toBe(404);

      /**
       * A handler can throw its own 404 — "booking not found", "unknown
       * payment reference" — and this suite has several. That is a route
       * that exists and refused; the status code alone cannot tell the two
       * apart. Nest's own router writes a message no handler does when
       * nothing matched the path at all: "Cannot GET /guest/resorts". Every
       * door here must fail *that* way, or it is merely refusing, not gone.
       */
      const body = await res.json();
      expect(body.message).toMatch(new RegExp(`^Cannot ${door.method} `));
    });
  }

  it("control: /cms/plans still answers — the harness reaches real routes", async () => {
    const res = await fetch(`${baseUrl}/cms/plans`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
