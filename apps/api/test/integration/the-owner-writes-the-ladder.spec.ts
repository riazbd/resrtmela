/**
 * Where a price actually gets written.
 *
 * Every other part of this change makes the platform *read* prices from a
 * plan's schedules. This is the screen behind it: the super admin deciding
 * that Starter is sold monthly, yearly, and — from today — with a free first
 * week, without anybody opening an editor.
 *
 * The whole set is replaced in one call rather than patched rung by rung. A
 * ladder is only correct as a whole: its last rung has to run forever, and
 * half-saving one leaves a plan whose next period has no price. One write, one
 * validation, one transaction.
 *
 * The rule worth most here is the refusal. `Subscription.scheduleId` is
 * ON DELETE SET NULL, so deleting a schedule somebody is standing on does not
 * fail — it silently detaches them, and the billing sweep then declines to
 * invoice an account that is still being served. That is an invisible hole in
 * the revenue, found a month later. It is refused instead.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, scheduleOf, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let manager: JwtClaims;

const platform = () => makePlatformService(asPrismaService);
const db = () => prisma as unknown as PrismaClient;

/** The ladder the owner is trying to save. */
const LADDER = [
  { label: "Intro", phases: [
    { count: 1, unit: "WEEK", price: 0, repeats: 1 },
    { count: 1, unit: "MONTH", price: 1250, repeats: 6 },
    { count: 1, unit: "MONTH", price: 2500, repeats: null },
  ] },
];

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function ladderOf(plan: string) {
  const rows = await prisma.planSchedule.findMany({
    where: { plan: { name: plan } },
    orderBy: { sortOrder: "asc" },
    include: { phases: { orderBy: { seq: "asc" } } },
  });
  return rows.map((s) => ({
    label: s.label,
    phases: s.phases.map((p) => ({ count: p.count, unit: p.unit, price: Number(p.price), repeats: p.repeats })),
  }));
}

describe("writing a plan's ladder", () => {
  it("saves the rungs the owner wrote, in order", async () => {
    await platform().setSchedules(owner, "STARTER", LADDER);

    expect(await ladderOf("STARTER")).toEqual(LADDER);
  });

  it("replaces the whole set, so a shelf taken down is gone", async () => {
    // the fixture sells STARTER two ways
    expect((await ladderOf("STARTER")).map((s) => s.label)).toEqual(["Monthly", "Yearly"]);

    await platform().setSchedules(owner, "STARTER", LADDER);

    expect((await ladderOf("STARTER")).map((s) => s.label)).toEqual(["Intro"]);
  });

  it("reads back what was written, for the editor to draw", async () => {
    await platform().setSchedules(owner, "STARTER", LADDER);

    const read = await platform().planSchedules(owner, "STARTER");

    expect(read).toHaveLength(1);
    expect(read[0]!.label).toBe("Intro");
    expect(read[0]!.phases.map((p) => p.price)).toEqual([0, 1250, 2500]);
  });

  it("is the super admin's screen, not a resort manager's", async () => {
    await expect(platform().setSchedules(manager, "STARTER", LADDER)).rejects.toBeTruthy();
  });
});

describe("a ladder that would not hold", () => {
  it("refuses one whose last rung stops, because the period after it has no price", async () => {
    await expect(
      platform().setSchedules(owner, "STARTER", [
        { label: "Broken", phases: [{ count: 1, unit: "MONTH", price: 500, repeats: 6 }] },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a unit the calendar has never heard of", async () => {
    await expect(
      platform().setSchedules(owner, "STARTER", [
        { label: "Odd", phases: [{ count: 1, unit: "FORTNIGHT", price: 500, repeats: null }] },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a plan with no way to buy it at all", async () => {
    await expect(platform().setSchedules(owner, "STARTER", [])).rejects.toMatchObject({ status: 400 });
  });

  it("leaves the old ladder untouched when it refuses", async () => {
    const before = await ladderOf("STARTER");

    await expect(
      platform().setSchedules(owner, "STARTER", [
        { label: "Fine", phases: [{ count: 1, unit: "MONTH", price: 100, repeats: null }] },
        { label: "Broken", phases: [{ count: 1, unit: "MONTH", price: 500, repeats: 2 }] },
      ]),
    ).rejects.toBeTruthy();

    expect(await ladderOf("STARTER")).toEqual(before);
  });
});

describe("a shelf somebody is standing on", () => {
  async function subscribedTo(label: string) {
    return prisma.subscription.create({
      data: {
        accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", fee: 2500 as never,
        scheduleId: await scheduleOf(db(), "STARTER", label),
      },
    });
  }

  /**
   * The refusal this file exists for. Removing the row would not error — the
   * foreign key nulls the subscription's `scheduleId` — and the account would
   * simply stop being invoiced, silently, until somebody noticed the money was
   * missing.
   */
  it("cannot be taken down while a live subscription is on it", async () => {
    await subscribedTo("Yearly");

    await expect(
      platform().setSchedules(owner, "STARTER", [
        { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 2500, repeats: null }] },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("names the shelf and the account, so the refusal can be acted on", async () => {
    await subscribedTo("Yearly");

    await expect(
      platform().setSchedules(owner, "STARTER", [
        { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 2500, repeats: null }] },
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining("Yearly") });
  });

  /**
   * A cancelled subscription is history, not a customer. Its schedule is kept
   * for the record by the foreign key, and the owner is not blocked from
   * tidying a shelf nobody is actually being billed on.
   */
  it("can be taken down once the last account on it has gone", async () => {
    const sub = await subscribedTo("Yearly");
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await platform().setSchedules(owner, "STARTER", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 2500, repeats: null }] },
    ]);

    expect((await ladderOf("STARTER")).map((s) => s.label)).toEqual(["Monthly"]);
  });

  /**
   * Changing the price on a shelf people are on is allowed, and deliberately.
   * It is how a price rise happens; the accounts on it keep the period they
   * have paid for and meet the new number at their next renewal, which is what
   * `phaseStartedAt` and the sweep between them already guarantee.
   */
  it("keeps its subscribers when only its prices change", async () => {
    const sub = await subscribedTo("Yearly");

    await platform().setSchedules(owner, "STARTER", [
      { label: "Monthly", phases: [{ count: 1, unit: "MONTH", price: 2900, repeats: null }] },
      { label: "Yearly", phases: [{ count: 1, unit: "YEAR", price: 29000, repeats: null }] },
    ]);

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.scheduleId).toBe(await scheduleOf(db(), "STARTER", "Yearly"));
    const yearly = await ladderOf("STARTER");
    expect(yearly.find((s) => s.label === "Yearly")!.phases[0]!.price).toBe(29000);
  });
});
