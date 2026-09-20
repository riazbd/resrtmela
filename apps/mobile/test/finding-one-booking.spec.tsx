/**
 * The bookings list, on a screen four inches wide.
 *
 * The console gives this seven filters across a toolbar. A phone has room
 * for the two a clerk standing at a counter actually uses — a search box and
 * which states to show — and the order they read in, which is the one thing
 * the list got wrong for months: it was check-in descending, so a booking
 * taken this morning for next March sat wherever March fell.
 *
 * The matching is the server's. Filtering a fetched page in the browser is
 * how a guest on row 101 came back "no bookings match", and a phone that
 * holds fewer rows would get that wrong sooner.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingRow, Page } from "@rh/shared";

const mockList = jest.fn();
const mockPush = jest.fn();
let mockResort: { id: number; name: string } | null = { id: 3, name: "Demo Bay Resort" };

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: mockResort }),
  client: { bookings: { list: (...a: unknown[]) => mockList(...a) } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BookingsScreen = require("../app/(tabs)/bookings").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const row = (over: Partial<BookingRow> = {}): BookingRow =>
  ({
    id: 41,
    code: "BK-00041",
    state: "CONFIRMED",
    paymentState: "PARTIAL",
    source: "PHONE",
    // the shape the API actually sends — a serialised `DateTime`, not a bare
    // civil date. This fixture said "2026-09-21" until 2026-09-20, agreed
    // with the code rather than with the server, and the list drew
    // "Invalid Date → Invalid Date" over eight real bookings while every
    // test here was green.
    checkIn: "2026-09-21T00:00:00.000Z",
    checkOut: "2026-09-23T00:00:00.000Z",
    guest: { id: 9, fullName: "Rafiq Hasan", phone: "01811110001" },
    agent: null,
    rooms: ["1 Camellia"],
    adults: 2,
    children: 0,
    discount: 0,
    nights: 2,
    rent: 9000,
    paid: 5000,
    due: 4000,
    ...over,
  }) as BookingRow;

const page = (rows: BookingRow[] = [row()], total = rows.length): Page<BookingRow> =>
  ({ rows, total }) as Page<BookingRow>;

beforeEach(() => {
  mockResort = { id: 3, name: "Demo Bay Resort" };
  mockList.mockReset().mockResolvedValue(page());
  mockPush.mockReset();
});

/** The one argument the screen sends, as it last sent it. */
const lastQuery = () => mockList.mock.calls[mockList.mock.calls.length - 1]![0] as Record<string, unknown>;

describe("what it asks for", () => {
  it("asks about the active resort, newest booking first", async () => {
    await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(lastQuery().resortId).toBe(3);
    expect(lastQuery().sort).toBe("newest");
  });

  /**
   * Not `state: ""`. `qs` drops an empty value, but the API's validators
   * treat an empty string and an absent parameter differently, and a screen
   * that leans on the query builder to clean up after it is a screen whose
   * next caller will not.
   */
  it("sends no state at all until one is chosen", async () => {
    await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(lastQuery().state).toBeUndefined();
    expect(lastQuery().search).toBeUndefined();
  });
});

describe("searching", () => {
  /**
   * A keystroke is not a query. The console settled on 300ms here and on the
   * guest list, and a phone on a hill-district connection has more reason to
   * wait than a desk does.
   */
  it("waits for the typing to stop before asking", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Search bookings")).toBeTruthy());
    expect(mockList).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(r.getByLabelText("Search bookings"), "Rafiq");
    // still one call: the debounce has not elapsed
    expect(mockList).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(lastQuery().search).toBe("Rafiq");
  });

  it("hands the words to the server rather than filtering what it already has", async () => {
    mockList.mockResolvedValue(page([row(), row({ id: 42, code: "BK-00042", guest: { id: 10, fullName: "Nasrin Akter", phone: "01811110002" } } as Partial<BookingRow>)]));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Nasrin Akter")).toBeTruthy());

    // the server answers with one row; the screen must show what it was sent
    mockList.mockResolvedValue(page([row()]));
    await fireEvent.changeText(r.getByLabelText("Search bookings"), "Rafiq");
    await waitFor(() => expect(r.queryByText("Nasrin Akter")).toBeNull(), { timeout: 2000 });
    expect(r.getByText("Rafiq Hasan")).toBeTruthy();
  });
});

describe("which states to show", () => {
  it("offers every state the database has, by the words a person reads", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    // the rows, not the call: the request having gone out is not the screen
    // having drawn, and waiting on the wrong one is a flake in waiting
    await waitFor(() => expect(r.getByRole("button", { name: "Filter" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Filter" }));
    expect(r.getByRole("button", { name: "Checked-in" })).toBeTruthy();
    expect(r.getByRole("button", { name: "No-show" })).toBeTruthy();
  });

  /**
   * The label is not the value. An option that sends its own text is how the
   * console once asked the API for `CHECKED-IN` where the enum is
   * `CHECKED_IN`, and three of six states silently returned the wrong set.
   */
  it("sends the enum, never the words", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByRole("button", { name: "Filter" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Filter" }));
    await fireEvent.press(r.getByRole("button", { name: "Checked-in" }));
    await waitFor(() => expect(lastQuery().state).toBe("CHECKED_IN"));
  });

  it("lets the filter go again", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByRole("button", { name: "Filter" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Filter" }));
    await fireEvent.press(r.getByRole("button", { name: "Checked-in" }));
    await waitFor(() => expect(lastQuery().state).toBe("CHECKED_IN"));
    await fireEvent.press(r.getByRole("button", { name: "Checked-in" }));
    await waitFor(() => expect(lastQuery().state).toBeUndefined());
  });
});

describe("which order", () => {
  it("offers the orders the API accepts, and sends the key", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByRole("button", { name: "Filter" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Filter" }));
    await fireEvent.press(r.getByRole("button", { name: "Check-in — soonest first" }));
    await waitFor(() => expect(lastQuery().sort).toBe("checkin"));
  });
});

describe("a row", () => {
  it("names the guest, the dates, the rooms and what is left", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.getByLabelText("Rafiq Hasan, BK-00041, Confirmed, ৳4,000 due")).toBeTruthy();
    expect(r.getByText(/1 Camellia/)).toBeTruthy();
  });

  /**
   * The bug a green suite let through. The row read "Invalid Date → Invalid
   * Date" on every one of the demo resort's eight bookings, because the
   * screen appended a time to a string that already had one.
   */
  it("draws the dates rather than the words Invalid Date", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText(/21 Sep → 23 Sep/)).toBeTruthy());
    expect(r.queryByText(/Invalid Date/)).toBeNull();
  });

  it("leaves a gap where a booking has no dates at all", async () => {
    mockList.mockResolvedValue(page([row({ checkIn: null, checkOut: null })]));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText(/— → —/)).toBeTruthy());
  });

  it("survives a booking with no guest and no rooms on it", async () => {
    mockList.mockResolvedValue(
      page([row({ guest: null as never, rooms: [], checkIn: null, checkOut: null })]),
    );
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("—")).toBeTruthy());
  });

  it("opens the booking", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Rafiq Hasan, BK-00041, Confirmed, ৳4,000 due"));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41");
  });
});

describe("how many there are", () => {
  it("says the server's total, not how many happen to be on screen", async () => {
    mockList.mockResolvedValue(page([row()], 84));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("84 bookings")).toBeTruthy());
  });

  it("counts one booking as one, not as 1 bookings", async () => {
    mockList.mockResolvedValue(page([row()], 1));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 booking")).toBeTruthy());
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    let answer!: (p: Page<BookingRow>) => void;
    mockList.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (p: Page<BookingRow>) => void)),
    );
    const r = await render(<Harness><BookingsScreen /></Harness>);
    expect(r.getByText("Loading the bookings…")).toBeTruthy();
    const { act } = require("@testing-library/react-native");
    await act(async () => {
      answer(page());
    });
  });

  it("shows the API's own words when it is refused", async () => {
    const { ApiError } = require("@rh/shared");
    mockList.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });

  it("says a resort with no bookings has none", async () => {
    mockList.mockResolvedValue(page([], 0));
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("No bookings yet")).toBeTruthy());
  });

  /**
   * An empty search is not an empty resort, and telling a clerk "no bookings
   * yet" over a resort with eighty of them is worse than telling them
   * nothing.
   */
  it("says a search found nothing without claiming the resort is empty", async () => {
    const r = await render(<Harness><BookingsScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    mockList.mockResolvedValue(page([], 0));
    await fireEvent.changeText(r.getByLabelText("Search bookings"), "zzzz");
    await waitFor(() => expect(r.getByText("Nothing matches that")).toBeTruthy(), { timeout: 2000 });
  });
});
