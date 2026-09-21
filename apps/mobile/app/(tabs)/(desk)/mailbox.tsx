/**
 * Writing to the whole guest list — the half of it that belongs here.
 *
 * Reading: how many credits are left, and what has already gone out.
 * Sending: not here, and that is a decision rather than an omission. A
 * campaign is a paragraph somebody wants to re-read before it reaches
 * four hundred people, and there is no undo — the worst possible thing
 * to compose one-handed between guests.
 *
 * Credits are bought by *asking*: the purchase route queues an order and
 * grants nothing until the platform approves it. So the balance travels
 * with the payment instructions, which are the platform's and change
 * without a deploy — which is also why they are shown rather than
 * written into this file.
 *
 * **Asking is here as of 2026-09-21.** It was not, and the screen showed
 * the payment instructions anyway — the address to send money to, beside
 * no way to say what the money was for. A resort owner and an agency
 * both reported the same thing: they could see the balance running down
 * and could not buy more without opening the console. The route has
 * never needed a permission beyond being signed in; `billTo` scopes the
 * order to whichever account is asking, which is why it works for an
 * agency that has no resort at all.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import {
  dayLabel,
  formatMoney,
  type CreditPack,
  type EmailCampaign,
  type EmailCreditOrderRow,
} from "@rh/shared";
import { useApi } from "@rh/app-core";
import { client, useAuth } from "../../../src/api/session";
import { Button } from "../../../src/design/button";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, radius, space } from "../../../src/design/tokens";

export default function MailboxScreen() {
  const { me } = useAuth();

  const credits = useApi(["email-credits"], () => client.engage.credits(), {
    enabled: Boolean(me),
  });
  const campaigns = useApi<EmailCampaign[]>(
    ["email-campaigns"],
    () => client.engage.campaigns(),
    { enabled: Boolean(me) },
  );

  const header = <Stack.Screen options={{ title: "Bulk Email" }} />;

  if (credits.error && !credits.data) {
    return (
      <>
        {header}
        <Problem error={credits.error} onRetry={() => void credits.refetch()} />
      </>
    );
  }

  if (!credits.data) {
    return (
      <>
        {header}
        <Loading what="your email credits" />
      </>
    );
  }

  const left = credits.data.credits;
  const sent = campaigns.data ?? [];

  return (
    <>
      {header}
      <Stale age={credits.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={credits.isRefetching || campaigns.isRefetching}
            onRefresh={() => {
              void credits.refetch();
              void campaigns.refetch();
            }}
          />
        }
      >
        <View style={styles.figures}>
          <Stat
            label="Credits left"
            value={String(left)}
            sub="one per guest emailed"
            tone={left === 0 ? "danger" : "title"}
          />
          <Stat label="Campaigns sent" value={String(sent.length)} sub="last fifty" />
        </View>

        {left === 0 ? (
          <View style={styles.none}>
            <Text step="small" tone="warn" weight="medium">
              No credits left — nothing can be sent until more are approved.
            </Text>
          </View>
        ) : null}

        <Card title="Already sent">
          {campaigns.error && !campaigns.data ? (
            <Problem error={campaigns.error} onRetry={() => void campaigns.refetch()} />
          ) : !campaigns.data ? (
            <Loading what="what has gone out" />
          ) : sent.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nothing sent yet" />
            </View>
          ) : (
            sent.map((campaign, i) => (
              <Row
                key={campaign.id}
                title={campaign.subject}
                subtitle={`${dayLabel(campaign.sentAt, { style: "full" })} · ${campaign.recipients} recipient${campaign.recipients === 1 ? "" : "s"}`}
                last={i === sent.length - 1}
                accessibilityLabel={`${campaign.subject}, ${dayLabel(campaign.sentAt, { style: "full" })}, ${campaign.recipients} recipients, ${campaign.status.toLowerCase()}`}
                right={
                  // PARTIAL is the one worth noticing: it reached some of
                  // the list and not the rest, which looks like success
                  // in a count and is not
                  campaign.status === "SENT" ? null : (
                    <View style={campaign.status === "PARTIAL" ? styles.partial : styles.failed}>
                      <Text
                        step="caption"
                        weight="medium"
                        tone={campaign.status === "PARTIAL" ? "warn" : "danger"}
                      >
                        {campaign.status.toLowerCase()}
                      </Text>
                    </View>
                  )
                }
              />
            ))
          )}
        </Card>

        <BuyCredits payTo={credits.data.payTo} onAsked={() => void credits.refetch()} />

        <Text step="caption" tone="muted" style={styles.footnote}>
          Writing and sending a campaign stays on the desk. There is no undo,
          and a paragraph going to four hundred people deserves re-reading on
          a screen that fits it.
        </Text>
      </ScrollView>
    </>
  );
}

/**
 * What became of a request, in the console's own words.
 *
 * PENDING reads as "awaiting payment" rather than "awaiting approval",
 * and that is the accurate half: there is no gateway, so the platform is
 * waiting for the money and approval is the receipt for it. A buyer told
 * they are waiting for approval goes looking for somebody to chase.
 */
function answerFor(status: string): string {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Declined";
  return "Awaiting payment";
}

function toneFor(status: string): "ok" | "failed" | "partial" {
  if (status === "APPROVED") return "ok";
  if (status === "REJECTED") return "failed";
  return "partial";
}

function toneWord(status: string): "ok" | "danger" | "warn" {
  if (status === "APPROVED") return "ok";
  if (status === "REJECTED") return "danger";
  return "warn";
}

/**
 * Asking the platform for more credits.
 *
 * There is no gateway, so this is a request rather than a purchase:
 * approval *is* the receipt, and the platform grants the credits once
 * the money has landed. Saying so plainly matters more here than
 * anywhere else on this screen — somebody who thinks they have just
 * bought two thousand emails will try to send them.
 *
 * The confirmation carries the amount and the payment instructions
 * together. They are the platform's own words, and the pack prices are
 * a platform setting, so neither is written into this file.
 *
 * `clientRef` is minted at the moment of sending, from `Date.now()`, as
 * the console mints it. A double-tap is held off by `useAction`, which
 * latches until the call settles; what the shared reference would have
 * bought on top of that is the retry after a request that landed and
 * lost its reply, and the console does not buy it either.
 */
function BuyCredits({ payTo, onAsked }: { payTo: string; onAsked: () => void }) {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const [asking, setAsking] = useState<CreditPack | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const packs = useApi<CreditPack[]>(
    ["email-credit-packs"],
    () => client.engage.creditPacks(),
    // the platform's price list, which changes about never
    { enabled: Boolean(me), staleTime: 3_600_000 },
  );
  const orders = useApi<EmailCreditOrderRow[]>(
    ["email-credit-orders", "mine"],
    () => client.engage.myCreditOrders(),
    { enabled: Boolean(me) },
  );

  const ask = useAction(async () => {
    if (!asking) return;
    setRefused(null);
    try {
      await client.engage.requestCredits(asking.credits, `pack-${asking.credits}-${Date.now()}`);
      setAsking(null);
      await orders.refetch();
      onAsked();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const asked = orders.data ?? [];

  return (
    <>
      <Card title="Buying more">
        {packs.error && !packs.data ? (
          <Problem error={packs.error} onRetry={() => void packs.refetch()} />
        ) : !packs.data ? (
          <Loading what="what the platform sells" />
        ) : packs.data.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="Nothing on sale just now" />
          </View>
        ) : asking ? (
          <View style={styles.asking}>
            <Text step="body" tone="title" weight="medium">
              Ask for {asking.credits.toLocaleString("en-IN")} credits at{" "}
              {whole(asking.price)}?
            </Text>
            <Text step="small" tone="muted">
              Nothing is charged here. Send the money, and the credits arrive
              once the platform confirms it.
            </Text>
            {payTo ? (
              <View style={styles.payTo}>
                <Text step="caption" tone="muted" weight="medium">
                  PAY TO
                </Text>
                <Text step="small" tone="body">
                  {payTo}
                </Text>
              </View>
            ) : null}
            <View style={styles.askRow}>
              <Button label="Ask for it" loading={ask.busy} onPress={ask.go} block={false} />
              <Button
                label="Not now"
                kind="ghost"
                onPress={() => setAsking(null)}
                block={false}
              />
            </View>
          </View>
        ) : (
          packs.data.map((pack, i) => (
            <Row
              key={pack.credits}
              title={`${pack.credits.toLocaleString("en-IN")} emails`}
              last={i === packs.data!.length - 1}
              accessibilityLabel={`${pack.credits} emails for ${whole(pack.price)}`}
              onPress={() => setAsking(pack)}
              right={
                <Text step="body" weight="medium" tone="title" tabular>
                  {whole(pack.price)}
                </Text>
              }
            />
          ))
        )}

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        <Text step="caption" tone="muted" style={styles.note}>
          Credits are asked for, not bought outright — nothing is granted until
          the platform approves the order.
        </Text>
      </Card>

      {/*
        Every request, with what became of it — the console's own list.
        This showed only the ones still waiting, which hid the answer an
        owner most needs to see: a pack they sent money for and had
        **declined**. Somebody who cannot tell a request in the queue
        from one that was refused asks for it again.
      */}
      {asked.length > 0 ? (
        <Card title="Your requests">
          {asked.map((order, i) => (
            <Row
              key={order.id}
              title={`${order.credits.toLocaleString("en-IN")} emails`}
              subtitle={`${whole(order.price)} · ${dayLabel(order.createdAt, { style: "full" })}${order.note ? ` · ${order.note}` : ""}`}
              last={i === asked.length - 1}
              accessibilityLabel={`${order.credits} emails for ${whole(order.price)}, asked for on ${dayLabel(order.createdAt, { style: "full" })}, ${answerFor(order.status).toLowerCase()}`}
              right={
                <View style={styles[toneFor(order.status)]}>
                  <Text step="caption" weight="medium" tone={toneWord(order.status)}>
                    {answerFor(order.status)}
                  </Text>
                </View>
              }
            />
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  asking: { gap: space.md, paddingVertical: space.sm },
  askRow: { flexDirection: "row", gap: space.sm },
  payTo: {
    backgroundColor: color.ink[50],
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  emptyBox: { paddingVertical: space.lg },
  note: { paddingTop: space.sm },
  footnote: { textAlign: "center" },
  none: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  partial: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  ok: {
    backgroundColor: color.ok.bg,
    borderWidth: 1,
    borderColor: color.ok.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  failed: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
