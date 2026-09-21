/**
 * The calendar, on a screen four inches wide.
 *
 * The console draws a room × day grid thirty columns across. A phone
 * cannot. The first attempt scrolled thirty 44-pixel columns sideways
 * under a pinned column of names, and the owner's verdict on it was
 * that it was full of `…` — which it was: a one-night stay had 36
 * usable pixels, no name fits in that, and the grid drew an ellipsis
 * and nothing else.
 *
 * It is a week now — seven nights across the full width, the room's
 * name on its own line above its strip, nothing scrolling sideways.
 * The rules that follow are what that has to keep true.
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
   * The rule, at the one point it is easiest to get wrong. A stay
   * leaving on the 21st does not hold the 21st — and the week view can
   * say so positively, which the old grid could not: the 21st is
   * offered as a night somebody may book.
   */
  it("leaves checkout morning free to sell", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.getByLabelText(/1 Camellia free on 21 Sep/)).toBeTruthy();
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

/**
 * What replaced thirty columns of ellipsis.
 *
 * A bar has to be wide enough to hold a name before it is given one.
 * The old grid gave every bar a name regardless, which is why the
 * screen's entire content was dots.
 */
describe("a name only where a name fits", () => {
  it("writes the guest across a stay that has room for them", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    // two nights wide: enough
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
  });

  it("draws a one-night stay as colour alone, and still says who on a tap", async () => {
    mockCalendar.mockResolvedValue({
      bookings: [
        stay({ checkIn: "2026-09-19T00:00:00.000Z", checkOut: "2026-09-20T00:00:00.000Z" }),
      ],
      rooms: [],
    });
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() =>
      expect(
        r.getByLabelText("Rafiq Hasan, Confirmed, 19 Sep for 1 night, 1 Camellia"),
      ).toBeTruthy(),
    );
    // the name is not painted into 36 pixels — that is what produced `…`
    expect(r.queryByText("Rafiq Hasan")).toBeNull();
  });
});

/**
 * A free night is where a booking starts. Somebody who has just found
 * a gap is about to fill it, and sending them to another screen to
 * retype the room and the date is the tax that stops a tool being used
 * at a desk.
 */
describe("a gap you can act on", () => {
  it("starts a booking for the room and the night that was pressed", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/1 Camellia free on 21 Sep/));
    expect(mockPush).toHaveBeenCalledWith("/new-booking?roomId=11&checkIn=2026-09-21");
  });

  /** A room nobody can sell is not an invitation to sell it. */
  it("offers nothing on a room that is out of service", async () => {
    mockRooms.mockResolvedValue([room({ id: 12, name: "2 Lotus", status: "OUT_OF_SERVICE" })]);
    mockCalendar.mockResolvedValue({ bookings: [], rooms: [] });
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("2 Lotus")).toBeTruthy());
    expect(r.queryByLabelText(/2 Lotus free on/)).toBeNull();
  });
});

describe("moving through the year", () => {
  it("steps a week at a time in the room lens", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(1));
    const firstFrom = mockCalendar.mock.calls[0]![1] as string;

    await fireEvent.press(r.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(2));
    const nextFrom = mockCalendar.mock.calls[1]![1] as string;
    expect(nextFrom > firstFrom).toBe(true);
  });

  /**
   * The arrows step whatever the lens shows — a week in Rooms, a month
   * in Month — so this asks the Month lens, which is the one whose
   * unit is a month.
   */
  it("steps a month from the bar, in the lens whose unit is a month", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());

    await fireEvent.press(r.getByRole("button", { name: "Month" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Next month" })).toBeTruthy());
    const before = mockCalendar.mock.calls.length;

    await fireEvent.press(r.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(mockCalendar.mock.calls.length).toBeGreaterThan(before));
    expect(mockCalendar.mock.calls.at(-1)![1]).toBe("2026-10-01");
  });

  /**
   * The thing the arrows could not do. Reaching next March was six
   * presses and last season was not reachable in practice, which is
   * what the owner asked about.
   */
  it("goes to any month in the year in one press", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    // the month bar only exists once the calendar has drawn; waiting on
    // the call alone presses while the spinner is still up
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());

    await fireEvent.press(r.getByLabelText(/September 2026\. Choose another month/));
    await fireEvent.press(r.getByLabelText("December 2026"));

    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(2));
    expect(mockCalendar.mock.calls[1]![1]).toBe("2026-12-01");
  });

  /** And any year, which no number of month presses was going to reach. */
  it("goes to another year", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    // the month bar only exists once the calendar has drawn; waiting on
    // the call alone presses while the spinner is still up
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());

    await fireEvent.press(r.getByLabelText(/September 2026\. Choose another month/));
    await fireEvent.press(r.getByRole("button", { name: "Previous year" }));
    await fireEvent.press(r.getByLabelText("March 2025"));

    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(2));
    expect(mockCalendar.mock.calls[1]![1]).toBe("2025-03-01");
  });

  it("comes back to this month in one press", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    // the month bar only exists once the calendar has drawn; waiting on
    // the call alone presses while the spinner is still up
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());

    await fireEvent.press(r.getByLabelText(/September 2026\. Choose another month/));
    await fireEvent.press(r.getByRole("button", { name: "Next year" }));
    await fireEvent.press(r.getByRole("button", { name: "Go to this month" }));

    await waitFor(() => expect(mockCalendar).toHaveBeenCalledTimes(2));
    expect(mockCalendar.mock.calls[1]![1]).toBe("2026-09-01");
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
