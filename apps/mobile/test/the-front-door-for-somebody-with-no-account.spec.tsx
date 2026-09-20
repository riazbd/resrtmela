/**
 * The front door for somebody with no account (phase 4, task 1).
 *
 * Until now the app had none. Both signup routes have existed since the
 * console had them and the typed client has carried both since phase 0,
 * but nothing on the phone reached either: install Resort Mela without
 * an account and the only thing you could do was ask for a password
 * reset to an account you did not have.
 *
 * Two doors, not one form with a switch. An agency has no resort to name
 * and no location to give, and a form that hides three of its seven
 * fields behind a toggle is a form nobody trusts.
 *
 * The rule for what each needs is `@rh/shared`'s, read off the API's
 * DTOs, so the phone and the desk refuse the same forms for the same
 * reasons and say the same sentence about each gap.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockSignup = jest.fn();
const mockSignupAgency = jest.fn();
const mockAdopt = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: (p: string) => mockReplace(p), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: null,
    loading: false,
    activeResort: null,
    can: () => false,
    login: jest.fn(),
    adoptToken: (...a: unknown[]) => mockAdopt(...a),
  }),
  client: {
    auth: {
      signup: (...a: unknown[]) => mockSignup(...a),
      signupAgency: (...a: unknown[]) => mockSignupAgency(...a),
      forgotPassword: jest.fn(),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ResortSignup = require("../app/signup/index").default;
const AgencySignup = require("../app/signup/agency").default;
const LoginScreen = require("../app/login").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const open = async (Screen: React.ComponentType) =>
  render(<Harness><Screen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockSignup.mockResolvedValue({ accessToken: "t" });
  mockSignupAgency.mockResolvedValue({ accessToken: "t" });
  mockAdopt.mockResolvedValue({ role: "RESORT_ADMIN" });
});

/**
 * The doors moved. They were hung off the bottom of the sign-in form
 * when signup was first built, which gave that screen five ways out of
 * it; `the-first-screen-is-not-a-form` is where they are checked now,
 * on the welcome screen they belong to. What stays here is the one line
 * the form keeps for somebody who turns out not to have an account.
 */
describe("the sign-in screen keeps one way out", () => {
  it("offers creating an account, and nothing else", async () => {
    const r = await open(LoginScreen);
    await waitFor(() => expect(r.getByText("New here? Create an account")).toBeTruthy());
    await fireEvent.press(r.getByText("New here? Create an account"));
    expect(mockPush).toHaveBeenCalledWith("/signup");
  });
});

describe("a resort signing itself up", () => {
  it("refuses an empty form and says what each gap needs", async () => {
    const r = await open(ResortSignup);
    await fireEvent.press(r.getByText("Open the resort"));
    await waitFor(() => expect(r.getByText(/Name the resort/)).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("says nothing about gaps before the first attempt", async () => {
    const r = await open(ResortSignup);
    await waitFor(() => expect(r.getByText("Open the resort")).toBeTruthy());
    expect(r.queryByText(/Name the resort/)).toBeNull();
  });

  it("sends what was typed and takes the session it is given", async () => {
    const r = await open(ResortSignup);
    await fireEvent.changeText(r.getByLabelText("Company or owner"), "Sea Breeze Ltd");
    await fireEvent.changeText(r.getByLabelText("Resort"), "Sea Breeze Resort");
    await fireEvent.changeText(r.getByLabelText("Your name"), "Rahim");
    await fireEvent.changeText(r.getByLabelText("Email"), "rahim@example.com");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01811110001");
    await fireEvent.changeText(r.getByLabelText("Password"), "longenough1");
    await fireEvent.press(r.getByText("Open the resort"));
    await waitFor(() => expect(mockSignup).toHaveBeenCalled());
    expect(mockSignup.mock.calls[0][0]).toMatchObject({
      companyName: "Sea Breeze Ltd",
      resortName: "Sea Breeze Resort",
      name: "Rahim",
      password: "longenough1",
    });
    await waitFor(() => expect(mockAdopt).toHaveBeenCalledWith("t"));
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });

  /** An empty box is not a location, and the API would store one. */
  it("sends no location rather than an empty one", async () => {
    const r = await open(ResortSignup);
    for (const [label, value] of [
      ["Company or owner", "A"],
      ["Resort", "B"],
      ["Your name", "C"],
      ["Email", "d@e.com"],
      ["Phone", "01811110001"],
      ["Password", "longenough1"],
    ] as const) {
      await fireEvent.changeText(r.getByLabelText(label), value);
    }
    await fireEvent.press(r.getByText("Open the resort"));
    await waitFor(() => expect(mockSignup).toHaveBeenCalled());
    expect(mockSignup.mock.calls[0][0].location).toBeUndefined();
  });

  it("shows the API's own words when it refuses", async () => {
    mockSignup.mockRejectedValue(new Error("That email already has an account"));
    const r = await open(ResortSignup);
    for (const [label, value] of [
      ["Company or owner", "A"],
      ["Resort", "B"],
      ["Your name", "C"],
      ["Email", "d@e.com"],
      ["Phone", "01811110001"],
      ["Password", "longenough1"],
    ] as const) {
      await fireEvent.changeText(r.getByLabelText(label), value);
    }
    await fireEvent.press(r.getByText("Open the resort"));
    await waitFor(() => expect(r.getByText(/already has an account/)).toBeTruthy());
  });
});

describe("an agency signing itself up", () => {
  /**
   * Said before the button. Somebody who signs up and then finds every
   * resort refuses them has been told too late.
   */
  it("says it lands pending before anything is typed", async () => {
    const r = await open(AgencySignup);
    await waitFor(() => expect(r.getByText(/checks each agency by hand/i)).toBeTruthy());
  });

  it("asks for an agency, not a resort", async () => {
    const r = await open(AgencySignup);
    await waitFor(() => expect(r.getByLabelText("Agency")).toBeTruthy());
    expect(r.queryByLabelText("Resort")).toBeNull();
    expect(r.queryByLabelText("Where it is")).toBeNull();
  });

  it("sends what was typed and lands where an agent belongs", async () => {
    mockAdopt.mockResolvedValue({ role: "AGENT" });
    const r = await open(AgencySignup);
    await fireEvent.changeText(r.getByLabelText("Agency"), "Demo Travels");
    await fireEvent.changeText(r.getByLabelText("Your name"), "Karim");
    await fireEvent.changeText(r.getByLabelText("Email"), "k@e.com");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01811110002");
    await fireEvent.changeText(r.getByLabelText("Password"), "longenough1");
    await fireEvent.press(r.getByText("Open the agency"));
    await waitFor(() => expect(mockSignupAgency).toHaveBeenCalled());
    expect(mockSignupAgency.mock.calls[0][0]).toMatchObject({ agencyName: "Demo Travels" });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/agent/discover"));
  });

  it("refuses a password the API would refuse", async () => {
    const r = await open(AgencySignup);
    await fireEvent.changeText(r.getByLabelText("Agency"), "Demo Travels");
    await fireEvent.changeText(r.getByLabelText("Your name"), "Karim");
    await fireEvent.changeText(r.getByLabelText("Email"), "k@e.com");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01811110002");
    await fireEvent.changeText(r.getByLabelText("Password"), "short");
    await fireEvent.press(r.getByText("Open the agency"));
    await waitFor(() => expect(r.getByText(/at least eight/i)).toBeTruthy());
    expect(mockSignupAgency).not.toHaveBeenCalled();
  });
});
