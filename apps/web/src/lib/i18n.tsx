"use client";

/**
 * The console's language.
 *
 * The dictionaries moved to `@rh/app-core`, and of everything in this
 * extraction they are the piece most certain to have drifted if left in two
 * places: somebody fixes a word here, nobody fixes it on the phone, and a year
 * later the same screen says two different things to the same person depending
 * on what they are holding.
 *
 * What stays is where the choice is remembered. `guardedStorage` rather than
 * the raw store, because a language preference is worth nothing beside a
 * screen that renders: a private window must change the wording, not break the
 * page.
 */
import { LangProvider as SharedLangProvider, guardedStorage } from "@rh/app-core";
import { browserStorage } from "@/lib/offline-cache";

export { DICTS, DEFAULT_LANG, isStateKey, useLang, useT, type Lang, type DictKey } from "@rh/app-core";

const remembered = guardedStorage(browserStorage);

export function LangProvider({ children }: { children: React.ReactNode }) {
  return <SharedLangProvider storage={remembered}>{children}</SharedLangProvider>;
}
