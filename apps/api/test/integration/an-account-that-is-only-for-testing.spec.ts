/**
 * An account the platform owner opened to try things with (2026-09-20).
 *
 * The owner asked for a resort and an agency on the live platform to click
 * around in — theirs to test with, and mine to open every screen against.
 * Their own words: keep them or delete them later, "admin/platform owner ke
 * ekta badge dekhalei holo".
 *
 * A badge alone is not enough, and that is the whole of this file. Bookings
 * taken in a test resort are bookings; payments are payments. They reach
 * Platform → Overview, which is the screen the owner reads to know how the
 * business is doing — so two pretend accounts would quietly make the resort
 * count, the trial count and the monthly revenue wrong, and in a month
 * nobody would remember which rows were the pretend ones.
 *
 * So it is a column, not a naming convention: `Tenant.demo`. One flag covers
 * both customers, because a resort owner and an agency are both tenants.
 * Nothing is hidden by it — the accounts work exactly as real ones do, which
 * is the point of testing with them — they are only kept out of the numbers,
 * and the screen says how many it left out.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, seedPlatformPlans, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";

const prisma = testPrisma();
let fx: Fixture;
let svc: ReturnType<typeof makePlatformService>;

// a real user row, because marking an account is audited and an audit entry
// with an actor who does not exist is refused by the foreign key
const owner = (): JwtClaims => ({ userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] });
const staff = (): JwtClaims => ({
  userId: fx.managerId,
  role: ROLE.RESORT_ADMIN,
  resortIds: [fx.resortId],
});

/** A second customer, marked as one to test with. */
async function aDemoResort() {
  const tenant = await prisma.tenant.create({
    data: { name: "Test Resort Co", slug: "test-resort-co", kind: "RESORT_OWNER", demo: true },
  });
  const resort = await prisma.resort.create({
    data: { tenantId: tenant.id, name: "Demo Beach Resort", slug: "demo-beach", status: "active" },
  });
  return { tenant, resort };
}

async function aDemoAgency() {
  return prisma.tenant.create({
    data: { name: "Test Travels", slug: "test-travels", kind: "AGENCY", demo: true, status: "active" },
  });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  await seedPlatformPlans(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  svc = makePlatformService(prisma);
});

afterAll(async () => prisma.$disconnect());

describe("a tenant nobody is really paying for", () => {
  it("is an ordinary account until somebody says otherwise", async () => {
    const real = await prisma.tenant.findFirst({ where: { kind: "RESORT_OWNER" } });
    expect(real!.demo).toBe(false);
  });

  it("can be marked, and unmarked, by the platform owner", async () => {
    const { tenant } = await aDemoResort();
    await svc.setAccountDemo(owner(), tenant.id, false);
    expect((await prisma.tenant.findUnique({ where: { id: tenant.id } }))!.demo).toBe(false);
    await svc.setAccountDemo(owner(), tenant.id, true);
    expect((await prisma.tenant.findUnique({ where: { id: tenant.id } }))!.demo).toBe(true);
  });

  /**
   * A resort's own staff cannot mark themselves as a test account: the flag
   * decides what the platform counts as revenue, so it belongs to the
   * platform.
   */
  it("cannot be marked by the resort itself", async () => {
    const { tenant } = await aDemoResort();
    await expect(svc.setAccountDemo(staff(), tenant.id, true)).rejects.toThrow();
  });
});

describe("what the platform owner sees", () => {
  it("is told which resorts are only for testing", async () => {
    const { resort } = await aDemoResort();
    const rows = await svc.allResorts(owner());
    const demoRow = rows.find((r) => r.id === resort.id)!;
    const realRow = rows.find((r) => r.id === fx.resortId)!;
    expect(demoRow.tenant!.demo).toBe(true);
    expect(realRow.tenant!.demo).toBe(false);
  });

  it("is told which agencies are only for testing", async () => {
    const agency = await aDemoAgency();
    const rows = await svc.agencies(owner());
    expect(rows.find((a) => a.id === agency.id)!.demo).toBe(true);
  });

  /** Both still appear. Hiding them would make them impossible to unmark. */
  it("still sees them in the lists", async () => {
    const { resort } = await aDemoResort();
    const agency = await aDemoAgency();
    expect((await svc.allResorts(owner())).map((r) => r.id)).toContain(resort.id);
    expect((await svc.agencies(owner())).map((a) => a.id)).toContain(agency.id);
  });
});

describe("the numbers the owner runs the business on", () => {
  it("count a real resort and not a test one", async () => {
    const before = await svc.overview(owner());
    await aDemoResort();
    const after = await svc.overview(owner());
    expect(after.resorts.total).toBe(before.resorts.total);
  });

  /**
   * Said out loud, not silently. A total that quietly differs from the list
   * beneath it is worse than one that is wrong in a way you can see.
   */
  it("say how many they left out", async () => {
    expect((await svc.overview(owner())).demoExcluded).toEqual({ resorts: 0, agencies: 0 });
    await aDemoResort();
    await aDemoAgency();
    expect((await svc.overview(owner())).demoExcluded).toEqual({ resorts: 1, agencies: 1 });
  });

  it("keep a test subscription out of the monthly revenue", async () => {
    const { tenant } = await aDemoResort();
    const before = await svc.overview(owner());
    await prisma.subscription.create({
      data: { accountId: tenant.id, plan: "growth", status: "ACTIVE", fee: 9000 },
    });
    const after = await svc.overview(owner());
    expect(after.subscriptions.mrr).toBe(before.subscriptions.mrr);
    expect(after.subscriptions.active).toBe(before.subscriptions.active);
  });

  it("keep a test account's unpaid bill out of what is outstanding", async () => {
    const { tenant } = await aDemoResort();
    const sub = await prisma.subscription.create({
      data: { accountId: tenant.id, plan: "growth", status: "ACTIVE", fee: 9000 },
    });
    const before = await svc.overview(owner());
    await prisma.subscriptionDue.create({
      data: {
        accountId: tenant.id,
        subscriptionId: sub.id,
        amount: 9000,
        status: "DUE",
        dueDate: new Date(),
        periodStart: new Date(),
        periodEnd: new Date(),
      },
    });
    const after = await svc.overview(owner());
    expect(after.duesOutstanding).toBe(before.duesOutstanding);
  });
});
