#!/usr/bin/env node
/**
 * Build `resorthub_test` so the API suite can run against it.
 *
 *   pnpm -F @rh/db test-db
 *
 * **Why this is not `prisma migrate deploy`.** The migration history cannot
 * replay from an empty database: `20260916100000_a_year_at_a_time` queries
 * `yearlyFee`, a column an earlier migration had already dropped by the time
 * it was written, so a from-scratch replay dies at migration eleven. That is
 * also why `prisma migrate dev` is blocked here — it builds a shadow database
 * the same way. Production is fine: those migrations ran in order, on a
 * database that had the column at the time.
 *
 * So the test database is built from the *schema* with `db push`. Which
 * leaves one gap, and it is the reason this file exists rather than a line in
 * a README that somebody will not read:
 *
 * **`subscriptions.accountLiveKey` is not in `schema.prisma` and cannot be.**
 * It is a MySQL generated column — `accountId` when the subscription is live,
 * NULL otherwise — with a unique index over it, which is what stops an
 * account holding two live subscriptions. Prisma has no way to express a
 * generated column, so `db push` does not create it, and worse, *removes it*
 * every time it runs against a database that has one.
 *
 * Two specs read that constraint directly — `one-subscription` and
 * `an-account-is-the-subscriber` — and they fail with "promise resolved
 * instead of rejecting", which reads like a bug in the subscription code and
 * is not. It cost an hour on 2026-09-28. Hence: push, then put it back, in
 * that order, every time.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DB = dirname(dirname(fileURLToPath(import.meta.url)));

/** resorthub_test, derived from DATABASE_URL — the same rule the suite uses. */
function testUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? readEnvFile();
  if (!base) throw new Error("DATABASE_URL is not set — cannot derive the test database URL");
  const url = new URL(base);
  url.pathname = "/resorthub_test";
  return url.toString();
}

function readEnvFile() {
  try {
    const text = execFileSync(process.platform === "win32" ? "cmd" : "cat",
      process.platform === "win32" ? ["/c", "type", join(DB, ".env")] : [join(DB, ".env")],
      { encoding: "utf8" });
    return /^DATABASE_URL="?([^"\n\r]+)"?/m.exec(text)?.[1];
  } catch {
    return undefined;
  }
}

const url = testUrl();
/**
 * `npx` is a shell script on Windows, so `execFileSync` cannot spawn it
 * directly — hence `shell: true`, and hence the arguments being ours alone
 * and never a caller's.
 */
const run = (args, input) =>
  execFileSync("npx", args, {
    cwd: DB,
    encoding: "utf8",
    input,
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });

console.log(`building ${url.replace(/:[^:@/]+@/, ":***@")}`);

run(["prisma", "db", "push", "--accept-data-loss", "--skip-generate"], undefined);

/**
 * The generated column, put back after every push. Guarded so running this
 * twice is not an error — `db push` removes it, but a hand-repaired database
 * may still have it.
 */
console.log("restoring subscriptions.accountLiveKey (see the note at the top)");
run(
  ["prisma", "db", "execute", "--url", url, "--stdin"],
  `
  SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions'
                 AND COLUMN_NAME = 'accountLiveKey');
  SET @sql := IF(@has = 0,
    "ALTER TABLE \`subscriptions\` ADD COLUMN \`accountLiveKey\` INTEGER GENERATED ALWAYS AS (CASE WHEN \`status\` IN ('TRIAL','ACTIVE','PAST_DUE') THEN \`accountId\` ELSE NULL END) VIRTUAL",
    "DO 0");
  PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

  SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions'
                 AND INDEX_NAME = 'subscriptions_accountLiveKey_key');
  SET @sql2 := IF(@idx = 0,
    "CREATE UNIQUE INDEX \`subscriptions_accountLiveKey_key\` ON \`subscriptions\`(\`accountLiveKey\`)",
    "DO 0");
  PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;
`,
);

console.log("resorthub_test is ready");
