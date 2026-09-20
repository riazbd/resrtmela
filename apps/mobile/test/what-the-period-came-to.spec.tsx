/**
 * Reports on a phone.
 *
 * The console's reports page is 629 lines and eight tabs. The phone
 * answers the one question an owner asks away from their desk — did we
 * make money — and the whole risk of that screen is the four figures
 * that look like income and are not.
 *
 * `stillDue` is what has not come in. `taxCollected` is the
 * government's. `billed` is what the stays are worth rather than what was
 * received, and `discounts` was never charged at all. Each of them is
 * large, each sits beside revenue everywhere else in the app, and an
 * owner who adds one to profit has been misled by the screen.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PLReport, ResortMetrics } from "@rh/shared";

const mockMetrics = jest.fn();
const mockPl = jest.fn();
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
    reports: {
      metrics: (...a: unknown[]) => mockMetrics(...a),
      pl: (...a: unknown[]) => mockPl(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ReportsScreen = require("../app/reports/index").default;
const { rangeFor } = require("../app/reports/index");
const PlScreen = require("../app/reports/pl").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const metrics: ResortMetrics = {
  resortRevenue: 210000,
  discount: 10000,
  netRoomRevenue: 200000,
  restaurantRevenue: 48000,
  grossIncome: 175000,
  stillDue: 73000,
  taxCollected: 12500,
  expenses: 61000,
  netProfit: 114000,
  bookings: 26,
};

const pl: PLReport = {
  from: "2026-09-01",
  to: "2026-09-21",
  resort: {
    roomRevenue: 200000,
    extraPersonRevenue: 6000,
    otherRevenue: 0,
    chargesRevenue: 4000,
    discounts: 10000,
    billed: 200000,
    income: 140000,
    taxCollected: 9500,
    stillDue: 60000,
    expenses: 48000,
    payroll: 13000,
    net: 79000,
    expenseCategories: [
      { category: "Fuel", amount: 21000 },
      { category: "Maintenance", amount: 27000 },
    ],
  },
  restaurant: {
    revenue: 48000,
    income: 35000,
    taxCollected: 3000,
    stillDue: 13000,
    expenses: 13000,
    net: 22000,
    expenseCategories: [],
  },
  combined: { billed: 248000, income: 175000, stillDue: 73000, expenses: 61000, net: 114000 },
};

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
  mockMetrics.mockReset().mockResolvedValue(metrics);
  mockPl.mockReset().mockResolvedValue(pl);
  mockPush.mockReset();
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("which period", () => {
  /**
   * `to` is exclusive — the API compares with `lt` — so every range runs
   * to tomorrow. A range ending today silently drops today's takings.
   */
  it("runs this month up to and including today", () => {
    expect(rangeFor("This month", "2026-09-20")).toEqual({ from: "2026-09-01", to: "2026-09-21" });
  });

  it("runs the year from its first day", () => {
    expect(rangeFor("This year", "2026-09-20")).toEqual({ from: "2026-01-01", to: "2026-09-21" });
  });

  it("counts ninety days back from tomorrow", () => {
    expect(rangeFor("Last 90 days", "2026-09-20")).toEqual({ from: "2026-06-22", to: "2026-09-21" });
  });

  it("asks the server for the period on screen", async () => {
    open(ReportsScreen);
    await waitFor(() =>
      expect(mockMetrics).toHaveBeenCalledWith(3, { from: "2026-09-01", to: "2026-09-21" }),
    );
  });

  it("changes the period", async () => {
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "This year" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "This year" }));
    await waitFor(() =>
      expect(mockMetrics).toHaveBeenCalledWith(3, { from: "2026-01-01", to: "2026-09-21" }),
    );
  });
});

/**
 * The figures are grouped in lakh — ৳1,75,000, not ৳175,000 — because
 * the default locale is en-IN and that is how Bangladesh reads a number.
 * Written out here so the next person does not "fix" it.
 */
describe("did we make money", () => {
  it("says what came in, what went out, and the difference", async () => {
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByLabelText("Income: ৳1,75,000")).toBeTruthy());
    expect(r.getByLabelText("Expenses: ৳61,000")).toBeTruthy();
    expect(r.getByLabelText("Net: ৳1,14,000")).toBeTruthy();
  });

  /**
   * The whole point of the screen. Both of these are large, both sit
   * beside revenue everywhere else, and neither is the resort's money.
   */
  it("keeps what is not the resort's money away from what is", async () => {
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByText("Not yours to spend")).toBeTruthy());
    expect(
      r.getByLabelText("Still due, billed and not yet paid: ৳73,000"),
    ).toBeTruthy();
    expect(
      r.getByLabelText("Tax collected and held for the government: ৳12,500"),
    ).toBeTruthy();
  });

  it("draws a loss as a loss", async () => {
    mockMetrics.mockResolvedValue({ ...metrics, netProfit: -4000 });
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByLabelText("Net: -৳4,000")).toBeTruthy());
  });

  it("opens the profit and loss with the period it is showing", async () => {
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByLabelText("Profit and loss")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Profit and loss"));
    expect(mockPush).toHaveBeenCalledWith("/reports/pl?from=2026-09-01&to=2026-09-21");
  });

  /** Seeing the takings is not seeing the profit. */
  it("does not offer profit and loss to somebody who may not see it", async () => {
    mockCan = (k) => k !== "reports.pl";
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByLabelText("Income: ৳1,75,000")).toBeTruthy());
    expect(r.queryByLabelText("Profit and loss")).toBeNull();
  });

  it("shows the API's own words when it is refused", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockMetrics.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await open(ReportsScreen);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });
});

describe("profit and loss", () => {
  beforeEach(() => {
    mockParams = { from: "2026-09-01", to: "2026-09-21" };
  });

  it("reads the period out of the link it was opened with", async () => {
    open(PlScreen);
    await waitFor(() => expect(mockPl).toHaveBeenCalledWith(3, "2026-09-01", "2026-09-21"));
  });

  /** A hand-typed deep link is not a reason to show nothing. */
  it("falls back to ninety days when the link carries no period", async () => {
    mockParams = {};
    open(PlScreen);
    await waitFor(() => expect(mockPl).toHaveBeenCalledWith(3, "2026-06-22", "2026-09-21"));
  });

  it("separates the resort from the restaurant", async () => {
    const r = await open(PlScreen);
    await waitFor(() => expect(r.getByLabelText("Room rent: ৳2,00,000")).toBeTruthy());
    expect(r.getByLabelText("Restaurant sales: ৳48,000")).toBeTruthy();
    expect(r.getByLabelText("Resort net: ৳79,000")).toBeTruthy();
    expect(r.getByLabelText("Restaurant net: ৳22,000")).toBeTruthy();
  });

  /**
   * Four figures that look like income. Each one says what it is in the
   * line itself, because this is the screen somebody reads out at a
   * meeting.
   */
  it("says what billed and discounts actually are", async () => {
    const r = await open(PlScreen);
    await waitFor(() =>
      expect(
        r.getByLabelText("Billed, what the stays are worth rather than what came in: ৳2,00,000"),
      ).toBeTruthy(),
    );
    expect(r.getByLabelText("Discounts, never charged: ৳10,000")).toBeTruthy();
  });

  /** The two sides' tax, added — the one sum this screen is allowed. */
  it("adds both sides' tax and calls it the government's", async () => {
    const r = await open(PlScreen);
    await waitFor(() =>
      expect(
        r.getByLabelText("Tax collected and held for the government: ৳12,500"),
      ).toBeTruthy(),
    );
  });

  it("says what the money went on", async () => {
    const r = await open(PlScreen);
    await waitFor(() => expect(r.getByLabelText("Maintenance: ৳27,000")).toBeTruthy());
  });
});
