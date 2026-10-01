/**
 * Payroll on the phone: who is on it, what they get, how it connects to the
 * app's logins — and the year, in pictures.
 *
 * The owner, 2026-10-02: "kar sathe kar connection, ke payroll e ashbe, ke
 * ashbe na, ki pabe ki pabe na, kichui bujha jay na … khali text ar number."
 * The screen said Due / Advances / Paid / Left and a list of names. Now each
 * row says what the month is worth to that person and why, the people are
 * shown beside the logins, and a year view draws who was paid when.
 *
 * Both owners' screens are driven: the resort's and the agency's are one
 * screen with two sets of calls.
 */
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PayrollPeople, PayrollSheet, PayrollYear } from "@rh/shared";

const mockSheet = jest.fn();
const mockPay = jest.fn();
const mockUnpay = jest.fn();
const mockAdjust = jest.fn();
const mockYear = jest.fn();
const mockPeople = jest.fn();
const mockAdd = jest.fn();
const mockEdit = jest.fn();
const mockRemove = jest.fn();
const mockOptions = jest.fn();
const mockAgentSheet = jest.fn();
const mockAgentPay = jest.fn();
const mockAgentPeople = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-print", () => ({ printAsync: jest.fn() }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "RESORT_ADMIN", account: { name: "Sea Breeze Travels" } },
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    payroll: {
      sheet: (...a: unknown[]) => mockSheet(...a),
      pay: (...a: unknown[]) => mockPay(...a),
      unpay: (...a: unknown[]) => mockUnpay(...a),
      adjust: (...a: unknown[]) => mockAdjust(...a),
      unadjust: jest.fn(),
      year: (...a: unknown[]) => mockYear(...a),
      people: (...a: unknown[]) => mockPeople(...a),
      addEmployee: (...a: unknown[]) => mockAdd(...a),
      updateEmployee: (...a: unknown[]) => mockEdit(...a),
      removeEmployee: (...a: unknown[]) => mockRemove(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
    agent: {
      payroll: {
        sheet: (...a: unknown[]) => mockAgentSheet(...a),
        pay: (...a: unknown[]) => mockAgentPay(...a),
        undoPay: jest.fn(),
        adjust: jest.fn(),
        unadjust: jest.fn(),
        year: jest.fn(),
        people: (...a: unknown[]) => mockAgentPeople(...a),
        addEmployee: jest.fn(),
        editEmployee: jest.fn(),
        removeEmployee: jest.fn(),
      },
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const PayrollRoute = require("../app/(tabs)/(desk)/payroll").default;
const AgentPayrollRoute = require("../app/(tabs)/(desk)/agent/payroll").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

type SheetRow = PayrollSheet["rows"][number];

const row = (over: Partial<SheetRow>): SheetRow => ({
  employeeId: 4,
  name: "Jamal Uddin",
  designation: "Cook",
  phone: null,
  joinDate: null,
  leftDate: null,
  login: null,
  salary: 18000,
  days: 30,
  daysInMonth: 30,
  base: 18000,
  bonus: 0,
  deduction: 0,
  due: 18000,
  paid: 6000,
  advance: 6000,
  aheadUsed: 0,
  over: 0,
  remaining: 12000,
  state: "PART_PAID",
  settled: false,
  arrears: 0,
  payments: [{ id: 31, kind: "ADVANCE", amount: 6000, method: "CASH", note: "Eid", paidAt: "2026-09-08T05:00:00.000Z" }],
  adjustments: [],
  ...over,
});

const sheet = (): PayrollSheet => ({
  month: "2026-09",
  rows: [
    row({}),
    row({
      employeeId: 5,
      name: "Shirin Akter",
      designation: "Front desk",
      login: { userId: 77, name: "Shirin", role: "Front desk", status: "active" },
      salary: 15000,
      joinDate: "2026-09-16",
      days: 15,
      base: 7500,
      bonus: 1000,
      due: 8500,
      paid: 0,
      advance: 0,
      remaining: 8500,
      state: "UNPAID",
      arrears: 4000,
      payments: [],
      adjustments: [{ id: 51, kind: "BONUS", amount: 1000, note: "Puja", createdAt: "2026-09-20T05:00:00.000Z" }],
    }),
  ],
  totals: {
    expected: 26500,
    paid: 6000,
    advance: 6000,
    remaining: 20500,
    headcount: 2,
    settledCount: 0,
    bonus: 1000,
    deduction: 0,
    arrears: 4000,
  },
});

const zeroCell = (month: string) => ({ month, state: "NOT_ON_PAYROLL", due: 0, paid: 0, advance: 0, bonus: 0, deduction: 0, remaining: 0 });
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

const year = (): PayrollYear => ({
  year: 2026,
  months,
  current: "2026-09",
  people: [
    {
      employeeId: 4,
      name: "Jamal Uddin",
      designation: "Cook",
      salary: 18000,
      active: true,
      login: null,
      cells: months.map((m) =>
        m === "2026-08"
          ? { month: m, state: "SETTLED", due: 18000, paid: 18000, advance: 0, bonus: 0, deduction: 0, remaining: 0 }
          : m === "2026-09"
            ? { month: m, state: "PART_PAID", due: 18000, paid: 6000, advance: 6000, bonus: 0, deduction: 0, remaining: 12000 }
            : zeroCell(m),
      ),
      totals: { due: 36000, paid: 24000, advance: 6000, bonus: 0, deduction: 0, remaining: 12000 },
    },
  ],
  byMonth: months.map((m) => ({
    month: m,
    due: m === "2026-08" || m === "2026-09" ? 18000 : 0,
    paid: m === "2026-08" ? 18000 : m === "2026-09" ? 6000 : 0,
    advance: m === "2026-09" ? 6000 : 0,
    bonus: 0,
    deduction: 0,
    remaining: m === "2026-09" ? 12000 : 0,
    headcount: m === "2026-08" || m === "2026-09" ? 1 : 0,
  })),
  totals: { due: 36000, paid: 24000, advance: 6000, bonus: 0, deduction: 0, remaining: 12000, upcoming: 0 },
  byDesignation: [{ designation: "Cook", people: 1, salary: 18000 }],
});

const people = (): PayrollPeople => ({
  people: [
    {
      id: 4,
      name: "Jamal Uddin",
      phone: null,
      designation: "Cook",
      salary: 18000,
      joinDate: null,
      leftDate: null,
      active: true,
      login: null,
      since: "2026-06",
    },
    {
      id: 5,
      name: "Shirin Akter",
      phone: null,
      designation: "Front desk",
      salary: 15000,
      joinDate: "2026-09-16",
      leftDate: null,
      active: true,
      login: { userId: 77, name: "Shirin", role: "Front desk", status: "active" },
      since: "2026-09",
    },
  ],
  team: [{ userId: 78, name: "Rana Hossain", phone: "01711000001", role: "Housekeeping" }],
});

const agree = () =>
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
  jest.restoreAllMocks();
  mockCan = () => true;
  for (const m of [mockSheet, mockAgentSheet]) m.mockReset().mockResolvedValue(sheet());
  mockYear.mockReset().mockResolvedValue(year());
  for (const m of [mockPeople, mockAgentPeople]) m.mockReset().mockResolvedValue(people());
  for (const m of [mockPay, mockUnpay, mockAdjust, mockAdd, mockEdit, mockRemove, mockAgentPay]) {
    m.mockReset().mockResolvedValue({ id: 1 });
  }
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "BKASH", label: "bKash", active: true, sortOrder: 1 },
  ]);
});

afterEach(() => jest.useRealTimers());

async function open(Screen: () => React.ReactElement) {
  const r = await render(
    <Harness>
      <Screen />
    </Harness>,
  );
  // generous: the first screen of a cold run is still compiling its imports
  await waitFor(() => expect(r.getByText("September 2026")).toBeTruthy(), { timeout: 15_000 });
  return r;
}

const jamal = /^Jamal Uddin, worth ৳18,000/;
const shirin = /^Shirin Akter, worth ৳8,500/;

describe("the month, for everyone", () => {
  it("says what it is worth, what has gone and what is still to pay", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText("The month is worth: ৳26,500")).toBeTruthy());
    expect(r.getByLabelText("Handed over: ৳6,000")).toBeTruthy();
    expect(r.getByLabelText("Still to pay: ৳20,500")).toBeTruthy();
    expect(r.getByText("+ ৳4,000 from earlier months")).toBeTruthy();
  });

  it("says plainly who signs in to the app and who does not", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByText("App login: Shirin · Front desk")).toBeTruthy());
    expect(r.getByText("No app login")).toBeTruthy();
  });

  it("says why a month is worth what it is: the days, the bonus", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(shirin)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(shirin));
    expect(r.getByText("Salary, 15 of 30 days")).toBeTruthy();
    expect(r.getByText("+ ৳1,000")).toBeTruthy();
    expect(r.getByText("Still to pay from earlier months")).toBeTruthy();
  });
});

describe("paying", () => {
  it("settles with what is left, and sends no amount", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    await fireEvent.press(r.getByRole("button", { name: "Pay ৳12,000" }));
    await waitFor(() => expect(mockPay).toHaveBeenCalledWith(3, 4, { month: "2026-09", kind: "SALARY", method: "CASH" }));
  });

  it("asks how much an advance is, then gives it", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    await fireEvent.press(r.getByRole("button", { name: "Advance" }));
    await fireEvent.press(r.getByRole("button", { name: "Give the advance" }));
    expect(r.getByText("Put in the amount.")).toBeTruthy();
    await fireEvent.changeText(r.getByPlaceholderText("0"), "2000");
    await fireEvent.press(r.getByRole("button", { name: "Give the advance · ৳2,000" }));
    await waitFor(() =>
      expect(mockPay).toHaveBeenCalledWith(3, 4, { month: "2026-09", kind: "ADVANCE", amount: 2000, method: "CASH", note: undefined }),
    );
  });

  it("adds a bonus without handing anything over", async () => {
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    await fireEvent.press(r.getByRole("button", { name: "Bonus" }));
    await fireEvent.changeText(r.getByPlaceholderText("0"), "1500");
    await fireEvent.changeText(r.getByPlaceholderText("Medicine, Eid…"), "Eid");
    await fireEvent.press(r.getByRole("button", { name: "Add the bonus · ৳1,500" }));
    await waitFor(() => expect(mockAdjust).toHaveBeenCalledWith(3, 4, { month: "2026-09", kind: "BONUS", amount: 1500, note: "Eid" }));
    expect(mockPay).not.toHaveBeenCalled();
  });

  it("undoes a payment, after asking", async () => {
    agree();
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    await fireEvent.press(r.getByLabelText(/^Undo the ৳6,000 advance/));
    await waitFor(() => expect(mockUnpay).toHaveBeenCalledWith(31));
  });

  it("shows somebody who may only look what was paid, and nothing to press", async () => {
    mockCan = (k) => k !== "payroll.manage";
    const r = await open(PayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    expect(r.getByText("Advance · ৳6,000")).toBeTruthy();
    expect(r.queryByRole("button", { name: "Pay ৳12,000" })).toBeNull();
    expect(r.queryByRole("button", { name: "Bonus" })).toBeNull();
  });
});

describe("the year", () => {
  it("draws who was paid when, and a month opens from it", async () => {
    const r = await open(PayrollRoute);
    await fireEvent.press(r.getByRole("button", { name: "Year" }));
    await waitFor(() => expect(r.getByText("Who was paid when")).toBeTruthy());
    expect(mockYear).toHaveBeenCalledWith(3, 2026);
    expect(r.getByLabelText("Paid out: ৳24,000")).toBeTruthy();
    const august = r.getByLabelText("Jamal Uddin, August 2026: Paid, paid ৳18,000 of ৳18,000");
    await fireEvent.press(august);
    await waitFor(() => expect(mockSheet).toHaveBeenCalledWith(3, "2026-08"));
  });
});

describe("the people, beside the logins", () => {
  it("lists logins nobody has put on payroll, and puts one on with the login linked", async () => {
    const r = await open(PayrollRoute);
    await fireEvent.press(r.getByRole("button", { name: "People" }));
    await waitFor(() => expect(r.getByText("App logins not on payroll (1)")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Put on payroll" }));
    await fireEvent.changeText(r.getByPlaceholderText("0"), "12000");
    await fireEvent.press(r.getAllByRole("button", { name: "Put on payroll" })[0]!);
    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(3, {
        name: "Rana Hossain",
        phone: "01711000001",
        designation: "Housekeeping",
        salary: 12000,
        joinDate: "2026-09-20",
        userId: 78,
      }),
    );
  });

  it("takes somebody off payroll on the day they left", async () => {
    agree();
    const r = await open(PayrollRoute);
    await fireEvent.press(r.getByRole("button", { name: "People" }));
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, ৳18,000 a month/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Jamal Uddin, ৳18,000 a month/));
    await fireEvent.press(r.getByRole("button", { name: "Has left — take off payroll" }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(3, 4, "2026-09-20"));
  });
});

describe("the agency's payroll", () => {
  it("is the same screen, against the agency's calls", async () => {
    const r = await open(AgentPayrollRoute);
    await waitFor(() => expect(r.getByLabelText(jamal)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(jamal));
    await fireEvent.press(r.getByRole("button", { name: "Pay ৳12,000" }));
    await waitFor(() => expect(mockAgentPay).toHaveBeenCalledWith(4, { month: "2026-09", kind: "SALARY", method: "CASH" }));
    expect(mockPay).not.toHaveBeenCalled();
  });
});

describe("how payroll works, on the screen", () => {
  it("says who is on payroll and how logins differ", async () => {
    const r = await open(PayrollRoute);
    await fireEvent.press(r.getByRole("button", { name: "How payroll works" }));
    expect(r.getByText("Who is on payroll")).toBeTruthy();
    expect(r.getByText(/Agents earn commission, not a salary/)).toBeTruthy();
  });
});
