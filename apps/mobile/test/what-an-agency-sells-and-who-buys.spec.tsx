/**
 * The last five of the agent's twelve: tours, guests, team, website, API.
 *
 * All five are read-and-say-where. An agency's tour packages are built
 * line by line with a cost and a price against each; its permission
 * matrix is thirty checkboxes in nine groups; its website has an intro
 * paragraph and a photo order; and an API key is shown once and never
 * again. None of that is one-handed work.
 *
 * What is one-handed is the question each of them answers away from a
 * desk: what do we sell and at what margin, who has travelled with us,
 * who has access, is the site up, and does a key exist. Every absence is
 * named on its own screen, which is the rule phase 2 settled.
 *
 * The one thing that is *not* read-only is revoking a key, and it is
 * here for the reason revoking anything is: the moment you need it, you
 * need it from wherever you are.
 */
import { render, waitFor } from "@testing-library/react-native";
import type {
  AgencyApiKey,
  AgencyGuestRow,
  AgencyRole,
  AgencySite,
  AgencyStaff,
  TourPackageRow,
} from "@rh/shared";

const mockPackages = jest.fn();
const mockGuests = jest.fn();
const mockStaff = jest.fn();
const mockRoles = jest.fn();
const mockSite = jest.fn();
const mockKeys = jest.fn();
const mockRevoke = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "AGENT" },
    loading: false,
    activeResort: null,
    can: () => true,
  }),
  client: {
    agent: {
      tours: { packages: (...a: unknown[]) => mockPackages(...a) },
      guests: (...a: unknown[]) => mockGuests(...a),
      staff: (...a: unknown[]) => mockStaff(...a),
      roles: (...a: unknown[]) => mockRoles(...a),
      site: (...a: unknown[]) => mockSite(...a),
      apiKeys: {
        list: (...a: unknown[]) => mockKeys(...a),
        revoke: (...a: unknown[]) => mockRevoke(...a),
      },
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ToursScreen = require("../app/(tabs)/(desk)/agent/tours").default;
const GuestsScreen = require("../app/(tabs)/(desk)/agent/guests").default;
const TeamScreen = require("../app/(tabs)/(desk)/agent/team").default;
const WebsiteScreen = require("../app/(tabs)/(desk)/agent/website").default;
const ApiScreen = require("../app/(tabs)/(desk)/agent/api").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const open = async (Screen: React.ComponentType) => render(<Harness><Screen /></Harness>);

const pkg = (over: Partial<TourPackageRow> = {}): TourPackageRow => ({
  id: 5,
  name: "Sajek two nights",
  summary: "Jeep, cottage, three meals",
  days: 3,
  nights: 2,
  pax: 4,
  active: true,
  lines: 6,
  totals: { cost: 24000, price: 32000, margin: 8000 },
  ...over,
});

const guest = (over: Partial<AgencyGuestRow> = {}): AgencyGuestRow => ({
  id: 12,
  fullName: "Rafiq Hasan",
  phone: "8801711111111",
  email: null,
  bookings: 3,
  nights: 7,
  spend: 62000,
  lastStay: "2026-09-12",
  resorts: ["Demo Bay Resort", "Sky Eco Resort"],
  ...over,
});

const staff = (over: Partial<AgencyStaff> = {}): AgencyStaff => ({
  id: 31,
  name: "Nusrat",
  phone: "8801722222222",
  email: "nusrat@example.com",
  status: "active",
  agentRoleId: 2,
  createdAt: "2026-02-01T00:00:00.000Z",
  ...over,
});

const role = (over: Partial<AgencyRole> = {}): AgencyRole => ({
  id: 2,
  name: "Counter",
  permissions: ["agent.book", "agent.wallet.view"],
  staff: 1,
  ...over,
});

const site = (over: Partial<AgencySite> = {}): AgencySite => ({
  slug: "demo-travels",
  name: "Demo Travels",
  published: true,
  publishedAt: "2026-08-01T00:00:00.000Z",
  headline: "Hills, done properly",
  intro: null,
  themeColor: null,
  phone: null,
  email: null,
  whatsapp: null,
  address: null,
  facebook: null,
  instagram: null,
  hiddenResortIds: [],
  resorts: [{ id: 3, slug: "demo-bay", name: "Demo Bay Resort", location: "Cox's Bazar" }],
  photos: [],
  storage: { used: 1_200_000, quota: 50_000_000 },
  ...over,
});

const key = (over: Partial<AgencyApiKey> = {}): AgencyApiKey => ({
  id: "7",
  name: "Website",
  prefix: "rm_live_a1b2",
  scopes: ["bookings.read"],
  active: true,
  lastUsedAt: "2026-09-19T08:00:00.000Z",
  createdAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPackages.mockResolvedValue([pkg()]);
  mockGuests.mockResolvedValue({ rows: [guest()], total: 1 });
  mockStaff.mockResolvedValue([staff()]);
  mockRoles.mockResolvedValue([role()]);
  mockSite.mockResolvedValue(site());
  mockKeys.mockResolvedValue([key()]);
});

describe("what the agency sells", () => {
  it("names each package, how long it runs and for how many", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByText("Sajek two nights")).toBeTruthy());
    expect(r.getByText(/3 days, 2 nights/)).toBeTruthy();
    expect(r.getByText(/4 people|4 pax/)).toBeTruthy();
  });

  /** Cost and price are different numbers and the margin is the business. */
  it("shows the margin, not just the price", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByText(/৳32,000/)).toBeTruthy());
    expect(r.getByText(/৳8,000/)).toBeTruthy();
  });

  it("marks a package that is not on sale", async () => {
    mockPackages.mockResolvedValue([pkg({ active: false })]);
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByText(/not on sale|off/i)).toBeTruthy());
  });

  /**
   * This used to assert the screen said building a package happens on
   * the desk. It happens here now (2026-09-21) — the agency reported
   * "can't add any package" — so the sentence to hold is the one the
   * desk-only note was really protecting: **cost against price, and the
   * margin drawn rather than worked out.**
   */
  it("says the margin is the thing to watch", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByText("Sajek two nights")).toBeTruthy());
    expect(r.getByText(/cost and a price/i)).toBeTruthy();
  });
});

describe("who has travelled with the agency", () => {
  it("names each guest, how often, and what they have spent", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.getByText(/3 stays|3 bookings/)).toBeTruthy();
    expect(r.getByText(/৳62,000/)).toBeTruthy();
  });

  it("says which resorts they have been to", async () => {
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByText(/Demo Bay Resort/)).toBeTruthy());
  });

  it("says nobody has travelled yet rather than drawing an empty list", async () => {
    mockGuests.mockResolvedValue({ rows: [], total: 0 });
    const r = await open(GuestsScreen);
    await waitFor(() => expect(r.getByText(/No guests/)).toBeTruthy());
  });
});

describe("who works at the agency", () => {
  it("names each person and the role they hold", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Nusrat")).toBeTruthy());
    // the role is beside the person and again in the roles card below,
    // which is the screen working rather than a duplicate
    expect(r.getAllByText("Counter").length).toBe(2);
  });

  it("says how many permissions a role carries rather than listing thirty", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText(/2 permissions/)).toBeTruthy());
  });

  it("says where the matrix lives", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Nusrat")).toBeTruthy());
    expect(r.getByText(/on the desk/i)).toBeTruthy();
  });
});

describe("the agency's own website", () => {
  it("says whether it is live and at what address", async () => {
    const r = await open(WebsiteScreen);
    await waitFor(() => expect(r.getByText(/Live|Published/i)).toBeTruthy());
    expect(r.getByText(/demo-travels/)).toBeTruthy();
  });

  it("says so plainly when it is not published", async () => {
    mockSite.mockResolvedValue(site({ published: false, publishedAt: null }));
    const r = await open(WebsiteScreen);
    // the stat says it and the warning says it again, deliberately: the
    // second one is what somebody reads when they are wondering why a
    // customer cannot see the site
    await waitFor(() => expect(r.getAllByText(/Not published|nobody can see it/i).length).toBeGreaterThan(1));
  });

  it("says where the pages get written", async () => {
    const r = await open(WebsiteScreen);
    await waitFor(() => expect(r.getByText(/demo-travels/)).toBeTruthy());
    expect(r.getByText(/on the desk/i)).toBeTruthy();
  });
});

describe("the keys the agency's website signs with", () => {
  it("names each key by what can be seen of it", async () => {
    const r = await open(ApiScreen);
    await waitFor(() => expect(r.getByText("Website")).toBeTruthy());
    expect(r.getByText(/rm_live_a1b2/)).toBeTruthy();
  });

  /** The secret is shown once, at creation, and never again. */
  it("does not pretend it can show the secret", async () => {
    const r = await open(ApiScreen);
    await waitFor(() => expect(r.getByText("Website")).toBeTruthy());
    expect(r.getByText(/shown once/i)).toBeTruthy();
  });

  it("offers to revoke one, because that is the thing you need from anywhere", async () => {
    const r = await open(ApiScreen);
    await waitFor(() => expect(r.getByLabelText(/Revoke Website/)).toBeTruthy());
  });

  it("says there is no key rather than drawing an empty list", async () => {
    mockKeys.mockResolvedValue([]);
    const r = await open(ApiScreen);
    await waitFor(() => expect(r.getByText(/No keys/)).toBeTruthy());
  });
});
