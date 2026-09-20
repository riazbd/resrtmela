/**
 * The calendar, on a screen four inches wide.
 *
 * The console draws a room × day grid thirty columns across. A phone cannot,
 * so the axes swap: one row per room, the days scrolling sideways under a
 * pinned room name, and a stay drawn as one bar across the nights it holds
 * rather than as a square per night.
 *
 * The rule the bars obey is `@rh/shared`'s, not this screen's: green is free
 * and nothing else is green, red is held and the shade says how firmly, grey
 * is a guest who has gone. And a stay holds up to but not including
 * check-out — checkout morning is a night the resort can sell that evening,
 * and a calendar that paints it red turns guests away from an empty room.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { CalendarBooking, Room } from "@rh/shared";

const mockCalendar = jest.fn();
const mockRooms = jest.fn();
const mockPush = jest.fn();
let mockResort: { id: number; name: string; timezone?: string } | null = {
  id: 3,
  name: "Demo Bay Resort",
  timezone: "Asia/Dhaka",
};

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: mockResort }),
  client: {
    calendar: (...a: unknown[]) => mockCalendar(...a),
    rooms: { list: (...a: unknown[]) => mockRooms(...a) },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CalendarScreen = require("../app/(tabs)/calendar").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const room = (over: Partial<Room> = {}): Room =>
  ({ id: 11, name: "1 Camellia", status: "ACTIVE", baseRate: 4500, ...over }) as Room;

const stay = (over: Partial<CalendarBooking> = {}): CalendarBooking =>
  ({
    id: 41,
    code: "BK-00041",
    state: "CONFIRMED",
    paymentState: "PARTIAL",
    guestName: "Rafiq Hasan",
    agentName: null,
    checkIn: "2026-09-19T00:00:00.000Z",
    checkOut: "2026-09-21T00:00:00.000Z",
    rooms: [{ id: 11, name: "1 Camellia" }],
    ...over,
  }) as CalendarBooking;

/**
 * Noon in Dhaka on the 19th, so "today" is a fact rather than the day this
 * happens to run — the window this screen opens on starts at the resort's
 * today, and a stay fixture pinned to real dates would drift out of it.
 * Only the clock is frozen; RNTL needs real timers to flush anything.
 */
beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-19T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  mockResort = { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" };
  mockRooms.mockReset().mockResolvedValue([room(), room({ id: 12, name: "2 Lotus" })]);
  mockCalendar.mockReset().mockResolvedValue({ bookings: [stay()], rooms: [] });
  mockPush.mockReset();
});

afterEach(() => jest.useRealTimers());

describe("what it asks for", () => {
  it("asks about the active resort, from its today", async () => {
    await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(mockCalendar).toHaveBeenCalled());
    const [resortId, from, to] = mockCalendar.mock.calls[0]!;
    expect(resortId).toBe(3);
    expect(from).toBe("2026-09-19");
    expect(from < to).toBe(true);
  });

  /**
   * The room list is the same one every other screen reads, cached under one
   * key. Paging the calendar must not refetch it.
   */
  it("reads the rooms from the shared cache key, not from the calendar route", async () => {
    await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(mockRooms).toHaveBeenCalledWith(3));
  });
});

describe("the rows", () => {
  it("gives every room a row, named", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.getByText("2 Lotus")).toBeTruthy();
  });

  /**
   * A room under maintenance stays on the grid. Filtering it out leaves a
   * desk unable to tell "not bookable" from "does not exist", or to notice
   * that a room has been out for three weeks — but it sinks below the ones
   * that can be sold, because the desk reads this screen for tonight.
   */
  it("keeps an out-of-service room, below the ones that can be sold", async () => {
    mockRooms.mockResolvedValue([
      room({ id: 12, name: "2 Lotus", status: "OUT_OF_SERVICE" }),
      room({ id: 11, name: "1 Camellia", status: "ACTIVE" }),
    ]);
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    const names = r.getAllByLabelText(/^Room /).map((n) => n.props.accessibilityLabel);
    expect(names).toEqual(["Room 1 Camellia", "Room 2 Lotus, out of service"]);
  });
});

describe("the bars", () => {
  it("draws a stay as one bar across the nights it holds", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    // two nights: the 19th and the 20th. Not three.
    await waitFor(() =>
      expect(r.getByLabelText("Rafiq Hasan, Confirmed, 19 Sep for 2 nights, 1 Camellia")).toBeTruthy(),
    );
  });

  /**
   * The rule, at the one point it is easiest to get wrong. A stay leaving on
   * the 21st does not hold the 21st.
   */
  it("leaves checkout morning free to sell", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.queryByLabelText(/21 Sep for/)).toBeNull();
  });

  it("opens the booking behind a bar", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() =>
      expect(r.getByLabelText("Rafiq Hasan, Confirmed, 19 Sep for 2 nights, 1 Camellia")).toBeTruthy(),
    );
    await fireEvent.press(r.getByLabelText("Rafiq Hasan, Confirmed, 19 Sep for 2 nights, 1 Camellia"));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41");
  });

  /** A booking made through an agency has no guest name of its own to show. */
  it("names the agency where there is no guest name", async () => {
    mockCalendar.mockResolvedValue({
      bookings: [stay({ guestName: "", agentName: "Demo Travels" })],
      rooms: [],
    });
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText(/Demo Travels/)).toBeTruthy());
  });
});

describe("how full it is", () => {
  it("says how many rooms are taken each day", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("19 Sep: 1 of 2 rooms taken")).toBeTruthy());
  });

  it("does not count a room that cannot be sold", async () => {
    mockRooms.mockResolvedValue([
      room({ id: 11, name: "1 Camellia", status: "ACTIVE" }),
      room({ id: 12, name: "2 Lotus", status: "OUT_OF_SERVICE" }),
    ]);
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("19 Sep: 1 of 1 rooms taken")).toBeTruthy());
  });
});

describe("moving through the year", () => {
  it("steps a month at a time", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(1));
    const firstFrom = mockCalendar.mock.calls[0]![1] as string;

    await fireEvent.press(r.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(2));
    const nextFrom = mockCalendar.mock.calls[1]![1] as string;
    expect(nextFrom > firstFrom).toBe(true);
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    // a promise this test finishes itself: one that never settles leaves the
    // query pending and jest waiting on an event loop that cannot drain
    let answer!: (v: unknown) => void;
    mockCalendar.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const r = await render(<Harness><CalendarScreen /></Harness>);
    expect(r.getByText("Loading the calendar…")).toBeTruthy();
    const { act } = require("@testing-library/react-native");
    await act(async () => {
      answer({ bookings: [stay()], rooms: [] });
    });
  });

  it("shows the API's own words when it is refused", async () => {
    const { ApiError } = require("@rh/shared");
    mockCalendar.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });

  it("says a resort with no rooms has none", async () => {
    mockRooms.mockResolvedValue([]);
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("No rooms yet")).toBeTruthy());
  });
});
