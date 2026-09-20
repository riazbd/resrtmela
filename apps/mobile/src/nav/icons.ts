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
  "/agent/website": "web",
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
  "/housekeeping": "broom",
  "/activities": "compass-outline",
  "/import": "upload-outline",
  "/profile": "account-outline",
  "/settings": "cog-outline",
  "/account": "lock-outline",
};

/**
 * What a destination shows before anybody has chosen a picture for it.
 *
 * It was a compass until 2026-09-21, and the compass is also
 * `/activities`' own icon — so when Housekeeping arrived without one,
 * the More list drew the two screens one under the other behind the
 * same picture and neither the code nor the eye could tell the borrowed
 * one from the chosen one. A question mark can be mistaken for nothing
 * else, which is the whole job: a hole that is visible rather than a
 * plausible icon that hides.
 */
export const NO_ICON_YET: IconName = "help-circle-outline";

/**
 * A destination with no icon of its own gets a placeholder rather than a
 * hole, so a screen added to `CONSOLE_NAV` is visible here before
 * anybody has drawn for it. `every-destination-has-its-own-picture`
 * fails while any destination is still relying on it.
 */
export function iconFor(href: string): IconName {
  return BY_HREF[href] ?? NO_ICON_YET;
}

/** More is not a destination in the list; it is this app's own. */
export const MORE_ICON: IconName = "dots-horizontal";
