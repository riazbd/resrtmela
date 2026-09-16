/**
 * An agency's own website (2026-09-17 design, §1, §2, §4).
 *
 * The agency writes a page about itself — words, pictures, how to reach it —
 * and the platform draws the rest from the records: the resorts it sells, as
 * those resorts publish themselves, and its live tour packages. It ends in a
 * message to the agency, never a booking button: guests do not book here.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { DiskStore } from "../../src/site/disk-store";
import { UploadService } from "../../src/site/upload.service";
import { AgencySiteEditorService } from "../../src/site/agency-site-editor.service";
import { AgencyPublicSiteService } from "../../src/site/agency-public-site.service";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { AuditService } from "../../src/common/audit.service";
import { SiteCacheService } from "../../src/site/site-cache.service";
import { makeAgencyPublishedService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { todayIn } from "../../src/common/dates";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let root: string;
let editor: AgencySiteEditorService;
let agency: JwtClaims;
let agencySlug: string;
let resortSlug: string;

const publicSite = () =>
  new AgencyPublicSiteService(asPrisma, makeAgencyPublishedService(asPrisma), new PlanLimitsService(asPrisma));
const day = (n: number) => new Date(todayIn("Asia/Dhaka").getTime() + n * 86_400_000).toISOString().slice(0, 10);
const png = () =>
  sharp({ create: { width: 30, height: 20, channels: 3, background: { r: 200, g: 9, b: 9 } } }).png().toBuffer();

async function agencyOnPlanWith(features: string[]) {
  await prisma.platformPlan.create({
    data: { name: "AG_P", label: "Agency Starter", maxRooms: 0, maxResorts: 0, maxStaff: 3, trialDays: 0, active: true, sortOrder: 1, audience: "AGENCY", features: features as never },
  });
  await prisma.subscription.create({ data: { accountId: fx.agencyId, plan: "AG_P", status: "ACTIVE", fee: 0 as never } });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  agencySlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: fx.agencyId } })).slug;
  resortSlug = (await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug;
  root = mkdtempSync(join(tmpdir(), "rm-agency-site-"));
  editor = new AgencySiteEditorService(
    asPrisma,
    new UploadService(asPrisma, new DiskStore(root)),
    new PermissionsService(asPrisma),
    new PlanLimitsService(asPrisma),
    new AuditService(asPrisma),
    new SiteCacheService(),
    makeAgencyPublishedService(asPrisma),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));
afterAll(async () => prisma.$disconnect());

describe("the agency writing its page", () => {
  it("starts from an empty draft at the agency's own address", async () => {
    const draft = await editor.get(agency);

    expect(draft.slug).toBe(agencySlug);
    expect(draft.published).toBe(false);
    expect(draft.resorts.map((r) => r.slug)).toEqual([resortSlug]);
  });

  it("saves its words and how to reach it", async () => {
    const draft = await editor.save(agency, {
      headline: "Hill trips that work",
      intro: "Sylhet and the Sundarbans since 2012.",
      phone: "01711000000",
      whatsapp: "8801711000000",
      email: "hello@agency.example",
      themeColor: "#0F5132",
    });

    expect(draft.headline).toBe("Hill trips that work");
    expect(draft.themeColor).toBe("#0f5132");
    await expect(editor.save(agency, { themeColor: "green" })).rejects.toThrow(/#0f5132/);
    await expect(editor.save(agency, { email: "not an email" })).rejects.toThrow(/email/i);
  });

  it("hides a resort it sells but does not want on its page", async () => {
    const draft = await editor.save(agency, { hiddenResortIds: [fx.resortId, 999999] });

    // an id that is not one of its resorts is dropped, not stored
    expect(draft.hiddenResortIds).toEqual([fx.resortId]);
  });

  it("takes pictures, counted against the agency and not a resort", async () => {
    const added = await editor.addPhoto(agency, await png(), "image/png", { alt: "Tea garden" });

    const upload = await prisma.upload.findFirstOrThrow({ where: { accountId: fx.agencyId } });
    expect(upload.resortId).toBeNull();
    expect(upload.path.startsWith(`a${fx.agencyId}/`)).toBe(true);
    expect(added.url).toContain(upload.path);

    await editor.removePhoto(agency, added.id);
    expect(await prisma.upload.count({ where: { accountId: fx.agencyId } })).toBe(0);
  });

  it("changes its address, but not to somebody else's", async () => {
    await expect(editor.setSlug(agency, "Sky Trips BD")).resolves.toEqual({ slug: "sky-trips-bd" });
    const other = await prisma.tenant.create({ data: { name: "Other", slug: "taken-name", kind: "AGENCY" } });
    void other;
    await expect(editor.setSlug(agency, "taken-name")).rejects.toThrow(/somebody else/);
  });

  it("is the agency's alone to edit", async () => {
    const desk: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
    await expect(editor.get(desk)).rejects.toThrow();
  });
});

describe("going live", () => {
  it("needs the agency's plan to include a website, and says which plan", async () => {
    await agencyOnPlanWith([]);

    await expect(editor.publish(agency, true)).rejects.toThrow(/Agency Starter.*website/);
  });

  it("can always be undone, whatever the plan", async () => {
    await editor.publish(agency, true);
    await agencyOnPlanWith([]);

    const draft = await editor.publish(agency, false);
    expect(draft.published).toBe(false);
  });
});

describe("the page a stranger sees", () => {
  beforeEach(async () => {
    await prisma.resort.update({ where: { id: fx.resortId }, data: { showRatesToAgents: true } });
    await editor.save(agency, { headline: "Hill trips that work", whatsapp: "8801711000000" });
    await prisma.tourPackage.create({
      data: { agencyId: fx.agentId, name: "Srimangal weekend", days: 2, nights: 1, pax: 2, items: { create: [{ label: "Stay", qty: 1 as never, unitPrice: 9000 as never }] } },
    });
  });

  it("is nothing until it is published", async () => {
    expect(await publicSite().page(agencySlug)).toBeNull();
  });

  it("shows the agency, its resorts with their prices, and its tours", async () => {
    await editor.addPhoto(agency, await png(), "image/png", { alt: "Cover" });
    await editor.publish(agency, true);

    const page = (await publicSite().page(agencySlug))!;

    expect(page.agency.headline).toBe("Hill trips that work");
    expect(page.agency.whatsapp).toBe("8801711000000");
    expect(page.agency.photos).toHaveLength(1);
    expect(page.resorts[0]!.roomTypes[0]!.priceFrom).toBe(5000);
    expect(page.tours.map((t) => t.name)).toEqual(["Srimangal weekend"]);
  });

  it("leaves out a resort the agency hid", async () => {
    await editor.save(agency, { hiddenResortIds: [fx.resortId] });
    await editor.publish(agency, true);

    expect((await publicSite().page(agencySlug))!.resorts).toEqual([]);
  });

  it("is nothing once the plan no longer includes a website — one answer for every reason", async () => {
    await editor.publish(agency, true);
    await agencyOnPlanWith(["agency_api"]);

    expect(await publicSite().page(agencySlug)).toBeNull();
  });

  it("tells a stranger what is free at one of its resorts", async () => {
    await editor.publish(agency, true);

    const free = await publicSite().vacancy(agencySlug, resortSlug, day(3), day(5));

    expect(free).toEqual([expect.objectContaining({ key: "deluxe", free: 2, priceFrom: 5000 })]);
  });

  it("knows nothing about a resort the agency does not show", async () => {
    await editor.save(agency, { hiddenResortIds: [fx.resortId] });
    await editor.publish(agency, true);

    await expect(publicSite().vacancy(agencySlug, resortSlug, day(3), day(5))).rejects.toThrow(/No such/);
  });
});
