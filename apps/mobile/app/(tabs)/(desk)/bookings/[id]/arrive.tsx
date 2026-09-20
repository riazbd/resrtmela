/**
 * Who actually arrived.
 *
 * A booking for two turns up as four. This is the moment the desk can
 * answer that, so it is the moment it is asked — and the count replaces
 * the booked one, charged for every night of the stay at the rate of the
 * room each person sleeps in.
 *
 * The order of the two writes is load-bearing. The count goes first,
 * because a check-in that succeeded over a count that did not would leave
 * the guest in house with the wrong bill, and nobody would notice until
 * they left. Setting the count needs a connection; the check-in itself can
 * be queued, so a dead network never keeps a guest standing at a counter.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { BookingDetail } from "@rh/shared";
import { Stay, type StayTools } from "../../../../../src/booking/stay";
import { client } from "../../../../../src/api/session";
import { useStayDesk } from "../../../../../src/api/desk";
import { Button } from "../../../../../src/design/button";
import { Counter } from "../../../../../src/design/counter";
import { Field } from "../../../../../src/design/input";
import { Card } from "../../../../../src/design/surface";
import { Text } from "../../../../../src/design/text";
import { useAction } from "../../../../../src/design/use-action";
import { color, radius, space } from "../../../../../src/design/tokens";

export default function ArriveScreen() {
  return (
    <Stay title="Check in %s">
      {(booking, tools) => <Arrival booking={booking} tools={tools} />}
    </Stay>
  );
}

/** "Booked for 2 adults and 1 child" — what the count is being changed from. */
function bookedFor(b: BookingDetail): string {
  const parts = [`${b.adults} adult${b.adults === 1 ? "" : "s"}`];
  if (b.children > 0) parts.push(`${b.children} ${b.children === 1 ? "child" : "children"}`);
  const extra = b.extraPersons ?? 0;
  return `Booked for ${parts.join(" and ")}${
    extra > 0 ? `, plus ${extra} extra already on the bill` : ""
  }.`;
}

function Arrival({ booking, tools }: { booking: BookingDetail; tools: StayTools }) {
  const desk = useStayDesk();
  const [persons, setPersons] = useState(booking.extraPersons ?? 0);
  const [refused, setRefused] = useState<string | null>(null);

  const arrive = useAction(async () => {
    setRefused(null);
    try {
      if (persons !== (booking.extraPersons ?? 0)) {
        // first, and only then the check-in: a guest in house against a
        // bill that never learned about the extra bed is found at checkout
        await client.bookings.extraPersons(booking.id, persons);
        await tools.reload();
      }
      await desk.transition(booking, "CHECKED_IN");
      await tools.reload();
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        {/* one string, not three children: a screen reader announces each
            text node on its own, and "Booked for 2 adults", ", plus 1
            extra already on the bill." arrive as two unrelated sentences */}
        <Text step="body" tone="body">
          {bookedFor(booking)}
        </Text>
      </Card>

      <Card title="Anyone else?">
        <Field
          label="Extra persons"
          hint="Everyone beyond what the rooms were booked for. Charged for every night of the stay, at each room's own rate."
        >
          <Counter label="extra person" value={persons} onChange={setPersons} />
        </Field>
      </Card>

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}

      <Button label="Check in" loading={arrive.busy} onPress={arrive.go} />
      <Button label="Not yet" kind="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
