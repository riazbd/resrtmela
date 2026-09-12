/**
 * The reset between tests has to be cheap, because it runs before every one.
 *
 * `resetDb` is in a `beforeEach` in 67 spec files covering ~800 tests. At two
 * and a half seconds a call -- which is what a TRUNCATE of every table costs,
 * because TRUNCATE is DDL and drops the tablespace even when the table is
 * already empty -- the suite spends half an hour emptying tables that nobody
 * wrote to. That is not a slow test somewhere; that is the harness.
 *
 * So the harness gets a test of its own. This is a budget, not a benchmark:
 * it is set an order of magnitude above what the batched DELETE actually
 * costs, so a slower machine passes and a return to per-table DDL fails.
 */
import { afterAll, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb } from "../helpers/db";

const prisma = testPrisma();

/** Generous: the batched delete measures around 20ms on a developer laptop. */
const BUDGET_MS = 250;

afterAll(async () => {
  await prisma.$disconnect();
});

it("empties the database faster than the tests that use it", async () => {
  // the first call pays for the connection and the table list; the budget is
  // about the steady state, which is what the other 800 tests actually pay
  await resetDb(prisma as unknown as PrismaClient);

  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const started = process.hrtime.bigint();
    await resetDb(prisma as unknown as PrismaClient);
    runs.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  const average = runs.reduce((a, b) => a + b, 0) / runs.length;
  expect(average, `resetDb averaged ${average.toFixed(0)}ms over ${runs.length} calls`).toBeLessThan(
    BUDGET_MS,
  );
  // long enough that a regression reports its number instead of timing out
}, 60_000);

it("still leaves an empty database behind", async () => {
  // cheap is worthless if it stops clearing things: write a row, reset, look
  const tenant = await prisma.tenant.create({ data: { name: "Leftover", slug: `leftover-${Date.now()}` } });
  await prisma.resort.create({ data: { tenantId: tenant.id, name: "Leftover Resort", location: "Nowhere" } });

  await resetDb(prisma as unknown as PrismaClient);

  expect(await prisma.tenant.count()).toBe(0);
  expect(await prisma.resort.count()).toBe(0);
  // except the plan catalogue, which resetDb restores on purpose
  expect(await prisma.platformPlan.count()).toBeGreaterThan(0);
});
