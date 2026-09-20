/**
 * What every screen test can assume, and nothing more.
 *
 * `jest-expo` already mocks the native modules Expo ships. What it cannot
 * know is this app's own contract with the device, so the little that is
 * shared between screen tests is set here rather than repeated in each file.
 */
/**
 * A phone reports its safe area from native code, which is absent under a
 * test, and the real provider then measures forever and renders nothing — so
 * a screen inside it mounts to an empty tree and every query fails with a
 * message about the element, not about the insets. Fixed numbers stand in:
 * a notch at the top and a home indicator at the bottom, which is the shape
 * a layout has to survive anyway.
 */
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  const inset = { top: 47, right: 0, bottom: 34, left: 0 };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (i: typeof inset) => React.ReactNode }) =>
      children(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

/**
 * Silence the one warning that is the harness's own and not the app's:
 * `useNativeDriver` is unavailable without a native animation module, which
 * is exactly what a test does not have. Every other warning is left audible,
 * because a React key warning or an act() warning is a defect in a screen.
 */
const realWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("useNativeDriver")) return;
    realWarn(...args);
  };
});
afterAll(() => {
  console.warn = realWarn;
});

/**
 * NetInfo reads the radio through a native module, and without one its
 * reachability probe dereferences an undefined state and throws inside the
 * provider's first effect — which takes the whole app tree with it, because
 * the outbox mounts above every screen.
 *
 * The package ships its own mock for exactly this. The default it reports
 * is "connected", which is the right assumption for a test: a spec that
 * wants to be offline says so.
 */
jest.mock("@react-native-community/netinfo", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);
