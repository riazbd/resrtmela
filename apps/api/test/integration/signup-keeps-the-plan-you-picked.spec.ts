/**
 * The plan a resort picks on the pricing page is the plan it gets.
 *
 * Reported from the console: a workspace that chose **Chain** at signup opened
 * on **Starter**. Nothing was lost in transit — the choice was never carried
 * at all. `home.tsx` puts `?plan=` on the *agency* link and not the resort
 * one; `signup/page.tsx` reads `billing` and never `plan`; and `SignupDto`
 * declares no `plan` field, so `ValidationPipe({ whitelist: true })` strips it
 * silently. `AuthService.signup` has accepted `plan` the whole time, with a
 * comment describing exactly this, and validates it against the shelf.
 *
 * That last layer is why this is an integration test rather than a unit test
 * on the service: a service-level test passes today, because the service is
 * the one part that was right. The bug only exists on the far side of the
 * validation pipe, so the test has to go through a real HTTP request into a
 * real Nest app with the same pipe `main.ts` installs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { testDatabaseUrl, testPrisma, resetDb, seedPlatformPlans } from "../helpers/db";
import type { PrismaClient } from "@rh/db";

/**
 * Before `AppModule` is imported, not inside `beforeAll`.
 *
 * The app builds its PrismaService from `DATABASE_URL`, and `testPrisma()`
 * only redirects the test's *own* client. Omitting this does not fail — it
 * quietly runs the whole spec against the development database, which is how
 * four fictional resorts ended up in mine.
 */
process.env.DATABASE_URL = testDatabaseUrl();

let app: INestApplication;
let baseUrl: string;

async function signUp(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** A complete, valid resort signup; each test varies one thing. */
const form = (n: number, extra: Record<string, unknown> = {}) => ({
  companyName: `Hill Group ${n}`,
  resortName: `Hill Resort ${n}`,
  name: "Nurul Amin",
  email: `owner${n}@hillgroup.example`,
  phone: `0170000${String(n).padStart(4, "0")}`,
  password: "Password123!",
  ...extra,
});

describe("signup keeps the plan that was picked", () => {
  beforeAll(async () => {
    const prisma = testPrisma();
    await resetDb(prisma as unknown as PrismaClient);
    await seedPlatformPlans(prisma as unknown as PrismaClient);
    await prisma.$disconnect();

    app = await NestFactory.create(AppModule, { logger: false });
    // the same pipe main.ts installs: `whitelist` is the thing under test
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("opens the workspace on the plan the pricing page sent", async () => {
    const { status, body } = await signUp(form(1, { plan: "CHAIN" }));
    expect(status, JSON.stringify(body)).toBe(201);

    const prisma = testPrisma();
    const sub = await prisma.subscription.findFirst({
      where: { tenantId: body.resort?.tenantId ?? body.tenantId },
      orderBy: { id: "desc" },
    });
    await prisma.$disconnect();
    expect(sub?.plan).toBe("CHAIN");
  });

  it("still falls back to the entry plan when none was picked", async () => {
    // the pricing page's plain "Start free trial" link sends no plan, and the
    // cheapest active resort plan is the right landing place for it
    const { status, body } = await signUp(form(2));
    expect(status).toBe(201);

    const prisma = testPrisma();
    const sub = await prisma.subscription.findFirst({
      where: { tenantId: body.resort?.tenantId ?? body.tenantId },
      orderBy: { id: "desc" },
    });
    await prisma.$disconnect();
    expect(sub?.plan).toBe("STARTER");
  });

  it("refuses a plan that is not on the resort shelf, by name", async () => {
    // GROWTH_AGENCY-style typos and agency plan names must not open a resort
    // workspace on something the pricing page never offered
    const { status, body } = await signUp(form(3, { plan: "NOT_A_PLAN" }));
    expect(status).toBe(400);
    expect(String(body.message)).toMatch(/not a resort plan/i);
  });

  it("refuses a retired plan even though the row still exists", async () => {
    // FREE is `active: false` — existing tenants carry it, nobody may join it
    const { status } = await signUp(form(4, { plan: "FREE" }));
    expect(status).toBe(400);
  });
});
