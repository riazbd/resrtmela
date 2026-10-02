/**
 * Activities and the restaurant's menu, set up from the phone.
 *
 * Both screens said their setup "stays on the desk" until 2026-10-02. The
 * owner: whatever the console has, the app has. So a manager adds an
 * activity with its week and makes its slots, puts a dish on the menu and
 * collects on an unpaid bill — here, as on the console.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mock = {
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setSchedules: jest.fn(),
  generate: jest.fn(),
  slots: jest.fn(),
  options: jest.fn(),
  bills: jest.fn(),
  packages: jest.fn(),
  createPackage: jest.fn(),
  payBill: jest.fn(),
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
    isManagement: true,
  }),
  client: {
    activities: {
      list: (...a: unknown[]) => mock.list(...a),
      create: (...a: unknown[]) => mock.create(...a),
      update: (...a: unknown[]) => mock.update(...a),
      setSchedules: (...a: unknown[]) => mock.setSchedules(...a),
      generate: (...a: unknown[]) => mock.generate(...a),
      slots: (...a: unknown[]) => mock.slots(...a),
      removeSlot: jest.fn(),
    },
    options: { list: (...a: unknown[]) => mock.options(...a) },
    fb: {
      bills: (...a: unknown[]) => mock.bills(...a),
      packages: (...a: unknown[]) => mock.packages(...a),
      createPackage: (...a: unknown[]) => mock.createPackage(...a),
      removePackage: jest.fn(),
      payBill: (...a: unknown[]) => mock.payBill(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const Activities = require("../app/(tabs)/(desk)/activities").default;
const Restaurant = require("../app/(tabs)/(desk)/fb/index").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

jest.setTimeout(30_000);

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  for (const m of Object.values(mock)) m.mockReset().mockResolvedValue({});
  mock.list.mockResolvedValue([
    {
      id: 5,
      name: "Sunset cruise",
      category: "WATER",
      basePrice: 1200,
      durationMin: 90,
      minPerSlot: 2,
      maxPerSlot: 12,
      description: null,
      active: true,
      schedules: [{ weekday: 5, startTime: "17:00", endTime: "18:30", capacity: 12, active: true }],
      upcomingSlots: 0,
      nextSlot: null,
    },
  ]);
  mock.options.mockResolvedValue([
    { id: 1, code: "WATER", label: "On the water", active: true, sortOrder: 0 },
    { id: 2, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
  ]);
  mock.create.mockResolvedValue({ id: 9 });
  mock.generate.mockResolvedValue({ created: 4, matched: 4, totalSlots: 4 });
  mock.slots.mockResolvedValue([]);
  mock.bills.mockResolvedValue({
    rows: [
      { id: 71, code: "FB-0071", bookingId: null, guestName: "Walk-in", method: null, total: 900, due: 900, items: [{ name: "Tea", qty: 3, unitPrice: 300 }] },
    ],
    total: 1,
  });
  mock.packages.mockResolvedValue([{ id: 2, name: "BBQ dinner", price: 1500, items: "rice, chicken", active: true }]);
});

afterEach(() => jest.useRealTimers());

const open = (Screen: () => React.ReactElement) =>
  render(
    <Harness>
      <Screen />
    </Harness>,
  );

describe("activities, set up on the phone", () => {
  it("adds an activity with a weekly time", async () => {
    const r = await open(Activities);
    await waitFor(() => expect(r.getByRole("button", { name: "New activity" })).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "New activity" }));
    await fireEvent.changeText(r.getByPlaceholderText("Kayaking on the lake"), "Kayaking");
    await fireEvent.press(r.getByRole("button", { name: "Add a time" }));
    await fireEvent.press(r.getByRole("button", { name: "Save the activity" }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledWith(3, expect.objectContaining({ name: "Kayaking", category: "WATER" })));
    expect(mock.setSchedules).toHaveBeenCalledWith(9, [{ weekday: 5, startTime: "10:00", endTime: "11:00", capacity: 10, active: true }]);
  });

  it("makes slots from the week, for the days asked", async () => {
    const r = await open(Activities);
    await waitFor(() => expect(r.getByLabelText(/^Next none/)).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByLabelText(/^Next none/));
    await fireEvent.press(r.getByRole("button", { name: "Make the slots" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledWith(5, "2026-09-20", "2026-10-04"));
    await waitFor(() => expect(r.getByText(/Made 4 slots/)).toBeTruthy());
  });

  it("takes an activity off offer", async () => {
    const r = await open(Activities);
    await waitFor(() => expect(r.getByRole("button", { name: "Take off offer" })).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Take off offer" }));
    await waitFor(() => expect(mock.update).toHaveBeenCalledWith(5, { active: false }));
  });
});

describe("the restaurant's menu and money, on the phone", () => {
  it("puts a dish on the menu", async () => {
    const r = await open(Restaurant);
    await waitFor(() => expect(r.getByLabelText(/^BBQ dinner, ৳1,500/)).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.changeText(r.getByPlaceholderText("BBQ dinner for two"), "Khichuri");
    await fireEvent.changeText(r.getByLabelText("Price"), "350");
    await fireEvent.press(r.getByRole("button", { name: "Put it on the menu" }));
    await waitFor(() => expect(mock.createPackage).toHaveBeenCalledWith(3, { name: "Khichuri", price: 350, items: undefined }));
  });

  it("collects on an unpaid bill", async () => {
    const r = await open(Restaurant);
    await waitFor(() => expect(r.getByRole("button", { name: "Collect on FB-0071" })).toBeTruthy(), { timeout: 15_000 });
    await fireEvent.press(r.getByRole("button", { name: "Collect on FB-0071" }));
    await fireEvent.press(r.getByRole("button", { name: "Collect ৳900" }));
    await waitFor(() => expect(mock.payBill).toHaveBeenCalledWith(71, { amount: 900, method: "CASH" }));
  });
});
