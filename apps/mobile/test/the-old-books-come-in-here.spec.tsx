/**
 * Bringing the old books in, from the phone.
 *
 * The screen said "import runs on the desk" until 2026-10-02; the owner's
 * rule since is that whatever the console has, the app has. A manager
 * chooses the spreadsheet, tries it, and brings it in, and reads what
 * happened row by row.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ImportReport } from "@rh/shared";

const mockBookings = jest.fn();
const mockPick = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("../src/api/pick-file", () => ({ pickCsv: () => mockPick() }));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({ activeResort: { id: 3, name: "Demo Bay Resort" }, isManagement: true, can: () => true }),
  client: {
    importer: {
      bookings: (...a: unknown[]) => mockBookings(...a),
      expenses: jest.fn(),
      fb: jest.fn(),
      reconcile: jest.fn(),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ImportScreen = require("../app/(tabs)/(desk)/import").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

jest.setTimeout(30_000);

const report = (over: Partial<ImportReport> = {}): ImportReport => ({
  dryRun: true,
  totalRows: 3,
  imported: 2,
  skipped: 1,
  outOfService: 0,
  conflictNoHold: 0,
  roomsCreated: ["101", "102"],
  guestsCreated: 2,
  paymentsCreated: 1,
  roomTypeCreated: null,
  replacedDeleted: 0,
  unmatchedAgents: [],
  unmatchedReceivers: ["Kamal"],
  rows: [
    { rowNo: 2, code: "BK-001", outcome: "imported" },
    { rowNo: 3, code: "BK-002", outcome: "imported" },
    { rowNo: 4, code: "BK-003", outcome: "skipped", detail: "no check-out date" },
  ],
  ...over,
});

beforeEach(() => {
  mockPick.mockReset().mockResolvedValue({ name: "bookings.csv", text: "Booking ID,Guest\nBK-001,Rafiq" });
  mockBookings.mockReset().mockResolvedValue(report());
});

it("tries a spreadsheet first, and says row by row what would happen", async () => {
  const r = await render(<Harness><ImportScreen /></Harness>);
  await waitFor(() => expect(r.getByRole("button", { name: "Choose the .csv file" })).toBeTruthy(), { timeout: 15_000 });
  await fireEvent.press(r.getByRole("button", { name: "Choose the .csv file" }));
  await waitFor(() => expect(r.getByRole("button", { name: "bookings.csv" })).toBeTruthy());
  await fireEvent.press(r.getByRole("button", { name: "Try it first — nothing is written" }));
  await waitFor(() =>
    expect(mockBookings).toHaveBeenCalledWith(3, {
      csv: "Booking ID,Guest\nBK-001,Rafiq",
      dryRun: true,
      roomType: { name: "Standard", maxAdults: 2, maxChildren: 0 },
    }),
  );
  await waitFor(() => expect(r.getByText("no check-out date")).toBeTruthy());
  expect(r.getByLabelText("Would come in: 2")).toBeTruthy();
  expect(r.getByText("Received by: Kamal")).toBeTruthy();
});

it("brings it in for real", async () => {
  mockBookings.mockResolvedValue(report({ dryRun: false }));
  const r = await render(<Harness><ImportScreen /></Harness>);
  await waitFor(() => expect(r.getByRole("button", { name: "Choose the .csv file" })).toBeTruthy(), { timeout: 15_000 });
  await fireEvent.press(r.getByRole("button", { name: "Choose the .csv file" }));
  await waitFor(() => expect(r.getByRole("button", { name: "bookings.csv" })).toBeTruthy());
  await fireEvent.press(r.getByRole("button", { name: "Bring it in" }));
  await waitFor(() => expect(r.getByText("Brought 2 bookings into Demo Bay Resort")).toBeTruthy());
  expect(mockBookings.mock.calls[0][1].dryRun).toBe(false);
});
