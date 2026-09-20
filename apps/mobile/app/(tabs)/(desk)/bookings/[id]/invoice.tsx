/**
 * The bill, and giving it to the guest who is standing there.
 *
 * The API has issued invoices since long before this app, and the
 * console prints them at `/invoice/[id]`. The phone could not show one
 * at all: `client.bookings.invoice` answered `unknown` until phase 4
 * typed it, and no screen called it.
 *
 * **Two ways out, and they are different jobs.** `emailInvoice` already
 * exists and sends to the address on the guest's record — right for
 * somebody who booked by phone a week ago. This is the other half: a
 * guest at the counter, holding out their own phone. Share hands over a
 * PDF, which WhatsApp and every mail app take, and which survives the
 * conversation in a way a screenshot does not.
 *
 * **The document is the server's, not a second opinion.** Every figure
 * is rendered, never recomputed — a phone that adds the lines up itself
 * is a second implementation of the bill, and the two disagree the first
 * time a tax rule changes. `formatMoney` with the invoice's own currency
 * and locale, because Hermes has no currency data and the resort may not
 * be on the phone's.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useApi } from "@rh/app-core";
import { dayLabel, formatMoney, type InvoicePayload } from "@rh/shared";
import { client } from "../../../../../src/api/session";
import { Button } from "../../../../../src/design/button";
import { Loading, Problem } from "../../../../../src/design/states";
import { Card, Row } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, space } from "../../../../../src/design/tokens";

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const [shareError, setShareError] = useState<string | null>(null);

  const doc = useApi<InvoicePayload>(
    ["invoice", bookingId],
    () => client.bookings.invoice(bookingId),
    { enabled: Number.isFinite(bookingId) },
  );

  const header = <Stack.Screen options={{ title: doc.data?.invoiceNo ?? "Invoice" }} />;

  /**
   * The money of *this* invoice, not the reader's.
   *
   * A resort bills in its own currency and the document says which; the
   * phone's own setting is about the phone. `useMoneyFormat` is right on
   * every other screen and wrong here.
   */
  const money = useCallback(
    (amount: number) =>
      formatMoney(amount, {
        currency: doc.data?.resort.currency,
        locale: doc.data?.resort.locale,
        decimals: 2,
      }),
    [doc.data?.resort.currency, doc.data?.resort.locale],
  );

  const share = useAction(
    useCallback(async () => {
      if (!doc.data) return;
      setShareError(null);
      try {
        const { uri } = await Print.printToFileAsync({ html: invoiceHtml(doc.data) });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Invoice ${doc.data.invoiceNo}`,
            UTI: "com.adobe.pdf",
          });
        } else {
          // a device with nothing to share to still gets the file made,
          // and is told where it went rather than left with a dead button
          setShareError(`Saved to ${uri}`);
        }
      } catch (ex) {
        setShareError((ex as Error).message);
      }
    }, [doc.data]),
  );

  if (doc.error && !doc.data) {
    return (
      <>
        {header}
        <Problem error={doc.error} onRetry={() => void doc.refetch()} />
      </>
    );
  }

  if (!doc.data) {
    return (
      <>
        {header}
        <Loading what="the invoice" />
      </>
    );
  }

  const d = doc.data;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={doc.isRefetching} onRefresh={() => void doc.refetch()} />
        }
      >
        <Card title={d.resort.name}>
          <Row
            title={d.invoiceNo}
            subtitle={d.issuedAt ? `Issued ${dayLabel(d.issuedAt)}` : undefined}
            meta={[d.resort.location, d.resort.phone].filter(Boolean).join(" · ") || undefined}
            // a rule under the last row is a rule under nothing: most
            // resorts have no BIN, and the divider drew anyway
            last={!d.resort.binNumber}
            accessibilityLabel={`Invoice ${d.invoiceNo}`}
          />
          {/* a VAT invoice in Bangladesh has to show the seller's BIN */}
          {d.resort.binNumber ? (
            <Row
              title="BIN"
              subtitle={d.resort.binNumber}
              last
              accessibilityLabel={`BIN ${d.resort.binNumber}`}
            />
          ) : null}
        </Card>

        <Card title="The guest">
          <Row
            title={d.guest.fullName}
            subtitle={[d.guest.phone, d.guest.email].filter(Boolean).join(" · ") || undefined}
            meta={d.guest.nidPassportNo ? `NID ${d.guest.nidPassportNo}` : undefined}
            last
            accessibilityLabel={`Guest ${d.guest.fullName}`}
          />
        </Card>

        <Card title="The stay">
          <Row
            title={`${dayLabel(d.booking.checkIn)} → ${dayLabel(d.booking.checkOut)}`}
            subtitle={`${d.booking.nights} night${d.booking.nights === 1 ? "" : "s"} · ${d.booking.adults} adult${d.booking.adults === 1 ? "" : "s"}${d.booking.children ? `, ${d.booking.children} children` : ""}`}
            meta={[d.booking.code, d.booking.agent ? `booked by ${d.booking.agent}` : null]
              .filter(Boolean)
              .join(" · ")}
            last
            accessibilityLabel={`Stay ${d.booking.code}`}
          />
        </Card>

        <Card title="What it is for">
          {d.items.map((line, i) => (
            <Row
              key={`${line.description}-${i}`}
              title={line.description}
              subtitle={
                line.nights
                  ? `${money(line.unitPrice)} × ${line.nights} night${line.nights === 1 ? "" : "s"}`
                  : `${money(line.unitPrice)} × ${line.qty}`
              }
              last={i === d.items.length - 1}
              accessibilityLabel={`${line.description}, ${money(line.amount)}`}
              right={
                <Text step="body" weight="medium" tone="title" tabular numberOfLines={1}>
                  {money(line.amount)}
                </Text>
              }
            />
          ))}
        </Card>

        <Card title="What it comes to">
          <Total label="Rooms and charges" value={money(d.roomRent)} />
          {d.discount > 0 ? <Total label="Discount" value={`− ${money(d.discount)}`} /> : null}
          <Total label="Taxable" value={money(d.taxable)} />
          {(d.taxLines ?? []).map((t) => (
            <Total key={t.code} label={`${t.label} ${t.ratePct}%`} value={money(t.amount)} />
          ))}
          <Total label="Total" value={money(d.total)} strong />
          <Total label="Paid" value={money(d.paid)} tone="ok" />
          {d.refunded > 0 ? <Total label="Refunded" value={money(d.refunded)} /> : null}
          <Total label="Due" value={money(d.due)} strong tone={d.due > 0 ? "danger" : "ok"} />
        </Card>

        {d.payments.length > 0 ? (
          <Card title="What has been paid">
            {d.payments.map((p, i) => (
              <Row
                key={`${p.date}-${i}`}
                title={p.method}
                subtitle={`${dayLabel(p.date)}${p.receivedBy ? ` · taken by ${p.receivedBy}` : ""}`}
                last={i === d.payments.length - 1}
                accessibilityLabel={`${p.method}, ${money(p.amount)}`}
                right={
                  <Text step="body" weight="medium" tone="ok" tabular numberOfLines={1}>
                    {money(p.amount)}
                  </Text>
                }
              />
            ))}
          </Card>
        ) : null}

        <Button label="Share as PDF" onPress={share.go} loading={share.busy} />
        {shareError ? (
          <Text step="small" tone="danger" weight="medium" style={styles.centred}>
            {shareError}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Total({
  label,
  value,
  strong = false,
  tone = "title",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "title" | "ok" | "danger";
}) {
  return (
    <View style={styles.total} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text step={strong ? "body" : "small"} tone={strong ? "title" : "muted"} weight={strong ? "medium" : undefined}>
        {label}
      </Text>
      <Text step={strong ? "body" : "small"} weight="medium" tone={tone} tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The same document, as a page a printer understands.
 *
 * Deliberately plain HTML with inline styles: `expo-print` renders it in
 * a WebView with no network, so a stylesheet or a web font would arrive
 * as neither. The figures are the payload's, formatted by the same
 * function the screen used — a PDF that disagrees with the screen above
 * it is worse than no PDF.
 */
export function invoiceHtml(d: InvoicePayload): string {
  const money = (n: number) =>
    formatMoney(n, { currency: d.resort.currency, locale: d.resort.locale, decimals: 2 });
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

  const lines = d.items
    .map(
      (i) => `<tr>
        <td>${esc(i.description)}</td>
        <td class="n">${i.nights ? `${money(i.unitPrice)} × ${i.nights}` : `${money(i.unitPrice)} × ${i.qty}`}</td>
        <td class="n">${money(i.amount)}</td>
      </tr>`,
    )
    .join("");

  const taxes = (d.taxLines ?? [])
    .map((t) => `<tr><td colspan="2">${esc(t.label)} ${t.ratePct}%</td><td class="n">${money(t.amount)}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Roboto, sans-serif; color: #0f172a; padding: 28px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0; }
  .muted { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
  .n { text-align: right; white-space: nowrap; }
  .tot td { border: none; padding: 3px 0; }
  .grand td { font-weight: 700; border-top: 1px solid #0f172a; padding-top: 6px; }
</style></head><body>
  <h1>${esc(d.resort.name)}</h1>
  <div class="muted">${[d.resort.location, d.resort.address, d.resort.phone].filter(Boolean).map(esc).join(" · ")}</div>
  ${d.resort.binNumber ? `<div class="muted">BIN ${esc(d.resort.binNumber)}</div>` : ""}

  <p><b>Invoice ${esc(d.invoiceNo)}</b>${d.issuedAt ? ` · ${esc(dayLabel(d.issuedAt))}` : ""}<br/>
  ${esc(d.guest.fullName)}${d.guest.phone ? ` · ${esc(d.guest.phone)}` : ""}<br/>
  <span class="muted">${esc(d.booking.code)} · ${esc(dayLabel(d.booking.checkIn))} → ${esc(dayLabel(d.booking.checkOut))} · ${d.booking.nights} night(s)</span></p>

  <table><thead><tr><th>Description</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
  <tbody>${lines}</tbody></table>

  <table class="tot">
    <tr><td colspan="2">Rooms and charges</td><td class="n">${money(d.roomRent)}</td></tr>
    ${d.discount > 0 ? `<tr><td colspan="2">Discount</td><td class="n">− ${money(d.discount)}</td></tr>` : ""}
    <tr><td colspan="2">Taxable</td><td class="n">${money(d.taxable)}</td></tr>
    ${taxes}
    <tr class="grand"><td colspan="2">Total</td><td class="n">${money(d.total)}</td></tr>
    <tr><td colspan="2">Paid</td><td class="n">${money(d.paid)}</td></tr>
    ${d.refunded > 0 ? `<tr><td colspan="2">Refunded</td><td class="n">${money(d.refunded)}</td></tr>` : ""}
    <tr class="grand"><td colspan="2">Due</td><td class="n">${money(d.due)}</td></tr>
  </table>
</body></html>`;
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 3,
  },
  centred: { textAlign: "center" },
});
