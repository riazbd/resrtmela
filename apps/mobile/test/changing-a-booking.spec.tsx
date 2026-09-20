/**
 * Changing a booking after it was made.
 *
 * A guest staying one night longer used to mean cancelling and booking
 * again, which loses the payment ledger along with the booking. The API
 * has taken this edit all along; what it also has, and no client knew, is
 * two rules it enforces with a 409 after the form is full:
 *
 *   - an agent and a front desk may edit only before the guest arrives;
 *   - an agent may not change the discount at all.
 *
 * Both are `canEditStay` in `@rh/shared` now, so the screen declines to
 * offer what the server would refuse — and the patch it sends is
 * `bookingChanges`, which sends only what moved.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingDetail } from "@rh/shared";

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockRole = "MANAGER";

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
    role: mockRole,
  }),
  client: {
    bookings: {
      get: (...a: unknown[]) => mockGet(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    options: { list: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock("../src/api/desk", () => ({
  useStayDesk: () => ({ transition: jest.fn(), pay: jest.fn(), online: true }),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const EditScreen = require("../app/(tabs)/(desk)/bookings/[id]/edit").default;
const BookingScreen = require("../app/(tabs)/(desk)/bookings/[id]").default;
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
  mockRole = "MANAGER";
  mockGet.mockReset().mockResolvedValue(booking());
  mockUpdate.mockReset().mockResolvedValue(booking({ adults: 3 }));
  mockPush.mockReset();
  mockBack.mockReset();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("who is offered the change", () => {
  it("offers it to a manager whatever state the stay is in", async () => {
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Change" })).toBeTruthy());
  });

  /**
   * The console's own bug, not repeated here: it offered Edit on a
   * checked-in booking to anybody with the permission, and the API
   * refuses a front desk — after the form is full.
   */
  it("does not offer it to a front desk once the guest is in the room", async () => {
    mockRole = "FRONT_DESK";
    mockGet.mockResolvedValue(booking({ state: "CHECKED_IN" }));
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("offers it to a front desk before the guest arrives", async () => {
    mockRole = "FRONT_DESK";
    const r = await open(BookingScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Change" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Change" }));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41/edit");
  });
});

describe("the form itself", () => {
  it("opens on the booking as it is now", async () => {
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByText("Tuesday, 22 September 2026")).toBeTruthy());
    expect(r.getByText("Thursday, 24 September 2026")).toBeTruthy();
  });

  it("sends nothing and goes back when nothing moved", async () => {
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Save changes" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sends only what moved", async () => {
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "One more adult" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "One more adult" }));
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(41, { adults: 3 }));
  });

  it("moves the dates", async () => {
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByLabelText("Check-out, next day")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Check-out, next day"));
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(41, { checkOut: "2026-09-25" }));
  });

  /** An agent is quoted the resort's terms; they do not set them. */
  it("does not show an agent the discount at all", async () => {
    mockRole = "AGENT";
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Save changes" })).toBeTruthy());
    expect(r.queryByLabelText("Discount")).toBeNull();
  });

  it("shows a manager the discount", async () => {
    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByLabelText("Discount")).toBeTruthy());
  });

  /**
   * The rule the screen exists to keep off the counter: the form itself
   * is refused, rather than offered and then thrown away.
   */
  it("refuses the whole form when this person may not change this booking", async () => {
    mockRole = "FRONT_DESK";
    mockGet.mockResolvedValue(booking({ state: "CHECKED_OUT" }));
    const r = await open(EditScreen);
    await waitFor(() =>
      expect(
        r.getByText("Only before the guest arrives — ask a manager to change this one."),
      ).toBeTruthy(),
    );
    expect(r.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows what the server refused, and stays put", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockUpdate.mockRejectedValue(new ApiError(409, "1 Camellia is taken on 24 Sep."));

    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "One more adult" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "One more adult" }));
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(r.getByText("1 Camellia is taken on 24 Sep.")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("cannot be double-tapped into two saves", async () => {
    let release: (v: unknown) => void = () => {};
    mockUpdate.mockImplementation(() => new Promise((res) => { release = res; }));

    const r = await open(EditScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "One more adult" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "One more adult" }));
    const save = r.getByRole("button", { name: "Save changes" });
    await fireEvent.press(save);
    await fireEvent.press(save);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    release(booking({ adults: 3 }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
