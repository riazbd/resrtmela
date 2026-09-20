/**
 * Quotes and invoices, on a phone.
 *
 * An agency quotes, the client accepts, the quote becomes an invoice and
 * the money comes in. The console writes those documents — line items, a
 * tax rate, terms, a printable copy — and none of that is one-handed
 * work.
 *
 * What is one-handed is the question an owner asks away from the desk:
 * *what is outstanding, and who has not paid?* So the phone reads the
 * list, opens one, and records a payment against it. Writing a quote
 * stays on the desk and the screen says so, which is the rule phase 2
 * settled for every absence.
 *
 * The status is the whole list. A quote that expired and an invoice that
 * was paid are both "done" and neither is money coming; a sent quote is
 * a thing to chase. Getting that wrong turns the screen into a list of
 * rows nobody can act on.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { SalesDocRow } from "@rh/shared";

const mockList = jest.fn();
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
  client: { agent: { sales: { list: (...a: unknown[]) => mockList(...a) } } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const SalesScreen = require("../app/(tabs)/agent/sales").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const doc = (over: Partial<SalesDocRow> = {}): SalesDocRow => ({
  id: 41,
  kind: "INVOICE",
  number: "INV-0007",
  status: "SENT",
  clientName: "Mahmud Travels",
  issueDate: "2026-09-18",
  validUntil: null,
  sentAt: "2026-09-18",
  totals: { subtotal: 40000, discount: 0, tax: 0, total: 40000, paid: 15000, due: 25000 },
  ...over,
});

const open = async () => render(<Harness><SalesScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([doc()]);
});

describe("what the agency quoted and billed", () => {
  it("names the document, who it is for, and what is still owed", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("INV-0007")).toBeTruthy());
    expect(r.getByText(/Mahmud Travels/)).toBeTruthy();
    // the figure is on the row and in the total above it, so the row is
    // asked for by its own name rather than by a number they share
    expect(
      r.getByLabelText(/INV-0007.*Mahmud Travels.*৳25,000 still owed/),
    ).toBeTruthy();
  });

  /**
   * The figure that matters is what is *left*, not what was billed. An
   * owner checking the phone is asking who still owes them.
   */
  it("adds up what is outstanding across everything on the list", async () => {
    mockList.mockResolvedValue([
      doc(),
      doc({ id: 42, number: "INV-0008", totals: { subtotal: 10000, discount: 0, tax: 0, total: 10000, paid: 0, due: 10000 } }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/৳35,000/)).toBeTruthy());
  });

  it("says what each one is, because a quote is not a bill", async () => {
    mockList.mockResolvedValue([doc({ kind: "QUOTATION", number: "QUO-0003", status: "SENT" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/Quotation|Quote/i)).toBeTruthy());
  });

  /**
   * Paid, expired, declined and void are all finished. Counting a paid
   * invoice as outstanding would have somebody chasing money they have.
   */
  it("does not count a settled document as money still coming", async () => {
    mockList.mockResolvedValue([
      doc({ status: "PAID", totals: { subtotal: 40000, discount: 0, tax: 0, total: 40000, paid: 40000, due: 0 } }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText("INV-0007")).toBeTruthy());
    expect(r.queryByText(/৳25,000/)).toBeNull();
  });

  it("filters to the ones still owing money", async () => {
    mockList.mockResolvedValue([
      doc(),
      doc({ id: 42, number: "INV-0008", status: "PAID", totals: { subtotal: 1, discount: 0, tax: 0, total: 1, paid: 1, due: 0 } }),
    ]);
    const r = await open();
    await waitFor(() => expect(r.getByText("INV-0008")).toBeTruthy());
    fireEvent.press(r.getByText("Owing"));
    await waitFor(() => expect(r.queryByText("INV-0008")).toBeNull());
    expect(r.getByText("INV-0007")).toBeTruthy();
  });

  it("opens one", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("INV-0007")).toBeTruthy());
    fireEvent.press(r.getByText("INV-0007"));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("41"));
  });

  /** Every absence is deliberate and said on the screen. */
  it("says where a quote gets written", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("INV-0007")).toBeTruthy());
    expect(r.getByText(/on the desk/i)).toBeTruthy();
  });

  describe("the states it owes", () => {
    it("says what it is loading", async () => {
      mockList.mockReturnValue(new Promise(() => {}));
      const r = await open();
      await waitFor(() => expect(r.getByText(/Loading/)).toBeTruthy());
    });

    it("shows the API's own words when it is refused", async () => {
      mockList.mockRejectedValue(new Error("You may not see the agency's sales"));
      const r = await open();
      await waitFor(() => expect(r.getByText(/may not see/)).toBeTruthy());
    });

    it("says nothing has been quoted rather than drawing an empty list", async () => {
      mockList.mockResolvedValue([]);
      const r = await open();
      await waitFor(() => expect(r.getByText(/Nothing quoted/)).toBeTruthy());
    });
  });
});
