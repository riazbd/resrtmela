/**
 * Every route the client calls exists (2026-09-21).
 *
 * `@rh/shared`'s `client.ts` is the one description of this API. Two
 * hundred and sixty calls now go through it, and a typed return says
 * nothing at all about whether the URL under it is real — a path with a
 * typo, a wrong verb, or a route that was renamed on the server
 * type-checks perfectly and 404s in front of a customer.
 *
 * The sweep that brought the console onto the client found exactly that
 * already there: `bookings.cancel` posted to `/bookings/:id/cancel`, a
 * route this API has never declared. It had been in the client for
 * months. Nothing caught it because nothing called it — and the danger
 * in a dead method is not the method, it is the next person writing a
 * screen against it.
 *
 * **What this checks, and what it cannot.** It matches method and path
 * against the decorators, so it catches a wrong verb, a misspelled
 * segment and a route that has moved. It says nothing about the shape
 * either side sends — that is what the types are for, and what
 * `a-route-that-answers-anything` keeps honest.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const API_SRC = join(__dirname, "../src");
const CLIENT = join(__dirname, "../../../packages/shared/src/client.ts");

function everyTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return everyTs(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

/** `:resortId` and `${id}` are the same hole; both become `:x`. */
const holes = (p: string) => p.replace(/:[A-Za-z_]\w*/g, ":x").replace(/\/+$/, "") || "/";

/** Every `METHOD /path` a Nest decorator declares, prefix included. */
function declaredRoutes(): Set<string> {
  const out = new Set<string>();
  for (const file of everyTs(API_SRC)) {
    const src = readFileSync(file, "utf8");
    // one prefix per class; a method belongs to the last @Controller above it
    const prefixes = [...src.matchAll(/@Controller\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g)].map((m) => ({
      at: m.index ?? 0,
      prefix: m[1] ?? m[2] ?? "",
    }));
    for (const v of src.matchAll(/@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g)) {
      const at = v.index ?? 0;
      let prefix = "";
      for (const p of prefixes) if (p.at < at) prefix = p.prefix;
      const path = [prefix, v[2] ?? v[3] ?? ""].filter(Boolean).join("/");
      out.add(`${v[1]!.toUpperCase()} ${holes(`/${path}`)}`);
    }
  }
  return out;
}

/** Every `METHOD /path` the typed client calls. */
function clientCalls(): { key: string; raw: string }[] {
  const src = readFileSync(CLIENT, "utf8");
  const out: { key: string; raw: string }[] = [];
  for (const m of src.matchAll(/http<[^>]*>\(\s*(`[^`]*`|"[^"]*")\s*(?:,\s*\{([^}]*))?/g)) {
    const raw = m[1]!;
    const verb = /method:\s*"(\w+)"/.exec(m[2] ?? "");
    const path = raw
      .slice(1, -1)
      // a query builder is not part of the path
      .replace(/\$\{qs\([^}]*\}\)?\}?/g, "")
      .replace(/\$\{[^}]*\}/g, ":x")
      .replace(/\$\{[^}]*$/, "");
    out.push({ key: `${(verb?.[1] ?? "GET").toUpperCase()} ${holes(path)}`, raw });
  }
  return out;
}

describe("the typed client and the API agree on what exists", () => {
  it("finds routes on both sides at all", () => {
    // a matcher that silently found nothing would pass every test below
    expect(declaredRoutes().size).toBeGreaterThan(200);
    expect(clientCalls().length).toBeGreaterThan(200);
  });

  it("has no client call pointing at a route the API never declared", () => {
    const declared = declaredRoutes();
    const unmatched = clientCalls()
      .filter((c) => !declared.has(c.key))
      .map((c) => `${c.key}   — ${c.raw}`);
    expect([...new Set(unmatched)].sort()).toEqual([]);
  });
});
