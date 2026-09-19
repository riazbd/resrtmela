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
 * out of service, free, and taken. Only the third goes anywhere.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { DaySheet } from "@rh/shared";

const mockDaySheet = jest.fn();
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

describe("the day's figures", () => {
  it("shows what is owed, what the night earns, and how full the resort is", async () => {
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Balance due: ৳27,000")).toBeTruthy());
    expect(r.getByLabelText("Night revenue: ৳9,000")).toBeTruthy();
    expect(r.getByLabelText("Occupancy: 3/10")).toBeTruthy();
    expect(r.getByLabelText("Arrivals / departures: 1 / 0")).toBeTruthy();
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

  it("marks the room somebody leaves today", async () => {
    mockDaySheet.mockResolvedValue(
      sheet({ rooms: [taken({ arrives: false, departs: true })] }),
    );
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Departs")).toBeTruthy());
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

  it("goes nowhere when a free room is tapped", async () => {
    const r = await render(<Harness><DaySheetScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Room 1 Camellia, free"));
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
