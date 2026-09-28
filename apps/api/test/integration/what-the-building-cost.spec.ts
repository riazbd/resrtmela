/**
 * What the building cost (2026-09-28).
 *
 * Three questions the owner asked, which nothing here could answer: who has
 * put money in towards building the resort, what the money has gone on, and
 * what is in hand.
 *
 * It is not the expense book, and the separation is the design: an expense is
 * the cost of running a resort that is open, and this is the cost of building
 * one that is not. Filed together, the roof would land in last month's profit
 * and loss and every margin on the reports screen would be wrong.
 *
 * What this pins:
 *
 *  - the three answers, and that the totals are about the *book* and never
 *    about whatever the list is filtered to
 *  - the headings are the resort's own list, built as it is used, and a
 *    heading typed twice is one heading rather than two
 *  - a line survives its heading being deleted, because `label` is the name
 *    as it read on the day
 *  - the same line replayed is still one line
 *  - who may read it, who may write it, and that neither is anybody else's
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeConstructionService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { DEFAULT_ROLE_PERMISSIONS, ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
const db = () => prisma as unknown as PrismaClient;
const book = () => makeConstructionService(asPrisma);

let fx: Fixture;
let owner: JwtClaims;
let agent: JwtClaims;

beforeEach(async () => {
  await resetDb(db());
  fx = await seedResort(db());
  // the fixture's manager, linked to the resort and holding the Manager set,
  // which includes both construction permissions
  owner = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const put = (amount: number, who: string, date = "2026-06-01") =>
  book().add(owner, fx.resortId, { kind: "IN", date, amount, contributorName: who });

const spend = (amount: number, on: string, date = "2026-06-15", paidTo?: string) =>
  book().add(owner, fx.resortId, { kind: "OUT", date, amount, purposeName: on, paidTo });

describe("the three questions", () => {
  beforeEach(async () => {
    await put(2_500_000, "Delwar Hossain");
    await put(1_500_000, "Shahidul Islam", "2026-07-10");
    await put(800_000, "Delwar Hossain", "2026-08-05");
    await spend(900_000, "Land filling", "2026-06-15", "Karim Earth Movers");
    await spend(1_200_000, "Cement and rod", "2026-07-02", "Sylhet Traders");
    await spend(300_000, "Cement and rod", "2026-09-01", "Sylhet Traders");
  });

  it("says who put money in, one line per person and not per payment", async () => {
    const b = await book().book(owner, fx.resortId);

    expect(b.byContributor).toEqual([
      { name: "Delwar Hossain", amount: 3_300_000, entries: 2 },
      { name: "Shahidul Islam", amount: 1_500_000, entries: 1 },
    ]);
  });

  it("says what the money went on, largest first", async () => {
    const b = await book().book(owner, fx.resortId);

    expect(b.byPurpose).toEqual([
      { name: "Cement and rod", amount: 1_500_000, entries: 2 },
      { name: "Land filling", amount: 900_000, entries: 1 },
    ]);
  });

  it("says what is in hand", async () => {
    const b = await book().book(owner, fx.resortId);

    expect(b.totals).toEqual({ received: 4_800_000, spent: 2_400_000, inHand: 2_400_000 });
  });

  /**
   * The figure a person reconciles against. A total that quietly means "of
   * the fifty lines on screen" is one they cannot make balance — so narrowing
   * the list must move the rows and leave the three numbers alone.
   */
  it("keeps the totals about the whole book when the list is narrowed", async () => {
    const whole = await book().book(owner, fx.resortId);
    const narrowed = await book().book(owner, fx.resortId, { kind: "OUT", search: "Cement" });

    expect(narrowed.rows.length).toBe(2);
    expect(narrowed.total).toBe(2);
    expect(narrowed.totals).toEqual(whole.totals);
    expect(narrowed.byContributor).toEqual(whole.byContributor);
  });

  it("finds a line by the shop it was paid to", async () => {
    const found = await book().book(owner, fx.resortId, { search: "Sylhet" });
    expect(found.rows.map((r) => r.paidTo)).toEqual(["Sylhet Traders", "Sylhet Traders"]);
  });

  it("narrows to a date range without changing what is in hand", async () => {
    const june = await book().book(owner, fx.resortId, { from: "2026-06-01", to: "2026-06-30" });
    expect(june.rows.length).toBe(2);
    expect(june.totals.inHand).toBe(2_400_000);
  });
});

describe("the headings", () => {
  it("are a list the resort owns, built as it is used", async () => {
    await put(100_000, "Delwar Hossain");
    await spend(50_000, "Cement and rod");

    const b = await book().book(owner, fx.resortId);
    expect(b.contributors.map((c) => c.name)).toEqual(["Delwar Hossain"]);
    expect(b.purposes.map((p) => p.name)).toEqual(["Cement and rod"]);
  });

  it("do not multiply when the same name is typed again", async () => {
    await put(100_000, "Delwar Hossain");
    await put(200_000, "Delwar Hossain");

    const b = await book().book(owner, fx.resortId);
    expect(b.contributors.length).toBe(1);
    expect(b.byContributor).toEqual([{ name: "Delwar Hossain", amount: 300_000, entries: 2 }]);
  });

  it("can be named before any money moves", async () => {
    await book().addPurpose(owner, fx.resortId, "Electrical");
    const b = await book().book(owner, fx.resortId);

    expect(b.purposes.map((p) => p.name)).toEqual(["Electrical"]);
    // named is not spent: an empty heading must not appear in the answer to
    // "what did the money go on"
    expect(b.byPurpose).toEqual([]);
  });

  it("refuse a line with no heading at all", async () => {
    await expect(
      book().add(owner, fx.resortId, { kind: "OUT", date: "2026-06-01", amount: 1000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * The name as it read on the day. Removing "Cement and rod" from the list
   * must not remove fifteen lakh from the answer to what the building cost.
   */
  it("leave the lines behind when a heading is deleted", async () => {
    await spend(300_000, "Cement and rod");
    const purpose = await db().constructionPurpose.findFirstOrThrow({ where: { resortId: fx.resortId } });
    await db().constructionPurpose.delete({ where: { id: purpose.id } });

    const b = await book().book(owner, fx.resortId);
    expect(b.totals.spent).toBe(300_000);
    expect(b.byPurpose).toEqual([{ name: "Cement and rod", amount: 300_000, entries: 1 }]);
    expect(b.rows[0]!.purposeId).toBeNull();
    expect(b.rows[0]!.label).toBe("Cement and rod");
  });
});

describe("what the money moved by", () => {
  it("has to be a way this resort takes money", async () => {
    await expect(
      book().add(owner, fx.resortId, {
        kind: "IN",
        date: "2026-06-01",
        amount: 1000,
        contributorName: "Somebody",
        method: "BITCOIN",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("is cash when nobody said", async () => {
    await put(1000, "Somebody");
    const b = await book().book(owner, fx.resortId);
    expect(b.rows[0]!.method).toBe("CASH");
  });

  it("cannot be nothing, or less than nothing", async () => {
    for (const amount of [0, -5000]) {
      await expect(
        book().add(owner, fx.resortId, {
          kind: "IN",
          date: "2026-06-01",
          amount,
          contributorName: "Somebody",
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe("a line written twice", () => {
  /** A phone that lost its connection between sending and hearing back. */
  it("is still one line", async () => {
    const once = await book().add(owner, fx.resortId, {
      kind: "OUT",
      date: "2026-06-15",
      amount: 900_000,
      purposeName: "Land filling",
      clientRef: "site-visit-1",
    });
    const again = await book().add(owner, fx.resortId, {
      kind: "OUT",
      date: "2026-06-15",
      amount: 900_000,
      purposeName: "Land filling",
      clientRef: "site-visit-1",
    });

    expect(again.id).toBe(once.id);
    const b = await book().book(owner, fx.resortId);
    expect(b.total).toBe(1);
    expect(b.totals.spent).toBe(900_000);
  });
});

describe("correcting the book", () => {
  it("changes the figure and the answer with it", async () => {
    const line = await spend(300_000, "Cement and rod");
    await book().update(owner, fx.resortId, line.id, {
      kind: "OUT",
      date: "2026-07-02",
      amount: 350_000,
      purposeName: "Cement and rod",
    });

    const b = await book().book(owner, fx.resortId);
    expect(b.totals.spent).toBe(350_000);
  });

  it("takes a line out when it should never have been there", async () => {
    const line = await spend(300_000, "Cement and rod");
    await book().remove(owner, fx.resortId, line.id);

    const b = await book().book(owner, fx.resortId);
    expect(b.total).toBe(0);
    expect(b.totals.spent).toBe(0);
  });

  it("will not touch a line in somebody else's book", async () => {
    const line = await spend(300_000, "Cement and rod");
    const other = await db().resort.create({
      data: { tenantId: fx.tenantId, name: "Other", slug: `other-${Date.now()}` },
    });

    await expect(book().remove(owner, other.id, line.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("whose book it is", () => {
  it("is not an agency's, even one that sells the resort", async () => {
    await expect(book().book(agent, fx.resortId)).rejects.toMatchObject({ status: 403 });
  });

  it("is not readable without a link to the resort", async () => {
    const stranger: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [] };
    await expect(book().book(stranger, fx.resortId + 9999)).rejects.toMatchObject({ status: 403 });
  });

  /**
   * The front desk records the electricity bill and has no business reading
   * what the partners contributed — which is why this has its own pair of
   * permissions rather than borrowing the expense ones.
   */
  it("is not the front desk's, whose default set leaves it out", async () => {
    expect(DEFAULT_ROLE_PERMISSIONS["Front Desk"]).not.toContain("construction.view");
    expect(DEFAULT_ROLE_PERMISSIONS["Front Desk"]).not.toContain("construction.manage");

    const clerk = await db().user.create({
      data: {
        name: "Clerk",
        email: `clerk-${Date.now()}@test.example`,
        phone: `8809${Math.floor(Math.random() * 1e8)}`,
        role: "FRONT_DESK",
        status: "active",
      },
    });
    await db().userResort.create({ data: { userId: clerk.id, resortId: fx.resortId } });

    await expect(
      book().book({ userId: clerk.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] }, fx.resortId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("is the manager's, who may both read it and write it", async () => {
    expect(DEFAULT_ROLE_PERMISSIONS.Manager).toContain("construction.view");
    expect(DEFAULT_ROLE_PERMISSIONS.Manager).toContain("construction.manage");

    await put(100_000, "Delwar Hossain");
    expect((await book().book(owner, fx.resortId)).totals.received).toBe(100_000);
  });
});
