/**
 * `agency` is not an address a resort can have (2026-09-17).
 *
 * A resort's public page lives at `/site/<slug>` and an agency's at
 * `/site/agency/<slug>`. A resort called "agency" would make
 * `/site/agency/vacancy` mean two things — that resort's vacancy, or an agency
 * called "vacancy" — and whichever route won, somebody's page would be wrong.
 * So the word is reserved: a new resort is numbered past it, and an owner
 * choosing it is told no.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { RESERVED_RESORT_SLUGS, ROLE } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { uniqueResortSlug } from "../../src/common/resort-slug";
import { SiteEditorService } from "../../src/site/site-editor.service";
import { UploadService } from "../../src/site/upload.service";
import { DiskStore } from "../../src/site/disk-store";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { AuditService } from "../../src/common/audit.service";
import { SiteCacheService } from "../../src/site/site-cache.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});
afterAll(async () => prisma.$disconnect());

describe("the reserved word", () => {
  it("is declared once", () => {
    expect(RESERVED_RESORT_SLUGS).toContain("agency");
  });

  it("is skipped when a resort is named that", async () => {
    expect(await uniqueResortSlug(asPrisma, "Agency")).toBe("agency-2");
  });

  it("is refused when an owner picks it", async () => {
    await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
    const editor = new SiteEditorService(
      asPrisma,
      new UploadService(asPrisma, new DiskStore(".")),
      new PermissionsService(asPrisma),
      new PlanLimitsService(asPrisma),
      new AuditService(asPrisma),
      new SiteCacheService(),
    );
    await expect(
      editor.setSlug({ userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] }, fx.resortId, "Agency"),
    ).rejects.toThrow(/reserved/);
  });
});
