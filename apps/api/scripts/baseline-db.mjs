/**
 * Bring a database that predates migrations onto the migration chain.
 *
 *   node apps/api/scripts/baseline-db.mjs           # say what it would do
 *   node apps/api/scripts/baseline-db.mjs --apply   # do it
 *
 * The live database was built with `db push` before migrations existed, so it
 * already has tables and columns that later migrations try to add, and
 * `migrate deploy` dies on the first one: "Duplicate column name". Until now
 * the fix was a hand-written list of migrations to mark applied — the kind of
 * instruction that goes stale and gets followed wrongly at 2am.
 *
 * This works it out instead. For each pending migration it reads what the SQL
 * would create and asks the database whether it already has all of it:
 *
 *   everything already there  → mark applied, do not run it
 *   nothing there             → leave pending, `migrate deploy` will run it
 *   some of it there          → stop and say so
 *
 * A migration that creates nothing gets the mirror question. If it only drops
 * things, the tool checks whether they are already gone — a `db push` database
 * is routinely missing an index a later migration was written to drop, and
 * running that DROP fails and stops the whole deployment. If it drops nothing
 * either, it is data-only and simply runs.
 *
 * That last case is the one that matters. A half-applied migration cannot be
 * resolved automatically without either losing a change or corrupting the
 * history, so the tool refuses and hands it to a person. It never guesses, it
 * changes nothing without --apply, and it only ever writes to Prisma's own
 * _prisma_migrations table — never to your data.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { objectsCreatedBy, objectsDroppedBy } from "./migration-objects.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const dbPackage = resolve(repoRoot, "packages", "db");
const migrationsDir = resolve(dbPackage, "prisma", "migrations");
const APPLY = process.argv.includes("--apply");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(repoRoot, ".env"), "utf8");
  const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)/m);
  if (!match) throw new Error("DATABASE_URL not found in .env");
  return match[1];
}

// Prisma's JS entry through node: Node 20 refuses to spawn .cmd shims without
// a shell, and a shell would mangle a password containing metacharacters.
const prismaEntry = resolve(dbPackage, "node_modules", "prisma", "build", "index.js");
const runPrisma = (args, extra = {}) =>
  execFileSync(process.execPath, [prismaEntry, ...args], { cwd: dbPackage, ...extra });

const url = databaseUrl();
const schema = new URL(url).pathname.slice(1);

/**
 * What the database already has. Read once, up front: asking per object would
 * be hundreds of round trips, and this is small.
 */
async function existingObjects(prisma) {
  const tables = new Set();
  const columns = new Set();
  const indexes = new Set();
  for (const row of await prisma.$queryRawUnsafe(
    "SELECT TABLE_NAME as t, COLUMN_NAME as c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
    schema,
  )) {
    tables.add(row.t);
    columns.add(`${row.t}.${row.c}`);
  }
  for (const row of await prisma.$queryRawUnsafe(
    "SELECT TABLE_NAME as t, INDEX_NAME as i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?",
    schema,
  )) {
    indexes.add(`${row.t}.${row.i}`);
  }
  return { tables, columns, indexes };
}

/**
 * Reads rows through the generated Prisma client.
 *
 * `prisma db execute` runs statements but returns no results, and shelling out
 * to the `mysql` client would add a dependency that is not always on PATH — on
 * Windows it usually is not. The client is already in the repository and
 * already knows the connection string.
 */
async function connect() {
  const clientPath = pathToFileURL(resolve(dbPackage, "node_modules", "@prisma", "client", "index.js")).href;
  const { PrismaClient } = await import(clientPath);
  return new PrismaClient({ datasources: { db: { url } } });
}

async function appliedMigrations(prisma) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT migration_name FROM `_prisma_migrations` WHERE finished_at IS NOT NULL",
    );
    return new Set(rows.map((r) => r.migration_name));
  } catch {
    // no _prisma_migrations table yet: nothing has been applied
    return new Set();
  }
}

async function main() {
  if (!existsSync(migrationsDir)) throw new Error(`no migrations at ${migrationsDir}`);
  const all = readdirSync(migrationsDir).filter((d) => existsSync(join(migrationsDir, d, "migration.sql"))).sort();
  const prisma = await connect();
  const applied = await appliedMigrations(prisma);
  const db = await existingObjects(prisma);
  await prisma.$disconnect();

  const pending = all.filter((name) => !applied.has(name));
  if (pending.length === 0) {
    console.log(`${schema}: up to date (${all.length} migrations).`);
    return;
  }

  const toResolve = [];
  const toRun = [];
  const partial = [];

  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
    const objects = objectsCreatedBy(sql);

    if (objects.length > 0) {
      const present = objects.filter((o) => hasObject(db, o));
      if (present.length === objects.length) toResolve.push(name);
      else if (present.length === 0) toRun.push(name);
      else partial.push({ name, present, missing: objects.filter((o) => !hasObject(db, o)) });
      continue;
    }

    /**
     * Nothing created. That is either a data-only migration or a drop-only one,
     * and the difference matters: a drop-only migration on a `db push` database
     * is usually trying to remove something that was never created, and running
     * it fails and takes the deployment with it. That is not hypothetical — it
     * is what `20260827163511_guest_phonekey_index` did to a live server, and
     * this tool sent it there by calling every create-nothing migration
     * "data-only" and running it.
     *
     * So ask the other question: is the database already in the state this
     * migration was reaching for?
     */
    const drops = objectsDroppedBy(sql);
    if (drops.length === 0) {
      // genuinely data-only — an UPDATE or an INSERT. Nothing to detect, run it.
      toRun.push(name);
      continue;
    }
    const stillThere = drops.filter((o) => hasObject(db, o));
    if (stillThere.length === 0) toResolve.push(name); // already gone: job done
    else if (stillThere.length === drops.length) toRun.push(name);
    else {
      partial.push({
        name,
        present: stillThere,
        missing: drops.filter((o) => !hasObject(db, o)),
      });
    }
  }

  console.log(`Database: ${schema}`);
  console.log(`Applied already: ${applied.size} of ${all.length}\n`);

  if (toResolve.length > 0) {
    console.log("Already in the database — will be marked applied without running:");
    for (const name of toResolve) console.log(`  ${name}`);
    console.log();
  }
  if (toRun.length > 0) {
    console.log("Not there yet — `prisma migrate deploy` will run these:");
    for (const name of toRun) console.log(`  ${name}`);
    console.log();
  }
  if (partial.length > 0) {
    console.log("PARTIALLY present — needs a person, nothing was changed:");
    for (const p of partial) {
      console.log(`  ${p.name}`);
      console.log(`    has:     ${p.present.map(describe).join(", ")}`);
      console.log(`    missing: ${p.missing.map(describe).join(", ")}`);
    }
    console.log(
      "\nResolve these by hand: apply the missing pieces, then re-run this tool.\n" +
        "It will not guess, because guessing here either loses a change or corrupts the history.",
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("Nothing was changed. Re-run with --apply to do it.");
    return;
  }

  for (const name of toResolve) {
    console.log(`resolve --applied ${name}`);
    runPrisma(["migrate", "resolve", "--applied", name], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  }
  console.log("\nmigrate deploy");
  runPrisma(["migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  console.log(`\n${schema} is on the migration chain.`);
}

function hasObject(db, o) {
  if (o.kind === "table") return db.tables.has(o.table);
  if (o.kind === "column") return db.columns.has(`${o.table}.${o.name}`);
  return db.indexes.has(`${o.table}.${o.name}`);
}

const describe = (o) => (o.kind === "table" ? `table ${o.table}` : `${o.table}.${o.name}`);

try {
  main();
} catch (error) {
  console.error(`\nbaseline-db failed: ${error.message}`);
  if (String(error.message).includes("ENOENT")) {
    console.error(
      "This tool needs the `mysql` client on PATH to read information_schema.\n" +
        "On the server it usually is; locally, add MySQL's bin directory to PATH.",
    );
  }
  process.exitCode = 1;
}
