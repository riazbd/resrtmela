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
import { ValidationPipe, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { ROLE, type Role } from "@rh/shared";
import { AppModule } from "../../src/app.module";
import { AuthGuard, signToken } from "../../src/common/auth.guard";
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
 * The account behind the doors.
 *
 * Removing the routes a guest used leaves the thing they signed in as: a
 * `users` row with role GUEST, minted by `verifyOtp` for any phone or email
 * that asked for a code. The owner's decision of 2026-09-11 is that a guest
 * is a line in a resort's register, never an account — so the role goes from
 * the code, from the database, and from any session still carrying it.
 */
describe("the guest account", () => {
  it("is not a role anybody can hold", () => {
    expect("GUEST" in ROLE).toBe(false);
  });

  it("cannot be minted by a code, because there is no code", async () => {
    const auth = await import("../../src/auth/auth.service");
    const proto = auth.AuthService.prototype as unknown as Record<string, unknown>;

    expect("requestOtp" in proto).toBe(false);
    expect("verifyOtp" in proto).toBe(false);
  });

  /**
   * The shared constant is what the code agrees on; the column is what the
   * database will actually keep. Taking GUEST out of one and not the other
   * would leave the database willing to hold an account no code can name.
   *
   * The insert is run on a session pinned to strict mode on purpose. The
   * local MySQL runs with an empty `sql_mode`, and a lax server does not
   * refuse an out-of-enum value — it stores `''` with a warning. Production's
   * MariaDB is strict by default, so pinning the session asks the question
   * production would ask, instead of whatever the machine running the suite
   * happens to be configured for.
   */
  it("will not be held by the database", async () => {
    const db = testPrisma();
    try {
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET SESSION sql_mode = 'STRICT_ALL_TABLES'");
          await tx.$executeRawUnsafe(
            "INSERT INTO `users` (`name`, `phone`, `role`) VALUES ('A guest', '+8801799999001', 'GUEST')",
          );
        }),
      ).rejects.toThrow(/Data truncated for column 'role'/);

      const [column] = await db.$queryRawUnsafe<{ t: string }[]>(
        "SELECT CAST(COLUMN_TYPE AS CHAR) AS t FROM information_schema.COLUMNS " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'",
      );
      // the control: the query found the column, so its silence on GUEST means something
      expect(column?.t).toContain("'AGENT'");
      expect(column?.t).not.toContain("'GUEST'");
    } finally {
      await db.$executeRawUnsafe("DELETE FROM `users` WHERE `phone` = '+8801799999001'");
      await db.$disconnect();
    }
  });
});

/**
 * A session outlives the account it was minted for.
 *
 * `AuthGuard` trusts the signed token alone — no lookup, seven days to run —
 * so deleting every GUEST account does not end a GUEST session issued the
 * day before the deploy. The guard is where that token is stopped: a role
 * the platform no longer has is refused, in words the person holding it can
 * read, and a staff token is let through exactly as before.
 */
describe("a guest session minted before the deploy", () => {
  const guard = new AuthGuard();
  const knock = (token: string) => {
    const req = { headers: { authorization: `Bearer ${token}` } };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    return () => guard.canActivate(ctx);
  };

  it("is refused at the guard with a sentence, not waved through", () => {
    const stale = signToken({ userId: 1, role: "GUEST" as unknown as Role, resortIds: [] });

    let refusal: unknown;
    try {
      knock(stale)();
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(UnauthorizedException);
    expect((refusal as UnauthorizedException).getStatus()).toBe(401);
    // not the generic "Invalid or expired token": the signature is good, and
    // the person deserves to be told what is actually wrong
    expect((refusal as UnauthorizedException).message).toMatch(/no longer/i);
  });

  it("while a staff token still passes", () => {
    const desk = signToken({ userId: 2, role: ROLE.FRONT_DESK, resortIds: [7] });
    expect(knock(desk)()).toBe(true);
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
   * `intents.controller.ts` — and the two OTP routes on `auth.controller.ts`
   * that minted the account those doors were for. Params are filled with a real, seeded id where
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
    // auth.controller.ts — @Controller("auth"), the two routes that minted a
    // guest account from a code. The controller itself stays (login, signup
    // and the password reset live on it), so these are the one pair of doors
    // in this list whose building is still standing.
    { name: "POST /auth/otp/request", method: "POST", path: () => "/auth/otp/request" },
    { name: "POST /auth/otp/verify", method: "POST", path: () => "/auth/otp/verify" },
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
