/**
 * An agency signing itself up.
 *
 * The same front door as a resort's, and deliberately a different screen
 * rather than a toggle on one: an agency has no resort to name and no
 * location to give, and a form that hides three of its seven fields
 * depending on a switch is a form nobody trusts.
 *
 * **It lands pending.** The platform verifies each agency by hand before
 * it can sell anything, so the screen says so before the button rather
 * than after — somebody who signs up and then finds every resort refuses
 * them has been told too late.
 */
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  SIGNUP_GAP_MESSAGES,
  landingFor,
  plannedPlan,
  plannedShelf,
  whatTheAgencySignupNeeds,
  type PlanOnSale,
} from "@rh/shared";
import { useApi } from "@rh/app-core";
import { client, useAuth } from "../../src/api/session";
import { PlanOnOffer } from "../../src/screens/plan-on-offer";
import { Button } from "../../src/design/button";
import { Field, Input } from "../../src/design/input";
import { Text } from "../../src/design/text";
import { useAction } from "../../src/design/use-action";
import { color, radius, space } from "../../src/design/tokens";

export default function AgencySignupScreen() {
  const { adoptToken } = useAuth();
  /**
   * Which plan was pressed, and on which shelf.
   *
   * The form used to send neither, so the API opened the entry plan and
   * somebody who had read the price list got something else. They arrive
   * as query parameters from `/plans` — a route parameter is something a
   * person typed as far as this file is concerned, so the plan is looked
   * up in the real shelf and an unknown name falls back rather than
   * describing nothing.
   */
  const params = useLocalSearchParams<{ plan?: string; schedule?: string }>();
  const shelfList = useApi<PlanOnSale[]>(["plans", "AGENCY"], () =>
    client.auth.plansOnSale("AGENCY"),
  );
  const [wanted, setWanted] = useState<string | null>(null);
  const plan = plannedPlan(shelfList.data, wanted ?? params.plan);
  const [shelfId, setShelfId] = useState<number | null>(null);
  const shelf = plannedShelf(plan, shelfId ?? (Number(params.schedule) || null));
  const [form, setForm] = useState({
    agencyName: "",
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const gaps = whatTheAgencySignupNeeds(form);
  const missing = (k: string) => (tried && gaps.includes(k) ? SIGNUP_GAP_MESSAGES[k] : undefined);

  const create = useAction(
    useCallback(async () => {
      setTried(true);
      if (whatTheAgencySignupNeeds(form).length > 0) return;
      setError(null);
      try {
        const session = await client.auth.signupAgency({
          ...form,
          // what was read on the price list, so the account opens on the
          // plan somebody actually chose rather than on the entry one
          plan: plan?.name,
          scheduleId: shelf?.id,
        });
        const me = await adoptToken(session.accessToken);
        router.replace(landingFor(me.role) as never);
      } catch (ex) {
        setError((ex as Error).message);
      }
    }, [form, adoptToken]),
  );

  return (
    <>
      <Stack.Screen options={{ title: "Open an agency" }} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {/*
            Said before the button, not after. An agency that signs up and
            then finds every resort refuses it has been told too late.
          */}
          <View style={styles.notice}>
            <Text step="small" tone="warn" weight="medium">
              The platform checks each agency by hand. You can sign in straight
              away and look around; selling starts once you are verified.
            </Text>
          </View>

          <PlanOnOffer
            plans={shelfList.data}
            plan={plan}
            shelfId={shelf?.id ?? null}
            audience="AGENCY"
            onPlan={(name) => {
              setWanted(name);
              // the shelf belonged to the plan they just left; carrying it
              // over would be a bill for a card nobody pressed
              setShelfId(null);
            }}
            onShelf={setShelfId}
            loading={!shelfList.data}
          />

          <Field label="Agency" error={missing("agencyName")}>
            <Input
              value={form.agencyName}
              onChangeText={set("agencyName")}
              placeholder="Demo Travels"
              autoCapitalize="words"
            />
          </Field>

          <Field label="Your name" error={missing("name")}>
            <Input value={form.name} onChangeText={set("name")} autoCapitalize="words" />
          </Field>

          <Field label="Email" hint="the password reset goes here" error={missing("email")}>
            <Input
              value={form.email}
              onChangeText={set("email")}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>

          <Field label="Phone" error={missing("phone")}>
            <Input
              value={form.phone}
              onChangeText={set("phone")}
              placeholder="01XXXXXXXXX"
              keyboardType="phone-pad"
            />
          </Field>

          <Field label="Password" error={missing("password")}>
            <Input
              value={form.password}
              onChangeText={set("password")}
              secureTextEntry
              autoCapitalize="none"
            />
          </Field>

          {error ? (
            <Text step="small" tone="danger" weight="medium">
              {error}
            </Text>
          ) : null}

          <Button label="Open the agency" onPress={create.go} loading={create.busy} />

          <View style={styles.footer}>
            <Button
              label="Sign a resort up instead"
              kind="ghost"
              onPress={() => router.replace("/signup" as never)}
            />
            <Button label="I already have an account" kind="ghost" onPress={() => router.replace("/login")} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: space.lg, gap: space.md },
  notice: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  footer: { gap: space.xs, paddingTop: space.sm },
});
