/**
 * The owner's own subscription.
 *
 * The console has had a "Change plan" row on Settings since the beginning, and
 * it was never the owner's: the buttons render only for `SUPER_ADMIN`, and the
 * endpoint behind them, `PATCH /tenants/:id/plan`, is `requireRoles(SUPER_ADMIN)`
 * too. So the person whose subscription it is had no control at all. And on the
 * way past it writes `Tenant.plan`, a field the billing sweep never reads: even
 * for a super admin it changed a label, not a subscription. The fee, the
 * renewal date and the status stayed exactly as they were.
 *
 * There was also nowhere to *look*. An owner could not see what they pay, when
 * it renews, what is outstanding, or what the other plans cost — the platform
 * billed them monthly and told them nothing.
 *
 * These are the rules the replacement keeps:
 *
 * - **An upgrade is immediate, and paid for pro rata.** Charging a full month
 *   for eleven days is theft; giving eleven days of the dearer plan away is a
 *   hole. The bill is the *difference*, for the days remaining.
 * - **A downgrade waits for the renewal.** The month is already paid for. The
 *   plan holds until the period ends, and the sweep applies it.
 * - **The renewal date never moves.** A plan change is not a renewal, and a
 *   subscription whose date shifts on every change is a subscription nobody
 *   can forecast.
 * - **A trial has no money in it,** so a change during one is immediate,
 *   free — and does not restart the trial.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeBillingService, makeSubscriptionService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
/** The owner: RESORT_ADMIN holds every permission by being the owner. */
let owner: JwtClaims;

const DAY = 86_400_000;

/** A user whose access is exactly `permissions` — nothing from the fixed role. */
async function withPermissions(permissions: string[]): Promise<JwtClaims> {
  const role = await prisma.customRole.create({
    data: { resortId: fx.resortId, name: `Role ${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      name: "Scoped User",
      phone: `8809${Math.floor(Math.random() * 1e8)}`,
      email: `8809${Math.floor(Math.random() * 1e8)}@example.com`,
      role: ROLE.FRONT_DESK,
      status: "active",
    },
  });
  await prisma.userResort.create({ data: { userId: user.id, resortId: fx.resortId, roleId: role.id } });
  return { userId: user.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
}

/** `resetDb` leaves the platform's own tables alone, so this upserts. */
async function seedPlans() {
  const rows = [
    { name: "STARTER", label: "Starter", monthlyFee: 2500, maxRooms: 10, maxResorts: 1, trialDays: 14, active: true, sortOrder: 1 },
    { name: "GROWTH", label: "Growth", monthlyFee: 5000, maxRooms: 40, maxResorts: 2, trialDays: 14, active: true, sortOrder: 2 },
    { name: "CHAIN", label: "Chain", monthlyFee: 12000, maxRooms: 10000, maxResorts: 10, trialDays: 14, active: true, sortOrder: 3 },
    { name: "LEGACY", label: "Legacy", monthlyFee: 1, maxRooms: 5, maxResorts: 1, trialDays: 0, active: false, sortOrder: 9 },
  ];
  for (const r of rows) {
    await prisma.platformPlan.upsert({ where: { name: r.name }, create: r as never, update: r as never });
  }
}

/**
 * A resort that has been paying for a while: out of trial, mid-period, with
 * a renewal ten days away.
 */
async function paying(plan: string, fee: number, renewsInDays = 10) {
  const now = new Date();
  const renewsAt = new Date(now.getTime() + renewsInDays * DAY);
  const periodStart = new Date(renewsAt);
  periodStart.setMonth(periodStart.getMonth() - 1);
  return prisma.subscription.create({
    data: {
      accountId: fx.tenantId,
      plan,
      status: "ACTIVE",
      fee: fee as never,
      startedAt: periodStart,
      trialEndsAt: periodStart,
      renewsAt,
    },
  });
}

const liveRow = () =>
  prisma.subscription.findFirstOrThrow({
    where: { accountId: fx.tenantId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
  });

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await seedPlans();
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what the owner can see", () => {
  it("says what they are on, what it costs and when it renews", async () => {
    const sub = await paying("STARTER", 2500);

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.plan).toBe("STARTER");
    expect(d.planLabel).toBe("Starter");
    expect(d.status).toBe("ACTIVE");
    expect(d.fee).toBe(2500);
    expect(d.renewsAt).toBe(sub.renewsAt!.toISOString());
  });

  it("lists the plans on sale, and no plan that is not", async () => {
    await paying("STARTER", 2500);

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.plans.map((p) => p.name)).toEqual(["STARTER", "GROWTH", "CHAIN"]);
    expect(d.plans.find((p) => p.name === "GROWTH")!.monthlyFee).toBe(5000);
  });

  it("marks which plan is theirs, and which way each other one moves", async () => {
    await paying("GROWTH", 5000);

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.plans.find((p) => p.name === "GROWTH")!.direction).toBe("current");
    expect(d.plans.find((p) => p.name === "CHAIN")!.direction).toBe("upgrade");
    expect(d.plans.find((p) => p.name === "STARTER")!.direction).toBe("downgrade");
  });

  it("measures each plan against what they actually pay, not the list price", async () => {
    // the platform discounted this customer's GROWTH to 2,000
    await paying("GROWTH", 2000);

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    // STARTER's list price is 2,500 — more than they pay, so moving there
    // costs money, and `changePlan` bills it as one. The label has to agree.
    expect(d.plans.find((p) => p.name === "STARTER")!.direction).toBe("upgrade");
  });

  it("shows what is outstanding, and the bills behind it", async () => {
    const sub = await paying("STARTER", 2500);
    await prisma.subscriptionDue.createMany({
      data: [
        { subscriptionId: sub.id, accountId: fx.tenantId, amount: 2500 as never, periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-08-01"), dueDate: new Date("2026-07-01"), status: "PAID", paidAt: new Date("2026-07-02") },
        { subscriptionId: sub.id, accountId: fx.tenantId, amount: 2500 as never, periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-09-01"), dueDate: new Date("2026-08-01"), status: "OVERDUE" },
      ] as never,
    });

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.outstanding.amount).toBe(2500);
    expect(d.outstanding.count).toBe(1);
    expect(d.bills).toHaveLength(2);
    // newest first: the bill someone is chasing is the one they came to read
    expect(d.bills[0]!.status).toBe("OVERDUE");
  });

  it("says what the plan allows and what the resort is using", async () => {
    await paying("STARTER", 2500);

    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.limits.maxRooms).toBe(10);
    // the fixture's two rooms
    expect(d.usage.rooms).toBe(2);
  });

  it("answers for a resort with no subscription at all, rather than throwing", async () => {
    const d = await makeSubscriptionService(asPrisma).detail(owner, fx.resortId);

    expect(d.plan).toBeNull();
    expect(d.status).toBe("NONE");
    expect(d.plans).toHaveLength(3);
  });

  it("is refused to someone who may not see the bill", async () => {
    await paying("STARTER", 2500);
    const clerk = await withPermissions(["bookings.view"]);

    await expect(
      makeSubscriptionService(asPrisma).detail(clerk, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("is refused for a resort that is not theirs", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);

    await expect(
      makeSubscriptionService(asPrisma).detail(owner, other.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("upgrading", () => {
  it("takes effect at once", async () => {
    await paying("STARTER", 2500);

    const r = await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    expect(r.effective).toBe("now");
    const live = await liveRow();
    expect(live.plan).toBe("GROWTH");
    expect(Number(live.fee)).toBe(5000);
  });

  it("bills only the difference, only for the days left", async () => {
    // 10 of the period's ~30 days remain, and the difference is 2,500/month
    await paying("STARTER", 2500, 10);

    const r = await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    const bill = await prisma.subscriptionDue.findFirstOrThrow({ where: { accountId: fx.tenantId } });
    // ~2500 × 10/30. Not the full 5,000, and not the full difference either.
    expect(Number(bill.amount)).toBeGreaterThan(700);
    expect(Number(bill.amount)).toBeLessThan(900);
    expect(r.charged).toBe(Number(bill.amount));
  });

  it("does not move the renewal date", async () => {
    const before = await paying("STARTER", 2500);

    await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    const live = await liveRow();
    expect(live.renewsAt!.toISOString()).toBe(before.renewsAt!.toISOString());
  });

  it("leaves one live subscription, and one history", async () => {
    await paying("STARTER", 2500);

    await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    const live = await prisma.subscription.findMany({
      where: { accountId: fx.tenantId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
    });
    expect(live).toHaveLength(1);
  });

  it("is refused to someone who may only look", async () => {
    await paying("STARTER", 2500);
    const viewer = await withPermissions(["billing.view"]);

    await expect(
      makeSubscriptionService(asPrisma).changePlan(viewer, fx.resortId, "GROWTH"),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("downgrading", () => {
  it("does not take the paid-for month away", async () => {
    await paying("GROWTH", 5000);

    const r = await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "STARTER");

    expect(r.effective).toBe("renewal");
    const live = await liveRow();
    expect(live.plan).toBe("GROWTH");
    expect(Number(live.fee)).toBe(5000);
    expect(live.pendingPlan).toBe("STARTER");
  });

  it("raises no bill", async () => {
    await paying("GROWTH", 5000);

    await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "STARTER");

    expect(await prisma.subscriptionDue.count({ where: { accountId: fx.tenantId } })).toBe(0);
  });

  it("lands at the renewal, and the next bill is the cheaper one", async () => {
    const sub = await paying("GROWTH", 5000, 10);
    await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "STARTER");

    // the renewal arrives
    await makeBillingService(asPrisma).sweep(new Date(sub.renewsAt!.getTime() + DAY));

    const live = await liveRow();
    expect(live.plan).toBe("STARTER");
    expect(Number(live.fee)).toBe(2500);
    expect(live.pendingPlan).toBeNull();
    const bill = await prisma.subscriptionDue.findFirstOrThrow({
      where: { accountId: fx.tenantId },
      orderBy: { id: "desc" },
    });
    expect(Number(bill.amount)).toBe(2500);
  });

  it("can be called off by asking for the current plan again", async () => {
    await paying("GROWTH", 5000);
    await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "STARTER");

    const r = await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    expect(r.effective).toBe("cancelled");
    const live = await liveRow();
    expect(live.pendingPlan).toBeNull();
    expect(live.plan).toBe("GROWTH");
  });
});

describe("during a trial", () => {
  it("changes the plan at once and charges nothing", async () => {
    const trialEndsAt = new Date(Date.now() + 7 * DAY);
    await prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "TRIAL",
        fee: 2500 as never, trialEndsAt, renewsAt: trialEndsAt,
      },
    });

    const r = await makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH");

    expect(r.effective).toBe("now");
    expect(r.charged).toBe(0);
    const live = await liveRow();
    expect(live.plan).toBe("GROWTH");
    expect(Number(live.fee)).toBe(5000);
    // and the trial is not handed out a second time
    expect(live.trialEndsAt!.toISOString()).toBe(trialEndsAt.toISOString());
  });
});

describe("what it refuses", () => {
  it("refuses a plan the platform does not sell", async () => {
    await paying("STARTER", 2500);

    await expect(
      makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "ENTERPRISE"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a plan that has been withdrawn from sale", async () => {
    await paying("STARTER", 2500);

    await expect(
      makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "LEGACY"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a downgrade the resort has outgrown", async () => {
    // STARTER allows 10 rooms; give the resort 11
    await paying("GROWTH", 5000);
    for (let i = 0; i < 9; i++) {
      await prisma.room.create({
        data: { resortId: fx.resortId, roomTypeId: fx.roomTypeId, name: `Extra ${i}`, baseRate: 3000 as never },
      });
    }

    await expect(
      makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "STARTER"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to change the plan of a resort with no subscription", async () => {
    await expect(
      makeSubscriptionService(asPrisma).changePlan(owner, fx.resortId, "GROWTH"),
    ).rejects.toMatchObject({ status: 400 });
  });
});
