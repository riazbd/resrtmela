/**
 * Signing in.
 *
 * Written against the console's own sign-in screen rather than invented:
 * one box that takes either a phone or an email, the same landing rule, the
 * same neutral sentence after a reset request. Two clients that disagree
 * about who may sign in, or about what a refusal says, are two products.
 */
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { RESET_REQUESTED_MESSAGE, landingFor } from "@rh/shared";
import { useAuth, client } from "../src/api/session";
import { Button } from "../src/design/button";
import { Field, Input } from "../src/design/input";
import { Text } from "../src/design/text";
import { useAction } from "../src/design/use-action";
import { color, radius, space } from "../src/design/tokens";

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [askingForReset, setAskingForReset] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetAsked, setResetAsked] = useState(false);

  /**
   * `useAction`, not a `busy` flag of this screen's own. Two taps in one
   * frame both read the old props, and two sign-in requests where the
   * second lands after the first has already routed away is the kind of
   * thing that is invisible until somebody is on a bad connection.
   */
  const signIn = useAction(
    useCallback(async () => {
      setError(null);
      try {
        const me = await login(identifier, password);
        /**
         * "/dashboard" for everyone sent the platform owner into somebody
         * else's resort and an agent to a screen their permissions refuse.
         * The rule is `landingFor`, so both clients obey the same one.
         */
        router.replace(landingFor(me.role) as never);
      } catch (ex) {
        setError((ex as Error).message);
      }
    }, [login, identifier, password]),
  );

  const askForReset = useAction(
    useCallback(async () => {
      try {
        await client.auth.forgotPassword(resetIdentifier);
      } catch {
        /**
         * The same sentence either way. The endpoint refuses to say whether
         * an address has an account, and a different message on a network
         * failure would say it for them.
         */
      }
      setResetAsked(true);
    }, [resetIdentifier]),
  );

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text step="figure" weight="bold" tone="title">
            Resort Mela
          </Text>
          <Text step="body" tone="muted">
            {/*
              Not "your resort console". Agencies sign in on this same
              screen and their whole side of the app is not a resort —
              being greeted as staff at a resort you do not work at is
              the same mistake the More screen made at the top of its
              menu, one screen earlier.
            */}
            Sign in to keep the day straight
          </Text>
        </View>

        <View style={styles.card}>
          <Field label="Phone or email">
            <Input
              placeholder="01XXXXXXXXX or you@email.com"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              // one box for both, so the keyboard cannot decide for them
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
            />
          </Field>

          <Field label="Password">
            <Input
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={signIn.go}
            />
          </Field>

          {error ? (
            <View style={styles.refusal}>
              <Text step="small" tone="danger">
                {error}
              </Text>
            </View>
          ) : null}

          <Button label="Sign in" onPress={signIn.go} loading={signIn.busy} />

          <Button
            label="Forgot password?"
            kind="ghost"
            onPress={() => {
              setAskingForReset((open) => !open);
              setResetAsked(false);
            }}
          />
        </View>

        {askingForReset ? (
          <View style={styles.card}>
            {resetAsked ? (
              <Text step="small" tone="ok">
                {RESET_REQUESTED_MESSAGE}
              </Text>
            ) : (
              <>
                <Field
                  label="Phone or email for the reset link"
                  hint="The link goes to the email address on the account."
                >
                  <Input
                    placeholder="01XXXXXXXXX or you@email.com"
                    value={resetIdentifier}
                    onChangeText={setResetIdentifier}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                </Field>
                <Button
                  label="Send reset link"
                  kind="subtle"
                  onPress={askForReset.go}
                  loading={askForReset.busy}
                />
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.screen },
  page: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.lg,
    gap: space.lg,
  },
  brand: { gap: space.xs, alignItems: "center", marginBottom: space.sm },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
    gap: space.md,
  },
  refusal: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
