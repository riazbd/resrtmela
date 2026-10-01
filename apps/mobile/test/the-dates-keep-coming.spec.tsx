/**
 * The room strip scrolls: day after day, both ways, with no scroll bar.
 *
 * The owner, 2026-10-01: "swip korle next week dekhai … ami chai, scroll.
 * side scroll but kono scroll bar dekhabe na. scroll korle ektar por ekta date
 * ba day ashte thakbe. infinite, prev scroll o laagbe, next scroll o laagbe."
 *
 * A test renderer does not scroll, so these drive the list the way a phone
 * reports a scroll — an offset — and read what the screen says back.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import type { CalendarBooking, Room } from "@rh/shared";

const mockCalendar = jest.fn();
const mockRooms = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" } }),
  client: {
    calendar: (...a: unknown[]) => mockCalendar(...a),
    rooms: { list: (...a: unknown[]) => mockRooms(...a) },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const CalendarScreen = require("../app/(tabs)/calendar").default;
const { WEEKS_EACH_WAY } = require("../src/screens/room-scroll");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (over: Partial<Room> = {}): Room =>
  ({ id: 11, name: "1 Camellia", status: "ACTIVE", baseRate: 4500, ...over }) as Room;

const stay: CalendarBooking = {
  id: 41,
  code: "BK-00041",
  state: "CONFIRMED",
  paymentState: "PARTIAL",
  guestName: "Rafiq Hasan",
  agentName: null,
  checkIn: "2026-09-19T00:00:00.000Z",
  checkOut: "2026-09-21T00:00:00.000Z",
  rooms: [{ id: 11, name: "1 Camellia" }],
} as CalendarBooking;

/** One column: a seventh of the screen inside its 16-point margins. */
const col = () => (Dimensions.get("window").width - 32) / 7;
/** The offset of a day, counted from the day the strip opened on (the 19th). */
const offsetOf = (daysFromOpening: number) => (WEEKS_EACH_WAY * 7 + daysFromOpening) * col();

function scrollTo(r: ReturnType<typeof render> extends Promise<infer T> ? T : never, daysFromOpening: number) {
  const { width, height } = Dimensions.get("window");
  return fireEvent.scroll(r.getByTestId("room-scroll"), {
    nativeEvent: {
      contentOffset: { x: offsetOf(daysFromOpening), y: 0 },
      contentSize: { width: (WEEKS_EACH_WAY * 2 + 1) * 7 * col(), height: 600 },
      layoutMeasurement: { width: width - 32, height },
    },
  });
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-19T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  mockRooms.mockReset().mockResolvedValue([room(), room({ id: 12, name: "2 Lotus" })]);
  mockCalendar.mockReset().mockResolvedValue({ bookings: [stay], rooms: [] });
});

afterEach(() => jest.useRealTimers());

async function opened() {
  const r = await render(<Harness><CalendarScreen /></Harness>);
  await waitFor(() => expect(r.getByText("19 Sep — 25 Sep")).toBeTruthy());
  return r;
}

describe("a strip that scrolls", () => {
  it("shows no scroll bar", async () => {
    const r = await opened();
    expect(r.getByTestId("room-scroll").props.showsHorizontalScrollIndicator).toBe(false);
  });

  it("comes to rest on a whole day", async () => {
    const r = await opened();
    expect(r.getByTestId("room-scroll").props.snapToInterval).toBeCloseTo(col());
  });

  it("brings the days ahead on, one at a time, and says where it is", async () => {
    const r = await opened();
    await scrollTo(r, 3);
    await waitFor(() => expect(r.getByText("22 Sep — 28 Sep")).toBeTruthy());
    await scrollTo(r, 4);
    await waitFor(() => expect(r.getByText("23 Sep — 29 Sep")).toBeTruthy());
  });

  it("goes back as far as forward", async () => {
    const r = await opened();
    await scrollTo(r, -10);
    await waitFor(() => expect(r.getByText("09 Sep — 15 Sep")).toBeTruthy());
  });

  /** "infinite": ten years either way is further than anybody scrolls. */
  it("reaches years either side without running out", async () => {
    const r = await opened();
    // three years back, with a leap day between: the 20th of September 2023
    await scrollTo(r, -365 * 3);
    await waitFor(() => expect(r.getByText("20 Sep — 26 Sep")).toBeTruthy());
    expect(r.getByLabelText(/September 2023\. Choose another month/)).toBeTruthy();
    expect(WEEKS_EACH_WAY * 7).toBeGreaterThan(365 * 9);
  });

  it("keeps each room's name once, pinned, however many weeks are drawn", async () => {
    const r = await opened();
    await scrollTo(r, 5);
    expect(r.getAllByText("1 Camellia")).toHaveLength(1);
    expect(r.getAllByText("2 Lotus")).toHaveLength(1);
  });

    /** The week it opens on is the screen's own first request, not a second one. */
  it("asks for the opening week once", async () => {
    await opened();
    await waitFor(() => expect(mockCalendar.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(mockCalendar.mock.calls.filter((c) => c[1] === "2026-09-19")).toHaveLength(1);
  });

  /** Green means "free, take a booking" — not "nobody has asked yet". */
  it("draws a week it has not heard about yet as neither free nor taken", async () => {
    let later!: (v: unknown) => void;
    mockCalendar.mockImplementation((_rid: number, from: string) =>
      from === "2026-09-19"
        ? Promise.resolve({ bookings: [stay], rooms: [] })
        : new Promise((resolve) => (later = resolve)),
    );
    const r = await opened();
    // the opening week is known: the 21st is free to sell
    expect(r.getByLabelText(/1 Camellia free on 21 Sep/)).toBeTruthy();
    // the next one is still on its way: nothing on the 26th is offered as free
    expect(r.queryByLabelText(/free on 26 Sep/)).toBeNull();
    expect(r.getByLabelText("26 Sep: loading")).toBeTruthy();
    await act(async () => later({ bookings: [], rooms: [] }));
    await waitFor(() => expect(r.getByLabelText(/1 Camellia free on 26 Sep/)).toBeTruthy());
  });
});
