/**
 * Housekeeping, on the phone.
 *
 * The first screen in this app where the phone is the primary client
 * and the console is the copy. A housekeeper is not at a desk — they
 * are on the second floor holding a mop — and everything about the
 * screen follows from that: one list, the urgent room at the top, one
 * tap to move a room on.
 *
 * `HOUSEKEEPING` has been a role since phase 0 with an empty permission
 * array behind it, so somebody added as a housekeeper signed in to an
 * app with nothing in it. This is the first screen that role can open.
 *
 * The ordering is `@rh/shared`'s `housekeepingOrder`, and the button's
 * words are `nextHousekeepingState`'s — the label is the state the room
 * moves *to*, which `room-status.ts` records getting backwards.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { HousekeepingRow } from "@rh/shared";

const mockList = jest.fn();
const mockSet = jest.fn();
let mockCan = (_key: string) => true;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 4, name: "Shefali", role: "HOUSEKEEPING" },
    loading: false,
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    rooms: {
      housekeeping: (...a: unknown[]) => mockList(...a),
      setHousekeeping: (...a: unknown[]) => mockSet(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const HousekeepingScreen = require("../app/(tabs)/(desk)/housekeeping").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (over: Partial<HousekeepingRow> = {}): HousekeepingRow => ({
  id: 1,
  name: "1 Camellia",
  roomTypeName: "Deluxe Twin",
  status: "ACTIVE",
  housekeeping: "CLEAN",
  housekeepingAt: null,
  housekeepingBy: null,
  departedToday: false,
  arrivingToday: false,
  ...over,
});

const open = async () => render(<Harness><HousekeepingScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  mockList.mockResolvedValue([room()]);
  mockSet.mockResolvedValue({ id: 1, housekeeping: "CLEANING", housekeepingAt: "2026-09-21" });
});

describe("which rooms are ready", () => {
  it("counts what is left to do before anything else", async () => {
    mockList.mockResolvedValue([
      room({ id: 1, name: "1 Camellia", housekeeping: "DIRTY" }),
      room({ id: 2, name: "2 Lotus", housekeeping: "DIRTY" }),
      room({ id: 3, name: "3 Orchid", housekeeping: "CLEAN" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByLabelText(/To clean: 2/)).toBeTruthy());
  });

  it("says what state each room is in, in words", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Needs cleaning")).toBeTruthy());
  });

  /**
   * The order is the design. A housekeeper reads the top of the list,
   * not the list.
   */
  it("puts the room somebody arrives into tonight first", async () => {
    mockList.mockResolvedValue([
      room({ id: 1, name: "Quiet", housekeeping: "DIRTY" }),
      room({ id: 2, name: "Urgent", housekeeping: "DIRTY", departedToday: true, arrivingToday: true }),
      room({ id: 3, name: "Done", housekeeping: "CLEAN" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Urgent")).toBeTruthy());
    const names = r.getAllByLabelText(/, (Needs cleaning|Being cleaned|Ready)/).map((n) =>
      String(n.props.accessibilityLabel).split(",")[0],
    );
    expect(names).toEqual(["Urgent", "Quiet", "Done"]);
  });

  it("says why a room is urgent, rather than just ranking it", async () => {
    mockList.mockResolvedValue([
      room({ housekeeping: "DIRTY", departedToday: true, arrivingToday: true }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/arriving tonight/i)).toBeTruthy());
  });

  it("names who last moved it, where a person did", async () => {
    mockList.mockResolvedValue([
      room({ housekeeping: "CLEAN", housekeepingBy: "Shefali", housekeepingAt: "2026-09-21T04:00:00.000Z" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/Shefali/)).toBeTruthy());
  });

  /** A check-out marks the room, and no person did it. */
  it("says nothing rather than 'by null' when the departure did it", async () => {
    mockList.mockResolvedValue([
      room({ housekeeping: "DIRTY", housekeepingBy: null, housekeepingAt: "2026-09-21T04:00:00.000Z" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Needs cleaning")).toBeTruthy());
    expect(r.queryByText(/null|undefined/)).toBeNull();
  });
});

describe("moving a room on", () => {
  it("offers the state it moves to, not the one it is in", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Start cleaning")).toBeTruthy());
  });

  it("finishes a room that is being cleaned", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "CLEANING" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Mark ready")).toBeTruthy());
  });

  it("sends the state the button promised", async () => {
    mockList.mockResolvedValue([room({ id: 7, housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Start cleaning")).toBeTruthy());
    fireEvent.press(r.getByText("Start cleaning"));
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(7, "CLEANING"));
  });

  /**
   * The front desk sees the list because it sells the room; it does not
   * set the state, because it is not the one who knows.
   */
  it("offers no button to somebody who may only look", async () => {
    mockCan = (k) => k !== "housekeeping.manage";
    mockList.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Needs cleaning")).toBeTruthy());
    expect(r.queryByText("Start cleaning")).toBeNull();
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const r = await open();
    await waitFor(() => expect(r.getByText(/Loading the rooms/)).toBeTruthy());
  });

  it("shows the API's own words when it is refused", async () => {
    mockList.mockRejectedValue(new Error("You may not see housekeeping"));
    const r = await open();
    await waitFor(() => expect(r.getByText(/may not see housekeeping/)).toBeTruthy());
  });

  it("says the resort has no rooms rather than drawing an empty list", async () => {
    mockList.mockResolvedValue([]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/No rooms/)).toBeTruthy());
  });

  it("says everything is done rather than leaving the count at zero unexplained", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "CLEAN" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/Everything is ready/i)).toBeTruthy());
  });
});
