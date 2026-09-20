/**
 * The dues list: who has not paid, and who to ask.
 *
 * Two questions wearing one coat. A guest's balance is collected at the desk
 * on the morning they leave; an agency's is invoiced between two businesses.
 * The lens that separates them is `duesThrough`, shared with the console, so
 * both clients agree on what counts as an agency booking — the agent on the
 * row, not who eventually hands the money over.
 *
 * Four bookings from one agency are one phone call, and the by-agency block
 * is the only place on either screen that says so.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { DuesReport } from "@rh/shared";

const mockDues = jest.fn();
const mockPush = jest.fn();
let mockResort: { id: number; name: string } | null = { id: 3, name: "Demo Bay Resort" };

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: mockResort }),
  client: { dues: (...a: unknown[]) => mockDues(...a) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DuesScreen = require("../app/(tabs)/(desk)/payments").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Harness } = require("./harness");

const guestRow = {
  id: 41,
  code: "BK-00041",
  state: "CONFIRMED",
  guest: { fullName: "Rafiq Hasan", phone: "01811110001" },
  agent: null,
  checkIn: "2026-09-18",
  checkOut: "2026-09-20",
  rooms: 1,
  nights: 2,
  rent: 9000,
  discount: 0,
  tax: 0,
  total: 9000,
  paid: 5000,
  due: 4000,
};

const agencyRow = {
  ...guestRow,
  id: 42,
  code: "BK-00042",
  guest: { fullName: "Tanvir Islam", phone: "01811110003" },
  agent: { id: 7, name: "Riaz", accountId: 6, agency: "Demo Travels" },
  due: 23000,
};

const report = (over: Partial<DuesReport> = {}): DuesReport =>
  ({
    total: 27000,
    count: 2,
    guestTotal: 4000,
    guestCount: 1,
    agencyTotal: 23000,
    agencyCount: 1,
    byAgency: [{ accountId: 6, agency: "Demo Travels", bookings: 1, due: 23000 }],
    rows: [guestRow, agencyRow],
    ...over,
  }) as DuesReport;

beforeEach(() => {
  mockResort = { id: 3, name: "Demo Bay Resort" };
  mockDues.mockReset().mockResolvedValue(report());
  mockPush.mockReset();
});

describe("the figures at the top", () => {
  it("splits one red total into the two it is made of", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByLabelText("Outstanding: ৳27,000")).toBeTruthy());
    expect(r.getByLabelText("Due from guests: ৳4,000")).toBeTruthy();
    expect(r.getByLabelText("Due from agencies: ৳23,000")).toBeTruthy();
  });
});

describe("the three lenses", () => {
  it("offers all three, each carrying how many it would show", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByRole("button", { name: "Everyone, 2" })).toBeTruthy());
    expect(r.getByRole("button", { name: "Guests, 1" })).toBeTruthy();
    expect(r.getByRole("button", { name: "Agencies, 1" })).toBeTruthy();
  });

  it("starts on everyone", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.getByText("Tanvir Islam")).toBeTruthy();
  });

  it("keeps only what a guest will be asked for", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Guests, 1" }));
    expect(r.queryByText("Tanvir Islam")).toBeNull();
    expect(r.getByText("Rafiq Hasan")).toBeTruthy();
  });

  it("keeps only what an agency will be invoiced for", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Agencies, 1" }));
    expect(r.queryByText("Rafiq Hasan")).toBeNull();
    expect(r.getByText("Tanvir Islam")).toBeTruthy();
  });
});

describe("who to ring", () => {
  /** Four bookings from one agency are one phone call, not four. */
  it("gathers each agency's bookings into one line, under the agency lens", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    expect(r.queryByLabelText("Demo Travels, 1 booking, ৳23,000")).toBeNull();

    await fireEvent.press(r.getByRole("button", { name: "Agencies, 1" }));
    expect(r.getByLabelText("Demo Travels, 1 booking, ৳23,000")).toBeTruthy();
  });
});

describe("a row", () => {
  it("names the guest, the booking and what is left", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("BK-00041")).toBeTruthy());
    expect(r.getByLabelText("Rafiq Hasan, BK-00041, ৳4,000 due")).toBeTruthy();
  });

  it("says which agency sold it, when one did", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Tanvir Islam")).toBeTruthy());
    expect(r.getByText(/Demo Travels/)).toBeTruthy();
  });

  it("opens the booking", async () => {
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Rafiq Hasan, BK-00041, ৳4,000 due"));
    expect(mockPush).toHaveBeenCalledWith("/bookings/41");
  });
});

describe("the states it owes", () => {
  it("says what it is loading", async () => {
    let answer!: (d: DuesReport) => void;
    mockDues.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as (d: DuesReport) => void)),
    );
    const r = await render(<Harness><DuesScreen /></Harness>);
    expect(r.getByText("Loading what is due…")).toBeTruthy();
    const { act } = require("@testing-library/react-native");
    await act(async () => {
      answer(report());
    });
  });

  it("shows the API's own words when it is refused", async () => {
    const { ApiError } = require("@rh/shared");
    mockDues.mockRejectedValue(new ApiError(403, "You do not have permission"));
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("You do not have permission")).toBeTruthy());
  });

  /**
   * Nothing outstanding is the best news this screen can carry, and it must
   * not be drawn the same way as a failed read.
   */
  it("celebrates a resort that is owed nothing", async () => {
    mockDues.mockResolvedValue(
      report({
        total: 0, count: 0,
        guestTotal: 0, guestCount: 0,
        agencyTotal: 0, agencyCount: 0,
        byAgency: [], rows: [],
      }),
    );
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Nothing outstanding")).toBeTruthy());
  });

  /**
   * An empty lens is not an empty resort. "Nothing outstanding" on the
   * agency tab, while a guest still owes ৳4,000, would be a lie told by a
   * filter.
   */
  it("says the lens is empty without claiming the resort is owed nothing", async () => {
    mockDues.mockResolvedValue(
      report({
        rows: [guestRow],
        total: 4000, count: 1,
        agencyTotal: 0, agencyCount: 0, byAgency: [],
      }),
    );
    const r = await render(<Harness><DuesScreen /></Harness>);
    await waitFor(() => expect(r.getByText("Rafiq Hasan")).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Agencies, 0" }));
    expect(r.getByText("Nothing due from any agency")).toBeTruthy();
    expect(r.queryByText("Nothing outstanding")).toBeNull();
  });
});
