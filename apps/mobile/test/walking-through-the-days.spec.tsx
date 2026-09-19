/**
 * Moving one day at a time, on a screen with no keyboard.
 *
 * The console has a date box and two arrows; a phone has no date box worth
 * typing into, so the arrows are the whole control and they have to be big
 * enough to hit and honest about where they are.
 *
 * The day that counts is the resort's, not the phone's. A clerk in Bandarban
 * whose phone is on UTC would otherwise open "today" and be shown yesterday
 * for the first six hours of every morning — `todayIn` is the same function
 * the console uses, so both clients start on the same square.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { DateNav } from "../src/design/date-nav";

/** A fixed instant, so "today" is a fact rather than the day this runs. */
const NOON_UTC = new Date("2026-09-20T12:00:00Z");

describe("the two arrows", () => {
  it("goes back a day", async () => {
    const onChange = jest.fn();
    const r = await render(<DateNav value="2026-09-20" onChange={onChange} />);
    await fireEvent.press(r.getByRole("button", { name: "Previous day" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-19");
  });

  it("goes forward a day", async () => {
    const onChange = jest.fn();
    const r = await render(<DateNav value="2026-09-20" onChange={onChange} />);
    await fireEvent.press(r.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-21");
  });

  /** Month ends are where hand-rolled date arithmetic goes wrong. */
  it("crosses a month boundary without inventing the 31st of September", async () => {
    const onChange = jest.fn();
    const r = await render(<DateNav value="2026-09-30" onChange={onChange} />);
    await fireEvent.press(r.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-01");
  });
});

describe("what it reads", () => {
  it("says the day, spelled out, because 09/10 is two dates", async () => {
    const r = await render(<DateNav value="2026-09-20" onChange={jest.fn()} />);
    expect(r.getByText("Sunday, 20 September 2026")).toBeTruthy();
  });

  it("says Today when it is, so nobody counts back to check", async () => {
    const r = await render(
      <DateNav value="2026-09-20" onChange={jest.fn()} timezone="Asia/Dhaka" now={NOON_UTC} />,
    );
    expect(r.getByText("Today")).toBeTruthy();
  });

  it("does not say Today when it is not", async () => {
    const r = await render(
      <DateNav value="2026-09-19" onChange={jest.fn()} timezone="Asia/Dhaka" now={NOON_UTC} />,
    );
    expect(r.queryByText("Today")).toBeNull();
  });
});

describe("getting back to today", () => {
  /**
   * The resort's today. Six hours ahead of UTC, so a phone left on UTC and a
   * clerk in Bandarban disagree about the date for most of a working morning
   * — and the register they are both looking at is the resort's.
   */
  it("returns to the resort's day, not the phone's", async () => {
    const onChange = jest.fn();
    const r = await render(
      <DateNav
        value="2026-09-15"
        onChange={onChange}
        timezone="Asia/Dhaka"
        now={new Date("2026-09-20T20:30:00Z")}
      />,
    );
    await fireEvent.press(r.getByRole("button", { name: "Today" }));
    // 20:30 UTC is already the 21st in Dhaka
    expect(onChange).toHaveBeenCalledWith("2026-09-21");
  });

  it("offers no way back to today while it is already there", async () => {
    const r = await render(
      <DateNav value="2026-09-20" onChange={jest.fn()} timezone="Asia/Dhaka" now={NOON_UTC} />,
    );
    expect(r.queryByRole("button", { name: "Today" })).toBeNull();
  });
});
