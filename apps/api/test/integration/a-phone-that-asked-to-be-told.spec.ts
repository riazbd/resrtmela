/**
 * A phone that asked to be told things (phase 4, task 3).
 *
 * The only schema change the whole mobile project makes, which is why it
 * waited until last. It adds a table and alters no column, so nothing
 * running can be broken by applying it.
 *
 * Two rules do the work, and the second is the one that matters:
 *
 *   - the same device signing in twice is **one row**, moved to whoever
 *     signed in — two rows would keep pushing the first person's resort
 *     at whoever is holding the phone now;
 *   - signing out **deletes** it. A phone that is sold, lent or handed to
 *     a new clerk must stop receiving, and the only moment anyone can
 *     know it has left somebody's hands is the moment they sign out.
 *
 * Who an event reaches is asked of the permission matrix, per person,
 * every time — not cached and not inferred from a role. A clerk whose
 * permissions were narrowed this morning stops being told this
 * afternoon, and nothing else in the system knows that.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { PushService } from "../../src/notifications/push.service";
import { PermissionsService } from "../../src/common/permissions";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const push = () => new PushService(asPrisma, new PermissionsService(asPrisma));

let fx: Fixture;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const tokens = () => prisma.deviceToken.findMany({ select: { userId: true, token: true } });

describe("remembering a device", () => {
  it("keeps the token it was given", async () => {
    await push().register(fx.managerId, "ExponentPushToken[aaa]", "android");
    expect(await tokens()).toEqual([
      { userId: fx.managerId, token: "ExponentPushToken[aaa]" },
    ]);
  });

  it("does not make a second row when the same phone signs in again", async () => {
    await push().register(fx.managerId, "ExponentPushToken[aaa]", "android");
    await push().register(fx.managerId, "ExponentPushToken[aaa]", "android");
    expect(await tokens()).toHaveLength(1);
  });

  /**
   * The row moves rather than multiplying. Two rows here is one phone
   * receiving two resorts' bookings, which is the fault this table
   * exists to make impossible.
   */
  it("moves the phone to whoever signed in on it", async () => {
    await push().register(fx.managerId, "ExponentPushToken[aaa]", "android");
    await push().register(fx.agentId, "ExponentPushToken[aaa]", "android");
    expect(await tokens()).toEqual([{ userId: fx.agentId, token: "ExponentPushToken[aaa]" }]);
  });
});

describe("forgetting one", () => {
  it("drops the row on sign-out", async () => {
    await push().register(fx.managerId, "ExponentPushToken[aaa]", "android");
    await push().forget(fx.managerId, "ExponentPushToken[aaa]");
    expect(await tokens()).toEqual([]);
  });

  /** Somebody else's device is not theirs to unregister. */
  it("forgets only this person's own token", async () => {
    await push().register(fx.agentId, "ExponentPushToken[bbb]", "android");
    await push().forget(fx.managerId, "ExponentPushToken[bbb]");
    expect(await tokens()).toHaveLength(1);
  });

  it("leaves a device that never registered alone", async () => {
    await expect(push().forget(fx.managerId, "ExponentPushToken[nope]")).resolves.toEqual({
      ok: true,
    });
  });
});

/**
 * The send itself is mocked at `fetch`: this is about who is chosen, not
 * about Expo's wire format.
 */
describe("who an event reaches", () => {
  const sent = () => {
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    if (calls.length === 0) return [];
    const body = JSON.parse(String(calls[0][1]?.body ?? "[]")) as { to: string }[];
    return body.map((m) => m.to).sort();
  };

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
  });

  it("reaches the resort's own staff", async () => {
    await push().register(fx.managerId, "ExponentPushToken[mgr]", "android");
    await push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" });
    expect(sent()).toEqual(["ExponentPushToken[mgr]"]);
  });

  /**
   * The person who took the booking watched it happen. Their own phone
   * buzzing in their hand a second later is noise, and noise is how
   * notifications get turned off.
   */
  it("does not tell the person who did the thing", async () => {
    await push().register(fx.managerId, "ExponentPushToken[mgr]", "android");
    await push().toResort(
      fx.resortId,
      "booking.created",
      { title: "t", body: "b" },
      { exceptUserId: fx.managerId },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  /**
   * The fault worth a test of its own: one resort's trade arriving on
   * another resort's phone.
   */
  it("does not reach somebody who does not work at that resort", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await push().register(other.managerId, "ExponentPushToken[other]", "android");
    await push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" });
    expect(sent()).not.toContain("ExponentPushToken[other]");
  });

  it("says nothing at all when nobody has a device", async () => {
    await push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  /**
   * A booking that is already in the database must not be lost to
   * something downstream of it.
   */
  it("swallows a refusal from Expo rather than failing the booking", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network is down"));
    await push().register(fx.managerId, "ExponentPushToken[mgr]", "android");
    await expect(
      push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" }),
    ).resolves.toBeUndefined();
  });
});

/**
 * A token Expo says is dead is deleted on the spot. Otherwise every send
 * carries the same corpses forever and the batch limit goes on phones
 * that were wiped months ago.
 */
describe("a token Expo no longer knows", () => {
  it("is dropped when Expo says so", async () => {
    await push().register(fx.managerId, "ExponentPushToken[gone]", "android");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
        { status: 200 },
      ),
    );
    await push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" });
    expect(await tokens()).toEqual([]);
  });

  it("is kept when Expo merely had a bad minute", async () => {
    await push().register(fx.managerId, "ExponentPushToken[fine]", "android");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 502 }));
    await push().toResort(fx.resortId, "booking.created", { title: "t", body: "b" });
    expect(await tokens()).toHaveLength(1);
  });
});
