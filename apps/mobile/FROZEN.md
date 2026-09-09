# This app is frozen

It is not built, not published, and not in the `turbo` pipelines. `pnpm
typecheck` at the repository root no longer walks it; run `pnpm -F @rh/mobile
typecheck:frozen` if you want to check it by hand.

## Why

The decision that already existed in the planning documents, finally acted on.
`STRATEGY.md` D2 deprioritised the mobile release; `STATUS.md` says outright
that guests already book on the web and the offline work landed in the browser,
so a native shell buys less than it did.

Reading the code makes the case stronger than the documents did. About 1,400
lines across eight screens, and:

- **No store identity.** `app.json` has no `android.package` and no
  `ios.bundleIdentifier`, no icon and no splash image. It has never been built
  once, let alone published.
- **No push notifications.** `expo-notifications` is not a dependency. Push is
  the one thing a native app buys over the existing web booking flow.
- **No offline support.** The outbox and the read cache both landed in the
  browser, not here.
- **No Bangla.** English only, in a product whose thesis is Bangla-first.
- **It duplicates the typed client**, hand-rolling nine interfaces that
  `@rh/shared` already declares, with no compile-time link to the server.

So it is a thinner client than the web app in every dimension that would
justify shipping it, and carrying it costs the Expo/RN treadmill: an SDK bump
every few months, forced because EAS drops old SDKs, plus Google Play's annual
`targetSdkVersion` deadline. Roughly 3–6 engineer-days a year to stand still.

## If it comes back

Nothing has been deleted; the code and its dependencies are exactly as they
were. Reviving it means renaming `typecheck:frozen` back to `typecheck`, and
then doing the four things in the list above before it is worth publishing.
