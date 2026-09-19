/**
 * An icon for each of the console's destinations.
 *
 * The only part of the menu that could not be shared. `CONSOLE_NAV` lives in
 * `@rh/shared` — every href, permission and plan feature — because both
 * clients must decide visibility from the same rows. The pictures cannot go
 * with it: the desk draws lucide, which is React DOM, and a shared package
 * that imported it would stop being shareable.
 *
 * The names are chosen to match what the console shows, so somebody moving
 * between the two recognises the same screen.
 */
import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const BY_HREF: Record<string, IconName> = {
  "/platform": "earth",
  "/agent/discover": "map-marker-radius-outline",
  "/agent/search": "magnify",
  "/agent/calendar": "calendar-month-outline",
  "/agent/tours": "package-variant-closed",
  "/agent/sales": "file-document-outline",
  "/agent/guests": "account-group-outline",
  "/agent/expenses": "receipt",
  "/agent/payroll": "cash-multiple",
  "/agent/wallet": "wallet-outline",
  "/agent/team": "account-multiple-outline",
  "/agent/website": "earth",
  "/agent/api": "key-outline",
  "/mailbox": "email-outline",
  "/daysheet": "script-text-outline",
  "/dashboard": "view-dashboard-outline",
  "/calendar": "calendar-month-outline",
  "/bookings": "bed-outline",
  "/payments": "wallet-outline",
  "/guests": "account-group-outline",
  "/expenses": "receipt",
  "/fb": "silverware-fork-knife",
  "/payroll": "cash-multiple",
  "/reports": "chart-bar",
  "/rooms": "domain",
  "/activities": "compass-outline",
  "/import": "upload-outline",
  "/profile": "account-outline",
  "/settings": "cog-outline",
  "/account": "lock-outline",
};

/**
 * A destination with no icon of its own gets a compass rather than a hole,
 * so a screen added to `CONSOLE_NAV` is visible here before anybody has
 * chosen a picture for it.
 */
export function iconFor(href: string): IconName {
  return BY_HREF[href] ?? "compass-outline";
}

/** More is not a destination in the list; it is this app's own. */
export const MORE_ICON: IconName = "dots-horizontal";
