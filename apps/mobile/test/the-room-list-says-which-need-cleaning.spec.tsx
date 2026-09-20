/**
 * The room list says which rooms need cleaning (2026-09-21).
 *
 * The inventory screen named every room, its type and its rate, and said
 * nothing about the one whose guest had walked out that morning. A
 * manager standing in the lobby with this open could not answer "which
 * rooms can I sell right now" without opening a second screen.
 *
 * Unlike the booking grid, there is no date to weigh: this list is the
 * resort *now*, and housekeeping is a fact about now. So there is no
 * `arrivingToday` here and no call to `roomOffer` — the state is simply
 * shown, in the housekeeper's own words from `housekeepingLabel`, so the
 * list and the housekeeping screen cannot drift apart.
 *
 * Quiet, though. A clean room says nothing, because a badge on ten rows
 * out of ten is a badge nobody reads — the same mistake the housekeeping
 * screen itself made on its first afternoon, when every clean room
 * carried a prominent "Needs cleaning" button.
 */
import { render, waitFor } from "@testing-library/react-native";
import type { Room } from "@rh/shared";

const mockList = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 1, name: "Rahim", role: "RESORT_ADMIN" },
    loading: false,
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: () => true,
  }),
  client: { rooms: { list: (...a: unknown[]) => mockList(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const RoomsScreen = require("../app/(tabs)/rooms").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (over: Partial<Room> = {}): Room => ({
  id: 1,
  resortId: 3,
  roomTypeId: 1,
  name: "1 Camellia",
  baseRate: 4500,
  status: "ACTIVE",
  housekeeping: "CLEAN",
  roomType: { id: 1, resortId: 3, name: "Deluxe Twin", maxAdults: 2, maxChildren: 2, active: true } as Room["roomType"],
  ...over,
});

const open = async () => render(<Harness><RoomsScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([room()]);
});

describe("the room list says which need cleaning", () => {
  it("marks a room the last guest left dirty", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Needs cleaning")).toBeTruthy());
  });

  it("marks one a housekeeper is in the middle of", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "CLEANING" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Being cleaned")).toBeTruthy());
  });

  /** Ten badges on ten rows is no badge at all. */
  it("says nothing about a room that is ready", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.queryByText(/cleaning|Ready/i)).toBeNull();
  });

  it("puts it in the row a screen reader hears as one sentence", async () => {
    mockList.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByLabelText(/1 Camellia.*needs cleaning/i)).toBeTruthy());
  });
});

describe("what it does not claim", () => {
  /**
   * Out of service is a decision about the room and needing cleaning is
   * twenty minutes of work. A room that is both says the bigger thing.
   */
  it("says out of service rather than needs cleaning when it is both", async () => {
    mockList.mockResolvedValue([room({ status: "OUT_OF_SERVICE", housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Out of service")).toBeTruthy());
    expect(r.queryByText("Needs cleaning")).toBeNull();
  });

  /** An older API, or a resort whose rooms predate the column. */
  it("says nothing when the server sent no state", async () => {
    mockList.mockResolvedValue([room({ housekeeping: undefined })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.queryByText(/undefined|cleaning/i)).toBeNull();
  });

  /**
   * "10 sellable" counts what the resort is allowed to sell, which is a
   * different question from what is ready this minute. A dirty room can
   * be sold — the housekeeping screen is where "ready" is counted.
   */
  it("keeps a dirty room in the sellable count", async () => {
    mockList.mockResolvedValue([
      room({ id: 1, housekeeping: "DIRTY" }),
      room({ id: 2, name: "2 Lotus", housekeeping: "CLEAN" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText("2 sellable")).toBeTruthy());
  });
});
