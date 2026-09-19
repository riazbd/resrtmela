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

A green suite is not evidence that a screen works. `scripts/device.mjs` is the
whole loop:

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

**Stop the emulator before running the suite.** With both up, jest dies with
exit code 3221226505 — `STATUS_STACK_BUFFER_OVERRUN`, which is what Windows
reports when a process cannot get the memory it asked for, and which says
nothing at all about tests. `node scripts/device.mjs up` is cheap to repeat.

The other half of that trade is the screen: the emulator falls back to
SwiftShader when it cannot reach the host GPU, so every pixel is rasterised on
the CPU. 720x1520 is about a third of the work of 1080x2400.

## Building

```
pnpm -F @rh/mobile build:apk      # local, Linux/macOS
npx eas-cli build -p android --profile preview   # cloud, and the only path on Windows
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
