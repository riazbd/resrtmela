/**
 * The status bar strip is spent once, at the root, and never twice.
 *
 * The owner's screenshots showed both halves of this going wrong at the same
 * time. The sign-up form drew "PLAN · Starter" through the clock and "Change"
 * through the wifi icon — nothing padded it, because it is not in the tab
 * group and the tab group was the only thing that padded. And on the screens
 * that *were* padded, the update bar sat above the navigator and so went under
 * the clock itself, while the tabs spent the inset a second time below it and
 * left a band of nothing.
 *
 * One `TopEdge` at the root answers both, and what makes it safe is the half
 * that is easy to leave out: it hands `top: 0` down. React Navigation's
 * headers, `SafeAreaView` and every `useSafeAreaInsets` below read that
 * context, so none of them can spend the same inset again. That is the
 * contract pinned here.
 *
 * **The probe reads the context, not the hook.** `test/setup.ts` replaces
 * `useSafeAreaInsets` with a fixed notch so screens mount at all, and a mocked
 * hook cannot see a provider — so a probe calling it would report the mock's
 * numbers whatever `TopEdge` did, and pass while the app was broken.
 */
import { useContext } from "react";
import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { TopEdge } from "../src/design/top-edge";

/** What `test/setup.ts` says a phone is: a notch and a gesture bar. */
const NOTCH = 47;
const GESTURE_BAR = 34;

function Below() {
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <View>
      <Text testID="top">{String(insets?.top ?? "none")}</Text>
      <Text testID="bottom">{String(insets?.bottom ?? "none")}</Text>
    </View>
  );
}

const inside = async (tone?: "screen" | "brand") =>
  render(
    <TopEdge tone={tone}>
      <Below />
    </TopEdge>,
  );

describe("the top edge", () => {
  it("is spent, so nothing below it can spend it again", async () => {
    const r = await inside();
    expect(r.getByTestId("top").props.children).toBe("0");
  });

  /**
   * Only the top. The tab bar clears the gesture bar with `bottom`, and a
   * `TopEdge` that zeroed every edge would put the tabs underneath it.
   */
  it("leaves the bottom alone for the tab bar", async () => {
    const r = await inside();
    expect(r.getByTestId("bottom").props.children).toBe(String(GESTURE_BAR));
  });

  it("pads by exactly what the phone reported", async () => {
    const r = await inside();
    const edge = r.getByTestId("top-edge");
    expect(edge.props.style.paddingTop).toBe(NOTCH);
  });

  /**
   * The strip has to match what is under it. A grey band above the green
   * update bar reads as a gap somebody forgot rather than a bar somebody
   * meant, which is what the screenshots showed.
   */
  it("takes the colour of whatever the caller put at the top", async () => {
    const plain = await inside();
    const banner = await inside("brand");
    expect(plain.getByTestId("top-edge").props.style.backgroundColor).not.toBe(
      banner.getByTestId("top-edge").props.style.backgroundColor,
    );
  });
});
