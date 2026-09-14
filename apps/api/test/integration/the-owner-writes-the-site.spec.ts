/**
 * The editor behind a resort's site (2026-09-14 design, §5.3).
 *
 * The published view is what a stranger reads; this is what the owner writes.
 * The two meet at one row, and almost every rule here exists because they are
 * not the same audience:
 *
 * A refusal here **names the plan**, because the owner needs to know what to
 * buy — the public page deliberately says nothing (see
 * `what-a-resort-publishes`).
 *
 * Publishing is **an act**, and unpublishing is one click: a resort must be
 * able to take its own front door down without asking the platform.
 *
 * And the address is the one thing on this screen that somebody else can
 * already be using.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { PrismaClient } from "@rh/db";
import { ROLE, SITE_TEMPLATES, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, scheduleOf, seedResort, type Fixture } from "../helpers/db";
import { DiskStore } from "../../src/site/disk-store";
import { UploadService } from "../../src/site/upload.service";
import { SiteEditorService } from "../../src/site/site-editor.service";
import { makePublishedSiteService } from "../helpers/services";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { AuditService } from "../../src/common/audit.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let root: string;
let editor: SiteEditorService;
let owner: JwtClaims;

const png = () =>
  sharp({ create: { width: 30, height: 20, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer();

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  root = mkdtempSync(join(tmpdir(), "rm-editor-"));
  editor = new SiteEditorService(
    asPrisma,
    new UploadService(asPrisma, new DiskStore(root)),
    new PermissionsService(asPrisma),
    new PlanLimitsService(asPrisma),
    new AuditService(asPrisma),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));
afterAll(async () => prisma.$disconnect());

/** Puts the resort's account on a plan that carries exactly these features. */
async function onPlanWith(features: string[]) {
  await prisma.platformPlan.update({ where: { name: "STARTER" }, data: { features: features as never } });
  await prisma.subscription.create({
    data: {
      accountId: fx.tenantId,
      plan: "STARTER",
      status: "ACTIVE",
      fee: 2500 as never,
      scheduleId: await scheduleOf(prisma as unknown as PrismaClient, "STARTER"),
      startedAt: new Date(),
      renewsAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

describe("opening the editor", () => {
  it("makes the row on the way in, so there is something to write on", async () => {
    const page = await editor.get(owner, fx.resortId);

    expect(page).toMatchObject({ published: false, template: SITE_TEMPLATES[0]!.key });
    expect(page.slug).toBe((await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug);
    expect(await prisma.resortSite.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("opens the same row the second time, not another one", async () => {
    await editor.get(owner, fx.resortId);
    await editor.get(owner, fx.resortId);

    expect(await prisma.resortSite.count({ where: { resortId: fx.resortId } })).toBe(1);
  });

  it("is not for somebody who cannot change the resort", async () => {
    const desk = { userId: fx.agentId, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };

    await expect(editor.get(desk, fx.resortId)).rejects.toMatchObject({ status: 403 });
  });
});

describe("writing it", () => {
  it("keeps the words and the look", async () => {
    await editor.save(owner, fx.resortId, {
      headline: "Tea gardens, ten minutes from town",
      intro: "Eight cottages on a hillside.",
      amenities: ["Wi-Fi", "Parking", "Breakfast"],
      template: SITE_TEMPLATES[1]!.key,
      themeColor: "#0f5132",
    });

    expect(await editor.get(owner, fx.resortId)).toMatchObject({
      headline: "Tea gardens, ten minutes from town",
      amenities: ["Wi-Fi", "Parking", "Breakfast"],
      template: SITE_TEMPLATES[1]!.key,
    });
  });

  it("refuses a template nobody wrote, rather than rendering nothing later", async () => {
    await expect(
      editor.save(owner, fx.resortId, { template: "from-a-blog-post" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps a map point only when it is a place on Earth", async () => {
    await editor.save(owner, fx.resortId, { mapLat: 24.3065, mapLng: 91.7296 });
    expect((await editor.get(owner, fx.resortId)).map).toEqual({ lat: 24.3065, lng: 91.7296 });

    await expect(editor.save(owner, fx.resortId, { mapLat: 999, mapLng: 0 })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("the address", () => {
  it("can be changed to one nobody is using", async () => {
    await editor.setSlug(owner, fx.resortId, "Hillside Retreat");

    expect((await editor.get(owner, fx.resortId)).slug).toBe("hillside-retreat");
  });

  it("will not take one another resort already answers at", async () => {
    const taken = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Taken", slug: "taken-address" },
    });

    await expect(editor.setSlug(owner, fx.resortId, "taken-address")).rejects.toMatchObject({
      status: 409,
    });
    expect((await prisma.resort.findUniqueOrThrow({ where: { id: taken.id } })).slug).toBe("taken-address");
  });

  it("is happy to be set to the one it already has", async () => {
    const mine = (await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug;

    await expect(editor.setSlug(owner, fx.resortId, mine)).resolves.toBeTruthy();
  });
});

describe("publishing", () => {
  it("needs a plan that includes a website, and says which plan it is on", async () => {
    await onPlanWith([]);

    await expect(editor.publish(owner, fx.resortId, true)).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/plan/i),
    });
  });

  it("goes live, and the public view can then see it", async () => {
    await onPlanWith(["website"]);

    await editor.publish(owner, fx.resortId, true);

    const slug = (await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } })).slug;
    expect(await makePublishedSiteService(asPrisma).resort(slug)).not.toBeNull();
  });

  /**
   * Taking it down must never need the plan: a resort that has stopped paying,
   * or simply changed its mind, has to be able to close its own front door.
   */
  it("comes down again without asking anybody, plan or no plan", async () => {
    await onPlanWith(["website"]);
    await editor.publish(owner, fx.resortId, true);
    await prisma.platformPlan.update({ where: { name: "STARTER" }, data: { features: [] as never } });

    await expect(editor.publish(owner, fx.resortId, false)).resolves.toBeTruthy();
    expect((await prisma.resortSite.findUniqueOrThrow({ where: { resortId: fx.resortId } })).published).toBe(false);
  });

  it("is written down, because it is the moment a business became visible", async () => {
    await onPlanWith(["website"]);

    await editor.publish(owner, fx.resortId, true);

    const log = await prisma.auditLog.findFirst({
      where: { resortId: fx.resortId, action: "site.publish" },
      orderBy: { id: "desc" },
    });
    expect(log).not.toBeNull();
  });
});

describe("the pictures", () => {
  it("adds one to the resort, and to a room type", async () => {
    const cover = await editor.addPhoto(owner, fx.resortId, await png(), "image/png", {});
    const room = await editor.addPhoto(owner, fx.resortId, await png(), "image/png", {
      roomTypeId: fx.roomTypeId,
      alt: "The bed",
    });

    const page = await editor.get(owner, fx.resortId);
    expect(page.photos.map((p) => p.id)).toEqual([cover.id, room.id]);
    expect(page.photos.find((p) => p.id === room.id)).toMatchObject({
      roomTypeId: fx.roomTypeId,
      alt: "The bed",
    });
  });

  it("will not hang a picture on another resort's room type", async () => {
    const other = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Next Door", slug: `next-door-${Date.now()}` },
    });
    const theirType = await prisma.roomType.create({
      data: { resortId: other.id, name: "Theirs", maxAdults: 2 },
    });

    await expect(
      editor.addPhoto(owner, fx.resortId, await png(), "image/png", { roomTypeId: theirType.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reorders them, and that is the order the site draws", async () => {
    const first = await editor.addPhoto(owner, fx.resortId, await png(), "image/png", {});
    const second = await editor.addPhoto(
      owner,
      fx.resortId,
      await sharp({ create: { width: 31, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer(),
      "image/png",
      {},
    );

    await editor.movePhoto(owner, fx.resortId, second.id, 0);

    expect((await editor.get(owner, fx.resortId)).photos.map((p) => p.id)).toEqual([second.id, first.id]);
  });

  it("removes one, file and row together", async () => {
    const photo = await editor.addPhoto(owner, fx.resortId, await png(), "image/png", {});

    await editor.removePhoto(owner, fx.resortId, photo.id);

    expect(await prisma.resortPhoto.count({ where: { resortId: fx.resortId } })).toBe(0);
    expect(await prisma.upload.count({ where: { resortId: fx.resortId } })).toBe(0);
  });

  it("refuses to remove a picture that is not this resort's", async () => {
    const other = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Next Door", slug: `nd-${Date.now()}` },
    });
    const theirs = await editor.addPhoto(
      { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] },
      other.id,
      await png(),
      "image/png",
      {},
    );

    await expect(editor.removePhoto(owner, fx.resortId, theirs.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.resortPhoto.count({ where: { resortId: other.id } })).toBe(1);
  });
});
