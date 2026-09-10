/**
 * A locked-out manager can get back in.
 *
 * OTP used to be this door by accident: `verifyOtp` issued a token for
 * whatever role the identifier already had, so a manager who forgot a
 * password signed in with a code instead. Removing the guest login removes
 * that, so the door is built deliberately here rather than left to a side
 * effect.
 *
 * A reset token differs from an OTP in the one way that matters: it can only
 * reset a password for an account that already exists. It mints nobody.
 *
 * There is no test-only method that hands back a raw token — the service
 * never has one to hand back outside the email it sends. The stub email
 * service records what would have been sent, and the test lifts the token
 * out of the link the same way a real recipient would click it, which also
 * proves the link is one that actually works.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import bcrypt from "bcryptjs";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePasswordResetService, type Outbox } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let outbox: Outbox;

const service = () => {
  outbox = [];
  return makePasswordResetService(asPrisma, outbox);
};

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({
    where: { id: fx.managerId },
    data: { email: "manager@example.com", passwordHash: await bcrypt.hash("old-password-1", 12) },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** The token is never returned by the service — only ever emailed — so tests read it off the link. */
const tokenFromLastEmail = (): string => {
  const mail = outbox[outbox.length - 1];
  const match = mail?.html.match(/\/reset\?token=([0-9a-f]+)/);
  if (!match) throw new Error("no reset link found in the last email");
  return match[1]!;
};

describe("a password that can be reset", () => {
  it("sets a new password when the token is good", async () => {
    const svc = service();
    await svc.request("manager@example.com");
    const raw = tokenFromLastEmail();

    await svc.reset(raw, "brand-new-password");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.managerId } });
    expect(await bcrypt.compare("brand-new-password", user.passwordHash!)).toBe(true);
  });

  it("refuses the same token twice — a reset link is single use", async () => {
    const svc = service();
    await svc.request("manager@example.com");
    const raw = tokenFromLastEmail();
    await svc.reset(raw, "brand-new-password");

    await expect(svc.reset(raw, "another-password")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a token that has expired", async () => {
    const svc = service();
    await svc.request("manager@example.com");
    const raw = tokenFromLastEmail();
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(svc.reset(raw, "another-password")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a password too short to be one", async () => {
    const svc = service();
    await svc.request("manager@example.com");
    const raw = tokenFromLastEmail();

    await expect(svc.reset(raw, "short")).rejects.toMatchObject({ status: 400 });
  });

  it("says the same thing for an unknown address, so it cannot be used to find out who has an account", async () => {
    const known = await service().request("manager@example.com");
    const unknown = await service().request("nobody@example.com");

    expect(unknown).toEqual(known);
  });

  it("mints nobody — an address with no account gets no user row", async () => {
    const before = await prisma.user.count();

    await service().request("nobody@example.com");

    expect(await prisma.user.count()).toBe(before);
  });
});
