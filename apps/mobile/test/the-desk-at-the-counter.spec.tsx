/**
 * Arriving, leaving, and paying.
 *
 * Three moments a clerk handles with a guest in front of them, and each
 * asks the one question it is the only moment able to answer:
 *
 *   - **arriving** — who actually came. A booking for two turns up as four,
 *     and the extra people are charged for every night at the rate of the
 *     room each sleeps in;
 *   - **leaving** — what else is owed. Water from the minibar, a broken
 *     lamp, a smoking fine. Check out is the last button on that screen,
 *     because checking out issues the invoice and an issued invoice does
 *     not take another line;
 *   - **paying** — money into the drawer, against what is still due.
 *
 * Which buttons a booking is offered at all is `nextStates` in
 * `@rh/shared`; the console runs the same six answers.
 *
 * The two that a guest is standing there for — arriving and leaving — go
 * through the outbox, so a resort whose network drops mid-morning keeps
 * moving. Everything else needs a connection and says so.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingDetail } from "@rh/shared";

const mockGet = jest.fn();
const mockTransition = jest.fn();
const mockPay = jest.fn();
const mockExtraPersons = jest.fn();
const mockAddCharge = jest.fn();
const mockRemoveCharge = jest.fn();
const mockOptions = jest.fn();
const mockSubmit = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: () => mockBack() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "41" }),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    isStaff: true,
    isAgent: false,
  }),
  client: {
    bookings: {
      get: (...a: unknown[]) => mockGet(...a),
      transition: (...a: unknown[]) => mockTransition(...a),
      pay: (...a: unknown[]) => mockPay(...a),
      extraPersons: (...a: unknown[]) => mockExtraPersons(...a),
      addCharge: (...a: unknown[]) => mockAddCharge(...a),
      removeCharge: (...a: unknown[]) => mockRemoveCharge(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
  },
}));

jest.mock("../src/api/desk", () => ({
  useStayDesk: () => ({
    transition: (...a: unknown[]) => mockSubmit("transition", ...a),
    pay: (...a: unknown[]) => mockSubmit("pay", ...a),
    online: true,
  }),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const BookingScreen = require("../app/bookings/[id]").default;
const ArriveScreen = require("../app/bookings/[id]/arrive").default;
const DepartScreen = require("../app/bookings/[id]/depart").default;
const PayScreen = require("../app/bookings/[id]/pay").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const booking = (over: Partial<BookingDetail> = {}): BookingDetail =>
  ({
    id: 41,
    code: "BK-00041",
    resortId: 3,
    state: "CONFIRMED",
    cancelState: "NONE",
    paymentState: "PARTIAL",
    checkIn: "2026-09-22T00:00:00.000Z",
    checkOut: "2026-09-24T00:00:00.000Z",
    nights: 2,
    adults: 2,
    children: 0,
    extraPersons: 0,
    guest: { id: 7, fullName: "Rafiq Hasan", phone: "01711000000" },
    agent: null,
    source: "DIRECT",
    remarks: null,
    invoiceNo: undefined,
    roomRent: 13000,
    taxable: 13000,
    taxRatePct: 0,
    tax: 0,
    taxLines: [],
    discount: 0,
    discountKind: "FLAT",
    discountValue: 0,
    total: 13000,
    paid: 5000,
    refunded: 0,
    due: 8000,
    createdBy: "Demo Resort Owner",
    items: [
      {
        id: 901,
        kind: "ROOM",
        room: { id: 11, name: "1 Camellia" },
        slot: null,
        qty: 1,
        unitPrice: 6500,
        nights: 2,
        label: null,
        chargeKind: null,
      },
    ],
    payments: [],
    ...over,
  }) as unknown as BookingDetail;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(booking());
  mockTransition.mockReset().mockResolvedValue(booking({ state: "CHECKED_IN" }));
  mockPay.mockReset().mockResolvedValue({ payment: { id: 5 }, booking: booking(), replayed: false });
  mockExtraPersons.mockReset().mockResolvedValue(booking({ extraPersons: 2 }));
  mockAddCharge.mockReset().mockResolvedValue(booking());
  mockRemoveCharge.mockReset().mockResolvedValue(booking());
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "BKASH", label: "bKash", active: true, sortOrder: 1 },
  ]);
  mockSubmit.mockReset().mockResolvedValue({ queued: false });
  mockPush.mockReset();
  mockBack.mockReset();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("what a booking is offered", () => {
  it("offers a confirmed booking the two things that can happen to it", async () => {
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check in" })).toBeTruthy());
    expect(r.getByRole("button", { name: "Mark no-show" })).toBeTruthy();
  });

  it("offers a departure to somebody in house", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check out" })).toBeTruthy());
    expect(r.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  /** Checking out issued the invoice. There is nothing left to press. */
  it("offers nothing to a booking that has ended", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_OUT" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Check out" })).toBeNull();
    expect(r.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  it("offers to take money while anything is owed", async () => {
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Take payment" })).toBeTruthy());
  });

  it("does not offer to take money on a settled booking", async () => {
    mockGet.mockResolvedValue(booking({ paid: 13000, due: 0, paymentState: "PAID" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Take payment" })).toBeNull();
  });

  /**
   * Arriving and leaving each ask a question first, so the button opens a
   * screen rather than firing the transition. No-show asks nothing and
   * goes straight through.
   */
  it("asks who came before checking anybody in", async () => {
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check in" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Check in" }));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41/arrive");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("asks what else is owed before checking anybody out", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check out" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Check out" }));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41/depart");
  });
});

describe("who actually arrived", () => {
  it("says what the rooms were booked for", async () => {
    // one sentence, not three text nodes: a screen reader announces each
    // node separately, so a line assembled from fragments arrives as
    // unrelated sentences
    const r = await open(ArriveScreen);
    await waitFor(() => expect(r.getByText("Booked for 2 adults.")).toBeTruthy());
  });

  it("checks in without touching the count when nobody extra came", async () => {
    const r = await open(ArriveScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check in" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith("transition", expect.anything(), "CHECKED_IN"));
    expect(mockExtraPersons).not.toHaveBeenCalled();
  });

  /**
   * The count is set first and the check-in second, in that order: a
   * check-in that succeeded over a count that did not would leave the
   * guest in house and the bill wrong.
   */
  it("records the extra people before it checks anybody in", async () => {
    const r = await open(ArriveScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "One more extra person" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "One more extra person" }));
    await fireEvent.press(r.getByRole("button", { name: "One more extra person" }));
    await fireEvent.press(r.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(mockExtraPersons).toHaveBeenCalledWith(41, 2));
    expect(mockSubmit).toHaveBeenCalledWith("transition", expect.anything(), "CHECKED_IN");
  });

  it("does not check anybody in when the count is refused", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockExtraPersons.mockRejectedValue(new ApiError(400, "Those rooms take 1 extra person, not 2."));

    const r = await open(ArriveScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "One more extra person" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "One more extra person" }));
    await fireEvent.press(r.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(r.getByText("Those rooms take 1 extra person, not 2.")).toBeTruthy());
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe("what is owed before they leave", () => {
  const withCharge = booking({
    state: "CHECKED_IN",
    items: [
      {
        id: 901,
        kind: "ROOM",
        room: { id: 11, name: "1 Camellia" },
        slot: null,
        qty: 1,
        unitPrice: 6500,
        nights: 2,
        label: null,
        chargeKind: null,
      },
      {
        id: 902,
        kind: "CHARGE",
        room: null,
        slot: null,
        qty: 1,
        unitPrice: 800,
        nights: 0,
        label: "Broken lamp",
        chargeKind: "DAMAGE",
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  it("lists what has already been put on the bill", async () => {
    mockGet.mockResolvedValue(withCharge);
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByLabelText("Damage — Broken lamp, ৳800")).toBeTruthy());
  });

  it("says so when nothing was added", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByText("Nothing charged beyond the stay.")).toBeTruthy());
  });

  it("adds a charge, and needs both what it was and what it cost", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());

    // nothing typed: pressing it says what is missing rather than doing nothing
    await fireEvent.press(r.getByRole("button", { name: "Add charge" }));
    expect(mockAddCharge).not.toHaveBeenCalled();
    expect(r.getByText("Say what it was for, and what it cost.")).toBeTruthy();

    await fireEvent.changeText(r.getByLabelText("What for"), "Broken lamp");
    await fireEvent.changeText(r.getByLabelText("Amount each"), "800");
    await fireEvent.press(r.getByRole("button", { name: "Add charge" }));

    await waitFor(() =>
      expect(mockAddCharge).toHaveBeenCalledWith(41, {
        kind: "SERVICE",
        label: "Broken lamp",
        qty: 1,
        amount: 800,
      }),
    );
  });

  it("takes a charge back off", async () => {
    mockGet.mockResolvedValue(withCharge);
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Remove Broken lamp" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Remove Broken lamp" }));
    await waitFor(() => expect(mockRemoveCharge).toHaveBeenCalledWith(41, 902));
  });

  it("shows what the stay comes to, so nobody leaves owing money unnoticed", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByLabelText("Due: ৳8,000")).toBeTruthy());
  });

  it("checks out, and check out is the last button", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(DepartScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Check out" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Check out" }));
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith("transition", expect.anything(), "CHECKED_OUT"),
    );
  });
});

describe("taking money", () => {
  it("offers what is still due, because that is what is usually taken", async () => {
    const r = await open(PayScreen);
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    expect(r.getByLabelText("Amount").props.value).toBe("8000");
  });

  it("will not take nothing", async () => {
    const r = await open(PayScreen);
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Amount"), "0");
    await fireEvent.press(r.getByRole("button", { name: /^Take/ }));
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(r.getByText("Type how much is being paid.")).toBeTruthy();
  });

  it("takes the money and goes back to the booking", async () => {
    const r = await open(PayScreen);
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Amount"), "3000");
    await fireEvent.press(r.getByRole("button", { name: "bKash" }));
    await fireEvent.press(r.getByRole("button", { name: /^Take/ }));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith("pay", expect.anything(), {
        amount: 3000,
        method: "BKASH",
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  /** One tap, one payment. A guest charged twice is the worst bug here. */
  it("cannot be double-tapped into two payments", async () => {
    let release: (v: unknown) => void = () => {};
    mockSubmit.mockImplementation(() => new Promise((res) => { release = res; }));

    const r = await open(PayScreen);
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    const button = r.getByRole("button", { name: /^Take/ });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    release({ queued: false });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("shows what the server refused, and stays put", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockSubmit.mockRejectedValue(new ApiError(400, "This booking is cancelled."));

    const r = await open(PayScreen);
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /^Take/ }));

    await waitFor(() => expect(r.getByText("This booking is cancelled.")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });
});
