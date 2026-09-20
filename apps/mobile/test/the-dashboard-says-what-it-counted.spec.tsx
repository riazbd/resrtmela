/**
 * The dashboard says what it counted (2026-09-21).
 *
 * Found by opening two screens one after the other on a phone. The
 * dashboard read **Outstanding dues ৳0 · 0 bookings**. Dues, one tap
 * away in the More list, read **Outstanding ৳1,59,000 · 9 bookings**.
 * The same word, the same resort, the same moment, and a gap of one and
 * a half lakh between them.
 *
 * Neither figure was miscalculated. `/today` filters
 * `b.arriving && b.due > 0` — money owed by the people checking in
 * today, which is exactly what a front desk wants before the first one
 * walks up. What was wrong was the name: "Outstanding dues" is the
 * resort's ledger, that screen owns it, and a tile using those words
 * for a different number tells an owner they are owed nothing.
 *
 * So the figure stays and the words change, on the tile and in the API
 * field behind it. A name that describes a narrower thing than it
 * measures is how this happened; leaving `duesTotal` in the payload
 * would leave the trap set for whoever reads it next.
 *
 * The other three tiles on this screen are all scoped to today and say
 * so — "expected today", "due out today", "rooms checked in". This one
 * now does too.
 */
import { render, waitFor } from "@testing-library/react-native";
import type { TodayFeed } from "@rh/shared";

const mockToday = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 1, name: "Demo Resort Owner", role: "RESORT_ADMIN" },
    loading: false,
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: () => true,
  }),
  client: { today: (...a: unknown[]) => mockToday(...a) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const DashboardScreen = require("../app/(tabs)/dashboard").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const feed = (over: Partial<TodayFeed> = {}): TodayFeed => ({
  arrivals: [],
  departures: [],
  occupancyPct: 10,
  arrivalsDueTotal: 0,
  arrivalsDueCount: 0,
  ...over,
});

const open = async () => render(<Harness><DashboardScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockToday.mockResolvedValue(feed());
});

describe("the dashboard says what it counted", () => {
  /**
   * The sentence that started it. A resort owed a lakh and a half saw
   * a tile reading zero, because the tile was counting one day.
   */
  it("does not call one day's collection the resort's outstanding dues", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 0, arrivalsDueCount: 0 }));
    const r = await open();
    await waitFor(() => expect(r.getByLabelText(/Occupancy/)).toBeTruthy());
    expect(r.queryByText(/Outstanding/i)).toBeNull();
  });

  it("names the day it is counting, as the other three tiles do", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 4000, arrivalsDueCount: 1 }));
    const r = await open();
    await waitFor(() => expect(r.getByText(/today/i)).toBeTruthy());
    expect(r.getByLabelText(/To collect today/)).toBeTruthy();
  });

  it("shows the figure it was given", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 4000, arrivalsDueCount: 1 }));
    const r = await open();
    await waitFor(() => expect(r.getByLabelText(/To collect today: ৳4,000/)).toBeTruthy());
  });

  /** One booking, not "1 bookings" — the plural bit the housekeeping list too. */
  it("counts one booking in the singular", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 4000, arrivalsDueCount: 1 }));
    const r = await open();
    await waitFor(() => expect(r.getByText("from 1 arrival")).toBeTruthy());
  });

  it("counts several in the plural", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 9000, arrivalsDueCount: 3 }));
    const r = await open();
    await waitFor(() => expect(r.getByText("from 3 arrivals")).toBeTruthy());
  });

  /**
   * Nothing to collect is a quiet fact, not a warning. The red was
   * reserved for money that is actually waiting at the desk.
   */
  it("says nothing is waiting without colouring it a problem", async () => {
    mockToday.mockResolvedValue(feed({ arrivalsDueTotal: 0, arrivalsDueCount: 0 }));
    const r = await open();
    await waitFor(() => expect(r.getByText("nothing to collect")).toBeTruthy());
  });

  /**
   * The phone and the API ship separately, and this field was renamed.
   * An app that has been updated and an API that has not send
   * `undefined` down this line — which the screen printed, word for word,
   * as "from undefined arrivals" on the first device run after the
   * rename. A figure nobody sent is nothing to collect, not a new kind
   * of number.
   */
  it("says nothing rather than undefined when the API has not caught up", async () => {
    const stale = { arrivals: [], departures: [], occupancyPct: 10 } as unknown as TodayFeed;
    mockToday.mockResolvedValue(stale);
    const r = await open();
    await waitFor(() => expect(r.getByText("nothing to collect")).toBeTruthy());
    expect(r.queryByText(/undefined|NaN/)).toBeNull();
  });
});
