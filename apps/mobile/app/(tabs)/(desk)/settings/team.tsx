/**
 * Who works here, what each of them may do, and adding somebody.
 *
 * Adding was on the desk until 2026-09-21, alongside the permission
 * matrix and for the same stated reason. The reason did not survive
 * contact with an owner opening a resort, who has staff in front of them
 * and a phone in their hand; *"staff can't add"* was the whole of the
 * report.
 *
 * What a new colleague gets is a **kind** and, optionally, a **role**.
 * The kind — manager, front desk, housekeeping — is what the API calls
 * `role` and decides which half of the console opens. The role is the
 * permission set, and where one is given the server derives the kind
 * from it rather than believing both: a live console once had somebody
 * listed as FRONT DESK holding a set called Admin.
 *
 * The one thing deliberately absent is setting a colleague's password.
 * The API keeps it on its own permission — `users.password`, separate
 * from `users.manage` — because setting somebody's password hands you
 * their account, and that is impersonation rather than administration.
 * It is not something to do one-handed.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  displayEmail,
  displayPhone,
  type NewResortUser,
  type PermRole,
  type ResortUser,
  type ResortUserEdit,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

/**
 * The three the API will take, in its own words.
 *
 * AGENT is not among them and that is a design decision rather than an
 * oversight: an agency sells a resort, it does not work there, and
 * `createResortUser` answers that request with a sentence saying so.
 */
const KINDS = [
  { code: "MANAGER", label: "Manager" },
  { code: "FRONT_DESK", label: "Front desk" },
  { code: "HOUSEKEEPING", label: "Housekeeping" },
] as const;

export default function TeamScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const mayManage = can("users.manage");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

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
              {rows.map((person, i) =>
                editing === person.id ? (
                  <ChangePerson
                    key={person.id}
                    person={person}
                    resortId={resortId}
                    roles={roles.data ?? []}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                      setEditing(null);
                      await people.refetch();
                    }}
                  />
                ) : (
                  <Person
                    key={person.id}
                    person={person}
                    last={i === rows.length - 1}
                    onPress={mayManage ? () => setEditing(person.id) : undefined}
                  />
                ),
              )}
            </>
          )}
        </Card>

        {adding ? (
          <NewColleague
            resortId={resortId}
            roles={roles.data ?? []}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await people.refetch();
            }}
          />
        ) : mayManage ? (
          <Button label="Add somebody" kind="ghost" onPress={() => setAdding(true)} />
        ) : null}

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
                onPress={() => router.push("/settings/roles" as never)}
              />
            ))}
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Setting a colleague&apos;s password stays on the desk: it hands you
          their account, which is not a thing to do one-handed.
        </Text>
      </ScrollView>
    </>
  );
}

/**
 * A colleague being added.
 *
 * Both contacts are asked for because both are ways in: `findUserByIdentifier`
 * matches either, so somebody given only an email cannot sign in with the
 * phone number they will actually use. The API refuses a contact already
 * on the platform, in its own words, which is the sentence to show —
 * "that email is taken" is the one fact that explains the refusal.
 *
 * The password is set here and by the person themselves afterwards. There
 * is no invitation flow, so a first password is the only way in, and
 * hiding that behind a nicer story would mean nobody could sign in.
 */
function NewColleague({
  resortId,
  roles,
  onClose,
  onSaved,
}: {
  resortId: number;
  roles: PermRole[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<string>("FRONT_DESK");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const incomplete =
    !name.trim() ||
    !email.trim() ||
    !phone.trim() ||
    !password ||
    (roles.length > 0 && roleId === null);

  const save = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      const body: NewResortUser = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        /**
         * `role` is required by the DTO and overwritten by the server
         * whenever `roleId` is present, which is the rule that keeps the
         * two from disagreeing. It is a floor rather than a guess: the
         * least authority the API will accept, so a resort with no roles
         * — where nothing overrides it — gets the kind that was actually
         * chosen, and a resort with roles gets whatever its set implies.
         */
        role: roleId === null ? kind : "FRONT_DESK",
        ...(roleId === null ? {} : { roleId }),
      };
      await client.resort.addUser(resortId, body);
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <Card title="Somebody new">
      <View style={styles.fields}>
        <Field label="Name" error={tried && !name.trim() ? "A name, as they are called." : null}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Karim Uddin"
            autoCapitalize="words"
            invalid={tried && !name.trim()}
          />
        </Field>

        <Field label="Phone" hint="They can sign in with this or the email">
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="01712345678"
            keyboardType="phone-pad"
            invalid={tried && !phone.trim()}
          />
        </Field>

        <Field label="Email">
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="karim@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            invalid={tried && !email.trim()}
          />
        </Field>

        {/*
          Non-empty, which is what `CreateUserDto` asks and what the
          console enforces. The API is stricter elsewhere —
          `SetUserPasswordDto`, the route that *resets* a colleague's
          password, wants eight — and the two disagree; the place to
          settle that is the DTO, not one client, because a floor on the
          phone alone would refuse a password the console had just
          accepted for the same person.
        */}
        <Field
          label="First password"
          hint="Tell it to them and they change it"
          error={tried && !password ? "They need a password to sign in with." : null}
        >
          {/*
            Masked, as the console's `type="password"` masks it. A first
            password is read out to somebody standing at a counter, and
            the phone showing it is the one thing in the room a stranger
            can see over a shoulder.
          */}
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            autoCapitalize="none"
            secureTextEntry
            invalid={tried && !password}
          />
        </Field>

        {/*
          One question, not two.

          The console asks for a kind *and* a permission set, and the
          server then ignores the kind whenever a set is given — it
          derives one from the other on purpose, because the two used to
          be chosen separately and could disagree, and a live console had
          somebody listed as FRONT DESK holding a set called Admin.

          Asking both here would put a control on screen whose value is
          discarded. It also put two chips reading "Manager" on one form,
          because the resort's roles are named after the kinds. So the
          permission set is the question wherever there is one to ask,
          and the kinds are the fallback for a resort with no roles yet.
        */}
        {roles.length > 0 ? (
          <Field
            label="Permissions"
            hint="What they may do — and what the platform calls them follows from it"
            error={tried && roleId === null ? "Say what they may do." : null}
          >
            <View style={styles.kinds}>
              {roles.map((role) => (
                <Chip
                  key={role.id}
                  label={role.name}
                  on={roleId === role.id}
                  onPress={() => {
                    setRoleId(role.id);
                    setTried(false);
                  }}
                />
              ))}
            </View>
          </Field>
        ) : (
          <Field label="What they do">
            <View style={styles.kinds}>
              {KINDS.map((k) => (
                <Chip
                  key={k.code}
                  label={k.label}
                  on={kind === k.code}
                  onPress={() => setKind(k.code)}
                />
              ))}
            </View>
          </Field>
        )}

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Button label="Add them" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

/**
 * Changing what a colleague may do, and whether they may work.
 *
 * The console's team table carries exactly these two controls on every
 * row — a permission-set picker and Activate / Suspend — and the phone
 * carried neither, which is how an owner whose manager could not file an
 * expense had nowhere to fix it even after the box existed to tick.
 *
 * One control for the role, not two, for the reason the console states
 * in the same place: the API derives the account's kind from the
 * permission set, and a console that asked for both once had somebody
 * listed as FRONT DESK holding a set called Admin.
 *
 * Setting a password is not here. It is its own permission —
 * `users.password`, not `users.manage` — because it hands you somebody's
 * account, and that is a thing to do at a desk.
 */
function ChangePerson({
  person,
  resortId,
  roles,
  onClose,
  onSaved,
}: {
  person: ResortUser;
  resortId: number;
  roles: PermRole[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const suspended = person.status !== "active";

  const patch = async (body: ResortUserEdit) => {
    setRefused(null);
    try {
      await client.resort.updateUser(resortId, person.id, body);
      await onSaved();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  };

  const flip = useAction(async () => {
    await patch({ status: suspended ? "active" : "suspended" });
  });

  return (
    <Card title={person.name}>
      <View style={styles.fields}>
        {roles.length === 0 ? (
          <Text step="small" tone="muted">
            No roles yet — make one under Permissions, then set it here.
          </Text>
        ) : (
          <Field label="Permissions" hint="What they may do, and what the platform calls them">
            <View style={styles.kinds}>
              {roles.map((role) => (
                <Chip
                  key={role.id}
                  label={role.name}
                  on={person.roleId === role.id}
                  onPress={() => {
                    if (person.roleId === role.id) return;
                    void patch({ roleId: role.id });
                  }}
                />
              ))}
            </View>
          </Field>
        )}

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        {/*
          Suspending is not deleting. The row stays, their bookings keep
          naming them, and the person simply cannot sign in — which is
          what an owner means when somebody stops working there.
        */}
        <Button
          label={suspended ? "Let them back in" : "Suspend them"}
          kind={suspended ? "primary" : "ghost"}
          loading={flip.busy}
          onPress={flip.go}
        />
        <Button label="Done" kind="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

function Person({
  person,
  last,
  onPress,
}: {
  person: ResortUser;
  last: boolean;
  /** Absent for somebody without `users.manage`, who is reading rather than changing. */
  onPress?: () => void;
}) {
  const off = person.status !== "active";
  /**
   * A placeholder is not a way to reach anybody.
   *
   * An account made before both contacts were required carries
   * `placeholder-5` and `user-5@placeholder.invalid`, and this row
   * printed them — so the team list read as though somebody's phone
   * number were the word "placeholder-5". `displayPhone` and
   * `displayEmail` are in `@rh/shared` and the console has used them
   * all along; this screen had not.
   */
  const reach = [displayPhone(person.phone), displayEmail(person.email)]
    .filter((v) => v !== "not set")
    .join(" · ");

  /**
   * The permission set, or the fact that there isn't one.
   *
   * This fell back to `person.role` — the derived account kind — and so
   * printed `RESORT_ADMIN` at somebody, underscore and all, which is the
   * raw-enum fault this codebase has fixed everywhere else. Seen on the
   * live demo resort, whose only user holds no custom role.
   *
   * The console's answer is "No role set", and its comment says the
   * wording is deliberate: it is the state of a colleague added before
   * roles existed, and it should read as unfinished.
   */
  const holds = person.roleName ?? "No role set";

  return (
    <Row
      title={person.name}
      subtitle={reach || undefined}
      last={last}
      onPress={onPress}
      accessibilityLabel={`${person.name}, ${holds}${off ? ", not active" : ""}${reach ? `, ${reach}` : ""}`}
      right={
        <View style={styles.right}>
          <Text
            step="small"
            weight="medium"
            tone={off || !person.roleName ? "muted" : "title"}
          >
            {holds}
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
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
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
