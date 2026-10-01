/**
 * Every setting the console has, on the phone.
 *
 * The owner, 2026-10-02: "jahai web e ache, tahai app e thakbe" — the
 * subscription, the website, the API keys, agent access, discounts, messages,
 * the activity log and the data exports all "stayed on the desk" until then.
 * Each is driven here by the act that matters most on it.
 */
import { Alert, Share } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mock = {
  agencies: jest.fn(),
  setAgencyTerms: jest.fn(),
  commission: jest.fn(),
  setCommission: jest.fn(),
  inviteAgency: jest.fn(),
  discounts: jest.fn(),
  createDiscount: jest.fn(),
  updateDiscount: jest.fn(),
  rooms: jest.fn(),
  get: jest.fn(),
  keys: jest.fn(),
  createKey: jest.fn(),
  revokeKey: jest.fn(),
  hooks: jest.fn(),
  deliveries: jest.fn(),
  templates: jest.fn(),
  saveTemplate: jest.fn(),
  activity: jest.fn(),
  subscription: jest.fn(),
  changePlan: jest.fn(),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: () => true,
    features: ["agents"],
  }),
  client: {
    resort: {
      agencies: (...a: unknown[]) => mock.agencies(...a),
      setAgencyTerms: (...a: unknown[]) => mock.setAgencyTerms(...a),
      commission: (...a: unknown[]) => mock.commission(...a),
      setCommission: (...a: unknown[]) => mock.setCommission(...a),
      inviteAgency: (...a: unknown[]) => mock.inviteAgency(...a),
      get: (...a: unknown[]) => mock.get(...a),
      activity: (...a: unknown[]) => mock.activity(...a),
      deleteActivity: jest.fn(),
      subscription: (...a: unknown[]) => mock.subscription(...a),
      changePlan: (...a: unknown[]) => mock.changePlan(...a),
    },
    discounts: {
      list: (...a: unknown[]) => mock.discounts(...a),
      create: (...a: unknown[]) => mock.createDiscount(...a),
      update: (...a: unknown[]) => mock.updateDiscount(...a),
    },
    rooms: { list: (...a: unknown[]) => mock.rooms(...a) },
    apiKeys: {
      list: (...a: unknown[]) => mock.keys(...a),
      create: (...a: unknown[]) => mock.createKey(...a),
      revoke: (...a: unknown[]) => mock.revokeKey(...a),
    },
    webhooks: {
      list: (...a: unknown[]) => mock.hooks(...a),
      deliveries: (...a: unknown[]) => mock.deliveries(...a),
      add: jest.fn(),
      remove: jest.fn(),
      retry: jest.fn(),
    },
    templates: {
      list: (...a: unknown[]) => mock.templates(...a),
      save: (...a: unknown[]) => mock.saveTemplate(...a),
      reset: jest.fn(),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const Agencies = require("../app/(tabs)/(desk)/settings/agencies").default;
const Discounts = require("../app/(tabs)/(desk)/settings/discounts").default;
const Api = require("../app/(tabs)/(desk)/settings/api").default;
const Messages = require("../app/(tabs)/(desk)/settings/messages").default;
const Activity = require("../app/(tabs)/(desk)/settings/activity").default;
const Subscription = require("../app/(tabs)/(desk)/settings/subscription").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

jest.setTimeout(30_000);

const agree = () =>
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });

beforeEach(() => {
  jest.restoreAllMocks();
  for (const m of Object.values(mock)) m.mockReset().mockResolvedValue({});
  mock.agencies.mockResolvedValue([
    { accountId: 7, name: "Sea Breeze Travels", status: "active", blocked: false, commissionKind: "PERCENT", commissionRate: null },
  ]);
  mock.commission.mockResolvedValue({ kind: "PERCENT", rate: 10 });
  mock.discounts.mockResolvedValue([
    { id: 1, name: "Monsoon", scope: "RESORT", kind: "PERCENT", value: 10, validFrom: null, validTo: null, active: true, roomId: null, roomTypeId: null },
  ]);
  mock.rooms.mockResolvedValue([]);
  mock.get.mockResolvedValue({ id: 3, name: "Demo Bay Resort", roomTypes: [] });
  mock.keys.mockResolvedValue([]);
  mock.hooks.mockResolvedValue([]);
  mock.deliveries.mockResolvedValue([]);
  mock.createKey.mockResolvedValue({ id: "k1", secret: "rm_live_abc_SECRET" });
  mock.templates.mockResolvedValue([{ name: "booking_confirmed", body: "Hello {guest}", custom: false, placeholders: ["guest", "code"] }]);
  mock.activity.mockResolvedValue([
    { id: "1", action: "booking.create", entity: "booking", entityId: "41", createdAt: "2026-10-01T05:00:00.000Z", actor: { name: "Karim", role: "FRONT_DESK" } },
  ]);
  mock.subscription.mockResolvedValue({
    plan: "STARTER",
    planLabel: "Starter",
    status: "ACTIVE",
    fee: 2500,
    feePerMonth: 2500,
    scheduleId: 1,
    scheduleLabel: "Monthly",
    renewsAt: "2026-11-01T00:00:00.000Z",
    trialEndsAt: null,
    pendingPlan: null,
    pendingPlanLabel: null,
    pendingScheduleId: null,
    pendingScheduleLabel: null,
    usage: { rooms: 8, resorts: 1 },
    limits: { maxRooms: 10, maxResorts: 1 },
    outstanding: { count: 0, amount: 0 },
    bills: [],
    plans: [
      { name: "STARTER", label: "Starter", direction: "current", maxRooms: 10, maxResorts: 1, blurb: null, schedules: [{ id: 1, label: "Monthly", perMonth: 2500, phases: [{ months: 1, price: 2500 }] }] },
      { name: "GROWTH", label: "Growth", direction: "upgrade", maxRooms: 40, maxResorts: 2, blurb: null, schedules: [{ id: 2, label: "Monthly", perMonth: 5000, phases: [{ months: 1, price: 5000 }] }] },
    ],
  });
  mock.changePlan.mockResolvedValue({ effective: "now", charged: 1200, planLabel: "Growth", effectiveFrom: null });
});

const open = (Screen: () => React.ReactElement) =>
  render(
    <Harness>
      <Screen />
    </Harness>,
  );

describe("agent access", () => {
  it("blocks an agency", async () => {
    const r = await open(Agencies);
    await waitFor(() => expect(r.getByText("Sea Breeze Travels")).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Block Sea Breeze Travels" }));
    await waitFor(() => expect(mock.setAgencyTerms).toHaveBeenCalledWith(3, 7, { blocked: true }));
  });

  it("saves the standard commission", async () => {
    const r = await open(Agencies);
    await waitFor(() => expect(r.getByDisplayValue("10")).toBeTruthy());
    await fireEvent.changeText(r.getByDisplayValue("10"), "12");
    await fireEvent.press(r.getByRole("button", { name: "Save commission" }));
    await waitFor(() => expect(mock.setCommission).toHaveBeenCalledWith(3, { kind: "PERCENT", rate: 12 }));
  });
});

describe("discounts", () => {
  it("draws each offer as a coupon, and makes a new one", async () => {
    const r = await open(Discounts);
    await waitFor(() => expect(r.getByLabelText("Monsoon, 10% off, on")).toBeTruthy());
    await fireEvent.changeText(r.getByPlaceholderText("Opening offer"), "Opening");
    await fireEvent.press(r.getByRole("button", { name: "Create the offer" }));
    await waitFor(() =>
      expect(mock.createDiscount).toHaveBeenCalledWith(3, expect.objectContaining({ scope: "RESORT", name: "Opening", kind: "PERCENT", value: 5 })),
    );
  });
});

describe("API keys", () => {
  it("shows a new key's secret once, to share", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    const r = await open(Api);
    await waitFor(() => expect(r.getByPlaceholderText("Our website")).toBeTruthy());
    await fireEvent.changeText(r.getByPlaceholderText("Our website"), "Our site");
    await fireEvent.press(r.getByRole("button", { name: "Make a key" }));
    await waitFor(() => expect(r.getByText("rm_live_abc_SECRET")).toBeTruthy());
    expect(mock.createKey).toHaveBeenCalledWith(3, "Our site", ["read"]);
    await fireEvent.press(r.getByRole("button", { name: "Share or copy it" }));
    expect(share).toHaveBeenCalledWith({ message: "rm_live_abc_SECRET" });
  });
});

describe("messages", () => {
  it("saves the resort's own wording", async () => {
    const r = await open(Messages);
    await waitFor(() => expect(r.getByLabelText("Booking confirmed")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Booking confirmed"), "Welcome {guest}");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mock.saveTemplate).toHaveBeenCalledWith(3, "booking_confirmed", "Welcome {guest}"));
  });
});

describe("the activity log", () => {
  it("says who did what", async () => {
    const r = await open(Activity);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    expect(r.getByText(/booking · create/)).toBeTruthy();
  });
});

describe("the subscription", () => {
  it("moves up a plan, after saying what it costs", async () => {
    agree();
    const r = await open(Subscription);
    await waitFor(() => expect(r.getByRole("button", { name: "Move up" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(mock.changePlan).toHaveBeenCalledWith(3, "GROWTH", 2));
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining("Growth"), expect.any(String), expect.any(Array));
  });
});
