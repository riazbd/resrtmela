# Resort Mela — the app

One Android app for the two audiences that pay for the platform: resort staff
and travel agents. Design and reasoning:
[`docs/superpowers/specs/2026-09-13-mobile-app-design.md`](../../docs/superpowers/specs/2026-09-13-mobile-app-design.md).

Release 0 hosts the console in a native shell, so both panels work from the
first build; native screens replace it one at a time. Every APK ever produced
is listed in [RELEASES.md](RELEASES.md) — an empty table there means the app
has been written but never built, which is how the previous mobile app died.

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
