/**
 * The resort itself: what it is called, when its day starts and ends,
 * and what it charges tax at.
 *
 * Four of these are load-bearing far beyond this screen. The timezone
 * decides what "today" means on every dated screen in the app — the day
 * sheet opened on yesterday for a working morning when it was wrong.
 * The currency and locale decide how every figure reads. And the tax
 * rate is the fallback the server uses when a resort has written no tax
 * rules, so changing it changes what every future invoice comes to.
 *
 * Only what moved is sent, for the reason `bookingChanges` exists: a
 * patch that carries every field is a patch nobody can read in a log,
 * and here it would also mean rewriting the timezone on a save that was
 * only meant to fix a phone number.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { currencySymbol, type ResortSettings } from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Field, Input } from "../../src/design/input";
import { Empty, Loading, Problem } from "../../src/design/states";
import { Card, Row } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { Toggle } from "../../src/design/toggle";
import { useAction } from "../../src/design/use-action";
import { color, radius, space } from "../../src/design/tokens";

export default function ResortSettingsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;

  const detail = useApi<ResortSettings>(
    keys.resort(resortId),
    () => client.resort.get(resortId!),
    { enabled: resortId !== undefined },
  );

  const header = <Stack.Screen options={{ title: "The resort" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <Empty message="No resort selected" hint="Choose a resort from the More tab." />
      </>
    );
  }

  if (detail.error && !detail.data) {
    return (
      <>
        {header}
        <Problem error={detail.error} onRetry={() => void detail.refetch()} />
      </>
    );
  }

  if (!detail.data) {
    return (
      <>
        {header}
        <Loading what="the resort's settings" />
      </>
    );
  }

  return (
    <>
      {header}
      <Form
        resort={detail.data}
        refreshing={detail.isRefetching}
        onRefresh={() => void detail.refetch()}
      />
    </>
  );
}

function Form({
  resort,
  refreshing,
  onRefresh,
}: {
  resort: ResortSettings;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(resort.name);
  const [location, setLocation] = useState(resort.location ?? "");
  const [address, setAddress] = useState(resort.address ?? "");
  const [phone, setPhone] = useState(resort.contactPhone ?? "");
  const [website, setWebsite] = useState(resort.website ?? "");
  const [checkIn, setCheckIn] = useState(resort.checkInTime);
  const [checkOut, setCheckOut] = useState(resort.checkOutTime);
  const [tax, setTax] = useState(String(Number(resort.taxRatePct ?? 0)));
  const [bin, setBin] = useState(resort.binNumber ?? "");
  const [showRates, setShowRates] = useState(Boolean(resort.showRatesToAgents));
  const [refused, setRefused] = useState<string | null>(null);

  const save = useAction(async () => {
    setRefused(null);
    const patch: Partial<ResortSettings> = {};
    const moved = <T,>(now: T, then: T) => now !== then;

    if (moved(name.trim(), resort.name)) patch.name = name.trim();
    if (moved(location.trim(), resort.location ?? "")) patch.location = location.trim();
    if (moved(address.trim(), resort.address ?? "")) patch.address = address.trim();
    if (moved(phone.trim(), resort.contactPhone ?? "")) patch.contactPhone = phone.trim();
    if (moved(website.trim(), resort.website ?? "")) patch.website = website.trim();
    if (moved(checkIn, resort.checkInTime)) patch.checkInTime = checkIn;
    if (moved(checkOut, resort.checkOutTime)) patch.checkOutTime = checkOut;
    if (moved(bin.trim(), resort.binNumber ?? "")) patch.binNumber = bin.trim();
    if (moved(showRates, Boolean(resort.showRatesToAgents))) patch.showRatesToAgents = showRates;
    const rate = Number(tax.replace(/[^0-9.]/g, "")) || 0;
    if (moved(rate, Number(resort.taxRatePct ?? 0))) patch.taxRatePct = rate;

    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }

    try {
      await client.resort.update(resort.id, patch);
      /**
       * The session holds the resort too, and the timezone and currency
       * in it decide what every other screen calls "today" and how it
       * prints money. Refreshing only this query would leave the rest of
       * the app on the old answer until a sign-out.
       */
      await qc.invalidateQueries({ queryKey: ["resort"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card title="What it is called">
        <View style={styles.fields}>
          <Field label="Name">
            <Input value={name} onChangeText={setName} autoCapitalize="words" />
          </Field>
          <Field label="Where it is" hint="The town or area a guest would search for">
            <Input value={location} onChangeText={setLocation} placeholder="Cox's Bazar" />
          </Field>
          <Field label="Address">
            <Input value={address} onChangeText={setAddress} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </Field>
          <Field label="Website">
            <Input
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              keyboardType="url"
            />
          </Field>
        </View>
      </Card>

      <Card title="The resort's day">
        <View style={styles.fields}>
          <Field label="Check-in from">
            <Input value={checkIn} onChangeText={setCheckIn} placeholder="12:00 PM" />
          </Field>
          <Field label="Check-out by">
            <Input value={checkOut} onChangeText={setCheckOut} placeholder="10:00 AM" />
          </Field>
        </View>
      </Card>

      <Card title="Tax">
        <View style={styles.fields}>
          <Field
            label="Rate (%)"
            hint="Used only where the resort has written no tax rule of its own"
          >
            <Input value={tax} onChangeText={setTax} keyboardType="numeric" placeholder="0" />
          </Field>
          <Field label="BIN" hint="A VAT invoice in Bangladesh has to show it">
            <Input value={bin} onChangeText={setBin} autoCapitalize="characters" />
          </Field>
        </View>
      </Card>

      <Card title="Agents">
        <Toggle
          label="Show rates to agents"
          hint="Off, an agency sees its own price and not the resort's"
          value={showRates}
          onChange={setShowRates}
        />
      </Card>

      {/*
        Read-only, and each of these is why. The currency and the zone are
        changed rarely and change what every figure and every date in the
        app means, so they are a desk decision made once — not a field
        somebody edits on a phone between guests.
      */}
      <Card title="Set on the desk">
        <Row
          title="Currency"
          meta={`${resort.currency} (${currencySymbol({ currency: resort.currency })})`}
          accessibilityLabel={`Currency: ${resort.currency}`}
        />
        <Row
          title="Timezone"
          meta={resort.timezone}
          accessibilityLabel={`Timezone: ${resort.timezone}`}
        />
        <Row
          title="Number format"
          meta={resort.locale}
          last
          accessibilityLabel={`Number format: ${resort.locale}`}
        />
      </Card>

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      <Button label="Save changes" loading={save.busy} onPress={save.go} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
