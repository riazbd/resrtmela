/**
 * A name of your own for the website — the console's `OwnDomains`, on the
 * phone, for a resort and an agency alike (each passes its own four calls).
 *
 * Add the name, put the one record we show at the registrar, press Check;
 * once it is proved we set up the certificate, and it goes live.
 */
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DomainRow } from "@rh/shared";
import { Button } from "../design/button";
import { Field, Input } from "../design/input";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import { refusal } from "./payroll-month";

export interface DomainCalls {
  list: () => Promise<DomainRow[]>;
  claim: (host: string) => Promise<unknown>;
  verify: (domainId: number) => Promise<unknown>;
  setCanonical: (domainId: number) => Promise<unknown>;
  remove: (domainId: number) => Promise<unknown>;
}

const STATE: Record<string, { label: string; bg: string; fg: string; what: string }> = {
  WAITING_FOR_DNS: { label: "Waiting for your DNS", bg: color.warn.bg, fg: color.warn.fg, what: "Add the record below at your registrar, then press Check." },
  WAITING_FOR_US: { label: "Waiting for us", bg: color.info.bg, fg: color.info.fg, what: "Proved. We are setting up the certificate — usually within the hour." },
  LIVE: { label: "Live", bg: color.ok.bg, fg: color.ok.fg, what: "Your site answers at this address." },
};

export function OwnDomains({ calls, blurb }: { calls: DomainCalls; blurb: string }) {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [wanted, setWanted] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    calls.list().then(setRows).catch(() => setRows([]));
  }, [calls]);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      load();
      return true;
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Your own domain">
      <View style={styles.gap}>
        <Text step="small" tone="muted">
          {blurb}
        </Text>
        <Field label="The name">
          <Input value={wanted} onChangeText={setWanted} placeholder="www.yourresort.com" autoCapitalize="none" keyboardType="url" />
        </Field>
        <Button
          label="Add it"
          kind="ghost"
          loading={busy === "claim"}
          disabled={!wanted.trim()}
          onPress={async () => {
            if (await run("claim", () => calls.claim(wanted.trim()), "Domain added — now add the record")) setWanted("");
          }}
        />
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}
        {rows.map((d) => {
          const s = STATE[d.state] ?? STATE.WAITING_FOR_DNS!;
          return (
            <View key={d.id} style={styles.domain}>
              <View style={styles.head}>
                <Text step="body" weight="bold" tone="title" style={styles.flex} numberOfLines={1}>
                  {d.host}
                  {d.canonical ? "  · main" : ""}
                </Text>
                <View style={[styles.pill, { backgroundColor: s.bg }]}>
                  <Text step="caption" weight="bold" style={{ color: s.fg }}>
                    {s.label}
                  </Text>
                </View>
              </View>
              <Text step="caption" tone="muted">
                {s.what}
              </Text>
              {d.state === "WAITING_FOR_DNS" ? (
                <View style={styles.record}>
                  <Text step="caption" selectable tone="body">{`Type: ${d.record.type}`}</Text>
                  <Text step="caption" selectable tone="body">{`Name: ${d.record.name}`}</Text>
                  <Text step="caption" selectable tone="muted">{`or just: ${d.record.shortName}`}</Text>
                  <Text step="caption" selectable tone="body">{`Value: ${d.record.value}`}</Text>
                </View>
              ) : null}
              <View style={styles.acts}>
                {d.state === "WAITING_FOR_DNS" ? (
                  <Button label="Check" block={false} loading={busy === `v${d.id}`} onPress={() => void run(`v${d.id}`, () => calls.verify(d.id), "Proved — we will set it up shortly")} />
                ) : null}
                {d.state !== "WAITING_FOR_DNS" && !d.canonical ? (
                  <Button label="Make it the main address" kind="ghost" block={false} loading={busy === `c${d.id}`} onPress={() => void run(`c${d.id}`, () => calls.setCanonical(d.id), "That is the main address now")} />
                ) : null}
                <Button label="Remove" kind="subtle" block={false} loading={busy === `x${d.id}`} onPress={() => void run(`x${d.id}`, () => calls.remove(d.id), "Domain removed")} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  flex: { flex: 1 },
  domain: { borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space.md, gap: space.xs },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  record: { backgroundColor: color.ink[50], borderRadius: radius.sm, padding: space.sm, gap: 2 },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
