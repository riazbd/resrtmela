/**
 * A new version says so (2026-09-21).
 *
 * Over-the-air updates download in the background and apply on the
 * *next* launch. Nothing said so, and the honest instruction that
 * follows from it is what I wrote to the owner: install it, open it,
 * close it, open it again. Their reply was that this is a problem.
 *
 * It is. Not only for the first install — for every update after it,
 * because a phone that stays open at a front desk all week never
 * relaunches, so it runs last week's code all week and is never told.
 *
 * The two obvious fixes are worse, and both are ruled out here rather
 * than in a comment nobody reads:
 *
 *   - blocking the launch on the network, on connections where that
 *     means seconds of nothing before the day sheet;
 *   - reloading the instant the bundle lands, which restarts the app
 *     under somebody halfway through taking a booking.
 *
 * So the rule is: say it once, and let them choose the moment.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReload = jest.fn();
const mockCheck = jest.fn();
const mockFetch = jest.fn();
let mockEnabled = true;
let mockListener: ((e: { context: { isUpdatePending: boolean } }) => void) | null = null;
const mockRemove = jest.fn();

jest.mock(
  "expo-updates",
  () => ({
    get isEnabled() {
      return mockEnabled;
    },
    reloadAsync: () => mockReload(),
    checkForUpdateAsync: () => mockCheck(),
    fetchUpdateAsync: () => mockFetch(),
    addUpdatesStateChangeListener: (fn: (e: { context: { isUpdatePending: boolean } }) => void) => {
      mockListener = fn;
      return { remove: mockRemove };
    },
  }),
  { virtual: true },
);

/* eslint-disable @typescript-eslint/no-var-requires */
const { UpdateReady } = require("../src/screens/update-ready");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const open = async () => render(<Harness><UpdateReady /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled = true;
  mockListener = null;
  mockCheck.mockResolvedValue({ isAvailable: false });
  mockFetch.mockResolvedValue({ isNew: true });
});

describe("when there is nothing new", () => {
  it("says nothing at all", async () => {
    const r = await open();
    await waitFor(() => expect(mockCheck).toHaveBeenCalled());
    expect(r.queryByText(/new version/i)).toBeNull();
  });

  /**
   * No signal, or the server quiet. There is nothing useful to say
   * about an update that could not be fetched, and a banner about it
   * is noise on a screen somebody is working in.
   */
  it("says nothing when it could not even ask", async () => {
    mockCheck.mockRejectedValue(new Error("offline"));
    const r = await open();
    await waitFor(() => expect(mockCheck).toHaveBeenCalled());
    expect(r.queryByText(/new version/i)).toBeNull();
  });
});

describe("when a new version has been fetched", () => {
  it("says so, once it is actually downloaded and not before", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());
    // announced after the download, so pressing Restart cannot land on
    // a bundle that is still arriving
    expect(mockFetch).toHaveBeenCalled();
  });

  /**
   * The case this was written for: a build installed today, older than
   * the latest bundle, with the download already finished on disk from
   * a previous run. The listener reports it without a fresh check.
   */
  it("says so when one was already waiting from a previous run", async () => {
    const r = await open();
    await waitFor(() => expect(mockListener).not.toBeNull());
    mockListener!({ context: { isUpdatePending: true } });
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());
  });

  it("restarts only when the person asks", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());

    // nothing has restarted yet — that is the whole point
    expect(mockReload).not.toHaveBeenCalled();

    await fireEvent.press(r.getByLabelText("Restart now to use the new version"));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  /** A second press while the reload is in flight must not stack. */
  it("cannot be pressed twice", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());

    await fireEvent.press(r.getByLabelText("Restart now to use the new version"));
    await fireEvent.press(r.getByLabelText("Restart now to use the new version"));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});

describe("where there is no updater", () => {
  /**
   * Expo Go and development. The module is present and disabled, and
   * a bar offering to restart into a bundle that does not exist would
   * be a lie told on every developer's screen.
   */
  it("does not ask, and does not show", async () => {
    mockEnabled = false;
    const r = await open();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(r.queryByText(/new version/i)).toBeNull();
  });
});
