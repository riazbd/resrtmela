/**
 * The ticks on a pricing card are a lock, not a slogan.
 *
 * They were a slogan. The homepage held `PLAN_FEATURES`, a map keyed by plan
 * name, listing "Restaurant POS & room tabs" under Growth and not under
 * Starter — and a Starter customer could open the restaurant and use it all
 * month. Nothing read that map but the marketing page, and a plan the owner
 * created from the panel matched no key in it, so it rendered with no features
 * at all.
 *
 * The shelf is `PLAN_FEATURES` in @rh/shared now, the plan holds the keys it
 * includes, and the same list does three jobs: the ticks on the card, the
 * checkboxes in the panel, and this.
 *
 * One rule decides who is exempt, and it is the important one: a resort with no
 * subscription is not a downgraded customer, it is an unbilled one. Every
 * resort in the live database is in exactly that state today, several of them
 * using the restaurant, so a lock that bit on the fallback plan would take a
 * working module away from a paying customer on the day it deployed. Locks
 * follow a subscription, because a plan is a commercial arrangement and without
 * one there is nothing to hold anybody to.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import {
  makePlanLimits,
  makePlatformService,
  makeFbService,
  makeEngageService,
  makeImportService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, ALL_PLAN_FEATURES, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let admin: JwtClaims;

const plans = () => makePlanLimits(asPrisma);
const platform = () => makePlatformService(asPrisma);

/** Puts the fixture resort on a plan carrying exactly these features. */
async function onAPlanWith(features: string[]) {
  await prisma.platformPlan.update({
    where: { name: "STARTER" },
    data: { features: features as never },
  });
  await platform().setSubscription(owner, fx.resortId, { plan: "STARTER" });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  owner = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what a plan includes", () => {
  it("is read from the plan the resort is subscribed to", async () => {
    await onAPlanWith(["restaurant", "agents"]);

    expect(await plans().hasFeature(fx.resortId, "restaurant")).toBe(true);
    expect(await plans().hasFeature(fx.resortId, "payroll")).toBe(false);
  });

  it("changes the moment the owner ticks the box — no deployment", async () => {
    await onAPlanWith([]);
    expect(await plans().hasFeature(fx.resortId, "restaurant")).toBe(false);

    await platform().updatePlan(owner, "STARTER", { features: ["restaurant"] });

    expect(await plans().hasFeature(fx.resortId, "restaurant")).toBe(true);
  });

  it("is everything, for a resort nobody has billed", async () => {
    // no subscription at all: the state every live resort is in today
    for (const key of ALL_PLAN_FEATURES) {
      expect(await plans().hasFeature(fx.resortId, key)).toBe(true);
    }
  });

  it("is still everything when the subscription is cancelled, because a lock is not a debt collector", async () => {
    await onAPlanWith([]);
    await prisma.subscription.updateMany({
      where: { resortId: fx.resortId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    expect(await plans().hasFeature(fx.resortId, "restaurant")).toBe(true);
  });
});

describe("the doors those ticks open", () => {
  it("keeps the restaurant shut on a plan without it", async () => {
    await onAPlanWith([]);

    await expect(
      makeFbService(asPrisma).create(admin, fx.resortId, {
        date: "2027-03-01",
        items: [{ name: "Tea", qty: 2, unitPrice: 30 }],
        guestName: "Walk In",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("opens it on a plan with it", async () => {
    await onAPlanWith(["restaurant"]);

    const bill = await makeFbService(asPrisma).create(admin, fx.resortId, {
      date: "2027-03-01",
      items: [{ name: "Tea", qty: 2, unitPrice: 30 }],
      guestName: "Walk In",
    });

    expect(Number(bill.total)).toBe(60);
  });

  it("says which plan feature is missing, not just no", async () => {
    await onAPlanWith([]);

    await expect(
      makeFbService(asPrisma).create(admin, fx.resortId, {
        date: "2027-03-01",
        items: [{ name: "Tea", qty: 1, unitPrice: 30 }],
      }),
    ).rejects.toThrow(/restaurant|plan/i);
  });

  it("keeps bulk email shut on a plan without it", async () => {
    await onAPlanWith([]);

    await expect(
      makeEngageService(asPrisma).sendCampaign(admin, {
        subject: "Eid offer",
        body: "Come and stay",
        audience: "RESORT_GUESTS",
        resortId: fx.resortId,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not shut an agent out of their own guest list — that is not the resort's plan", async () => {
    /**
     * `MY_GUESTS` is the agency writing to people it booked, wherever it booked
     * them. Asking a resort's plan whether an agency may mail its own list is
     * the wrong question, and the first version of this gate asked it.
     */
    await onAPlanWith([]);
    const agent: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };

    await expect(
      makeEngageService(asPrisma).sendCampaign(agent, {
        subject: "Eid offer",
        body: "Come and stay",
        audience: "MY_GUESTS",
      }),
    ).rejects.toThrow(/credit/i);
  });

  it("keeps the spreadsheet importer shut on a plan without it", async () => {
    await onAPlanWith([]);

    await expect(
      makeImportService(asPrisma).import(admin, fx.resortId, "code,guest\n", true),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("mints no key on any plan, because the resort-website API it would open is gone", async () => {
    // Every feature ticked, including the ones that still have a door behind
    // them — proof this refusal is not a plan question any more. `public_api`
    // sold a key; the door it opened (the resort-website `/v1` API) was
    // removed in an earlier task, so no plan, however generous, should mint
    // one that opens nothing.
    await onAPlanWith([...ALL_PLAN_FEATURES]);

    await expect(
      platform().createApiKey(admin, fx.resortId, "My website"),
    ).rejects.toMatchObject({ status: 400 });

    expect(await prisma.apiKey.count({ where: { resortId: fx.resortId } })).toBe(0);
  });
});

describe("what may be ticked", () => {
  it("only features the code has actually implemented", async () => {
    await expect(
      platform().updatePlan(owner, "STARTER", { features: ["teleportation"] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("a plan created with its features keeps them", async () => {
    await platform().createPlan(owner, {
      name: "SEASON",
      label: "Season",
      monthlyFee: 7500,
      maxRooms: 25,
      maxResorts: 1,
      trialDays: 14,
      features: ["restaurant", "activities"],
    });

    const saved = await prisma.platformPlan.findUniqueOrThrow({ where: { name: "SEASON" } });
    expect(saved.features).toEqual(["restaurant", "activities"]);
  });

  it("is carried to the public page, so a new plan draws its own ticks", async () => {
    await platform().updatePlan(owner, "STARTER", { features: ["restaurant"] });

    const card = (await platform().publicPlans()).find((p) => p.name === "STARTER")!;

    expect(card.features).toEqual(["restaurant"]);
  });
});

describe("what the console is told", () => {
  /**
   * The API refusing is not enough on its own.
   *
   * A resort on a plan without the restaurant still saw "Restaurant" in the
   * navigation and met a 403 on arriving — a menu that leads to a wall, which
   * is the same defect the permission matrix had in the other direction. The
   * console needs the answer before it draws the menu, and it already asks one
   * question of this shape when it loads a resort, so the feature list rides
   * along with the permission list rather than costing a second round trip.
   */
  it("every feature, for a resort nobody has billed", async () => {
    const shown = await plans().featuresFor(fx.resortId);

    expect([...shown].sort()).toEqual([...ALL_PLAN_FEATURES].sort());
  });

  it("only the plan's features once there is a subscription", async () => {
    await onAPlanWith(["restaurant", "payroll"]);

    expect((await plans().featuresFor(fx.resortId)).sort()).toEqual(["payroll", "restaurant"]);
  });

  it("an empty list for a plan that includes nothing extra", async () => {
    await onAPlanWith([]);

    expect(await plans().featuresFor(fx.resortId)).toEqual([]);
  });

  it("the same answer the lock gives, so the menu and the door cannot disagree", async () => {
    await onAPlanWith(["activities"]);

    const shown = await plans().featuresFor(fx.resortId);
    for (const key of ALL_PLAN_FEATURES) {
      expect(shown.includes(key)).toBe(await plans().hasFeature(fx.resortId, key));
    }
  });
});

describe("the shelf", () => {
  it("does not offer a feature nothing implements any more", () => {
    expect(ALL_PLAN_FEATURES).not.toContain("public_api");
  });

  /**
   * A lock with no door is worse than no lock: the owner unticks a box, the
   * card stops promising it, and the customer carries on using it. This is the
   * same question `permission-enforcement.spec.ts` asks of the permission
   * matrix — does anything call it? — asked of the feature list.
   */
  it("sells nothing it cannot lock", () => {
    const src = join(__dirname, "..", "..", "src");
    const files: string[] = [];
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    })(src);
    const code = files.map((f) => readFileSync(f, "utf8")).join("\n");

    // `requireFeature(claims?, resortId, "key")` — the key is the last argument,
    // so anchor on the call rather than on the string appearing anywhere
    const ungated = ALL_PLAN_FEATURES.filter(
      (key) => !new RegExp(`requireFeature\\([^)]*"${key}"`).test(code),
    );

    expect(ungated).toEqual([]);
  });
});
