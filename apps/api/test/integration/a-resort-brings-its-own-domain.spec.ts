/**
 * Claiming a domain (2026-09-15 design).
 *
 * The rule that matters most here is not about correctness, it is about who
 * gets a certificate. Provisioning asks a certificate authority for a
 * certificate in a name, so a row nobody proved is a certificate issued to
 * whoever typed fastest — and, once DNS moves, one customer's site served at
 * another's address.
 *
 * So: a domain is claimed by proving control of its DNS, nothing is provisioned
 * before that, and nothing resolves before it is provisioned. Every test below
 * is one of those three sentences.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { DNS_PREFIX, ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { ResortDomainService } from "../../src/site/resort-domain.service";
import { PermissionsService } from "../../src/common/permissions";
import { AuditService } from "../../src/common/audit.service";
import { SiteCacheService } from "../../src/site/site-cache.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let domains: ResortDomainService;

/** What the world's DNS says, as far as this test is concerned. */
let zone: Record<string, string[][]>;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  zone = {};
  domains = new ResortDomainService(
    asPrisma,
    new PermissionsService(asPrisma),
    new AuditService(asPrisma),
    new SiteCacheService(),
    // the resolver is a port so a test can say what the world's DNS holds
    async (name: string) => zone[name] ?? [],
  );
});

afterAll(async () => prisma.$disconnect());

/** Put the proof where the service will look for it. */
const proveIt = (host: string, token: string) => {
  zone[`${DNS_PREFIX}.${host}`] = [[token]];
};

describe("claiming one", () => {
  it("hands back the record the owner has to add", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "SkyEcoResort.com");

    expect(claimed).toMatchObject({
      host: "skyecoresort.com",
      verifiedAt: null,
      record: { type: "TXT", name: "_resortmela.skyecoresort.com" },
    });
    expect(claimed.record.value).toHaveLength(32);
  });

  it("refuses a name no certificate could be issued for, before anybody waits", async () => {
    for (const bad of ["localhost", "not a domain", "194.163.191.50"]) {
      await expect(domains.claim(owner, fx.resortId, bad)).rejects.toMatchObject({ status: 400 });
    }
    expect(await prisma.resortDomain.count()).toBe(0);
  });

  /**
   * Two resorts answering at one name has no correct resolution, so the second
   * one is told rather than queued behind a unique-constraint error.
   */
  it("refuses a domain another resort has already claimed", async () => {
    const other = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Next Door", slug: `nd-${Date.now()}` },
    });
    await domains.claim(
      { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] },
      other.id,
      "skyecoresort.com",
    );

    await expect(domains.claim(owner, fx.resortId, "skyecoresort.com")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("is happy to be claimed twice by the resort that already has it", async () => {
    const first = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    const again = await domains.claim(owner, fx.resortId, "skyecoresort.com");

    expect(again.id).toBe(first.id);
    expect(await prisma.resortDomain.count()).toBe(1);
  });

  it("is not for somebody who cannot change the resort", async () => {
    const desk = { userId: fx.agentId, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] };
    await expect(domains.claim(desk, fx.resortId, "skyecoresort.com")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("proving it", () => {
  it("is verified once the record is there", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", claimed.record.value);

    const checked = await domains.verify(owner, fx.resortId, claimed.id);

    expect(checked.verifiedAt).not.toBeNull();
  });

  it("is not verified while the record is missing, and says what to add", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");

    await expect(domains.verify(owner, fx.resortId, claimed.id)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/TXT|record/i),
    });
    expect((await prisma.resortDomain.findUniqueOrThrow({ where: { id: claimed.id } })).verifiedAt).toBeNull();
  });

  /**
   * Somebody else's token in our zone proves nothing, and a token of ours in
   * somebody else's zone is the interesting case: it must be the *right* token
   * for *this* claim.
   */
  it("is not verified by a record holding the wrong token", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", "a-token-from-somewhere-else");

    await expect(domains.verify(owner, fx.resortId, claimed.id)).rejects.toMatchObject({ status: 400 });
  });

  it("finds the token among the other records a zone already holds", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    zone[`${DNS_PREFIX}.skyecoresort.com`] = [["v=spf1 -all"], ["something-else"], [claimed.record.value]];

    await expect(domains.verify(owner, fx.resortId, claimed.id)).resolves.toBeTruthy();
  });

  it("stays quiet when DNS itself is unreachable, rather than calling it a failure", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    domains = new ResortDomainService(
      asPrisma,
      new PermissionsService(asPrisma),
      new AuditService(asPrisma),
      new SiteCacheService(),
      async () => {
        throw new Error("ESERVFAIL");
      },
    );

    await expect(domains.verify(owner, fx.resortId, claimed.id)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/could not|not yet|check/i),
    });
  });
});

describe("what answers at a host", () => {
  /** The question the middleware asks on every request at an unfamiliar host. */
  it("is nothing at all until the domain is verified", async () => {
    await domains.claim(owner, fx.resortId, "skyecoresort.com");

    expect(await domains.byHost("skyecoresort.com")).toBeNull();
  });

  it("is the resort's address once it is verified", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", claimed.record.value);
    await domains.verify(owner, fx.resortId, claimed.id);

    const resort = await prisma.resort.findUniqueOrThrow({ where: { id: fx.resortId } });
    expect(await domains.byHost("SkyEcoResort.com:443")).toEqual({ kind: "resort", slug: resort.slug });
  });

  it("is nothing for a host nobody claimed", async () => {
    expect(await domains.byHost("someone-elses.example")).toBeNull();
    expect(await domains.byHost("not a host")).toBeNull();
  });

  it("is nothing once the domain is given up", async () => {
    const claimed = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", claimed.record.value);
    await domains.verify(owner, fx.resortId, claimed.id);

    await domains.remove(owner, fx.resortId, claimed.id);

    expect(await domains.byHost("skyecoresort.com")).toBeNull();
  });
});

describe("the one that counts as the address", () => {
  it("is the first verified domain, without anybody choosing", async () => {
    const a = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", a.record.value);
    await domains.verify(owner, fx.resortId, a.id);

    expect((await prisma.resortDomain.findUniqueOrThrow({ where: { id: a.id } })).canonical).toBe(true);
  });

  it("moves when the owner says so, and only one ever holds it", async () => {
    const a = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", a.record.value);
    await domains.verify(owner, fx.resortId, a.id);
    const b = await domains.claim(owner, fx.resortId, "www.skyecoresort.com");
    proveIt("www.skyecoresort.com", b.record.value);
    await domains.verify(owner, fx.resortId, b.id);

    await domains.setCanonical(owner, fx.resortId, b.id);

    const rows = await prisma.resortDomain.findMany({ where: { resortId: fx.resortId } });
    expect(rows.filter((r) => r.canonical).map((r) => r.id)).toEqual([b.id]);
  });

  it("cannot be given to a domain nobody has proved", async () => {
    const a = await domains.claim(owner, fx.resortId, "skyecoresort.com");

    await expect(domains.setCanonical(owner, fx.resortId, a.id)).rejects.toMatchObject({ status: 400 });
  });
});

describe("the list the owner reads", () => {
  it("says which state each domain is in, and what is still needed", async () => {
    const waiting = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    const done = await domains.claim(owner, fx.resortId, "www.skyecoresort.com");
    proveIt("www.skyecoresort.com", done.record.value);
    await domains.verify(owner, fx.resortId, done.id);

    const list = await domains.list(owner, fx.resortId);

    expect(list.find((d) => d.id === waiting.id)).toMatchObject({
      state: "WAITING_FOR_DNS",
      record: { name: "_resortmela.skyecoresort.com" },
    });
    expect(list.find((d) => d.id === done.id)).toMatchObject({ state: "WAITING_FOR_US" });
  });

  it("calls a provisioned domain live", async () => {
    const d = await domains.claim(owner, fx.resortId, "skyecoresort.com");
    proveIt("skyecoresort.com", d.record.value);
    await domains.verify(owner, fx.resortId, d.id);
    await prisma.resortDomain.update({ where: { id: d.id }, data: { provisionedAt: new Date() } });

    expect((await domains.list(owner, fx.resortId))[0]).toMatchObject({ state: "LIVE" });
  });

  it("belongs to this resort and no other", async () => {
    const other = await prisma.resort.create({
      data: { tenantId: fx.tenantId, name: "Next Door", slug: `nd2-${Date.now()}` },
    });
    await domains.claim(
      { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] },
      other.id,
      "elsewhere.example",
    );

    expect(await domains.list(owner, fx.resortId)).toEqual([]);
  });
});
