/**
 * My bookings, and the booking screen an agent is sent to (2026-09-28).
 *
 * The owner asked for three things and two of them are here.
 *
 * **"my booking option ta lagbe"** — an agency had no list of its own
 * bookings in either client. The resort's list is one resort's and an agency
 * sells across several, so a stay it had quoted, converted and invoiced was
 * findable only by opening each resort's list in turn. This is that list.
 *
 * **"booking confirm er por white screen hye thake"** — taking a booking
 * ends with `router.replace('/bookings/<id>')`, and that screen printed
 * `Sold by {b.agent}`. The route sent `{ id, name }` while `BookingDetail`
 * said `string`, so React was handed an object, refused it, and the screen
 * went blank. The API sends the name now; what is asserted here is the
 * screen drawing it, because a type both sides agree on is what let this
 * through in the first place.
 *
 * And the screen behind the blank one was wrong too: it offered an agency
 * Confirm, Check in, Mark no-show and Take payment, all of which the server
 * answers 403 to. What an agency can do is ask the resort to cancel.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyBookingRow, BookingDetail } from "@rh/shared";

const mockAgencyBookings = jest.fn();
const mockBookingGet = jest.fn();
const mockRequestCancel = jest.fn();
const mockPush = jest.fn();
let mockRole = "AGENT";

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "563" }),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: {
      id: 9,
      name: "Karim",
      role: mockRole,
      resorts: [
        { resort: { id: 1, name: "Sky Eco Resort" } },
        { resort: { id: 2, name: "Cox Bay Beach Resort" } },
      ],
    },
    loading: false,
    role: mockRole,
    activeResort: null,
    can: () => true,
  }),
  client: {
    agent: { bookings: (...a: unknown[]) => mockAgencyBookings(...a) },
    bookings: {
      get: (...a: unknown[]) => mockBookingGet(...a),
      requestCancel: (...a: unknown[]) => mockRequestCancel(...a),
    },
  },
}));

jest.mock("../src/api/desk", () => ({
  useStayDesk: () => ({ transition: jest.fn() }),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const MyBookings = require("../app/(tabs)/(desk)/agent/bookings").default;
const BookingScreen = require("../app/(tabs)/(desk)/bookings/[id]/index").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const sold = (over: Partial<AgencyBookingRow> = {}): AgencyBookingRow =>
  ({
    id: 563,
    code: "BK-00563",
    state: "PENDING",
    paymentState: "UNPAID",
    source: "AGENT",
    checkIn: "2026-11-07",
    checkOut: "2026-11-08",
    guest: { id: 3, fullName: "Shahriar Kabir", phone: "8801711000222" },
    // the firm the resort deals with, and the person at it who rang
    agency: "Sea Breeze Travels",
    agent: "Nabila Rahman",
    resort: { id: 1, name: "Sky Eco Resort" },
    rooms: ["101"],
    adults: 2,
    children: 0,
    discount: 0,
    nights: 1,
    rent: 4500,
    paid: 0,
    due: 4500,
    ...over,
  }) as AgencyBookingRow;

const booking = (over: Partial<BookingDetail> = {}): BookingDetail =>
  ({
    id: 563,
    code: "BK-00563",
    resortId: 1,
    state: "PENDING",
    paymentState: "UNPAID",
    cancelState: "NONE",
    source: "AGENT",
    checkIn: "2026-11-07",
    checkOut: "2026-11-08",
    guest: { id: 3, fullName: "Shahriar Kabir", phone: "8801711000222" },
    // the field that took the screen down: a name, never a row
    agency: "Sea Breeze Travels",
    agent: "Nabila Rahman",
    createdBy: null,
    items: [],
    payments: [],
    adults: 2,
    children: 0,
    extraPersons: 0,
    discount: 0,
    discountKind: "FLAT",
    remarks: null,
    nights: 1,
    rent: 4500,
    roomRent: 4500,
    taxable: 4500,
    taxRatePct: 0,
    tax: 0,
    taxLines: [],
    total: 4500,
    paid: 0,
    due: 4500,
    refunded: 0,
    ...over,
  }) as unknown as BookingDetail;

const openList = async () => render(<Harness><MyBookings /></Harness>);
const openBooking = async () => render(<Harness><BookingScreen /></Harness>);

beforeEach(() => {
  mockRole = "AGENT";
  mockAgencyBookings.mockReset().mockResolvedValue({ total: 1, rows: [sold()] });
  mockBookingGet.mockReset().mockResolvedValue(booking());
  mockRequestCancel.mockReset().mockResolvedValue({ requested: true });
  mockPush.mockReset();
});

describe("the agency's own list", () => {
  it("shows a booking it sold, and says which resort it is at", async () => {
    const view = await openList();

    await waitFor(() => expect(view.getByText("Shahriar Kabir")).toBeTruthy());
    // the resort, because "101" is a room at three different hotels once
    // every resort is on one list
    expect(view.getByText(/Sky Eco Resort/)).toBeTruthy();
    expect(view.getByText(/BK-00563/)).toBeTruthy();
  });

  it("asks the server, and does not name a resort until one is chosen", async () => {
    await openList();

    await waitFor(() => expect(mockAgencyBookings).toHaveBeenCalled());
    expect(mockAgencyBookings.mock.calls[0]![0]).toMatchObject({ resortId: undefined });
  });

  it("opens the booking when a row is pressed", async () => {
    const view = await openList();

    await waitFor(() => expect(view.getByText("Shahriar Kabir")).toBeTruthy());
    await fireEvent.press(view.getByText("Shahriar Kabir"));

    expect(mockPush).toHaveBeenCalledWith("/bookings/563");
  });

  it("says so plainly when the agency has sold nothing yet", async () => {
    mockAgencyBookings.mockResolvedValue({ total: 0, rows: [] });
    const view = await openList();

    await waitFor(() => expect(view.getByText("No bookings yet")).toBeTruthy());
  });
});

describe("the booking screen an agent lands on after taking one", () => {
  it("draws, and names who sold it", async () => {
    const view = await openBooking();

    // the whole bug: this screen rendered nothing at all when `agent` was a row
    await waitFor(() => expect(view.getByText("Sold by")).toBeTruthy());
    /**
     * The firm first. This named only the person until 2026-09-28 — and a
     * resort has no relationship with Nabila Rahman; the rate, the account and
     * the settlement all hang off Sea Breeze Travels behind her. Both are
     * here, under headings that say which is which.
     */
    expect(view.getByText("Sea Breeze Travels")).toBeTruthy();
    expect(view.getByText("Who rang")).toBeTruthy();
    expect(view.getByText("Nabila Rahman")).toBeTruthy();
  });

  it("offers an agency nothing the server would refuse", async () => {
    const view = await openBooking();

    await waitFor(() => expect(view.getByText("Sold by")).toBeTruthy());
    expect(view.queryByText("Confirm")).toBeNull();
    expect(view.queryByText("Check in")).toBeNull();
    expect(view.queryByText("Mark no-show")).toBeNull();
    expect(view.queryByText("Take payment")).toBeNull();
  });

  it("offers the one thing an agency can do, and does it when asked", async () => {
    const view = await openBooking();

    await waitFor(() => expect(view.getByText("Ask the resort to cancel")).toBeTruthy());
    await fireEvent.press(view.getByText("Ask the resort to cancel"));

    await waitFor(() => expect(mockRequestCancel).toHaveBeenCalledWith(563));
  });

  it("does not offer to ask twice while a request is already waiting", async () => {
    mockBookingGet.mockResolvedValue(booking({ cancelState: "REQUESTED" }));
    const view = await openBooking();

    await waitFor(() => expect(view.getByText("Sold by")).toBeTruthy());
    expect(view.queryByText("Ask the resort to cancel")).toBeNull();
  });

  it("still gives the resort's own desk its buttons", async () => {
    mockRole = "FRONT_DESK";
    const view = await openBooking();

    await waitFor(() => expect(view.getByText("Confirm")).toBeTruthy());
    expect(view.queryByText("Ask the resort to cancel")).toBeNull();
    expect(view.getByText("Take payment")).toBeTruthy();
  });
});
