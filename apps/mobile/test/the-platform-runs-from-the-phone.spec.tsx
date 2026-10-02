/**
 * The platform, run from the phone.
 *
 * The owner, 2026-10-02: "jahai web e ache, tahai app e thakbe". The console's
 * Plans, Offers, Billing policy and Website CMS tabs were desk-only; each is
 * driven here by the act that matters most on it.
 */
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mock = {
  plans: jest.fn(),
  updatePlan: jest.fn(),
  createPlan: jest.fn(),
  deletePlan: jest.fn(),
  planSchedules: jest.fn(),
  setPlanSchedules: jest.fn(),
  offers: jest.fn(),
  createOffer: jest.fn(),
  settings: jest.fn(),
  updateSettings: jest.fn(),
  runBillingSweep: jest.fn(),
  cms: jest.fn(),
  setCms: jest.fn(),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ me: { name: "Platform Owner" }, can: () => true, features: [] }),
  client: {
    platform: Object.fromEntries(
      [
        "plans",
        "updatePlan",
        "createPlan",
        "deletePlan",
        "planSchedules",
        "setPlanSchedules",
        "offers",
        "createOffer",
        "settings",
        "updateSettings",
        "runBillingSweep",
        "cms",
        "setCms",
      ].map((k) => [k, (...a: unknown[]) => (mock as Record<string, jest.Mock>)[k]!(...a)]),
    ),
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const Plans = require("../app/(tabs)/(desk)/platform/plans").default;
const Offers = require("../app/(tabs)/(desk)/platform/offers").default;
const Policy = require("../app/(tabs)/(desk)/platform/policy").default;
const Cms = require("../app/(tabs)/(desk)/platform/cms").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

jest.setTimeout(30_000);

const monthly = { seq: 1, count: 1, unit: "MONTH", price: 2500, repeats: null };
const starter = {
  id: "p1",
  name: "STARTER",
  label: "Starter",
  schedules: [{ id: 1, label: "Monthly", active: true, phases: [monthly], openingFee: 0, perMonth: 2500 }],
  maxRooms: 10,
  maxResorts: 1,
  maxStaff: 3,
  trialDays: 14,
  features: ["restaurant"],
  blurb: "For small resorts",
  active: true,
  sortOrder: 0,
  highlight: true,
  audience: "RESORT",
};

beforeEach(() => {
  jest.restoreAllMocks();
  for (const m of Object.values(mock)) m.mockReset().mockResolvedValue({});
  mock.plans.mockResolvedValue([starter]);
  mock.planSchedules.mockResolvedValue([{ label: "Monthly", active: true, phases: [{ count: 1, unit: "MONTH", price: 2500, repeats: null }] }]);
  mock.setPlanSchedules.mockImplementation((_n: string, rows: unknown) => Promise.resolve(rows));
  mock.offers.mockResolvedValue([]);
  mock.settings.mockResolvedValue({});
  mock.cms.mockResolvedValue([{ key: "brand.name", value: "Resort Mela" }]);
});

const open = (Screen: () => React.ReactElement) =>
  render(
    <Harness>
      <Screen />
    </Harness>,
  );

describe("plans", () => {
  it("shows what a plan costs and opens, and saves a change", async () => {
    const r = await open(Plans);
    await waitFor(() => expect(r.getByText("Starter")).toBeTruthy(), { timeout: 15_000 });
    expect(r.getByText(/1 of 9 tools/)).toBeTruthy();
    await fireEvent.press(r.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(r.getByDisplayValue("For small resorts")).toBeTruthy());
    await fireEvent.changeText(r.getByDisplayValue("14"), "30");
    await fireEvent.press(r.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mock.updatePlan).toHaveBeenCalledWith("STARTER", expect.objectContaining({ trialDays: 30 })));
  });

  it("adds a step to the price ladder and saves it", async () => {
    const r = await open(Plans);
    await waitFor(() => expect(r.getByText("Starter")).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(r.getByRole("button", { name: "Add a step" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a step" }));
    await fireEvent.press(r.getByRole("button", { name: "Save prices" }));
    await waitFor(() =>
      expect(mock.setPlanSchedules).toHaveBeenCalledWith("STARTER", [
        expect.objectContaining({ label: "Monthly", phases: [expect.objectContaining({ repeats: 1 }), expect.objectContaining({ repeats: null })] }),
      ]),
    );
  });

  it("deletes a plan only after asking", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const r = await open(Plans);
    await waitFor(() => expect(r.getByText("Starter")).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Edit" }));
    await fireEvent.press(r.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mock.deletePlan).toHaveBeenCalledWith("STARTER"));
  });

  it("makes a new agency plan with no room caps", async () => {
    const r = await open(Plans);
    await waitFor(() => expect(r.getByText("Starter")).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "New plan" }));
    await fireEvent.press(r.getByText("Travel agencies"));
    await fireEvent.changeText(r.getByPlaceholderText("SEASON"), "agency_pro");
    await fireEvent.changeText(r.getByPlaceholderText("Season"), "Agency Pro");
    await fireEvent.press(r.getByRole("button", { name: "Create plan" }));
    await waitFor(() =>
      expect(mock.createPlan).toHaveBeenCalledWith(expect.objectContaining({ name: "AGENCY_PRO", label: "Agency Pro", audience: "AGENCY", maxRooms: 0, maxResorts: 0 })),
    );
  });
});

describe("offers", () => {
  it("makes an offer on the shelf's first plan", async () => {
    const r = await open(Offers);
    await waitFor(() => expect(r.getByText("No offers yet")).toBeTruthy(), { timeout: 15_000 });
    await waitFor(() => expect(r.getByText("Starter")).toBeTruthy());
    await fireEvent.changeText(r.getByPlaceholderText("none"), "20");
    await fireEvent.press(r.getByRole("button", { name: "Make the offer" }));
    await waitFor(() => expect(mock.createOffer).toHaveBeenCalledWith(expect.objectContaining({ audience: "RESORT", plan: "STARTER", discountPct: 20, maxUses: 100 })));
  });
});

describe("billing policy", () => {
  it("runs the sweep and says what it did", async () => {
    mock.runBillingSweep.mockResolvedValue({ trialsEnded: 1, duesRaised: 2, duesOverdue: 0, suspended: 0, resumed: 0, notices: 3 });
    const r = await open(Policy);
    await waitFor(() => expect(r.getByRole("button", { name: "Run the sweep now" })).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Run the sweep now" }));
    await waitFor(() => expect(r.getByText(/bills raised 2/)).toBeTruthy());
  });
});

describe("website CMS", () => {
  it("saves the platform's name", async () => {
    const r = await open(Cms);
    await waitFor(() => expect(r.getByDisplayValue("Resort Mela")).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.changeText(r.getByDisplayValue("Resort Mela"), "ResortMela");
    await fireEvent.press(r.getByRole("button", { name: "Save the name" }));
    await waitFor(() => expect(mock.setCms).toHaveBeenCalledWith("brand.name", "ResortMela"));
  });
});
