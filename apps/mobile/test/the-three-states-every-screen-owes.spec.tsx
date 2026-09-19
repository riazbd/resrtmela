/**
 * Loading, empty, failed — and the fourth one nobody writes.
 *
 * The plan's constraint reads: *every screen file implements loading, empty
 * and error. A happy path alone is not a finished screen.* Fourteen places in
 * the console once wrote `.catch(() => setRows([]))`, which turns an expired
 * token into a cheerful "nothing here" — a manager whose session had lapsed
 * read "No team members yet" on a resort with twenty staff and had no way to
 * tell that from the truth.
 *
 * A phone adds the fourth: rows that came out of the device's own cache
 * because the signal did not. Figures that old, shown without saying so, are
 * worse than an empty screen — a clerk reading yesterday's occupancy cannot
 * tell it is yesterday's. So `Stale` exists and says how old, in words.
 *
 * These are one module rather than four, because a screen that has to import
 * from four places to be complete will be completed three times out of four.
 */
import { render, fireEvent } from "@testing-library/react-native";
import { ApiError } from "@rh/shared";
import { Empty, Loading, Problem, Stale } from "../src/design/states";

describe("while it is loading", () => {
  it("says what it is loading, so a spinner is not the whole message", async () => {
    const r = await render(<Loading what="today's arrivals" />);
    expect(r.getByText("Loading today's arrivals…")).toBeTruthy();
  });

  it("tells a screen reader that something is happening", async () => {
    const r = await render(<Loading what="the day sheet" />);
    expect(r.getByLabelText("Loading the day sheet…")).toBeTruthy();
  });
});

describe("when there is genuinely nothing", () => {
  it("says so in the screen's own words", async () => {
    const r = await render(<Empty message="No arrivals today" />);
    expect(r.getByText("No arrivals today")).toBeTruthy();
  });

  it("can say what to do about it", async () => {
    const r = await render(
      <Empty message="No rooms yet" hint="Add your rooms before taking a booking." />,
    );
    expect(r.getByText("Add your rooms before taking a booking.")).toBeTruthy();
  });
});

describe("when it failed", () => {
  /**
   * The API writes its refusals as sentences for the person who hit them —
   * "This stay is checked out; its guests can no longer change". Replacing
   * that with "Something went wrong" throws away the only part that helps.
   */
  it("shows the API's own words", async () => {
    const r = await render(<Problem error={new Error("This stay is checked out")} />);
    expect(r.getByText("This stay is checked out")).toBeTruthy();
  });

  it("still says something when what failed was not an Error", async () => {
    const r = await render(<Problem error={"boom"} />);
    expect(r.getByText("Could not load this")).toBeTruthy();
  });

  it("offers to try again, and does", async () => {
    const retry = jest.fn();
    const r = await render(<Problem error={new Error("Network request failed")} onRetry={retry} />);
    await fireEvent.press(r.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  /**
   * Retrying a 403 asks the same question and gets the same answer. The
   * button is not offered, because offering it says the failure might pass.
   */
  it("does not offer to try again when the answer will not change", async () => {
    const r = await render(<Problem error={new ApiError(403, "You do not have permission")} />);
    expect(r.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers it for a server error, which might", async () => {
    const r = await render(<Problem error={new ApiError(500, "Something broke")} onRetry={jest.fn()} />);
    expect(r.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("when the figures came off the device", () => {
  it("says how old they are, in words", async () => {
    const r = await render(<Stale age="2 hours ago" />);
    expect(r.getByText("Showing what this phone last saw — 2 hours ago")).toBeTruthy();
  });

  it("draws nothing at all when the figures are live", async () => {
    const r = await render(<Stale age={null} />);
    expect(r.toJSON()).toBeNull();
  });
});
