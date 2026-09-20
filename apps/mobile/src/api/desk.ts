/**
 * The two writes a guest is standing there for.
 *
 * A check-in, a check-out and a payment are the only things on a booking
 * that cannot wait for a network. A resort in the hill districts loses its
 * connection mid-morning; the guest does not care, and a desk that stops
 * working is a desk that goes back to paper.
 *
 * So these three go through the outbox: sent now if there is a network,
 * held if there is not, replayed when it returns. Each carries its own
 * reference, which is what lets the server recognise a replay — one queued
 * write makes one transition and one payment, however many times it is
 * sent.
 *
 * This lives in `src/api/` because a queued write carries its address as
 * data, and `a-screen-never-writes-an-address.spec.ts` will not let a
 * screen hold one. The address itself is `paths` in `@rh/shared`, the same
 * object the client posts to, so the held copy and the sent copy cannot
 * drift apart.
 */
import { useMemo } from "react";
import { useOutbox } from "@rh/app-core";
import {
  paths,
  transitionCanWait,
  type PaymentEntry,
  type BookingDetail,
} from "@rh/shared";
import { client } from "./session";

/** Enough of a booking to say, in a queued row, what the write was. */
type Named = Pick<BookingDetail, "id" | "code">;

export interface StayDesk {
  /** Moves a booking on. Queued when the guest is waiting, sent otherwise. */
  transition: (booking: Named, to: string) => Promise<{ queued: boolean }>;
  /** Money into the drawer, against what is still due. */
  pay: (booking: Named, entry: PaymentEntry) => Promise<{ queued: boolean }>;
  online: boolean;
}

export function useStayDesk(): StayDesk {
  const { submit, online } = useOutbox();

  return useMemo(
    () => ({
      online,
      transition: async (booking, to) => {
        /**
         * Only arriving and leaving may be held. Confirming a booking or
         * marking a no-show is nobody's emergency, and a write that would
         * quietly overwrite a colleague's change is better refused than
         * queued — `transitionCanWait` is that rule, shared with the
         * console so the two clients queue the same set.
         */
        if (!transitionCanWait(to)) {
          await client.bookings.transition(booking.id, to);
          return { queued: false };
        }
        return submit({
          kind: to === "CHECKED_IN" ? "checkin" : "checkout",
          label: `${to === "CHECKED_IN" ? "Check in" : "Check out"} ${booking.code}`,
          path: paths.bookingTransition(booking.id),
          body: { to },
        });
      },
      pay: (booking, entry) =>
        submit({
          kind: "payment",
          label: `${entry.amount} for ${booking.code}`,
          path: paths.bookingPayments(booking.id),
          body: { ...entry },
        }),
    }),
    [submit, online],
  );
}
