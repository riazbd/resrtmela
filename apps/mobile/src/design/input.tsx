/**
 * A labelled box, and the box itself.
 *
 * `Field` owns the label, the hint and the refusal; `Input` owns only the
 * typing. They are separate because a field also wraps a Select, a switch
 * and a date picker, and all four owe a person the same three things: what
 * this is, how to fill it, and what was wrong with what they filled in.
 *
 * A hint and a refusal are kept apart on purpose. The console had a screen
 * where they shared a slot, so the instruction vanished exactly when
 * somebody most needed it.
 */
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Text, step } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

export interface FieldProps {
  label: string;
  children: ReactNode;
  /** How to fill it in. Always visible. */
  hint?: string;
  /** What was wrong. Replaces nothing; it is drawn under the hint. */
  error?: string | null;
  style?: ViewStyle;
}

export function Field({ label, children, hint, error, style }: FieldProps) {
  const id = useId();
  /**
   * The label is attached to the control rather than merely drawn above it,
   * so a screen reader announces "Phone or email, edit box" and a test finds
   * the box by the words a person reads. Every control this wraps takes
   * `accessibilityLabel`, so one clone does for all of them.
   */
  const labelled = isValidElement(children)
    ? cloneElement(children as ReactElement<{ accessibilityLabel?: string; nativeID?: string }>, {
        accessibilityLabel: label,
        nativeID: id,
      })
    : children;

  return (
    <View style={[styles.field, style]}>
      <Text step="small" tone="muted" weight="medium" nativeID={`${id}-label`}>
        {label}
      </Text>
      {labelled}
      {hint ? (
        <Text step="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text step="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends Omit<TextInputProps, "style"> {
  invalid?: boolean;
  style?: ViewStyle;
}

export function Input({ invalid = false, style, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={color.ink[400]}
      // the phone's own font setting applies, within the same cap the rest
      // of the type scale uses
      maxFontSizeMultiplier={1.4}
      {...props}
      style={[styles.input, invalid ? styles.invalid : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  input: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.title,
    // a TextInput is not a `Text`, so it cannot inherit the scale — it takes
    // the same step by name instead. Writing 15 here is what the guard in
    // one-source-for-a-colour.spec.ts exists to stop.
    ...step("body"),
  },
  invalid: { borderColor: color.danger.fg },
});
