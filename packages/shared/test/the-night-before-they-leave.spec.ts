/**
 * "Departs" on a register of nights means the guest leaves tomorrow.
 *
 * Found on the owner's phone, 2026-09-20. The dashboard said
 * **"Departures 0 — due out today"** and the day sheet, for the same
 * resort on the same day, put **"Departs"** on three rooms. Both came
 * from the server and both were arithmetically right:
 *
 *   - `/today` asks `checkOut === today` — who leaves today. Nobody did.
 *   - `/day-sheet` asks `checkOut === tomorrow` — whose last night is
 *     tonight. Three rooms', BK-00001 and BK-00004, both out on the 21st.
 *
 * Two different questions under words that read the same. The console
 * was blunter about it and said **"Departs today" / "আজ ছাড়ছে"** for a
 * guest leaving the next morning — a clerk reads that, counts the room
 * as free this afternoon, and sells a night that is already taken.
 *
 * The register is a grid of nights: each column is a night, and a cell is
 * somebody sleeping in that room that night. So the honest chip names the
 * morning they go, and names it as a date, because a day sheet is opened
 * on any date and "tomorrow" on the sheet for the 25th is the 26th.
 */
import { describe, expect, it } from "vitest";
import { lastNightLabel } from "../src/day-label";

describe("the chip on a guest's last night", () => {
  it("names the morning they go, not the night they are still here", () => {
    expect(lastNightLabel("2026-09-21")).toBe("Out 21 Sep");
  });

  it("names it the same way whatever date the sheet is open on", () => {
    // the sheet for 25 Sep shows this cell too, and it still says the 26th
    expect(lastNightLabel("2026-09-26")).toBe("Out 26 Sep");
  });

  /**
   * The sheet's own date is the year to compare against, not the machine's
   * clock: a register opened on 31 December shows a cell whose stay ends
   * in January, and that is the one place the year is worth four
   * characters. A caller with no date to compare against gets no year
   * rather than a guess.
   */
  it("carries the year when the stay crosses out of the sheet's", () => {
    expect(lastNightLabel("2027-01-01", "2026-12-31")).toBe("Out 1 Jan 2027");
  });

  it("leaves the year off when the sheet is in the same one", () => {
    expect(lastNightLabel("2026-09-21", "2026-09-20")).toBe("Out 21 Sep");
  });

  it("leaves it off when there is no sheet date to compare against", () => {
    expect(lastNightLabel("2027-01-01")).toBe("Out 1 Jan");
  });

  it("takes a Date as readily as a string, like everything else here", () => {
    expect(lastNightLabel(new Date("2026-12-03T00:00:00Z"))).toBe("Out 3 Dec");
  });

  /**
   * An imported booking can be missing its checkout. A chip that says
   * "Out —" is noise; the caller is told there is nothing to say.
   */
  it.each([[null], [undefined], [""], ["not a date"]])("says nothing about %p", (given) => {
    expect(lastNightLabel(given as string | null)).toBeNull();
  });
});
