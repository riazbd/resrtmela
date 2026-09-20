/**
 * The restaurant, the activities, and the month's wages.
 *
 * Three screens whose client slices did not exist a commit ago. Each
 * carries one decision that is easy to get wrong and expensive when it
 * is:
 *
 *   - a restaurant bill charged to a **booking** is owed by the stay and
 *     lands on its invoice; one with a guest name is cash at the
 *     counter. Getting that backwards means a guest paying twice, or a
 *     stay leaving unpaid;
 *   - an activity can be **on offer with no slots generated** — which
 *     reads as available everywhere and sells nothing;
 *   - a payroll month is **settled when the salary has been handed over
 *     in full**, however many payments it took, so "paid" is a sum and
 *     not a flag.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Activity, ActivitySlot, FbBill, FbInHouse, PayrollSheet } from "@rh/shared";

const mockBills = jest.fn();
const mockInHouse = jest.fn();
const mockCreateBill = jest.fn();
const mockPackages = jest.fn();
const mockActivities = jest.fn();
const mockSlots = jest.fn();
const mockSheet = jest.fn();
const mockPay = jest.fn();
const mockOptions = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: () => mockBack() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    fb: {
      bills: (...a: unknown[]) => mockBills(...a),
      inHouse: (...a: unknown[]) => mockInHouse(...a),
      createBill: (...a: unknown[]) => mockCreateBill(...a),
      packages: (...a: unknown[]) => mockPackages(...a),
    },
    activities: {
      list: (...a: unknown[]) => mockActivities(...a),
      slots: (...a: unknown[]) => mockSlots(...a),
    },
    payroll: {
      sheet: (...a: unknown[]) => mockSheet(...a),
      pay: (...a: unknown[]) => mockPay(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const FbScreen = require("../app/fb/index").default;
const TicketScreen = require("../app/fb/new").default;
const ActivitiesScreen = require("../app/activities").default;
const PayrollScreen = require("../app/payroll").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const bill = (over: Partial<FbBill> = {}): FbBill => ({
  id: 7,
  code: "RES-0007",
  billDate: "2026-09-20T00:00:00.000Z",
  guestName: null,
  roomId: null,
  bookingId: 84,
  method: null,
  note: null,
  items: [{ name: "Set lunch", qty: 2, unitPrice: 450, total: 900 }],
  net: 900,
  tax: 45,
  taxLines: [{ code: "VAT", label: "VAT", ratePct: 5, amount: 45 }],
  total: 945,
  paid: 0,
  due: 945,
  status: "UNPAID",
  ...over,
});

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 8,
  name: "Sunset cruise",
  category: "TOUR",
  basePrice: 1200,
  durationMin: 90,
  minPerSlot: 2,
  maxPerSlot: 12,
  description: null,
  active: true,
  schedules: [
    { id: 1, weekday: 5, startTime: "17:00", endTime: "18:30", capacity: 12, active: true },
    { id: 2, weekday: 6, startTime: "17:00", endTime: "18:30", capacity: 12, active: true },
  ],
  upcomingSlots: 4,
  nextSlot: "2026-09-25T11:00:00.000Z",
  ...over,
});

const slot = (over: Partial<ActivitySlot> = {}): ActivitySlot => ({
  id: 99,
  startsAt: "2026-09-25T11:00:00.000Z",
  endsAt: "2026-09-25T12:30:00.000Z",
  capacity: 12,
  bookedCount: 10,
  remaining: 2,
  ...over,
});

const sheet = (over: Partial<PayrollSheet> = {}): PayrollSheet =>
  ({
    month: "2026-09",
    rows: [
      {
        employeeId: 4,
        name: "Jamal Uddin",
        designation: "Cook",
        salary: 18000,
        paid: 6000,
        advance: 6000,
        remaining: 12000,
        settled: false,
        payments: [],
      },
      {
        employeeId: 5,
        name: "Shefali Begum",
        designation: "Housekeeping",
        salary: 14000,
        paid: 14000,
        advance: 0,
        remaining: 0,
        settled: true,
        payments: [],
      },
    ],
    totals: { expected: 32000, paid: 20000, advance: 6000 },
    ...over,
  }) as PayrollSheet;

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  mockCan = () => true;
  mockBills.mockReset().mockResolvedValue({ rows: [bill()], total: 1 });
  mockInHouse.mockReset().mockResolvedValue([
    { bookingId: 84, code: "BK-00009", guestName: "Rafiq Hasan", rooms: ["7 Kadam"] },
  ] as FbInHouse[]);
  mockCreateBill.mockReset().mockResolvedValue(bill());
  mockPackages.mockReset().mockResolvedValue([
    { id: 1, name: "Set lunch", price: 450, active: true },
    { id: 2, name: "Old menu", price: 300, active: false },
  ]);
  mockActivities.mockReset().mockResolvedValue([activity()]);
  mockSlots.mockReset().mockResolvedValue([slot()]);
  mockSheet.mockReset().mockResolvedValue(sheet());
  mockPay.mockReset().mockResolvedValue({ ok: true });
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "BKASH", label: "bKash", active: true, sortOrder: 1 },
  ]);
  mockPush.mockReset();
  mockBack.mockReset();
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("the restaurant's day", () => {
  it("asks for one day at a time", async () => {
    open(FbScreen);
    await waitFor(() =>
      expect(mockBills).toHaveBeenCalledWith(3, { from: "2026-09-20", to: "2026-09-21" }),
    );
  });

  /** The distinction the whole screen turns on. */
  it("says which bills are on a room and which were the counter", async () => {
    mockBills.mockResolvedValue({
      rows: [bill(), bill({ id: 8, code: "RES-0008", bookingId: null, guestName: "Walk-in", paid: 500, due: 0 })],
      total: 2,
    });
    const r = await open(FbScreen);
    await waitFor(() => expect(r.getByLabelText(/^RES-0007, On the room/)).toBeTruthy());
    expect(r.getByLabelText(/^RES-0008, Walk-in/)).toBeTruthy();
  });

  it("marks what is still unpaid", async () => {
    const r = await open(FbScreen);
    await waitFor(() => expect(r.getByLabelText(/৳945 unpaid$/)).toBeTruthy());
  });

  it("offers no ticket to somebody who may only look", async () => {
    mockCan = (k) => k !== "restaurant.create";
    const r = await open(FbScreen);
    await waitFor(() => expect(r.getByText("The day")).toBeTruthy());
    expect(r.queryByRole("button", { name: "New ticket" })).toBeNull();
  });

  it("says so when nothing was sold", async () => {
    mockBills.mockResolvedValue({ rows: [], total: 0 });
    const r = await open(FbScreen);
    await waitFor(() => expect(r.getByText("Nothing sold on this day")).toBeTruthy());
  });
});

describe("writing a ticket", () => {
  it("offers the stays that can be charged", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByRole("button", { name: /7 Kadam · Rafiq Hasan/ })).toBeTruthy());
  });

  it("will not write a ticket for nobody, or with nothing on it", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write the bill" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write the bill" }));
    expect(mockCreateBill).not.toHaveBeenCalled();
    expect(r.getByText("Say whose ticket this is.")).toBeTruthy();
    expect(r.getByText("Put something on the ticket.")).toBeTruthy();
  });

  it("offers the menu, and not a retired item", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByRole("button", { name: /^Set lunch/ })).toBeTruthy());
    expect(r.queryByRole("button", { name: /^Old menu/ })).toBeNull();
  });

  /**
   * A booking's bill carries `bookingId` and no `guestName`: the two
   * are exclusive, and sending both is how a stay's bill acquires a
   * second owner.
   */
  it("charges a stay by its booking, with no guest name beside it", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByRole("button", { name: /7 Kadam · Rafiq Hasan/ })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /7 Kadam · Rafiq Hasan/ }));
    await fireEvent.press(r.getByRole("button", { name: /^Set lunch/ }));
    await fireEvent.press(r.getByRole("button", { name: "Write the bill" }));

    await waitFor(() =>
      expect(mockCreateBill).toHaveBeenCalledWith(3, {
        date: "2026-09-20",
        items: [{ name: "Set lunch", qty: 1, unitPrice: 450 }],
        bookingId: 84,
        guestName: undefined,
        paidAmount: undefined,
        method: undefined,
      }),
    );
  });

  it("takes a counter sale by name, with money now", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByLabelText("Or a name, for the counter")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Or a name, for the counter"), "Walk-in");
    await fireEvent.press(r.getByRole("button", { name: /^Set lunch/ }));
    await fireEvent.changeText(r.getByLabelText("Amount"), "450");
    await fireEvent.press(r.getByRole("button", { name: "Write the bill" }));

    await waitFor(() =>
      expect(mockCreateBill).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ bookingId: undefined, guestName: "Walk-in", paidAmount: 450, method: "CASH" }),
      ),
    );
  });

  /** A table orders two teas and a set lunch. */
  it("adds a line rather than replacing the ticket", async () => {
    const r = await open(TicketScreen);
    await waitFor(() => expect(r.getByRole("button", { name: /^Set lunch/ })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: /^Set lunch/ }));
    await fireEvent.press(r.getByRole("button", { name: /^Set lunch/ }));
    expect(r.getAllByLabelText(/^Set lunch, 1 at/)).toHaveLength(2);
  });
});

describe("what a resort sells besides a bed", () => {
  it("says the price, the length and how many it takes", async () => {
    const r = await open(ActivitiesScreen);
    await waitFor(() =>
      expect(r.getByLabelText("Sunset cruise, ৳1,200 for 90 minutes")).toBeTruthy(),
    );
    expect(r.getByLabelText("Takes 2 to 12 people")).toBeTruthy();
  });

  it("says which days it runs", async () => {
    const r = await open(ActivitiesScreen);
    await waitFor(() => expect(r.getByLabelText("Runs Fri, Sat")).toBeTruthy());
  });

  /**
   * The failure this screen exists to name: switched on, nothing
   * generated. It reads as available on every screen that offers it
   * and sells nothing.
   */
  it("warns when something is on offer with no slots", async () => {
    mockActivities.mockResolvedValue([activity({ upcomingSlots: 0, nextSlot: null })]);
    const r = await open(ActivitiesScreen);
    await waitFor(() => expect(r.getByText(/no slots generated/)).toBeTruthy());
  });

  it("does not warn about one that is switched off", async () => {
    mockActivities.mockResolvedValue([activity({ active: false, upcomingSlots: 0, nextSlot: null })]);
    const r = await open(ActivitiesScreen);
    await waitFor(() => expect(r.getByText("Not on offer")).toBeTruthy());
    expect(r.queryByText(/no slots generated/)).toBeNull();
  });

  /** A slot that has already run is not an answer to "is there room". */
  it("asks only for slots still to come", async () => {
    const r = await open(ActivitiesScreen);
    await waitFor(() => expect(r.getByLabelText(/^Next 25 Sep/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Next 25 Sep/));
    await waitFor(() =>
      expect(mockSlots).toHaveBeenCalledWith(3, 8, {
        from: "2026-09-20",
        to: "2026-10-04",
        futureOnly: true,
      }),
    );
  });

  it("says how many places are left on each", async () => {
    const r = await open(ActivitiesScreen);
    await waitFor(() => expect(r.getByLabelText(/^Next 25 Sep/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Next 25 Sep/));
    await waitFor(() => expect(r.getByLabelText(/2 of 12 left$/)).toBeTruthy());
  });
});

describe("the month's wages", () => {
  it("opens on the resort's month and totals it", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText("September 2026")).toBeTruthy());
    expect(mockSheet).toHaveBeenCalledWith(3, "2026-09");
    expect(r.getByLabelText("Owed: ৳32,000")).toBeTruthy();
    expect(r.getByLabelText("Left: ৳12,000")).toBeTruthy();
  });

  it("moves a month at a time", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "‹ Prev" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "‹ Prev" }));
    await waitFor(() => expect(mockSheet).toHaveBeenCalledWith(3, "2026-08"));
  });

  /**
   * Settled is the salary handed over in full, however many payments it
   * took — not a flag on one payment row.
   */
  it("tells somebody settled from somebody still owed", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, salary ৳18,000, ৳12,000 left/)).toBeTruthy());
    expect(r.getByLabelText(/^Shefali Begum, salary ৳14,000, settled/)).toBeTruthy();
  });

  /** Money already handed over changes how the month reads. */
  it("says when somebody took an advance", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText(/৳6,000 advanced/)).toBeTruthy());
  });

  it("hands over what is left, against the month on screen", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin,/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Jamal Uddin,/));
    await waitFor(() => expect(r.getByLabelText("Amount")).toBeTruthy());
    // opens on what is left, which is what usually gets handed over
    expect(r.getByLabelText("Amount").props.value).toBe("12000");
    await fireEvent.press(r.getByRole("button", { name: /^Pay / }));
    await waitFor(() =>
      expect(mockPay).toHaveBeenCalledWith(3, 4, { month: "2026-09", amount: 12000, method: "CASH" }),
    );
  });

  it("does not offer to pay somebody already settled", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Shefali Begum,/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Shefali Begum,/));
    expect(r.queryByLabelText("Amount")).toBeNull();
  });

  it("offers no payment to somebody who may only look", async () => {
    mockCan = (k) => k !== "payroll.manage";
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin,/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Jamal Uddin,/));
    expect(r.queryByLabelText("Amount")).toBeNull();
  });
});
