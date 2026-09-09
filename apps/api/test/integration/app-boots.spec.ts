/**
 * The application boots.
 *
 * Every other test in this suite builds services by hand — `new
 * BookingsService(prisma, ...)` — which is deliberate and keeps them fast and
 * honest about what they exercise. But it means Nest's own wiring was never
 * tested by anything, and Nest is what actually starts the API in production.
 *
 * That gap took the live site down. `IntentsService` declared its gateway as a
 * constructor parameter typed with an *interface* and gave it a default value.
 * Interfaces do not exist at runtime, and Nest resolves every parameter itself
 * rather than falling back to a default, so it injected undefined and the whole
 * application refused to start: "Nest can't resolve dependencies of the
 * IntentsService ... argument at index [3]". 360 passing tests, a clean
 * typecheck, a successful build, and the API would not boot.
 *
 * This test asks the only question those could not: does the module graph
 * resolve? It builds the real AppModule — every module, every provider, every
 * controller — and closes it again. It does not listen on a port and it does
 * not make requests; a route test would be a different job. It fails the moment
 * a provider is added without being registered, which is the failure worth
 * catching before a deployment rather than during one.
 */
import { afterAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../src/app.module";
import { testDatabaseUrl } from "../helpers/db";

// the graph is what is under test, not the data: point it at the test database
// so booting cannot touch anything real
process.env.DATABASE_URL = testDatabaseUrl();

let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

afterAll(async () => {
  await app?.close();
});

describe("the Nest application", () => {
  it("resolves every provider in the real module graph", async () => {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
      abortOnError: false,
    });

    expect(app).toBeTruthy();
  }, 60_000);
});
