/**
 * People type `01712345678`. That has to sign them in.
 *
 * Reported: "login e extra 88 use korte hoy" — you had to type the country
 * code. Two separate causes, both real:
 *
 *  1. Two forms asked for it. Their placeholder was `8801XXXXXXXXX`, and
 *     nobody in Bangladesh writes a mobile number that way; they write
 *     `01XXXXXXXXX`. A form that asks for the wrong shape gets it.
 *  2. Some stored numbers are a digit short. The seed built them as
 *     `"88017" + 7 digits` — twelve characters, where a Bangladeshi mobile is
 *     880 plus ten. `normalizePhone("0170000101")` produces a correct
 *     thirteen, which then matches nothing, while typing the stored twelve
 *     verbatim matches exactly. Hence the 88.
 *
 * The placeholders and the seed are fixed elsewhere. This pins the part that
 * has to keep working for accounts already stored in the wrong shape: a
 * person cannot be told their own number is unrecognised because of how it
 * was written into the database before they ever saw a login screen.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { findUserByIdentifier } from "../../src/common/contact";
import type { PrismaService } from "../../src/prisma/prisma.service";
import * as bcrypt from "bcryptjs";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

/** One staff account, with its phone stored exactly as given. */
async function userWithPhone(phone: string, email: string) {
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

describe("a phone stored the right way", () => {
  const STORED = "8801712345678"; // 880 + ten digits, as it should be

  beforeEach(async () => {
    await userWithPhone(STORED, `right-${fx.resortId}@test.example`);
  });

  it("is found however the person writes it", async () => {
    for (const typed of ["01712345678", "1712345678", "8801712345678", "+8801712345678", "01712-345678"]) {
      const found = await findUserByIdentifier(asPrisma, typed);
      expect({ typed, phone: found?.phone ?? null }).toEqual({ typed, phone: STORED });
    }
  });
});

describe("a phone stored a digit short", () => {
  /**
   * Twelve characters: `880` and nine. Not a number anybody can ring, but it
   * is what is in the table, and the person it belongs to still has to be
   * able to sign in without knowing that.
   */
  const STORED = "880170000101";

  beforeEach(async () => {
    await userWithPhone(STORED, `short-${fx.resortId}@test.example`);
  });

  it("is found when typed as it is stored", async () => {
    expect((await findUserByIdentifier(asPrisma, STORED))?.phone).toBe(STORED);
  });

  it("is found when typed the way a person would write it", async () => {
    // `0170000101` normalises to a correct thirteen, which is not what is
    // stored — this is the case that made the 88 necessary
    expect((await findUserByIdentifier(asPrisma, "0170000101"))?.phone).toBe(STORED);
    expect((await findUserByIdentifier(asPrisma, "170000101"))?.phone).toBe(STORED);
  });
});

describe("the fallback does not reach past the person it is for", () => {
  it("does not match a different number that merely ends the same way", async () => {
    await userWithPhone("8801711111111", `a-${fx.resortId}@test.example`);
    // a short suffix must not be enough: "1111" ends both of these
    const found = await findUserByIdentifier(asPrisma, "1111");
    expect(found).toBeNull();
  });

  it("returns nobody rather than somebody when two accounts could match", async () => {
    /**
     * Ambiguity is a refusal, not a coin toss. Signing somebody into the
     * wrong account is the one outcome worse than asking them to type more.
     */
    /**
     * Two rows a digit short, ending the same way, and neither of them the
     * number the typed one normalises to — so the exact match misses and the
     * suffix has two answers. An exact match, when there is one, always wins
     * over this; the refusal only applies where the guess would be a guess.
     */
    await userWithPhone("880171234567", `x-${fx.resortId}@test.example`);
    await userWithPhone("999171234567", `y-${fx.resortId}@test.example`);
    const found = await findUserByIdentifier(asPrisma, "0171234567");
    expect(found).toBeNull();
  });

  it("still finds nobody for a number nobody has", async () => {
    expect(await findUserByIdentifier(asPrisma, "01999999999")).toBeNull();
  });

  it("leaves email alone", async () => {
    const u = await userWithPhone("8801799999999", `mail-${fx.resortId}@test.example`);
    expect((await findUserByIdentifier(asPrisma, `mail-${fx.resortId}@test.example`))?.id).toBe(u.id);
  });
});
