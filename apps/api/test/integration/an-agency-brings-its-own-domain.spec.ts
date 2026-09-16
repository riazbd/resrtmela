/**
 * An agency's own domain (2026-09-17 design, §5).
 *
 * The resort's flow unchanged — claim, a TXT record, verify, the operator
 * script gives it a certificate — with the owner being an agency account, and
 * the lookup saying which kind of page to draw. A domain is one owner's: a
 * resort and an agency cannot both hold the same name.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { DNS_PREFIX, ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { ResortDomainService } from "../../src/site/resort-domain.service";
import { PermissionsService } from "../../src/common/permissions";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { AuditService } from "../../src/common/audit.service";
import { SiteCacheService } from "../../src/site/site-cache.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;
let domains: ResortDomainService;
let zone: Record<string, string[][]>;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  zone = {};
  domains = new ResortDomainService(
    asPrisma,
    new PermissionsService(asPrisma),
    new AuditService(asPrisma),
    new SiteCacheService(),
    async (name: string) => zone[name] ?? [],
    new PlanLimitsService(asPrisma),
  );
});

afterAll(async () => prisma.$disconnect());

const proveIt = (host: string, token: string) => {
  zone[`${DNS_PREFIX}.${host}`] = [[token]];
};

describe("an agency claiming a domain", () => {
  it("gets the record to add, and the domain belongs to its account", async () => {
    const claimed = await domains.claimForAgency(agency, "SeaBreezeTravels.com");

    expect(claimed).toMatchObject({ host: "seabreezetravels.com", state: "WAITING_FOR_DNS" });
    const row = await prisma.resortDomain.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row.accountId).toBe(fx.agencyId);
    expect(row.resortId).toBeNull();
    expect(await domains.listForAgency(agency)).toHaveLength(1);
  });

  it("verifies it, makes the first one the main address, and the lookup names an agency page", async () => {
    const claimed = await domains.claimForAgency(agency, "seabreezetravels.com");
    proveIt("seabreezetravels.com", claimed.record.value);

    const verified = await domains.verifyForAgency(agency, claimed.id);

    expect(verified).toMatchObject({ state: "WAITING_FOR_US", canonical: true });
    const account = await prisma.tenant.findUniqueOrThrow({ where: { id: fx.agencyId } });
    expect(await domains.byHost("seabreezetravels.com")).toEqual({ kind: "agency", slug: account.slug });
  });

  it("gives it up", async () => {
    const claimed = await domains.claimForAgency(agency, "seabreezetravels.com");
    await domains.removeForAgency(agency, claimed.id);
    expect(await domains.listForAgency(agency)).toEqual([]);
  });

  it("cannot take a name a resort already holds, nor a resort an agency's", async () => {
    await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
    const owner: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
    await domains.claim(owner, fx.resortId, "skyecoresort.com");
    await expect(domains.claimForAgency(agency, "skyecoresort.com")).rejects.toThrow(/already/);

    await domains.claimForAgency(agency, "seabreezetravels.com");
    await expect(domains.claim(owner, fx.resortId, "seabreezetravels.com")).rejects.toThrow(/already/);
  });

  it("needs the agency's plan to include a website", async () => {
    await prisma.platformPlan.create({
      data: { name: "AG_B", label: "Agency Basic", maxRooms: 0, maxResorts: 0, maxStaff: 3, trialDays: 0, active: true, sortOrder: 1, audience: "AGENCY", features: [] as never },
    });
    await prisma.subscription.create({ data: { accountId: fx.agencyId, plan: "AG_B", status: "ACTIVE", fee: 0 as never } });

    await expect(domains.claimForAgency(agency, "seabreezetravels.com")).rejects.toThrow(/Agency Basic.*website/);
  });

  it("cannot touch a resort's domain by id", async () => {
    await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
    const owner: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
    const theirs = await domains.claim(owner, fx.resortId, "skyecoresort.com");

    await expect(domains.removeForAgency(agency, theirs.id)).rejects.toThrow(/No such domain/);
  });
});

describe("the lookup for a resort's domain", () => {
  it("names a resort page", async () => {
    await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
    const owner: JwtClaims = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", claimed.record.value);
    await domains.verify(owner, fx.resortId, claimed.id);

    const resort = await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } });
    expect(await domains.byHost("skyecoresort.com")).toEqual({ kind: "resort", slug: resort.slug });
  });
});
