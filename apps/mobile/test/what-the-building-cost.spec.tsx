/**
 * The construction book, on a phone (2026-09-28).
 *
 * The owner asked for a module: who put money in towards building the resort,
 * what it went on, and what is in hand. This screen is the one that gets used
 * standing on the site with a mason waiting — which is exactly where a desk is
 * not — so writing a line has to be a few taps and not a form.
 *
 * What is pinned here is what a screenshot cannot check: that the three
 * figures are the book's and not the filter's, that the heading box lets
 * somebody type a name that is not on the list yet, that the date sent is the
 * *resort's* today, and that a person without the permission is told so
 * rather than shown an empty book.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ConstructionBook } from "@rh/shared";

const mockBook = jest.fn();
const mockAdd = jest.fn();
const mockOptions = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 4, name: "Delwar", role: "RESORT_ADMIN" },
    loading: false,
    // Dhaka, deliberately: the date the screen sends must be this zone's
    activeResort: { id: 7, name: "Green Leaf", timezone: "Asia/Dhaka" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    construction: {
      book: (...a: unknown[]) => mockBook(...a),
      add: (...a: unknown[]) => mockAdd(...a),
    },
    // the resort's own words for how money moved; the screen prints these
    // rather than the codes stored under them
    options: { list: (...a: unknown[]) => mockOptions(...a) },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ConstructionScreen = require("../app/(tabs)/(desk)/construction").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const book = (over: Partial<ConstructionBook> = {}): ConstructionBook =>
  ({
    totals: { received: 5_000_000, spent: 2_400_000, inHand: 2_600_000 },
    byContributor: [
      { name: "Delwar Hossain", amount: 3_300_000, entries: 2 },
      { name: "Shahidul Islam", amount: 1_500_000, entries: 1 },
    ],
    byPurpose: [
      { name: "Cement and rod", amount: 1_500_000, entries: 2 },
      { name: "Land filling", amount: 900_000, entries: 1 },
    ],
    contributors: [
      { id: 1, name: "Delwar Hossain", note: null },
      { id: 2, name: "Shahidul Islam", note: null },
    ],
    purposes: [
      { id: 5, name: "Cement and rod" },
      { id: 6, name: "Land filling" },
    ],
    total: 2,
    rows: [
      {
        id: 11,
        kind: "OUT",
        date: "2026-09-01",
        amount: 300_000,
        label: "Cement and rod",
        contributorId: null,
        purposeId: 5,
        paidTo: "Sylhet Traders",
        method: "BKASH",
        note: null,
        enteredBy: "Delwar",
      },
      {
        id: 10,
        kind: "IN",
        date: "2026-08-05",
        amount: 800_000,
        label: "Delwar Hossain",
        contributorId: 1,
        purposeId: null,
        paidTo: null,
        method: "CASH",
        note: null,
        enteredBy: "Delwar",
      },
    ],
    ...over,
  }) as ConstructionBook;

const open = async () => render(<Harness><ConstructionScreen /></Harness>);

beforeEach(() => {
  mockCan = () => true;
  mockBook.mockReset().mockResolvedValue(book());
  mockAdd.mockReset().mockResolvedValue({ id: 99 });
  mockOptions.mockReset().mockResolvedValue([
    { code: "CASH", label: "Cash", active: true },
    { code: "BKASH", label: "bKash", active: true },
  ]);
});

describe("the three figures", () => {
  it("are put in, spent, and what is in hand", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    expect(view.getByText("Put in")).toBeTruthy();
    expect(view.getByText("Spent")).toBeTruthy();
    // whole taka, the way every other money figure on the phone is drawn
    expect(view.getByText("৳50,00,000")).toBeTruthy();
    expect(view.getByText("৳24,00,000")).toBeTruthy();
    expect(view.getByText("৳26,00,000")).toBeTruthy();
  });
});

describe("the two answers", () => {
  it("says who put money in", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("Who put in"));

    await waitFor(() => expect(view.getByText("Who put money in")).toBeTruthy());
    expect(view.getByText("Delwar Hossain")).toBeTruthy();
    expect(view.getByText("Shahidul Islam")).toBeTruthy();
  });

  it("says what it went on", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("What for"));

    await waitFor(() => expect(view.getByText("What it went on")).toBeTruthy());
    expect(view.getByText("Cement and rod")).toBeTruthy();
  });
});

describe("the book itself", () => {
  it("draws a line each way, and names the shop that was paid", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("2 entries")).toBeTruthy());
    // by the row's own label: "Money in" and "Spending" are also the words on
    // the filter chips, and a line is what this is about
    expect(view.getByLabelText(/^Out, Cement and rod/)).toBeTruthy();
    expect(view.getByLabelText(/^In, Delwar Hossain/)).toBeTruthy();
    expect(view.getByText(/Sylhet Traders/)).toBeTruthy();
    // "bKash", the resort's word, and not the "BKASH" stored under it
    expect(view.getByText(/bKash/)).toBeTruthy();
  });

  it("says so plainly when nothing has been written down", async () => {
    mockBook.mockResolvedValue(
      book({ total: 0, rows: [], totals: { received: 0, spent: 0, inHand: 0 } }),
    );
    const view = await open();

    await waitFor(() => expect(view.getByText("Nothing written down yet")).toBeTruthy());
  });
});

describe("writing a line", () => {
  it("takes a heading that is not on the list yet", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("Add spending"));

    await waitFor(() => expect(view.getByLabelText("How much")).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("How much"), "45000");
    await fireEvent.changeText(view.getByLabelText("The heading"), "Mason wages");
    await fireEvent.changeText(view.getByLabelText("Paid to"), "Abul mistri");
    await fireEvent.press(view.getByText("Write it down"));

    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    expect(mockAdd.mock.calls[0]![1]).toMatchObject({
      kind: "OUT",
      amount: 45000,
      purposeName: "Mason wages",
      paidTo: "Abul mistri",
    });
  });

  it("sends the resort's today, not the phone's", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("Add money in"));
    await waitFor(() => expect(view.getByLabelText("How much")).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("How much"), "100000");
    await fireEvent.changeText(view.getByLabelText("Their name"), "Delwar Hossain");
    await fireEvent.press(view.getByText("Write it in"));

    await waitFor(() => expect(mockAdd).toHaveBeenCalled());
    /**
     * Dhaka is UTC+6, so for six hours after midnight `toISOString()` reads
     * yesterday. What is asserted is the shape and the zone, not a fixed day:
     * the date sent has to be the civil date in Asia/Dhaka right now.
     */
    const expected = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
    expect(mockAdd.mock.calls[0]![1].date).toBe(expected);
  });

  it("will not send a line with no amount", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("Add money in"));
    await waitFor(() => expect(view.getByLabelText("How much")).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("Their name"), "Delwar Hossain");
    await fireEvent.press(view.getByText("Write it in"));

    await waitFor(() => expect(view.getByText("Put in how much it was.")).toBeTruthy());
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("will not send a line with nobody to file it under", async () => {
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    await fireEvent.press(view.getByText("Add money in"));
    await waitFor(() => expect(view.getByLabelText("How much")).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText("How much"), "100000");
    await fireEvent.press(view.getByText("Write it in"));

    await waitFor(() => expect(view.getByText("Say who put the money in.")).toBeTruthy());
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe("who may see it", () => {
  it("tells somebody without the permission, rather than showing an empty book", async () => {
    mockCan = (k) => k !== "construction.view";
    const view = await open();

    await waitFor(() => expect(view.getByText("Not open to you")).toBeTruthy());
    expect(mockBook).not.toHaveBeenCalled();
  });

  it("offers no way to write to somebody who may only read", async () => {
    mockCan = (k) => k === "construction.view";
    const view = await open();

    await waitFor(() => expect(view.getByText("In hand")).toBeTruthy());
    expect(view.queryByText("Add money in")).toBeNull();
    expect(view.queryByText("Add spending")).toBeNull();
  });
});
