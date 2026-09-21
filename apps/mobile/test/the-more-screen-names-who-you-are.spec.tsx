/**
 * The More screen names who you are (2026-09-21).
 *
 * Found by signing into the phone as the demo agency. The menu was
 * headed:
 *
 *     RESORT
 *     Sky Eco Resort
 *
 * Sky Eco is somebody else's business. The agency does not work there;
 * it is one of four resorts this agency is approved to sell, and the
 * session had picked the first of them because `me.resorts` is the same
 * field for both kinds of person and means two different things.
 *
 * For resort staff it is "where I work" and there is exactly one that
 * matters. For an agency it is "who I may sell", and calling the first
 * entry RESORT at the top of their own menu tells an agency owner they
 * are staff at a resort they have never visited.
 *
 * `consoleGate` in `@rh/shared` has said AGENT is resortless since the
 * day it was written — that is why an agent reaches the console with no
 * resort at all. This screen never got the message.
 *
 * `me.account` is the agency, and its comment already says so: "the
 * account this person signs in for — set for an agency's people". So
 * the header asks who is signed in rather than what is selected.
 */
import { render, waitFor } from "@testing-library/react-native";
import type { Me, Resort } from "@rh/shared";

let mockMe: Me | null = null;
let mockResort: Resort | null = null;
let mockRole = "RESORT_ADMIN";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: mockMe,
    role: mockRole,
    loading: false,
    activeResort: mockResort,
    can: () => true,
    features: [],
    logout: jest.fn(),
  }),
  /*
   * The footer asks the platform which build is current. Answering
   * "never" rather than leaving it undefined: this screen's subject is
   * who you are, and an update line appearing in the middle of it would
   * make these assertions about something else.
   */
  client: { appRelease: () => new Promise(() => {}) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const More = require("../app/(tabs)/more").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const resort = (name: string) => ({ id: 7, name, timezone: "Asia/Dhaka" }) as unknown as Resort;

const open = async () => render(<Harness><More /></Harness>);

beforeEach(() => {
  mockRole = "RESORT_ADMIN";
  mockResort = resort("Demo Bay Resort");
  mockMe = { id: 1, name: "Rahim", phone: "0181", role: "RESORT_ADMIN", resorts: [] } as unknown as Me;
});

describe("resort staff", () => {
  it("is told which resort they are looking at", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Bay Resort")).toBeTruthy());
    expect(r.getByText("RESORT")).toBeTruthy();
  });
});

describe("an agency", () => {
  beforeEach(() => {
    mockRole = "AGENT";
    // the session picks the first resort the agency may sell; that is not
    // the agency's own resort, because an agency has none
    mockResort = resort("Sky Eco Resort");
    mockMe = {
      id: 2,
      name: "Demo Agent",
      phone: "0170",
      role: "AGENT",
      account: { id: 6, name: "Demo Travels", kind: "AGENCY", status: "active", suspendedReason: null },
      resorts: [],
    } as unknown as Me;
  });

  it("is not told it works at somebody else's resort", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Agent")).toBeTruthy());
    expect(r.queryByText("RESORT")).toBeNull();
    expect(r.queryByText("Sky Eco Resort")).toBeNull();
  });

  it("is named for the agency it signs in for", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Travels")).toBeTruthy());
    expect(r.getByText("AGENCY")).toBeTruthy();
  });

  /** An agency whose account the payload did not carry says nothing. */
  it("says nothing rather than guessing when there is no account", async () => {
    mockMe = { id: 2, name: "Demo Agent", phone: "0170", role: "AGENT", resorts: [] } as unknown as Me;
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Agent")).toBeTruthy());
    expect(r.queryByText("RESORT")).toBeNull();
    expect(r.queryByText("AGENCY")).toBeNull();
  });
});
