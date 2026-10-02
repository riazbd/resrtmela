/**
 * The pieces every platform screen on the phone shares: running an act and
 * saying what happened, a status pill, and asking how money arrived before
 * anything is marked paid — the console's `HowItArrived`.
 */
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { keys, useApi } from "@rh/app-core";
import { paymentMethodsFrom, type MethodChoice } from "@rh/shared";
import { client } from "../api/session";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import { refusal } from "./payroll-month";

export function useRun(after?: () => Promise<unknown> | void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(key);
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      await after?.();
      return true;
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, said, setSaid };
}

export function Said({ said }: { said: { ok: boolean; text: string } | null }) {
  if (!said) return null;
  return (
    <View style={[styles.note, said.ok ? styles.ok : styles.bad]}>
      <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
        {said.text}
      </Text>
    </View>
  );
}

/** A status as a coloured word: active green, pending amber, the rest red. */
export function Pill({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone =
    v === "active" || v === "paid" || v === "approved" || v === "delivered"
      ? { bg: color.ok.bg, fg: color.ok.fg }
      : v === "pending" || v === "trial" || v === "due"
        ? { bg: color.warn.bg, fg: color.warn.fg }
        : v === "cancelled" || v === "closed"
          ? { bg: color.ink[100], fg: color.muted }
          : { bg: color.danger.bg, fg: color.danger.fg };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text step="caption" weight="bold" style={{ color: tone.fg }}>
        {value.replace(/_/g, " ").toLowerCase()}
      </Text>
    </View>
  );
}

/** The platform's own payment methods, from its settings. */
export function usePlatformMethods(): MethodChoice[] {
  const settings = useApi<Record<string, string>>(keys.platform("settings"), () => client.platform.settings(), { staleTime: 3_600_000 });
  return paymentMethodsFrom(settings.data ?? {});
}

/** How did the money arrive — asked before a due, a charge or an order is marked paid. */
export function HowItArrived({ what, onPick, onCancel }: { what: string; onPick: (code: string) => void; onCancel: () => void }) {
  const methods = usePlatformMethods();
  return (
    <Card title="How did the money arrive?">
      <View style={styles.gap}>
        <Text step="small" tone="muted">
          {what}
        </Text>
        <View style={styles.chips}>
          {methods.map((m) => (
            <Chip key={m.code} label={m.label} on={false} onPress={() => onPick(m.code)} />
          ))}
        </View>
        <Button label="Not now" kind="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

/** A labelled line of figures inside a card. */
export function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text step="small" tone="muted" style={styles.flex}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 2 },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: "flex-start" },
  note: { borderRadius: radius.md, padding: space.md, borderWidth: 1 },
  ok: { backgroundColor: color.ok.bg, borderColor: color.ok.line },
  bad: { backgroundColor: color.danger.bg, borderColor: color.danger.line },
});
