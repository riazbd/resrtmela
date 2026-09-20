/**
 * One booking, loaded, for the screens that act on it.
 *
 * Arriving, leaving and paying all open on the same booking, all owe the
 * same three states before they can draw anything, and all have to put the
 * fresh copy back when they are done. Written three times that would be
 * three chances to forget the refetch — and a check-in screen showing the
 * count it had before the write is how a clerk adds the extra person
 * twice.
 *
 * It reads through the same query key the detail screen uses, so opening
 * one of these from a booking draws instantly off what is already loaded
 * and the write below refreshes both.
 */
import { useCallback, type ReactNode } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import type { BookingDetail } from "@rh/shared";
import { client } from "../api/session";
import { Loading, Problem } from "../design/states";

export interface StayTools {
  /** Re-reads the booking, and the list and day sheet that show it. */
  reload: () => Promise<void>;
}

export function Stay({
  title,
  children,
}: {
  /** `%s` is replaced by the booking's code once it is known. */
  title: string;
  children: (booking: BookingDetail, tools: StayTools) => ReactNode;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const qc = useQueryClient();

  const stay = useApi(keys.booking(bookingId), () => client.bookings.get(bookingId), {
    enabled: Number.isFinite(bookingId),
  });

  /**
   * The booking, and everything that shows it.
   *
   * A charge added here changes the day sheet's due column and the
   * bookings list's payment state. Invalidating only this booking leaves a
   * clerk backing out to a register that disagrees with the screen they
   * just left.
   */
  const reload = useCallback(async () => {
    await stay.refetch();
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["bookings"] }),
      qc.invalidateQueries({ queryKey: ["day-sheet"] }),
      qc.invalidateQueries({ queryKey: ["dues"] }),
    ]);
  }, [stay, qc]);

  const head = <Stack.Screen options={{ title: title.replace("%s", stay.data?.code ?? "") }} />;

  if (stay.error && !stay.data) {
    return (
      <>
        {head}
        <Problem error={stay.error} onRetry={() => void stay.refetch()} />
      </>
    );
  }

  if (!stay.data) {
    return (
      <>
        {head}
        <Loading what="the booking" />
      </>
    );
  }

  return (
    <>
      {head}
      {children(stay.data, { reload })}
    </>
  );
}
