/**
 * Building a package and writing a document, on a phone (2026-09-21).
 *
 * Both were kept on the desk with reasons that were true. A package is
 * line-by-line work where one wrong line is a tour sold at a loss; a
 * quotation carries line items, a tax rate and terms, and the printed
 * copy a client keeps is a page rather than a screen.
 *
 * The agency reported the consequence: *"can't add any package"*, and
 * *"at quotes no invoice and quote are available"*. A tool that lists
 * what an agency sells and cannot make one of them is not doing the job
 * the agency bought it for.
 *
 * So both are here, and the care the desk-only notes were protecting is
 * kept where it earns something: **cost sits beside price and the margin
 * is drawn while the package is typed**, and **the document's total
 * moves as its lines do**. What stays on the desk is editing lines on a
 * document money has been paid against — which the server refuses — and
 * the printed page.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { SalesDocDetail, SalesDocRow, TourPackageRow } from "@rh/shared";

const mockPackages = jest.fn();
const mockPackage = jest.fn();
const mockCreatePackage = jest.fn();
const mockSalesList = jest.fn();
const mockSalesGet = jest.fn();
const mockSalesCreate = jest.fn();
const mockConvert = jest.fn();
const mockPush = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "41" }),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: "AGENT" },
    loading: false,
    activeResort: null,
    can: (k: string) => mockCan(k),
  }),
  client: {
    agent: {
      tours: {
        packages: (...a: unknown[]) => mockPackages(...a),
        package: (...a: unknown[]) => mockPackage(...a),
        createPackage: (...a: unknown[]) => mockCreatePackage(...a),
      },
      sales: {
        list: (...a: unknown[]) => mockSalesList(...a),
        get: (...a: unknown[]) => mockSalesGet(...a),
        create: (...a: unknown[]) => mockSalesCreate(...a),
        convert: (...a: unknown[]) => mockConvert(...a),
      },
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ToursScreen = require("../app/(tabs)/(desk)/agent/tours").default;
const SalesScreen = require("../app/(tabs)/agent/sales").default;
const SalesDocScreen = require("../app/(tabs)/(desk)/agent/sales/[id]").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const pkg = (over: Partial<TourPackageRow> = {}): TourPackageRow =>
  ({
    id: 5,
    name: "Sajek two nights",
    summary: null,
    days: 3,
    nights: 2,
    pax: 4,
    lines: 3,
    active: true,
    totals: { cost: 30000, price: 42000, margin: 12000 },
    ...over,
  }) as TourPackageRow;

const row = (over: Partial<SalesDocRow> = {}): SalesDocRow =>
  ({
    id: 41,
    kind: "QUOTATION",
    number: "QT-0004",
    status: "SENT",
    clientName: "Mahmud Travels",
    issueDate: "2026-09-18",
    validUntil: null,
    sentAt: null,
    totals: { subtotal: 40000, discount: 0, tax: 0, total: 40000, paid: 0, due: 40000 },
    ...over,
  }) as SalesDocRow;

const detail = (over: Partial<SalesDocDetail> = {}): SalesDocDetail =>
  ({
    ...row(),
    clientEmail: null,
    clientPhone: null,
    clientAddress: null,
    guestId: null,
    packageId: null,
    currency: "BDT",
    taxRate: 0,
    notes: null,
    terms: null,
    paidAt: null,
    items: [
      { id: 1, label: "Sajek weekend", details: null, qty: 4, unitPrice: 10000, amount: 40000 },
    ],
    convertedFrom: null,
    convertedTo: null,
    ...over,
  }) as SalesDocDetail;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = (Screen: any) => render(<Harness><Screen /></Harness>);

beforeEach(() => {
  mockCan = () => true;
  mockPackages.mockReset().mockResolvedValue([pkg()]);
  mockCreatePackage.mockReset().mockResolvedValue({ id: 9 });
  mockPackage.mockReset().mockResolvedValue({
    ...pkg(),
    items: [
      { id: 1, categoryId: null, category: null, label: "Jeep both ways", qty: 1, unitCost: 6000, unitPrice: 8000 },
      { id: 2, categoryId: null, category: null, label: "Two nights", qty: 2, unitCost: 5000, unitPrice: 7000 },
    ],
  });
  mockSalesList.mockReset().mockResolvedValue([row()]);
  mockSalesGet.mockReset().mockResolvedValue(detail());
  mockSalesCreate.mockReset().mockResolvedValue({ id: 77, number: "QT-0005" });
  mockConvert.mockReset().mockResolvedValue({ id: 78, number: "INV-0009" });
  mockPush.mockReset();
});

describe("building a package", () => {
  it("is offered to somebody who may build them", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Build a package" })).toBeTruthy());
  });

  it("is not offered to somebody who may not", async () => {
    mockCan = (k) => k !== "agent.tours.manage";
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByText("Sajek two nights")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Build a package" })).toBeNull();
  });

  it("sends the package with its lines", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Build a package" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Build a package" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Bandarban three nights");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What it is")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What it is"), "Jeep both ways");
    await fireEvent.changeText(r.getByLabelText("Costs us, each"), "6000");
    await fireEvent.changeText(r.getByLabelText("We charge, each"), "8000");
    await fireEvent.press(r.getByRole("button", { name: "Save the package" }));
    await waitFor(() => expect(mockCreatePackage).toHaveBeenCalled());
    const sent = mockCreatePackage.mock.calls[0][0];
    expect(sent.name).toBe("Bandarban three nights");
    expect(sent.items).toEqual([
      { label: "Jeep both ways", qty: 1, unitCost: 6000, unitPrice: 8000 },
    ]);
  });

  /**
   * The point of the whole form. An agency that cannot see its own
   * margin while quoting finds it out after the trip.
   */
  it("draws the margin while the lines are being typed", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Build a package" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Build a package" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What it is")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What it is"), "Jeep");
    await fireEvent.changeText(r.getByLabelText("Costs us, each"), "6000");
    await fireEvent.changeText(r.getByLabelText("We charge, each"), "8000");
    await waitFor(() => expect(r.getByLabelText("Margin ৳2,000")).toBeTruthy());
  });

  it("will not send a package with no lines on it", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Build a package" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Build a package" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Empty trip");
    await fireEvent.press(r.getByRole("button", { name: "Save the package" }));
    expect(mockCreatePackage).not.toHaveBeenCalled();
    expect(r.getByText(/put at least one on it/)).toBeTruthy();
  });

  /** A replayed write after a dropped connection is still one package. */
  it("carries a reference, so a retry is not a second tour", async () => {
    const r = await open(ToursScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Build a package" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Build a package" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Sajek");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What it is")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What it is"), "Jeep");
    await fireEvent.press(r.getByRole("button", { name: "Save the package" }));
    await waitFor(() => expect(mockCreatePackage).toHaveBeenCalled());
    expect(typeof mockCreatePackage.mock.calls[0][0].clientRef).toBe("string");
  });
});

describe("writing a quotation", () => {
  it("is offered to somebody who may write one", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
  });

  it("is not offered to somebody who may not", async () => {
    mockCan = (k) => k !== "agent.sales.manage";
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByText("QT-0004")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Write a document" })).toBeNull();
  });

  it("sends the client, the lines and the tax rate", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin Akter");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What for"), "Sajek weekend");
    await fireEvent.changeText(r.getByLabelText("Each"), "10000");
    await fireEvent.changeText(r.getByLabelText("Tax %"), "15");
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockSalesCreate).toHaveBeenCalled());
    const sent = mockSalesCreate.mock.calls[0][0];
    expect(sent).toMatchObject({ kind: "QUOTATION", clientName: "Nasrin Akter", taxRate: 15 });
    expect(sent.items).toEqual([{ label: "Sajek weekend", qty: 1, unitPrice: 10000 }]);
  });

  /**
   * A quotation becomes an invoice by being converted, which links the
   * two documents. Choosing wrong and saving leaves one to void, so the
   * kind is asked before anything else.
   */
  it("writes an invoice when that is what was chosen", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Invoice" }));
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What for"), "Sajek weekend");
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockSalesCreate).toHaveBeenCalled());
    expect(mockSalesCreate.mock.calls[0][0].kind).toBe("INVOICE");
  });

  it("will not send a document with no client", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    expect(mockSalesCreate).not.toHaveBeenCalled();
    expect(r.getByText("Say who it is for.")).toBeTruthy();
  });

  it("opens what it just wrote", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What for"), "Sajek weekend");
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/agent/sales/77"));
  });
});

describe("the quote the client said yes to", () => {
  it("turns a quotation into an invoice", async () => {
    const r = await open(SalesDocScreen);
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Turn it into an invoice" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Turn it into an invoice" }));
    await waitFor(() => expect(mockConvert).toHaveBeenCalledWith(41));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/agent/sales/78"));
  });

  /**
   * Converting changes the quote too, and this screen's copy of it was
   * read before the conversion.
   *
   * Caught on the live demo agency: after converting, going back to the
   * quote still offered to convert it and named no invoice, because the
   * cached copy still had `convertedTo: null`. The server had it right
   * the whole time. No test saw it, because a test mounts one screen
   * with one answer and never returns to a stale one — so what is
   * asserted here is the invalidation itself.
   */
  it("re-reads the quote it just changed", async () => {
    const r = await open(SalesDocScreen);
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Turn it into an invoice" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Turn it into an invoice" }));
    await waitFor(() => expect(mockConvert).toHaveBeenCalled());
    // asked for again, so `convertedTo` is no longer stale
    await waitFor(() => expect(mockSalesGet).toHaveBeenCalledTimes(2));
  });

  /** An invoice is not converted into anything; the button would be a trap. */
  it("offers nothing on a document that is already an invoice", async () => {
    mockSalesGet.mockResolvedValue(detail({ kind: "INVOICE", number: "INV-0007" }));
    const r = await open(SalesDocScreen);
    await waitFor(() => expect(r.getByText("Mahmud Travels")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Turn it into an invoice" })).toBeNull();
  });

  /**
   * Converting twice returns the same invoice, so this is about reading
   * rather than safety: a quote that has already been converted names
   * the invoice and opens it, instead of offering to do it again.
   */
  it("names the invoice a converted quote already became", async () => {
    mockSalesGet.mockResolvedValue(
      detail({ convertedTo: { id: 78, number: "INV-0009" } }),
    );
    const r = await open(SalesDocScreen);
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Open invoice INV-0009" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Open invoice INV-0009" }));
    expect(mockPush).toHaveBeenCalledWith("/agent/sales/78");
  });

  it("is not offered to somebody who may not write documents", async () => {
    mockCan = (k) => k !== "agent.sales.manage";
    const r = await open(SalesDocScreen);
    await waitFor(() => expect(r.getByText("Mahmud Travels")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Turn it into an invoice" })).toBeNull();
  });
});

/**
 * Quoting from a package the agency already priced (2026-09-22).
 *
 * Found by reading the console rather than by being told. Its document
 * form has a package picker that fills the lines in, and a validity
 * date; the phone had neither, so the two features the owner asked for
 * — packages and quotes — did not meet. An agency that has priced a
 * Sajek weekend line by line should not retype it to quote for one.
 *
 * The lines stay editable afterwards, and they are the *document's* from
 * that moment on. That is the rule the API is built around: repricing a
 * package next month must not rewrite a quote sent last month.
 */
describe("quoting from a package", () => {
  const openForm = async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    return r;
  };

  it("offers the packages that are on sale", async () => {
    const r = await openForm();
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Sajek two nights" })).toBeTruthy(),
    );
  });

  it("fills the lines from the package that was picked", async () => {
    const r = await openForm();
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Sajek two nights" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Sajek two nights" }));
    await waitFor(() => expect(mockPackage).toHaveBeenCalledWith(5));
    await waitFor(() => expect(r.getByDisplayValue("Jeep both ways")).toBeTruthy());
    expect(r.getByDisplayValue("Two nights")).toBeTruthy();
  });

  /**
   * The price the client pays, not what the trip costs the agency.
   * `unitCost` is the agency's own business and never reaches a client's
   * copy — putting it on the document would publish the margin.
   */
  it("carries the price across and leaves the cost behind", async () => {
    const r = await openForm();
    await waitFor(() =>
      expect(r.getByRole("button", { name: "Sajek two nights" })).toBeTruthy(),
    );
    await fireEvent.press(r.getByRole("button", { name: "Sajek two nights" }));
    await waitFor(() => expect(r.getByDisplayValue("Jeep both ways")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin");
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockSalesCreate).toHaveBeenCalled());
    const sent = mockSalesCreate.mock.calls[0][0];
    expect(sent.packageId).toBe(5);
    expect(sent.items).toEqual([
      { label: "Jeep both ways", qty: 1, unitPrice: 8000 },
      { label: "Two nights", qty: 2, unitPrice: 7000 },
    ]);
  });

  /** A picker with nothing in it is a row saying "you could have used a feature you lack". */
  it("shows nothing at all where the agency has no packages", async () => {
    mockPackages.mockResolvedValue([]);
    const r = await openForm();
    expect(r.queryByText("From a package")).toBeNull();
  });
});

describe("how long a quote stands", () => {
  it("sends no expiry unless one was asked for", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What for"), "Sajek weekend");
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockSalesCreate).toHaveBeenCalled());
    expect(mockSalesCreate.mock.calls[0][0].validUntil).toBeUndefined();
  });

  /** A quoted price that never runs out is one a client can hold you to next season. */
  it("sends one when it was", async () => {
    const r = await open(SalesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Write a document" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Write a document" }));
    await waitFor(() => expect(r.getByLabelText("Client")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Client"), "Nasrin");
    await fireEvent.press(r.getByRole("button", { name: "Add a line" }));
    await waitFor(() => expect(r.getByLabelText("What for")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("What for"), "Sajek weekend");
    await fireEvent.press(r.getByRole("switch", { name: "Expires" }));
    await fireEvent.press(r.getByRole("button", { name: "Save it" }));
    await waitFor(() => expect(mockSalesCreate).toHaveBeenCalled());
    expect(mockSalesCreate.mock.calls[0][0].validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
