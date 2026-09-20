/**
 * Your own account.
 *
 * Who is signed in, which resorts they can reach, and the one thing
 * everybody needs and no permission gates: changing your own password.
 * `CONSOLE_NAV` has no entry for that — it belongs to whoever is signed
 * in, whatever they are — so the More list adds it and this screen owns
 * it.
 *
 * `currentPassword` is *omitted* rather than sent empty when there is
 * nothing to omit. An account opened by invitation has no password yet
 * and the controller only demands the old one where a hash exists; an
 * empty string is a wrong answer where an absent field is no answer.
 * The typed client already knows that, which is why this screen does
 * not.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { displayEmail } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { Button } from "../../../src/design/button";
import { Field, Input } from "../../../src/design/input";
import { Empty } from "../../../src/design/states";
import { Card, Row } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

/** Short enough to type on a phone, long enough to be worth typing. */
const SHORTEST = 8;

export default function ProfileScreen() {
  const { me, activeResort, logout } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /**
   * Checked here as well as on the server, because these are the two
   * mistakes a person makes while typing something they cannot see —
   * and a round trip to be told "they do not match" is a round trip
   * that loses both boxes.
   */
  const tooShort = next.length > 0 && next.length < SHORTEST;
  const mismatch = again.length > 0 && next !== again;
  const incomplete = next.length < SHORTEST || next !== again;

  const change = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.auth.changePassword(next, current || undefined);
      setCurrent("");
      setNext("");
      setAgain("");
      setTried(false);
      setDone(true);
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const header = <Stack.Screen options={{ title: "My Profile" }} />;

  if (!me) {
    return (
      <>
        {header}
        <Empty message="Not signed in" hint="Sign in to see your account." />
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <Text step="title" weight="bold" tone="title">
            {me.name}
          </Text>
          <View style={styles.facts}>
            <Row title="Phone" meta={me.phone || "—"} accessibilityLabel={`Phone: ${me.phone || "not set"}`} />
            <Row
              title="Email"
              // a placeholder address reads as "not set" rather than as a
              // real address nobody can receive at
              meta={displayEmail(me.email)}
              accessibilityLabel={`Email: ${displayEmail(me.email)}`}
            />
            <Row title="Role" meta={me.role} last accessibilityLabel={`Role: ${me.role}`} />
          </View>
        </Card>

        {me.resorts.length > 0 ? (
          <Card title={me.resorts.length === 1 ? "Your resort" : "Your resorts"}>
            {me.resorts.map((link, i) => (
              <Row
                key={link.resort.id}
                title={link.resort.name}
                subtitle={link.resort.id === activeResort?.id ? "Open now" : undefined}
                last={i === me.resorts.length - 1}
                accessibilityLabel={`${link.resort.name}${link.resort.id === activeResort?.id ? ", open now" : ""}`}
              />
            ))}
          </Card>
        ) : null}

        <Card title="Change your password">
          <View style={styles.fields}>
            <Field
              label="Current password"
              hint="Leave it empty if you have never set one — an invitation opens an account without"
            >
              <Input
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
              />
            </Field>
            <Field
              label="New password"
              hint={`At least ${SHORTEST} characters`}
              error={tried && tooShort ? `At least ${SHORTEST} characters.` : null}
            >
              <Input
                value={next}
                onChangeText={(text) => {
                  setNext(text);
                  setDone(false);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                invalid={tried && tooShort}
              />
            </Field>
            <Field
              label="New password again"
              error={mismatch ? "These two do not match." : null}
            >
              <Input
                value={again}
                onChangeText={(text) => {
                  setAgain(text);
                  setDone(false);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                invalid={mismatch}
              />
            </Field>

            {tried && incomplete && !tooShort && !mismatch ? (
              <Text step="small" tone="danger" weight="medium">
                Type the new password twice.
              </Text>
            ) : null}

            {done ? (
              <View style={styles.done}>
                <Text step="small" tone="ok" weight="medium">
                  Password changed. It is the one to use next time you sign in.
                </Text>
              </View>
            ) : null}

            {refused ? (
              <View style={styles.refused}>
                <Text step="small" tone="danger" weight="medium">
                  {refused}
                </Text>
              </View>
            ) : null}

            <Button label="Change it" loading={change.busy} onPress={change.go} />
          </View>
        </Card>

        <Button
          label="Sign out"
          kind="subtle"
          onPress={() => {
            logout();
            router.replace("/login");
          }}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  facts: { paddingTop: space.md },
  fields: { gap: space.md },
  done: {
    backgroundColor: color.ok.bg,
    borderWidth: 1,
    borderColor: color.ok.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
