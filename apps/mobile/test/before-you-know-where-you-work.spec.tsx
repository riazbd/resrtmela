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
 */
import { render, waitFor } from "@testing-library/react-native";

let mockLoading = true;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ loading: mockLoading, activeResort: null }),
  client: {},
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { WhichResort } = require("../src/screens/which-resort");
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

describe("before you know where you work", () => {
  it("waits, while the session is still restoring", async () => {
    mockLoading = true;
    const r = await render(<Harness><WhichResort what="the restaurant" /></Harness>);
    await waitFor(() => expect(r.getByText("Loading the restaurant…")).toBeTruthy());
    expect(r.queryByText("No resort selected")).toBeNull();
  });

  /**
   * Once the session has finished restoring and there is still no
   * resort, the sentence is right and there is something to do.
   */
  it("asks for one, once there is nothing left to wait for", async () => {
    mockLoading = false;
    const r = await render(<Harness><WhichResort /></Harness>);
    await waitFor(() => expect(r.getByText("No resort selected")).toBeTruthy());
    expect(r.getByText(/More tab/)).toBeTruthy();
  });
});
