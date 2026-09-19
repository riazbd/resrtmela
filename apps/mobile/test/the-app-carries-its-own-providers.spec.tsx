/**
 * What the app wraps every screen in — checked against the app, not the test
 * harness.
 *
 * The dashboard's own spec passes because `test/harness.tsx` supplies a query
 * client. The app did not. Every one of those tests was green while the real
 * screen, opened in a browser against production, drew nothing at all and put
 * "No QueryClient set" on the console — because `_layout.tsx` had a session
 * provider and no data layer under it.
 *
 * That is the gap a screen test cannot see by construction: it mounts the
 * screen, never the thing around it. So this mounts what the app actually
 * mounts and asks whether a screen inside it can read — the same question
 * `app-boots.spec.ts` asks of the API's container, for the same reason.
 */
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { keys, useApi } from "@rh/app-core";

/** No device under a test, and this file is not about storage. */
jest.mock("../src/device/storage", () => {
  const map = new Map<string, string>();
  return {
    deviceStorage: () => ({
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    }),
  };
});

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SessionProvider } = require("../src/api/session");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Settle } = require("./harness");

/** A screen, reduced to the one thing every screen does. */
function AScreenThatReads() {
  const q = useApi(keys.rooms(1), async () => "read", { retry: false });
  return <Text>{q.data ?? "waiting"}</Text>;
}

describe("the providers the app puts around every screen", () => {
  it("includes a query client, so a screen can read", async () => {
    const r = await render(
      <SessionProvider>
        {/* turns off the two defaults that are right on a phone and stop
            jest from exiting — see test/harness.tsx */}
        <Settle />
        <AScreenThatReads />
      </SessionProvider>,
    );
    await waitFor(() => expect(r.getByText("read")).toBeTruthy());
  });

  /**
   * Money is drawn by `Money`, which reads a format from a context. Without
   * the provider it falls back to a default that is right by accident today
   * and wrong the first time a resort is not in taka.
   */
  it("includes the money format, so figures carry the resort's currency", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Money } = require("../src/design/money");
    const r = await render(
      <SessionProvider>
        <Settle />
        <Money amount={1500} decimals={0} />
      </SessionProvider>,
    );
    expect(r.getByText("৳1,500")).toBeTruthy();
  });
});
