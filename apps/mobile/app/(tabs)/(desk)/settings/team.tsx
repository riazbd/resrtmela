/**
 * Who works here, and what each of them may do.
 *
 * Read-only on the phone, and the reason is the same one the settings hub
 * gives for leaving the permission matrix on the desk: a role is thirty
 * checkboxes in nine groups, and a phone renders that as a scroll nobody
 * can hold in their head. Getting it wrong hands somebody the resort's
 * money or takes away a clerk's ability to work.
 *
 * What the phone *is* for is the question an owner asks away from the
 * desk: who has access, on what role, and is that still right. Answering
 * it needs no form.
 *
 * The one thing deliberately absent is setting a colleague's password.
 * The API keeps it on its own permission — `users.password`, separate
 * from `users.manage` — because setting somebody's password hands you
 * their account, and that is impersonation rather than administration.
 * It is not something to do one-handed.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import type { PermRole, ResortUser } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

export default function TeamScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;

  const people = useApi<ResortUser[]>(
    ["resort-users", resortId],
    () => client.resort.users(resortId!),
    { enabled: resortId !== undefined },
  );

  const roles = useApi<PermRole[]>(
    ["resort-roles", resortId],
    () => client.resort.roles(resortId!),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  const header = <Stack.Screen options={{ title: "Team" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the team" />
      </>
    );
  }

  if (people.error && !people.data) {
    return (
      <>
        {header}
        <Problem error={people.error} onRetry={() => void people.refetch()} />
      </>
    );
  }

  if (!people.data) {
    return (
      <>
        {header}
        <Loading what="the team" />
      </>
    );
  }

  const rows = people.data;
  const working = rows.filter((p) => p.status === "active").length;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={people.isRefetching} onRefresh={() => void people.refetch()} />
        }
      >
        <Card title={`${rows.length} ${rows.length === 1 ? "person" : "people"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nobody is linked to this resort yet" />
            </View>
          ) : (
            <>
              <Text step="caption" tone="muted" style={styles.count}>
                {working} active
              </Text>
              {rows.map((person, i) => (
                <Person key={person.id} person={person} last={i === rows.length - 1} />
              ))}
            </>
          )}
        </Card>

        {roles.data && roles.data.length > 0 ? (
          <Card title="Roles">
            {roles.data.map((role, i) => (
              <Row
                key={role.id}
                title={role.name}
                subtitle={
                  // a role computed as every permission there is says so,
                  // rather than listing thirty of them
                  role.permissions?.includes("*")
                    ? "Everything"
                    : `${role.permissions?.length ?? 0} permission${(role.permissions?.length ?? 0) === 1 ? "" : "s"}`
                }
                meta={String(rows.filter((p) => p.roleId === role.id).length)}
                last={i === (roles.data?.length ?? 0) - 1}
                accessibilityLabel={`${role.name}, held by ${rows.filter((p) => p.roleId === role.id).length} of the team`}
              />
            ))}
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Adding somebody, changing a role, and setting a colleague&apos;s password
          stay on the desk. A role is thirty checkboxes in nine groups, and
          setting a password hands you somebody&apos;s account.
        </Text>
      </ScrollView>
    </>
  );
}

function Person({ person, last }: { person: ResortUser; last: boolean }) {
  const off = person.status !== "active";
  const reach = [person.phone, person.email].filter(Boolean).join(" · ");

  return (
    <Row
      title={person.name}
      subtitle={reach || undefined}
      last={last}
      accessibilityLabel={`${person.name}, ${person.roleName ?? person.role}${off ? ", not active" : ""}${reach ? `, ${reach}` : ""}`}
      right={
        <View style={styles.right}>
          <Text step="small" weight="medium" tone={off ? "muted" : "title"}>
            {person.roleName ?? person.role}
          </Text>
          {off ? (
            <View style={styles.off}>
              <Text step="caption" weight="medium" tone="warn">
                {person.status}
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  count: { paddingBottom: space.sm },
  right: { alignItems: "flex-end", gap: space.xs },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  off: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
