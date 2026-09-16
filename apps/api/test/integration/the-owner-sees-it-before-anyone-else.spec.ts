/**
 * The owner sees their page before they publish it (2026-09-17).
 *
 * The editor said "not live yet — only you can see it, at the address above",
 * and the address answered 404 to everyone, the owner included: the public page
 * serves only what is published, as it must. So a preview is its own door —
 * signed in, the page's owner only, and indifferent to publishing and to the
 * plan, because deciding whether to buy the website is exactly when an owner
 * wants to see it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { SitePreviewService } from "../../src/site/site-preview.service";
import { PermissionsService } from "../../src/common/permissions";
import { makeAgencyPublishedService, makePublishedSiteService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

const preview = () =>
  new SitePreviewService(asPrisma, new PermissionsService(asPrisma), makePublishedSiteService(asPrisma), makeAgencyPublishedService(asPrisma));

async function onPlanWithout(accountId: number, audience: "RESORT" | "AGENCY") {
  const name = `NONE_${audience}`;
  await prisma.platformPlan.create({
    data: { name, label: name, maxRooms: 50, maxResorts: 5, maxStaff: 5, trialDays: 0, active: true, sortOrder: 1, audience, features: [] as never },
  });
  await prisma.subscription.create({ data: { accountId, plan: name, status: "ACTIVE", fee: 0 as never } });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
});

afterAll(async () => prisma.$disconnect());

describe("a resort's preview", () => {
  const owner = () => ({ userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] }) as JwtClaims;

  it("draws the page though it is not published", async () => {
    const page = await preview().resort(owner(), fx.resortId);
    expect(page.name).toBe("Test Resort");
    expect(page.roomTypes.map((t) => t.key)).toEqual(["deluxe"]);
  });

  it("draws it on a plan without a website, so the owner can decide", async () => {
    await onPlanWithout(fx.tenantId, "RESORT");
    await expect(preview().resort(owner(), fx.resortId)).resolves.toMatchObject({ name: "Test Resort" });
  });

  it("is nobody else's", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await expect(preview().resort(owner(), other.resortId)).rejects.toThrow();
    const agent: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
    await expect(preview().resort(agent, fx.resortId)).rejects.toThrow();
  });
});

describe("an agency's preview", () => {
  const agency = () => ({ userId: fx.agentId, role: ROLE.AGENT, resortIds: [] }) as JwtClaims;

  it("draws the page though it is not published, and on a plan without a website", async () => {
    await onPlanWithout(fx.agencyId, "AGENCY");
    const page = await preview().agency(agency());
    expect(page.agency.name).toBe("Test Agency");
    expect(page.resorts.length).toBe(1);
  });

  it("leaves out what the agency hid, as the live page will", async () => {
    await prisma.agencySite.create({ data: { accountId: fx.agencyId, hiddenResortIds: [fx.resortId] as never } });
    expect((await preview().agency(agency())).resorts).toEqual([]);
  });

  it("is only the agency's", async () => {
    const desk: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
    await expect(preview().agency(desk)).rejects.toThrow();
  });
});
