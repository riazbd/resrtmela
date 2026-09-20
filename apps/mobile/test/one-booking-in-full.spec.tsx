/**
 * One booking, everything about it.
 *
 * The screen a clerk opens with a guest standing in front of them, so the
 * three questions it must answer without scrolling are who, which rooms, and
 * what is left to pay. Below that is the bill itself, line by line, and the
 * payments already taken.
 *
 * The bill's lines come from `billLines` in `@rh/shared`, shared with the
 * console. A guest shown one total at the desk and another on a phone has
 * been overcharged by one of them.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingDetail } from "@rh/shared";

const mockGet = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: mockBack },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: "41" }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: { id: 3, name: "Demo Bay Resort" } }),
  client: { bookings: { get: (...a: unknown[]) => mockGet(...a) } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BookingScreen = require("../app/bookings/[id]").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const detail = (over: Partial<BookingDetail> = {}): BookingDetail =>
  ({
    id: 41,
    code: "BK-00041",
    state: "CHECKED_IN",
    paymentState: "PARTIAL",
    cancelState: "NONE",
    source: "PHONE",
    checkIn: "2026-09-19T00:00:00.000Z",
    checkOut: "2026-09-21T00:00:00.000Z",
    guest: { id: 9, fullName: "Rafiq Hasan", phone: "01811110001", nidPassportNo: "1234567890" },
    agent: null,
    // no `rooms` here, because `GET /bookings/:id` sends none. The fixture
    // had one until 2026-09-20, because the type said there would be — and
    // eighteen tests passed while the screen crashed on the first real
    // booking it was pointed at.
    adults: 2,
    children: 1,
    extraPersons: 1,
    discount: 500,
    discountKind: "FLAT",
    discountValue: 500,
    nights: 2,
    // the arithmetic below, so the fixture is a booking that could exist:
    // 9,000 room + 1,600 extra person + 1,200 damage − 500 discount
    rent: 9000,
    total: 11300,
    paid: 5000,
    due: 6300,
    refunded: 0,
    remarks: "Late arrival, keep the gate open",
    createdBy: { id: 2, name: "Front desk" },
    items: [
      // `qty: 1` and `nights: 2` — one room, two nights. The API creates a
      // room item with `qty: 1` and sends `nights` as the count of its
      // BookingNight rows. This fixture said `qty: 2, nights: 2` until it
      // was checked against a real booking, and the bill was out by a
      // factor of the stay's length.
      {
        id: 1, kind: "ROOM", room: { id: 11, name: "1 Camellia", type: "Deluxe Twin" },
        slot: null, qty: 1, unitPrice: 4500, nights: 2, chargeKind: null, label: null,
      },
      // `qty` is people × nights, and there are no BookingNight rows for an
      // extra person, so `nights` is 0 on the wire
      {
        id: 2, kind: "EXTRA_PERSON", room: { id: 11, name: "1 Camellia", type: "Deluxe Twin" },
        slot: null, qty: 2, unitPrice: 800, nights: 0, chargeKind: null, label: null,
      },
      {
        id: 3, kind: "CHARGE", room: null, slot: null, qty: 1, unitPrice: 1200,
        nights: 0, chargeKind: "DAMAGE", label: "Broken lamp",
      },
    ],
    payments: [
      {
        id: 7, amount: 5000, method: "BKASH", type: "ADVANCE",
        receivedBy: "Front desk", receivedAt: "2026-09-18T10:00:00.000Z", note: null,
      },
    ],
    ...over,
  }) as BookingDetail;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(detail());
  mockBack.mockReset();
});

describe("which booking", () => {
  it("asks for the one in the address", async () => {
    await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(41));
  });
});

describe("the three questions a clerk has", () => {
  it("says who, where and when", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.getByText("01811110001")).toBeTruthy();
    // the room shows twice on this screen and both are right: once as a
    // fact about the stay, once as a line on the bill
    expect(r.getByLabelText("Rooms: 1 Camellia")).toBeTruthy();
    expect(r.getByLabelText(/^Stay: 19 Sep → 21 Sep/)).toBeTruthy();
  });

  it("says what is still owed, in the largest figure on the screen", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Due: ৳6,300")).toBeTruthy());
    expect(r.getByLabelText("Paid: ৳5,000")).toBeTruthy();
    expect(r.getByLabelText("Total: ৳11,300")).toBeTruthy();
  });

  it("says which state the stay is in, in words", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Checked-in")).toBeTruthy());
  });

  it("counts the people, including the ones who turned up unannounced", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText(/2 adults, 1 child/)).toBeTruthy());
    expect(r.getByText(/1 extra person/)).toBeTruthy();
  });
});

describe("the bill", () => {
  it("lists every line with what it came to", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("1 Camellia, ৳9,000")).toBeTruthy());
    expect(r.getByLabelText("Extra person — 1 Camellia, ৳1,600")).toBeTruthy();
    expect(r.getByLabelText("Damage — Broken lamp, ৳1,200")).toBeTruthy();
  });

  it("shows the discount that was given, and how", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Discount: ৳500")).toBeTruthy());
  });

  it("says a percentage discount as the percentage it was", async () => {
    mockGet.mockResolvedValue(detail({ discountKind: "PERCENT", discountValue: 10, discount: 900 }));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Discount (10%)")).toBeTruthy());
  });

  it("says nothing about a discount nobody gave", async () => {
    mockGet.mockResolvedValue(detail({ discount: 0, discountValue: 0 }));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByText(/^Discount/)).toBeNull();
  });

  it("says a booking with nothing on it has nothing on it", async () => {
    mockGet.mockResolvedValue(detail({ items: [] }));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Nothing on the bill yet")).toBeTruthy());
  });
});

describe("what has been paid", () => {
  it("lists each payment with how it arrived and who took it", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    // "BKASH", not "bKash": the payment row carries the resort's own code and
    // `methodLabel` passes it through. Prettifying it here would be this
    // screen inventing a label the rest of the product does not use.
    await waitFor(() => expect(r.getByLabelText("BKASH, ৳5,000, 18 Sep 26, taken by Front desk")).toBeTruthy());
  });

  /**
   * An imported payment has no method: the sheet had no column for it. The
   * console draws that as its own thing rather than defaulting to cash,
   * because a defaulted CASH is indistinguishable from cash somebody
   * counted.
   */
  it("does not invent a method for a payment that has none", async () => {
    mockGet.mockResolvedValue(
      detail({
        payments: [
          { id: 7, amount: 5000, method: null, type: "ADVANCE", receivedBy: null, receivedAt: "2026-09-18T10:00:00.000Z", note: null },
        ],
      } as Partial<BookingDetail>),
    );
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText(/Not recorded/)).toBeTruthy());
    expect(r.queryByText(/Cash/)).toBeNull();
  });

  it("says so when nobody has paid anything", async () => {
    mockGet.mockResolvedValue(detail({ payments: [], paid: 0, due: 11300 }));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("No payments yet")).toBeTruthy());
  });
});

describe("what the desk wrote down", () => {
  it("shows the remarks, because that is where the gate instruction lives", async () => {
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Late arrival, keep the gate open")).toBeTruthy());
  });

  it("leaves the note out entirely when there is none", async () => {
    mockGet.mockResolvedValue(detail({ remarks: null }));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByText("Note")).toBeNull();
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    let answer!: (b: BookingDetail) => void;
    mockGet.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (b: BookingDetail) => void)),
    );
    const r = await render(<Harness><BookingScreen /></Harness>);
    expect(r.getByText("Loading the booking…")).toBeTruthy();
    const { act } = require("@testing-library/react-native");
    await act(async () => {
      answer(detail());
    });
  });

  /**
   * A booking somebody deleted, or a link from a notification that is older
   * than the booking it points at. Not a crash, and not an empty screen.
   */
  it("says so when the booking is not there", async () => {
    const { ApiError } = require("@rh/shared");
    mockGet.mockRejectedValue(new ApiError(404, "Booking not found"));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Booking not found")).toBeTruthy());
  });

  it("offers a way back out of a booking that will not open", async () => {
    const { ApiError } = require("@rh/shared");
    mockGet.mockRejectedValue(new ApiError(404, "Booking not found"));
    const r = await render(<Harness><BookingScreen /></Harness>);
    await waitFor(() => expect(r.getByRole("button", { name: "Back to bookings" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Back to bookings" }));
    expect(mockBack).toHaveBeenCalled();
  });
});
