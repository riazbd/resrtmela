/**
 * An agency can be suspended by the platform, and let back in.
 *
 * Reported as "platform theke agent manage kora jai na", and the asymmetry is
 * exact. Suspension is the one thing that cannot be shared between the two
 * customers: a resort owner is held by suspending its resorts, an agency by
 * suspending its account row. `PATCH /platform/resorts/:id/status` covers the
 * first. Nothing covered the second.
 *
 * Which left the billing sweep able to suspend an agency automatically —
 * `selling-access.ts` then refuses it new bookings, with a message about an
 * unpaid bill — while no human could do the same for fraud or abuse, and, far
 * worse, no human could undo it. An agency suspended in error had one way out:
 * pay a bill it might not owe.
 *
 * The sweep's own comment says "an account already suspended, or one suspended
 * by a human, is left as it is" — so a human hold was designed for and never
 * built. This is it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let superAdmin: JwtClaims;
let manager: JwtClaims;

const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const accountOf = () => prisma.tenant.findUniqueOrThrow({ where: { id: fx.agencyId } });

describe("holding an agency", () => {
  it("suspends the account, with the reason the platform gave", async () => {
    await platform().setAccountStatus(superAdmin, fx.agencyId, "suspended", "abuse");

    const account = await accountOf();
    expect(account.status).toBe("suspended");
    expect(account.suspendedReason).toBe("abuse");
    expect(account.suspendedAt).toBeTruthy();
  });

  it("lets it back in, and clears the reason with it", async () => {
    await platform().setAccountStatus(superAdmin, fx.agencyId, "suspended", "abuse");

    await platform().setAccountStatus(superAdmin, fx.agencyId, "active");

    const account = await accountOf();
    expect(account.status).toBe("active");
    expect(account.suspendedReason).toBeNull();
    expect(account.suspendedAt).toBeNull();
  });

  /**
   * The case that has no other way out today: the sweep suspends for an unpaid
   * bill, the bill turns out to be wrong, and somebody has to lift it without
   * taking money that was never owed.
   */
  it("lifts a billing suspension the sweep applied", async () => {
    await prisma.tenant.update({
      where: { id: fx.agencyId },
      data: { status: "suspended", suspendedReason: "billing", suspendedAt: new Date() },
    });

    await platform().setAccountStatus(superAdmin, fx.agencyId, "active");

    expect((await accountOf()).status).toBe("active");
  });

  it("records who did it, because holding somebody's business is not anonymous", async () => {
    await platform().setAccountStatus(superAdmin, fx.agencyId, "suspended", "abuse");

    const entry = await prisma.auditLog.findFirst({
      where: { action: "platform.account.status" },
      orderBy: { id: "desc" },
    });
    expect(entry?.actorId).toBe(fx.managerId);
  });

  it("is the platform's alone", async () => {
    await expect(
      platform().setAccountStatus(manager, fx.agencyId, "suspended", "abuse"),
    ).rejects.toThrow();
  });

  it("refuses a status it does not know, rather than writing it", async () => {
    await expect(
      platform().setAccountStatus(superAdmin, fx.agencyId, "banished" as never),
    ).rejects.toThrow();
  });
});
