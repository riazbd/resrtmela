/**
 * The first native screen, and the four things it owes a person.
 *
 * It is written against the console's own sign-in screen rather than
 * invented: the same identifier that takes either a phone or an email, the
 * same landing rule so nobody arrives somewhere their permissions refuse,
 * and the same neutral sentence after a reset request. Two clients that
 * disagree about who may sign in, or about what a refusal says, are two
 * products.
 */
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { RESET_REQUESTED_MESSAGE } from "@rh/shared";

/**
 * `mock`-prefixed because jest hoists `jest.mock` above the file, and a
 * factory that closes over an ordinary `const` would read it before it is
 * assigned. The prefix is jest's way of being told that is intended.
 */
const mockLogin = jest.fn();
const mockForgotPassword = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: { replace: (path: string) => mockReplace(path) },
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ login: mockLogin }),
  client: { auth: { forgotPassword: mockForgotPassword } },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LoginScreen = require("../app/login").default;

beforeEach(() => {
  mockLogin.mockReset();
  mockForgotPassword.mockReset().mockResolvedValue({ sent: true });
  mockReplace.mockReset();
});

describe("what the screen asks for", () => {
  it("takes a phone or an email in one box, as the console does", async () => {
    const r = await render(<LoginScreen />);
    expect(r.getByLabelText("Phone or email")).toBeTruthy();
    expect(r.getByPlaceholderText("01XXXXXXXXX or you@email.com")).toBeTruthy();
  });

  it("hides the password while it is typed", async () => {
    const r = await render(<LoginScreen />);
    expect(r.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });
});

describe("signing in", () => {
  it("hands the identifier and password to the session, untouched", async () => {
    mockLogin.mockResolvedValue({ role: "RESORT_ADMIN" });
    const r = await render(<LoginScreen />);
    await fireEvent.changeText(r.getByLabelText("Phone or email"), "01711111111");
    await fireEvent.changeText(r.getByLabelText("Password"), "hunter22");
    await fireEvent.press(r.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("01711111111", "hunter22"));
  });

  /**
   * "/dashboard" for everyone sent the platform owner into somebody else's
   * resort and an agent to a screen their permissions refuse. The rule is
   * `landingFor`, in `@rh/shared`, so both clients obey the same one.
   */
  it("sends an agent where an agent belongs", async () => {
    mockLogin.mockResolvedValue({ role: "AGENT" });
    const r = await render(<LoginScreen />);
    await fireEvent.changeText(r.getByLabelText("Phone or email"), "a@b.c");
    await fireEvent.changeText(r.getByLabelText("Password"), "hunter22");
    await fireEvent.press(r.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/agent/discover"));
  });

  it("sends the platform owner to the platform, not into a resort", async () => {
    mockLogin.mockResolvedValue({ role: "SUPER_ADMIN" });
    const r = await render(<LoginScreen />);
    await fireEvent.changeText(r.getByLabelText("Phone or email"), "a@b.c");
    await fireEvent.changeText(r.getByLabelText("Password"), "hunter22");
    await fireEvent.press(r.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/platform"));
  });

  it("shows the API's own words when it refuses", async () => {
    mockLogin.mockRejectedValue(new Error("Wrong phone or password"));
    const r = await render(<LoginScreen />);
    await fireEvent.changeText(r.getByLabelText("Phone or email"), "a@b.c");
    await fireEvent.changeText(r.getByLabelText("Password"), "nope1234");
    await fireEvent.press(r.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(r.getByText("Wrong phone or password")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /**
   * Two taps on a slow connection is two sign-in requests, and the second
   * one lands after the first has already routed away. `Button` refuses
   * while loading; this checks the screen actually tells it so.
   */
  it("does not sign in twice when the button is tapped twice", async () => {
    // a request this test decides when to answer. `useAction` latches on a
    // ref, so the second tap is refused before any render has happened —
    // which is the case a `busy` flag in state cannot catch
    let answer!: (me: { role: string }) => void;
    mockLogin.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (me: { role: string }) => void)),
    );

    const r = await render(<LoginScreen />);
    await fireEvent.changeText(r.getByLabelText("Phone or email"), "a@b.c");
    await fireEvent.changeText(r.getByLabelText("Password"), "hunter22");
    const button = r.getByRole("button", { name: "Sign in" });

    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(mockLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer({ role: "RESORT_ADMIN" });
    });
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });
});

describe("a password nobody can remember", () => {
  it("opens on asking, and asks for one identifier", async () => {
    const r = await render(<LoginScreen />);
    await fireEvent.press(r.getByRole("button", { name: "Forgot password?" }));
    expect(r.getByLabelText("Phone or email for the reset link")).toBeTruthy();
  });

  it("says the same sentence the console says", async () => {
    const r = await render(<LoginScreen />);
    await fireEvent.press(r.getByRole("button", { name: "Forgot password?" }));
    await fireEvent.changeText(r.getByLabelText("Phone or email for the reset link"), "a@b.c");
    await fireEvent.press(r.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(r.getByText(RESET_REQUESTED_MESSAGE)).toBeTruthy());
    expect(mockForgotPassword).toHaveBeenCalledWith("a@b.c");
  });

  /**
   * The endpoint refuses to say whether an address has an account, and a
   * different message on a network failure would say it for them.
   */
  it("says it even when the request fails, so nothing is given away", async () => {
    mockForgotPassword.mockRejectedValue(new Error("Network request failed"));
    const r = await render(<LoginScreen />);
    await fireEvent.press(r.getByRole("button", { name: "Forgot password?" }));
    await fireEvent.changeText(r.getByLabelText("Phone or email for the reset link"), "a@b.c");
    await fireEvent.press(r.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(r.getByText(RESET_REQUESTED_MESSAGE)).toBeTruthy());
    expect(r.queryByText(/network/i)).toBeNull();
  });
});
