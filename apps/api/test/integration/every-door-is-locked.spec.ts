/**
 * Every route refuses a caller who has no business there.
 *
 * `permission-enforcement.spec.ts` covers eleven endpoints by hand, because
 * those eleven were found broken. Nothing covered the twelfth, and nothing
 * covers a route added tomorrow — which is the shape of the failure that
 * produced that file in the first place: eleven permission keys that appeared
 * in the Settings screen, were never once passed to `perms.require`, and left
 * every read endpoint gated on resort membership alone.
 *
 * This asks the question of the whole surface instead, and it asks the router
 * rather than a list somebody maintains — so a route that is added without a
 * guard fails here on the day it is added, not on the day somebody notices.
 *
 * There is no global guard in this application: `AuthGuard` is applied per
 * controller, by hand. A controller that forgets it is open to the world with
 * no token at all, and nothing but this would say so.
 *
 * Two questions are asked of every route:
 *
 *  1. **Does it refuse a caller with no token?** Everything must, except the
 *     handful that are public on purpose — and that list is written out below,
 *     so adding to it is a decision somebody makes rather than an accident.
 *  2. **Does it refuse the wrong audience?** A resort's manager must not reach
 *     the platform's own routes or an agency's, whatever their permissions say.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@rh/db";
import { AppModule } from "../../src/app.module";
import { signToken } from "../../src/common/auth.guard";
import { ROLE } from "@rh/shared";
import { testPrisma, testDatabaseUrl, resetDb, seedResort, type Fixture } from "../helpers/db";

// the graph is what boots, not the data: point it at the test database before
// AppModule is constructed, or it will reach for the developer's own
process.env.DATABASE_URL = testDatabaseUrl();

const prisma = testPrisma();
let app: INestApplication;
let base = "";
let fx: Fixture;
let managerToken = "";

/**
 * Routes that answer without a token, on purpose.
 *
 * Each one is read by somebody who has not signed in and could not: the
 * marketing site's plans and brand, an offer code in an email, the health
 * probe, and the three doors into the product itself. Anything not on this
 * list must refuse.
 */
const PUBLIC: RegExp[] = [
  /^GET \/health$/,
  /^GET \/cms(\/|$)/,
  /^POST \/auth\/login$/,
  // both signups: a resort owner's and an agency's. Neither caller has an
  // account yet, which is the thing they are asking for
  /^POST \/auth\/signup(\/agency)?$/,
  // asking for a reset, and completing one with a token from the email — both
  // are reached by somebody who cannot sign in, which is the whole point
  /^POST \/auth\/password\/(forgot|reset)$/,
  /^GET \/auth\/offer\//,
  // a resort's own shopfront: a stranger with a URL, which is the only kind of
  // caller it ever has. What it may say is pinned in what-a-resort-publishes
  //
  // the website's own middleware asking whose site to draw, before anybody has
  // signed in to anything; it answers with a slug and nothing else
  /^GET \/domains\/lookup$/,
  /^GET \/site\/[^/]+$/,
  /^GET \/site\/[^/]+\/vacancy$/,
  // an agency's shopfront, the same kind of caller (2026-09-17); pinned in
  // an-agency-has-a-front-door
  /^GET \/site\/agency\/[^/]+$/,
  /^GET \/site\/agency\/[^/]+\/resorts\/[^/]+\/vacancy$/,
  // the website's renderer asking for either kind of page (200 with page: null when not live)
  /^GET \/site\/render\/[^/]+$/,
  /^GET \/site\/agency\/render\/[^/]+$/,
];

/** Path parameters get a value nothing can match, so a bad guard cannot hide behind a 404. */
const UNMATCHABLE = "999999999";

interface Route {
  method: string;
  path: string;
  key: string;
}

function routesOf(application: INestApplication): Route[] {
  const server = application.getHttpAdapter().getInstance() as {
    router?: { stack: unknown[] };
    _router?: { stack: unknown[] };
  };
  const stack = (server.router ?? server._router)?.stack ?? [];
  const found: Route[] = [];
  for (const layer of stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
    if (!layer.route) continue;
    for (const [method, on] of Object.entries(layer.route.methods)) {
      if (!on) continue;
      const path = layer.route.path;
      found.push({ method: method.toUpperCase(), path, key: `${method.toUpperCase()} ${path}` });
    }
  }
  return found;
}

const fill = (path: string) => path.replace(/:[A-Za-z0-9_]+/g, UNMATCHABLE);

async function call(route: Route, token?: string) {
  const res = await fetch(`${base}${fill(route.path)}`, {
    method: route.method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    // an empty object rather than nothing: a body-less POST fails validation
    // before any guard on some routes, which would hide the answer
    ...(route.method === "GET" || route.method === "DELETE" ? {} : { body: "{}" }),
  });
  return res.status;
}

beforeAll(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);

  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0);
  const url = await app.getUrl();
  // getUrl reports :: on some hosts, which fetch will not resolve
  base = url.replace("[::1]", "127.0.0.1").replace("::1", "127.0.0.1");

  /**
   * Signed rather than logged in: the fixture's users have no password, and
   * minting the token with the application's own `signToken` tests the guards
   * instead of testing the login form — which has its own specs.
   */
  managerToken = signToken({ userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

/**
 * What a status code is allowed to prove.
 *
 * 401 and 403 are refusals and the only real pass. A 2xx is a door standing
 * open. Everything in between is **inconclusive**, and saying so is the point:
 * Nest runs guards before pipes, but these routes check the *role* inside the
 * service, after the DTO has been validated — so an empty body earns a 400
 * before authorisation is ever consulted. A route that is genuinely unguarded
 * would look identical. Counting those as passes is how a test comes to
 * promise more than it checked.
 */
type Verdict = "refused" | "open" | "inconclusive";
const verdictOf = (status: number): Verdict =>
  status === 401 || status === 403 ? "refused" : status < 400 ? "open" : "inconclusive";

async function sweep(routes: Route[], token?: string) {
  const open: string[] = [];
  const unclear: string[] = [];
  for (const route of routes) {
    const status = await call(route, token);
    const verdict = verdictOf(status);
    if (verdict === "open") open.push(`${route.key} → ${status}`);
    if (verdict === "inconclusive") unclear.push(`${route.key} → ${status}`);
  }
  return { open, unclear, checked: routes.length };
}

describe("the whole surface", () => {
  it("has routes to check, so a passing run means something", () => {
    expect(routesOf(app).length).toBeGreaterThan(50);
  });

  it("opens no door at all to a caller with no token", async () => {
    const routes = routesOf(app).filter((r) => !PUBLIC.some((p) => p.test(r.key)));
    const { open, unclear, checked } = await sweep(routes);
    // printed rather than asserted: it is a measure of how much this file can
    // still not see, and it should go down over time
    if (unclear.length) console.log(`  inconclusive (validation answered first): ${unclear.length} of ${checked}`);
    expect(open).toEqual([]);
  }, 180_000);

  it("refuses a caller with no token outright on every route it can reach", async () => {
    const routes = routesOf(app).filter((r) => !PUBLIC.some((p) => p.test(r.key)));
    const { unclear, checked } = await sweep(routes);
    /**
     * The strong form: no token should be refused by the guard, before any
     * body is looked at — guards run before pipes, so every one of these is
     * reachable without a valid DTO. Anything inconclusive here would mean a
     * route whose guard is missing and whose pipe is doing the refusing.
     */
    if (unclear.length) {
      console.log("  NO-TOKEN inconclusive:");
      for (const line of unclear) console.log(`    ${line}`);
    }
    expect({ inconclusive: unclear, of: checked }).toEqual({ inconclusive: [], of: checked });
  }, 180_000);

  it("keeps the platform's own routes from a resort's manager", async () => {
    expect(managerToken).toBeTruthy();
    const routes = routesOf(app).filter((r) => r.path.startsWith("/platform"));
    const { open, unclear, checked } = await sweep(routes, managerToken);
    if (unclear.length) console.log(`  platform, inconclusive: ${unclear.length} of ${checked}`);
    expect(open).toEqual([]);
  }, 180_000);

  it("keeps an agency's routes from a resort's manager", async () => {
    expect(managerToken).toBeTruthy();
    const routes = routesOf(app).filter((r) => r.path.startsWith("/agent"));
    const { open, unclear, checked } = await sweep(routes, managerToken);
    if (unclear.length) console.log(`  agent, inconclusive: ${unclear.length} of ${checked}`);
    expect(open).toEqual([]);
  }, 180_000);
});
