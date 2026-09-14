/**
 * The key a resort's own website holds (2026-09-15 design, §3).
 *
 * A key is the whole of the public API: whoever has one is the resort, as far
 * as `/v1` is concerned. So every rule below is about keeping that true —
 * shown once, stored as a hash, scoped to what the integration actually needs,
 * revocable the same second, and belonging to exactly one resort.
 *
 * The scopes matter more than they look. Most integrations only read — a site
 * that shows what is free and prints a phone number — and a key like that
 * reaching the booking table is the difference between a compromised WordPress
 * plugin being embarrassing and being expensive.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, scheduleOf, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import { ApiKeyService } from "../../src/v1/api-key.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let owner: JwtClaims;
let keys: ApiKeyService;

const platform = () =>
  makePlatformService(asPrisma) as unknown as {
    createApiKey(c: JwtClaims, resortId: number, name: string, scopes?: string[]): Promise<{ id: string; secret: string; prefix: string; scopes: string[] }>;
    listApiKeys(c: JwtClaims, resortId: number): Promise<{ id: unknown; prefix: string; active: boolean }[]>;
    revokeApiKey(c: JwtClaims, id: number): Promise<unknown>;
  };

/** Puts the resort's account on a plan carrying exactly these features. */
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

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({ where: { id: fx.managerId }, data: { role: "RESORT_ADMIN" } });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  keys = new ApiKeyService(asPrisma);
});

afterAll(async () => prisma.$disconnect());

describe("minting one", () => {
  it("hands back a secret once, and keeps only its hash", async () => {
    const made = await platform().createApiKey(owner, fx.resortId, "Our website");

    expect(made.secret).toMatch(/^rm_live_[a-z0-9]+_[a-f0-9]{32}$/);
    const row = await prisma.apiKey.findFirstOrThrow({ where: { resortId: fx.resortId } });
    expect(row.keyHash).not.toContain(made.secret);
    expect(row.keyHash).toHaveLength(64);
  });

  it("never shows the secret again", async () => {
    await platform().createApiKey(owner, fx.resortId, "Our website");

    const listed = await platform().listApiKeys(owner, fx.resortId);

    // every value on every row, rather than a serialisation — `id` is a BigInt
    // and JSON.stringify refuses one outside the app, where `main.ts` patches it
    const values = listed.flatMap((row) => Object.values(row).map((v) => String(v)));
    expect(values.some((v) => /rm_live_[a-z0-9]+_[a-f0-9]{32}/.test(v))).toBe(false);
    expect(Object.keys(listed[0]!)).not.toContain("secret");
    expect(Object.keys(listed[0]!)).not.toContain("keyHash");
  });

  /**
   * The feature and its door arrive together, as `website` did. A screen that
   * mints a key opening nothing is a lie told to a customer — and so is one
   * that refuses a key for a plan that includes the API.
   */
  it("needs a plan that includes the API, and names it when refusing", async () => {
    await onPlanWith([]);

    await expect(platform().createApiKey(owner, fx.resortId, "Our website")).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/plan/i),
    });
  });

  it("is allowed once the plan includes it", async () => {
    await onPlanWith(["public_api"]);

    await expect(platform().createApiKey(owner, fx.resortId, "Our website")).resolves.toBeTruthy();
  });

  it("reads only, unless the owner asks for more", async () => {
    const readOnly = await platform().createApiKey(owner, fx.resortId, "Shows availability");
    const canWrite = await platform().createApiKey(owner, fx.resortId, "Takes bookings", ["read", "write"]);

    expect(readOnly.scopes).toEqual(["read"]);
    expect(canWrite.scopes).toEqual(["read", "write"]);
  });

  it("refuses a scope nobody wrote", async () => {
    await expect(
      platform().createApiKey(owner, fx.resortId, "Everything", ["read", "delete-the-database"]),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("using one", () => {
  const secretFor = async (scopes?: string[]) =>
    (await platform().createApiKey(owner, fx.resortId, "Our website", scopes)).secret;

  it("names the resort it belongs to", async () => {
    const secret = await secretFor();

    const caller = await keys.authenticate(secret);

    expect(caller).toMatchObject({ resortId: fx.resortId, scopes: ["read"] });
  });

  it("is nobody when the secret is wrong, missing, or shaped like nonsense", async () => {
    await secretFor();

    for (const bad of ["", "rm_live_nope_00000000000000000000000000000000", "Bearer something", "x"]) {
      expect(await keys.authenticate(bad)).toBeNull();
    }
  });

  /**
   * A key differing from a real one only in its secret half must not be let in
   * by a lookup that matched on the prefix and forgot to check the rest.
   */
  it("is nobody when the prefix is right and the secret is not", async () => {
    const secret = await secretFor();
    const prefix = secret.split("_")[2];

    expect(await keys.authenticate(`rm_live_${prefix}_${"0".repeat(32)}`)).toBeNull();
  });

  it("is nobody the moment it is revoked", async () => {
    const secret = await secretFor();
    const [row] = await platform().listApiKeys(owner, fx.resortId);
    expect(await keys.authenticate(secret)).not.toBeNull();

    await platform().revokeApiKey(owner, Number(row!.id));

    expect(await keys.authenticate(secret)).toBeNull();
  });

  it("remembers when it was last used, without writing on every request", async () => {
    const secret = await secretFor();

    await keys.authenticate(secret);
    const first = (await prisma.apiKey.findFirstOrThrow({ where: { resortId: fx.resortId } })).lastUsedAt;
    expect(first).not.toBeNull();

    await keys.authenticate(secret);
    const second = (await prisma.apiKey.findFirstOrThrow({ where: { resortId: fx.resortId } })).lastUsedAt;
    expect(second?.getTime()).toBe(first?.getTime());
  });
});

describe("what a key may do", () => {
  it("lets a writing key write and a reading key not", async () => {
    const read = await keys.authenticate((await platform().createApiKey(owner, fx.resortId, "r")).secret);
    const write = await keys.authenticate(
      (await platform().createApiKey(owner, fx.resortId, "w", ["read", "write"])).secret,
    );

    expect(keys.may(read!, "read")).toBe(true);
    expect(keys.may(read!, "write")).toBe(false);
    expect(keys.may(write!, "write")).toBe(true);
  });

  /**
   * Every key that existed before scopes has none stored. Reading is the safe
   * reading of nothing — the alternative is a silent upgrade to write.
   */
  it("treats a key from before scopes as read-only", async () => {
    const secret = (await platform().createApiKey(owner, fx.resortId, "old")).secret;
    await prisma.apiKey.updateMany({ where: { resortId: fx.resortId }, data: { scopes: undefined } });
    await prisma.$executeRawUnsafe("UPDATE api_keys SET scopes = NULL WHERE resortId = ?", fx.resortId);

    const caller = await keys.authenticate(secret);

    expect(caller!.scopes).toEqual(["read"]);
    expect(keys.may(caller!, "write")).toBe(false);
  });
});
