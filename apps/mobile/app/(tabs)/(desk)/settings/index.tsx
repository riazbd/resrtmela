/**
 * The resort's settings — every one the console has, on the phone.
 *
 * This said, until 2026-10-02, that the subscription, the API keys, the
 * activity log and the data exports "stay on the desk" because they are wide
 * tables. The owner's answer: "jahai web e ache, tahai app e thakbe" —
 * whatever the console has, the app has. So every tab of the console's
 * settings is a tile here, drawn for a phone rather than left out of one.
 */
import { ScrollView, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Empty } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Tiles, type TileIcon } from "../../../../src/design/tiles";
import { space } from "../../../../src/design/tokens";

interface Section {
  href: string;
  title: string;
  hint: string;
  icon: TileIcon;
  /** What the API asks for before it will answer. */
  perm?: string;
}

const SECTIONS: Section[] = [
  { href: "/settings/resort", title: "The resort", hint: "Name, its day, tax, agents' terms, numbering", icon: "home-city", perm: "settings.manage" },
  { href: "/settings/subscription", title: "Subscription", hint: "Your plan, what it costs, every bill", icon: "card-account-details-star", perm: "billing.view" },
  { href: "/settings/website", title: "Website", hint: "Your own page — words, pictures, address", icon: "web", perm: "settings.manage" },
  { href: "/settings/team", title: "Team", hint: "Who works here", icon: "account-group", perm: "users.manage" },
  { href: "/settings/roles", title: "Permissions", hint: "What each role may do", icon: "shield-account", perm: "roles.manage" },
  { href: "/settings/agencies", title: "Agent access", hint: "Agencies, commission, invitations", icon: "handshake", perm: "settings.manage" },
  { href: "/settings/rates", title: "Rate plans", hint: "Prices by season", icon: "tag-multiple", perm: "rooms.manage" },
  { href: "/settings/discounts", title: "Discounts", hint: "Offers applied at booking", icon: "sale", perm: "settings.manage" },
  { href: "/settings/lists", title: "Lists", hint: "Payment methods, sources, categories", icon: "format-list-bulleted-square", perm: "settings.manage" },
  { href: "/settings/messages", title: "Messages", hint: "What your guests read", icon: "message-text", perm: "settings.manage" },
  { href: "/settings/activity", title: "Activity log", hint: "Who did what", icon: "history", perm: "settings.manage" },
  { href: "/settings/api", title: "API & webhooks", hint: "Keys for your own website", icon: "api", perm: "settings.manage" },
  { href: "/settings/data", title: "Your data", hint: "Every register, downloaded", icon: "database-export", perm: "settings.manage" },
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
        {mine.length === 0 ? (
          <Card title={activeResort.name}>
            <Empty message="Nothing here is yours to change" hint="Ask the owner for the permissions you need." />
          </Card>
        ) : (
          <Tiles
            items={mine.map((s) => ({
              key: s.href,
              title: s.title,
              hint: s.hint,
              icon: s.icon,
              onPress: () => router.push(s.href as never),
            }))}
          />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
});
