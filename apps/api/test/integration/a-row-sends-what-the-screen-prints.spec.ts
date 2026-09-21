/**
 * A row sends what the screen prints (2026-09-21).
 *
 * `GET /platform/resorts` fills the Resorts tab of the platform panel.
 * Beside each resort's plan the tab prints the shelf it was bought on —
 * "Monthly", "Yearly" — and the renew button's tooltip says "Renew for
 * one more <shelf> period". The query selected `scheduleId` and never
 * `schedule.label`, so the badge was blank on every row the platform
 * owner has ever looked at, and the tooltip read "one more  period".
 *
 * Nothing caught it for a simple reason: the route answered `unknown` in
 * the typed client, so the console cast it to an interface hand-written
 * a few lines above the call — and that interface *claimed* the field.
 * A cast is an assertion, not a check. The interface was the check, and
 * it was wrong.
 *
 * This is here rather than in the console because the fix belongs to the
 * server: the screen was right about what it needed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, scheduleOf, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
const db = () => prisma as unknown as PrismaClient;
const platform = () => makePlatformService(asPrismaService);

let fx: Fixture;
let owner: JwtClaims;

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const mine = async () => {
  const rows = await platform().allResorts(owner);
  const row = rows.find((r) => r.id === fx.resortId);
  expect(row).toBeTruthy();
  return row!;
};

describe("the resort row's subscription", () => {
  it("names the shelf it was bought on, not only its id", async () => {
    const yearly = await scheduleOf(db(), "STARTER", "Yearly");
    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      scheduleId: yearly,
    });

    const sub = (await mine()).tenant.subscriptions[0];
    expect(sub?.scheduleId).toBe(yearly);
    expect(sub?.scheduleLabel).toBe("Yearly");
  });

  it("follows the shelf when the account moves to another one", async () => {
    const monthly = await scheduleOf(db(), "STARTER", "Monthly");
    const yearly = await scheduleOf(db(), "STARTER", "Yearly");

    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      scheduleId: monthly,
    });
    expect((await mine()).tenant.subscriptions[0]?.scheduleLabel).toBe("Monthly");

    await platform().setSubscription(owner, fx.resortId, {
      plan: "STARTER",
      scheduleId: yearly,
    });
    expect((await mine()).tenant.subscriptions[0]?.scheduleLabel).toBe("Yearly");
  });

  /**
   * A subscription predates its schedule: every existing row was matched
   * to one by migration, but the column is nullable and the screen must
   * render something rather than the word "undefined".
   */
  it("says null rather than nothing when a subscription has no shelf", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });
    await prisma.subscription.updateMany({
      where: { accountId: fx.tenantId },
      data: { scheduleId: null },
    });

    const sub = (await mine()).tenant.subscriptions[0];
    expect(sub?.scheduleId).toBeNull();
    expect(sub?.scheduleLabel).toBeNull();
  });

  /** The rest of the row is unchanged by the flattening the label needed. */
  it("still carries everything the tab was already printing", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });
    const row = await mine();

    expect(row.name).toBeTruthy();
    expect(row.tenant.id).toBe(fx.tenantId);
    expect(typeof row.tenant.demo).toBe("boolean");
    expect(row._count.rooms).toBeGreaterThanOrEqual(0);
    const sub = row.tenant.subscriptions[0]!;
    expect(sub.plan).toBe("STARTER");
    expect(sub.status).toBeTruthy();
    // no `schedule` object left over: the row carries a subscription, not a shelf
    expect(sub).not.toHaveProperty("schedule");
  });
});
