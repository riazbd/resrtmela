/**
 * The harness itself, tested once so that no screen test has to wonder.
 *
 * Two things here are easy to get wrong and expensive to debug inside a real
 * screen, so they are pinned down in the smallest component that can show
 * them.
 *
 * **`render` is asynchronous in @testing-library/react-native 14.** It
 * returns a promise, and a test that forgets to await it gets
 * `r.getByText is not a function` — or, using the `screen` global, "`render`
 * function has not been called", which points at the wrong line entirely.
 * Every screen test in this app awaits its render, and this is why.
 *
 * **A press is `fireEvent.press`, not a DOM click.** There is no DOM here:
 * the tree is React Native's, and the queries read accessibility roles and
 * labels — which is also the reason a screen written for this harness ends
 * up accessible to a screen reader rather than merely testable.
 */
import { render, fireEvent } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

function Probe({ onPress }: { onPress: () => void }) {
  return (
    <View>
      <Text>a screen can be read</Text>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>tap me</Text>
      </Pressable>
    </View>
  );
}

describe("the test harness", () => {
  it("draws a React Native tree and finds text in it", async () => {
    const r = await render(<Probe onPress={() => {}} />);
    expect(r.getByText("a screen can be read")).toBeTruthy();
  });

  it("delivers a press to the component that asked for one", async () => {
    const pressed = jest.fn();
    const r = await render(<Probe onPress={pressed} />);
    fireEvent.press(r.getByRole("button"));
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  /**
   * `jest-expo` mocks the native modules, and `test/setup.ts` stands in for
   * the safe-area insets a phone would report. A screen laid out against
   * those insets renders here rather than measuring for ever and drawing
   * nothing, which is what the real provider does without native code.
   */
  it("reports the safe-area insets a phone would", async () => {
    const { useSafeAreaInsets } = require("react-native-safe-area-context");
    function Insets() {
      const i = useSafeAreaInsets();
      return <Text>{`top ${i.top} bottom ${i.bottom}`}</Text>;
    }
    const r = await render(<Insets />);
    expect(r.getByText("top 47 bottom 34")).toBeTruthy();
  });
});
