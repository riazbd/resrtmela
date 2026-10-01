/**
 * Payroll on the phone: an advance as its own act, and the people on it.
 *
 * The owner asked for it in three words — "Adv pay ta add hbe apps e" — and
 * the screen they were looking at said why. It read "Nobody on payroll", with
 * a footnote sending them to the desk to add anybody, and the one thing it
 * could do was hand over an amount under a hint promising that "less than what
 * is left is an advance". It was not: the payment went up with no `kind`, the
 * server defaults that to SALARY, and the console's sheet then listed the
 * cook's 2,000 on the 8th as salary.
 *
 * So, the console's two acts, on both the resort's and the agency's payroll:
 *
 *   - **Pay** settles the month. No amount — the server works out what is
 *     left, which after a 6,000 advance on an 18,000 wage is 12,000.
 *   - **Advance** needs an amount, says so when it has none, and can be given
 *     on a month already settled — money against the next one is a real thing.
 *
 * And the parts that made either of them usable: every payment listed with
 * its kind and an undo, and staff added, edited and taken off payroll here
 * rather than "on the desk".
 */
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyEmployee, Employee, PayrollSheet } from "@rh/shared";

const mockSheet = jest.fn();
const mockPay = jest.fn();
const mockUnpay = jest.fn();
const mockEmployees = jest.fn();
const mockAdd = jest.fn();
const mockEdit = jest.fn();
const mockRemove = jest.fn();
const mockOptions = jest.fn();
const mockAgentSheet = jest.fn();
const mockAgentPay = jest.fn();
const mockAgentUnpay = jest.fn();
const mockAgentEmployees = jest.fn();
const mockAgentAdd = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "RESORT_ADMIN" },
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    payroll: {
      sheet: (...a: unknown[]) => mockSheet(...a),
      pay: (...a: unknown[]) => mockPay(...a),
      unpay: (...a: unknown[]) => mockUnpay(...a),
      employees: (...a: unknown[]) => mockEmployees(...a),
      addEmployee: (...a: unknown[]) => mockAdd(...a),
      updateEmployee: (...a: unknown[]) => mockEdit(...a),
      removeEmployee: (...a: unknown[]) => mockRemove(...a),
    },
    options: { list: (...a: unknown[]) => mockOptions(...a) },
    agent: {
      payroll: {
        sheet: (...a: unknown[]) => mockAgentSheet(...a),
        pay: (...a: unknown[]) => mockAgentPay(...a),
        undoPay: (...a: unknown[]) => mockAgentUnpay(...a),
        employees: (...a: unknown[]) => mockAgentEmployees(...a),
        addEmployee: (...a: unknown[]) => mockAgentAdd(...a),
        editEmployee: jest.fn(),
        removeEmployee: jest.fn(),
      },
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const PayrollScreen = require("../app/(tabs)/(desk)/payroll").default;
const AgentPayrollScreen = require("../app/(tabs)/(desk)/agent/payroll").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const sheet = (over: Partial<PayrollSheet> = {}): PayrollSheet => ({
  month: "2026-09",
  rows: [
    {
      employeeId: 4,
      name: "Jamal Uddin",
      designation: "Cook",
      salary: 18000,
      paid: 6000,
      advance: 6000,
      remaining: 12000,
      settled: false,
      payments: [
        { id: 31, kind: "ADVANCE", amount: 6000, method: "CASH", note: "Eid", paidAt: "2026-09-08T05:00:00.000Z" },
      ],
    },
    {
      employeeId: 5,
      name: "Shefali Begum",
      designation: "Housekeeping",
      salary: 14000,
      paid: 14000,
      advance: 0,
      remaining: 0,
      settled: true,
      payments: [
        { id: 32, kind: "SALARY", amount: 14000, method: "BKASH", note: null, paidAt: "2026-09-30T05:00:00.000Z" },
      ],
    },
  ],
  totals: { expected: 32000, paid: 20000, advance: 6000, remaining: 12000, headcount: 2, settledCount: 1 },
  ...over,
});

const staff = (over: Partial<Employee> = {}): Employee => ({
  id: 4,
  name: "Jamal Uddin",
  phone: "01711000000",
  designation: "Cook",
  salary: 18000,
  joinDate: null,
  active: true,
  payments: [],
  ...over,
});

/** Says yes to whatever is asked, by pressing the button that does the thing. */
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
  for (const m of [mockPay, mockUnpay, mockAdd, mockEdit, mockRemove, mockAgentPay, mockAgentUnpay, mockAgentAdd]) {
    m.mockReset().mockResolvedValue({ id: 1 });
  }
  mockEmployees.mockReset().mockResolvedValue([staff()]);
  mockAgentEmployees.mockReset().mockResolvedValue([
    { id: 4, name: "Jamal Uddin", phone: null, designation: "Cook", salary: 18000, joinDate: null, active: true, recent: [] },
  ] as AgencyEmployee[]);
  mockOptions.mockReset().mockResolvedValue([
    { id: 1, code: "CASH", label: "Cash", active: true, sortOrder: 0 },
    { id: 2, code: "BKASH", label: "bKash", active: true, sortOrder: 1 },
  ]);
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

async function openJamal(Screen: unknown = PayrollScreen) {
  const r = await open(Screen);
  await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, salary/)).toBeTruthy());
  await fireEvent.press(r.getByLabelText(/^Jamal Uddin, salary/));
  return r;
}

describe("an advance on the resort's payroll", () => {
  it("puts what was handed out early beside the wage bill", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText("Advances: ৳6,000")).toBeTruthy());
  });

  it("records an advance as an advance, with its amount and what it was for", async () => {
    const r = await openJamal();
    await fireEvent.press(r.getByRole("button", { name: "Advance" }));
    await fireEvent.changeText(r.getByLabelText("How much?"), "2000");
    await fireEvent.press(r.getByRole("button", { name: "bKash" }));
    await fireEvent.changeText(r.getByLabelText("What for?"), "Medicine");
    await fireEvent.press(r.getByRole("button", { name: "Give ৳2,000 in advance" }));
    await waitFor(() =>
      expect(mockPay).toHaveBeenCalledWith(3, 4, {
        month: "2026-09",
        kind: "ADVANCE",
        amount: 2000,
        method: "BKASH",
        note: "Medicine",
      }),
    );
  });

  it("asks how much rather than inventing a number", async () => {
    const r = await openJamal();
    await fireEvent.press(r.getByRole("button", { name: "Advance" }));
    await fireEvent.press(r.getByRole("button", { name: /in advance$/ }));
    await waitFor(() => expect(r.getByText("How much is the advance?")).toBeTruthy());
    expect(mockPay).not.toHaveBeenCalled();
  });

  /** After a 6,000 advance on 18,000, settling is 12,000 — the server's sum. */
  it("settles the month with no amount, so the server pays what is left", async () => {
    const r = await openJamal();
    await fireEvent.press(r.getByRole("button", { name: "Pay ৳12,000" }));
    await waitFor(() =>
      expect(mockPay).toHaveBeenCalledWith(3, 4, { month: "2026-09", kind: "SALARY", method: "CASH" }),
    );
  });

  it("offers an advance on a settled month, but nothing left to pay", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Shefali Begum, salary/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Shefali Begum, salary/));
    await waitFor(() => expect(r.getByRole("button", { name: "Advance" })).toBeTruthy());
    expect(r.queryByRole("button", { name: /^Pay ৳/ })).toBeNull();
  });

  it("lists every payment with what kind it was", async () => {
    const r = await openJamal();
    await waitFor(() => expect(r.getByText("Advance · ৳6,000")).toBeTruthy());
    expect(r.getByText(/08 Sep · Cash · Eid/)).toBeTruthy();
  });

  it("takes a payment back once somebody says so", async () => {
    const asked = agree();
    const r = await openJamal();
    await fireEvent.press(r.getByRole("button", { name: "Undo the ৳6,000 advance of 08 Sep" }));
    expect(asked).toHaveBeenCalled();
    await waitFor(() => expect(mockUnpay).toHaveBeenCalledWith(31));
  });

  it("shows somebody who may only look the payments, and nothing to press", async () => {
    mockCan = (k) => k !== "payroll.manage";
    const r = await openJamal();
    await waitFor(() => expect(r.getByText("Advance · ৳6,000")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Advance" })).toBeNull();
    expect(r.queryByRole("button", { name: /^Pay ৳/ })).toBeNull();
    expect(r.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });
});

describe("the people on the resort's payroll", () => {
  it("adds somebody, which is what an empty month needs", async () => {
    mockSheet.mockResolvedValue(sheet({ rows: [] }));
    mockEmployees.mockResolvedValue([]);
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add staff" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add staff" }));
    await fireEvent.changeText(r.getByLabelText("Name"), "Rahim");
    await fireEvent.changeText(r.getByLabelText("Designation"), "Guard");
    await fireEvent.changeText(r.getByLabelText("Monthly salary"), "15000");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockAdd).toHaveBeenCalledWith(3, { name: "Rahim", phone: "", designation: "Guard", salary: 15000 }),
    );
  });

  it("changes a salary", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, Cook, ৳18,000 a month/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Jamal Uddin, Cook, ৳18,000 a month/));
    await fireEvent.changeText(r.getByLabelText("Monthly salary"), "20000");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith(3, 4, {
        name: "Jamal Uddin",
        phone: "01711000000",
        designation: "Cook",
        salary: 20000,
      }),
    );
  });

  it("takes somebody off payroll once asked", async () => {
    const asked = agree();
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, Cook, ৳18,000 a month/)).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Jamal Uddin, Cook, ৳18,000 a month/));
    await fireEvent.press(r.getByRole("button", { name: "Take off payroll" }));
    expect(asked).toHaveBeenCalled();
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(3, 4));
  });

  it("no longer sends anybody to the desk", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, salary/)).toBeTruthy());
    expect(r.queryByText(/on the desk/i)).toBeNull();
  });

  it("lets somebody who may only look see the staff, not change them", async () => {
    mockCan = (k) => k !== "payroll.manage";
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByLabelText(/^Jamal Uddin, Cook, ৳18,000 a month/)).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add staff" })).toBeNull();
  });
});

describe("the agency's payroll, the same two acts", () => {
  it("records an advance as an advance", async () => {
    const r = await openJamal(AgentPayrollScreen);
    await fireEvent.press(r.getByRole("button", { name: "Advance" }));
    await fireEvent.changeText(r.getByLabelText("How much?"), "3000");
    await fireEvent.press(r.getByRole("button", { name: "Give ৳3,000 in advance" }));
    await waitFor(() =>
      expect(mockAgentPay).toHaveBeenCalledWith(4, { month: "2026-09", kind: "ADVANCE", amount: 3000, method: "CASH" }),
    );
  });

  it("settles what is left", async () => {
    const r = await openJamal(AgentPayrollScreen);
    await fireEvent.press(r.getByRole("button", { name: "Pay ৳12,000" }));
    await waitFor(() =>
      expect(mockAgentPay).toHaveBeenCalledWith(4, { month: "2026-09", kind: "SALARY", method: "CASH" }),
    );
  });

  it("undoes a payment against the agency's route", async () => {
    agree();
    const r = await openJamal(AgentPayrollScreen);
    await fireEvent.press(r.getByRole("button", { name: "Undo the ৳6,000 advance of 08 Sep" }));
    await waitFor(() => expect(mockAgentUnpay).toHaveBeenCalledWith(31));
  });

  it("adds somebody to the agency", async () => {
    const r = await open(AgentPayrollScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add staff" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add staff" }));
    await fireEvent.changeText(r.getByLabelText("Name"), "Rahim");
    await fireEvent.changeText(r.getByLabelText("Monthly salary"), "15000");
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockAgentAdd).toHaveBeenCalledWith({ name: "Rahim", phone: "", designation: "", salary: 15000 }),
    );
  });
});
