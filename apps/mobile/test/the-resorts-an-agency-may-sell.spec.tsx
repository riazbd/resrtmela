/**
 * Discover: the screen an agent lands on.
 *
 * `landingFor("AGENT")` is `/agent/discover`, so this is the first thing
 * an agency sees after signing in — and until now it was "Not built
 * yet". All four of the agent's tab screens were, which made the app, for
 * an agency, a sign-in form and a wall.
 *
 * The row that matters is `access`. An agency the platform has not
 * verified sees every resort and can book none of them, and the server
 * sends its own words for why. A list that looks the same either way and
 * quietly does nothing when tapped is the version of this screen that
 * wastes somebody's afternoon.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { DiscoverResort } from "@rh/shared";

const mockDiscover = jest.fn();
const mockPush = jest.fn();
let mockLoading = false;
let mockMe: unknown = { id: 9, name: "Karim", role: "AGENT" };

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ me: mockMe, loading: mockLoading, activeResort: null, can: () => true }),
  client: { agent: { discover: (...a: unknown[]) => mockDiscover(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const DiscoverScreen = require("../app/(tabs)/agent/discover").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const resort = (over: Partial<DiscoverResort> = {}): DiscoverResort => ({
  id: 3,
  name: "Demo Bay Resort",
  location: "Cox's Bazar",
  roomCount: 10,
  roomTypeCount: 3,
  priceFrom: 4500,
  access: "OPEN",
  reason: null,
  ...over,
});

const open = async () => render(<Harness><DiscoverScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockMe = { id: 9, name: "Karim", role: "AGENT" };
  mockDiscover.mockResolvedValue([resort()]);
});

describe("the resorts an agency may sell", () => {
  it("names each one, where it is, and what it starts at", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Bay Resort")).toBeTruthy());
    expect(r.getByText(/Cox's Bazar/)).toBeTruthy();
    // the cheapest active room, which is what "from" means on every
    // listing anybody has ever read
    expect(r.getByText(/৳4,500/)).toBeTruthy();
  });

  it("says how much there is to sell", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText(/10 rooms/)).toBeTruthy());
    expect(r.getByText(/3 (kinds|types)/)).toBeTruthy();
  });

  it("opens the search for a resort that is open to this agency", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Bay Resort")).toBeTruthy());
    fireEvent.press(r.getByText("Demo Bay Resort"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/agent/search"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  /**
   * Waiting is not the same as empty, and it is not the same as open.
   * The platform's own sentence is shown, because "you cannot book yet"
   * with no reason sends somebody to ring the office.
   */
  it("says why, and does not pretend to be bookable, while the platform is still deciding", async () => {
    mockDiscover.mockResolvedValue([
      resort({ access: "WAITING", reason: "Trade licence not yet received" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/Trade licence not yet received/)).toBeTruthy());
    fireEvent.press(r.getByText("Demo Bay Resort"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("says a resort with no rooms has no price rather than printing zero", async () => {
    mockDiscover.mockResolvedValue([resort({ priceFrom: null, roomCount: 0 })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Bay Resort")).toBeTruthy());
    expect(r.queryByText(/৳0/)).toBeNull();
  });

  describe("the states it owes", () => {
    it("says what it is loading", async () => {
      mockDiscover.mockReturnValue(new Promise(() => {}));
      const r = await open();
      await waitFor(() => expect(r.getByText(/Loading the resorts/)).toBeTruthy());
    });

    it("shows the API's own words when it is refused", async () => {
      mockDiscover.mockRejectedValue(new Error("Only agencies may look here"));
      const r = await open();
      await waitFor(() => expect(r.getByText(/Only agencies may look here/)).toBeTruthy());
    });

    it("says there is nothing to sell rather than drawing an empty list", async () => {
      mockDiscover.mockResolvedValue([]);
      const r = await open();
      await waitFor(() => expect(r.getByText(/No resorts/)).toBeTruthy());
    });

    it("waits rather than blaming the person, while the session restores", async () => {
      mockLoading = true;
      mockMe = null;
      const r = await open();
      await waitFor(() => expect(r.getByText(/Loading the resorts/)).toBeTruthy());
      expect(r.queryByText(/not signed in/i)).toBeNull();
    });
  });
});
