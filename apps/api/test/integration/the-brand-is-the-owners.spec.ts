/**
 * The brand belongs to the owner, not to the repository.
 *
 * What the platform is called, the icon in the browser tab and the logo on
 * every screen are CMS rows, so they change from Platform → Website CMS
 * without a deploy. The image travels as a `data:` URL, which means this is
 * also the door a large or hostile file would come through — so the rules
 * about what may be stored are proved here.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;
let admin: JwtClaims;

const platform = () =>
  makePlatformService(asPrisma) as unknown as {
    putCms(c: JwtClaims, key: string, value: string): Promise<unknown>;
    publicBrand(): Promise<{ name: string | null; icon: string | null; logo: string | null }>;
  };

// a one-pixel PNG, the smallest honest image there is
const PNG = `data:image/png;base64,${Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
).toString("base64")}`;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("setting the platform's brand", () => {
  it("keeps the name and the icon, and hands them to every page", async () => {
    await platform().putCms(superAdmin, "brand.name", "Hotel Haat");
    await platform().putCms(superAdmin, "brand.icon", PNG);

    expect(await platform().publicBrand()).toEqual({ name: "Hotel Haat", icon: PNG, logo: null });
  });

  it("says nothing is set until something is", async () => {
    expect(await platform().publicBrand()).toEqual({ name: null, icon: null, logo: null });
  });

  it("goes back to the built-in mark when the row is emptied", async () => {
    await platform().putCms(superAdmin, "brand.icon", PNG);

    await platform().putCms(superAdmin, "brand.icon", "");

    expect((await platform().publicBrand()).icon).toBeNull();
  });

  it("takes a link to an image already on the web", async () => {
    await platform().putCms(superAdmin, "brand.logo", "https://cdn.example/logo.svg");

    expect((await platform().publicBrand()).logo).toBe("https://cdn.example/logo.svg");
  });

  it("is the platform owner's alone", async () => {
    await expect(platform().putCms(admin, "brand.name", "Mine Now")).rejects.toMatchObject({ status: 403 });
  });
});

describe("what the brand will not accept", () => {
  const refuses = (value: string, key = "brand.icon") =>
    expect(platform().putCms(superAdmin, key, value)).rejects.toMatchObject({ status: 400 });

  it("refuses a file that is not an image", async () => {
    await refuses(`data:application/pdf;base64,${Buffer.from("%PDF-1.4").toString("base64")}`);
  });

  it("refuses something that is not a file or a link at all", async () => {
    await refuses("javascript:alert(1)");
    await refuses("/etc/passwd");
  });

  it("refuses an SVG carrying a script, which an inline render would run", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/steal")</script></svg>';
    await refuses(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  });

  it("refuses an image too large to be a favicon", async () => {
    const big = `data:image/png;base64,${"A".repeat(100 * 1024)}`;
    await refuses(big);
  });

  it("refuses a name longer than a name", async () => {
    await refuses("x".repeat(61), "brand.name");
  });

  it("still refuses a wall of text on an ordinary CMS row", async () => {
    await expect(platform().putCms(superAdmin, "hero.title", "x".repeat(9000))).rejects.toMatchObject({ status: 400 });
  });
});
