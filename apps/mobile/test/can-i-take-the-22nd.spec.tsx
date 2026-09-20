/**
 * The month view: can I take a booking for the 22nd?
 *
 * The room grid answers "who is in 103 on the 14th"; this answers the
 * question a desk is actually asked, which the grid makes you count columns
 * for. It is the second half of the same screen, as it is in the console —
 * a lens on `/calendar`, not a route of its own, because the app's routes
 * are the console's routes.
 *
 * The three decisions behind it live in `@rh/shared`: nearly-full is its own
 * state, the threshold is absolute rather than proportional, and the cell
 * says how many are left because that is what gets said out loud on a phone
 * call.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { CalendarBooking, Room } from "@rh/shared";

const mockCalendar = jest.fn();
const mockRooms = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" } }),
  client: {
    calendar: (...a: unknown[]) => mockCalendar(...a),
    rooms: { list: (...a: unknown[]) => mockRooms(...a) },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CalendarScreen = require("../app/(tabs)/calendar").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const room = (id: number, name: string, status = "ACTIVE"): Room =>
  ({ id, name, status, baseRate: 4500 }) as Room;

/** Three rooms, so "2 left" and "full" are both reachable. */
const THREE = [room(11, "1 Camellia"), room(12, "2 Lotus"), room(13, "3 Orchid")];

const stay = (rooms: number[], from: string, to: string, id = 41): CalendarBooking =>
  ({
    id,
    code: `BK-000${id}`,
    state: "CONFIRMED",
    paymentState: "PARTIAL",
    guestName: "Rafiq Hasan",
    agentName: null,
    checkIn: `${from}T00:00:00.000Z`,
    checkOut: `${to}T00:00:00.000Z`,
    rooms: rooms.map((r) => ({ id: r, name: `Room ${r}` })),
  }) as CalendarBooking;

/** Noon in Dhaka on the 19th, so "today" is a fact rather than the run date. */
beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-19T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  mockRooms.mockReset().mockResolvedValue(THREE);
  mockCalendar.mockReset().mockResolvedValue({ bookings: [], rooms: [] });
  mockPush.mockReset();
});

afterEach(() => jest.useRealTimers());

/** Open the screen and switch to the month lens. */
async function monthView() {
  const r = await render(<Harness><CalendarScreen /></Harness>);
  await waitFor(() => expect(r.getByRole("button", { name: "Month" })).toBeTruthy());
  await fireEvent.press(r.getByRole("button", { name: "Month" }));
  return r;
}

describe("which lens", () => {
  it("opens on the rooms, because that is the screen a desk knows", async () => {
    const r = await render(<Harness><CalendarScreen /></Harness>);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
  });

  it("switches to the month and back", async () => {
    const r = await monthView();
    expect(r.queryByText("1 Camellia")).toBeNull();
    await fireEvent.press(r.getByRole("button", { name: "Rooms" }));
    expect(r.getByText("1 Camellia")).toBeTruthy();
  });
});

describe("what a night says", () => {
  it("says how many rooms are left, which is what gets said on the phone", async () => {
    mockCalendar.mockResolvedValue({ bookings: [stay([11], "2026-09-22", "2026-09-23")], rooms: [] });
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText("22 Sep, 2 left of 3")).toBeTruthy());
  });

  it("says Full when there is nothing left", async () => {
    mockCalendar.mockResolvedValue({
      bookings: [stay([11, 12, 13], "2026-09-22", "2026-09-23")],
      rooms: [],
    });
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText("22 Sep, full")).toBeTruthy());
  });

  /**
   * The rule again, at the place it matters most on this screen: a stay
   * leaving on the 23rd does not hold the 23rd, so that night is for sale.
   */
  it("frees checkout morning, so the night can still be sold", async () => {
    mockCalendar.mockResolvedValue({
      bookings: [stay([11, 12, 13], "2026-09-22", "2026-09-23")],
      rooms: [],
    });
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText("23 Sep, 3 left of 3")).toBeTruthy());
  });

  it("does not count a room that cannot be sold", async () => {
    mockRooms.mockResolvedValue([...THREE, room(14, "4 Palash", "OUT_OF_SERVICE")]);
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText("22 Sep, 3 left of 3")).toBeTruthy());
  });
});

describe("the shape of the month", () => {
  /**
   * Sunday first, because that is where Bangladesh's week starts — which
   * puts Friday and Saturday in the last two columns, where a resort's eye
   * goes looking for its busiest nights.
   */
  it("starts the week on Sunday", async () => {
    const r = await monthView();
    const heads = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const name of heads) expect(r.getByText(name)).toBeTruthy();
  });

  it("draws every day of the month", async () => {
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText(/^01 Sep,/)).toBeTruthy());
    expect(r.getByLabelText(/^30 Sep,/)).toBeTruthy();
    expect(r.queryByLabelText(/^31 Sep,/)).toBeNull();
  });

  /**
   * The past is dimmed rather than dropped: a month missing its first
   * fortnight is hard to read as a month, and last week's occupancy is
   * exactly what somebody reviewing the month came to see.
   */
  it("keeps the days that have already gone", async () => {
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText(/^05 Sep,/)).toBeTruthy());
  });
});

describe("picking a night", () => {
  it("opens the day sheet for the day that was tapped", async () => {
    const r = await monthView();
    await waitFor(() => expect(r.getByLabelText(/^22 Sep,/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^22 Sep,/));
    expect(mockPush).toHaveBeenCalledWith("/daysheet?date=2026-09-22");
  });
});
