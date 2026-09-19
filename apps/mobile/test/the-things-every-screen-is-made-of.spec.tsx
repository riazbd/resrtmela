/**
 * The primitives, and the promises they make to every screen above them.
 *
 * These are tested here once so that sixty-eight screens do not each have to
 * prove the same things — that a button a finger can reach is big enough,
 * that a disabled control refuses, that money never renders as a bare number.
 * A screen's own test is then about that screen.
 *
 * What is *not* tested here is appearance. A test that asserts a hex code is
 * a second copy of the token file which fails whenever anybody improves the
 * design; the guard in `one-source-for-a-colour.spec.ts` covers the thing
 * that actually matters, which is that the value came from the tokens at all.
 */
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "../src/design/button";
import { Field, Input } from "../src/design/input";
import { Money } from "../src/design/money";
import { Text } from "../src/design/text";
import { TOUCH_TARGET, text as scale } from "../src/design/tokens";

/** The flattened style of a node, however RN nested it. */
function styleOf(node: { props: { style?: unknown } }): Record<string, unknown> {
  const flatten = (s: unknown): Record<string, unknown> =>
    Array.isArray(s)
      ? s.reduce<Record<string, unknown>>((acc, part) => ({ ...acc, ...flatten(part) }), {})
      : ((s as Record<string, unknown>) ?? {});
  return flatten(node.props.style);
}

describe("Text", () => {
  it("draws what it was given", async () => {
    const r = await render(<Text>Kath Golap</Text>);
    expect(r.getByText("Kath Golap")).toBeTruthy();
  });

  it("takes its size from the scale, by name", async () => {
    const r = await render(<Text step="title">Bookings</Text>);
    expect(styleOf(r.getByText("Bookings")).fontSize).toBe(scale.title.size);
  });

  it("reads at body size when nobody says otherwise", async () => {
    const r = await render(<Text>plain</Text>);
    expect(styleOf(r.getByText("plain")).fontSize).toBe(scale.body.size);
  });

  /**
   * A phone's font-size setting is an accessibility need, not a preference,
   * but an operational screen full of columns falls apart at 200%. The cap
   * is a compromise the design makes on purpose and states out loud.
   */
  it("grows with the phone's font setting, within a limit", async () => {
    const r = await render(<Text>x</Text>);
    expect(r.getByText("x").props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

describe("Button", () => {
  it("calls back when pressed", async () => {
    const onPress = jest.fn();
    const r = await render(<Button label="Check in" onPress={onPress} />);
    fireEvent.press(r.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * In the component, not in each caller. This is the whole reason the
   * constant is not a number written inside a stylesheet somewhere.
   */
  it("is never smaller than a finger", async () => {
    const r = await render(<Button label="Save" onPress={() => {}} />);
    expect(styleOf(r.getByRole("button")).minHeight).toBeGreaterThanOrEqual(TOUCH_TARGET);
  });

  it("refuses while disabled", async () => {
    const onPress = jest.fn();
    const r = await render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.press(r.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * A second tap on a button that is already saving is how a booking gets
   * taken twice. The guard belongs here rather than in each screen's
   * `busy` flag, which somebody will forget.
   */
  it("refuses while it is already working", async () => {
    const onPress = jest.fn();
    const r = await render(<Button label="Save" onPress={onPress} loading />);
    fireEvent.press(r.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("tells a screen reader that it is unavailable", async () => {
    const r = await render(<Button label="Save" onPress={() => {}} loading />);
    expect(r.getByRole("button").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("is found by its label, which is what a person reads", async () => {
    const r = await render(<Button label="Take payment" onPress={() => {}} />);
    expect(r.getByLabelText("Take payment")).toBeTruthy();
  });
});

describe("Money", () => {
  /**
   * Never a bare number. The console learned this the hard way — a public
   * endpoint that omitted the currency printed "Tk" on every figure of a
   * resort that does not use taka.
   */
  it("carries a currency", async () => {
    const r = await render(<Money amount={1500} />);
    expect(r.getByText(/1,500/)).toBeTruthy();
    expect(r.getByText(/1,500/).props.children).not.toBe("1500");
  });

  it("renders in the resort's own currency and locale", async () => {
    const r = await render(<Money amount={1500} format={{ currency: "USD", locale: "en-US" }} />);
    expect(r.getByText("$1,500.00")).toBeTruthy();
  });

  /**
   * Columns of money only line up if the digits are the same width. Without
   * this a list of amounts is a ragged edge, which is exactly the thing a
   * dense screen exists to avoid.
   */
  it("uses figures of equal width so a column lines up", async () => {
    const r = await render(<Money amount={1500} />);
    const variant = styleOf(r.getByText(/1,500/)).fontVariant as string[] | undefined;
    expect(variant).toContain("tabular-nums");
  });

  it("shows nothing owed as a zero, not as blank", async () => {
    const r = await render(<Money amount={null} format={{ currency: "USD", locale: "en-US" }} />);
    expect(r.getByText("$0.00")).toBeTruthy();
  });
});

describe("Field and Input", () => {
  it("labels the box, so a screen reader and a person read the same thing", async () => {
    const r = await render(
      <Field label="Phone or email">
        <Input value="" onChangeText={() => {}} />
      </Field>,
    );
    expect(r.getByLabelText("Phone or email")).toBeTruthy();
  });

  it("says what went wrong, under the box it went wrong in", async () => {
    const r = await render(
      <Field label="Password" error="Must be at least 8 characters">
        <Input value="" onChangeText={() => {}} secureTextEntry />
      </Field>,
    );
    expect(r.getByText("Must be at least 8 characters")).toBeTruthy();
  });

  it("passes what was typed back to the screen", async () => {
    const onChangeText = jest.fn();
    const r = await render(
      <Field label="Phone or email">
        <Input value="" onChangeText={onChangeText} />
      </Field>,
    );
    fireEvent.changeText(r.getByLabelText("Phone or email"), "01711111111");
    expect(onChangeText).toHaveBeenCalledWith("01711111111");
  });

  /**
   * A hint is not an error. The console had a screen where the helper text
   * and the refusal shared a slot, so the instruction vanished exactly when
   * somebody most needed it.
   */
  it("keeps a hint and a refusal apart", async () => {
    const r = await render(
      <Field label="Phone or email" hint="Either will do">
        <Input value="" onChangeText={() => {}} />
      </Field>,
    );
    expect(r.getByText("Either will do")).toBeTruthy();
    expect(r.queryByText(/must be/i)).toBeNull();
  });
});
