/**
 * Back goes back (2026-09-28).
 *
 * React Navigation's tab router defaults to `backBehavior: "firstRoute"`:
 * press the phone's Back button and you are put on the *first* tab, wherever
 * you actually were. For resort staff that is the dashboard, which looks
 * enough like home that it never got reported.
 *
 * For an agency the first tab is **Discover resorts** — the screen for
 * finding new resorts to sell. So an agent who opened their team, their
 * wallet, a tour package or anything else from More and pressed Back was put
 * on a screen for shopping, every time, and had to find More again. The owner
 * reported it as every function showing the same thing on the way out.
 *
 * `history` returns to the last screen actually visited. Repeats are dropped,
 * so backing out of a tab visited five times is one press and not five.
 *
 * This renders the layout rather than reading the file, because what matters
 * is the prop reaching the navigator — a constant declared and never passed
 * would read just as well.
 */
import { render } from "@testing-library/react-native";
import { View } from "react-native";

let tabsProps: Record<string, unknown> | null = null;

jest.mock("expo-router", () => {
  const react = jest.requireActual("react");
  const Tabs = (props: Record<string, unknown>) => {
    tabsProps = props;
    return react.createElement(react.Fragment, null, props.children as never);
  };
  Tabs.Screen = () => null;
  return { Tabs, Link: () => null, router: { push: jest.fn() } };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: () => null,
}));

let mockRole = "AGENT";
jest.mock("../src/api/session", () => ({
  useAuth: () => ({
    me: { id: 9, name: "Karim", role: mockRole },
    role: mockRole,
    can: () => true,
    features: [],
  }),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const TabLayout = require("../app/(tabs)/_layout").default;
const { tabsFor } = require("../src/nav/tabs");
/* eslint-enable @typescript-eslint/no-var-requires */

beforeEach(() => {
  tabsProps = null;
  mockRole = "AGENT";
});

describe("the tab bar's back button", () => {
  it("returns to the last screen visited, not to the first tab", async () => {
    await render(<View><TabLayout /></View>);

    expect(tabsProps).toBeTruthy();
    expect(tabsProps!.backBehavior).toBe("history");
  });

  it("does the same for resort staff, who had the gentler version of it", async () => {
    mockRole = "MANAGER";
    await render(<View><TabLayout /></View>);

    expect(tabsProps!.backBehavior).toBe("history");
  });
});

describe("why it mattered most to an agency", () => {
  /**
   * The default sends you to the first tab, so this names what that tab is.
   * If the agent's bar is ever reordered so that the first tab is somewhere
   * worth being, the reason above stops being true and should be reread —
   * `history` is still right, but for a weaker reason.
   */
  it("starts the agency's bar on a screen nobody wants to be returned to", () => {
    const bar = tabsFor({ role: "AGENT", can: () => true, features: [] });

    expect(bar[0].href).toBe("/agent/discover");
    expect(bar[0].label).toBe("Discover resorts");
  });
});
