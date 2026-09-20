/**
 * Taking a booking on a phone.
 *
 * The console does this in one modal: two date boxes, a room grid, nine
 * fields, a bill and an advance, all at once. That works on a desk and does
 * not work in a hand — so §5 of the design splits it where the questions
 * naturally split, and each step is a screen a clerk can finish while a
 * guest is still talking:
 *
 *   1. **when, and which room** — the only part that depends on availability
 *   2. **who** — the guest, and whether this is a walk-in or a group
 *   3. **what it costs** — the server's bill, the advance, and Create
 *
 * The draft lives above all three, so going back does not lose what was
 * typed, and the rules that decide any of it are `@rh/shared`'s, because the
 * console books into the same calendar.
 *
 * Nothing here filters or prices anything locally: the grid is the server's
 * availability and the bill is the server's quote.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { BookingQuote, RoomAvail } from "@rh/shared";

const mockAvailability = jest.fn();
const mockQuote = jest.fn();
const mockCreate = jest.fn();
const mockCreateGroup = jest.fn();
const mockOptions = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (p: string) => mockPush(p),
    replace: (p: string) => mockReplace(p),
    back: jest.fn(),
  },
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    isStaff: true,
    isAgent: false,
  }),
  client: {
    rooms: { availability: (...a: unknown[]) => mockAvailability(...a) },
    bookings: {
      quote: (...a: unknown[]) => mockQuote(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      createGroup: (...a: unknown[]) => mockCreateGroup(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const WhenAndWhere = require("../app/(tabs)/(desk)/new-booking/index").default;
const Who = require("../app/(tabs)/(desk)/new-booking/guest").default;
const Money = require("../app/(tabs)/(desk)/new-booking/money").default;
const { Draft } = require("../src/booking/draft");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (over: Partial<RoomAvail>): RoomAvail => ({
  roomId: 11,
  roomName: "1 Camellia",
  roomTypeId: 2,
  baseRate: 6500,
  status: "ACTIVE",
  busyNights: [],
  ...over,
});

const THREE = [
  room({ roomId: 11, roomName: "1 Camellia" }),
  room({ roomId: 12, roomName: "2 Lotus", busyNights: ["2026-09-22"] }),
  room({ roomId: 13, roomName: "3 Orchid", status: "OUT_OF_SERVICE" }),
];

const QUOTE: BookingQuote = {
  nights: 2,
  rent: 13000,
  roomRent: 13000,
  discount: 0,
  discountIsAutomatic: false,
  taxable: 13000,
  taxRatePct: 0,
  tax: 0,
  taxLines: [],
  total: 13000,
  lines: [{ kind: "ROOM", label: "1 Camellia", unitPrice: 6500, qty: 1, nights: 2, amount: 13000 }],
};

/** Where steps 2 and 3 are reached from: a room picked and the dates set. */
const CHOSEN = {
  checkIn: "2026-09-22",
  checkOut: "2026-09-24",
  rooms: [room({})],
};

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "nextTick",
      "queueMicrotask",
      "performance",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
  mockAvailability.mockReset().mockResolvedValue(THREE);
  mockQuote.mockReset().mockResolvedValue(QUOTE);
  mockCreate.mockReset().mockResolvedValue({ id: 91, code: "BK-0091" });
  mockCreateGroup.mockReset().mockResolvedValue({
    groupTag: "GRP-7",
    count: 2,
    bookings: [
      { id: 91, code: "BK-0091" },
      { id: 92, code: "BK-0092" },
    ],
  });
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "BKASH", label: "bKash", active: true, sortOrder: 1 },
  ]);
  mockPush.mockReset();
  mockReplace.mockReset();
});

afterEach(() => jest.useRealTimers());

/** `render` is async in RNTL 14, so every caller awaits this. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = async (Screen: any, start?: Record<string, unknown>) =>
  render(
    <Harness>
      <Draft start={start}>
        <Screen />
      </Draft>
    </Harness>,
  );

describe("when, and which room", () => {
  it("opens on tonight, because that is most bookings", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByText("Sunday, 20 September 2026")).toBeTruthy());
    expect(r.getByText("Monday, 21 September 2026")).toBeTruthy();
  });

  it("asks the server which rooms are free for those nights", async () => {
    await open(WhenAndWhere);
    await waitFor(() =>
      expect(mockAvailability).toHaveBeenCalledWith(3, "2026-09-20", "2026-09-21"),
    );
  });

  it("offers a free room", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByLabelText("1 Camellia, free")).toBeTruthy());
  });

  /**
   * Two reasons a room cannot be taken, and they are not the same reason —
   * the same distinction `roomOffer` draws for the console's grid.
   */
  it("says which rooms cannot be taken, and why", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByLabelText("2 Lotus, busy (1n)")).toBeTruthy());
    expect(r.getByLabelText("3 Orchid, out of service")).toBeTruthy();
  });

  it("does not let a busy room be picked", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByLabelText("2 Lotus, busy (1n)")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("2 Lotus, busy (1n)"));
    expect(r.getByLabelText("2 Lotus, busy (1n)").props.accessibilityState?.selected).toBeFalsy();
  });

  /**
   * Pressable, and it says what is missing. A greyed-out button with three
   * rooms picked and an empty name scrolled out of sight reads as "three
   * rooms cannot go on one booking" — which is what the console's did.
   */
  it("will not move on without a room, and says so", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByRole("button", { name: "Next: the guest" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Next: the guest" }));
    expect(r.getByText("Pick at least one room.")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("moves on once a room is picked", async () => {
    const r = await open(WhenAndWhere);
    await waitFor(() => expect(r.getByLabelText("1 Camellia, free")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("1 Camellia, free"));
    // the button counts what has been picked, as the console's does
    await fireEvent.press(r.getByRole("button", { name: "Next: the guest (1 room)" }));
    expect(mockPush).toHaveBeenCalledWith("/new-booking/guest");
  });
});

describe("who the guest is", () => {
  it("will not move on without a name, and says so", async () => {
    const r = await open(Who, CHOSEN);
    await waitFor(() => expect(r.getByRole("button", { name: "Next: the money" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Next: the money" }));
    expect(r.getByText("Type the guest's name.")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("moves on once the guest has a name", async () => {
    const r = await open(Who, CHOSEN);
    await waitFor(() => expect(r.getByLabelText("Guest name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Guest name"), "Rafiq Hasan");
    await fireEvent.press(r.getByRole("button", { name: "Next: the money" }));
    expect(mockPush).toHaveBeenCalledWith("/new-booking/money");
  });

  /**
   * A walk-in has no name to give and no NID to copy. The console fills in
   * "local" and hides the identity box; a clerk with a queue at the counter
   * should not have to invent a guest.
   */
  it("names a walk-in 'local' and stops asking for papers", async () => {
    const r = await open(Who, CHOSEN);
    await waitFor(() => expect(r.getByLabelText("NID / Passport")).toBeTruthy());
    await fireEvent.press(r.getByRole("switch", { name: "Walk-in (local)" }));
    expect(r.getByLabelText("Guest name").props.value).toBe("local");
    expect(r.queryByLabelText("NID / Passport")).toBeNull();
  });

  /** One room cannot be split into a booking each. */
  it("offers the group switch only when more than one room is picked", async () => {
    const one = await open(Who, CHOSEN);
    await waitFor(() => expect(one.getByLabelText("Guest name")).toBeTruthy());
    expect(one.queryByRole("switch", { name: /separate booking per room/i })).toBeNull();

    const two = await open(Who, {
      ...CHOSEN,
      rooms: [room({}), room({ roomId: 12, roomName: "2 Lotus" })],
    });
    await waitFor(() => expect(two.getByLabelText("Guest name")).toBeTruthy());
    expect(two.getByRole("switch", { name: /separate booking per room/i })).toBeTruthy();
  });
});

describe("what it costs", () => {
  it("prices the stay with the server, not here", async () => {
    await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() =>
      expect(mockQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          resortId: 3,
          roomIds: [11],
          checkIn: "2026-09-22",
          checkOut: "2026-09-24",
        }),
      ),
    );
  });

  it("reads the bill back line by line", async () => {
    const r = await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() =>
      expect(r.getByLabelText("1 Camellia, 2 nights × ৳6,500, ৳13,000")).toBeTruthy(),
    );
    expect(r.getByLabelText("Total, ৳13,000")).toBeTruthy();
  });

  /**
   * Found by looking at it: the last screen before a booking exists said
   * the room and the nights and nothing about who it was for. A clerk
   * about to press a button that creates something should be able to read
   * back what they are creating without going two screens up.
   */
  it("says who it is for, and when, before it is taken", async () => {
    const r = await open(Money, {
      ...CHOSEN,
      guestName: "Rafiq Hasan",
      adults: 3,
      children: 1,
    });
    await waitFor(() =>
      expect(r.getByText("Rafiq Hasan · 22–24 Sep · 3 adults, 1 child")).toBeTruthy(),
    );
  });

  it("says what is still due once an advance is typed", async () => {
    const r = await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() => expect(r.getByLabelText("How much")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("How much"), "5000");
    await waitFor(() => expect(r.getByLabelText("Still due, ৳8,000")).toBeTruthy());
  });

  it("takes the booking, with everything that was typed", async () => {
    const r = await open(Money, {
      ...CHOSEN,
      guestName: "Rafiq Hasan",
      phone: "01711000000",
      adults: 2,
      children: 1,
    });
    await waitFor(() => expect(r.getByRole("button", { name: /^Take the booking/ })).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("How much"), "5000");
    await fireEvent.press(r.getByRole("button", { name: /^Take the booking/ }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resortId: 3,
        roomIds: [11],
        checkIn: "2026-09-22",
        checkOut: "2026-09-24",
        adults: 2,
        children: 1,
        walkIn: false,
        guest: expect.objectContaining({ fullName: "Rafiq Hasan", phone: "01711000000" }),
        advancePayment: { amount: 5000, method: "CASH" },
      }),
    );
  });

  /** Straight to the booking it made, not back to an empty form. */
  it("opens the booking it just took", async () => {
    const r = await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() => expect(r.getByRole("button", { name: /^Take the booking/ })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /^Take the booking/ }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/bookings/91"));
  });

  it("takes a group as one booking per room", async () => {
    const r = await open(Money, {
      ...CHOSEN,
      rooms: [room({}), room({ roomId: 12, roomName: "2 Lotus" })],
      guestName: "Rafiq Hasan",
      group: true,
    });
    await waitFor(() => expect(r.getByRole("button", { name: /^Take the booking/ })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /^Take the booking/ }));

    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalled());
    expect(mockCreate).not.toHaveBeenCalled();
    // a group is several bookings; there is no one booking to open
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/bookings?search=GRP-7"));
  });

  /**
   * A second tap on Take the booking is how a guest gets charged twice. The
   * latch is in `useAction`; this is the proof it is wired up here.
   */
  it("cannot be double-tapped into two bookings", async () => {
    let release: (v: unknown) => void = () => {};
    mockCreate.mockImplementation(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );

    const r = await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() => expect(r.getByRole("button", { name: /^Take the booking/ })).toBeTruthy());
    const button = r.getByRole("button", { name: /^Take the booking/ });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    release({ id: 91, code: "BK-0091" });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it("shows what the server refused, and stays put", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockCreate.mockRejectedValue(new ApiError(400, "Those rooms take 1 extra person, not 3."));

    const r = await open(Money, { ...CHOSEN, guestName: "Rafiq Hasan" });
    await waitFor(() => expect(r.getByRole("button", { name: /^Take the booking/ })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /^Take the booking/ }));

    await waitFor(() =>
      expect(r.getByText("Those rooms take 1 extra person, not 3.")).toBeTruthy(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
