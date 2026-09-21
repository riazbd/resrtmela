/**
 * Settings, as much of them as belongs on a phone.
 *
 * The console's settings page is 2,144 lines across twelve tabs. Four of
 * those are here; the rest are not, and the hub says so on the screen
 * rather than leaving somebody to hunt. A permission matrix is thirty
 * checkboxes in nine groups and a phone renders it as a scroll nobody
 * can hold in their head — getting it wrong hands somebody the resort's
 * money.
 *
 * The one rule worth a test of its own is on the resort form: only what
 * moved is sent. A patch that carries every field would rewrite the
 * timezone on a save meant to fix a phone number, and the timezone is
 * what every dated screen in the app calls "today".
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PermRole, RatePlan, ResortSettings, ResortUser, RoomType } from "@rh/shared";

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockUsers = jest.fn();
const mockRoles = jest.fn();
const mockLists = jest.fn();
const mockOptions = jest.fn();
const mockCreateOption = jest.fn();
const mockRemoveOption = jest.fn();
const mockRatePlans = jest.fn();
const mockCreateRatePlan = jest.fn();
const mockTypes = jest.fn();
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
    resort: {
      get: (...a: unknown[]) => mockGet(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      users: (...a: unknown[]) => mockUsers(...a),
      roles: (...a: unknown[]) => mockRoles(...a),
    },
    options: {
      lists: (...a: unknown[]) => mockLists(...a),
      list: (...a: unknown[]) => mockOptions(...a),
      create: (...a: unknown[]) => mockCreateOption(...a),
      remove: (...a: unknown[]) => mockRemoveOption(...a),
    },
    rooms: {
      ratePlans: (...a: unknown[]) => mockRatePlans(...a),
      createRatePlan: (...a: unknown[]) => mockCreateRatePlan(...a),
      types: (...a: unknown[]) => mockTypes(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const SettingsScreen = require("../app/(tabs)/(desk)/settings/index").default;
const ResortScreen = require("../app/(tabs)/(desk)/settings/resort").default;
const ListsScreen = require("../app/(tabs)/(desk)/settings/lists").default;
const TeamScreen = require("../app/(tabs)/(desk)/settings/team").default;
const RatesScreen = require("../app/(tabs)/(desk)/settings/rates").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const resort: ResortSettings = {
  id: 3,
  name: "Demo Bay Resort",
  location: "Cox's Bazar",
  timezone: "Asia/Dhaka",
  currency: "BDT",
  locale: "en-IN",
  checkInTime: "12:00 PM",
  checkOutTime: "10:00 AM",
  showRatesToAgents: false,
  address: "Marine Drive",
  website: null,
  contactPhone: "01700000001",
  taxRatePct: 7.5,
  binNumber: null,
};

const person = (over: Partial<ResortUser> = {}): ResortUser => ({
  id: 12,
  name: "Demo Resort Owner",
  phone: "01700000001",
  email: "demo-resort@resortmela.com",
  role: "RESORT_ADMIN",
  status: "active",
  createdAt: "2026-09-13T00:00:00.000Z",
  roleId: 4,
  roleName: "Administrator",
  ...over,
});

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
  mockGet.mockReset().mockResolvedValue(resort);
  mockUpdate.mockReset().mockResolvedValue(resort);
  mockUsers.mockReset().mockResolvedValue([person(), person({ id: 13, name: "Mitu", roleName: "Front Desk", status: "suspended" })]);
  mockRoles.mockReset().mockResolvedValue([
    { id: 4, name: "Administrator", permissions: ["*"] },
    { id: 5, name: "Front Desk", permissions: ["bookings.view", "bookings.create"] },
  ] as PermRole[]);
  mockLists.mockReset().mockResolvedValue([
    { name: "PAYMENT_METHOD", label: "Payment methods" },
    { name: "BOOKING_SOURCE", label: "Booking sources" },
  ]);
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "OLD", label: "Cheque", active: false, sortOrder: 1 },
  ]);
  mockCreateOption.mockReset().mockResolvedValue({ id: 3 });
  mockRemoveOption.mockReset().mockResolvedValue({ removed: true, deactivated: false, used: 0 });
  mockRatePlans.mockReset().mockResolvedValue([
    {
      id: 9,
      roomTypeId: 2,
      dateFrom: "2026-12-20T00:00:00.000Z",
      dateTo: "2027-01-05T00:00:00.000Z",
      price: 9000,
      active: true,
      roomType: { id: 2, name: "Deluxe" },
    },
  ] as RatePlan[]);
  mockCreateRatePlan.mockReset().mockResolvedValue({ id: 10 });
  mockTypes.mockReset().mockResolvedValue([
    { id: 2, name: "Deluxe", maxAdults: 2, maxChildren: 1, active: true },
  ] as RoomType[]);
  mockPush.mockReset();
  mockBack.mockReset();
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("the hub", () => {
  it("offers what belongs on a phone", async () => {
    const r = await open(SettingsScreen);
    await waitFor(() => expect(r.getByText("The resort")).toBeTruthy());
    expect(r.getByText("Lists")).toBeTruthy();
    expect(r.getByText("Team")).toBeTruthy();
    expect(r.getByText("Rate plans")).toBeTruthy();
  });

  /** Learning it from the screen beats hunting for it. */
  it("says what stayed on the desk, and why", async () => {
    const r = await open(SettingsScreen);
    await waitFor(() => expect(r.getByText(/stay on the desk/)).toBeTruthy());
  });

  it("offers nothing somebody may not change", async () => {
    mockCan = () => false;
    const r = await open(SettingsScreen);
    await waitFor(() => expect(r.getByText("Nothing here is yours to change")).toBeTruthy());
  });

  it("opens a section", async () => {
    const r = await open(SettingsScreen);
    await waitFor(() => expect(r.getByText("The resort")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^The resort —/));
    expect(mockPush).toHaveBeenCalledWith("/settings/resort");
  });
});

describe("the resort itself", () => {
  it("opens on what the resort is now", async () => {
    const r = await open(ResortScreen);
    await waitFor(() => expect(r.getByLabelText("Name").props.value).toBe("Demo Bay Resort"));
    expect(r.getByLabelText("Rate (%)").props.value).toBe("7.5");
  });

  /**
   * The rule this screen exists to keep: a patch carrying every field
   * would rewrite the timezone on a save meant to fix a phone number,
   * and the timezone is what every dated screen calls "today".
   */
  it("sends only what moved", async () => {
    const r = await open(ResortScreen);
    await waitFor(() => expect(r.getByLabelText("Phone")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Phone"), "01799999999");
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(3, { contactPhone: "01799999999" }));
  });

  it("sends nothing and goes back when nothing moved", async () => {
    const r = await open(ResortScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Save changes" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  /**
   * The currency and the zone change what every figure and every date in
   * the app mean. They are shown and not edited.
   */
  it("shows the currency and the zone without offering to change them", async () => {
    const r = await open(ResortScreen);
    await waitFor(() => expect(r.getByLabelText("Currency: BDT")).toBeTruthy());
    expect(r.getByLabelText("Timezone: Asia/Dhaka")).toBeTruthy();
  });

  it("shows the API's own words when it refuses the save", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockUpdate.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await open(ResortScreen);
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Bay Resort");
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });
});

describe("the lists a resort owns", () => {
  /** Which lists exist is the code's; what is on them is the resort's. */
  it("asks the server which lists there are", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Payment methods" })).toBeTruthy());
    expect(mockLists).toHaveBeenCalled();
    expect(r.getByRole("button", { name: "Booking sources" })).toBeTruthy();
  });

  it("shows what is on the first one", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByLabelText("Cash, code CASH")).toBeTruthy());
    expect(mockOptions).toHaveBeenCalledWith(3, "PAYMENT_METHOD");
  });

  /** Switched off, not gone: an old record still has to be able to say it. */
  it("marks one that was switched off", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByLabelText("Cheque, code OLD, switched off")).toBeTruthy());
  });

  /**
   * A person adding "Bank transfer" should not have to invent
   * `BANK_TRANSFER` — and a code with a space in it breaks a query
   * string somewhere downstream.
   */
  it("makes the code out of the words", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByLabelText("What it is called")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What it is called"), "Bank transfer");
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(mockCreateOption).toHaveBeenCalledWith(3, "PAYMENT_METHOD", {
        code: "BANK_TRANSFER",
        label: "Bank transfer",
      }),
    );
  });

  it("will not add a nameless one", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    expect(mockCreateOption).not.toHaveBeenCalled();
    expect(r.getByText("Say what it is called.")).toBeTruthy();
  });

  /** The server decides; the screen reports which of the two happened. */
  it("says when something in use was switched off rather than removed", async () => {
    mockRemoveOption.mockResolvedValue({ removed: false, deactivated: true, used: 41 });
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Remove Cash" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Remove Cash" }));
    await waitFor(() => expect(r.getByText(/in use on 41 records/)).toBeTruthy());
  });

  it("switches list", async () => {
    const r = await open(ListsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Booking sources" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Booking sources" }));
    await waitFor(() => expect(mockOptions).toHaveBeenCalledWith(3, "BOOKING_SOURCE"));
  });
});

describe("who works here", () => {
  it("says who, on what role, and how many are active", async () => {
    const r = await open(TeamScreen);
    await waitFor(() =>
      expect(
        r.getByLabelText(/^Demo Resort Owner, Administrator, 01700000001/),
      ).toBeTruthy(),
    );
    expect(r.getByText("1 active")).toBeTruthy();
  });

  it("marks somebody who is not active", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByLabelText(/^Mitu, Front Desk, not active/)).toBeTruthy());
  });

  /** A role that is everything says so rather than listing thirty. */
  it("says an administrator holds everything", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Everything")).toBeTruthy());
    expect(r.getByText("2 permissions")).toBeTruthy();
  });

  /**
   * Adding somebody came to the phone on 2026-09-21 and setting their
   * password did not, so the sentence is now about one thing rather than
   * three. What has to survive is that the screen says *why* — a person
   * who cannot find the password field should learn the reason here
   * rather than conclude the app is broken.
   */
  it("says what stayed on the desk, and why", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText(/hands you their account/)).toBeTruthy());
  });
});

describe("what a room costs in a season", () => {
  it("lists the seasons with their dates and price", async () => {
    const r = await open(RatesScreen);
    await waitFor(() =>
      expect(
        r.getByLabelText("Deluxe, 20 Dec 2026 – 5 Jan 2027, ৳9,000 a night"),
      ).toBeTruthy(),
    );
  });

  it("says a resort with no seasons sells at base rate", async () => {
    mockRatePlans.mockResolvedValue([]);
    const r = await open(RatesScreen);
    await waitFor(() => expect(r.getByText("No rate plans")).toBeTruthy());
  });

  it("will not add one with no type or no price", async () => {
    const r = await open(RatesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Add the season" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add the season" }));
    expect(mockCreateRatePlan).not.toHaveBeenCalled();
    expect(r.getByText("Pick a room type and say what it costs.")).toBeTruthy();
  });

  it("adds a season", async () => {
    const r = await open(RatesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Deluxe" }));
    await fireEvent.changeText(r.getByLabelText("Price a night"), "9500");
    await fireEvent.press(r.getByRole("button", { name: "Add the season" }));

    await waitFor(() =>
      expect(mockCreateRatePlan).toHaveBeenCalledWith(3, {
        roomTypeId: 2,
        dateFrom: "2026-09-20",
        dateTo: "2026-10-20",
        price: 9500,
      }),
    );
  });

  /**
   * `active: true` used to be sent with it, and the route has never
   * accepted the field: `CreateRatePlanDto` lists four, and Nest's
   * whitelist drops the rest without a word. The column defaults to true,
   * so nothing was ever wrong on the server — but the screen was sending
   * an instruction nobody was carrying out, which is the kind of thing
   * that gets copied into the next screen and matters there.
   *
   * It survived because the route took `body: unknown`. Typing it is what
   * found it.
   */
  it("sends only the four fields the route takes", async () => {
    const r = await open(RatesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Deluxe" }));
    await fireEvent.changeText(r.getByLabelText("Price a night"), "9500");
    await fireEvent.press(r.getByRole("button", { name: "Add the season" }));

    await waitFor(() => expect(mockCreateRatePlan).toHaveBeenCalled());
    const [, body] = mockCreateRatePlan.mock.calls[0]!;
    expect(Object.keys(body).sort()).toEqual(["dateFrom", "dateTo", "price", "roomTypeId"]);
  });

  it("offers no form to somebody who may not manage rooms", async () => {
    mockCan = (k) => k !== "rooms.manage";
    const r = await open(RatesScreen);
    await waitFor(() => expect(r.getByText("Seasons")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add" })).toBeNull();
  });
});
