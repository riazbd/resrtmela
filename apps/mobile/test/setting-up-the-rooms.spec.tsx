/**
 * Setting up the inventory, not only reading it (2026-09-21).
 *
 * The rooms list said *"Add the resort's rooms on the desk"* and the room
 * types screen said types were *"changed on the desk"*. Both were
 * deliberate, and the reasoning was good: a type is a structural decision
 * — renaming one moves every room under it and every future occupancy
 * check — and it is made once rather than between guests.
 *
 * The reasoning was right and the conclusion was wrong for the people
 * actually using this. An owner opening a resort has the phone in their
 * hand and the rooms in front of them; being sent to find a laptop is
 * being told the software is not finished. The owner asked for both, in
 * as many words.
 *
 * What the caution was right about survives as a sentence inside the
 * form, where it is read before the save rather than after it.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Room, RoomType } from "@rh/shared";

const mockList = jest.fn();
const mockTypes = jest.fn();
const mockCreate = jest.fn();
const mockCreateType = jest.fn();
const mockUpdateType = jest.fn();
const mockPush = jest.fn();
let mockCan = (_key: string) => true;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    loading: false,
    me: { id: 1, name: "Rahim" },
    can: (key: string) => mockCan(key),
  }),
  client: {
    rooms: {
      list: (...a: unknown[]) => mockList(...a),
      types: (...a: unknown[]) => mockTypes(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      createType: (...a: unknown[]) => mockCreateType(...a),
      updateType: (...a: unknown[]) => mockUpdateType(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const RoomsScreen = require("../app/(tabs)/rooms").default;
const TypesScreen = require("../app/(tabs)/(desk)/rooms/types").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const type = (over: Partial<RoomType> = {}): RoomType => ({
  id: 2,
  name: "Deluxe",
  maxAdults: 2,
  maxChildren: 1,
  extraPersonAllowed: true,
  extraPersonRate: 500,
  amenities: ["Sea view"],
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
  roomType: type(),
  ...over,
});

beforeEach(() => {
  mockCan = () => true;
  mockList.mockReset().mockResolvedValue([room()]);
  mockTypes.mockReset().mockResolvedValue([type()]);
  mockCreate.mockReset().mockResolvedValue(room({ id: 12, name: "2 Lotus" }));
  mockCreateType.mockReset().mockResolvedValue(type({ id: 5, name: "Family" }));
  mockUpdateType.mockReset().mockResolvedValue(type());
  mockPush.mockReset();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

describe("adding a room", () => {
  it("is offered to somebody who may change rooms", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room" })).toBeTruthy());
  });

  it("is not offered to somebody who may not", async () => {
    mockCan = (key) => key !== "rooms.manage";
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add a room" })).toBeNull();
  });

  it("takes a name, a type and a rate", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "2 Lotus");
    await fireEvent.changeText(r.getByLabelText("Rate a night"), "4500");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(3, {
        name: "2 Lotus",
        roomTypeId: 2,
        baseRate: 4500,
      }),
    );
  });

  it("will not send a room with no name", async () => {
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room" }));
    await waitFor(() => expect(r.getByLabelText("Rate a night")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Rate a night"), "4500");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(r.getByText("A name, a type and a rate.")).toBeTruthy();
  });

  /**
   * `roomTypeId` is a foreign key, so a resort with no types cannot have
   * a room at all. Sending somebody to make one beats offering a picker
   * with nothing in it and a refusal on Save.
   */
  it("sends somebody to make a type first, when there are none", async () => {
    mockTypes.mockResolvedValue([]);
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room" }));
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Set up a room type" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Set up a room type" }));
    expect(mockPush).toHaveBeenCalledWith("/rooms/types");
  });

  it("shows the API's own words when it is refused", async () => {
    mockCreate.mockRejectedValue(new Error("A room called 2 Lotus already exists"));
    const r = await open(RoomsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "2 Lotus");
    await fireEvent.changeText(r.getByLabelText("Rate a night"), "4500");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(r.getByText(/already exists/)).toBeTruthy());
  });
});

describe("setting up a room type", () => {
  it("is offered to somebody who may change rooms", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room type" })).toBeTruthy());
  });

  it("is not offered to somebody who may not", async () => {
    mockCan = (key) => key !== "rooms.manage";
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByText("Deluxe")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add a room type" })).toBeNull();
    expect(r.queryByRole("button", { name: "Edit Deluxe" })).toBeNull();
  });

  it("takes a name and what it sleeps", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room type" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room type" }));
    await waitFor(() => expect(r.getByText("A new type")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Family");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockCreateType).toHaveBeenCalled());
    expect(mockCreateType.mock.calls[0][0]).toBe(3);
    expect(mockCreateType.mock.calls[0][1]).toMatchObject({ name: "Family", maxAdults: 2 });
  });

  it("will not send a type with no name", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room type" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room type" }));
    await waitFor(() => expect(r.getByText("A new type")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    expect(mockCreateType).not.toHaveBeenCalled();
    expect(r.getByText("A type needs a name.")).toBeTruthy();
  });

  it("corrects one that already exists", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Edit Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Edit Deluxe" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Deluxe Sea View");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateType).toHaveBeenCalled());
    expect(mockUpdateType.mock.calls[0][0]).toBe(2);
    expect(mockUpdateType.mock.calls[0][1]).toMatchObject({ name: "Deluxe Sea View" });
  });

  /** Changing a type moves every room under it, and that is worth reading first. */
  it("says what an edit will reach", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Edit Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Edit Deluxe" }));
    await waitFor(() => expect(r.getByText(/moves every room under Deluxe/)).toBeTruthy());
  });

  it("takes amenities on the way in", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a room type" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a room type" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Family");
    await fireEvent.changeText(r.getByLabelText("Amenities"), "Sea view, air conditioning");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockCreateType).toHaveBeenCalled());
    expect(mockCreateType.mock.calls[0][1].amenities).toEqual(["Sea view", "air conditioning"]);
  });

  /**
   * `UpdateRoomTypeDto` has no `amenities`, so an edit has nothing to
   * send and the console offers no field either.
   */
  it("does not offer amenities on an edit it could not save", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Edit Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Edit Deluxe" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    expect(r.queryByLabelText("Amenities")).toBeNull();
  });

  /**
   * What an extra person costs is the *room's* answer, not the type's.
   *
   * `RoomType` carries the columns and the console's form leaves them
   * out on purpose — *one type covers rooms of different sizes, so a
   * single answer described none of them*. The value seeds a new room
   * and is the room's own after that, which is why the room screen has
   * the field and this one does not. A form here would invite an owner
   * to change a number that governs nothing they already own.
   */
  it("does not offer the extra-person fields the room owns", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Edit Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Edit Deluxe" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    expect(r.queryByRole("switch", { name: "Takes an extra person" })).toBeNull();
    expect(r.queryByLabelText("Extra person rate")).toBeNull();
  });

  it("sends only the three fields the console sends", async () => {
    const r = await open(TypesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Edit Deluxe" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Edit Deluxe" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateType).toHaveBeenCalled());
    expect(Object.keys(mockUpdateType.mock.calls[0][1]).sort()).toEqual([
      "maxAdults",
      "maxChildren",
      "name",
    ]);
  });
});
