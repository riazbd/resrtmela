/**
 * Prepares the integration-test database (resorthub_test).
 *
 *   pnpm -F @rh/api test:setup
 *
 * Creates the database when it can, then applies the migration chain. Set
 * ADMIN_DATABASE_URL to an account that may CREATE DATABASE if the app user
 * cannot; otherwise the script prints the one statement to run by hand.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const dbPackage = resolve(repoRoot, "packages", "db");
const TEST_DB = "resorthub_test";

function appDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(repoRoot, ".env"), "utf8");
  const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)/m);
  if (!match) throw new Error("DATABASE_URL not found in .env");
  return match[1];
}

const testUrl = new URL(appDatabaseUrl());
const appUser = testUrl.username;
testUrl.pathname = `/${TEST_DB}`;

const createSql =
  `CREATE DATABASE IF NOT EXISTS ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; ` +
  `GRANT ALL PRIVILEGES ON ${TEST_DB}.* TO '${appUser}'@'localhost'; FLUSH PRIVILEGES;`;

// Run Prisma's JS entry through node: Node 20 refuses to spawn .cmd shims
// without a shell, and going through a shell would mangle a password
// containing shell metacharacters.
const prismaEntry = resolve(dbPackage, "node_modules", "prisma", "build", "index.js");
const runPrisma = (args, extra = {}) =>
  execFileSync(process.execPath, [prismaEntry, ...args], { cwd: dbPackage, ...extra });

function ensureDatabase() {
  // CREATE DATABASE works from any connection, and Prisma refuses to attach to
  // the `mysql` system schema, so default to the app's own database.
  const adminUrl = process.env.ADMIN_DATABASE_URL ?? appDatabaseUrl();
  try {
    runPrisma(["db", "execute", "--url", adminUrl, "--stdin"], {
      input: createSql,
      stdio: ["pipe", "ignore", "ignore"],
    });
    console.log(`OK  ${TEST_DB} ready`);
    return true;
  } catch {
    console.error(
      `Could not create ${TEST_DB} automatically.\n` +
        `Run this as a database admin, then re-run this script:\n\n  ${createSql}\n\n` +
        `Or set ADMIN_DATABASE_URL to an account that may CREATE DATABASE.`,
    );
    return false;
  }
}

if (!ensureDatabase()) process.exit(1);

runPrisma(["migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl.toString() },
});
console.log(`OK  migrations applied to ${TEST_DB}`);
