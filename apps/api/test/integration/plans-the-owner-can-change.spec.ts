/**
 * The platform owner defines the plans. All of them, from the panel.
 *
 * The Plans tab offered two boxes — monthly fee and room cap — on three rows
 * seeded in code. Everything else a plan decides was unreachable: how long the
 * free trial runs, how many resorts a chain may hold, what the plan is called
 * on the public page, what it says under the name, which order they appear in,
 * whether it is still on sale. And there was no way at all to add a fourth
 * plan or retire one, so every pricing decision was a deployment.
 *
 * `PlatformPlan` already had the columns. Nothing was reading them from a form.
 *
 * The name is the exception and stays fixed after creation: `Subscription.plan`
 * points at it by string, not by foreign key, so renaming a plan would leave
 * every resort on it pointing at nothing. The label is the name customers see
 * and is free to change.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;

const platform = () => makePlatformService(asPrismaService);

/** The shape the panel posts. Every field the model has, and no more. */
const A_PLAN = {
  name: "SEASON",
  label: "Season",
  monthlyFee: 7500,
  maxRooms: 25,
  maxResorts: 1,
  trialDays: 30,
  blurb: "For resorts that only open in winter",
  sortOrder: 4,
  active: true,
};

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a plan the code has never heard of", () => {
  it("can be created from the panel", async () => {
    await platform().createPlan(owner, A_PLAN);

    const names = (await platform().listPlans(owner)).map((p) => p.name);
    expect(names).toContain("SEASON");
  });

  it("keeps every field it was given, not just the two the old form sent", async () => {
    await platform().createPlan(owner, A_PLAN);

    const saved = await prisma.platformPlan.findUniqueOrThrow({ where: { name: "SEASON" } });
    expect(Number(saved.monthlyFee)).toBe(7500);
    expect(saved.maxRooms).toBe(25);
    expect(saved.maxResorts).toBe(1);
    expect(saved.trialDays).toBe(30);
    expect(saved.label).toBe("Season");
    expect(saved.blurb).toBe("For resorts that only open in winter");
    expect(saved.sortOrder).toBe(4);
  });

  it("can be sold, at the price the panel set", async () => {
    await platform().createPlan(owner, A_PLAN);

    const sub = await platform().setSubscription(owner, fx.resortId, { plan: "SEASON" });

    expect(sub.plan).toBe("SEASON");
    expect(Number(sub.monthlyFee)).toBe(7500);
  });

  it("brings its own trial length rather than the platform's habit", async () => {
    await platform().createPlan(owner, A_PLAN);

    const sub = await platform().setSubscription(owner, fx.resortId, { plan: "SEASON" });

    const days = Math.round(
      (sub.trialEndsAt!.getTime() - sub.startedAt.getTime()) / 86_400_000,
    );
    expect(days).toBe(30);
  });

  it("shows up on the public page in the order the owner put it", async () => {
    await platform().createPlan(owner, { ...A_PLAN, sortOrder: 0 });

    const shown = await platform().publicPlans();

    expect(shown[0]!.name).toBe("SEASON");
  });
});

describe("what a plan may not be", () => {
  it("a second plan wearing a name that is taken", async () => {
    await platform().createPlan(owner, A_PLAN);

    await expect(platform().createPlan(owner, A_PLAN)).rejects.toMatchObject({ status: 400 });
  });

  it("named something the rest of the system cannot carry", async () => {
    // `Subscription.plan` is VarChar(16) and the name travels in URLs
    await expect(
      platform().createPlan(owner, { ...A_PLAN, name: "a name with spaces" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("priced below nothing", async () => {
    await expect(
      platform().createPlan(owner, { ...A_PLAN, monthlyFee: -1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("a plan with no room in it", async () => {
    await expect(
      platform().createPlan(owner, { ...A_PLAN, maxRooms: 0 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("a free trial that never ends", async () => {
    await expect(
      platform().createPlan(owner, { ...A_PLAN, trialDays: 4000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("labelled longer than the column that holds it", async () => {
    /**
     * VarChar(40). Left to the database this is either a truncated label or a
     * 500, depending on the server's strict mode — the price list learned that
     * lesson once already, silently reverting to 255 characters of itself.
     */
    await expect(
      platform().createPlan(owner, { ...A_PLAN, label: "x".repeat(41) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("anyone's business but the platform owner's", async () => {
    const resortAdmin: JwtClaims = {
      userId: fx.managerId,
      role: ROLE.RESORT_ADMIN,
      resortIds: [fx.resortId],
    };

    await expect(platform().createPlan(resortAdmin, A_PLAN)).rejects.toMatchObject({ status: 403 });
  });
});

describe("the fields the panel could never reach", () => {
  it("the trial length", async () => {
    await platform().updatePlan(owner, "STARTER", { trialDays: 7 });

    expect((await prisma.platformPlan.findUniqueOrThrow({ where: { name: "STARTER" } })).trialDays).toBe(7);
  });

  it("the order they are sold in", async () => {
    await platform().updatePlan(owner, "CHAIN", { sortOrder: 0 });

    expect((await platform().publicPlans())[0]!.name).toBe("CHAIN");
  });

  it("but never the name, because a subscription points at it by string", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    await expect(
      platform().updatePlan(owner, "STARTER", { name: "STARTER2" } as never),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("retiring a plan", () => {
  it("takes it off the public page", async () => {
    await platform().updatePlan(owner, "CHAIN", { active: false });

    expect((await platform().publicPlans()).map((p) => p.name)).not.toContain("CHAIN");
  });

  it("leaves the resorts already on it exactly where they were", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "CHAIN" });

    await platform().updatePlan(owner, "CHAIN", { active: false });

    const sub = await prisma.subscription.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(sub.plan).toBe("CHAIN");
    expect(sub.status).not.toBe("CANCELLED");
  });

  it("still shows it to the owner, who has to see what their customers are on", async () => {
    await platform().updatePlan(owner, "CHAIN", { active: false });

    expect((await platform().listPlans(owner)).map((p) => p.name)).toContain("CHAIN");
  });
});

describe("deleting a plan", () => {
  it("removes one that nobody ever bought", async () => {
    await platform().createPlan(owner, A_PLAN);

    await platform().deletePlan(owner, "SEASON");

    expect((await platform().listPlans(owner)).map((p) => p.name)).not.toContain("SEASON");
  });

  it("refuses one a resort is on, and says to retire it instead", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });

    await expect(platform().deletePlan(owner, "STARTER")).rejects.toThrow(/retire|in use|hide/i);
  });

  it("refuses the last one, because an empty table seeds itself back", async () => {
    /**
     * `ensurePlans` puts the three starting plans back whenever the table is
     * empty, which is right for a fresh platform and wrong after a deliberate
     * deletion — the owner would clear the list and find STARTER, GROWTH and
     * CHAIN resurrected on the next page load, at prices they had rejected.
     * Keeping one plan alive keeps the count above zero and the seed asleep.
     */
    // six, not three: the fixture carries the retired legacy names too
    const [survivor, ...rest] = (await platform().listPlans(owner)).map((p) => p.name);
    for (const name of rest) await platform().deletePlan(owner, name);

    await expect(platform().deletePlan(owner, survivor!)).rejects.toMatchObject({ status: 400 });
    expect((await platform().listPlans(owner)).map((p) => p.name)).toEqual([survivor]);
  });

  it("counts cancelled subscriptions too — the row still names the plan", async () => {
    await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });
    await prisma.subscription.updateMany({
      where: { resortId: fx.resortId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await expect(platform().deletePlan(owner, "STARTER")).rejects.toMatchObject({ status: 400 });
  });
});
