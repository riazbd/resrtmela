/**
 * Reading a migration to see what it would create.
 *
 * The live database was built by `db push` before migrations existed, so it
 * already has tables and columns that later migrations try to add — and
 * `migrate deploy` dies on the first one with "Duplicate column name". The
 * documented fix is a hand-written list of migrations to mark as applied,
 * which is exactly the kind of instruction that goes stale and is followed
 * wrongly at 2am.
 *
 * The baseline tool works it out instead: for each pending migration, what
 * would it create, and does the database already have all of it? This is the
 * part that reads the SQL, and it is the part worth testing — the rest is
 * introspection and two `prisma` calls.
 */
import { describe, expect, it } from "vitest";
import { objectsCreatedBy } from "../scripts/migration-objects.mjs";

describe("what a migration would create", () => {
  it("finds a new table", () => {
    const sql = `
      CREATE TABLE \`platform_settings\` (
        \`key\` VARCHAR(64) NOT NULL,
        PRIMARY KEY (\`key\`)
      ) DEFAULT CHARACTER SET utf8mb4;
    `;
    expect(objectsCreatedBy(sql)).toEqual([{ kind: "table", table: "platform_settings" }]);
  });

  it("finds added columns, including several in one statement", () => {
    const sql = "ALTER TABLE `resorts` ADD COLUMN `suspendedAt` DATETIME(3) NULL,\n    ADD COLUMN `suspendedReason` VARCHAR(32) NULL;";
    expect(objectsCreatedBy(sql)).toEqual([
      { kind: "column", table: "resorts", name: "suspendedAt" },
      { kind: "column", table: "resorts", name: "suspendedReason" },
    ]);
  });

  it("finds a new index", () => {
    const sql = "CREATE UNIQUE INDEX `payments_bookingId_clientRef_key` ON `payments`(`bookingId`, `clientRef`);";
    expect(objectsCreatedBy(sql)).toEqual([
      { kind: "index", table: "payments", name: "payments_bookingId_clientRef_key" },
    ]);
  });

  it("ignores comments, so an explanation cannot be read as SQL", () => {
    const sql = `
      -- CREATE TABLE \`not_really\` (this is a comment about why)
      CREATE TABLE \`real_one\` (\`id\` INT);
    `;
    expect(objectsCreatedBy(sql)).toEqual([{ kind: "table", table: "real_one" }]);
  });

  it("reports nothing for a migration that only changes data", () => {
    const sql = "UPDATE `roles` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'export.run');";
    expect(objectsCreatedBy(sql)).toEqual([]);
  });

  it("does not mistake a dropped column for a created one", () => {
    expect(objectsCreatedBy("ALTER TABLE `resorts` DROP COLUMN `settings`;")).toEqual([]);
  });
});
