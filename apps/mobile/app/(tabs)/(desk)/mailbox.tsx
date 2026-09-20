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
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { dayLabel, type EmailCampaign } from "@rh/shared";
import { useApi } from "@rh/app-core";
import { client, useAuth } from "../../../src/api/session";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
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

  const header = <Stack.Screen options={{ title: "Bulk email" }} />;

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

        {credits.data.payTo ? (
          <Card title="Buying more">
            <Text step="small" tone="body">
              {credits.data.payTo}
            </Text>
            <Text step="caption" tone="muted" style={styles.note}>
              Credits are asked for, not bought outright — nothing is granted
              until the platform approves the order.
            </Text>
          </Card>
        ) : null}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Writing and sending a campaign stays on the desk. There is no undo,
          and a paragraph going to four hundred people deserves re-reading on
          a screen that fits it.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
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
  failed: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
