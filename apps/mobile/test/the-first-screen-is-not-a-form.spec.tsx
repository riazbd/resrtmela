/**
 * The first screen is not a form (2026-09-21, phase 4).
 *
 * Opening Resort Mela signed out dropped a person straight onto a
 * sign-in box, and phase 4 briefly made that worse: the prices, a resort
 * signup and an agency signup were all hung off the bottom of it, so the
 * screen carried five ways out and one of them was a price list.
 *
 * A form is what you show somebody who has already decided. The welcome
 * is the screen before that, and the weights on it are the whole point:
 *
 *   - **Sign in** is primary, because most people opening this app are
 *     staff with an account and a shift starting;
 *   - creating one is quieter;
 *   - the prices are quieter still, because looking at them is browsing.
 *     Meeting a price list at seven in the morning when you opened the
 *     app to see today's arrivals is the fault this screen fixes.
 *
 * The sign-in screen goes back to one job and one line out of it.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: (p: string) => mockReplace(p), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ me: null, loading: false, activeResort: null, can: () => false, login: jest.fn() }),
  client: { auth: { forgotPassword: jest.fn(), plansOnSale: jest.fn().mockResolvedValue([]) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const Welcome = require("../app/welcome").default;
const LoginScreen = require("../app/login").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const open = async (Screen: React.ComponentType) => render(<Harness><Screen /></Harness>);

beforeEach(() => jest.clearAllMocks());

describe("the welcome", () => {
  it("says what the thing is before asking for anything", async () => {
    const r = await open(Welcome);
    await waitFor(() => expect(r.getByText("Resort Mela")).toBeTruthy());
    expect(r.getByText(/front desk, in your pocket/i)).toBeTruthy();
  });

  it("offers signing in, creating an account, and the prices", async () => {
    const r = await open(Welcome);
    await waitFor(() => expect(r.getByText("Sign in")).toBeTruthy());
    expect(r.getByText("Create an account")).toBeTruthy();
    expect(r.getByText("See what it costs")).toBeTruthy();
  });

  it("goes where each one says", async () => {
    const r = await open(Welcome);
    await fireEvent.press(r.getByText("Sign in"));
    expect(mockPush).toHaveBeenCalledWith("/login");
    await fireEvent.press(r.getByText("Create an account"));
    expect(mockPush).toHaveBeenCalledWith("/signup");
    await fireEvent.press(r.getByText("See what it costs"));
    expect(mockPush).toHaveBeenCalledWith("/plans");
  });

  /**
   * No marketing paragraph. The one line under the name says what it is;
   * anybody who wants the pitch presses the prices.
   */
  it("does not sell", async () => {
    const r = await open(Welcome);
    await waitFor(() => expect(r.getByText("Resort Mela")).toBeTruthy());
    expect(r.queryByText(/trial|free|workspace of your own/i)).toBeNull();
  });
});

describe("the sign-in screen", () => {
  it("is one job: the form", async () => {
    const r = await open(LoginScreen);
    await waitFor(() => expect(r.getByText("Sign in")).toBeTruthy());
    expect(r.getByText("Forgot password?")).toBeTruthy();
  });

  /**
   * The three that briefly lived here belong on the welcome. A form with
   * five ways out of it is not a form.
   */
  it("does not carry the welcome's choices as well", async () => {
    const r = await open(LoginScreen);
    await waitFor(() => expect(r.getByText("Sign in")).toBeTruthy());
    expect(r.queryByText("See what it costs")).toBeNull();
    expect(r.queryByText("Open a resort")).toBeNull();
    expect(r.queryByText("Open a travel agency")).toBeNull();
  });

  it("keeps one line out, for somebody with no account", async () => {
    const r = await open(LoginScreen);
    await fireEvent.press(r.getByText("New here? Create an account"));
    expect(mockPush).toHaveBeenCalledWith("/signup");
  });
});
