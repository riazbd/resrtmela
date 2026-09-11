/**
 * Every account has an email and a phone, so every account can get back in.
 *
 * The password reset mails a link, and a link needs an address. Self-signup
 * stored only a phone — so the owner who signed up alone, the one person with
 * no colleague to ask, was exactly the person the reset could never reach.
 * The other doors were no better: a resort adding a colleague took a phone, an
 * invited agent had only an email, and an agency's staff could have either.
 *
 * The owner's ruling: every user has both, signs in with either, and can reset
 * a forgotten password. So both columns are required — in the database, where
 * no path can forget, and on every path that makes an account, where a person
 * is told what is missing instead of meeting a constraint error.
 *
 * Accounts that already lack one are given a placeholder by the migration,
 * which is why a person's email and phone can now be changed from the users
 * screen: a placeholder is only useful if somebody can replace it.
 *
 * "Signs in with either" also means the phone a person was given is the phone
 * they can type. The paths did not store phones the way login reads them —
 * signup used `normalizePhone`, the resort and agency paths only stripped
 * non-digits — so a colleague added as `01712…` was stored as `01712…`, and
 * login, reading `8801712…`, never found them. Every path now stores what
 * login looks up.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import bcrypt from "bcryptjs";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import {
  makePlatformService,
  makeBillingService,
  makeSalesService,
  makeExportService,
  makeEngageService,
} from "../helpers/services";
import { AuthService } from "../../src/auth/auth.service";
import { ensureResortRoles } from "../../src/common/permissions";
import type { EmailService } from "../../src/notifications/email.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;
let agency: JwtClaims;

/** What the invite would have mailed — it must still mail the credentials. */
let outbox: { to: string; subject: string; html: string }[];
const recordingEmail = () =>
  ({
    send: async (to: string, subject: string, html: string) => {
      outbox.push({ to, subject, html });
      return { sent: true };
    },
  }) as unknown as EmailService;

const auth = () => new AuthService(asPrisma);
const platform = () => makePlatformService(asPrisma, recordingEmail());

/** The fixture manager's details, fixed here so a duplicate can be named. */
const TAKEN_EMAIL = "manager@example.com";
const TAKEN_PHONE = "8801711000001";

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.user.update({
    where: { id: fx.managerId },
    data: { email: TAKEN_EMAIL, phone: TAKEN_PHONE },
  });
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
  outbox = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * A refusal, checked three ways: the status each path already uses, a
 * sentence that names the field, and no account left behind. The last one is
 * the one that matters — a path that writes the row and then complains has
 * still made an account without an address.
 */
async function refuses(attempt: () => Promise<unknown>, status: number, field: RegExp) {
  const before = await prisma.user.count();
  let refusal: unknown;
  try {
    await attempt();
  } catch (err) {
    refusal = err;
  }
  expect(refusal, "the attempt was accepted").toBeDefined();
  expect(refusal).toMatchObject({ status });
  expect((refusal as Error).message).toMatch(field);
  expect(await prisma.user.count()).toBe(before);
}

describe("the database", () => {
  /**
   * Checked by the column definition, not by trying an insert: the local
   * MySQL runs with an empty `sql_mode`, and a lax server coerces a NULL into
   * a NOT NULL varchar with a warning instead of refusing it. The definition
   * is what production's strict MariaDB enforces.
   */
  const column = async (name: string) => {
    const [row] = await prisma.$queryRawUnsafe<{ nullable: string; t: string }[]>(
      "SELECT IS_NULLABLE AS nullable, CAST(COLUMN_TYPE AS CHAR) AS t FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?",
      name,
    );
    return row;
  };

  const uniquelyIndexed = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<{ nonUnique: number | bigint }[]>(
      "SELECT NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?",
      name,
    );
    return rows.some((r) => Number(r.nonUnique) === 0);
  };

  it("will not hold an account without an email", async () => {
    const email = await column("email");
    // the control: the column was found and kept its type
    expect(email?.t).toBe("varchar(191)");
    expect(email?.nullable).toBe("NO");
  });

  it("will not hold an account without a phone", async () => {
    const phone = await column("phone");
    expect(phone?.t).toBe("varchar(32)");
    expect(phone?.nullable).toBe("NO");
  });

  it("still lets no two accounts share either", async () => {
    expect(await uniquelyIndexed("email")).toBe(true);
    expect(await uniquelyIndexed("phone")).toBe(true);
  });
});

describe("signing up", () => {
  const owner = (over: Record<string, string> = {}) => ({
    companyName: "Hill View",
    resortName: "Hill View Resort",
    name: "Owner Alone",
    email: " Owner@Example.COM ",
    phone: "+880 1712-000222",
    password: "password123",
    ...over,
  });

  it("keeps the owner's email as well as their phone — the address a reset link goes to", async () => {
    const { user } = await auth().signup(owner());

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).toBe("owner@example.com");
    expect(row.phone).toBe("8801712000222");
  });

  it("refuses a signup with no email, and makes no workspace for it", async () => {
    await refuses(() => auth().signup(owner({ email: "" })), 400, /email/i);
    expect(await prisma.tenant.count({ where: { name: "Hill View" } })).toBe(0);
  });

  it("refuses a signup with no phone", async () => {
    await refuses(() => auth().signup(owner({ phone: "" })), 400, /phone/i);
  });

  it("refuses an email that already has an account, and says sign in instead", async () => {
    await refuses(() => auth().signup(owner({ email: "MANAGER@example.com" })), 409, /email/i);
  });

  it("refuses a phone that already has an account", async () => {
    await refuses(() => auth().signup(owner({ phone: `+${TAKEN_PHONE}` })), 409, /phone/i);
  });

  /**
   * The roles are what the transaction repair was for: they were seeded on a
   * second connection that waited on the uncommitted resort. A signup that
   * finishes but leaves the resort without its system roles would pass every
   * other test here, so the roles are checked against what
   * `ensureResortRoles` gives any resort it is asked to seed.
   */
  it("gives the new resort its system roles", async () => {
    const { user } = await auth().signup(owner());
    const resortId = user.resortIds[0]!;

    const control = await prisma.resort.create({ data: { tenantId: fx.tenantId, name: "Control" } });
    await ensureResortRoles(asPrisma, control.id);
    const names = (id: number) =>
      prisma.customRole.findMany({ where: { resortId: id }, select: { name: true, system: true }, orderBy: { name: "asc" } });

    const expected = await names(control.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(await names(resortId)).toEqual(expected);
  });
});

describe("a resort adding a colleague", () => {
  const colleague = (over: Record<string, string> = {}) => ({
    name: "New Clerk",
    email: " Clerk@Example.com ",
    phone: "+880 1712-000333",
    password: "password123",
    role: "FRONT_DESK",
    ...over,
  });
  const add = (over?: Record<string, string>) => platform().createResortUser(admin, fx.resortId, colleague(over));

  it("keeps both the email and the phone it was given", async () => {
    const made = await add();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.email).toBe("clerk@example.com");
    expect(row.phone).toBe("8801712000333");
  });

  it("refuses a colleague with no email", async () => {
    await refuses(() => add({ email: "" }), 400, /email/i);
  });

  it("refuses a colleague with no phone", async () => {
    await refuses(() => add({ phone: "" }), 400, /phone/i);
  });

  it("refuses an email somebody already signs in with", async () => {
    await refuses(() => add({ email: TAKEN_EMAIL }), 400, /email/i);
  });

  it("refuses a phone somebody already signs in with", async () => {
    await refuses(() => add({ phone: `+${TAKEN_PHONE}` }), 400, /phone/i);
  });

  it("refuses a placeholder address — nobody can be reached at one", async () => {
    await refuses(() => add({ email: "user-99@placeholder.invalid" }), 400, /email/i);
  });
});

describe("a resort inviting an agent by email", () => {
  const invite = (over: Record<string, string> = {}) =>
    platform().inviteAgentByEmail(admin, fx.resortId, {
      name: "New Agent",
      email: " New.Agent@Example.com ",
      phone: "+880 1712-000444",
      ...over,
    } as never);

  it("gives the new agent the phone as well, and still mails the credentials", async () => {
    const made = await invite();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.email).toBe("new.agent@example.com");
    expect(row.phone).toBe("8801712000444");
    expect(outbox.map((m) => m.to)).toEqual(["new.agent@example.com"]);
  });

  it("refuses a new agent with no phone", async () => {
    await refuses(() => invite({ phone: "" }), 400, /phone/i);
    expect(outbox).toEqual([]);
  });

  it("refuses a new agent with no email", async () => {
    await refuses(() => invite({ email: "" }), 400, /email/i);
  });

  it("refuses a phone somebody already signs in with", async () => {
    await refuses(() => invite({ phone: `+${TAKEN_PHONE}` }), 400, /phone/i);
  });

  it("links a person who already has an account, as before — they have a phone, so none is asked for", async () => {
    /**
     * An email that already has an account is not a duplicate here: it is an
     * agent of another resort being given this one too. That path makes
     * nobody, so it needs nothing new from the inviter.
     */
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    const theirAgent = await prisma.user.update({
      where: { id: elsewhere.agentId },
      data: { email: "their.agent@example.com" },
    });
    const before = await prisma.user.count();

    const linked = await invite({ email: "their.agent@example.com", phone: "" });

    expect(linked.id).toBe(theirAgent.id);
    expect(await prisma.user.count()).toBe(before);
  });
});

describe("an agency hiring its own staff", () => {
  const hire = (over: Record<string, string> = {}) =>
    platform().createAgentStaff(agency, {
      name: "Junior",
      email: " Junior@Example.com ",
      phone: "+880 1712-000555",
      password: "password123",
      ...over,
    });

  it("keeps both — no longer one or the other", async () => {
    const made = await hire();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.email).toBe("junior@example.com");
    expect(row.phone).toBe("8801712000555");
  });

  it("refuses staff with no email", async () => {
    await refuses(() => hire({ email: "" }), 400, /email/i);
  });

  it("refuses staff with no phone", async () => {
    await refuses(() => hire({ phone: "" }), 400, /phone/i);
  });

  it("refuses an email somebody already signs in with", async () => {
    await refuses(() => hire({ email: TAKEN_EMAIL }), 400, /email/i);
  });

  it("refuses a phone somebody already signs in with", async () => {
    await refuses(() => hire({ phone: `+${TAKEN_PHONE}` }), 400, /phone/i);
  });
});

describe("changing a person's email and phone", () => {
  let colleagueId: number;

  beforeEach(async () => {
    const colleague = await prisma.user.create({
      data: {
        name: "Colleague",
        email: "user-7@placeholder.invalid",
        phone: "placeholder-7",
        role: "FRONT_DESK",
        status: "active",
      },
    });
    await prisma.userResort.create({ data: { userId: colleague.id, resortId: fx.resortId } });
    colleagueId = colleague.id;
  });

  const change = (claims: JwtClaims, input: Record<string, unknown>) =>
    platform().updateResortUser(claims, fx.resortId, colleagueId, input as never);
  const stored = () =>
    prisma.user.findUniqueOrThrow({ where: { id: colleagueId }, select: { email: true, phone: true } });

  it("replaces a placeholder with a real email and phone", async () => {
    await change(admin, { email: " Real.Person@Example.com ", phone: "+880 1712-000666" });

    expect(await stored()).toEqual({ email: "real.person@example.com", phone: "8801712000666" });
  });

  it("refuses to blank the email", async () => {
    await expect(change(admin, { email: "" })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
    expect((await stored()).email).toBe("user-7@placeholder.invalid");
  });

  it("refuses to blank the phone", async () => {
    await expect(change(admin, { phone: "  " })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/phone/i) });
    expect((await stored()).phone).toBe("placeholder-7");
  });

  it("refuses an email somebody else already signs in with, in a sentence rather than a constraint error", async () => {
    await expect(change(admin, { email: TAKEN_EMAIL })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
  });

  it("refuses a phone somebody else already signs in with", async () => {
    await expect(change(admin, { phone: `+${TAKEN_PHONE}` })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/phone/i) });
    expect((await stored()).phone).toBe("placeholder-7");
  });

  it("refuses to replace an address with a placeholder", async () => {
    await expect(change(admin, { email: "user-8@placeholder.invalid" })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/email/i) });
    expect((await stored()).email).toBe("user-7@placeholder.invalid");
  });

  /**
   * The edit form sends back what it shows. A placeholder sent back unchanged
   * is not a request to change anything — and running it through
   * `normalizePhone` would turn `placeholder-7` into `7`, a phone number that
   * belongs to nobody and was never typed.
   */
  it("leaves a placeholder as it was when a form sends it back unchanged", async () => {
    await change(admin, { name: "Renamed", email: "user-7@placeholder.invalid", phone: "placeholder-7" });

    expect(await stored()).toEqual({ email: "user-7@placeholder.invalid", phone: "placeholder-7" });
  });

  it("changes nothing when a later part of the request is refused", async () => {
    const elsewhere = await seedResort(prisma as unknown as PrismaClient);
    await ensureResortRoles(asPrisma, elsewhere.resortId);
    const theirRole = await prisma.customRole.findFirstOrThrow({ where: { resortId: elsewhere.resortId } });

    await expect(change(admin, { email: "moved@example.com", roleId: theirRole.id })).rejects.toMatchObject({ status: 400 });

    expect((await stored()).email).toBe("user-7@placeholder.invalid");
  });

  /**
   * An email and a phone are how a person signs in and where their reset
   * link goes — changing one is taking over the account. So they join the
   * password and the role: when the person also works at another resort, only
   * the platform owner may change them.
   */
  describe("for someone who also works at another resort", () => {
    beforeEach(async () => {
      const elsewhere = await seedResort(prisma as unknown as PrismaClient);
      await prisma.userResort.create({ data: { userId: colleagueId, resortId: elsewhere.resortId } });
    });

    it("is refused to this resort's own admin — the email", async () => {
      await expect(change(admin, { email: "mine-now@example.com" })).rejects.toMatchObject({ status: 403 });
      expect((await stored()).email).toBe("user-7@placeholder.invalid");
    });

    it("is refused to this resort's own admin — the phone", async () => {
      await expect(change(admin, { phone: "+880 1712-000777" })).rejects.toMatchObject({ status: 403 });
      expect((await stored()).phone).toBe("placeholder-7");
    });

    it("is allowed to the platform owner", async () => {
      const owner = await prisma.user.create({
        data: { name: "Platform", email: "platform@example.com", phone: "8801711000999", role: "SUPER_ADMIN" },
      });
      const platformOwner: JwtClaims = { userId: owner.id, role: ROLE.SUPER_ADMIN, resortIds: [] };

      await change(platformOwner, { email: "fixed@example.com", phone: "+880 1712-000888" });

      expect(await stored()).toEqual({ email: "fixed@example.com", phone: "8801712000888" });
    });

    /**
     * An unchanged value is not a change to the account. Task 12's edit form
     * sends the email and phone back with every save, so counting them as
     * account changes would stop a resort renaming anyone who also works
     * elsewhere.
     */
    it("lets this resort's admin rename them when the form sends their email and phone back unchanged", async () => {
      await change(admin, { name: "Renamed", email: "user-7@placeholder.invalid", phone: "placeholder-7" });

      const row = await prisma.user.findUniqueOrThrow({ where: { id: colleagueId } });
      expect(row.name).toBe("Renamed");
      expect({ email: row.email, phone: row.phone }).toEqual({ email: "user-7@placeholder.invalid", phone: "placeholder-7" });
    });
  });
});

describe("signing in", () => {
  /**
   * `loginWithPassword` already branches on "@", so this one is a
   * characterisation: it should pass before the change and keep passing.
   */
  it("reaches the same account by email as by phone", async () => {
    await prisma.user.update({
      where: { id: fx.managerId },
      data: { passwordHash: await bcrypt.hash("password123", 4), status: "active" },
    });

    const byEmail = await auth().loginWithPassword(" Manager@Example.com ", "password123");
    const byPhone = await auth().loginWithPassword(`+${TAKEN_PHONE}`, "password123");

    expect(byEmail.user.id).toBe(fx.managerId);
    expect(byPhone.user.id).toBe(fx.managerId);
  });

  it("a colleague added with a local number signs in with that same local number", async () => {
    const made = await platform().createResortUser(admin, fx.resortId, {
      name: "Local Number",
      email: "local.number@example.com",
      phone: "01712000321",
      password: "password123",
      role: "FRONT_DESK",
    } as never);

    const byPhone = await auth().loginWithPassword("01712000321", "password123");

    expect(byPhone.user.id).toBe(made.id);
  });

  it("an agency's staff member added with a local number signs in with that number", async () => {
    const made = await platform().createAgentStaff(agency, {
      name: "Local Junior",
      email: "local.junior@example.com",
      phone: "01712000322",
      password: "password123",
    });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: made.id } })).phone).toBe("8801712000322");
    expect((await auth().loginWithPassword("01712000322", "password123")).user.id).toBe(made.id);
  });

  it("an invited agent with a local number signs in with that number, once approved", async () => {
    const made = await platform().inviteAgentByEmail(admin, fx.resortId, {
      email: "local.agent@example.com",
      phone: "01712000323",
    } as never);
    // the temporary password only ever leaves in the invitation, so it is read from there
    const temporary = outbox[0]?.html.match(/Temporary password<\/td>\s*<td[^>]*>([^<]+)<\/td>/)?.[1];
    // an invited agent starts pending, and pending accounts cannot sign in
    await prisma.user.update({ where: { id: made.id }, data: { status: "active" } });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: made.id } })).phone).toBe("8801712000323");
    expect((await auth().loginWithPassword("01712000323", temporary!)).user.id).toBe(made.id);
  });

  it("a colleague whose phone is changed to a local number signs in with that number", async () => {
    const colleague = await prisma.user.create({
      data: {
        name: "Moving Number",
        email: "moving.number@example.com",
        phone: "8801712000399",
        role: "FRONT_DESK",
        status: "active",
        passwordHash: await bcrypt.hash("password123", 4),
      },
    });
    await prisma.userResort.create({ data: { userId: colleague.id, resortId: fx.resortId } });

    await platform().updateResortUser(admin, fx.resortId, colleague.id, { phone: "01712000324" } as never);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: colleague.id } })).phone).toBe("8801712000324");
    expect((await auth().loginWithPassword("01712000324", "password123")).user.id).toBe(colleague.id);
  });

  it("lets the owner who signed up alone in by either — the account the reset could not reach", async () => {
    const { user } = await auth().signup({
      companyName: "Sea Breeze",
      resortName: "Sea Breeze Resort",
      name: "Solo Owner",
      email: "solo@example.com",
      phone: "01712000999",
      password: "password123",
    } as never);

    const byEmail = await auth().loginWithPassword("solo@example.com", "password123");
    const byPhone = await auth().loginWithPassword("01712000999", "password123");

    expect(byEmail.user.id).toBe(user.id);
    expect(byPhone.user.id).toBe(user.id);
  });
});

/**
 * A placeholder is a gap, not a contact detail.
 *
 * The migration filled every missing email with `user-<id>@placeholder.invalid`
 * and every missing phone with `placeholder-<id>`, so that both columns could
 * be required. To every reader that used to test for null they now look real,
 * and a reader that falls back from email to phone never falls back, because
 * the email is never missing any more. So each place that reaches a person, or
 * prints how to reach them, has to see a placeholder for what it is and use
 * what is real.
 */
describe("a placeholder, wherever contact details are read", () => {
  beforeEach(async () => {
    // the owner who signed up before this change: a real phone, and a placeholder where the email was
    await prisma.user.update({
      where: { id: fx.managerId },
      data: { role: "RESORT_ADMIN", email: `user-${fx.managerId}@placeholder.invalid` },
    });
  });

  it("does not receive a billing notice — the owner's phone does", async () => {
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { status: "suspended", suspendedReason: "billing", suspendedAt: new Date() },
    });

    await makeBillingService(asPrisma).reactivate(fx.resortId);

    const jobs = await prisma.notificationJob.findMany({ select: { channel: true, toRef: true } });
    expect(jobs).toEqual([{ channel: "SMS", toRef: TAKEN_PHONE }]);
  });

  it("is left off an agency's quotation, and the agency's phone is not", async () => {
    await prisma.user.update({ where: { id: fx.agentId }, data: { email: `user-${fx.agentId}@placeholder.invalid` } });
    const sales = makeSalesService(asPrisma);
    const doc = await sales.create(agency, {
      kind: "QUOTATION",
      clientName: "Farhana Rahman",
      clientEmail: "farhana@example.com",
      issueDate: "2026-09-09",
      items: [{ label: "Cottage, 2 nights", qty: 2, unitPrice: 4500 }],
    });

    const html = await sales.preview(agency, doc.id);

    const theAgency = await prisma.user.findUniqueOrThrow({ where: { id: fx.agentId } });
    expect(html).toContain(theAgency.phone);
    expect(html).not.toContain("placeholder.invalid");
  });

  it("is exported as a blank cell, not as a way to reach someone", async () => {
    await prisma.user.update({ where: { id: fx.agentId }, data: { phone: `placeholder-${fx.agentId}` } });

    const staff = await makeExportService(asPrisma).dataset(admin, fx.resortId, "staff");

    const col = (h: string) => staff.headers.indexOf(h);
    const row = (name: string) => staff.rows.find((r) => r[col("name")] === name)!;
    expect(row("Test Manager")[col("email")]).toBe("");
    expect(row("Test Manager")[col("phone")]).toBe(TAKEN_PHONE);
    expect(row("Test Agent")[col("phone")]).toBe("");
    expect(String(row("Test Agent")[col("email")])).toMatch(/@example\.com$/);
    expect(JSON.stringify(staff.rows)).not.toMatch(/placeholder/);
  });

  it("is not shown as a buyer's contact on the platform's credit queue — their phone is", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "email.creditPacks" },
      update: { value: JSON.stringify([{ credits: 500, price: 500 }]) },
      create: { key: "email.creditPacks", value: JSON.stringify([{ credits: 500, price: 500 }]) },
    });
    await makeEngageService(asPrisma).requestCredits(admin, 500);
    const platformOwner: JwtClaims = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };

    const [order] = await makeEngageService(asPrisma).listCreditOrders(platformOwner, "PENDING");

    expect(order?.buyerContact).toBe(TAKEN_PHONE);
  });
});

describe("a marketing campaign to an agent audience", () => {
  /**
   * Characterisation, not red-first: the filter this proves already exists
   * (engage.service.ts's AGENTS branch, `NOT: { email: { endsWith:
   * PLACEHOLDER_EMAIL_SUFFIX } } }` in the `userResort.findMany` where-clause),
   * so this passes on the first run. Nothing had exercised it far enough to
   * say so — every existing sendCampaign spec (a-plan-that-locks,
   * tenant-isolation, credit-approval) stops at an earlier refusal (the plan
   * gate, cross-tenant access, no credits bought yet), never reaching the
   * recipient list at all. Checked by temporarily deleting the `NOT` clause
   * and re-running this test: it failed (both assertions), confirming it is
   * this filter holding the line, not something upstream. Reverted before
   * committing — see the report's "Final fix wave" section for the red output.
   */
  it("does not mail an agent stuck with a placeholder email, and spends no credit on them", async () => {
    const outbox: { to: string }[] = [];
    const recordingEmail = {
      send: async (to: string) => {
        outbox.push({ to });
        return { sent: true };
      },
    } as unknown as EmailService;
    const engage = makeEngageService(asPrisma, recordingEmail);

    const stuck = await prisma.user.create({
      data: {
        name: "Stuck Agent",
        email: "user-77001@placeholder.invalid",
        phone: "8801611222555",
        role: "AGENT",
        status: "active",
      },
    });
    await prisma.userResort.create({ data: { userId: stuck.id, resortId: fx.resortId } });
    await prisma.emailCredit.create({ data: { userId: admin.userId, credits: 500 } });

    const result = await engage.sendCampaign(admin, {
      subject: "New season rates",
      body: "Hello agents",
      audience: "AGENTS",
      resortId: fx.resortId,
    });

    // fx.agentId's real email is the only one that went out
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).not.toBe(stuck.email);
    // used = sent + failed, and only one recipient was ever attempted — a
    // credit spent on the placeholder would show up here as 498, not 499
    expect(result.remaining).toBe(500 - 1);
  });
});
