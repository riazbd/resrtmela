/**
 * Adding a colleague, and ticking what a role may do (2026-09-21).
 *
 * Both were kept on the desk, with a stated reason: a role is thirty-odd
 * checkboxes in nine groups, and a phone renders that as a scroll nobody
 * can hold in their head.
 *
 * The owner met that decision as two sentences. *"Staff can't add."* And
 * then, when their manager could not file the day's diesel,
 * *"permission-e expense-ta add nai"* — there is no expense permission to
 * tick. There is: `expenses.create`, labelled "Record expenses", in the
 * Money group, present in `PERMISSIONS` the whole time. What was missing
 * was anywhere on the phone to tick it.
 *
 * So the objection is answered by shape rather than by refusing. The
 * matrix opens one role at a time, its groups collapsed, and a group is
 * three or four switches — the thirty are never on screen at once. That
 * is the claim these tests hold: **the permission the owner could not
 * find is reachable, and ticking it sends the key the API reads.**
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { PermRole, ResortUser } from "@rh/shared";

const mockUsers = jest.fn();
const mockRoles = jest.fn();
const mockAddUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockCreateRole = jest.fn();
const mockUpdateRole = jest.fn();
const mockPush = jest.fn();
let mockCan = (_k: string) => true;

jest.mock("expo-router", () => ({
  router: { push: (p: string) => mockPush(p), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    activeResort: { id: 3, name: "Demo Bay Resort", timezone: "Asia/Dhaka" },
    loading: false,
    me: { id: 1, name: "Rahim" },
    can: (k: string) => mockCan(k),
  }),
  client: {
    resort: {
      users: (...a: unknown[]) => mockUsers(...a),
      roles: (...a: unknown[]) => mockRoles(...a),
      addUser: (...a: unknown[]) => mockAddUser(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      createRole: (...a: unknown[]) => mockCreateRole(...a),
      updateRole: (...a: unknown[]) => mockUpdateRole(...a),
    },
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const TeamScreen = require("../app/(tabs)/(desk)/settings/team").default;
const RolesScreen = require("../app/(tabs)/(desk)/settings/roles").default;
const { Harness } = require("./harness");
/* eslint-enable @typescript-eslint/no-var-requires */

const person = (over: Partial<ResortUser> = {}): ResortUser =>
  ({
    id: 4,
    name: "Karim",
    phone: "01711110001",
    email: "karim@example.com",
    role: "FRONT_DESK",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    roleId: 2,
    roleName: "Front Desk",
    ...over,
  }) as ResortUser;

const ADMIN: PermRole = {
  id: 1,
  name: "Administrator",
  system: true,
  users: 1,
  permissions: ["*"],
};

const MANAGER: PermRole = {
  id: 3,
  name: "Manager",
  system: true,
  users: 1,
  // deliberately without `expenses.create`: this is the role the owner
  // was looking at when they said the expense permission was not there
  permissions: ["bookings.view", "expenses.view"],
};

const open = (Screen: React.ComponentType) =>
  render(<Harness><Screen /></Harness>);

beforeEach(() => {
  mockCan = () => true;
  mockUsers.mockReset().mockResolvedValue([person()]);
  mockRoles.mockReset().mockResolvedValue([ADMIN, MANAGER]);
  mockAddUser.mockReset().mockResolvedValue({ id: 9 });
  mockUpdateUser.mockReset().mockResolvedValue({ id: 4 });
  mockCreateRole.mockReset().mockResolvedValue({ ...MANAGER, id: 7, name: "Night manager" });
  mockUpdateRole.mockReset().mockResolvedValue(MANAGER);
  mockPush.mockReset();
});

describe("adding a colleague", () => {
  it("is offered to somebody who may manage users", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
  });

  it("is not offered to somebody who may not", async () => {
    mockCan = (k) => k !== "users.manage";
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add somebody" })).toBeNull();
  });

  const fillIn = async (r: Awaited<ReturnType<typeof open>>) => {
    await fireEvent.press(r.getByRole("button", { name: "Add somebody" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Mitu Rahman");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01712345678");
    await fireEvent.changeText(r.getByLabelText("Email"), "mitu@example.com");
    await fireEvent.changeText(r.getByLabelText("First password"), "chalobhalo1");
  };

  it("sends a name, both contacts, a password and a permission set", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fillIn(r);
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    await waitFor(() => expect(mockAddUser).toHaveBeenCalled());
    expect(mockAddUser.mock.calls[0][0]).toBe(3);
    expect(mockAddUser.mock.calls[0][1]).toMatchObject({
      name: "Mitu Rahman",
      phone: "01712345678",
      email: "mitu@example.com",
      password: "chalobhalo1",
      roleId: 3,
    });
  });

  /**
   * One question, not two. The server derives the kind from the
   * permission set whenever it is given one, so asking for both puts a
   * control on screen whose value is discarded — and, because a resort's
   * roles are named after the kinds, it put two chips reading "Manager"
   * on the same form.
   */
  it("asks for the permission set instead of a kind, where there are roles", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fillIn(r);
    expect(r.getByText("Permissions")).toBeTruthy();
    expect(r.queryByText("What they do")).toBeNull();
  });

  it("will not add somebody without saying what they may do", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fillIn(r);
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    expect(mockAddUser).not.toHaveBeenCalled();
    expect(r.getByText("Say what they may do.")).toBeTruthy();
  });

  it("falls back to a plain kind where the resort has no roles", async () => {
    mockRoles.mockResolvedValue([]);
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fillIn(r);
    await fireEvent.press(r.getByRole("button", { name: "Housekeeping" }));
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    await waitFor(() => expect(mockAddUser).toHaveBeenCalled());
    expect(mockAddUser.mock.calls[0][1]).toMatchObject({ role: "HOUSEKEEPING" });
    expect(mockAddUser.mock.calls[0][1].roleId).toBeUndefined();
  });

  /**
   * A first password is the only way in — there is no invitation flow —
   * so an empty one is an account nobody can sign into.
   *
   * Non-empty is the whole rule, which is what `CreateUserDto` asks and
   * what the console enforces. The API is stricter elsewhere:
   * `SetUserPasswordDto`, the route that *resets* a password, wants
   * eight. The two disagree, and the place to settle that is the DTO —
   * a floor on the phone alone would refuse a password the console had
   * just accepted for the same person.
   */
  it("will not send an account nobody can sign into", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add somebody" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Mitu");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01712345678");
    await fireEvent.changeText(r.getByLabelText("Email"), "mitu@example.com");
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    expect(mockAddUser).not.toHaveBeenCalled();
    expect(r.getByText("They need a password to sign in with.")).toBeTruthy();
  });

  /** Short is the console's business, not this form's. */
  it("takes a short password, because the route and the console both do", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add somebody" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Mitu");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01712345678");
    await fireEvent.changeText(r.getByLabelText("Email"), "mitu@example.com");
    await fireEvent.changeText(r.getByLabelText("First password"), "short");
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    await waitFor(() => expect(mockAddUser).toHaveBeenCalled());
    expect(mockAddUser.mock.calls[0][1].password).toBe("short");
  });

  /** The contact already on the platform is the one fact that explains the refusal. */
  it("shows the API's own words when it is refused", async () => {
    mockAddUser.mockRejectedValue(new Error("That phone number is already in use"));
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add somebody" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add somebody" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Mitu");
    await fireEvent.changeText(r.getByLabelText("Phone"), "01712345678");
    await fireEvent.changeText(r.getByLabelText("Email"), "mitu@example.com");
    await fireEvent.changeText(r.getByLabelText("First password"), "chalobhalo1");
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await fireEvent.press(r.getByRole("button", { name: "Add them" }));
    await waitFor(() => expect(r.getByText(/already in use/)).toBeTruthy());
  });
});

describe("what a role may do", () => {
  it("lists the roles and how many hold each", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Manager")).toBeTruthy());
    expect(r.getByText("Administrator")).toBeTruthy();
  });

  /**
   * Administrator resolves to `*` at read time, so its stored list
   * decides nothing. A matrix of ticked boxes that change no behaviour
   * reads as control and is worse than no boxes.
   */
  it("does not offer to edit Administrator", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Administrator")).toBeTruthy());
    expect(r.getByText("Everything, always")).toBeTruthy();
    await fireEvent.press(r.getByLabelText("Administrator, held by 1 of the team"));
    expect(r.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("opens one role at a time, with its groups shut", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Manager")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Manager, held by 1 of the team"));
    await waitFor(() => expect(r.getByText("Money")).toBeTruthy());
    // the thirty are not on screen: the group is shut until it is opened
    expect(r.queryByText("Record expenses")).toBeNull();
  });

  /**
   * The whole point. "Permission-e expense-ta add nai" — it is here, in
   * Money, and ticking it sends `expenses.create`, which is the key the
   * expenses screen asks `can()` about.
   */
  it("reaches the expense permission the owner could not find", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Manager")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Manager, held by 1 of the team"));
    await waitFor(() => expect(r.getByText("Money")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Money, 1 of 5 allowed"));
    await waitFor(() => expect(r.getByRole("switch", { name: "Record expenses" })).toBeTruthy());
    await fireEvent.press(r.getByRole("switch", { name: "Record expenses" }));
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalled());
    expect(mockUpdateRole.mock.calls[0][0]).toBe(3);
    expect(mockUpdateRole.mock.calls[0][1].permissions).toContain("expenses.create");
  });

  it("takes a permission away again", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Manager")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Manager, held by 1 of the team"));
    await waitFor(() => expect(r.getByText("Money")).toBeTruthy());
    await fireEvent.press(r.getByLabelText("Money, 1 of 5 allowed"));
    await waitFor(() => expect(r.getByRole("switch", { name: "View expenses" })).toBeTruthy());
    await fireEvent.press(r.getByRole("switch", { name: "View expenses" }));
    await fireEvent.press(r.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalled());
    expect(mockUpdateRole.mock.calls[0][1].permissions).not.toContain("expenses.view");
  });

  /** A copied set nobody read is how a clerk ends up able to delete expenses. */
  it("creates a role holding nothing at all", async () => {
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByRole("button", { name: "Add a role" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Add a role" }));
    await waitFor(() => expect(r.getByLabelText("Name")).toBeTruthy());
    await fireEvent.changeText(r.getByLabelText("Name"), "Night manager");
    await fireEvent.press(r.getByRole("button", { name: "Create it" }));
    await waitFor(() => expect(mockCreateRole).toHaveBeenCalled());
    expect(mockCreateRole.mock.calls[0][1]).toEqual({ name: "Night manager", permissions: [] });
  });

  it("is read-only for somebody who may not manage roles", async () => {
    mockCan = (k) => k !== "roles.manage";
    const r = await open(RolesScreen);
    await waitFor(() => expect(r.getByText("Manager")).toBeTruthy());
    expect(r.queryByRole("button", { name: "Add a role" })).toBeNull();
    await fireEvent.press(r.getByLabelText("Manager, held by 1 of the team"));
    expect(r.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

/**
 * Changing somebody already on the team (2026-09-22).
 *
 * The console's team table carries two controls on every row — a
 * permission-set picker and Activate / Suspend — and the phone carried
 * neither. So an owner could finally tick "Record expenses" on the
 * Manager role and still had nowhere to put their manager on it, which
 * leaves the original complaint half-fixed.
 *
 * Found by reading the console rather than by being told, which is the
 * standing instruction: the console is where the answer is.
 */
/**
 * What a row says somebody holds (2026-09-22).
 *
 * Seen on the live demo resort, whose only user has no custom role: the
 * row fell back to `person.role` — the derived account kind — and
 * printed `RESORT_ADMIN`, underscore and all. A raw enum in front of a
 * reader is the fault this codebase has spent commits removing.
 */
describe("what a row says somebody holds", () => {
  it("names the permission set where there is one", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Front Desk")).toBeTruthy());
  });

  /** The console's wording, and its comment says the wording is deliberate. */
  it("says so plainly where there is none, rather than printing the enum", async () => {
    mockUsers.mockResolvedValue([person({ roleId: null, roleName: null, role: "RESORT_ADMIN" })]);
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("No role set")).toBeTruthy());
    expect(r.queryByText("RESORT_ADMIN")).toBeNull();
  });
});

describe("changing somebody already on the team", () => {
  it("opens for somebody who may manage users", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    await waitFor(() => expect(r.getByText("Permissions")).toBeTruthy());
  });

  it("does not open for somebody who may not", async () => {
    mockCan = (k) => k !== "users.manage";
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    expect(r.queryByRole("button", { name: "Suspend them" })).toBeNull();
  });

  /** The path an owner takes to fix "manager can't input expense". */
  it("moves them onto another permission set", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    await waitFor(() => expect(r.getByRole("button", { name: "Manager" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockUpdateUser.mock.calls[0][0]).toBe(3);
    expect(mockUpdateUser.mock.calls[0][1]).toBe(4);
    expect(mockUpdateUser.mock.calls[0][2]).toEqual({ roleId: 3 });
  });

  /** Suspending is not deleting: the row stays and their bookings keep naming them. */
  it("suspends somebody who is working", async () => {
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    await waitFor(() => expect(r.getByRole("button", { name: "Suspend them" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Suspend them" }));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockUpdateUser.mock.calls[0][2]).toEqual({ status: "suspended" });
  });

  it("lets a suspended colleague back in", async () => {
    mockUsers.mockResolvedValue([person({ status: "suspended" })]);
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    await waitFor(() => expect(r.getByRole("button", { name: "Let them back in" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Let them back in" }));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockUpdateUser.mock.calls[0][2]).toEqual({ status: "active" });
  });

  /**
   * The API keeps the invariant that matters — the last administrator
   * cannot be demoted — and answers with a sentence saying so. Showing
   * it beats a change that silently did not happen.
   */
  it("shows the API's own words when it refuses", async () => {
    mockUpdateUser.mockRejectedValue(new Error("The last administrator cannot be demoted"));
    const r = await open(TeamScreen);
    await waitFor(() => expect(r.getByText("Karim")).toBeTruthy());
    await fireEvent.press(r.getByLabelText(/^Karim, Front Desk/));
    await waitFor(() => expect(r.getByRole("button", { name: "Manager" })).toBeTruthy());
    await fireEvent.press(r.getByRole("button", { name: "Manager" }));
    await waitFor(() => expect(r.getByText(/last administrator/)).toBeTruthy());
  });
});
