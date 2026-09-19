/**
 * The first screen a resort's staff see, and the first one that reads.
 *
 * It is the console's dashboard, with the same four figures and the same two
 * lists, because a clerk who checks the phone on the way in and the desk on
 * arrival should be reading one screen in two places.
 *
 * What it must not do is decide anything for itself. `today` is one request
 * that already answers occupancy, both lists and what is owed — computed
 * server-side with the tax rules, which never reach the phone. A screen that
 * added up `due` itself would be a second implementation of the bill.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError, type TodayFeed } from "@rh/shared";

const mockToday = jest.fn();
const mockPush = jest.fn();
let mockResort: { id: number; name: string } | null = { id: 3, name: "Demo Bay Resort" };

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Link: () => null,
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: mockResort }),
  client: { today: (...a: unknown[]) => mockToday(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DashboardScreen = require("../app/(tabs)/dashboard").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const arrival = (over: Partial<TodayFeed["arrivals"][number]> = {}) => ({
  id: 41,
  code: "DEMO-0041",
  arriving: true,
  departing: false,
  guest: { fullName: "Rafiq Hasan", phone: "01811110001" },
  agent: null,
  rooms: ["1 Camellia"],
  state: "CONFIRMED",
  nights: 2,
  rent: 9000,
  paid: 5000,
  due: 4000,
  ...over,
});

const feed = (over: Partial<TodayFeed> = {}): TodayFeed =>
  ({
    arrivals: [arrival()],
    departures: [],
    occupancyPct: 40,
    duesTotal: 4000,
    duesCount: 1,
    ...over,
  }) as TodayFeed;

beforeEach(() => {
  mockResort = { id: 3, name: "Demo Bay Resort" };
  mockToday.mockReset().mockResolvedValue(feed());
  mockPush.mockReset();
});

describe("the four figures", () => {
  it("asks the API for the active resort's day, and nobody else's", async () => {
    await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(mockToday).toHaveBeenCalledWith(3));
  });

  it("shows occupancy, both counts, and what is owed", async () => {
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("40%")).toBeTruthy());
    expect(r.getByLabelText("Arrivals: 1")).toBeTruthy();
    expect(r.getByLabelText("Departures: 0")).toBeTruthy();
    expect(r.getByLabelText("Outstanding dues: ৳4,000")).toBeTruthy();
  });

  /**
   * The figure is the server's. A screen that added up `due` across the rows
   * would get a different number the first time a booking was part-paid in
   * two currencies or carried an agency balance, and nobody would know which
   * of the two screens was lying.
   */
  it("shows the server's dues total rather than adding the rows up", async () => {
    mockToday.mockResolvedValue(feed({ duesTotal: 99, arrivals: [arrival({ due: 4000 })] }));
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Outstanding dues: ৳99")).toBeTruthy());
  });
});

describe("the two lists", () => {
  it("names the guest, the rooms and what they still owe", async () => {
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.getByText("DEMO-0041")).toBeTruthy();
    expect(r.getByText("1 Camellia")).toBeTruthy();
  });

  it("says nothing is arriving rather than showing an empty box", async () => {
    mockToday.mockResolvedValue(feed({ arrivals: [], departures: [] }));
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("No arrivals today")).toBeTruthy());
    expect(r.getByText("No departures today")).toBeTruthy();
  });

  /**
   * A booking imported from a sheet can have no guest at all. The console
   * draws an em dash; anything that reaches for `.fullName` crashes the page,
   * which is how opening one booking once took the whole screen down.
   */
  it("survives a row with no guest on it", async () => {
    mockToday.mockResolvedValue(feed({ arrivals: [arrival({ guest: null })] }));
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("—")).toBeTruthy());
  });

  it("opens the booking when a row is tapped", async () => {
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Rafiq Hasan, 1 Camellia, ৳4,000 due"));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41");
  });
});

describe("the states it owes", () => {
  /**
   * The request is one this test finishes itself.
   *
   * A `new Promise(() => {})` reads more simply and hangs the whole run: the
   * query never settles, react-query never lets go of it, and jest sits at
   * zero CPU waiting for an event loop that will never drain. It cost half an
   * hour to find, so it is written down rather than merely avoided.
   */
  it("says what it is loading before anything has arrived", async () => {
    let answer!: (feed: TodayFeed) => void;
    mockToday.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (f: TodayFeed) => void)),
    );
    const r = await render(<Harness><DashboardScreen /></Harness>);
    expect(r.getByText("Loading today…")).toBeTruthy();

    await act(async () => {
      answer(feed());
    });
    await waitFor(() => expect(r.queryByText("Loading today…")).toBeNull());
    expect(r.getByText("40%")).toBeTruthy();
  });

  it("shows the API's own words when the read fails", async () => {
    mockToday.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });

  it("offers another go when the connection is what failed", async () => {
    mockToday.mockRejectedValue(new Error("Network request failed"));
    const r = await render(<Harness><DashboardScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Network request failed")).toBeTruthy());

    mockToday.mockResolvedValue(feed());
    await fireEvent.press(r.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(r.getByText("40%")).toBeTruthy());
  });

  /**
   * Somebody signed in with no resort attached is not loading, and waiting on
   * a spinner for ever is what `consoleGate` exists to stop. The tab can be
   * reached before the session has an active resort — a fresh install with a
   * slow connection — and it says so.
   */
  it("does not ask for a day when there is no resort to ask about", async () => {
    mockResort = null;
    const r = await render(<Harness><DashboardScreen /></Harness>);
    expect(mockToday).not.toHaveBeenCalled();
    expect(r.getByText("No resort selected")).toBeTruthy();
  });
});
