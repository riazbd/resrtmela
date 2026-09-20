/**
 * The booking form opens on the resort's day (2026-09-21).
 *
 * Found by checking the housekeeping mark on production at two in the
 * morning Dhaka time: the phone's grid said "needs cleaning" and the
 * console's said nothing. The mark was fine. The **date** was wrong.
 *
 * `iso` is `d.toISOString().slice(0, 10)` — UTC, always — and the form
 * seeded check-in with `iso(new Date())`. Between midnight and six in
 * the morning in Dhaka, UTC is still yesterday, so a clerk taking a
 * walk-in at one in the morning opened a form pre-filled with
 * **yesterday's date** and a check-out of today. Press Create and the
 * resort has sold a night that has already gone.
 *
 * The housekeeping mark only made it visible: it is shown when check-in
 * is today, and check-in was not today.
 *
 * This project has met this exact fault four times now — the day sheet,
 * a register spec, an integration test that failed at ten past midnight,
 * and now here. `todayIn(resort.timezone)` is the answer every time, and
 * the console already imports it. `iso` stays for what it is for:
 * turning a `Date` somebody already holds into a wire string.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { todayIn, addDaysIso } from "@rh/shared";

const SRC = path.resolve(process.cwd(), "src");
const form = fs.readFileSync(path.join(SRC, "app/(app)/bookings/page.tsx"), "utf8");

describe("the booking form's default dates", () => {
  it("does not seed check-in from the UTC clock", () => {
    expect(form).not.toMatch(/useState\(iso\(new Date\(\)\)\)/);
  });

  it("does not seed check-out from it either", () => {
    expect(form).not.toMatch(/useState\(iso\(new Date\(Date\.now\(\) \+ 86400000\)\)\)/);
  });

  it("asks the resort what day it is", () => {
    expect(form).toMatch(/useState\(\(\) => todayIn\(activeResort\?\.timezone\)\)/);
  });

  it("makes the night after it the check-out", () => {
    expect(form).toMatch(/addDaysIso\(todayIn\(activeResort\?\.timezone\), 1\)/);
  });
});

/**
 * The arithmetic itself, so the rule this rests on is checked and not
 * merely quoted.
 */
describe("the two clocks really do disagree", () => {
  it("gives Dhaka a later date than UTC in the small hours", () => {
    // 2026-09-21T19:30:00Z is the 22nd at one in the morning in Dhaka
    const at = new Date("2026-09-21T19:30:00.000Z");
    expect(at.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(todayIn("Asia/Dhaka", at)).toBe("2026-09-22");
  });

  it("counts one night forward without touching a Date", () => {
    expect(addDaysIso("2026-09-22", 1)).toBe("2026-09-23");
  });
});
