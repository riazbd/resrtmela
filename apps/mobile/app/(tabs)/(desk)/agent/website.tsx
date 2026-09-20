/**
 * The agency's own website: whether it is up, and where.
 *
 * The editor writes an intro paragraph, picks a theme colour, orders
 * photographs and chooses which resorts to hide. None of that is
 * one-handed work and none of it is urgent.
 *
 * What is worth a phone is the question somebody asks when a customer
 * says "I looked at your site": **is it live, and at what address?**
 * Plus the photograph quota, because running out of it is the thing
 * that silently stops an upload at the desk later.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import { dayLabel, type AgencySite } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

/** "1.2 MB of 50 MB" — bytes are not a thing anybody reads. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export default function AgentWebsiteScreen() {
  const { me } = useAuth();

  const site = useApi<AgencySite>(["agent-site"], () => client.agent.site(), {
    enabled: Boolean(me),
  });

  const header = <Stack.Screen options={{ title: "Website" }} />;

  if (site.error && !site.data) {
    return (
      <>
        {header}
        <Problem error={site.error} onRetry={() => void site.refetch()} />
      </>
    );
  }

  if (!site.data) {
    return (
      <>
        {header}
        <Loading what="the website" />
      </>
    );
  }

  const s = site.data;
  const address = `resortmela.com/a/${s.slug}`;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={site.isRefetching} onRefresh={() => void site.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat
            label="Status"
            value={s.published ? "Live" : "Not published"}
            sub={
              s.published && s.publishedAt
                ? `since ${dayLabel(s.publishedAt, { style: "full" })}`
                : "nobody can see it yet"
            }
            tone={s.published ? "ok" : "danger"}
          />
        </View>

        {s.published ? null : (
          <View style={styles.warn}>
            <Text step="small" weight="medium" tone="warn">
              This site is not published. Anyone given the address sees nothing.
            </Text>
          </View>
        )}

        <Card title="Where it is">
          <Row title="Address" meta={address} accessibilityLabel={`Address ${address}`} />
          <Row title="Name" meta={s.name} accessibilityLabel={`Name ${s.name}`} />
          <Row
            title="Headline"
            meta={s.headline ?? "not set"}
            last
            accessibilityLabel={`Headline: ${s.headline ?? "not set"}`}
          />
        </Card>

        <Card title={`${s.resorts.length} resort${s.resorts.length === 1 ? "" : "s"} on it`}>
          {s.resorts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="No resorts are listed" />
            </View>
          ) : (
            s.resorts.map((r, i) => (
              <Row
                key={r.id}
                title={r.name}
                subtitle={r.location ?? undefined}
                // a hidden resort is on the account and off the site, and
                // an owner wondering why a customer cannot see one asks here
                meta={s.hiddenResortIds.includes(r.id) ? "hidden" : undefined}
                last={i === s.resorts.length - 1}
                accessibilityLabel={`${r.name}${
                  s.hiddenResortIds.includes(r.id) ? ", hidden from the site" : ""
                }`}
              />
            ))
          )}
        </Card>

        <Card title="Photographs">
          <Row
            title="Used"
            meta={`${megabytes(s.storage.used)} of ${megabytes(s.storage.quota)}`}
            last
            accessibilityLabel={`${megabytes(s.storage.used)} of ${megabytes(
              s.storage.quota,
            )} used`}
          />
        </Card>

        <Text step="caption" tone="muted" style={styles.footnote}>
          The pages, the photographs and the colours are written on the desk.
          A paragraph a customer reads is worth a wide screen.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  warn: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
