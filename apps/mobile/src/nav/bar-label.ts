/**
 * What a destination is called on the tab bar, which is narrower than a
 * sidebar.
 *
 * The console's labels are `CONSOLE_NAV`'s, shared so that both clients
 * name the same screen the same way, and that is right for the More list
 * — it has the full width of the phone. The bar does not. Five tabs
 * divide about 393 points between them, and at the caption size that is
 * roughly ten characters each.
 *
 * The owner opened the app and the last tab read **"Rooms & Ra…"**. An
 * ellipsis in a tab is not a small thing: the bar is the one part of the
 * app somebody reads without looking, and half a word is worse than a
 * shorter one.
 *
 * So the handful that do not fit are named again here, and only those —
 * the rest keep the console's word, ellipsis-free and recognisable.
 * `a-tab-label-fits-on-the-bar.spec.ts` fails when a new destination
 * arrives with a label the bar cannot hold, which is the whole point of
 * writing the limit down rather than remembering it.
 */

/**
 * Ten characters.
 *
 * Measured, not chosen: the bar is 393 points wide on the device this was
 * found on, five tabs make each about 78, and the caption font at weight
 * 600 draws roughly 7.5 points per character — call it ten before the
 * label is cut. "Dashboard" is nine and sits comfortably; "Rooms & Rates"
 * is thirteen and did not.
 */
export const BAR_LIMIT = 10;

/**
 * Only where the console's own word is too long. A name here is a
 * deliberate second name for one screen, so each is the shortest thing
 * that is still unmistakably that screen.
 */
const SHORTER: Record<string, string> = {
  // the only one, today: "Rooms & Rates" is thirteen characters and the
  // bar showed "Rooms & Ra…". The rates live on that screen either way,
  // and nobody looking for them looks anywhere else.
  "/rooms": "Rooms",

  // the agent's bar, found by the same rule before phase 3 drew it
  "/agent/discover": "Discover",      // "Discover resorts" — the resorts are what there is to discover
  "/agent/search": "Search",          // "Find a room" — the verb is enough on a bar
  "/agent/sales": "Quotes",           // "Quotes & invoices" — an invoice is a quote that was accepted
};

/** The console's label, unless the bar cannot hold it. */
export function barLabel(href: string, full: string): string {
  return SHORTER[href] ?? full;
}
