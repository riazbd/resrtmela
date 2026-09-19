/**
 * The four things a screen owes a person besides its happy path.
 *
 * *Loading*, *empty* and *failed* are the plan's constraint, and the reason
 * they are one module is that a screen which must import from four places to
 * be complete will be completed three times out of four.
 *
 * *Stale* is the phone's own fourth. The console's figures are either on the
 * screen or not; a phone keeps the last ones it saw and shows them before the
 * network answers, which is the right thing to do on a hill-district
 * connection and a dangerous one to do silently. A clerk reading yesterday's
 * occupancy cannot tell it is yesterday's unless the screen says so.
 */
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ApiError } from "@rh/shared";
import { Button } from "./button";
import { Text } from "./text";
import { color, radius, space } from "./tokens";

/**
 * Waiting.
 *
 * `what` is not decoration. A spinner alone says "something is happening" and
 * a screen with three of them says it three times; naming the thing is what
 * makes a slow day sheet distinguishable from a slow room list.
 */
export function Loading({ what }: { what: string }) {
  const sentence = `Loading ${what}…`;
  return (
    <View style={styles.middle} accessibilityLabel={sentence} accessibilityRole="progressbar">
      <ActivityIndicator color={color.brand[600]} />
      <Text step="small" tone="muted">
        {sentence}
      </Text>
    </View>
  );
}

/**
 * Nothing to show, and that is the truth rather than a failure.
 *
 * The message is the screen's own words — "No arrivals today", not "No data".
 * `hint` is for the case where the emptiness has something to do about it.
 */
export function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <View style={styles.middle}>
      <Text step="body" weight="medium" tone="title" style={styles.centred}>
        {message}
      </Text>
      {hint ? (
        <Text step="small" tone="muted" style={styles.centred}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Whether asking the same question again could get a different answer.
 *
 * A 4xx is the server's considered reply — you may not, that does not exist,
 * this stay is already checked out. Offering "Try again" for one of those
 * says it might pass, which is false and wastes the reader's time. Anything
 * else is worth another go: a dropped packet on a hill road is a normal
 * Tuesday. This is `worthRetrying`'s rule, drawn instead of fetched.
 */
function couldChange(error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : 0;
  return !(status >= 400 && status < 500);
}

/**
 * It failed, and the screen says what the server said.
 *
 * The API writes its refusals as sentences for the person who hit them.
 * Replacing one with "Something went wrong" throws away the only part that
 * helps, and fourteen places in the console once did worse — they swallowed
 * the error and drew an empty list.
 */
export function Problem({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const said = error instanceof Error ? error.message : "Could not load this";
  return (
    <View style={styles.middle}>
      <View style={styles.notice}>
        <Text step="body" tone="danger" style={styles.centred}>
          {said || "Could not load this"}
        </Text>
      </View>
      {onRetry && couldChange(error) ? (
        <Button label="Try again" kind="ghost" block={false} onPress={onRetry} />
      ) : null}
    </View>
  );
}

/**
 * The figures on screen came off this phone, not off the server.
 *
 * `age` is `useApi`'s own `stale` — already in the reader's words — and null
 * whenever the figures are live, in which case there is nothing to say and
 * this draws nothing at all.
 */
export function Stale({ age }: { age: string | null }) {
  if (!age) return null;
  return (
    <View style={styles.stale}>
      <Text step="caption" tone="warn">
        Showing what this phone last saw — {age}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  middle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.md,
  },
  centred: { textAlign: "center" },
  notice: {
    backgroundColor: color.danger.bg,
    borderColor: color.danger.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  stale: {
    backgroundColor: color.warn.bg,
    borderBottomColor: color.warn.line,
    borderBottomWidth: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
});
