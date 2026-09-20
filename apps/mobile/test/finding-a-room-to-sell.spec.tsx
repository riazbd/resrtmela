/**
 * Search: what is free across every resort an agency sells.
 *
 * The one screen an agent uses standing in front of a customer. The
 * console asks for two dates and lists every free room grouped by
 * resort; a phone has room for the same question and the same answer,
 * and nothing else belongs on it.
 *
 * `agentRate` is the field to be careful with. A resort may hide its
 * rates from agencies, and then the offer arrives with only `baseRate` —
 * what the guest pays. Showing that as the agency's cost would have an
 * agent quoting at no margin. Absent means absent, and the screen says
 * so rather than filling the gap.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyRoomOffer } from "@rh/shared";

const mockRooms = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "AGENT" },
    loading: false,
    activeResort: null,
    can: () => true,
  }),
  client: { agent: { rooms: (...a: unknown[]) => mockRooms(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const SearchScreen = require("../app/(tabs)/agent/search").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const offer = (over: Partial<AgencyRoomOffer> = {}): AgencyRoomOffer => ({
  resort: { id: 3, name: "Demo Bay Resort", location: "Cox's Bazar" },
  rooms: [
    { roomId: 12, roomName: "1 Camellia", roomTypeId: 1, baseRate: 6500, agentRate: 5500 },
    { roomId: 14, roomName: "2 Lotus", roomTypeId: 2, baseRate: 7500, agentRate: 6300 },
  ],
  ...over,
});

const open = async () => render(<Harness><SearchScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockRooms.mockResolvedValue([offer()]);
});

describe("finding a room to sell", () => {
  it("asks nothing of the server until there are dates to ask about", async () => {
    await open();
    expect(mockRooms).not.toHaveBeenCalled();
  });

  it("looks across every resort once the dates are set", async () => {
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(mockRooms).toHaveBeenCalled());
    const asked = mockRooms.mock.calls[0][0];
    expect(asked.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(asked.to > asked.from).toBe(true);
  });

  it("groups what is free under the resort it belongs to", async () => {
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(r.getByText(/Demo Bay Resort/)).toBeTruthy());
    expect(r.getByText("1 Camellia")).toBeTruthy();
    expect(r.getByText("2 Lotus")).toBeTruthy();
  });

  /**
   * The agency's cost and the guest's price are different numbers and an
   * agent needs both — the margin is the business.
   */
  it("shows what the agency pays beside what the guest pays", async () => {
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(r.getByText(/৳5,500/)).toBeTruthy());
    expect(r.getByText(/৳6,500/)).toBeTruthy();
  });

  /**
   * A resort that hides its rates sends no `agentRate`. Printing the
   * guest's price as the agency's cost would have somebody quote at no
   * margin at all.
   */
  it("says the rate is hidden rather than showing the guest's price as the cost", async () => {
    mockRooms.mockResolvedValue([
      offer({
        rooms: [{ roomId: 12, roomName: "1 Camellia", roomTypeId: 1, baseRate: 6500 }],
      }),
    ]);
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(r.getByText(/rate not shown/i)).toBeTruthy());
  });

  it("opens a booking for the room and the nights that were tapped", async () => {
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    fireEvent.press(r.getByText("1 Camellia"));
    const went = String(mockPush.mock.calls.at(-1)?.[0]);
    expect(went).toContain("roomId=12");
    expect(went).toContain("checkIn=");
    expect(went).toContain("checkOut=");
  });

  /** Arriving from Discover, the search is already narrowed to that resort. */
  it("carries the resort it was opened for", async () => {
    mockParams = { resortId: "3" };
    const r = await open();
    fireEvent.press(r.getByText("Search"));
    await waitFor(() => expect(mockRooms).toHaveBeenCalled());
    expect(mockRooms.mock.calls[0][0].resortId).toBe(3);
  });

  describe("the states it owes", () => {
    it("says what it is looking through", async () => {
      mockRooms.mockReturnValue(new Promise(() => {}));
      const r = await open();
      fireEvent.press(r.getByText("Search"));
      await waitFor(() => expect(r.getByText(/Looking/)).toBeTruthy());
    });

    it("shows the API's own words when it is refused", async () => {
      mockRooms.mockRejectedValue(new Error("This agency is not verified yet"));
      const r = await open();
      fireEvent.press(r.getByText("Search"));
      await waitFor(() => expect(r.getByText(/not verified yet/)).toBeTruthy());
    });

    it("says nothing is free rather than drawing an empty list", async () => {
      mockRooms.mockResolvedValue([]);
      const r = await open();
      fireEvent.press(r.getByText("Search"));
      await waitFor(() => expect(r.getByText(/Nothing free/)).toBeTruthy());
    });
  });
});
