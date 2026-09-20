/**
 * The day sheet: every room, and what is in it tonight.
 *
 * This is the screen a front desk leaves open all morning, and the one the
 * demo resort caught a real bug on within an afternoon — the rooms came back
 * in creation order, so `3 Orchid` sat above `1 Camellia`. The API sorts them
 * now; this screen must not undo that by sorting again on its own idea of
 * order, so the order it is given is the order it draws.
 *
 * Three states share one row on a phone, where the console has five columns:
 * out of service, free, and taken. Two of them go somewhere: a taken room
 * opens its booking, a free one starts a new booking for that room on that
 * night, and a room out of service is inert because nothing can be done
 * with it here.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { addDaysIso, lastNightLabel, todayIn, type DaySheet } from "@rh/shared";

const mockDaySheet = jest.fn();
const mockPush = jest.fn();
let mockResort: { id: number; name: string; timezone?: string } | null = {
  id: 3,
  name: "Demo Bay Resort",
  timezone: "Asia/Dhaka",
};

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: mockResort, can: () => true }),
  client: { daySheet: (...a: unknown[]) => mockDaySheet(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DaySheetScreen = require("../app/daysheet").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const room = (over: Partial<DaySheet["rooms"][number]> = {}): DaySheet["rooms"][number] => ({
  roomId: 11,
  name: "1 Camellia",
  capacity: 2,
  status: "ACTIVE",
  cell: { mode: "available" },
  ...over,
});

const sheet = (over: Partial<DaySheet> = {}): DaySheet => ({
  date: "2026-09-20",
  rooms: [room()],
  strip: {
    balanceDue: 27000,
    revenue: 9000,
    expenses: 4200,
    arrivals: 1,
    departures: 0,
    occupancy: 3,
    totalRooms: 10,
  },
  ...over,
});

const taken = (over: Partial<DaySheet["rooms"][number]["cell"]> = {}) =>
  room({
    roomId: 14,
    name: "4 Palash",
    cell: {
      mode: "booked",
      bookingId: 55,
      code: "BK-00005",
      state: "CONFIRMED",
      guestName: "Tanvir Islam",
      due: 27000,
      revenue: 9000,
      arrives: true,
      ...over,
    },
  });

beforeEach(() => {
  mockParams = {};
  mockResort = { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" };
  mockDaySheet.mockReset().mockResolvedValue(sheet());
  mockPush.mockReset();
});

describe("which day it asks about", () => {
  it("opens on the resort's today, not the phone's", async () => {
    await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalled());
    const [resortId, date] = mockDaySheet.mock.calls[0]!;
    expect(resortId).toBe(3);
    // whatever today is where this runs, it is the Dhaka one that was asked for
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dhaka = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(date).toBe(dhaka);
  });

  it("asks again for the day the arrow moved to", async () => {
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalledTimes(1));
    const first = mockDaySheet.mock.calls[0]![1] as string;

    await fireEvent.press(r.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalledTimes(2));
    const second = mockDaySheet.mock.calls[1]![1] as string;
    expect(new Date(second).getTime()).toBeLessThan(new Date(first).getTime());
  });
});

/**
 * The bug this screen shipped with for one afternoon, and the reason it is
 * worth its own block.
 *
 * `todayIn` exists because Bangladesh is UTC+6 and `new Date().toISOString()`
 * is a different day there for six hours of every evening. The screen called
 * it correctly — and called it on the first render, before the session had
 * finished restoring, when `activeResort` was still null. So the fallback
 * zone was UTC, the register opened on yesterday, and nothing ever corrected
 * it once the resort arrived.
 *
 * Caught by looking: the browser lens opened the day sheet at 23:56 UTC and
 * it said "Saturday, 19 September" over a resort where it was already the
 * 20th.
 */
describe("the day it opens on, before the session has settled", () => {
  const LATE_IN_UTC = new Date("2026-09-19T23:56:00Z");

  beforeEach(() => {
    jest.useFakeTimers({
      now: LATE_IN_UTC,
      // only the clock is frozen: RNTL needs real timers to flush anything
      doNotFake: [
        "setTimeout", "clearTimeout", "setInterval", "clearInterval",
        "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
        "performance", "requestAnimationFrame", "cancelAnimationFrame",
      ],
    });
  });
  afterEach(() => jest.useRealTimers());

  it("asks for the resort's day even when the resort arrives a render late", async () => {
    mockResort = null;
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    expect(mockDaySheet).not.toHaveBeenCalled();

    mockResort = { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" };
    await r.rerender(<Harness><DaySheetScreen /></Harness>);

    await waitFor(() => expect(mockDaySheet).toHaveBeenCalled());
    // 23:56 UTC on the 19th is already the 20th in Dhaka
    expect(mockDaySheet.mock.calls[0]![1]).toBe("2026-09-20");
  });
});

/**
 * The month view taps a night and lands here. Without this the register
 * opened on today whatever was tapped, which is the one thing that screen
 * exists to avoid.
 */
describe("a day somebody was sent to", () => {
  it("opens on the date in the address", async () => {
    mockParams = { date: "2026-10-04" };
    await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalledWith(3, "2026-10-04"));
  });

  it("ignores something that is not a date rather than asking for it", async () => {
    mockParams = { date: "yesterday" };
    await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalled());
    expect(mockDaySheet.mock.calls[0]![1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("still lets the arrows move from there", async () => {
    mockParams = { date: "2026-10-04" };
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    // the drawn screen, not the request: the call having gone out is not the
    // arrows being on screen, and waiting on the wrong one is a flake
    await waitFor(() => expect(r.getByRole("button", { name: "Next day" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(mockDaySheet).toHaveBeenCalledWith(3, "2026-10-05"));
  });
});

describe("the day's figures", () => {
  it("shows what is owed, what the night earns, and how full the resort is", async () => {
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Balance due: ৳27,000")).toBeTruthy());
    expect(r.getByLabelText("Night revenue: ৳9,000")).toBeTruthy();
    expect(r.getByLabelText("Occupancy: 3/10")).toBeTruthy();
    expect(r.getByLabelText("Arrivals / last nights: 1 / 0")).toBeTruthy();
  });
});

describe("the register", () => {
  it("draws the rooms in the order the server gave them", async () => {
    mockDaySheet.mockResolvedValue(
      sheet({
        rooms: [
          room({ roomId: 11, name: "1 Camellia" }),
          room({ roomId: 12, name: "2 Lotus" }),
          room({ roomId: 20, name: "10 Bakul" }),
        ],
      }),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    const names = r.getAllByLabelText(/^Room /).map((n) => n.props.accessibilityLabel);
    expect(names).toEqual([
      "Room 1 Camellia, free",
      "Room 2 Lotus, free",
      "Room 10 Bakul, free",
    ]);
  });

  it("says who is in a taken room, and what they still owe", async () => {
    mockDaySheet.mockResolvedValue(sheet({ rooms: [taken()] }));
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Tanvir Islam")).toBeTruthy());
    expect(r.getByText("BK-00005")).toBeTruthy();
    // the strip says ৳27,000 too, so the row is asked for by its own name
    expect(r.getByLabelText("Room 4 Palash, Tanvir Islam, ৳27,000 due")).toBeTruthy();
  });

  it("marks the room somebody arrives in today", async () => {
    mockDaySheet.mockResolvedValue(sheet({ rooms: [taken({ arrives: true })] }));
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Arrives")).toBeTruthy());
  });

  /**
   * This test asserted the word "Departs" and was named "leaves today",
   * and both were wrong in the same way the screen was. The register is a
   * grid of nights: the last cell of a stay is the night *before* the
   * guest goes. The server agrees — `/day-sheet` sets `departs` when
   * `checkOut` is the next day, while `/today` counts a departure only
   * when `checkOut` is today, which is why the dashboard said none while
   * this screen marked three.
   *
   * Found on the owner's phone on 2026-09-20: BK-00001 and BK-00004 were
   * both out on the 21st. A clerk reading "Departs today" counts those
   * rooms free this afternoon and sells a night that is taken.
   */
  it("names the morning the guest goes, which is not the night on screen", async () => {
    mockDaySheet.mockResolvedValue(
      sheet({ rooms: [taken({ arrives: false, departs: true })] }),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    const out = lastNightLabel(addDaysIso(todayIn("Asia/Dhaka"), 1), todayIn("Asia/Dhaka"));
    await waitFor(() => expect(r.getByText(out!)).toBeTruthy());
    expect(r.queryByText("Departs")).toBeNull();
  });

  it("opens the booking behind a taken room", async () => {
    mockDaySheet.mockResolvedValue(sheet({ rooms: [taken()] }));
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Tanvir Islam")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Room 4 Palash, Tanvir Islam, ৳27,000 due"));
    expect(mockPush).toHaveBeenCalledWith("/bookings/55");
  });

  /**
   * A free room and a room out of service look nothing alike to a clerk
   * deciding where to put a walk-in, and the difference is the whole value
   * of the column.
   */
  it("tells a free room from one that cannot be sold", async () => {
    mockDaySheet.mockResolvedValue(
      sheet({
        rooms: [
          room({ roomId: 11, name: "1 Camellia", cell: { mode: "available" } }),
          room({ roomId: 12, name: "2 Lotus", status: "OUT_OF_SERVICE", cell: { mode: "oos" } }),
        ],
      }),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    expect(r.getByText("Out of service")).toBeTruthy();
  });

  /**
   * The two-tap path. A clerk with the register open and somebody at the
   * counter has already decided which room and which night; making them
   * open a blank form and choose both again is the work this screen exists
   * to save.
   */
  it("starts a booking for the room and the night that were tapped", async () => {
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Room 1 Camellia, free"));
    expect(mockPush).toHaveBeenCalledWith("/new-booking?roomId=11&checkIn=2026-09-20");
  });

  /** A room nobody can sell is not a room to start a booking in. */
  it("goes nowhere when a room out of service is tapped", async () => {
    mockDaySheet.mockResolvedValue(
      sheet({
        rooms: [room({ roomId: 12, name: "2 Lotus", status: "OUT_OF_SERVICE", cell: { mode: "oos" } })],
      }),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Out of service")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Room 2 Lotus, out of service"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    let answer!: (s: DaySheet) => void;
    mockDaySheet.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (s: DaySheet) => void)),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    expect(r.getByText("Loading the day sheet…")).toBeTruthy();
    const { act } = require("@testing-library/react-native");
    await act(async () => {
      answer(sheet());
    });
  });

  it("shows the API's own words when it is refused", async () => {
    const { ApiError } = require("@rh/shared");
    mockDaySheet.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });

  /** A resort with no rooms yet is a real first day, not a failure. */
  it("says the resort has no rooms rather than drawing an empty register", async () => {
    mockDaySheet.mockResolvedValue(sheet({ rooms: [] }));
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("No rooms yet")).toBeTruthy());
  });
});
