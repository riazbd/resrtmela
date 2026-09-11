/**
 * A resort has one subscription.
 *
 * `setSubscription` created a new row in status TRIAL every time it was called
 * and never cancelled the old one, and nothing in the schema said a resort
 * could only have one. Three things followed, all of them live:
 *
 * - **A plan change restarted the free trial.** `trialEndsAt` was set to
 *   `now + trialDays` on every call, so changing plan back and forth was a way
 *   to never pay.
 * - **Two active rows meant two bills.** The monthly sweep walks every
 *   subscription in ACTIVE or PAST_DUE, so once the second trial ended the
 *   resort was invoiced twice a month.
 * - **MRR counted both.** The platform's headline number was wrong in exactly
 *   the case this created.
 *
 * The unique index is the fix; this file is what says so. Everything else here
 * is the behaviour that index forces the service to get right.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeBillingService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** The sweep catches up on every missed period, so a renewal date months back
 *  raises months of dues — correctly. One period back raises one. */
const yesterday = () => new Date(Date.now() - 86_400_000);

const live = () =>
  prisma.subscription.findMany({
    where: { accountId: fx.tenantId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
  });

describe("changing plan", () => {
  it("leaves one live subscription, not two", async () => {
    const platform = makePlatformService(asPrisma);
    await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });

    await platform.setSubscription(owner, fx.resortId, { plan: "GROWTH" });

    const rows = await live();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan).toBe("GROWTH");
  });

  it("does not hand out another free trial", async () => {
    const platform = makePlatformService(asPrisma);
    const first = await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });
    // the trial has been running a while
    await prisma.subscription.update({
      where: { id: first.id },
      data: { status: "ACTIVE", trialEndsAt: new Date("2026-01-01T00:00:00Z") },
    });

    await platform.setSubscription(owner, fx.resortId, { plan: "GROWTH" });

    const rows = await live();
    expect(rows).toHaveLength(1);
    // a paying resort that changes plan keeps paying
    expect(rows[0]!.status).toBe("ACTIVE");
  });

  it("carries the plan's fee across unless told otherwise", async () => {
    const platform = makePlatformService(asPrisma);
    await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });

    await platform.setSubscription(owner, fx.resortId, { plan: "GROWTH" });

    const rows = await live();
    expect(Number(rows[0]!.monthlyFee)).toBe(5000);
  });

  it("raises one bill a month, not two", async () => {
    const platform = makePlatformService(asPrisma);
    const sub = await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "ACTIVE", renewsAt: yesterday() },
    });
    await platform.setSubscription(owner, fx.resortId, { plan: "GROWTH" });
    await prisma.subscription.updateMany({
      where: { accountId: fx.tenantId, status: "TRIAL" },
      data: { status: "ACTIVE", renewsAt: yesterday() },
    });

    await makeBillingService(asPrisma).sweep();

    const dues = await prisma.subscriptionDue.count({ where: { accountId: fx.tenantId } });
    expect(dues).toBe(1);
  });
});

describe("the database itself", () => {
  it("refuses a second live subscription however it is written", async () => {
    const platform = makePlatformService(asPrisma);
    const sub = await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });

    // straight past the service, the way a script or a future bug would
    await expect(
      prisma.subscription.create({
        data: {
          accountId: fx.tenantId,
          plan: "GROWTH",
          status: "TRIAL",
          monthlyFee: 5000 as never,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await live()).toHaveLength(1);
    expect(sub).toBeDefined();
  });

  it("lets a cancelled one sit beside the live one", async () => {
    const platform = makePlatformService(asPrisma);
    await platform.setSubscription(owner, fx.resortId, { plan: "STARTER" });
    await platform.setSubscription(owner, fx.resortId, { plan: "GROWTH" });

    // the history stays: what a resort used to pay is a thing to be able to say
    const all = await prisma.subscription.count({ where: { accountId: fx.tenantId } });
    expect(all).toBe(2);
    expect(await live()).toHaveLength(1);
  });
});
