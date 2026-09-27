/**
 * An email is the only way in (2026-09-28).
 *
 * This file replaces `a-phone-signs-in-the-way-it-is-written.spec.ts`, which
 * pinned the opposite rule and pinned it for a good reason: people type
 * `01712345678`, some stored numbers are a digit short, and nobody should be
 * told their own number is unrecognised because of how it was written into
 * the table before they ever saw a login screen.
 *
 * What changed is not that reasoning. It is that a phone number stopped
 * identifying an account at all. A resort's owner and an agency's owner are
 * frequently the same human being, and that human being has one SIM — so the
 * unique index on `users.phone` made the second account impossible to open.
 * The index is gone, the number is contact detail now, and two accounts can
 * answer to one of them.
 *
 * Which makes the old rule unsafe rather than merely unnecessary: the
 * fallback it was built on picked "the only account ending in those digits",
 * and there may now be two. Signing somebody into the wrong account is the
 * one outcome worse than asking them to type more — that sentence was in the
 * old spec, and it is why this one exists.
 *
 * So: the email, and a refusal that says so. Checked before shipping: every
 * account on production has a real email and none has a placeholder.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { EMAIL_ONLY_SENTENCE, contactTaken, findUserByIdentifier } from "../../src/common/contact";
import type { PrismaService } from "../../src/prisma/prisma.service";
import * as bcrypt from "bcryptjs";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

async function person(email: string, phone: string) {
  return prisma.user.create({
    data: {
      name: "Test Person",
      email,
      phone,
      passwordHash: await bcrypt.hash("Password123!", 4),
      role: "FRONT_DESK",
      status: "active",
    },
  });
}

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what finds an account", () => {
  it("is the email, however it was typed", async () => {
    const u = await person(`karim-${fx.resortId}@test.example`, "8801712345678");
    for (const typed of [
      `karim-${fx.resortId}@test.example`,
      `KARIM-${fx.resortId}@TEST.EXAMPLE`,
      `  karim-${fx.resortId}@test.example  `,
    ]) {
      expect((await findUserByIdentifier(asPrisma, typed))?.id).toBe(u.id);
    }
  });

  it("is not the phone, in any of the shapes that used to work", async () => {
    await person(`nazrul-${fx.resortId}@test.example`, "8801712345678");
    for (const typed of ["01712345678", "1712345678", "8801712345678", "+8801712345678"]) {
      expect(await findUserByIdentifier(asPrisma, typed)).toBeNull();
    }
  });

  it("is nobody for an email nobody has, and for nothing at all", async () => {
    expect(await findUserByIdentifier(asPrisma, "nobody@test.example")).toBeNull();
    expect(await findUserByIdentifier(asPrisma, "")).toBeNull();
  });
});

describe("two accounts on one SIM", () => {
  /** The thing the owner asked for, and the reason the index went. */
  it("can both exist, and each is found by its own email", async () => {
    const shared = "8801799000111";
    const resort = await person(`owner-resort-${fx.resortId}@test.example`, shared);
    const agency = await person(`owner-agency-${fx.resortId}@test.example`, shared);

    expect(resort.id).not.toBe(agency.id);
    expect((await findUserByIdentifier(asPrisma, `owner-resort-${fx.resortId}@test.example`))?.id).toBe(resort.id);
    expect((await findUserByIdentifier(asPrisma, `owner-agency-${fx.resortId}@test.example`))?.id).toBe(agency.id);
  });

  it("is not refused when the second one is opened", async () => {
    const shared = "8801799000222";
    await person(`first-${fx.resortId}@test.example`, shared);

    // what `signup` asks before writing: the email is taken or it is not, and
    // the phone is no longer any of its business
    expect(await contactTaken(asPrisma, { email: `second-${fx.resortId}@test.example`, phone: shared })).toBeNull();
  });

  it("still refuses a second account on one email", async () => {
    await person(`only-${fx.resortId}@test.example`, "8801799000333");
    expect(await contactTaken(asPrisma, { email: `only-${fx.resortId}@test.example` })).toBe("email");
  });

  it("does not refuse the account its own email belongs to", async () => {
    const u = await person(`mine-${fx.resortId}@test.example`, "8801799000444");
    expect(await contactTaken(asPrisma, { email: `mine-${fx.resortId}@test.example` }, u.id)).toBeNull();
  });
});

describe("the refusal a person reads", () => {
  it("says what to type instead of calling their password wrong", () => {
    expect(EMAIL_ONLY_SENTENCE).toMatch(/email/i);
    expect(EMAIL_ONLY_SENTENCE).not.toMatch(/invalid/i);
  });
});
