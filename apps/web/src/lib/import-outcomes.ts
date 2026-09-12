/**
 * What the importer did with one row, in the importer's own words.
 *
 * The Row detail table used to render these through the booking-state badge,
 * which meant borrowing a state's colour and getting its vocabulary attached:
 * a skipped row said "Cancelled", an imported one said "Confirmed", and a room
 * marked out of service — which creates no booking at all — was reported as a
 * guest who never turned up.
 *
 * This is the same mistake the rooms screen made and had to undo (see the note
 * beside OUT_OF_SERVICE in `components/ui.tsx`): a colour is worth borrowing, a
 * word is not. So the colours live here as classes and the words are written
 * for the only question this table answers — what happened to line 47 of my
 * spreadsheet?
 */
export type ImportOutcome = "imported" | "skipped" | "out_of_service" | "conflict_no_hold";

export const IMPORT_OUTCOME: Record<ImportOutcome, { label: string; style: string }> = {
  imported: { label: "Imported", style: "bg-green-50 text-green-700 ring-green-200" },
  skipped: { label: "Skipped", style: "bg-red-50 text-red-700 ring-red-200" },
  /** no booking was made; the room itself was marked unavailable for those nights */
  out_of_service: { label: "Room blocked", style: "bg-amber-50 text-amber-700 ring-amber-200" },
  /**
   * The booking came in, but a live booking already held one of those nights,
   * so the nights were not reserved. "Overlap" rather than "Pending": nothing
   * is waiting on anybody, there is a clash to go and look at.
   */
  conflict_no_hold: { label: "Overlap", style: "bg-orange-50 text-orange-700 ring-orange-200" },
};
