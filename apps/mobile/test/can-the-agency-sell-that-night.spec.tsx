/**
 * The agent's calendar: how many rooms are free, night by night.
 *
 * The console draws a grid — a row per room, a column per night, across
 * every resort the agency sells. A phone cannot hold eighty rows and
 * should not try, and an agent on a phone is not auditing occupancy.
 * They have somebody in front of them asking about a date.
 *
 * So this is a month of nights with a number on each, and tapping one
 * takes the search to that night. The counting is `@rh/shared`'s —
 * `freeRoomsByNight` — because a night this screen calls free and the
 * console calls taken is a room sold twice.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyCalendar } from "@rh/shared";

const mockCalendar = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "AGENT" },
    loading: false,
    activeResort: null,
    can: () => true,
  }),
  client: { agent: { calendar: (...a: unknown[]) => mockCalendar(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const CalendarScreen = require("../app/(tabs)/agent/calendar").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (id: number, name: string, status = "ACTIVE") => ({
  id,
  name,
  roomTypeId: 1,
  roomTypeName: "Deluxe",
  status,
  baseRate: 6500,
});

const feed = (over: Partial<AgencyCalendar> = {}): AgencyCalendar => ({
  from: "2026-09-01",
  to: "2026-09-30",
  resorts: [
    {
      resort: { id: 3, name: "Demo Bay Resort", location: "Cox's Bazar" },
      bookableUntil: null,
      rooms: [room(1, "1 Camellia"), room(2, "2 Lotus")],
      stays: [],
    },
  ],
  ...over,
});

const open = async () => render(<Harness><CalendarScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockCalendar.mockResolvedValue(feed());
});

describe("can the agency sell that night", () => {
  it("asks for a whole month at once", async () => {
    await open();
    await waitFor(() => expect(mockCalendar).toHaveBeenCalled());
    const asked = mockCalendar.mock.calls[0][0];
    expect(asked.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(asked.to > asked.from).toBe(true);
  });

  it("names the month it is showing", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText(/September 2026|October 2026/)).toBeTruthy());
  });

  it("says how many rooms the agency could sell across its resorts", async () => {
    const r = await open();
    // two rooms, nothing booked, so every night of the month says 2
    await waitFor(() => expect(r.getAllByText("2").length).toBeGreaterThan(20));
  });

  it("takes a tapped night to the search for that night", async () => {
    const r = await open();
    await waitFor(() => expect(r.getAllByText("2").length).toBeGreaterThan(0));
    fireEvent.press(r.getAllByLabelText(/rooms free/)[0]);
    const went = String(mockPush.mock.calls.at(-1)?.[0]);
    expect(went).toContain("/agent/search");
    expect(went).toContain("checkIn=");
  });

  /**
   * A night with nothing left is not a night to send somebody to the
   * search for — the search would come back empty and the agent would
   * have learned it twice.
   */
  it("does not offer a search for a night with nothing free", async () => {
    mockCalendar.mockResolvedValue(
      feed({
        resorts: [
          {
            resort: { id: 3, name: "Demo Bay Resort", location: "Cox's Bazar" },
            bookableUntil: null,
            rooms: [room(1, "1 Camellia")],
            stays: [
              {
                roomId: 1,
                checkIn: "2026-09-01",
                checkOut: "2026-10-01",
                mine: false,
                state: "CONFIRMED",
                guestName: null,
                code: null,
                bookingId: null,
                paymentState: null,
              },
            ],
          },
        ],
      }),
    );
    const r = await open();
    await waitFor(() => expect(r.getAllByText("0").length).toBeGreaterThan(20));
    fireEvent.press(r.getAllByLabelText(/nothing free/)[0]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("the states it owes", () => {
    it("says what it is loading", async () => {
      mockCalendar.mockReturnValue(new Promise(() => {}));
      const r = await open();
      await waitFor(() => expect(r.getByText(/Loading the month/)).toBeTruthy());
    });

    it("shows the API's own words when it is refused", async () => {
      mockCalendar.mockRejectedValue(new Error("This agency is not verified yet"));
      const r = await open();
      await waitFor(() => expect(r.getByText(/not verified yet/)).toBeTruthy());
    });

    it("says there is nothing to sell rather than drawing an empty month", async () => {
      mockCalendar.mockResolvedValue(feed({ resorts: [] }));
      const r = await open();
      await waitFor(() => expect(r.getByText(/No resorts/)).toBeTruthy());
    });
  });
});
