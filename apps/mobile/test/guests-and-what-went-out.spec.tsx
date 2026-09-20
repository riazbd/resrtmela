/**
 * Guests, and the cashbook.
 *
 * Two screens with nothing in common except that a phone needs both and
 * neither existed. What they do share is the trap this app keeps meeting:
 * a list that filters locally lies about page two, and a form that offers
 * choices the API will refuse wastes the typing.
 *
 * The guest detail screen is assembled rather than fetched. There is no
 * `GET /guests/:id` — the console's guests page is a table and stops
 * there — so it narrows the guests list to one phone number and searches
 * the bookings list on the same one, which is what that route matches on.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingRow, ExpenseRow, GuestRow } from "@rh/shared";

const mockGuests = jest.fn();
const mockBookings = jest.fn();
const mockExpenses = jest.fn();
const mockCreateExpense = jest.fn();
const mockOptions = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    guests: { list: (...a: unknown[]) => mockGuests(...a) },
    bookings: { list: (...a: unknown[]) => mockBookings(...a) },
    expenses: {
      list: (...a: unknown[]) => mockExpenses(...a),
      create: (...a: unknown[]) => mockCreateExpense(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const GuestsScreen = require("../app/(tabs)/(desk)/guests/index").default;
const GuestScreen = require("../app/(tabs)/(desk)/guests/[id]").default;
const ExpensesScreen = require("../app/(tabs)/(desk)/expenses").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const guest = (over: Partial<GuestRow> = {}): GuestRow => ({
  id: 7,
  fullName: "Rafiq Hasan",
  phone: "8801711000000",
  nidPassportNo: "1234567890",
  bookingCount: 3,
  lastStay: {
    code: "BK-00009",
    checkIn: "2026-09-20T00:00:00.000Z",
    checkOut: "2026-09-23T00:00:00.000Z",
    state: "CHECKED_OUT",
  },
  ...over,
});

const booking = (over: Partial<BookingRow> = {}): BookingRow =>
  ({
    id: 84,
    code: "BK-00009",
    state: "CHECKED_OUT",
    paymentState: "PARTIAL",
    guestName: "Rafiq Hasan",
    checkIn: "2026-09-20T00:00:00.000Z",
    checkOut: "2026-09-23T00:00:00.000Z",
    nights: 3,
    rooms: ["7 Kadam"],
    total: 19500,
    paid: 7000,
    due: 12500,
    ...over,
  }) as unknown as BookingRow;

const expense = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 31,
  date: "2026-09-20",
  category: "Fuel",
  details: "Diesel for the generator",
  scope: "RESORT",
  amount: 3200,
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  mockParams = {};
  mockCan = () => true;
  mockGuests.mockReset().mockResolvedValue({ rows: [guest()], total: 1 });
  mockBookings.mockReset().mockResolvedValue({ rows: [booking()], total: 1 });
  mockExpenses.mockReset().mockResolvedValue({
    rows: [expense()],
    total: 1,
    summary: { amount: 3200, byCategory: [{ category: "Fuel", amount: 3200 }] },
  });
  mockCreateExpense.mockReset().mockResolvedValue({ id: 32 });
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "FUEL", label: "Fuel", active: true, sortOrder: 0 },
    { id: 2, code: "SALARY", label: "Salaries", active: true, sortOrder: 1 },
    { id: 3, code: "OLD", label: "Retired", active: false, sortOrder: 2 },
  ]);
  mockPush.mockReset();
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("everyone who has stayed", () => {
  it("lists them with what a counter asks for", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() =>
      expect(r.getByLabelText("Rafiq Hasan, 8801711000000, 3 stays, last 20 Sep")).toBeTruthy(),
    );
  });

  /** The server matches; a page filtered here lies about page two. */
  it("asks the server to search, rather than filtering what it has", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByLabelText("Search guests")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Search guests"), "rahman");
    await waitFor(
      () => expect(mockGuests).toHaveBeenCalledWith(3, expect.objectContaining({ search: "rahman" })),
      { timeout: 2000 },
    );
  });

  /**
   * An empty search is not an empty resort. Telling somebody "no guests
   * yet" over a resort with four hundred is worse than telling them
   * nothing.
   */
  it("tells a fruitless search from an empty resort", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    mockGuests.mockResolvedValue({ rows: [], total: 0 });
    await fireEvent.changeText(r.getByLabelText("Search guests"), "zzzz");
    await waitFor(() => expect(r.getByText("Nothing matches that")).toBeTruthy(), { timeout: 2000 });
  });

  it("opens one, carrying what identifies them", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Rafiq Hasan,/));
    expect(mockPush).toHaveBeenCalledWith(
      "/guests/7?phone=8801711000000&name=Rafiq%20Hasan",
    );
  });
});

describe("one guest", () => {
  beforeEach(() => {
    mockParams = { id: "7", phone: "8801711000000", name: "Rafiq Hasan" };
  });

  it("finds their stays by the number the bookings route matches on", async () => {
    open(GuestScreen);
    await waitFor(() =>
      expect(mockBookings).toHaveBeenCalledWith(
        expect.objectContaining({ resortId: 3, search: "8801711000000" }),
      ),
    );
  });

  it("reads their stays back", async () => {
    const r = await open(GuestScreen);
    await waitFor(() =>
      expect(r.getByLabelText("BK-00009, Checked-out, 20–23 Sep, ৳12,500 due")).toBeTruthy(),
    );
  });

  /** Summed from the rows on the page, and the label says so. */
  it("adds up what is still due across them", async () => {
    const r = await open(GuestScreen);
    await waitFor(() => expect(r.getByLabelText("Due on these: ৳12,500")).toBeTruthy());
  });

  /**
   * A deep link with no phone cannot do the job. Saying so beats an empty
   * list, which reads as "this guest has never stayed".
   */
  it("says it cannot work without the number", async () => {
    mockParams = { id: "7" };
    const r = await open(GuestScreen);
    await waitFor(() => expect(r.getByText("Open this guest from the list")).toBeTruthy());
    expect(mockBookings).not.toHaveBeenCalled();
  });
});

describe("what went out", () => {
  it("opens on the resort's today and totals it", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByLabelText("Spent: ৳3,200")).toBeTruthy());
    expect(mockExpenses).toHaveBeenCalledWith(3, { from: "2026-09-20", to: "2026-09-21" });
  });

  it("lists the day's entries", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() =>
      expect(r.getByLabelText("Fuel, Diesel for the generator, ৳3,200")).toBeTruthy(),
    );
  });

  it("moves a day at a time", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByLabelText("Previous day")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Previous day"));
    await waitFor(() =>
      expect(mockExpenses).toHaveBeenCalledWith(3, { from: "2026-09-19", to: "2026-09-20" }),
    );
  });

  /**
   * The resort's own list, not what has been spent on before.
   * `expenses/categories` is a `groupBy`: it cannot offer a category
   * nothing has been spent on yet, and it keeps every typo for ever.
   */
  it("offers the resort's own categories, and not the retired one", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Fuel" })).toBeTruthy());
    expect(mockOptions).toHaveBeenCalledWith(3, "EXPENSE_CATEGORY");
    expect(r.getByRole("button", { name: "Salaries" })).toBeTruthy();
    expect(r.queryByRole("button", { name: "Retired" })).toBeNull();
  });

  it("will not record an entry with no category or no amount", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Record it" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Record it" }));
    expect(mockCreateExpense).not.toHaveBeenCalled();
    expect(r.getByText("Pick a category and say how much.")).toBeTruthy();
  });

  it("records one on the day on screen", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Fuel" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Fuel" }));
    await fireEvent.changeText(r.getByLabelText("Amount"), "1500");
    await fireEvent.changeText(r.getByLabelText("What for"), "Bottled water");
    await fireEvent.press(r.getByRole("button", { name: "Record it" }));

    await waitFor(() =>
      expect(mockCreateExpense).toHaveBeenCalledWith(3, {
        date: "2026-09-20",
        category: "FUEL",
        details: "Bottled water",
        amount: 1500,
        scope: "RESORT",
      }),
    );
  });

  it("offers no form to somebody who may only look", async () => {
    mockCan = (k) => k !== "expenses.create";
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByLabelText("Spent: ৳3,200")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("says so when nothing went out", async () => {
    mockExpenses.mockResolvedValue({ rows: [], total: 0, summary: { amount: 0, byCategory: [] } });
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByText("Nothing spent on this day")).toBeTruthy());
  });

  it("shows the API's own words when it is refused", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockExpenses.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });
});
