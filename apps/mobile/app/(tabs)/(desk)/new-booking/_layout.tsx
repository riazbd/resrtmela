/**
 * The three screens that take one booking, and the draft under all of them.
 *
 * A nested stack, so backing out of step 2 lands on step 1 rather than on
 * whatever opened the form — and so the draft, which lives here, outlives
 * each step. Going back to change the dates must not lose the guest's name.
 *
 * The form can be opened already answered: the day sheet taps a free room,
 * the month view taps a night. Those arrive as query parameters and are
 * validated here, because a route parameter is something a person typed as
 * far as this file is concerned.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import { Draft, type BookingDraft } from "../../../../src/booking/draft";

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function NewBookingLayout() {
  const params = useLocalSearchParams<{ checkIn?: string; checkOut?: string }>();

  const start: Partial<BookingDraft> = {};
  if (isDay(params.checkIn)) start.checkIn = params.checkIn;
  if (isDay(params.checkOut)) start.checkOut = params.checkOut;

  return (
    <Draft start={start}>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="index" options={{ title: "New booking" }} />
        <Stack.Screen name="guest" options={{ title: "Who is staying" }} />
        <Stack.Screen name="money" options={{ title: "What it comes to" }} />
      </Stack>
    </Draft>
  );
}
