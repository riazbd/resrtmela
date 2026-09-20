/**
 * Who works at the agency, and what each of them may do.
 *
 * Read-only, for the same reason the resort's team screen is: a role is
 * thirty checkboxes in nine groups, and a phone renders that as a scroll
 * nobody can hold in their head. Getting it wrong hands somebody the
 * agency's wallet or takes away a clerk's ability to book.
 *
 * What the phone *is* for is the question an owner asks away from the
 * desk: who has access, on what role, and is that still right.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import type { AgencyRole, AgencyStaff } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

export default function AgentTeamScreen() {
  const { me } = useAuth();

  const people = useApi<AgencyStaff[]>(["agent-staff"], () => client.agent.staff(), {
    enabled: Boolean(me),
  });
  const roles = useApi<AgencyRole[]>(["agent-roles"], () => client.agent.roles(), {
    enabled: Boolean(me),
    staleTime: 3_600_000,
  });

  const header = <Stack.Screen options={{ title: "My team" }} />;

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
  const roleName = (id: number | null) =>
    id === null ? "No role" : (roles.data?.find((r) => r.id === id)?.name ?? `Role ${id}`);

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
              <Empty message="Nobody else works here yet" />
            </View>
          ) : (
            rows.map((p, i) => {
              const off = p.status !== "active";
              const reach = [p.phone, p.email].filter(Boolean).join(" · ");
              return (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={reach || undefined}
                  last={i === rows.length - 1}
                  accessibilityLabel={`${p.name}, ${roleName(p.agentRoleId)}${
                    off ? ", not active" : ""
                  }${reach ? `, ${reach}` : ""}`}
                  right={
                    <View style={styles.right}>
                      <Text step="small" weight="medium" tone={off ? "muted" : "title"}>
                        {roleName(p.agentRoleId)}
                      </Text>
                      {off ? (
                        <View style={styles.off}>
                          <Text step="caption" weight="medium" tone="warn">
                            {p.status}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  }
                />
              );
            })
          )}
        </Card>

        {roles.data && roles.data.length > 0 ? (
          <Card title="Roles">
            {roles.data.map((r, i) => (
              <Row
                key={r.id}
                title={r.name}
                // a count, not a list: thirty permission names is a scroll
                // nobody reads
                subtitle={`${r.permissions.length} permission${
                  r.permissions.length === 1 ? "" : "s"
                }`}
                meta={`${r.staff} ${r.staff === 1 ? "person" : "people"}`}
                last={i === (roles.data?.length ?? 0) - 1}
                accessibilityLabel={`${r.name}, ${r.permissions.length} permissions, held by ${r.staff}`}
              />
            ))}
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Adding somebody, changing a role and setting a password stay on the
          desk. A role is thirty checkboxes in nine groups, and setting a
          password hands you somebody&apos;s account.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
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
