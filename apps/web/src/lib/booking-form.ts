/**
 * What the new-booking form still needs before it can be sent, top to bottom.
 *
 * Kept apart from the form so the rule has a test, and so the button and the
 * message under it cannot disagree about what is missing.
 */
export type BookingGap = "rooms" | "guestName";

export function whatTheBookingNeeds(form: { rooms: number; guestName: string }): BookingGap[] {
  const gaps: BookingGap[] = [];
  if (form.rooms <= 0) gaps.push("rooms");
  if (!form.guestName.trim()) gaps.push("guestName");
  return gaps;
}

export const BOOKING_GAP_MESSAGES: Record<BookingGap, string> = {
  rooms: "Pick at least one room.",
  guestName: "Type the guest's name.",
};
