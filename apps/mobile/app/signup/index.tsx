/**
 * A resort signing itself up.
 *
 * The route has existed since the console had it and the typed client
 * has carried it since phase 0. Until now the app had no door to it:
 * somebody who installed Resort Mela without an account could ask for a
 * password reset to an account they did not have, and nothing else.
 *
 * What it asks for is the API's `SignupDto` and nothing more —
 * `whatTheResortSignupNeeds` reads off those rules so the phone and the
 * desk refuse the same forms for the same reasons. Location is the one
 * optional field and is offered as optional rather than left out, because
 * a resort that types it here never has to find the settings screen.
 *
 * The plan is deliberately not asked. The console offers plan cards
 * because it is a pricing page as much as a form; the API opens the entry
 * plan when nothing is said, and a trial is the right default for
 * somebody standing at a counter with a phone.
 */
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  SIGNUP_GAP_MESSAGES,
  landingFor,
  plannedPlan,
  plannedShelf,
  whatTheResortSignupNeeds,
  type PlanOnSale,
} from "@rh/shared";
import { useApi } from "@rh/app-core";
import { client, useAuth } from "../../src/api/session";
import { PlanOnOffer } from "../../src/screens/plan-on-offer";
import { Button } from "../../src/design/button";
import { Field, Input } from "../../src/design/input";
import { Text } from "../../src/design/text";
import { useAction } from "../../src/design/use-action";
import { space } from "../../src/design/tokens";

export default function ResortSignupScreen() {
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
  const shelfList = useApi<PlanOnSale[]>(["plans", "RESORT"], () =>
    client.auth.plansOnSale("RESORT"),
  );
  const [wanted, setWanted] = useState<string | null>(null);
  const plan = plannedPlan(shelfList.data, wanted ?? params.plan);
  const [shelfId, setShelfId] = useState<number | null>(null);
  const shelf = plannedShelf(plan, shelfId ?? (Number(params.schedule) || null));
  const [form, setForm] = useState({
    companyName: "",
    resortName: "",
    location: "",
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const gaps = whatTheResortSignupNeeds(form);
  const missing = (k: string) => (tried && gaps.includes(k) ? SIGNUP_GAP_MESSAGES[k] : undefined);

  const create = useAction(
    useCallback(async () => {
      setTried(true);
      if (whatTheResortSignupNeeds(form).length > 0) return;
      setError(null);
      try {
        const session = await client.auth.signup({
          ...form,
          // what was read on the price list, so the workspace opens on the
          // plan somebody actually chose rather than on the entry one
          plan: plan?.name,
          scheduleId: shelf?.id,
          // sent only when typed: an empty string is not a location, and the
          // API would store one
          location: form.location.trim() || undefined,
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
      <Stack.Screen options={{ title: "Open a resort" }} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <PlanOnOffer
            plans={shelfList.data}
            plan={plan}
            shelfId={shelf?.id ?? null}
            audience="RESORT"
            onPlan={(name) => {
              setWanted(name);
              // the shelf belonged to the plan they just left; carrying it
              // over would be a bill for a card nobody pressed
              setShelfId(null);
            }}
            onShelf={setShelfId}
            loading={!shelfList.data}
          />

          <Field label="Company or owner" error={missing("companyName")}>
            <Input
              value={form.companyName}
              onChangeText={set("companyName")}
              placeholder="Sea Breeze Ltd"
              autoCapitalize="words"
            />
          </Field>

          <Field label="Resort" error={missing("resortName")}>
            <Input
              value={form.resortName}
              onChangeText={set("resortName")}
              placeholder="Sea Breeze Resort"
              autoCapitalize="words"
            />
          </Field>

          <Field label="Where it is" hint="optional">
            <Input
              value={form.location}
              onChangeText={set("location")}
              placeholder="Cox's Bazar"
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

          <Button label="Open the resort" onPress={create.go} loading={create.busy} />

          <View style={styles.footer}>
            <Button
              label="Sign an agency up instead"
              kind="ghost"
              onPress={() => router.replace("/signup/agency" as never)}
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
  footer: { gap: space.xs, paddingTop: space.sm },
});
