/**
 * The console says which rooms need cleaning (2026-09-21).
 *
 * The phone's grid learned this first, and a rule the two clients do not
 * share is a rule that drifts. `roomOffer` already lives in `@rh/shared`
 * for exactly that: there are now three things worth saying about a room
 * and they are not the same thing, and a clerk who moves between the
 * desk and the phone should meet the same words either way.
 *
 * A source scan rather than a render, because what is being checked here
 * is that the console *asks the shared rule the same question* — passing
 * `arrivingToday` — and gives the answer somewhere to show. Whether the
 * amber is the right amber is a screenshot's job, and it got one.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { roomOffer } from "@rh/shared";

const SRC = path.resolve(process.cwd(), "src");
const choice = fs.readFileSync(path.join(SRC, "app/(app)/bookings/room-choice.tsx"), "utf8");
const form = fs.readFileSync(path.join(SRC, "app/(app)/bookings/page.tsx"), "utf8");
const inventory = fs.readFileSync(path.join(SRC, "app/(app)/rooms/page.tsx"), "utf8");
const register = fs.readFileSync(path.join(SRC, "app/(app)/daysheet/page.tsx"), "utf8");

describe("the console asks the shared rule the whole question", () => {
  it("tells roomOffer whether the guest arrives today", () => {
    expect(choice).toMatch(/roomOffer\(room,\s*\{\s*arrivingToday/);
  });

  it("works out that day from the resort's clock, not the browser's", () => {
    // `new Date()` in a browser is the reader's timezone, and a desk in
    // Dhaka read by a manager in London would disagree about "today"
    expect(form).toMatch(/todayIn\(/);
  });

  it("draws the dirty case rather than letting it fall through to free", () => {
    expect(choice).toMatch(/"dirty"/);
  });

  /**
   * The point of the whole change: it warns, it does not refuse. A
   * `disabled` driven by anything but `sellable` would quietly lock the
   * room and send the clerk round the app.
   */
  it("leaves the button enabled, because sellable is what disables it", () => {
    expect(choice).toMatch(/disabled=\{!offer\.sellable\}/);
    expect(roomOffer({ status: "ACTIVE", busyNights: [], housekeeping: "DIRTY" }, { arrivingToday: true }).sellable).toBe(true);
  });
});

describe("the two clients say one thing", () => {
  it("takes its words from the shared rule and writes none of its own", () => {
    for (const phrase of ["needs cleaning", "being cleaned"]) {
      // the note is the shared rule's; the console must not spell it again
      expect(choice.toLowerCase()).not.toContain(`"${phrase}"`);
    }
    expect(choice).toMatch(/offer\.note/);
  });
});

/**
 * The inventory table, which is a different question with a different
 * answer.
 *
 * There is no date here — the list is the resort *now* — so nothing is
 * weighed and `roomOffer` is not asked. The state is simply shown, in
 * `housekeepingLabel`'s words, so the table and the housekeeping screen
 * cannot drift apart.
 */
describe("the rooms table", () => {
  it("shows the state in the housekeeper's own words", () => {
    expect(inventory).toMatch(/housekeepingLabel/);
  });

  it("stays quiet about a room that is ready", () => {
    // ten badges on ten rows is no badge at all — the housekeeping screen
    // made exactly this mistake on its first afternoon
    expect(inventory).toMatch(/!== "CLEAN"/);
  });

  it("does not ask roomOffer, which is about a stay and not an inventory", () => {
    expect(inventory).not.toMatch(/roomOffer/);
  });
});

/**
 * The register, which is the screen a clerk actually reads each morning.
 *
 * "Free" is about the bookings and stays true. What it never meant was
 * that somebody could be shown in — and the housekeeping design said so
 * on the day it was written, while task 5 shipped without it.
 */
describe("the day sheet", () => {
  it("marks a free room that nobody has cleaned", () => {
    expect(register).toMatch(/housekeepingLabel/);
  });

  it("only does so on today's register", () => {
    expect(register).toMatch(/onToday/);
    expect(register).toMatch(/date === todayIn\(/);
  });

  it("leaves a ready room saying nothing extra", () => {
    expect(register).toMatch(/!== "CLEAN"/);
  });
});
