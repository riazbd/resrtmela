/**
 * The seed has to be told which database it is about to empty.
 *
 * It lives in packages/db, which has no test runner of its own; the guard is a
 * pure function so it can be tested from here rather than adding one.
 *
 * On 2026-09-12 this deploy script ran against production:
 *
 *     pnpm -F @rh/db seed -- --force
 *
 * `--force` was the only gate, and it was already typed into the script. The
 * seed truncates all fifty-odd tables, so it destroyed a workspace the owner
 * had built by hand, and the only reason it was recoverable was a backup taken
 * minutes earlier for an unrelated reason.
 *
 * `--force` alone cannot be enough, because a flag written once in a script
 * means nothing about the machine the script later runs on. The operator has to
 * name the database, and the name has to match the one DATABASE_URL actually
 * points at — so a command written for a developer's machine refuses on the
 * server instead of obeying.
 */
import { describe, expect, it } from "vitest";
import { databaseNameOf, assertSafeToSeed } from "../../../packages/db/prisma/seed/guard";

const DEV = "mysql://root:pw@localhost:3306/resorthub";
const PROD = "mysql://app:secret@127.0.0.1:3306/resortmela";

describe("which database the seed is allowed to empty", () => {
  it("reads the name out of the connection string", () => {
    expect(databaseNameOf(DEV)).toBe("resorthub");
    expect(databaseNameOf("mysql://u:p@h:3306/x?connection_limit=5")).toBe("x");
  });

  it("refuses when nobody asked for it at all", () => {
    expect(() => assertSafeToSeed([], DEV)).toThrow(/deletes every row/i);
  });

  it("refuses a bare --force, because a flag names no database", () => {
    expect(() => assertSafeToSeed(["--force"], DEV)).toThrow(/--force=resorthub/);
  });

  it("runs when the name matches what DATABASE_URL points at", () => {
    expect(assertSafeToSeed(["--force=resorthub"], DEV)).toBe("resorthub");
  });

  /** The one that matters: a command written for a laptop, run on the server. */
  it("refuses when the operator named a different database", () => {
    expect(() => assertSafeToSeed(["--force=resorthub"], PROD)).toThrow(/resortmela/);
    expect(() => assertSafeToSeed(["--force=resorthub"], PROD)).toThrow(/resorthub/);
  });

  it("does not hand over the incantation it just refused", () => {
    // printing "--force=resortmela" here would turn the guard into a hint for
    // getting past it; the operator has to reach that conclusion themselves
    let message = "";
    try {
      assertSafeToSeed(["--force=resorthub"], PROD);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/--force=resortmela/);
  });

  it("refuses when there is no DATABASE_URL to check against", () => {
    expect(() => assertSafeToSeed(["--force=resorthub"], "")).toThrow(/DATABASE_URL/);
  });

  it("is not fooled by a name that merely starts the same", () => {
    expect(() => assertSafeToSeed(["--force=resort"], PROD)).toThrow();
    expect(() => assertSafeToSeed(["--force=resortmela_old"], PROD)).toThrow();
  });
});
