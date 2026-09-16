/**
 * A guest with no phone number gets no SMS — not an SMS that fails.
 *
 * A walk-in taken as "local" has no number. Every booking and payment for one
 * still queued a message addressed to nobody; the gateway refused it as an
 * invalid number three times, the job was counted as stuck, and `/health`
 * reported the API degraded for as long as the row existed. On 2026-09-16 all
 * ten stuck jobs on production were exactly this.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb } from "../helpers/db";
import { makeNotificationsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const notifications = () => makeNotificationsService(prisma as unknown as PrismaService);

beforeEach(async () => resetDb(prisma as unknown as PrismaClient));
afterAll(async () => prisma.$disconnect());

it("queues nothing for an empty address", async () => {
  for (const to of ["", "   "]) {
    const r = await notifications().enqueueJob({ to, template: "payment_receipt", data: {} });
    expect(r.queued).toBe(false);
  }
  expect(await prisma.notificationJob.count()).toBe(0);
});

it("still queues a message that has somewhere to go", async () => {
  const r = await notifications().enqueueJob({ to: "8801711000111", template: "payment_receipt", data: {} });

  expect(r.queued).toBe(true);
});
