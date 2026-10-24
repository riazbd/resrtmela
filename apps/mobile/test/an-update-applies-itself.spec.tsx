/**
 * An update nobody presses.
 *
 * The bar that says "a new version is ready" asks for a decision while
 * somebody is looking at a screen they opened for another reason — so it gets
 * ignored, for weeks. The owner's phone sat a month behind on a build that had
 * the dashboard charts in it, with the bar up in every screenshot they sent,
 * and *"graph show kore nah"* was the symptom that finally surfaced it.
 *
 * Expo applies a pending update on the next **cold** start. Android rarely
 * gives one: the process stays resident, and the app is resumed rather than
 * launched. So this does what a cold start would have done, at the moment it
 * is plainly safe — the app has been away a quarter of an hour and there is
 * nothing queued to send. The bar stays for anyone who wants it sooner.
 *
 * **Its own file, and the order of these tests matters.** "Is an update
 * waiting" lives in a module-level store so the status-bar strip can read it
 * without a provider, which means it outlives a render. Jest gives each file
 * its own copy of a module, so the first test here runs against a clean one —
 * and it is the test that needs it.
 */
import { render, waitFor } from "@testing-library/react-native";

const mockReload = jest.fn();
const mockCheck = jest.fn();
const mockFetch = jest.fn();

jest.mock(
  "expo-updates",
  () => ({
    isEnabled: true,
    reloadAsync: () => mockReload(),
    checkForUpdateAsync: () => mockCheck(),
    fetchUpdateAsync: () => mockFetch(),
    addUpdatesStateChangeListener: () => ({ remove: () => {} }),
  }),
  { virtual: true },
);

/* eslint-disable @typescript-eslint/no-var-requires */
const { UpdateReady } = require("../src/screens/update-ready");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * The handler is taken from `addEventListener` rather than emitted on
 * `AppState`: under jest-expo that object is a mock with no emitter, so `emit`
 * is silently a no-op and these tests would pass by never running.
 */
let onAppState: ((state: string) => void) | null = null;
let spy: jest.SpyInstance | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(undefined);
  onAppState = null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppState } = require("react-native");
  spy = jest.spyOn(AppState, "addEventListener").mockImplementation((...args: unknown[]) => {
    const [event, fn] = args as [string, (state: string) => void];
    if (event === "change") onAppState = fn;
    return { remove: () => {} } as never;
  });
});

afterEach(() => {
  spy?.mockRestore();
});

const open = async () => render(<Harness><UpdateReady /></Harness>);

/** Away for `awayMs`, then back. */
const resume = async (awayMs: number) => {
  onAppState?.("background");
  const realNow = Date.now;
  Date.now = () => realNow() + awayMs;
  try {
    onAppState?.("active");
    await waitFor(() => {});
  } finally {
    Date.now = realNow;
  }
};

describe("coming back to the app", () => {
  /**
   * First, deliberately: the store this reads is clean only before another
   * test in this file has announced an update into it.
   */
  it("does not restart when nothing is waiting, however long the phone was away", async () => {
    mockCheck.mockResolvedValue({ isAvailable: false });
    await open();

    await resume(60 * 60 * 1000);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("applies a waiting update after a quarter of an hour away", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());

    await resume(16 * 60 * 1000);
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
  });

  /**
   * A minute in the background is somebody taking a telephone call with a
   * half-typed booking behind it. Restarting under them is the bug this whole
   * screen was written to avoid.
   */
  it("leaves a short absence alone", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() => expect(r.getByText("A new version is ready.")).toBeTruthy());

    await resume(60 * 1000);
    expect(mockReload).not.toHaveBeenCalled();
  });

  /** Still there to be pressed — this adds a second way in, not a new only way. */
  it("still offers the button", async () => {
    mockCheck.mockResolvedValue({ isAvailable: true });
    const r = await open();
    await waitFor(() =>
      expect(r.getByLabelText("Restart now to use the new version")).toBeTruthy(),
    );
  });
});
