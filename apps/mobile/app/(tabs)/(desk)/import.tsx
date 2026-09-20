/**
 * Bringing the old books in — which a phone cannot do, and says so.
 *
 * This screen exists because `CONSOLE_NAV` offers Import and the More
 * list is generated from it, so without this the entry lands on "Not
 * built yet" — which reads as *unfinished* rather than as *deliberate*,
 * and sends somebody hunting for a screen that is not coming.
 *
 * The reason it is not coming is concrete rather than a matter of
 * taste. Every import route is a `POST` that takes a spreadsheet:
 * there is nothing on the server to *read* here, so a screen could only
 * be a file picker. And an import is the one operation in this product
 * that writes hundreds of rows from a file nobody has checked line by
 * line — the moment most worth having a wide screen, a preview and an
 * undo, none of which a phone offers.
 *
 * So it names the address, which is the one useful thing it can do.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { CONSOLE_URL } from "../../../src/api/config";
import { Button } from "../../../src/design/button";
import { Card, Row } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { color, radius, space } from "../../../src/design/tokens";

/** What the console can bring in, in the order its own page lists them. */
const DATASETS = [
  { name: "Bookings", hint: "Stays, guests and what each one paid" },
  { name: "Expenses", hint: "The cashbook, by date and category" },
  { name: "Restaurant bills", hint: "Tickets and what was on them" },
];

export default function ImportScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Import CSV" }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.why}>
          <Text step="strong" weight="medium" tone="title">
            Import runs on the desk
          </Text>
          <Text step="body" tone="body" style={styles.line}>
            An import writes hundreds of rows from a spreadsheet, and it is
            the one thing in here worth a wide screen, a preview and somebody
            reading it before pressing go.
          </Text>
        </View>

        <Card title="What can be brought in">
          {DATASETS.map((set, i) => (
            <Row
              key={set.name}
              title={set.name}
              subtitle={set.hint}
              last={i === DATASETS.length - 1}
              accessibilityLabel={`${set.name} — ${set.hint}`}
            />
          ))}
        </Card>

        {CONSOLE_URL ? (
          <Card title="Where">
            <Text step="body" tone="body">
              {CONSOLE_URL}/import
            </Text>
            <Text step="caption" tone="muted" style={styles.line}>
              Sign in there with the same account.
            </Text>
          </Card>
        ) : null}

        <Button label="Back" kind="ghost" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  why: {
    gap: space.sm,
    backgroundColor: color.info.bg,
    borderWidth: 1,
    borderColor: color.info.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  line: { marginTop: space.xs },
});
