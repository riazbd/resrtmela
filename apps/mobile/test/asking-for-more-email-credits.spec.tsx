/**
 * Buying email credits from the phone (2026-09-21).
 *
 * The screen showed the balance, and — when the platform had set them —
 * the payment instructions: the address to send money to, beside no way
 * to say what the money was for. A resort owner and an agency both
 * reported the same thing, in the same words: they could watch the
 * credits run down and could not ask for more without opening the
 * console.
 *
 * Nothing in the API was in the way. `POST /email-credits/purchase` has
 * never asked for a permission beyond being signed in, and `billTo`
 * scopes the order to whichever account is asking — which is why it
 * works for an agency, who has no resort at all.
 *
 * Two things this screen has to keep saying. **Nothing is bought here:**
 * there is no gateway, so approval is the receipt and somebody who
 * thinks they have just bought two thousand emails will try to send
 * them. And **an order that is waiting is visible**, or somebody who has
 * already sent the money cannot tell a request in the queue from one
 * that never went, and asks again.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { CreditPack, EmailCreditOrderRow } from "@rh/shared";

const mockCredits = jest.fn();
const mockCampaigns = jest.fn();
const mockPacks = jest.fn();
const mockOrders = jest.fn();
const mockRequest = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 4, name: "Rahim", role: "RESORT_ADMIN" },
    loading: false,
    activeResort: { id: 3, name: "Demo Bay Resort" },
    can: () => true,
  }),
  client: {
    engage: {
      credits: () => mockCredits(),
      campaigns: () => mockCampaigns(),
      creditPacks: () => mockPacks(),
      myCreditOrders: () => mockOrders(),
      requestCredits: (...a: unknown[]) => mockRequest(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const MailboxScreen = require("../app/(tabs)/(desk)/mailbox").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const packs: CreditPack[] = [
  { credits: 500, price: 500 },
  { credits: 2000, price: 1800 },
];

const order = (over: Partial<EmailCreditOrderRow> = {}): EmailCreditOrderRow =>
  ({
    id: "31",
    credits: 2000,
    price: 1800,
    status: "PENDING",
    note: null,
    createdAt: "2026-09-19T10:00:00.000Z",
    decidedAt: null,
    buyer: "Rahim",
    buyerContact: "01811110001",
    accountName: "Demo Bay",
    accountKind: "RESORT",
    resortName: "Demo Bay Resort",
    ...over,
  }) as EmailCreditOrderRow;

const open = async () => render(<Harness><MailboxScreen /></Harness>);

beforeEach(() => {
  jest.clearAllMocks();
  mockCredits.mockResolvedValue({ credits: 120, payTo: "bKash 01700000000 (personal)" });
  mockCampaigns.mockResolvedValue([]);
  mockPacks.mockResolvedValue(packs);
  mockOrders.mockResolvedValue([]);
  mockRequest.mockResolvedValue(order());
});

describe("what the platform sells", () => {
  it("lists every pack with what it costs", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    expect(r.getByText("500 emails")).toBeTruthy();
    expect(r.getByText("৳1,800")).toBeTruthy();
  });

  /** The price list is a platform setting; an empty one is not three invented packs. */
  it("says nothing is on sale rather than inventing a price", async () => {
    mockPacks.mockResolvedValue([]);
    const r = await open();
    await waitFor(() => expect(r.getByText(/Nothing on sale/)).toBeTruthy());
  });
});

describe("asking for a pack", () => {
  it("asks first, naming the amount and the money", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText(/Ask for 2,000 credits at ৳1,800/)).toBeTruthy());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  /**
   * There is no gateway. Somebody who reads this as a purchase will try
   * to send two thousand emails they have not been granted.
   */
  it("says plainly that nothing is charged here", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText(/Nothing is charged here/)).toBeTruthy());
  });

  /** Where to send the money, in the platform's own words. */
  it("shows the payment instructions with the question", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText(/bKash 01700000000/)).toBeTruthy());
  });

  it("places the order once that is answered", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText("Ask for it")).toBeTruthy());
    fireEvent.press(r.getByText("Ask for it"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0][0]).toBe(2000);
  });

  /**
   * A reference goes with the order, minted at the moment of sending as
   * the console mints it. A double-tap is held off by `useAction`, which
   * latches until the call settles.
   */
  it("carries a reference the platform can recognise", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText("Ask for it")).toBeTruthy());
    fireEvent.press(r.getByText("Ask for it"));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(typeof mockRequest.mock.calls[0][1]).toBe("string");
    expect(mockRequest.mock.calls[0][1]).toContain("2000");
  });

  it("backs out without ordering anything", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText("Not now")).toBeTruthy());
    fireEvent.press(r.getByText("Not now"));
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("shows the API's own words when it is refused", async () => {
    mockRequest.mockRejectedValue(new Error("Choose a pack: 500, 2000"));
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    fireEvent.press(r.getByText("2,000 emails"));
    await waitFor(() => expect(r.getByText("Ask for it")).toBeTruthy());
    fireEvent.press(r.getByText("Ask for it"));
    await waitFor(() => expect(r.getByText(/Choose a pack/)).toBeTruthy());
  });
});

/**
 * Every request and what became of it — the console's own list.
 *
 * This showed only the ones still waiting, which hid the answer an owner
 * most needs to see: a pack they sent money for and had declined.
 * Somebody who cannot tell a request in the queue from one that was
 * refused asks for it again. Found by reading the console.
 */
describe("requests already made", () => {
  it("shows one that is still waiting, and calls it what it is", async () => {
    mockOrders.mockResolvedValue([order()]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Your requests")).toBeTruthy());
    // there is no gateway: the platform is waiting for the money, and
    // approval is the receipt for it
    expect(r.getByText("Awaiting payment")).toBeTruthy();
  });

  it("shows one that was approved", async () => {
    mockOrders.mockResolvedValue([order({ status: "APPROVED", decidedAt: "2026-09-20T10:00:00.000Z" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Your requests")).toBeTruthy());
    expect(r.getByText("Approved")).toBeTruthy();
  });

  /** The one the old card hid, and the one worth most to the person who paid. */
  it("shows one that was declined", async () => {
    mockOrders.mockResolvedValue([order({ status: "REJECTED", decidedAt: "2026-09-20T10:00:00.000Z", note: "No payment received" })]);
    const r = await open();
    await waitFor(() => expect(r.getByText("Your requests")).toBeTruthy());
    expect(r.getByText("Declined")).toBeTruthy();
    expect(r.getByText(/No payment received/)).toBeTruthy();
  });

  it("says nothing at all where nothing has been asked for", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("2,000 emails")).toBeTruthy());
    expect(r.queryByText("Your requests")).toBeNull();
  });
});
