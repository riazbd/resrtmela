/**
 * The end of the line for an old build (2026-09-21).
 *
 * There is no Play Store, so when the API refuses a build with a 426
 * there is nowhere to send anybody except a page on our own website.
 * This screen is that hand-off, and the things it must not do are as
 * load-bearing as the things it must:
 *
 *   - **no way past it.** Every other screen would spend its first
 *     render making a call that is about to be refused, and a front
 *     desk watching six spinners fail is worse than one sentence.
 *   - **no sign-out.** The refusal is about the build, not the person.
 *     Signing them out costs them their password for nothing.
 *   - **no address of its own.** An app old enough to be stopped is old
 *     enough to have a stale download URL compiled into it, which is
 *     exactly the failure this screen exists to end.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

/*
 * `jest.spyOn`, not a module mock: mocking
 * `react-native/Libraries/Linking/Linking` does not replace the
 * `Linking` that `react-native` re-exports, so the screen kept the
 * real one and the press threw on `undefined.openURL`.
 */
import { Linking } from "react-native";

const mockOpenURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

const mockAppRelease = jest.fn();
jest.mock("../src/api/session", () => ({
  useAuth: () => ({ me: null, loading: false, activeResort: null, can: () => false }),
  client: { appRelease: () => mockAppRelease() },
}));

jest.mock("../src/api/config", () => ({ APP_VERSION: "0.4.0", API_URL: "https://x", CONSOLE_URL: "" }));

/* eslint-disable @typescript-eslint/no-var-requires */
const UpdateRequired = require("../app/update-required").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const RELEASE = {
  latest: "0.9.0",
  minimum: "0.8.0",
  downloadUrl: "https://resortmela.com/app",
  notes: "Faster day sheet.",
};

const open = async () => render(<Harness><UpdateRequired /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockAppRelease.mockResolvedValue(RELEASE);
});

describe("what it says", () => {
  it("names the version they have and the one they need", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText(/0\.9\.0/)).toBeTruthy());
    const body = r.getByText(/0\.9\.0/).props.children as string;
    expect(body).toContain("0.4.0");
    expect(body).toContain("0.8.0");
  });

  it("passes on what changed, when there is something to say", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Faster day sheet.")).toBeTruthy());
  });

  /**
   * The token is left in place by the transport on purpose, so the
   * screen can promise this. A promise the code did not keep would be
   * worse than saying nothing.
   */
  it("promises the session survives the reinstall", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText(/stay signed in/i)).toBeTruthy());
  });
});

describe("the one thing it offers", () => {
  it("opens the address the server gave it", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Download the new version")).toBeTruthy());
    await fireEvent.press(r.getByText("Download the new version"));
    expect(mockOpenURL).toHaveBeenCalledWith("https://resortmela.com/app");
  });

  /**
   * "Continue anyway" would be a lie — the server refuses the next call
   * either way — and "Sign out" solves nothing.
   */
  it("offers no way past it and no way to sign out", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Download the new version")).toBeTruthy());
    expect(r.queryByText(/continue|skip|later|not now/i)).toBeNull();
    expect(r.queryByText(/sign out/i)).toBeNull();
  });
});

describe("when even the release cannot be fetched", () => {
  /**
   * No signal, or the server down. The screen still has to say
   * something: a blank page reads as the app being broken rather than
   * out of date.
   */
  it("still says what is wrong", async () => {
    mockAppRelease.mockRejectedValue(new Error("offline"));
    const r = await open();
    await waitFor(() => expect(r.getByText("Time to update")).toBeTruthy());
    expect(r.getByText(/too old to use/i)).toBeTruthy();
  });

  /** And does not offer a button that would open nothing. */
  it("does not offer a download it has no address for", async () => {
    mockAppRelease.mockRejectedValue(new Error("offline"));
    const r = await open();
    await waitFor(() => expect(r.getByText("Time to update")).toBeTruthy());
    await fireEvent.press(r.getByText("Download the new version"));
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});
