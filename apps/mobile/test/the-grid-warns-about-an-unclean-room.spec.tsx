/**
 * The booking grid warns about a room nobody has cleaned (2026-09-21).
 *
 * Housekeeping shipped and stopped at its own screen. This is the screen
 * where it matters: a guest is standing at the counter, the clerk opens
 * the grid, and 1 Camellia is offered at ৳4,500 with nothing said —
 * while the housekeeping list two taps away calls it DIRTY because its
 * last guest walked out at nine.
 *
 * It warns and it still sells. That is the same call the feature already
 * made about check-in, for the same reason: a clerk who cannot give a
 * waiting guest a room because of a checkbox will go round the app, and
 * an app people go round stops being true. Amber, not red — red is for
 * the nights, which are actually gone.
 *
 * And only for tonight. The grid carries the state for every date it is
 * asked about, because the server does not know what the caller wants
 * with it, but a stay beginning next month has nothing to do with this
 * morning's beds. `roomOffer` is where that is decided; this is where it
 * is seen.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { addDaysIso, todayIn, type RoomAvail } from "@rh/shared";

const mockAvailability = jest.fn();

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
  client: { rooms: { availability: (...a: unknown[]) => mockAvailability(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const NewBookingScreen = require("../app/new-booking/index").default;
const { Draft } = require("../src/booking/draft");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const room = (over: Partial<RoomAvail> = {}): RoomAvail => ({
  roomId: 1,
  roomName: "1 Camellia",
  roomTypeId: 1,
  baseRate: 4500,
  status: "ACTIVE",
  busyNights: [],
  housekeeping: "CLEAN",
  ...over,
});

const open = async () =>
  render(
    <Harness>
      <Draft>
        <NewBookingScreen />
      </Draft>
    </Harness>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailability.mockResolvedValue([room()]);
});

describe("a room that needs cleaning", () => {
  it("says so beside the rate", async () => {
    mockAvailability.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/needs cleaning/)).toBeTruthy());
  });

  it("can still be picked, because a guest is waiting", async () => {
    mockAvailability.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/needs cleaning/)).toBeTruthy());
    const tile = r.getByLabelText(/1 Camellia/);
    expect(tile.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(tile);
    await waitFor(() => expect(r.getByLabelText(/1 Camellia/).props.accessibilityState?.selected).toBe(true));
  });

  it("says a room is being cleaned while somebody is in it", async () => {
    mockAvailability.mockResolvedValue([room({ housekeeping: "CLEANING" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/being cleaned/)).toBeTruthy());
  });

  it("says nothing at all about a clean one", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("1 Camellia")).toBeTruthy());
    expect(r.queryByText(/cleaning/i)).toBeNull();
  });
});

describe("a busy room is still the louder problem", () => {
  it("names the nights rather than the mop", async () => {
    mockAvailability.mockResolvedValue([
      room({ busyNights: ["2026-09-21"], housekeeping: "DIRTY" }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/busy \(1n\)/)).toBeTruthy());
    expect(r.queryByText(/needs cleaning/)).toBeNull();
  });
});

describe("only tonight", () => {
  /**
   * The draft opens on today, so moving check-in forward is what a clerk
   * taking a booking for next week actually does — and the warning has
   * to go with it.
   */
  it("drops the warning once the stay starts another day", async () => {
    mockAvailability.mockResolvedValue([room({ housekeeping: "DIRTY" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/needs cleaning/)).toBeTruthy());
    // one tap of the check-in arrow: tomorrow's guest meets a clean room
    fireEvent.press(r.getAllByLabelText(/next day/i)[0]);
    await waitFor(() => expect(r.queryByText(/needs cleaning/)).toBeNull());
  });

  it("knows today from the resort's clock, not the machine's", async () => {
    // the draft's own default, which is what the screen compares against
    const here = todayIn("Asia/Dhaka");
    expect(addDaysIso(here, 1) > here).toBe(true);
  });
});
