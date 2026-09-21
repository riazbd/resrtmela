# Resort Mela — the app

One Android app for the two audiences that pay for the platform: resort staff
and travel agents. Design and reasoning:
[`docs/superpowers/specs/2026-09-13-mobile-app-design.md`](../../docs/superpowers/specs/2026-09-13-mobile-app-design.md).

Release 0 hosts the console in a native shell, so both panels work from the
first build; native screens replace it one at a time. Every APK ever produced
is listed in [RELEASES.md](RELEASES.md) — an empty table there means the app
has been written but never built, which is how the previous mobile app died.

## Testing

```
pnpm -F @rh/mobile test        # jest + @testing-library/react-native
pnpm -F @rh/mobile typecheck
```

This package runs **jest**, not vitest like the rest of the repo, and
`jest.config.js` explains at length why — the short version is that vitest
cannot parse react-native's Flow-typed source, and `jest-expo` already
maintains the forty native-module mocks that a screen test needs.

Two things that cost a run each, both pinned by
`test/the-harness-can-draw-a-screen.spec.tsx`:

- **`render` is asynchronous** in `@testing-library/react-native` 14. A test
  that forgets to await it fails with `getByText is not a function`.
- **`transformIgnorePatterns` has to be written for pnpm**, whose store puts
  every package behind a mangled path and nests a second `node_modules`
  inside it.

## Looking at the app

A green suite is not evidence that a screen works. There are two ways to look,
and they are not interchangeable.

### The browser, every day

```
pnpm -F @rh/mobile web                                   # Metro, in one terminal
node scripts/look.mjs /login shot.png                    # open a route, save the picture
node scripts/look.mjs /login shot.png   --type "Phone or email=a@b.c;Password=secret"   --tap "Sign in" --wait 9000                            # drive it to a screen behind sign-in
```

Expo renders the same components through react-native-web, so this shows what
a screen says and how it behaves for a fraction of an emulator's memory. It
prints the words on the screen as well as saving the picture, which is often
the more useful half.

`look.mjs` needs `playwright-core`, which lives in a scratch directory rather
than in this package — it is a tool for looking, not a dependency of the app.
`RM_SCRATCH=<that directory> node scripts/look.mjs …`.

Two things it does on purpose:

- **It turns off same-origin checking** in that one throwaway browser. A phone
  sends no `Origin` header so the app never meets CORS; a browser does, and
  the API's allow-list is the console's domains. The looser setting belongs on
  the looking glass, not on the door.
- **It waits for `domcontentloaded`, not `networkidle`.** Expo's dev server
  holds a websocket open for hot reload, so the network is never idle.

**What the browser cannot tell you**: shadows, the keyboard, safe areas, the
splash, and anything native. It is a lens, not the product — the app does not
ship on the web.

### A phone, before anything is called done

`scripts/device.mjs` is that loop:

```
pnpm start                                  # Metro, in one terminal
node scripts/device.mjs up                  # boot the emulator (skipped if a phone is attached)
node scripts/device.mjs go                  # install Expo Go, point it at Metro, open the app
node scripts/device.mjs shot look.png       # what is on the screen right now
node scripts/device.mjs logs                # the app's own console
```

**A real phone is the better device**, and `go` prefers one: plug it in with
USB debugging on and every command above finds it. `adb reverse` means the
phone reaches Metro on its own `localhost`, so there is no host IP to get
wrong and no shared wifi to depend on.

### Why Expo Go rather than a development build

The app deliberately uses no native module that Expo Go lacks. That is what
`expo-sqlite/kv-store` is doing in `src/device/storage.ts` where the phase-0
plan named `react-native-mmkv`: both give the synchronous key-value store that
`@rh/app-core`'s `Storage` port requires, and only one of them can be opened
without a cloud build. Keeping inside Expo Go turns a twenty-minute loop into
a ten-second one, and the APK at the end of each phase is still a real build.

### The emulator on an 8GB machine

`device.mjs up` asks for 2GB and a 720x1520 screen. That is not a preference.
An Android emulator wants 4GB; this build machine has 8GB in total with the
editor, a browser and Metro already in it. Ask for more and qemu refuses to
start — "Insufficient RAM free for launching emulator", with the commit
figures printed. Take more than is actually free and the guest pages to disk,
where every app on it, including the launcher, shows "isn't responding".

**Stop the emulator — and Metro — before running the suite.** With the
emulator up, jest dies with exit code 3221226505
(`STATUS_STACK_BUFFER_OVERRUN`, which is what Windows reports when a process
cannot get the memory it asked for, and which says nothing about tests). With
Metro up it does not die but it flakes: measured on 2026-09-20, the same suite
took 32s with one failure alongside Metro and 7.6s green without it.

**The emulator may simply not be worth it on this machine.** Metro plus the
emulator plus a local API is what killed Metro with "JavaScript heap out of
memory" and 214MB free. The browser lens above exists because of that, and a
real phone costs the host nothing at all.

The other half of that trade is the screen: the emulator falls back to
SwiftShader when it cannot reach the host GPU, so every pixel is rasterised on
the CPU. 720x1520 is about a third of the work of 1080x2400.

## Shipping an update

There is no Play Store and no App Store. Staff download the APK from
[resortmela.com/app](https://resortmela.com/app), so nothing updates
anybody automatically and nothing stops a build from September calling
this API for years. Two mechanisms cover that, and the first covers
most of it.

### Most changes need no APK at all

Anything living in JavaScript — a screen, a rule, a fix, a new route —
ships over the air:

```
npx eas-cli update --branch production -m "what changed"
```

Phones fetch it in the background. Once the bundle is on the device a
green bar appears — *A new version is ready · Restart* — and the person
picks the moment; `src/screens/update-ready.tsx`.

Not applied the instant it lands, because that restarts the app under
somebody halfway through taking a booking. And not blocking the launch
on the network either (`fallbackToCacheTimeout`), because this is used
on hill-resort connections where that means seconds of nothing before
the day sheet.

It went out once without the bar, and the only honest instruction that
follows is "install it, open it, close it, open it again" — which is
also what a phone left open at a desk all week never does, so it would
run last week's code all week and never be told.

`runtimeVersion` follows `version` in `app.json`, so an update only
reaches builds of the same version. That is the point — a bundle built
against 0.7.0's native modules must never land on a 0.6.0 phone.

### A new APK, when native code changed

A new native module, an Expo SDK bump, a permission, the icon:

```
# 1. bump `version` in app.json, then build
npx eas-cli build -p android --profile production

# 2. publish it — one command, nothing to type into a form
RM_PLATFORM_PASSWORD=... pnpm -F @rh/mobile publish:release --notes "what changed"
```

`publish:release` reads the version from `app.json`, finds the finished
EAS build for it, has *the server* fetch the artifact under a readable
name, checks nginx really serves it, and only then points the download
page at it. Doing this by hand was six steps, and the one everybody
forgets is the last — so the page goes on offering the old build while
the new one sits on the server. `--dry-run` prints what it would do.

The file lands at `/var/lib/resortmela/downloads/resort-mela-<version>.apk`
and is served by nginx at `resortmela.com/downloads/…`. Linking Expo's
artifact directly worked but named the saved file after its hash, so a
person's Downloads folder filled with `I3IVk-OuDQEdHesq….apk` and
nothing said which build was which.

### Forcing the ones who do not update

`publish:release` never touches the floor. Raising it is one field —
**Platform → Billing policy → Oldest app allowed** — and it is the
owner's, because it is the only thing here that takes the app away from
somebody mid-shift. Every phone below that number is refused on every
request with a 426 and shown a screen it cannot get past, carrying a
Download button. They stay signed in.

The floor is `apps/api/src/common/app-release.ts`; the rule both sides
run is `packages/shared/src/app-version.ts`.

**Raise it last, and only to a version people can actually reach.**
Raising it to a build that is not on the download page yet locks the
whole business out with no way back in — a phone cannot update to
something that is not there.

### Why `production` builds an APK, not an app bundle

It used to build `app-bundle` with `distribution: "store"` — the right
answer for a Play release and useless here, because an `.aab` cannot be
sideloaded. Every APK this project has actually shipped was built with
`--profile preview`. So the profile named *production* produced
something nobody could install, and the one named *preview* was
production. Once channels existed that would have become worse: an
update published to the `production` channel would never have reached
the shipped app, because the shipped app was on `preview`.

## Building

```
pnpm -F @rh/mobile build:apk      # local, Linux/macOS
npx eas-cli build -p android --profile production   # cloud, and the only path on Windows
```

### Why the cloud build is not optional on Windows

`build:apk` works anywhere the filesystem allows long paths. Windows does not,
and this project exceeds the limit by a wide margin:

```
longest C++ source, relative to the repo root          213 characters
CMake's object path = build directory + that whole
  path mangled into it                                ~300 characters
Windows' limit                                          260
```

`LongPathsEnabled` is already 1 on the build machine and does not help: ninja
and the NDK toolchain are not long-path aware. Shortening pnpm's store
directory names (`virtual-store-dir-max-length=40`, in the workspace `.npmrc`)
buys about fifty characters, which is not enough. React Native 0.82 removed the
old architecture, so there is no way to skip the C++ compile either.

The symptom, if it is ever seen again: ninja loops printing `Re-running
CMake...` forever, preceded by a warning that an object file `cannot be safely
placed under this directory`.

### The signing key

The first local build generates a release keystore at
`~/.resortmela/android/` and records its password beside it. **Back that
directory up.** Android refuses an update whose signature changed, so losing
the key means every phone with the app installed must uninstall it — losing its
session — before it can take another build.

EAS keeps its own copy of the signing key on Expo's servers; run
`npx eas-cli credentials` to download it and keep the two in step.
