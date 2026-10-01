/**
 * Money put down ahead of the stays it pays for, between an agency and a resort.
 *
 * The owner's question: "agent resort ke adv dite pare na?" The ledger had the
 * word — `ADVANCE`, "Advance deposited" — and nothing on a phone could write
 * it. An agency's one door, "I have sent money", filed every declaration as a
 * remittance, so a float for the season read on both statements as money
 * handed over against stays that did not exist yet. The resort could write an
 * advance only from the console. And neither statement showed how much had
 * been advanced, although the account has always counted it.
 *
 *   - **The agency** says which it is when it declares money: for stays sold,
 *     or an advance. And it can deposit an advance with a resort it may sell
 *     before its first booking there, which is often when one is paid.
 *   - **The resort** adds a line from the phone, as the console does: an
 *     advance, commission, commission paid out, an adjustment.
 *   - **Both statements** show the advances beside the other figures.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AgentAccountList, AgentStatement, DiscoverResort, MyAccountList } from "@rh/shared";

const mockMyList = jest.fn();
const mockMyStatement = jest.fn();
const mockDeclare = jest.fn();
const mockDiscover = jest.fn();
const mockList = jest.fn();
const mockStatement = jest.fn();
const mockEntry = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "AGENT" },
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    can: () => true,
  }),
  client: {
    agent: {
      discover: (...a: unknown[]) => mockDiscover(...a),
      accounts: {
        list: (...a: unknown[]) => mockMyList(...a),
        statement: (...a: unknown[]) => mockMyStatement(...a),
        declare: (...a: unknown[]) => mockDeclare(...a),
        withdraw: jest.fn(),
      },
    },
    agentAccounts: {
      list: (...a: unknown[]) => mockList(...a),
      statement: (...a: unknown[]) => mockStatement(...a),
      entry: (...a: unknown[]) => mockEntry(...a),
      received: jest.fn(),
      confirm: jest.fn(),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const MyAccountsScreen = require("../app/(tabs)/(desk)/agent/account").default;
const AgentAccountsScreen = require("../app/(tabs)/(desk)/agents").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const totals = {
  balance: -12_000,
  collected: 8_000,
  remitted: 0,
  commission: 0,
  commissionPaid: 0,
  advances: 20_000,
  adjustments: 0,
  pending: 0,
};

const statement = (over: Partial<AgentStatement> = {}): AgentStatement => ({
  ...totals,
  resort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka", currency: "BDT", locale: "en-BD" },
  agency: { agencyId: 7, name: "Sea Breeze Travels", contact: "Rafiq", phone: null, email: null },
  terms: { kind: "PERCENT", rate: 10 },
  creditLimit: null,
  overLimit: false,
  methods: [
    { code: "CASH", label: "Cash" },
    { code: "BKASH", label: "bKash" },
  ],
  rows: [],
  ...over,
});

const myList = (): MyAccountList => ({
  rows: [
    {
      ...totals,
      resort: { id: 3, name: "Demo Bay Resort", currency: "BDT", locale: "en-BD" },
      bookings: 2,
      creditLimit: null,
    },
  ],
  owedByMe: 0,
  owedToMe: 12_000,
  pending: 0,
});

const discover = (): DiscoverResort[] => [
  { id: 3, name: "Demo Bay Resort", location: null, roomCount: 8, roomTypeCount: 2, priceFrom: 4000, access: "OPEN", reason: null },
  { id: 5, name: "Hill View", location: "Sajek", roomCount: 6, roomTypeCount: 1, priceFrom: 3000, access: "OPEN", reason: null },
];

const resortList = (): AgentAccountList => ({
  rows: [
    {
      ...totals,
      agencyId: 7,
      name: "Sea Breeze Travels",
      accountId: 40,
      creditLimit: null,
      overLimit: false,
      bookings: 2,
    },
  ],
  owedToResort: 0,
  owedToAgents: 12_000,
  pending: 0,
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
  mockMyList.mockReset().mockResolvedValue(myList());
  mockMyStatement.mockReset().mockImplementation((resortId: number) =>
    Promise.resolve(
      resortId === 5
        ? statement({
            ...{ balance: 0, collected: 0, advances: 0 },
            resort: { id: 5, name: "Hill View", timezone: "Asia/Dhaka", currency: "BDT", locale: "en-BD" },
          })
        : statement(),
    ),
  );
  mockDeclare.mockReset().mockResolvedValue({ id: "e1", replayed: false, status: "PENDING" });
  mockDiscover.mockReset().mockResolvedValue(discover());
  mockList.mockReset().mockResolvedValue(resortList());
  mockStatement.mockReset().mockResolvedValue(statement());
  mockEntry.mockReset().mockResolvedValue({ ...totals, id: "e2", replayed: false });
});

afterEach(() => jest.useRealTimers());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

async function agencyStatement() {
  const r = await open(MyAccountsScreen);
  await waitFor(() => expect(r.getByLabelText(/^Demo Bay Resort,/)).toBeTruthy());
  await fireEvent.press(r.getByLabelText(/^Demo Bay Resort,/));
  await waitFor(() => expect(r.getByRole("button", { name: "I have sent money" })).toBeTruthy());
  return r;
}

describe("the agency's side", () => {
  it("shows how much it has advanced", async () => {
    const r = await agencyStatement();
    expect(r.getByLabelText("Advances: ৳20,000")).toBeTruthy();
  });

  it("says money sent is for stays sold unless told otherwise", async () => {
    const r = await agencyStatement();
    await fireEvent.press(r.getByRole("button", { name: "I have sent money" }));
    await fireEvent.changeText(r.getByLabelText("How much"), "9000");
    await fireEvent.press(r.getByRole("button", { name: "Tell the resort" }));
    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith(3, expect.objectContaining({ kind: "REMIT", amount: 9000 })),
    );
  });

  it("declares an advance as an advance", async () => {
    const r = await agencyStatement();
    await fireEvent.press(r.getByRole("button", { name: "I have sent money" }));
    await fireEvent.press(r.getByRole("button", { name: "An advance" }));
    await fireEvent.changeText(r.getByLabelText("How much"), "20000");
    await fireEvent.press(r.getByRole("button", { name: "bKash" }));
    await fireEvent.changeText(r.getByLabelText("Transaction id"), "ADV-1");
    await fireEvent.press(r.getByRole("button", { name: "Tell the resort" }));
    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith(3, {
        kind: "ADVANCE",
        amount: 20000,
        method: "BKASH",
        trxId: "ADV-1",
        date: "2026-09-20",
      }),
    );
  });

  /** Often the first thing that passes between them — before any booking. */
  it("deposits an advance with a resort it has not sold yet", async () => {
    const r = await open(MyAccountsScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Deposit an advance" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Deposit an advance" }));
    // the resorts it has an account with, and the ones open to it, once each
    await waitFor(() => expect(r.getByRole("button", { name: "Hill View" })).toBeTruthy());
    expect(r.getAllByRole("button", { name: "Demo Bay Resort" })).toHaveLength(1);
    await fireEvent.press(r.getByRole("button", { name: "Hill View" }));
    await waitFor(() => expect(r.getByText("Money sent to Hill View")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("How much"), "5000");
    await fireEvent.press(r.getByRole("button", { name: "Tell the resort" }));
    await waitFor(() =>
      expect(mockDeclare).toHaveBeenCalledWith(5, expect.objectContaining({ kind: "ADVANCE", amount: 5000 })),
    );
  });
});

async function resortStatement() {
  const r = await open(AgentAccountsScreen);
  await waitFor(() => expect(r.getByLabelText(/^Sea Breeze Travels,/)).toBeTruthy());
  await fireEvent.press(r.getByLabelText(/^Sea Breeze Travels,/));
  await waitFor(() => expect(r.getByRole("button", { name: "Add a line" })).toBeTruthy());
  return r;
}

describe("the resort's side", () => {
  it("shows how much the agency has advanced", async () => {
    const r = await resortStatement();
    expect(r.getByLabelText("Advances: ৳20,000")).toBeTruthy();
  });

  it("records an advance the agency put down", async () => {
    const r = await resortStatement();
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await fireEvent.press(r.getByRole("button", { name: "Advance deposited" }));
    await fireEvent.changeText(r.getByLabelText("Amount"), "15000");
    await fireEvent.press(r.getByRole("button", { name: "bKash" }));
    await fireEvent.changeText(r.getByLabelText("Note"), "For December");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(mockEntry).toHaveBeenCalledWith(3, 7, {
        kind: "ADVANCE",
        amount: 15000,
        method: "BKASH",
        date: "2026-09-20",
        note: "For December",
      }),
    );
  });

  it("pays out commission from the same form", async () => {
    const r = await resortStatement();
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await fireEvent.press(r.getByRole("button", { name: "Commission paid out" }));
    await fireEvent.changeText(r.getByLabelText("Amount"), "2000");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(mockEntry).toHaveBeenCalledWith(3, 7, expect.objectContaining({ kind: "COMMISSION_PAID", amount: 2000, method: "CASH" })),
    );
  });

  /** A correction moves no money, so it is not asked how the money moved. */
  it("sends no method with an adjustment, and keeps its sign", async () => {
    const r = await resortStatement();
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await fireEvent.press(r.getByRole("button", { name: "Adjustment" }));
    expect(r.queryByRole("button", { name: "bKash" })).toBeNull();
    await fireEvent.changeText(r.getByLabelText("Amount"), "-500");
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() =>
      expect(mockEntry).toHaveBeenCalledWith(3, 7, { kind: "ADJUSTMENT", amount: -500, date: "2026-09-20" }),
    );
  });

  it("asks for an amount rather than writing a zero", async () => {
    const r = await resortStatement();
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await fireEvent.press(r.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(r.getByText("Put in the amount.")).toBeTruthy());
    expect(mockEntry).not.toHaveBeenCalled();
  });
});
