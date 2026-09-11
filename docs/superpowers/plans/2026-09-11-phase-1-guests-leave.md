# Phase 1 — Guests Leave: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every guest-facing surface — login, panel, availability, booking, online payment and the resort-website API — so the platform serves resorts and agencies only, and replace the one staff capability that removal would otherwise take away.

**Architecture:** This phase is deletion, not construction, with one exception. Work outside-in: take the web pages and links first (so nothing on screen points at a door being removed), then the API routes, then the roles and models nothing references any more. The exception is `forgot-password`, which must land *before* OTP is removed, because OTP is currently the only passwordless route a locked-out staff member has.

**Tech Stack:** TypeScript · NestJS 10 + Prisma (MariaDB) · Next.js 14 App Router · Vitest · Turborepo + pnpm

**Spec:** [`docs/superpowers/specs/2026-09-11-two-sided-platform-design.md`](../specs/2026-09-11-two-sided-platform-design.md) — read sections 1–4 before starting. This plan implements phase 1 only.

## Start here if you have just arrived

You have no memory of the conversation that produced this. Read these three, in
this order, before touching anything — twenty minutes, and it is the difference
between doing the work and re-deciding it:

1. **`docs/superpowers/specs/2026-09-11-two-sided-platform-design.md`** sections
   1–4 — what was decided and *why*. The reasons are recorded so you can tell a
   decision from an accident. §4.2 and §4.4 are traps that have already been
   found; do not rediscover them the hard way.
2. **This plan, whole**, before starting Task 1. The task order carries a
   dependency that is not obvious: Task 1 must ship before Task 6.
3. **`STATUS.md`** — where the project stands generally.

### What you are walking into

Resort Mela is a resort-management SaaS: a Turborepo/pnpm monorepo with a
NestJS + Prisma API (`apps/api`, MariaDB), a Next.js console (`apps/web`), and a
frozen Expo app (`apps/mobile`) that Task 8 formally retires.

On 2026-09-11 the owner settled a question that had been half-open for weeks:
**the platform sells to resorts and to travel agencies, and nobody else has an
account.** A guest is a record in a resort's register — a name, a phone, an NID —
not a user with a login. Guest booking was already refused at the door; this
phase removes the building.

### The one distinction you must not get wrong

The `guests` **table** is the resort's own register and is untouched. `ROLE.GUEST`
is a login and is being removed. They are different things with the same word.
Deleting the first destroys a customer's book. If a change you are about to make
touches `guests`, `Booking.guestId`, or `notifications/templates.ts`, stop and
re-read this paragraph.

### House style, which the reviewer will hold you to

- **Tests are prose.** Read `apps/api/test/integration/who-collected-the-cash.spec.ts`
  for the pattern: a header comment saying what broke and why it mattered, and
  `it(...)` names that are sentences about behaviour, not labels.
- **Comments explain the decision, not the code.** The ones worth writing say
  what the previous version got wrong. Grep `bookings.service.ts` for examples.
- **Commit messages are paragraphs**, in the imperative, explaining the reason.
  `git log` is the house voice — read the last ten before writing one.
- **English in code and docs.** The owner writes in Bangla and you may answer in
  Bangla, but the repo is English.

### The five phases, so you know where this one sits

1. **Guests leave** ← this plan
2. The subscriber becomes an account, not a resort
3. The agency becomes a paying customer with its own plans
4. Offers — invitations and campaigns with a plan attached
5. The open door — agent access by policy, and the team list stops showing agents

Each is its own branch and its own deploy. **Do not start phase 2.** When phase 1
is green, report and stop.

## Global Constraints

- **TDD is not optional here.** Red first. A test that passes before the change is a test to go and read. Deletion tests are easy to write green by accident — assert the route is *absent* (404), never merely that it refuses.
- **One vitest run at a time.** The API suite shares one database (`resorthub_test`) and two runs truncate each other mid-test. Never start a second while one is running.
- **Run targeted specs, not the full suite,** until the final task. The full API suite takes ~22 minutes.
- **`tsc` does not cover `apps/api/test/`.** `tsconfig.build.json` excludes it, so a spec that constructs a service by hand can go stale invisibly. Only vitest catches that. This has bitten twice.
- **Regenerate Prisma from `packages/db`**, never from `apps/api` — generating from `apps/api` fails quietly and looks like a schema bug: `pnpm -F @rh/db exec prisma generate`.
- **Migrations are hand-written.** This database was built with `db push`, so use the repo's `db:baseline --apply` flow; do not run `prisma migrate dev`.
- **If Prisma generate throws `EPERM` or "prisma not found":** a leftover `main.ts` node process is holding the query-engine DLL. Kill stray node processes and retry.
- **Do not touch the `guests` table, `Booking.guestId`, or anything in `notifications/templates.ts`.** Those are the resort's own guest register and the messages it sends to guests. A guest still exists as a *record*; only the *account* goes. Deleting the wrong one destroys a customer's book.
- **Do not touch `/cms`.** See Task 3.
- Commit after every task. Branch: `feat/guests-leave` off `main`.

---

## File Structure

| File | Responsibility after this phase |
|---|---|
| `apps/api/src/auth/password-reset.service.ts` | **New.** Issue, verify and consume a single-use password-reset token |
| `apps/api/src/platform/marketing.controller.ts` | **New.** `/cms` only — the platform's own homepage content, moved out of harm's way |
| `apps/api/src/platform/public-api.controller.ts` | **Deleted.** `/v1` goes; `/cms` has moved out first |
| `apps/api/src/guest/` | **Deleted.** Whole directory |
| `apps/api/src/payments/intents.controller.ts`, `intents.service.ts` | **Deleted.** Guest online payment and the gateway webhook |
| `apps/api/src/auth/auth.service.ts` | Loses `requestOtp` and `verifyOtp`; gains reset endpoints' service calls |
| `apps/api/src/auth/auth.controller.ts` | Loses `otp/request`, `otp/verify`; gains `password/forgot`, `password/reset` |
| `apps/api/src/common/rbac.ts` | Loses `apiKeyClaims` |
| `packages/shared/src/index.ts` | `ROLE` loses `GUEST`; `PLAN_FEATURES` loses `public_api` |
| `packages/db/prisma/schema.prisma` | Loses `OtpCode`; gains `PasswordReset`. `ApiKey` **stays** (see spec §4.3) |
| `apps/web/src/app/(public)/book/` | **Deleted.** Three pages |
| `apps/web/src/lib/api.ts` | Loses the `guest*` block |
| `apps/web/src/app/(public)/page.tsx` | Loses "Book a stay" (×2), the footer's guest links, and the `#api` section |
| `apps/web/src/app/(app)/settings/page.tsx` | The "API keys" tab is hidden, not deleted |
| `apps/mobile/` | Formally retired: `private: true`, out of the turbo pipeline |

---

## Task 1: A staff member locked out can get back in

Do this **first**. Task 6 removes OTP, and OTP is the only passwordless route a staff member has today (spec §4.4). The replacement must exist before the thing it replaces is taken away.

**Files:**
- Create: `apps/api/src/auth/password-reset.service.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260911100000_a_password_can_be_reset/migration.sql`
- Modify: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/test/integration/a-password-can-be-reset.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `EmailService.send(to, subject, html, fromName?, opts?): Promise<{sent, error?}>` from `apps/api/src/notifications/email.service.ts`, `PlatformSettingsService.str(key, fallback)`
- Produces:
  - `PasswordResetService.request(email: string): Promise<{ sent: boolean }>`
  - `PasswordResetService.reset(token: string, newPassword: string): Promise<{ ok: true }>`
  - Routes `POST /auth/password/forgot` `{ email }` and `POST /auth/password/reset` `{ token, password }`

- [ ] **Step 1: Add the model and the migration**

In `packages/db/prisma/schema.prisma`:

```prisma
model PasswordReset {
  id        BigInt   @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// sha256 of the token we emailed; the token itself is never stored
  tokenHash String   @unique @db.VarChar(64)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@map("password_resets")
}
```

Add `passwordResets PasswordReset[]` to the `User` model.

Create `packages/db/prisma/migrations/20260911100000_a_password_can_be_reset/migration.sql`:

```sql
CREATE TABLE `password_resets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `password_resets_tokenHash_key`(`tokenHash`),
  INDEX `password_resets_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `password_resets_userId_fkey` FOREIGN KEY (`userId`)
    REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
```

Then: `pnpm -F @rh/db exec prisma generate`

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/integration/a-password-can-be-reset.spec.ts`:

```ts
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
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import bcrypt from "bcryptjs";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePasswordResetService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;

const service = () => makePasswordResetService(asPrisma);

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

/** The token is emailed, never returned, so tests read the row and rebuild it. */
const tokenFor = async (): Promise<string> => {
  const row = await prisma.passwordReset.findFirstOrThrow({ orderBy: { id: "desc" } });
  return (row as unknown as { rawForTest: string }).rawForTest;
};

describe("a password that can be reset", () => {
  it("sets a new password when the token is good", async () => {
    const raw = await service().requestForTest("manager@example.com");

    await service().reset(raw, "brand-new-password");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.managerId } });
    expect(await bcrypt.compare("brand-new-password", user.passwordHash!)).toBe(true);
  });

  it("refuses the same token twice — a reset link is single use", async () => {
    const raw = await service().requestForTest("manager@example.com");
    await service().reset(raw, "brand-new-password");

    await expect(service().reset(raw, "another-password")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a token that has expired", async () => {
    const raw = await service().requestForTest("manager@example.com");
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(service().reset(raw, "another-password")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a password too short to be one", async () => {
    const raw = await service().requestForTest("manager@example.com");

    await expect(service().reset(raw, "short")).rejects.toMatchObject({ status: 400 });
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
```

Note `tokenFor` is unused above and must be **deleted** before committing — it is left here only to warn you off that approach: the token is hashed in the row, so it cannot be read back. `requestForTest` returns the raw token instead.

- [ ] **Step 3: Add the test helper**

In `apps/api/test/helpers/services.ts`, following the existing factory pattern in that file:

```ts
import { PasswordResetService } from "../../src/auth/password-reset.service";

export const makePasswordResetService = (prisma: PrismaService) =>
  new PasswordResetService(prisma, stubEmail(), stubSettings());
```

Check the file for how other factories stub `EmailService` and `PlatformSettingsService`; reuse those stubs rather than writing new ones. If none exists, add:

```ts
const stubEmail = () =>
  ({ send: async () => ({ sent: true }) }) as unknown as EmailService;
const stubSettings = () =>
  ({ str: async (_k: string, fallback: string) => fallback }) as unknown as PlatformSettingsService;
```

- [ ] **Step 4: Run the test and watch it fail**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-password-can-be-reset.spec.ts
```

Expected: FAIL — `Cannot find module '../../src/auth/password-reset.service'`.

- [ ] **Step 5: Write the service**

Create `apps/api/src/auth/password-reset.service.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { PlatformSettingsService } from "../common/platform-settings.service";
import { badRequest } from "../common/rbac";

const TTL_MS = 60 * 60 * 1000; // one hour
const MIN_PASSWORD = 8;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Always answers the same, whoever asked.
   *
   * A different reply for a known and an unknown address turns this endpoint
   * into a way to ask "does this person have an account here", which is a
   * question about the platform's customers that no stranger should be able
   * to put to it.
   */
  async request(email: string): Promise<{ sent: boolean }> {
    await this.issue(email);
    return { sent: true };
  }

  /** The raw token, for tests only — production never sees it outside the email. */
  async requestForTest(email: string): Promise<string> {
    const raw = await this.issue(email);
    if (!raw) throw new Error("no account for that address");
    return raw;
  }

  private async issue(email: string): Promise<string | null> {
    const address = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email: address } });
    if (!user || user.status !== "active") return null;

    const raw = randomBytes(32).toString("hex");
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TTL_MS) },
    });
    await this.prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const platformName = await this.settings.str("platform.name", "Resort Mela");
    const link = `${process.env.WEB_URL ?? "https://resortmela.app"}/reset?token=${raw}`;
    const r = await this.email.send(
      address,
      `${platformName} password reset`,
      `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#0f172a">
         <p>Somebody asked to reset the password for your ${platformName} account.</p>
         <p><a href="${link}" style="color:#047857;font-weight:bold">Choose a new password</a></p>
         <p style="color:#64748b;font-size:13px">The link works once and expires in an hour. If this was not you, nothing has changed and you can ignore this.</p>
       </div>`,
      platformName,
    );
    if (!r.sent) this.logger.warn(`reset email not delivered to ${address}: ${r.error}`);
    return raw;
  }

  async reset(token: string, newPassword: string): Promise<{ ok: true }> {
    if (newPassword.length < MIN_PASSWORD) {
      throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: hash(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw badRequest("That reset link has expired or has already been used. Ask for a new one.");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  }
}
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-password-can-be-reset.spec.ts
```

Expected: PASS, 6 tests. Delete the unused `tokenFor` helper from the spec if you copied it.

- [ ] **Step 7: Wire the routes**

In `apps/api/src/auth/auth.controller.ts`, add beside the existing `me/password` route (around L114). Follow the DTO style already in that file:

```ts
class ForgotPasswordDto {
  @IsString() @MaxLength(191) email!: string;
}
class ResetPasswordDto {
  @IsString() @MaxLength(128) token!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

@Post("password/forgot")
@HttpCode(200)
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.reset.request(dto.email);
}

@Post("password/reset")
@HttpCode(200)
resetPassword(@Body() dto: ResetPasswordDto) {
  return this.reset.reset(dto.token, dto.password);
}
```

Inject `@Inject(PasswordResetService) private readonly reset: PasswordResetService` into the controller's constructor, and add `PasswordResetService` to `providers` in `apps/api/src/auth/auth.module.ts`.

- [ ] **Step 8: Prove Nest can still start**

```bash
pnpm -F @rh/api exec vitest run test/integration/app-boots.spec.ts
```

Expected: PASS. This is the only test that proves the dependency graph wires up; a missing provider shows here and nowhere else.

- [ ] **Step 9: Apply the migration locally and commit**

```bash
pnpm -F @rh/db run db:baseline --apply
git add -A
git commit -m "auth: a password that can be reset, before the door that did it by accident is removed"
```

---

## Task 2: The web has a way to use it

**Files:**
- Create: `apps/web/src/app/reset/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx` (add the "Forgot password?" link)
- Test: none — this is a form over two endpoints already covered by Task 1. The web suite has no page-render harness (see spec §10); do not build one for this.

**Note on paths:** `/login` and `/signup` sit at `apps/web/src/app/login` and `apps/web/src/app/signup` — **not** inside the `(public)` group, which holds only the marketing homepage and the `book/` pages Task 5 deletes. Put `reset` beside `login`, not in `(public)`.

**Interfaces:**
- Consumes: `POST /auth/password/forgot` `{ email }`, `POST /auth/password/reset` `{ token, password }` from Task 1
- Produces: route `/reset?token=…`

- [ ] **Step 1: Find the login page and the api helper**

```bash
ls apps/web/src/app/\(public\)/
grep -n "export const api\|export async function api" apps/web/src/lib/api.ts | head -3
```

Read the login page fully before editing. Match its markup, its `Field`/`Input`/`Button` imports from `@/components/ui`, and its error handling.

- [ ] **Step 2: Add the reset page**

Create `apps/web/src/app/(public)/reset/page.tsx` — a client component that reads `token` from `useSearchParams()`, takes a new password and a confirmation, posts to `/auth/password/reset`, and on success sends the user to `/login` with a message. Show the endpoint's own error text on failure; it is written to be read by a person.

- [ ] **Step 3: Add the link on the login page**

A "Forgot password?" link under the password field, opening a small form that posts the email to `/auth/password/forgot`. After posting, show the same confirmation whatever the answer: *"If that address has an account, a reset link is on its way."* The endpoint deliberately cannot tell you whether it did (Task 1, Step 5) — the screen must not imply otherwise.

- [ ] **Step 4: Typecheck and build**

```bash
pnpm typecheck && pnpm -F @rh/web build
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "auth: a screen for the reset link"
```

---

## Task 3: Split `/cms` out before `/v1` can take it down

**Read spec §4.2 first.** `apps/api/src/platform/public-api.controller.ts` declares **two unrelated controllers**: `PublicApiController` (`@Controller("v1")`, `X-Api-Key`, for a resort's own website — being removed) and `PublicCmsController` (`@Controller("cms")`, no auth, the platform's own homepage — must survive). `/cms/plans` is where `resortmela.app` gets its pricing cards. Deleting the file to remove `/v1` empties the platform's own pricing page and stops anybody signing up.

This task moves `/cms` to safety and changes nothing else. It is separate from Task 4 so that a reviewer can approve the move without reviewing the deletion.

**Files:**
- Create: `apps/api/src/platform/marketing.controller.ts`
- Modify: `apps/api/src/platform/public-api.controller.ts` (remove `PublicCmsController` only)
- Modify: `apps/api/src/platform/platform.module.ts`
- Test: `apps/api/test/integration/the-pricing-page-still-has-prices.spec.ts`

**Interfaces:**
- Consumes: `PlatformService.publicCms()`, `PlatformService.publicPlans()`
- Produces: `MarketingController` exporting routes `GET /cms` and `GET /cms/plans`, unchanged in shape

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/integration/the-pricing-page-still-has-prices.spec.ts`:

```ts
/**
 * The homepage's price list outlives the resort-website API.
 *
 * `/v1` (a resort's own website, X-Api-Key) and `/cms` (this platform's own
 * marketing content, no auth) were declared in one file called
 * `public-api.controller.ts`. Removing `/v1` by deleting that file would take
 * the pricing cards off resortmela.app and stop anybody signing up — the
 * platform would lose its own shopfront while closing somebody else's door.
 *
 * This is the test that notices.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb } from "../helpers/db";
import { MarketingController } from "../../src/platform/marketing.controller";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  await prisma.platformPlan.create({
    data: { name: "STARTER", label: "Starter", monthlyFee: 2500, trialDays: 14, features: [] },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const controller = () => new MarketingController(makePlatformService(asPrisma));

describe("the platform's own shopfront", () => {
  it("still quotes a price list", async () => {
    const plans = await controller().plans();

    expect(plans).toHaveLength(1);
  });

  it("names a plan the owner can edit, not one written into the code", async () => {
    const plans = await controller().plans();

    expect(plans.map((p) => p.name)).toContain("STARTER");
  });

  it("carries the ticks the card draws, so an empty list is a visible failure", async () => {
    const plans = await controller().plans();

    expect(Array.isArray(plans[0]!.features)).toBe(true);
    expect(typeof plans[0]!.monthlyFee).toBe("number");
  });
});
```

`publicPlans()` returns a **bare array** of `{ name, label, monthlyFee, maxRooms, maxResorts, maxStaff, trialDays, blurb, highlight, features }`, with `monthlyFee` coerced to a number and `features` normalised to `string[]`. Verified 2026-09-11; if it has changed, match what it does rather than what this says.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm -F @rh/api exec vitest run test/integration/the-pricing-page-still-has-prices.spec.ts
```

Expected: FAIL — `Cannot find module '../../src/platform/marketing.controller'`.

- [ ] **Step 3: Create the new controller**

Create `apps/api/src/platform/marketing.controller.ts`:

```ts
import { Controller, Get, Inject } from "@nestjs/common";
import { PlatformService } from "./platform.service";

/**
 * This platform's own shopfront — not a customer's.
 *
 * It used to sit in `public-api.controller.ts` beside the resort-website API,
 * two things sharing the word "public" and nothing else. That is how a file
 * comes to hold both a door being closed and the pricing page that sells the
 * product; see the 2026-09-11 design, section 4.2.
 */
@Controller("cms")
export class MarketingController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  all() {
    return this.platform.publicCms();
  }

  /** The price list the homepage quotes — the same rows Platform → Plans edits. */
  @Get("plans")
  plans() {
    return this.platform.publicPlans();
  }
}
```

- [ ] **Step 4: Remove `PublicCmsController` from the old file and re-register**

Delete the `PublicCmsController` class from `apps/api/src/platform/public-api.controller.ts` (it starts at the `/** Public homepage CMS content (no auth). */` comment). In `platform.module.ts`, replace `PublicCmsController` in the `controllers` array with `MarketingController` and fix the import.

- [ ] **Step 5: Run the test, and prove the app still boots**

```bash
pnpm -F @rh/api exec vitest run test/integration/the-pricing-page-still-has-prices.spec.ts test/integration/app-boots.spec.ts
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "marketing: the platform's own pricing page moves out of the way of a door being closed"
```

---

## Task 4: The guest API, the resort-website API, and guest payments are removed

**Files:**
- Delete: `apps/api/src/guest/guest.controller.ts`, `guest.service.ts`, `guest.module.ts`
- Delete: `apps/api/src/platform/public-api.controller.ts`
- Delete: `apps/api/src/payments/intents.controller.ts`, `apps/api/src/payments/intents.service.ts`
- Modify: `apps/api/src/app.module.ts` (drop `GuestModule`; L73 rate-limit routes)
- Modify: `apps/api/src/platform/platform.module.ts`, `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/common/rbac.ts` (drop `apiKeyClaims`, ~L107)
- Modify: `apps/api/src/platform/platform.service.ts` (drop `publicResort`, `publicAvailability`, `authenticateApiKey`)
- Delete: any existing spec that exercises the removed routes — `apps/api/test/integration/public-api.spec.ts` and any guest spec
- Test: `apps/api/test/integration/a-guest-has-no-door.spec.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing. This task only removes. `apiKeyClaims` disappears, so anything importing it must stop.

- [ ] **Step 1: Find every caller before deleting anything**

```bash
grep -rn "GuestModule\|GuestService\|apiKeyClaims\|IntentsService\|PublicApiController\|authenticateApiKey" apps/api/src apps/api/test --include=*.ts
```

Write the list down. Every hit must be resolved in this task; a dangling import fails the build, and a dangling *provider* fails only `app-boots.spec.ts`.

- [ ] **Step 2: Write the failing test**

Create `apps/api/test/integration/a-guest-has-no-door.spec.ts`:

```ts
/**
 * A guest has no door — not a locked one, none.
 *
 * Guest booking was already refused: `bookings.create` threw for ROLE.GUEST
 * and `/v1/bookings` answered a polite 400. But refusing at the threshold
 * leaves the building standing — the availability endpoints, the trips page,
 * the OTP that minted the account, the checkout that took the money. The
 * owner's decision is that the building goes.
 *
 * This spec asserts absence, which is harder than it looks: a test that a
 * route refuses will keep passing after the route is gone for the wrong
 * reason. So it asserts the module cannot be imported at all.
 */
import { describe, expect, it } from "vitest";

const gone = async (path: string) => {
  try {
    await import(path);
    return false;
  } catch {
    return true;
  }
};

describe("the guest surface", () => {
  it("has no API module", async () => {
    expect(await gone("../../src/guest/guest.module")).toBe(true);
  });

  it("has no service", async () => {
    expect(await gone("../../src/guest/guest.service")).toBe(true);
  });

  it("has no online checkout", async () => {
    expect(await gone("../../src/payments/intents.service")).toBe(true);
  });
});

describe("the resort-website API", () => {
  it("is gone, and so are the claims it minted", async () => {
    expect(await gone("../../src/platform/public-api.controller")).toBe(true);

    const rbac = await import("../../src/common/rbac");
    expect("apiKeyClaims" in rbac).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-guest-has-no-door.spec.ts
```

Expected: FAIL — all four, because everything still exists.

- [ ] **Step 4: Delete, in this order**

```bash
git rm -r apps/api/src/guest
git rm apps/api/src/platform/public-api.controller.ts
git rm apps/api/src/payments/intents.controller.ts apps/api/src/payments/intents.service.ts
git rm -f apps/api/test/integration/public-api.spec.ts
```

Then, by hand:
- `app.module.ts`: remove the `GuestModule` import and its entry in `imports`.
- `app.module.ts` L73: `consumer.apply(RateLimitMiddleware).forRoutes("auth", "guest", "v1", "payments/webhook", "cms");` becomes `consumer.apply(RateLimitMiddleware).forRoutes("auth", "cms");`
- `platform.module.ts`: remove `PublicApiController` from `controllers` and its import.
- `payments.module.ts`: remove `IntentsController` from `controllers`, `IntentsService` from `providers`, and both imports.
- `common/rbac.ts`: delete `apiKeyClaims` (~L107).
- `platform.service.ts`: delete `publicResort`, `publicAvailability`, `authenticateApiKey`. **Keep** `listApiKeys`, `createApiKey` and the revoke method — the table stays (spec §4.3); only the thing keys opened is gone.
- `bookings.service.ts` ~L212: the comment about `apiKeyClaims` minting RESORT_ADMIN now describes something that no longer exists. Delete the comment, not the code around it.

- [ ] **Step 5: Run the test, the boot gate, and the neighbours**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-guest-has-no-door.spec.ts test/integration/app-boots.spec.ts
```

Expected: PASS. Then the specs most likely to have leaned on what you removed:

```bash
pnpm -F @rh/api exec vitest run test/integration/booking-engine.spec.ts test/integration/guests-do-not-book.spec.ts test/integration/permissions.spec.ts
```

If `guests-do-not-book.spec.ts` fails because it drove a removed route, **rewrite it to prove the same thing through the doors that remain** — a resort's own desk and an agency. Do not delete it. The rule it protects outlives the route it used.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "guests: the doors, the rooms behind them, and the corridors between"
```

---

## Task 5: The web stops pointing at doors that are gone

**Files:**
- Delete: `apps/web/src/app/(public)/book/` (whole directory: `page.tsx`, `trips/page.tsx`, `[id]/page.tsx`)
- Modify: `apps/web/src/lib/api.ts` (the `guest*` block, ~L158–178)
- Modify: `apps/web/src/app/(public)/page.tsx` (L262, L282, L633–634, and the `#api` section)
- Modify: `apps/web/src/app/(app)/settings/page.tsx` (L140 `TABS` — hide "API keys")
- Test: none new; `pnpm typecheck` is the gate, and it is a real one here

- [ ] **Step 1: Delete the pages and the client block**

```bash
git rm -r "apps/web/src/app/(public)/book"
```

In `apps/web/src/lib/api.ts`, delete the block that begins `// ── guest web booking ──` and ends after `guestOtpVerify`. Note the comment already sitting in it: *"There is no `guestBook`. A guest does not book directly"* — that note was the half-measure this phase finishes.

- [ ] **Step 2: Take the links off the homepage**

In `apps/web/src/app/(public)/page.tsx`:
- L262: remove the `<Link href="/book">Book a stay</Link>`
- L282: remove `["/book", "Book a stay"]` from the nav array
- L633–634: remove the footer's "Guest booking" and "My trips" links
- Remove the `#api` marketing section entirely, and its `["#api", "API"]` nav entry — it advertises the resort-website API that Task 4 removed

- [ ] **Step 3: Hide the API keys tab**

In `apps/web/src/app/(app)/settings/page.tsx` L140, remove `"API keys"` from `TABS`. **Leave the `ApiKeysTab` component and its `{tab === "API keys" && …}` branch in place**, with a comment above the removed entry:

```tsx
// "API keys" is not on this list while nothing consumes a key: the resort-website
// API went with the guest surface (2026-09-11 design, §4.3). The tab's code stays
// so it can come back with the feature; a screen that mints a key opening nothing
// is a lie told to a customer.
```

- [ ] **Step 4: Typecheck, test, build**

```bash
pnpm typecheck && pnpm -F @rh/web test && pnpm -F @rh/web build
```

Expected: all clean. `typecheck` is the real gate — it finds every remaining importer of the deleted `guest*` functions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "web: nothing on screen points at a guest door any more"
```

---

## Task 6: OTP and the GUEST role are removed

Only now, with Tasks 1 and 2 shipped, is it safe (spec §4.4).

**Files:**
- Modify: `apps/api/src/auth/auth.controller.ts` (drop `otp/request` L55–62, `otp/verify` L64–72, and their DTOs)
- Modify: `apps/api/src/auth/auth.service.ts` (drop `requestOtp` L56–116, `verifyOtp` L120–161)
- Modify: `packages/shared/src/index.ts` (`ROLE.GUEST`, L13)
- Modify: `apps/api/src/bookings/bookings.service.ts` (L218), `apps/api/src/engage/engage.service.ts` (L158), `apps/api/src/tenancy/tenancy.service.ts` (L192)
- Modify: `packages/db/prisma/schema.prisma` (drop `OtpCode`)
- Create: `packages/db/prisma/migrations/20260911110000_no_guest_accounts/migration.sql`
- Test: extend `apps/api/test/integration/a-guest-has-no-door.spec.ts`

- [ ] **Step 1: Extend the failing test**

Append to `apps/api/test/integration/a-guest-has-no-door.spec.ts`:

```ts
import { ROLE } from "@rh/shared";

describe("the guest account", () => {
  it("is not a role anybody can hold", () => {
    expect("GUEST" in ROLE).toBe(false);
  });

  it("cannot be minted by a code, because there is no code", async () => {
    const auth = await import("../../src/auth/auth.service");
    const proto = auth.AuthService.prototype as unknown as Record<string, unknown>;

    expect("requestOtp" in proto).toBe(false);
    expect("verifyOtp" in proto).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-guest-has-no-door.spec.ts
```

Expected: FAIL on both new tests.

- [ ] **Step 3: Remove OTP and the role**

- `auth.controller.ts`: delete both `otp/*` routes and the `OtpRequestDto` / `OtpVerifyDto` classes.
- `auth.service.ts`: delete `requestOtp` and `verifyOtp` whole. Then check whether `SmsService`, `randomInt`, `hashOtp`, `timingSafeEqualHex`, `OTP_TTL_MS` and `OTP_MAX_ATTEMPTS` still have any user in the file; delete each that does not, and drop the injection if `SmsService` is now unused.
- `packages/shared/src/index.ts` L13: remove `GUEST: "GUEST",` from `ROLE`.
- `bookings.service.ts` L218: delete the `if (claims.role === ROLE.GUEST)` refusal. **Read the surrounding block first** — the `SYSTEM_ACTOR_ID` refusal beside it stays.
- `engage.service.ts` L158: the branch reading `if (applicant.role !== "GUEST")` promoted a guest to an agency. Nobody can be a GUEST now, so it is unreachable. Replace the whole promote block with a plain refusal: an applicant who is not already an `AGENT` cannot be approved. Phase 5 replaces this flow entirely.
- `tenancy.service.ts` L192: `staffUsers.filter((u) => u.user.role !== ROLE.GUEST)` — the filter has nothing to filter. Remove the filter, keep the `.map`.

- [ ] **Step 4: Drop the table**

Remove the `OtpCode` model from `packages/db/prisma/schema.prisma` and any `otpCodes` back-relation on `User`. Create `packages/db/prisma/migrations/20260911110000_no_guest_accounts/migration.sql`:

```sql
DROP TABLE IF EXISTS `otp_codes`;
```

The table is `otp_codes` — verified against `@@map` in the schema on 2026-09-11.

Then: `pnpm -F @rh/db exec prisma generate`

- [ ] **Step 5: Run the test and the neighbours**

```bash
pnpm -F @rh/api exec vitest run test/integration/a-guest-has-no-door.spec.ts test/integration/app-boots.spec.ts test/integration/permissions.spec.ts test/integration/guests-do-not-book.spec.ts
```

Expected: PASS. Any spec that logged in via OTP must be rewritten to use the password login — that is a real change of meaning and should be visible in the diff.

- [ ] **Step 6: Apply the migration and commit**

```bash
pnpm -F @rh/db run db:baseline --apply
git add -A
git commit -m "auth: no code mints an account, because no account is a guest"
```

---

## Task 7: `public_api` leaves the plan shelf

A plan row still listing `public_api` names a feature nothing implements. `isPlanFeature` validates on the way in, so the next edit of such a plan would fail validation for a reason nobody could act on.

**Files:**
- Modify: `packages/shared/src/index.ts` (`PLAN_FEATURES`)
- Create: `packages/db/prisma/migrations/20260911120000_a_feature_that_is_gone/migration.sql`
- Test: `apps/api/test/integration/a-plan-that-locks.spec.ts` (existing — update, do not replace)

- [ ] **Step 1: See who is affected before changing anything**

```bash
grep -rn "public_api" apps/api/src apps/web/src packages/shared/src apps/api/test --include=*.ts --include=*.tsx
```

- [ ] **Step 2: Update the existing spec first, and watch it fail**

In `apps/api/test/integration/a-plan-that-locks.spec.ts`, find every use of `public_api` and replace it with another real feature key from `PLAN_FEATURES` (`restaurant` is a safe choice). Add:

```ts
it("does not offer a feature nothing implements any more", () => {
  expect(ALL_PLAN_FEATURES).not.toContain("public_api");
});
```

```bash
pnpm -F @rh/api exec vitest run test/integration/a-plan-that-locks.spec.ts
```

Expected: FAIL on the new assertion.

- [ ] **Step 3: Remove the feature and strip it from stored plans**

Delete the `public_api` entry from `PLAN_FEATURES` in `packages/shared/src/index.ts`.

Create `packages/db/prisma/migrations/20260911120000_a_feature_that_is_gone/migration.sql`:

```sql
-- `features` is JSON mapped to longtext on MariaDB, so this is a string edit,
-- not a JSON one: MariaDB has no JSON_REMOVE-by-value and CAST(... AS JSON) is
-- a syntax error there. Handles the key with or without a trailing comma, then
-- tidies the double comma and the leading/trailing comma cases.
UPDATE `platform_plans`
SET `features` = REPLACE(REPLACE(REPLACE(REPLACE(
      `features`,
      '"public_api",', ''),
      ',"public_api"', ''),
      '"public_api"', ''),
      '[,', '[')
WHERE `features` LIKE '%public_api%';
```

- [ ] **Step 4: Verify the JSON survived the string surgery**

```bash
pnpm -F @rh/db run db:baseline --apply
pnpm -F @rh/api exec vitest run test/integration/a-plan-that-locks.spec.ts test/integration/plans-the-owner-can-change.spec.ts
```

Expected: PASS. If a plan's `features` came out as invalid JSON (`[]` with a stray comma), fix the SQL rather than the data — the same statement will run on the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "plans: a feature nobody implements leaves the shelf"
```

---

## Task 8: The mobile app is retired, not left ambiguous

`apps/mobile` is the guest app. It has been frozen for weeks; this phase makes that a fact rather than a habit.

**Files:**
- Modify: `apps/mobile/package.json` (`"private": true`)
- Modify: `turbo.json` if it names mobile tasks
- Create: `apps/mobile/README.md`

- [ ] **Step 1: Check what still references it**

```bash
grep -rn "mobile" turbo.json pnpm-workspace.yaml package.json
```

- [ ] **Step 2: Mark it private and out of the pipeline**

Set `"private": true` in `apps/mobile/package.json`. Remove any mobile entry from the `turbo.json` pipeline so `pnpm build` and `pnpm typecheck` stop walking it.

- [ ] **Step 3: Say why, where the next person will look**

Create `apps/mobile/README.md`:

```markdown
# Retired — the guest app

This was the guest-facing Expo app. On 2026-09-11 the platform became
business-to-business: it sells to resorts and to travel agencies, and a guest
is a record in a resort's register, not an account holder. See
`docs/superpowers/specs/2026-09-11-two-sided-platform-design.md`.

The code is kept because deleting it buys nothing and git remembers either way.
It is out of the build pipeline and nothing here is maintained. Do not import
from it, and do not treat anything in it as a description of the current API —
the endpoints it calls were removed in the same phase that retired it.
```

- [ ] **Step 4: Prove the pipeline is clean, and commit**

```bash
pnpm typecheck && pnpm build
git add -A
git commit -m "mobile: the guest app is retired, and says so"
```

---

## Task 9: The whole suite, then the deploy gate

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Run everything, once, alone**

```bash
pnpm -F @rh/api test
```

~22 minutes. Nothing else may run against `resorthub_test` while this does. Expect a green run. If a spec fails on a hook timeout in `agent-tours.spec.ts`, re-run that file alone before treating it as real — it has flaked that way before under load.

- [ ] **Step 2: Web, types, build**

```bash
pnpm -F @rh/web test && pnpm typecheck && pnpm build
```

- [ ] **Step 3: Count what is gone, and check nothing is half-gone**

```bash
grep -rn "guestResorts\|guestAvailability\|guestTrips\|apiKeyClaims\|requestOtp\|verifyOtp\|ROLE.GUEST\|public_api" apps packages --include=*.ts --include=*.tsx | grep -v node_modules
```

Expected: no output. Any hit is a piece of the surface still standing.

- [ ] **Step 4: Update STATUS.md**

Add a section recording what phase 1 removed and what replaced it, and link the spec. Claim only what a test proves — STATUS.md has previously carried three claims that turned out to be aspirational, and that is the habit this project is trying to break.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: STATUS.md after the guests left"
```

- [ ] **Step 6: Stop. Do not deploy.**

Report the suite figures to the owner and wait. The deploy touches a live server and drops a table; it is his call and his alone. When he authorises it, the sequence is: back up first (`mysqldump | gzip`, verify the gzip), `git pull`, `pnpm install`, `db:baseline` **dry run** and read the list before applying, apply, `prisma generate`, `pnpm build`, `pm2 restart api web`.

Then verify **by opening the pages**, not by curling the API. A 200 is not proof a screen works: the last deploy's reports fix was verified with curl, reported as done, and the page was still broken. Open the homepage and check the pricing cards are there; open the login page and check the reset link works.

---

## Self-Review

**Spec coverage.** Every row of spec §4.1 maps to a task: guest API, `/v1`, `apiKeyClaims`, intents (Task 4) · OTP, `ROLE.GUEST`, `OtpCode` (Task 6) · web pages, client block, homepage links, API-keys tab (Task 5) · `apps/mobile` (Task 8) · rate-limit routes (Task 4, Step 4). §4.2's trap is Task 3. §4.3's "space, not dead code" is Task 4 Step 4 (keep the key methods) and Task 5 Step 3 (hide, don't delete). §4.4's replacement is Tasks 1–2. §4.5's `public_api` consequence is Task 7; its `ROLE.GUEST` consequence is Task 6, Step 3. §10's phase-1 gate is Task 9.

**Ordering.** Task 1 precedes Task 6 because the replacement must exist before the thing it replaces is removed. Task 3 precedes Task 4 because `/cms` must move before its file is deleted. Task 5 (web) can precede or follow Task 4 (API); it is placed after so that a half-finished afternoon leaves the UI pointing at routes that still answer, rather than at routes that have vanished.

**Names used consistently.** `PasswordResetService.request` / `.requestForTest` / `.reset` (Tasks 1, 2) · `MarketingController.all` / `.plans` (Task 3) · `password_resets`, `platform_plans`, `otp_codes` table names (Tasks 1, 6, 7).

**Verified while writing, on 2026-09-11:** every file this plan says to delete exists; `publicPlans()` returns a bare array with `features: string[]` and `monthlyFee: number`; the OTP table is `otp_codes`; `/login` and `/signup` live outside the `(public)` route group. Line numbers were read the same day and will drift — each step names searchable content as well, so use the content and treat the number as a hint.

**Nothing in this plan is a placeholder.** Where a decision is genuinely the implementer's (how the reset page is laid out, Task 2 Step 2), the constraint that matters is stated instead of the markup.

---

# Addendum — every account has an email and a phone (2026-09-11)

Added during execution, after the whole-branch review found that the password
reset (Task 1) can only reach an account with an email address, and that
self-signup stores a phone only — so the one account that matters most, a
resort owner who signed up alone, could never use "Forgot password?". The
owner's decision, in his words: *"all user will have both email and phone, can
login both with email or phone and password, forgot password must have for the
users, all users."* Existing rows that lack one get a recognisable placeholder
(his choice over deleting them or asking at next login), so both columns can be
NOT NULL now.

This belongs to phase 1: spec §4.4 says OTP goes and a real forgot-password
replaces it in the same phase. A replacement that misses the owner is not a
replacement. Same rules as the rest of this plan — red first, targeted specs,
one vitest run at a time, migrations hand-written and run through `db:baseline`.

## Task 10: Every account has an email and a phone

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (`User.phone`, `User.email` become required; both stay `@unique`)
- Create: `packages/db/prisma/migrations/20260911130000_every_account_has_an_email_and_a_phone/migration.sql`
- Modify: `apps/api/src/auth/auth.controller.ts` (`SignupDto` gains a required email), `apps/api/src/auth/auth.service.ts` (`signup`)
- Modify: `apps/api/src/platform/platform.controller.ts` DTOs and `apps/api/src/platform/platform.service.ts`: `createResortUser`, `inviteAgentByEmail`, `createAgentStaff`, `updateResortUser`
- Modify: `apps/api/test/helpers/db.ts`, every spec that creates a user, `packages/db/prisma/seed.ts`
- Test: `apps/api/test/integration/every-account-has-an-email-and-a-phone.spec.ts`

**Rules:**
- Every path that creates a user requires both a valid email (trimmed, lower-cased) and a phone (normalised the way that path already normalises it), and refuses a duplicate of either with a sentence a person can read (409 for "already has an account", 400 for missing/invalid — follow each path's existing convention).
  - `signup`: add the email.
  - `createResortUser`: add the email.
  - `inviteAgentByEmail`: add the phone (the invite still emails the credentials). Linking an *existing* user is unchanged.
  - `createAgentStaff`: both required, no longer "email or phone".
- `updateResortUser` may change a person's email and phone (so a placeholder can be replaced), under the same rule as a password or role change: if the person also works at another resort, only the platform owner may. Neither can be blanked.
- Login with either identifier reaches the same account — `loginWithPassword` already branches on `@`; prove it.
- The migration fills gaps with placeholders that can never be mistaken for real contact details, then makes both NOT NULL:
  - `email` → `CONCAT('user-', id, '@placeholder.invalid')` where NULL or empty (`.invalid` is reserved and never delivers)
  - `phone` → `CONCAT('placeholder-', id)` where NULL or empty (not a phone number at all, so it can never match a phone login)
  - then `ALTER TABLE users MODIFY email ... NOT NULL, MODIFY phone ... NOT NULL`, keeping each column's existing type, charset/collation and unique index — read `SHOW CREATE TABLE users` first and match it.
  - It creates and drops nothing, so `baseline-db.mjs` classes it data-only and always runs it.

- [ ] **Step 1: Write the failing spec** — prose, in the house style:
  - the database will not hold an account without an email or without a phone (assert the two column definitions are `NOT NULL`, the way `a-guest-has-no-door.spec.ts` checks the role column);
  - each of the four creation paths refuses a missing email, a missing phone, and a duplicate of each;
  - `updateResortUser` replaces an email and a phone, and refuses to blank either;
  - one person signs in with their email and with their phone and gets the same account.
- [ ] **Step 2: Run it and watch it fail.** Show the red.
- [ ] **Step 3: Schema, migration, `pnpm -F @rh/db exec prisma generate`, `pnpm -F @rh/api test:setup`.** Before applying locally, count the local users missing an email or a phone; after `db:baseline` (dry run, then `--apply`), show that every one now carries a placeholder and nothing else changed.
- [ ] **Step 4: The four paths and the update.** Then fix every test fixture and `seed.ts` so each created user has both (unique values). `tsc` does not cover `apps/api/test/` — Prisma will throw at runtime on a missing field, so grep `user.create` and run every file you touch.
- [ ] **Step 5: Green.** The new spec, `app-boots.spec.ts`, `a-password-can-be-reset.spec.ts`, `tenant-isolation.spec.ts`, and every spec whose fixtures changed; `pnpm typecheck`.
- [ ] **Step 6: Commit** — `accounts: every one has an email and a phone, so every one can get back in`.

## Task 11: Forgot password works for everyone

**Files:**
- Modify: `apps/api/src/auth/password-reset.service.ts`, `apps/api/src/auth/auth.controller.ts` (`ForgotPasswordDto`)
- Modify: `apps/web/src/app/login/page.tsx` (the forgot panel), `apps/web/src/lib/password-reset.ts` if its message changes
- Test: `apps/api/test/integration/a-password-can-be-reset.spec.ts` (extend)

**Rules:**
- The forgot request takes an **identifier** — an email or a phone, the same way login does — and always mails the link to the email on the account. SMS is dormant, and every account now has an email, so this is how "every user" reaches it.
- The answer is identical for a known email, a known phone, and anything unknown, and nothing is sent for an unknown identifier.
- A placeholder email (`@placeholder.invalid`) gets nothing sent — there is nobody there — and the answer is still the same.
- The panel's label says "Email or phone"; its confirmation sentence stays neutral ("If that account exists, a reset link is on its way to its email address.").

- [ ] **Step 1: Extend the spec, red first:**
  - a phone identifier puts the link in the account's email;
  - an unknown phone gets nothing and the same answer;
  - a placeholder address gets nothing and the same answer.
- [ ] **Step 2: Watch it fail; show the red.**
- [ ] **Step 3: Implement; web label and sentence.** The web spec for the sentence changes with it.
- [ ] **Step 4: Green** — the reset spec, `app-boots.spec.ts`, `pnpm -F @rh/web exec vitest run`, `pnpm typecheck`.
- [ ] **Step 5: Commit** — `auth: a forgotten password comes back by email, whichever way you sign in`.

## Task 12: The console asks for both

**Files:**
- Modify: `apps/web/src/app/signup/page.tsx` (an email field, required)
- Modify: every console form that posts to `POST /resorts/:id/users`, `POST /resorts/:id/invite-agent`, `POST /agent/staff`, and `PATCH /resorts/:id/users/:userId` (grep `apps/web/src` for those paths)
- Create: `apps/web/src/lib/contact.ts` — one small pure check that both are present and plausible, used by those forms
- Test: `apps/web/test/contact.spec.ts`

**Rules:**
- A form cannot be submitted without both. It shows the API's own sentence when the server refuses (duplicate email or phone).
- The team edit form can change email and phone.
- No page-render harness (spec §10); the pure module carries the decision.

- [ ] **Step 1: The spec for `contact.ts`, red first; show the red.**
- [ ] **Step 2: The module, then the forms.**
- [ ] **Step 3: Green** — `pnpm -F @rh/web exec vitest run`, `pnpm typecheck`, `pnpm -F @rh/web build`.
- [ ] **Step 4: Commit** — `web: every form that makes an account asks for an email and a phone`.

## Task 13: What the whole-branch review left, the smoke scripts, and the record

**Files:**
- Modify: `apps/api/src/platform/platform.service.ts` (`createApiKey` — delete everything after the refusal; the space is the table and the note, never dead code, spec §4.3)
- Modify: `apps/api/test/integration/a-password-can-be-reset.spec.ts` (the enumeration test asserts the outbox — one mail for a known address, none for an unknown — and its docstring stops claiming the timing is identical)
- Modify: `apps/web/src/lib/api.ts` (~L53 comment that still uses guest browsing as its example)
- Delete: `apps/api/scripts/guest-smoke.ps1` (owner approved, 2026-09-11)
- Modify: `apps/api/scripts/activity-smoke.ps1` (cut the guest booking/activity sections), `apps/api/scripts/smoke.ps1` (cut step 13, the OTP guest login), `apps/api/scripts/phase6-smoke.ps1` (a desk booking by the manager replaces the guest trip) — owner approved
- Modify: `ROADMAP.md` (§2 "Guest OTP" and the OTP-based reset idea: a short note that both are superseded, pointing at the spec — no deletion)
- Modify: `STATUS.md` (the §3.x entry for phase 1 gains the addendum: every account has both, placeholders exist and how to replace one, forgot works by either identifier — each claim with the spec that proves it)
- Modify: `docs/superpowers/specs/2026-09-11-two-sided-platform-design.md` §4.4 (one paragraph recording the owner's decision)

- [ ] **Step 1: Red first for the two code changes** — the strengthened enumeration test fails against a service that mails an unknown address (prove it with a temporary mutation if the current code already passes, and say so); `createApiKey`'s refusal is already tested (Task 7).
- [ ] **Step 2: The changes above.** Smoke scripts: they are PowerShell against a running API; do not run them — read each edited script end to end so every variable it uses is still defined.
- [ ] **Step 3: Green** — the reset spec, `a-plan-that-locks.spec.ts`, `app-boots.spec.ts`, `pnpm typecheck`.
- [ ] **Step 4: Commit** — one commit per concern is fine; the house voice either way.
