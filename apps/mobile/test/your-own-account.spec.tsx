/**
 * Your own account, and the password on it.
 *
 * The one screen no permission gates: changing your own password
 * belongs to whoever is signed in, whatever they are, which is why
 * `CONSOLE_NAV` has no entry for it and the More list adds it.
 *
 * Two rules are worth holding. `currentPassword` is *omitted* rather
 * than sent empty when there is none — an account opened by invitation
 * has no password yet, and the controller only demands the old one
 * where a hash exists, so an empty string is a wrong answer where an
 * absent field is no answer. And both typing mistakes are caught here
 * rather than by the server, because a round trip to be told "they do
 * not match" is a round trip that loses both boxes.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { Me } from "@rh/shared";

const mockChange = jest.fn();
const mockLogout = jest.fn();
const mockReplace = jest.fn();
let mockMe: Me | null = null;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: (p: string) => mockReplace(p), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: mockMe,
    activeResort: { id: 3, name: "Demo Bay Resort" },
    logout: mockLogout,
  }),
  client: { auth: { changePassword: (...a: unknown[]) => mockChange(...a) } },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ProfileScreen = require("../app/profile").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const me = (over: Partial<Me> = {}): Me =>
  ({
    id: 12,
    name: "Demo Resort Owner",
    phone: "01700000001",
    email: "demo-resort@resortmela.com",
    role: "RESORT_ADMIN",
    resorts: [{ resort: { id: 3, name: "Demo Bay Resort" } }],
    ...over,
  }) as unknown as Me;

beforeEach(() => {
  mockMe = me();
  mockChange.mockReset().mockResolvedValue({ ok: true });
  mockLogout.mockReset();
  mockReplace.mockReset();
});

const open = () => render(<Harness><ProfileScreen /></Harness>);

describe("who is signed in", () => {
  it("says who, how to reach them, and what they are", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByText("Demo Resort Owner")).toBeTruthy());
    expect(r.getByLabelText("Phone: 01700000001")).toBeTruthy();
    expect(r.getByLabelText("Email: demo-resort@resortmela.com")).toBeTruthy();
    expect(r.getByLabelText("Role: RESORT_ADMIN")).toBeTruthy();
  });

  /**
   * A placeholder address is not an address. Showing it as one tells
   * somebody their reset link will arrive somewhere it cannot.
   */
  it("reads a placeholder address as not set", async () => {
    mockMe = me({ email: "user12@placeholder.invalid" });
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("Email: not set")).toBeTruthy());
  });

  it("says which resort is open", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("Demo Bay Resort, open now")).toBeTruthy());
  });

  it("signs out", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByRole("button", { name: "Sign out" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Sign out" }));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});

describe("changing your password", () => {
  it("catches the two mistakes before the server has to", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("New password")).toBeTruthy());

    await fireEvent.changeText(r.getByLabelText("New password"), "short");
    expect(r.getByLabelText("New password again")).toBeTruthy();
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    expect(mockChange).not.toHaveBeenCalled();
    expect(r.getByText("At least 8 characters.")).toBeTruthy();

    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough2");
    expect(r.getByText("These two do not match.")).toBeTruthy();
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    expect(mockChange).not.toHaveBeenCalled();
  });

  /**
   * An account opened by invitation has no password to give. The
   * controller demands the old one only where a hash exists, so an
   * empty box has to become an absent field rather than an empty one.
   */
  it("omits the current password rather than sending an empty one", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("New password")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough1");
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    await waitFor(() => expect(mockChange).toHaveBeenCalledWith("longenough1", undefined));
  });

  it("sends the current password when there is one", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("Current password")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Current password"), "DemoResort2026!");
    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough1");
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith("longenough1", "DemoResort2026!"),
    );
  });

  it("says so when it worked, and empties the boxes", async () => {
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("New password")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough1");
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    await waitFor(() => expect(r.getByText(/Password changed/)).toBeTruthy());
    expect(r.getByLabelText("New password").props.value).toBe("");
  });

  it("shows the API's own words when it is refused", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require("@rh/shared");
    mockChange.mockRejectedValue(new ApiError(400, "Current password is wrong"));
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("New password")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough1");
    await fireEvent.press(r.getByRole("button", { name: "Change it" }));
    await waitFor(() => expect(r.getByText("Current password is wrong")).toBeTruthy());
  });

  it("cannot be double-tapped into two changes", async () => {
    let release: (v: unknown) => void = () => {};
    mockChange.mockImplementation(() => new Promise((res) => { release = res; }));
    const r = await open();
    await waitFor(() => expect(r.getByLabelText("New password")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("New password"), "longenough1");
    await fireEvent.changeText(r.getByLabelText("New password again"), "longenough1");
    const button = r.getByRole("button", { name: "Change it" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockChange).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await waitFor(() => expect(r.getByText(/Password changed/)).toBeTruthy());
  });
});
