/**
 * A guest link that comes back after the surface is deleted.
 *
 * The owner's 2026-09-11 decision took the guest booking pages and the
 * resort-website API off the platform, but nothing stops a future edit from
 * quietly re-adding a `<Link href="/book">` to a homepage nav array, or a
 * fetch call to a `/guest/...` route the API no longer answers. Those would
 * not fail a type check — `href` is a plain string and `fetch` does not know
 * the server's route table — so this reads the whole `apps/web/src` tree
 * itself and fails the moment either shape reappears, naming the exact
 * `file:line` so the next person does not have to go hunting for it.
 *
 * `/bookings` (no `.spec` word for it, but worth saying twice) is a real
 * staff page and must keep matching nothing here — the regexes below only
 * accept `/book` when the character right after it closes the string or
 * starts a sub-path, which `/bookings` never does.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/** Every `file:line  <line text>` where `re` matches, across the whole source tree. */
function findDoors(re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) {
        hits.push(`${relative(SRC_ROOT, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  return hits;
}

describe("nothing on screen points at a guest door any more", () => {
  it("has no string literal target of /book or /book/... anywhere in apps/web/src", () => {
    // a quoted string whose content starts with /book and either ends right
    // there or continues as a sub-path — matches "/book", "/book/trips" and
    // `/book/${id}`, never "/bookings" (the "s" is not a quote or a slash)
    const BOOK_TARGET = /(["'`])\/book(?:\/[^"'`]*)?\1/;
    const hits = findDoors(BOOK_TARGET);
    expect(hits.join("\n")).toBe("");
  });

  it("makes no API call to a /guest/ or /v1 path anywhere in apps/web/src", () => {
    const GUEST_OR_V1_CALL = /(["'`])\/(guest\/[^"'`]*|v1(?:\/[^"'`]*)?)\1/;
    const hits = findDoors(GUEST_OR_V1_CALL);
    expect(hits.join("\n")).toBe("");
  });

  it("no longer has an app/(public)/book directory", () => {
    expect(existsSync(join(SRC_ROOT, "app", "(public)", "book"))).toBe(false);
  });
});
