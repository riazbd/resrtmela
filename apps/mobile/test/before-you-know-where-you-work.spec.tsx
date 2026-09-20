/**
 * Restoring a session is not a problem to be fixed (2026-09-20).
 *
 * Found on a device, opened cold by a deep link: the Restaurant screen
 * said *"No resort selected — choose a resort from the More tab"* while
 * the session was still restoring. Nineteen screens said it, phase 1's
 * included, and no browser had ever shown it — storage answers in under
 * a millisecond there and the `/auth/me` fetch is on a desk's
 * connection. On a phone it is seconds, and it is the first thing
 * somebody sees.
 *
 * The sentence is true of exactly one situation and was being shown in
 * two. Telling a person to go and fix something that is not broken is
 * worse than telling them nothing, because they will go and try.
 *
 * **And then it was three.** The first fix here counted the states and
 * got two of them. Opening the app on the owner's own phone, signed out,
 * showed the same sentence again — to somebody with no resorts to choose
 * from, no More tab worth opening and no owner to ask, because they had
 * not signed in. Same defect, one state further along, and the lesson is
 * the one the first fix should have drawn: *enumerate the states, do not
 * patch the one in front of you.*
 *
 * There are three. Waiting. Signed out. Signed in, with no resort.
 */
import { render, waitFor } from "@testing-library/react-native";

let mockLoading = true;
let mockMe: unknown = null;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ loading: mockLoading, activeResort: null, me: mockMe }),
  client: {},
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { WhichResort } = require("../src/screens/which-resort");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const someone = { id: 1, name: "Rahim", role: "RESORT_ADMIN" };

describe("before you know where you work", () => {
  it("waits, while the session is still restoring", async () => {
    mockLoading = true;
    mockMe = null;
    const r = await render(<Harness><WhichResort what="the restaurant" /></Harness>);
    await waitFor(() => expect(r.getByText("Loading the restaurant…")).toBeTruthy());
    expect(r.queryByText("No resort selected")).toBeNull();
    expect(r.queryByText(/signed in/i)).toBeNull();
  });

  /**
   * Nobody is signed in. Every word of the other sentence is wrong here:
   * there is no More tab to choose a resort from, no resort to choose,
   * and no owner who could add this person to one.
   */
  it("says so when nobody is signed in, and offers the way in", async () => {
    mockLoading = false;
    mockMe = null;
    const r = await render(<Harness><WhichResort what="the restaurant" /></Harness>);
    await waitFor(() => expect(r.getByText(/not signed in/i)).toBeTruthy());
    expect(r.queryByText("No resort selected")).toBeNull();
    expect(r.getByText("Sign in")).toBeTruthy();
  });

  /**
   * Signed in, finished loading, and still no resort. Now — and only
   * now — the sentence is right and there is something to do about it.
   */
  it("asks for one, once there is nothing left to wait for", async () => {
    mockLoading = false;
    mockMe = someone;
    const r = await render(<Harness><WhichResort /></Harness>);
    await waitFor(() => expect(r.getByText("No resort selected")).toBeTruthy());
    expect(r.getByText(/More tab/)).toBeTruthy();
  });
});
