/**
 * Rooms: the list, one room, and the types behind them.
 *
 * The first screens of phase 2, and first because Rooms is a tab on the
 * bar — it has said "Not built yet" on every phone that installed 0.2.1,
 * which no other gap in the app can claim.
 *
 * The rules that decide anything here are `@rh/shared`'s: whether a room
 * is sellable, what the button that changes that should read, and what
 * the extra-person line says. The console's table draws all three from
 * the same functions, because a room that reads as open on one screen and
 * shut on the other is a room somebody sells twice.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Room, RoomType } from "@rh/shared";

const mockList = jest.fn();
const mockTypes = jest.fn();
const mockUpdate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCan = (_key: string) => true;
/** Whether the session has finished restoring from the device. */
let mockLoading = false;
let mockResort: { id: number; name: string; timezone: string } | null = null;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: () => mockBack() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "11" }),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: mockResort,
    loading: mockLoading,
    can: (key: string) => mockCan(key),
  }),
  client: {
    rooms: {
      list: (...a: unknown[]) => mockList(...a),
      types: (...a: unknown[]) => mockTypes(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const RoomsScreen = require("../app/(tabs)/rooms").default;
const RoomScreen = require("../app/rooms/[id]").default;
const TypesScreen = require("../app/rooms/types").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const type = (over: Partial<RoomType> = {}): RoomType => ({
  id: 2,
  name: "Deluxe",
  maxAdults: 2,
  maxChildren: 1,
  extraPersonAllowed: true,
  extraPersonRate: 500,
  amenities: ["Sea view", "Air conditioning"],
  active: true,
  ...over,
});

const room = (over: Partial<Room> = {}): Room => ({
  id: 11,
  resortId: 3,
  roomTypeId: 2,
  name: "1 Camellia",
  baseRate: 4500,
  status: "ACTIVE",
  extraPersonAllowed: true,
  extraPersonMax: 2,
  extraPersonRate: 500,
  roomType: type(),
  ...over,
});

/**
 * The order `listRooms` actually sends — it sorts with `byRoomName` on
 * the server and says why. This fixture arrived shuffled at first, to
 * prove a client-side sort that the route made unnecessary and that no
 * real response would ever have exercised.
 */
const TEN = [
  room({ id: 11, name: "1 Camellia" }),
  room({ id: 12, name: "2 Lotus", baseRate: 6500, status: "OUT_OF_SERVICE" }),
  room({ id: 13, name: "10 Bakul", baseRate: 4500 }),
];

beforeEach(() => {
  mockCan = () => true;
  mockLoading = false;
  mockResort = { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" };
  mockList.mockReset().mockResolvedValue(TEN);
  mockTypes.mockReset().mockResolvedValue([type()]);
  mockUpdate.mockReset().mockResolvedValue(room());
  mockPush.mockReset();
  mockBack.mockReset();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("every room a resort has", () => {
  it("counts them, and says how many can be sold", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("3 rooms")).toBeTruthy());
    expect(r.getByText("2 sellable")).toBeTruthy();
  });

  /**
   * The server's order, undisturbed — the day sheet's rule, and this
   * route obeys it too. `listRooms` already sorts with `byRoomName`,
   * so a client that sorted again would be one release away from
   * overriding an order the server had a reason for.
   */
  it("draws them in the order the server sent", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    const names = r.getAllByText(/Camellia|Lotus|Bakul/).map((n) => n.props.children);
    expect(names).toEqual(["1 Camellia", "2 Lotus", "10 Bakul"]);
  });

  it("says what a room costs and what else it takes", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() =>
      expect(r.getByLabelText("1 Camellia, ৳4,500 a night, active, takes 2 × ৳500/night")).toBeTruthy(),
    );
  });

  /** The one fact that decides whether a guest can be put in it. */
  it("marks a room that cannot be sold", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() =>
      expect(r.getByLabelText(/^2 Lotus, ৳6,500 a night, out of service/)).toBeTruthy(),
    );
  });

  it("opens one", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^1 Camellia,/));
    expect(mockPush).toHaveBeenCalledWith("/rooms/11");
  });

  /**
   * The state between signing in and knowing where you work.
   *
   * A screen reached before the session has restored has no resort
   * either, and nineteen of them said "No resort selected — choose one
   * from the More tab" while it was still loading. Found on a device,
   * where restoring takes seconds; in a browser it is under a
   * millisecond and never showed.
   */
  it("waits rather than blaming the person, while the session restores", async () => {
    mockLoading = true;
    mockResort = null;
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("Loading the rooms…")).toBeTruthy());
    expect(r.queryByText("No resort selected")).toBeNull();
  });

  it("asks for a resort once there is nothing left to wait for", async () => {
    mockLoading = false;
    mockResort = null;
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("No resort selected")).toBeTruthy());
  });

  it("says so when a resort has no rooms", async () => {
    mockList.mockResolvedValue([]);
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("No rooms yet")).toBeTruthy());
  });

  it("shows the API's own words when it is refused", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockList.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });
});

describe("one room", () => {
  it("says what it is", async () => {
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByLabelText("Type: Deluxe")).toBeTruthy());
    expect(r.getByLabelText("Sleeps 2 adults and 1 children")).toBeTruthy();
    expect(r.getByLabelText("Extra persons: 2 × ৳500/night")).toBeTruthy();
  });

  /**
   * The inversion `nextRoomStatus` exists for: the badge says what the
   * room *is* and the button says where it *goes*, and both are right at
   * the same time.
   */
  it("offers to shut an open room, and says it is open", async () => {
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByText("Active")).toBeTruthy());
    expect(r.getByRole("button", { name: "Out of service" })).toBeTruthy();
  });

  it("offers to open a shut one", async () => {
    mockList.mockResolvedValue([room({ status: "OUT_OF_SERVICE" })]);
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByText("Out of service")).toBeTruthy());
    expect(r.getByRole("button", { name: "Activate" })).toBeTruthy();
  });

  it("shuts it", async () => {
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Out of service" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Out of service" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(11, { status: "OUT_OF_SERVICE" }));
  });

  it("sends only what changed", async () => {
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByLabelText("Base rate a night")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Base rate a night"), "5200");
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(11, { baseRate: 5200 }));
  });

  it("sends nothing and goes back when nothing changed", async () => {
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Save changes" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  /** Somebody who may look at rooms is not somebody who may reprice them. */
  it("shows no form to somebody who may not change rooms", async () => {
    mockCan = (key) => key !== "rooms.manage";
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByLabelText("Type: Deluxe")).toBeTruthy());
    expect(r.queryByLabelText("Base rate a night")).toBeNull();
    expect(r.queryByRole("button", { name: "Out of service" })).toBeNull();
  });

  it("says so when the room is gone", async () => {
    mockList.mockResolvedValue([room({ id: 99 })]);
    const r = await open(RoomScreen);
    await waitFor(() => expect(r.getByText("Room not found")).toBeTruthy());
  });
});

describe("the kinds of room", () => {
  it("says what each one sleeps", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByLabelText("Deluxe sleeps 2 adults, 1 child")).toBeTruthy());
  });

  /**
   * The type's figure is a default for new rooms, not a price. A clerk
   * reading it as the price quotes the wrong figure for half a type.
   */
  it("says the type's extra-person figure is only a default", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByLabelText(/each room carries its own/)).toBeTruthy());
  });

  it("marks a type nobody should use again", async () => {
    mockTypes.mockResolvedValue([type({ active: false })]);
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByText(/Retired/)).toBeTruthy());
  });

  it("says so when there are none", async () => {
    mockTypes.mockResolvedValue([]);
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByText("No room types yet")).toBeTruthy());
  });
});
