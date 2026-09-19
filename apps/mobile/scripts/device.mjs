#!/usr/bin/env node
/**
 * The device loop: boot something Android, put this app on it, look at it.
 *
 * A green test suite is not evidence that a screen works — the rule this
 * project already applies to the console applies here, and a phone is harder
 * to open casually than a browser tab. So the whole sequence is one script
 * rather than a paragraph in a README that drifts.
 *
 *   node scripts/device.mjs up      boot the emulator and wait for it
 *   node scripts/device.mjs go      install Expo Go if absent, point it here
 *   node scripts/device.mjs open    (re)launch this app on the device
 *   node scripts/device.mjs shot X  save a screenshot to X
 *   node scripts/device.mjs logs    the app's own console output
 *
 * `go` works against a real phone too — plug it in with USB debugging on and
 * everything below finds it, which is the better device when there is one.
 * See README.md, "Looking at the app".
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SDK =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(homedir(), "AppData", "Local", "Android", "Sdk");

const exe = (p) => (process.platform === "win32" ? `${p}.exe` : p);
const ADB = join(SDK, "platform-tools", exe("adb"));
const EMULATOR = join(SDK, "emulator", exe("emulator"));
const AVD = process.env.RM_AVD ?? "resortmela";
const PORT = process.env.RCT_METRO_PORT ?? "8081";

/**
 * The SDK version Expo Go must match. Read from the installed `expo`, not
 * written here, because a hard-coded number is wrong the day the SDK moves
 * and the failure it causes — a blank screen — says nothing about why.
 */
function sdkVersion() {
  const pkg = JSON.parse(
    execFileSync(process.execPath, ["-p", "JSON.stringify(require('expo/package.json'))"], {
      cwd: resolve(dirname(new URL(import.meta.url).pathname.slice(1)), ".."),
      encoding: "utf8",
    }),
  );
  return `${pkg.version.split(".")[0]}.0.0`;
}

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { encoding: "utf8", ...opts }).trim();
}

/** Every attached device, emulator or otherwise. A real phone wins if present. */
function device() {
  const lines = adb(["devices"]).split("\n").slice(1).filter((l) => l.includes("\tdevice"));
  const ids = lines.map((l) => l.split("\t")[0]);
  const phone = ids.find((id) => !id.startsWith("emulator-"));
  return phone ?? ids[0] ?? null;
}

function need() {
  const id = device();
  if (!id) {
    console.error(
      "No device. Plug a phone in with USB debugging on, or run:\n" +
        "  node scripts/device.mjs up",
    );
    process.exit(1);
  }
  return id;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, check, seconds = 300) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      /* not ready yet */
    }
    await wait(2000);
  }
  throw new Error(`gave up waiting for ${what} after ${seconds}s`);
}

async function up() {
  if (device()) {
    console.log("a device is already attached:", device());
    return;
  }
  /**
   * 2GB and a 720p screen, which is not a preference — an Android emulator
   * wants 4GB and this project's build machine has 8GB in total with the
   * editor, a browser and Metro already in it. Asking for more makes qemu
   * refuse to start with "Insufficient RAM free"; taking more than is free
   * makes the guest page-thrash and every app on it show "isn't responding".
   */
  const child = spawn(
    EMULATOR,
    ["-avd", AVD, "-no-snapshot", "-no-boot-anim", "-no-audio", "-memory", "2048"],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  console.log(`booting ${AVD}…`);
  await until("the emulator to appear", () => device() !== null, 180);
  const id = device();
  await until(
    "Android to finish booting",
    () => adb(["-s", id, "shell", "getprop", "sys.boot_completed"]) === "1",
    300,
  );
  // software rendering has to draw every one of these pixels
  adb(["-s", id, "shell", "wm", "size", "720x1520"]);
  adb(["-s", id, "shell", "wm", "density", "320"]);
  for (const s of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) {
    adb(["-s", id, "shell", "settings", "put", "global", s, "0"]);
  }
  console.log("ready:", id);
}

async function go() {
  const id = need();
  const installed = adb(["-s", id, "shell", "pm", "list", "packages", "host.exp.exponent"]);
  if (!installed.includes("host.exp.exponent")) {
    const want = sdkVersion();
    const versions = JSON.parse(
      execFileSync(
        process.execPath,
        ["-e", "fetch('https://api.expo.dev/v2/versions/latest').then(r=>r.text()).then(t=>process.stdout.write(t))"],
        { encoding: "utf8" },
      ),
    );
    const url = versions?.data?.sdkVersions?.[want]?.androidClientUrl;
    if (!url) throw new Error(`Expo does not publish a Go client for SDK ${want}`);
    const apk = join(process.env.TEMP ?? "/tmp", `expo-go-${want}.apk`);
    if (!existsSync(apk)) {
      console.log("downloading Expo Go for SDK", want);
      const body = Buffer.from(
        await fetch(url).then((r) => r.arrayBuffer()),
      );
      mkdirSync(dirname(apk), { recursive: true });
      writeFileSync(apk, body);
    }
    console.log("installing Expo Go…");
    adb(["-s", id, "install", "-r", apk], { stdio: "inherit" });
  }
  // the device reaches Metro on its own localhost, which works for a phone on
  // USB as well as for an emulator — no host IP to get wrong
  adb(["-s", id, "reverse", `tcp:${PORT}`, `tcp:${PORT}`]);
  console.log(`Metro on :${PORT} is reachable from the device`);
  await open();
}

async function open() {
  const id = need();
  adb(["-s", id, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `exp://127.0.0.1:${PORT}`]);
  console.log("opening the app — run `shot` once it has drawn");
}

function shot(where) {
  const id = need();
  const out = where ?? `shot-${Date.now()}.png`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  // exec-out, not `screencap /sdcard/…` + pull: the app has no business
  // writing to shared storage, and on a fresh image that path is not yet
  // writable, which fails with a permission error that reads like a bug
  writeFileSync(out, execFileSync(ADB, ["-s", id, "exec-out", "screencap", "-p"], { maxBuffer: 64 << 20, encoding: "buffer" }));
  console.log("wrote", resolve(out));
}

function logs() {
  const id = need();
  spawn(ADB, ["-s", id, "logcat", "-s", "ReactNativeJS:V", "ReactNative:V"], { stdio: "inherit" });
}

const [cmd, arg] = process.argv.slice(2);
const run = { up, go, open, shot: () => shot(arg), logs }[cmd];
if (!run) {
  console.error("usage: node scripts/device.mjs up|go|open|shot <file>|logs");
  process.exit(1);
}
await run();
