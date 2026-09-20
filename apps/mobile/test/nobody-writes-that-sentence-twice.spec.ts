/**
 * The sentence about choosing a resort is written in exactly one place.
 *
 * On 2026-09-20 nineteen screens told people "No resort selected — choose
 * a resort from the More tab" *while the session was still restoring*. The
 * sentence was true in one state and shown in two, and nothing in a
 * browser could reveal it: storage there answers in under a millisecond,
 * so the wrong half never had time to appear. It took a cold deep link on
 * a device, and the device is not a net that can be cast every day.
 *
 * `WhichResort` is the fix — it waits while `loading` is true and speaks
 * only once there is nothing left to wait for. But a fix is not a rule.
 * The twentieth screen will be written by somebody reaching for `<Empty
 * message="No resort selected" />` because that is what the nineteen
 * others looked like, and the defect comes back one screen at a time.
 *
 * So the rule is here instead of on a device: a screen may not write that
 * sentence itself, and a screen that asks "do I have a resort" must answer
 * with the component that also knows how to wait.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..", "app");
const SRC = join(__dirname, "..", "src");
/** The one place allowed to say it. */
const HOME = join(SRC, "screens", "which-resort.tsx");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...sources(APP), ...sources(SRC)].filter((f) => f !== HOME);
const show = (f: string) => relative(join(__dirname, ".."), f).replace(/\\/g, "/");

describe("the sentence about choosing a resort", () => {
  it("is written in which-resort.tsx and nowhere else", () => {
    const guilty = files.filter((f) => /No resort selected/.test(readFileSync(f, "utf8")));
    expect(guilty.map(show)).toEqual([]);
  });

  it("is the whole of what which-resort.tsx is for", () => {
    const home = readFileSync(HOME, "utf8");
    expect(home).toMatch(/No resort selected/);
    // it waits before it speaks, which is the half the nineteen were missing
    expect(home).toMatch(/loading/);
  });

  /**
   * The stronger half of the rule. A screen that reads `activeResort` is a
   * screen that can be opened before the session has settled on one, so it
   * owes the person the waiting state. Reading the resort without importing
   * `WhichResort` is how a screen ends up inventing its own empty state —
   * which is the mistake, whatever words it chooses.
   *
   * Tabs that carry no resort-scoped data are listed out: they either have
   * no such state to get wrong, or they are the screen people are being
   * sent *to*.
   */
  const NO_RESORT_NEEDED = new Set([
    "app/(tabs)/more.tsx",
    "app/(tabs)/_layout.tsx",
    "app/login.tsx",
    "app/index.tsx",
    "app/+not-found.tsx",
    // These four read the resort for a detail and never gate on it, so
    // they render correctly without one. Each loads by an id of its own.
    //
    //   bookings/[id]        — the invoice line, shown only when both exist
    //   bookings/[id]/edit   — the timezone a date picker starts in
    //   bookings/[id]/pay    — the payment methods; "CASH" is the default
    //                          and is always a valid method, so no resort
    //                          means fewer chips, not a broken screen
    //   profile              — marks which of your resorts is open now
    "app/bookings/[id]/index.tsx",
    "app/bookings/[id]/edit.tsx",
    "app/bookings/[id]/pay.tsx",
    "app/(tabs)/(desk)/profile.tsx",
  ]);

  it("is what every screen that reads activeResort reaches for", () => {
    const screens = sources(APP).filter((f) => !NO_RESORT_NEEDED.has(show(f)));
    const missing = screens.filter((f) => {
      const text = readFileSync(f, "utf8");
      if (!/activeResort/.test(text)) return false;
      return !/WhichResort/.test(text);
    });
    expect(missing.map(show)).toEqual([]);
  });
});
