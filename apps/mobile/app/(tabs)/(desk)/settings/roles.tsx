/**
 * What each role may do — the permission matrix, on a phone.
 *
 * This was the clearest of the screens kept on the desk, and the reason
 * given was a good one: a role is thirty-odd checkboxes in nine groups,
 * and getting it wrong either hands somebody the resort's money or takes
 * away a clerk's ability to work.
 *
 * It moved here on 2026-09-21 because the owner reported the consequence
 * rather than the cause: *"manager can't input expense"*, and then
 * *"permission-e expense-ta add nai"* — there is no expense box to tick.
 * There is; `expenses.create` has been in `PERMISSIONS` under Money all
 * along. What there was not was anywhere on the phone to tick it, and an
 * owner whose manager cannot file the day's diesel does not experience
 * that as a considered design decision.
 *
 * The objection is answered by shape rather than by refusing. One role is
 * open at a time and its groups are collapsed, so what is on screen is
 * one group of three or four switches — never thirty. The reader always
 * knows whose permissions they are looking at, because the role's name is
 * the thing they pressed to get here.
 *
 * **Administrator is not editable, and says why.** It resolves to `*` at
 * read time rather than from its stored list, so a matrix of ticked boxes
 * would be a screen full of controls that decide nothing — which reads as
 * control and is worse than no boxes at all. The server refuses the edit;
 * this screen refuses it first, with the reason.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  PERMISSIONS,
  RESORT_PERMISSION_GROUPS,
  type PermRole,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { Toggle } from "../../../../src/design/toggle";
import { Field, Input } from "../../../../src/design/input";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

const ADMIN = "Administrator";

/** Everything, computed rather than stored — see the note at the top. */
const isAdmin = (role: PermRole) => role.system && role.name === ADMIN;

export default function RolesScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const mayManage = can("roles.manage");
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const roles = useApi<PermRole[]>(
    ["resort-roles", resortId],
    () => client.resort.roles(resortId!),
    { enabled: resortId !== undefined },
  );

  const header = <Stack.Screen options={{ title: "Permissions" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the roles" />
      </>
    );
  }

  if (roles.error && !roles.data) {
    return (
      <>
        {header}
        <Problem error={roles.error} onRetry={() => void roles.refetch()} />
      </>
    );
  }

  if (!roles.data) {
    return (
      <>
        {header}
        <Loading what="the roles" />
      </>
    );
  }

  const rows = roles.data;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={roles.isRefetching} onRefresh={() => void roles.refetch()} />
        }
      >
        {rows.length === 0 ? (
          <Card>
            <View style={styles.emptyBox}>
              <Empty message="No roles yet" />
            </View>
          </Card>
        ) : (
          rows.map((role) =>
            open === role.id ? (
              <RoleMatrix
                key={role.id}
                role={role}
                onClose={() => setOpen(null)}
                onSaved={async () => {
                  setOpen(null);
                  await roles.refetch();
                }}
              />
            ) : (
              <Card key={role.id}>
                <Row
                  title={role.name}
                  subtitle={
                    isAdmin(role)
                      ? "Everything, always"
                      : `${role.permissions.length} of ${PERMISSIONS.length}`
                  }
                  meta={`${role.users} ${role.users === 1 ? "person" : "people"}`}
                  last
                  accessibilityLabel={`${role.name}, held by ${role.users} of the team`}
                  onPress={mayManage && !isAdmin(role) ? () => setOpen(role.id) : undefined}
                />
              </Card>
            ),
          )
        )}

        {adding ? (
          <NewRole
            resortId={resortId}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await roles.refetch();
            }}
          />
        ) : mayManage ? (
          <Button label="Add a role" kind="ghost" onPress={() => setAdding(true)} />
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Administrator is every permission there is, worked out rather than
          stored, so there is nothing on it to tick.
        </Text>
      </ScrollView>
    </>
  );
}

/**
 * One role's permissions, a group at a time.
 *
 * Collapsed by default and one group open at a time, which is the whole
 * answer to "thirty checkboxes will not fit on a phone": they do not have
 * to. Each group's header says how many of it are held, so a reader
 * scanning for what is missing does not have to open all nine.
 */
function RoleMatrix({
  role,
  onClose,
  onSaved,
}: {
  role: PermRole;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [held, setHeld] = useState<string[]>(role.permissions);
  const [group, setGroup] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    setRefused(null);
    try {
      await client.resort.updateRole(role.id, { permissions: held });
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const toggle = (key: string) =>
    setHeld((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  const groups = RESORT_PERMISSION_GROUPS;

  return (
    <Card title={role.name}>
      {/*
        The count goes in `right`, not `meta`.

        `meta` is a third line *under* the title — it was written for a
        row that says three things about one thing — so using it for a
        tally drew "Bookings" with "6/6" beneath it, nine times, down a
        screen. Found by opening it; no test could see it, because a
        tally is on screen either way.
      */}
      {groups.map((name, i) => {
        const keys = PERMISSIONS.filter((p) => p.group === name);
        const on = keys.filter((p) => held.includes(p.key)).length;
        const open = group === name;
        return (
          <View key={name}>
            <Row
              title={name}
              last={open || i === groups.length - 1}
              accessibilityLabel={`${name}, ${on} of ${keys.length} allowed`}
              onPress={() => setGroup(open ? null : name)}
              right={
                <Text
                  step="small"
                  weight="medium"
                  tone={on === 0 ? "muted" : "title"}
                  tabular
                >
                  {on}/{keys.length}
                </Text>
              }
            />
            {open ? (
              <View style={styles.group}>
                {keys.map((p) => (
                  <Toggle
                    key={p.key}
                    label={p.label}
                    value={held.includes(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.after}>
        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Save" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

/**
 * A new role, with nothing ticked.
 *
 * Deliberately empty rather than seeded from a role that looks similar. A
 * set somebody copied and did not read is how a clerk ends up holding
 * `expenses.delete`, and the groups are one tap away on the screen this
 * returns to.
 */
function NewRole({
  resortId,
  onClose,
  onSaved,
}: {
  resortId: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    if (!name.trim()) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      await client.resort.createRole(resortId, { name: name.trim(), permissions: [] });
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="A new role">
      <View style={styles.fields}>
        <Field
          label="Name"
          hint="Nothing is allowed until you tick it — open the role to do that"
          error={tried && !name.trim() ? "A role needs a name." : null}
        >
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (text.trim()) setTried(false);
            }}
            placeholder="Night manager"
            autoCapitalize="words"
            invalid={tried && !name.trim()}
          />
        </Field>

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Create it" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  // the switches sit under the group they belong to, and a rule closes it
  group: {
    paddingLeft: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  after: { gap: space.md, paddingTop: space.md },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
