/**
 * "Free" is not the same as "ready" (2026-09-21).
 *
 * The housekeeping design said this in so many words on the day it was
 * written — *"the day sheet already shows rooms and should say which are
 * ready"* — and task 5 shipped without it. The register went on saying
 * **Free** beside a room whose guest had walked out at nine and which
 * nobody had been into since, which is the one screen a clerk reads
 * every morning before deciding where to put a walk-in.
 *
 * Free is about the bookings and stays true: nobody has that room
 * tonight. What it never meant is that somebody could be shown into it.
 *
 * Only on today's sheet. The register scrolls to any date, and a room
 * dirty this morning has nothing to say about the 3rd of December — it
 * will have been cleaned forty times. A mark that appears on every date
 * is a mark nobody reads, which is the same mistake the housekeeping
 * list made when every clean room carried a "Needs cleaning" button.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { todayIn, type DaySheet, type DaySheetRoom } from "@rh/shared";

const mockSheet = jest.fn();

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
  client: { daySheet: (...a: unknown[]) => mockSheet(...a) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const DaySheetScreen = require("../app/(tabs)/(desk)/daysheet").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const ZONE = "Asia/Dhaka";

const room = (over: Partial<DaySheetRoom> = {}): DaySheetRoom => ({
  roomId: 1,
  name: "1 Camellia",
  capacity: 4,
  status: "ACTIVE",
  housekeeping: "CLEAN",
  cell: { mode: "available" },
  ...over,
});

const sheet = (over: Partial<DaySheet> = {}): DaySheet => ({
  date: todayIn(ZONE),
  rooms: [room()],
  strip: {
    balanceDue: 0,
    revenue: 0,
    expenses: 0,
    arrivals: 0,
    departures: 0,
    occupancy: 0,
    totalRooms: 1,
  },
  ...over,
});

const open = async () => render(<Harness><DaySheetScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockSheet.mockResolvedValue(sheet());
});

describe("a free room that nobody has cleaned", () => {
  it("does not simply say Free", async () => {
    mockSheet.mockResolvedValue(sheet({ rooms: [room({ housekeeping: "DIRTY" })] }));
    const r = await open();
    await waitFor(() => expect(r.getByText(/needs cleaning/i)).toBeTruthy());
  });

  it("says a room is being cleaned while somebody is in it", async () => {
    mockSheet.mockResolvedValue(sheet({ rooms: [room({ housekeeping: "CLEANING" })] }));
    const r = await open();
    await waitFor(() => expect(r.getByText(/being cleaned/i)).toBeTruthy());
  });

  it("still says Free for one that is ready", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    expect(r.queryByText(/cleaning/i)).toBeNull();
  });
});

describe("what it leaves alone", () => {
  /** A room with a guest in it tonight is that guest's, clean or not. */
  it("names the guest rather than the mop on an occupied room", async () => {
    mockSheet.mockResolvedValue(
      sheet({
        rooms: [room({ housekeeping: "DIRTY", cell: { mode: "booked", guestName: "Rafiq Hasan" } })],
      }),
    );
    const r = await open();
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByText(/needs cleaning/i)).toBeNull();
  });

  it("says out of service rather than needs cleaning when it is both", async () => {
    mockSheet.mockResolvedValue(
      sheet({ rooms: [room({ status: "OUT_OF_SERVICE", housekeeping: "DIRTY", cell: { mode: "oos" } })] }),
    );
    const r = await open();
    await waitFor(() => expect(r.getByText("Out of service")).toBeTruthy());
    expect(r.queryByText(/needs cleaning/i)).toBeNull();
  });

  it("says nothing when the server sent no state", async () => {
    mockSheet.mockResolvedValue(sheet({ rooms: [room({ housekeeping: undefined })] }));
    const r = await open();
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    expect(r.queryByText(/undefined|cleaning/i)).toBeNull();
  });
});

describe("only today's sheet", () => {
  /**
   * The state is now. A register opened on next Tuesday is a plan, and a
   * plan has no opinion about this morning's beds.
   */
  it("says nothing about cleaning once the register moves off today", async () => {
    // the screen's date is its own, not the payload's, so the only honest
    // way to reach another day is the arrow a clerk would press
    mockSheet.mockResolvedValue(sheet({ rooms: [room({ housekeeping: "DIRTY" })] }));
    const r = await open();
    await waitFor(() => expect(r.getByText(/needs cleaning/i)).toBeTruthy());
    fireEvent.press(r.getAllByLabelText(/next day/i)[0]);
    // wait for the new day to land, not for the old one to disappear: the
    // screen shows a spinner in between, and "no mark on a spinner" would
    // pass for the wrong reason
    await waitFor(() => expect(r.getByText("Free")).toBeTruthy());
    expect(r.queryByText(/needs cleaning/i)).toBeNull();
  });
});
