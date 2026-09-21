/**
 * An old app is refused (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store. Staff download the APK
 * from the website, so nothing updates anybody and no store enforces a
 * floor — a phone installed in September goes on calling this API for
 * as long as it is switched on, against routes that have moved and
 * money arithmetic that has been corrected since.
 *
 * So the floor is here, and these are the things that would make it
 * useless:
 *
 *   - **applying it to some routes and not others.** A floor with one
 *     door left open is not a floor, which is why the guard is global.
 *   - **blocking the route that explains the block.** A stopped phone
 *     has to be able to ask where the new build is.
 *   - **blocking the console.** The console sends no version header,
 *     and neither do the smoke scripts; refusing everything that cannot
 *     identify itself would take the desk down to catch a phone.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import {
  APP_VERSION_HEADER,
  appStanding,
  UPGRADE_REQUIRED,
} from "@rh/shared";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { PlatformSettingsService } from "../../src/common/platform-settings.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { AppReleaseService, AppVersionGuard, isAlwaysOpen } from "../../src/common/app-release";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
const db = () => prisma as unknown as PrismaClient;

let fx: Fixture;

/** A guard reading a settings service that reads this test's database. */
function guard() {
  const release = new AppReleaseService(new PlatformSettingsService(asPrismaService));
  return { guard: new AppVersionGuard(release), release };
}

/** The slice of an ExecutionContext the guard actually touches. */
const asking = (path: string, version?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        header: (name: string) =>
          name.toLowerCase() === APP_VERSION_HEADER && version ? version : undefined,
      }),
    }),
  }) as never;

const setFloor = async (minimum: string, latest: string) => {
  for (const [key, value] of [
    ["app.minimumVersion", minimum],
    ["app.latestVersion", latest],
  ] as const) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
};

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  void fx;
  await setFloor("0.6.0", "0.7.0");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a build below the floor", () => {
  it("is refused with Upgrade Required, not Unauthorized", async () => {
    const { guard: g } = guard();
    await expect(g.canActivate(asking("/resorts/1/today", "0.5.0"))).rejects.toMatchObject({
      status: UPGRADE_REQUIRED,
    });
  });

  /** The sentence names the version to reach, because "too old" is not an instruction. */
  it("is told which version to get", async () => {
    const { guard: g } = guard();
    await expect(g.canActivate(asking("/bookings", "0.5.0"))).rejects.toThrow(/0\.7\.0/);
  });

  /**
   * A floor applied to nineteen controllers out of twenty is a floor
   * with a door in it, so the guard is global and this asks the same
   * question of a handful of unrelated paths.
   */
  it("is refused on every route, not a chosen few", async () => {
    const { guard: g } = guard();
    for (const path of ["/auth/login", "/bookings", "/resorts/1/day-sheet", "/agent/guests"]) {
      await expect(
        g.canActivate(asking(path, "0.5.0")),
        `${path} let an old build through`,
      ).rejects.toMatchObject({ status: UPGRADE_REQUIRED });
    }
  });
});

describe("what the floor never touches", () => {
  /** A gate that blocks the route explaining the gate is a gate nobody gets past. */
  it("lets a blocked build ask where the new one is", async () => {
    const { guard: g } = guard();
    await expect(g.canActivate(asking("/app/release", "0.1.0"))).resolves.toBe(true);
    expect(isAlwaysOpen("/app/release")).toBe(true);
    expect(isAlwaysOpen("/health")).toBe(true);
  });

  /**
   * The console sends no version header, and neither does a smoke
   * script. Refusing what cannot identify itself would take the desk
   * down to catch a phone.
   */
  it("lets a caller through that did not say what it is", async () => {
    const { guard: g } = guard();
    await expect(g.canActivate(asking("/bookings"))).resolves.toBe(true);
  });

  it("lets the floor itself through, and everything above it", async () => {
    const { guard: g } = guard();
    for (const version of ["0.6.0", "0.6.9", "0.7.0", "1.0.0"]) {
      await expect(
        g.canActivate(asking("/bookings", version)),
        `${version} was refused`,
      ).resolves.toBe(true);
    }
  });
});

describe("the floor is the owner's to move", () => {
  it("starts at nothing, so shipping it locks nobody out", async () => {
    // the defaults, with no row written
    await prisma.platformSetting.deleteMany({ where: { key: { startsWith: "app." } } });
    const { guard: g, release } = guard();
    const now = await release.current();
    expect(now.minimum).toBe("0.0.0");
    await expect(g.canActivate(asking("/bookings", "0.1.0"))).resolves.toBe(true);
  });

  it("refuses more the moment it is raised, with no deploy", async () => {
    const { guard: g } = guard();
    await expect(g.canActivate(asking("/bookings", "0.6.5"))).resolves.toBe(true);

    await setFloor("0.7.0", "0.7.0");
    // the settings cache is 30s, so a fresh service is the honest way to
    // ask "what would the next process see"
    const { guard: after } = guard();
    await expect(after.canActivate(asking("/bookings", "0.6.5"))).rejects.toMatchObject({
      status: UPGRADE_REQUIRED,
    });
  });

  /** Empty means "the console's own page", which moves with the deployment. */
  it("falls back to the console's download page", async () => {
    const { release } = guard();
    const now = await release.current();
    expect(now.downloadUrl).toMatch(/\/app$/);
  });

  /**
   * The file and the page are two addresses.
   *
   * Conflating them made the download page's own button link to the
   * page it was already on — found by opening it in a browser, which
   * a 200 would never have shown.
   */
  it("keeps the APK apart from the page that explains it", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "app.apkUrl" },
      create: { key: "app.apkUrl", value: "https://cdn.example.com/rm-0.7.0.apk" },
      update: { value: "https://cdn.example.com/rm-0.7.0.apk" },
    });
    const now = await guard().release.current();
    expect(now.apkUrl).toBe("https://cdn.example.com/rm-0.7.0.apk");
    // the phone is still sent to the page, which carries the install steps
    expect(now.downloadUrl).toMatch(/\/app$/);
  });

  it("has no APK address until somebody uploads one", async () => {
    expect((await guard().release.current()).apkUrl).toBe("");
  });

  it("uses an address the owner set instead", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "app.downloadUrl" },
      create: { key: "app.downloadUrl", value: "https://cdn.example.com/rm.apk" },
      update: { value: "https://cdn.example.com/rm.apk" },
    });
    const { release } = guard();
    expect((await release.current()).downloadUrl).toBe("https://cdn.example.com/rm.apk");
  });
});

describe("the server and the phone judge alike", () => {
  /**
   * The phone decides whether to show an update line; the server
   * decides whether to answer at all. Both call `appStanding` on the
   * same two numbers, so a person cannot be told "you are fine" by one
   * and refused by the other.
   */
  it("agrees with the rule the app runs", async () => {
    const { release } = guard();
    const now = await release.current();
    expect(appStanding("0.5.0", now)).toBe("blocked");
    expect(appStanding("0.6.0", now)).toBe("update");
    expect(appStanding("0.7.0", now)).toBe("current");
  });
});
