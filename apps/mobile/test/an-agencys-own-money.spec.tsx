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
 * **Payroll.** The month and what is left to pay. Advances and the staff
 * list are in advances-and-the-people-paid.spec.tsx.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgencyEmployee, AgencyExpensePage, AgencyWallet } from "@rh/shared";

const mockCreateHead = jest.fn();
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
        createHead: (...a: unknown[]) => mockCreateHead(...a),
        deleteHead: jest.fn(),
        updateHead: jest.fn(),
        removeExpense: jest.fn(),
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
  leftDate: null,
  userId: null,
  active: true,
  recent: [],
  ...over,
});

beforeEach(() => {
  // the fixtures are September's; read off a real clock this file went red
  // on 1 October with nothing changed
  jest.useFakeTimers({
    now: new Date("2026-09-20T06:00:00Z"),
    doNotFake: [
      "setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "setImmediate", "clearImmediate", "nextTick", "queueMicrotask",
      "performance", "requestAnimationFrame", "cancelAnimationFrame",
    ],
  });
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

afterEach(() => jest.useRealTimers());

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
    // "Fuel" is under the head's own total (as a share and a row), on the
    // entry, and in the list of heads — the point of the screen, not a duplicate
    expect(r.getAllByText("Fuel").length).toBeGreaterThanOrEqual(2);
  });

  it("files a new entry under a head the agency already keeps", async () => {
    mockAddExpense.mockResolvedValue({ id: 9 });
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getAllByText("Fuel").length).toBeGreaterThan(0));
    fireEvent.press(r.getAllByText("Add")[0]!);
    await waitFor(() => expect(r.getByText("File it")).toBeTruthy());
  });

  /** Heads used to be "defined on the desk"; whatever the console has, the app has. */
  it("adds a head to file under", async () => {
    mockCreateHead.mockResolvedValue({ id: 5, name: "Office rent" });
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByLabelText("A new head")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("A new head"), "Office rent");
    await fireEvent.press(r.getAllByRole("button", { name: "Add" }).at(-1)!);
    await waitFor(() => expect(mockCreateHead).toHaveBeenCalledWith("Office rent"));
  });

  it("says nothing was filed rather than drawing an empty list", async () => {
    mockExpenses.mockResolvedValue(
      expensePage({ rows: [], total: 0, summary: { amount: 0, byHead: [] } }),
    );
    const r = await open(ExpensesScreen);
    await waitFor(() => expect(r.getByText(/Nothing filed/)).toBeTruthy());
  });
});

// the agency’s payroll is in who-is-paid-and-what-for.spec.tsx, with the resort’s
