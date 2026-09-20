/**
 * A booking being written, across the three screens that write it.
 *
 * The console asks all of this at once, in one modal. A phone cannot, so
 * §5 splits it into when-and-where, who, and what-it-costs — and the moment
 * a form spans three pushed screens it needs somewhere to live that is not
 * any one of them. Going back a step to change the dates must not lose the
 * guest's name.
 *
 * It is deliberately plain state and not a reducer: there are no
 * transitions here, only a form, and a reducer would be a switch statement
 * standing in for `{ ...draft, ...patch }`.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { addDaysIso, todayIn, type DiscountKind, type RoomAvail } from "@rh/shared";
import { useAuth } from "../api/session";

export interface BookingDraft {
  /**
   * `null` means the resort's today — resolved on read, never on write.
   *
   * `useState(() => todayIn(tz))` reads correctly and is wrong: the
   * initialiser runs before the session has restored, when the resort is
   * still null and the fallback zone is UTC. The day sheet opened on
   * yesterday for a whole working morning that way. So the draft holds the
   * *absence* of a choice, and today is recomputed from whatever the
   * session now knows.
   */
  checkIn: string | null;
  /** `null` means the night after check-in, which is most bookings. */
  checkOut: string | null;
  /** The rooms themselves, so steps 2 and 3 can price the extra beds. */
  rooms: RoomAvail[];
  guestName: string;
  phone: string;
  email: string;
  nid: string;
  adults: number;
  children: number;
  extraPersons: number;
  /** No name, no papers: the guest is standing at the counter. */
  walkIn: boolean;
  /** A tour party: one booking per room, one guest, shared terms. */
  group: boolean;
  discount: number;
  discountKind: DiscountKind;
  advance: number;
  advanceMethod: string;
  remarks: string;
}

const EMPTY: BookingDraft = {
  checkIn: null,
  checkOut: null,
  rooms: [],
  guestName: "",
  phone: "",
  email: "",
  nid: "",
  adults: 2,
  children: 0,
  extraPersons: 0,
  walkIn: false,
  group: false,
  discount: 0,
  discountKind: "FLAT",
  advance: 0,
  advanceMethod: "CASH",
  remarks: "",
};

export interface DraftValue extends BookingDraft {
  /** Always a date: `checkIn` resolved against the resort's today. */
  checkIn: string;
  checkOut: string;
  /** What the API is sent, derived so it cannot disagree with `rooms`. */
  roomIds: number[];
  set: (patch: Partial<BookingDraft>) => void;
}

const DraftContext = createContext<DraftValue | null>(null);

export function useDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDraft outside <Draft>");
  return value;
}

/**
 * `start` is where the booking begins, and it has two real callers besides
 * the tests: the day sheet, where a clerk taps a free room, and the month
 * view, where they tap a night. Arriving at step 1 with the answer already
 * filled in is the difference between two taps and eight.
 */
export function Draft({ start, children }: { start?: Partial<BookingDraft>; children: ReactNode }) {
  const { activeResort } = useAuth();
  const [draft, setDraft] = useState<BookingDraft>({ ...EMPTY, ...start });

  const set = useCallback((patch: Partial<BookingDraft>) => {
    setDraft((old) => {
      const next = { ...old, ...patch };
      // a check-out that is no longer after the check-in is not a choice
      // anybody made; it is the old answer to a question that has changed
      const from = next.checkIn;
      if (patch.checkIn && from && next.checkOut && next.checkOut <= from) next.checkOut = null;
      // one room cannot be split into a booking each
      if (next.rooms.length < 2) next.group = false;
      return next;
    });
  }, []);

  const value = useMemo<DraftValue>(() => {
    const checkIn = draft.checkIn ?? todayIn(activeResort?.timezone);
    return {
      ...draft,
      checkIn,
      checkOut: draft.checkOut ?? addDaysIso(checkIn, 1),
      roomIds: draft.rooms.map((r) => r.roomId),
      set,
    };
  }, [draft, activeResort?.timezone, set]);

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
