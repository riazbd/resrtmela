/**
 * The resort's own settings, as much of them as belongs on a phone.
 *
 * The console's settings page is 2,144 lines across twelve tabs. Six of
 * those tabs are things an owner genuinely changes away from a desk —
 * the resort's own details, what it charges tax at, the lists its forms
 * offer, who works there, what the rooms cost by season, and how it
 * looks to a guest. The other six are not: a subscription, an API key,
 * a permission matrix, a data export and an activity log are all
 * read-across-a-wide-table work, and a phone makes each of them worse.
 *
 * So this is a hub, and what is missing from it is missing on purpose.
 * The line at the bottom says so, because a person who cannot find the
 * API keys should learn that from the screen rather than by hunting.
 */
import { ScrollView, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { Empty } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { space } from "../../src/design/tokens";

interface Section {
  href: string;
  title: string;
  hint: string;
  /** What the API asks for before it will answer. */
  perm?: string;
}

const SECTIONS: Section[] = [
  {
    href: "/settings/resort",
    title: "The resort",
    hint: "Name, where it is, its day, and what it charges tax at",
    perm: "settings.manage",
  },
  {
    href: "/settings/lists",
    title: "Lists",
    hint: "Payment methods, booking sources, expense categories",
    perm: "settings.manage",
  },
  {
    href: "/settings/team",
    title: "Team",
    hint: "Who works here and what each of them may do",
    perm: "users.manage",
  },
  {
    href: "/settings/rates",
    title: "Rate plans",
    hint: "What a room costs in a season, over its base rate",
    perm: "rooms.manage",
  },
];

export default function SettingsScreen() {
  const { activeResort, can } = useAuth();
  const mine = SECTIONS.filter((s) => !s.perm || can(s.perm));

  const header = <Stack.Screen options={{ title: "Settings" }} />;

  if (!activeResort) {
    return (
      <>
        {header}
        <WhichResort />
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page}>
        <Card title={activeResort.name}>
          {mine.length === 0 ? (
            <Empty
              message="Nothing here is yours to change"
              hint="Ask the owner for the permissions you need."
            />
          ) : (
            mine.map((section, i) => (
              <Row
                key={section.href}
                title={section.title}
                subtitle={section.hint}
                last={i === mine.length - 1}
                accessibilityLabel={`${section.title} — ${section.hint}`}
                onPress={() => router.push(section.href as never)}
              />
            ))
          )}
        </Card>

        {/* said on the screen rather than learned by hunting for it */}
        <Text step="caption" tone="muted" style={styles.footnote}>
          The subscription, API keys, permissions, the activity log and your data
          exports stay on the desk — each of them is a wide table, and a phone
          makes them harder to read rather than easier.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  footnote: { textAlign: "center" },
});
