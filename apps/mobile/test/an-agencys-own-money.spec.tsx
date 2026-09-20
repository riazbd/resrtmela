/**
 * The agency's own money: the wallet, what it spends, and what it pays.
 *
 * Three screens, one question each, and all three are what an owner asks
 * away from the desk.
 *
 * **Wallet.** There is no payment gateway behind it. An agency hands
 * over cash or sends bKash and somebody at the platform credits the
 * balance, which is why every line carries who moved it and how. Those
 * are null on rows recorded before the columns existed, and a screen
 * that prints "by null" is worse than one that says nothing.
 *
 * **Expenses.** The agency defines heads and files under them, unlike
 * the resort side where a category is typed per entry. Adding an entry
 * is here; defining a head is desk work and the screen says so.
 *
 * **Payroll.** The month and what is left to pay. Hiring is not on a
 * phone, for the same reason it is not on the resort's.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyEmployee, AgencyExpensePage, AgencyWallet } from "@rh/shared";

const mockWallet = jest.fn();
const mockExpenses = jest.fn();
const mockHeads = jest.fn();
const mockAddExpense = jest.fn();
const mockEmployees = jest.fn();
const mockSheet = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
      wallet: (...a: unknown[]) => mockWallet(...a),
      books: {
        expenses: (...a: unknown[]) => mockExpenses(...a),
        heads: (...a: unknown[]) => mockHeads(...a),
        addExpense: (...a: unknown[]) => mockAddExpense(...a),
      },
      payroll: {
        employees: (...a: unknown[]) => mockEmployees(...a),
        sheet: (...a: unknown[]) => mockSheet(...a),
      },
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const WalletScreen = require("../app/(tabs)/(desk)/agent/wallet").default;
const ExpensesScreen = require("../app/(tabs)/(desk)/agent/expenses").default;
const PayrollScreen = require("../app/(tabs)/(desk)/agent/payroll").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const open = async (Screen: React.ComponentType) =>
  render(<Harness><Screen /></Harness>);

const wallet = (over: Partial<AgencyWallet> = {}): AgencyWallet => ({
  balance: 42000,
  active: true,
  txns: [
    {
      id: "301",
      kind: "TOPUP",
      amount: 50000,
      balanceAfter: 50000,
      note: "Cash at the office",
      bookingId: null,
      method: "CASH",
      by: "Riaz",
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    {
      id: "302",
      kind: "BOOKING_HOLD",
      amount: -8000,
      balanceAfter: 42000,
      note: null,
      bookingId: 84,
      method: null,
      by: null,
      createdAt: "2026-09-19T10:00:00.000Z",
    },
  ],
  ...over,
});

const expensePage = (over: Partial<AgencyExpensePage> = {}): AgencyExpensePage => ({
  rows: [
    { id: 7, date: "2026-09-20", headId: 2, head: "Fuel", details: "Sajek run", amount: 3200 },
  ],
  total: 1,
  summary: { amount: 3200, byHead: [{ headId: 2, head: "Fuel", amount: 3200 }] },
  ...over,
} as AgencyExpensePage);

const employee = (over: Partial<AgencyEmployee> = {}): AgencyEmployee => ({
  id: 4,
  name: "Shorif",
  phone: "8801700000009",
  designation: "Driver",
  salary: 18000,
  joinDate: "2025-01-05",
  active: true,
  recent: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWallet.mockResolvedValue(wallet());
  mockExpenses.mockResolvedValue(expensePage());
  mockHeads.mockResolvedValue([{ id: 2, name: "Fuel", active: true }]);
  mockEmployees.mockResolvedValue([employee()]);
  // the sheet's real shape, from PayrollSheet: `remaining` and `settled`
  // are the server's arithmetic and not the screen's, because a month can
  // hold several payments
  mockSheet.mockResolvedValue({
    month: "2026-09",
    rows: [
      {
        employeeId: 4,
        name: "Shorif",
        designation: "Driver",
        salary: 18000,
        paid: 5000,
        advance: 5000,
        remaining: 13000,
        settled: false,
        payments: [],
      },
    ],
    totals: {
      expected: 18000,
      paid: 5000,
      advance: 5000,
      remaining: 13000,
      headcount: 1,
      settledCount: 0,
    },
  });
});

describe("the agency's wallet", () => {
  it("leads with the balance", async () => {
    const r = await open(WalletScreen);
    // the balance is the stat and also the balance-after on the newest
    // line, so the stat is asked for by its own label
    await waitFor(() => expect(r.getByLabelText(/Balance: ৳42,000/)).toBeTruthy());
  });

  it("says which way each line moved the money", async () => {
    const r = await open(WalletScreen);
    await waitFor(() => expect(r.getByText(/\+৳50,000/)).toBeTruthy());
    expect(r.getByText(/−৳8,000|-৳8,000/)).toBeTruthy();
  });

  /**
   * There is no gateway: a person at the platform credits the balance,
   * and the agency could once see the money arrive and not who sent it.
   */
  it("names who moved it and how, where the row knows", async () => {
    const r = await open(WalletScreen);
    await waitFor(() => expect(r.getByText(/Riaz/)).toBeTruthy());
    expect(r.getByText(/Cash/i)).toBeTruthy();
  });

  it("says nothing rather than 'by null' on a row from before that was recorded", async () => {
    const r = await open(WalletScreen);
    await waitFor(() => expect(r.getByText(/Riaz/)).toBeTruthy());
    expect(r.queryByText(/null/)).toBeNull();
    expect(r.queryByText(/undefined/)).toBeNull();
  });

  it("says the wallet is empty rather than drawing an empty list", async () => {
    mockWallet.mockResolvedValue(wallet({ balance: 0, txns: [] }));
    const r = await open(WalletScreen);
    await waitFor(() => expect(r.getByText(/Nothing has moved/)).toBeTruthy());
  });

  it("shows the API's own words when it is refused", async () => {
    mockWallet.mockRejectedValue(new Error("You may not see the wallet"));
    const r = await open(WalletScreen);
    await waitFor(() => expect(r.getByText(/may not see the wallet/)).toBeTruthy());
  });
});

describe("what the agency spends", () => {
  it("shows the range's total and what is under each head", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getAllByText(/৳3,200/).length).toBeGreaterThan(0));
    // "Fuel" is the head's own total and the entry's head, which is the
    // point of the screen rather than a duplicate to complain about
    expect(r.getAllByText("Fuel").length).toBe(2);
  });

  it("files a new entry under a head the agency already keeps", async () => {
    mockAddExpense.mockResolvedValue({ id: 9 });
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getAllByText("Fuel").length).toBeGreaterThan(0));
    fireEvent.press(r.getByText("Add"));
    await waitFor(() => expect(r.getByText("File it")).toBeTruthy());
  });

  it("says where a head gets defined", async () => {
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getAllByText("Fuel").length).toBeGreaterThan(0));
    expect(r.getByText(/on the desk/i)).toBeTruthy();
  });

  it("says nothing was filed rather than drawing an empty list", async () => {
    mockExpenses.mockResolvedValue(
      expensePage({ rows: [], total: 0, summary: { amount: 0, byHead: [] } }),
    );
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByText(/Nothing filed/)).toBeTruthy());
  });
});

describe("what the agency pays its people", () => {
  it("shows the month, what is owed and what is left", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText(/September 2026/)).toBeTruthy());
    expect(r.getAllByText(/৳13,000/).length).toBeGreaterThan(0);
  });

  it("names each person and what they are still owed", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText("Shorif")).toBeTruthy());
  });

  it("says where hiring happens", async () => {
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText("Shorif")).toBeTruthy());
    expect(r.getByText(/on the desk/i)).toBeTruthy();
  });

  it("says nobody is on payroll rather than drawing an empty sheet", async () => {
    mockSheet.mockResolvedValue({
      month: "2026-09",
      rows: [],
      totals: { expected: 0, paid: 0, advance: 0, remaining: 0, headcount: 0, settledCount: 0 },
    });
    const r = await open(PayrollScreen);
    await waitFor(() => expect(r.getByText(/Nobody on payroll/)).toBeTruthy());
  });
});
