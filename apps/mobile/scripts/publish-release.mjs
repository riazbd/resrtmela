#!/usr/bin/env node
/**
 * Publish a build: one command, no boxes to fill in (2026-09-21).
 *
 * Shipping 0.7.0 by hand took six steps — find the finished build, copy
 * its artifact URL, get the file onto the server under a readable name,
 * then open Platform → Billing policy and type an address, a version
 * and a release note into three fields. Six steps done by a person once
 * every few months is six steps done from memory, and the one everybody
 * forgets is the last: the page goes on offering the old build while
 * the new one sits on the server.
 *
 * So this does all of it from `app.json`, which is the only place the
 * version is written.
 *
 *   node scripts/publish-release.mjs --notes "what changed"
 *
 * **It never raises the floor.** `app.minimumVersion` is what locks
 * every older phone out, and it is the owner's to raise from the panel
 * once people have actually had a chance to update — not something a
 * publish script does on their behalf, at the moment the build appears,
 * before a single person has downloaded it.
 *
 * `--dry-run` prints what it would do and writes nothing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_JSON = join(HERE, "..", "app.json");

const API = process.env.RM_API_URL ?? "https://api.resortmela.com";
const HOST = process.env.RM_SSH ?? "root@194.163.191.50";
const SERVED_FROM = process.env.RM_DOWNLOADS ?? "/var/lib/resortmela/downloads";
const PUBLIC_BASE = process.env.RM_DOWNLOAD_BASE ?? "https://resortmela.com/downloads";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const dryRun = args.includes("--dry-run");
const notes = flag("notes") ?? "";

const say = (...parts) => console.log(...parts);
const ssh = (script) =>
  execFileSync("ssh", ["-o", "BatchMode=yes", HOST, script], { encoding: "utf8" }).trim();

/** The version is app.json's. Nothing here may disagree with the build. */
function plannedVersion() {
  const { expo } = JSON.parse(readFileSync(APP_JSON, "utf8"));
  if (!expo?.version) throw new Error("app.json has no expo.version");
  return expo.version;
}

/** The newest finished Android build EAS has for this version. */
function finishedBuild(version) {
  const raw = execFileSync(
    "npx",
    ["eas-cli", "build:list", "--platform", "android", "--limit", "10", "--non-interactive", "--json"],
    { encoding: "utf8", cwd: join(HERE, ".."), shell: process.platform === "win32" },
  );
  const builds = JSON.parse(raw.slice(raw.indexOf("[")));
  const match = builds.find(
    (b) => b.appVersion === version && b.status === "FINISHED" && b.artifacts?.buildUrl,
  );
  if (!match) {
    const seen = builds
      .slice(0, 4)
      .map((b) => `${b.appVersion} (${b.appBuildVersion}) ${b.status}`)
      .join(", ");
    throw new Error(
      `No finished Android build for ${version}. Most recent: ${seen}\n` +
        `Build one first: npx eas-cli build -p android --profile production`,
    );
  }
  return match;
}

async function main() {
  const version = plannedVersion();
  say(`app.json says ${version}`);

  const build = finishedBuild(version);
  say(`EAS build ${build.id.slice(0, 8)} (versionCode ${build.appBuildVersion})`);

  const name = `resort-mela-${version}.apk`;
  const apkUrl = `${PUBLIC_BASE}/${name}`;

  if (dryRun) {
    say("\n-- dry run, nothing written --");
    say(`would fetch  ${build.artifacts.buildUrl}`);
    say(`          to ${HOST}:${SERVED_FROM}/${name}`);
    say(`would set    app.apkUrl        = ${apkUrl}`);
    say(`             app.latestVersion = ${version}`);
    if (notes) say(`             app.updateNotes   = ${notes}`);
    say("would NOT touch app.minimumVersion — the floor is the owner's to raise");
    return;
  }

  /*
   * The server fetches it, not this machine. A hundred and ten
   * megabytes has no business making a round trip through a laptop on
   * a domestic connection to reach a datacentre.
   */
  say(`fetching onto the server as ${name} …`);
  ssh(
    `set -e; mkdir -p ${SERVED_FROM}; cd ${SERVED_FROM}; ` +
      `curl -sSfL -o '${name}.part' '${build.artifacts.buildUrl}'; ` +
      // named only once it is whole: a half-written APK under the real
      // name is an install that fails on somebody's phone
      `mv '${name}.part' '${name}'; chown www-data:www-data '${name}'`,
  );
  const size = Number(ssh(`stat -c %s ${SERVED_FROM}/${name}`));
  const sha = ssh(`sha256sum ${SERVED_FROM}/${name}`).split(/\s+/)[0];
  say(`  ${(size / 1024 / 1024).toFixed(1)} MB · sha256:${sha}`);

  // it is served before it is advertised, so the page never offers a 404
  const head = await fetch(apkUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`${apkUrl} answered ${head.status} — not advertising it`);
  if (Number(head.headers.get("content-length")) !== size) {
    throw new Error("what nginx serves is not the size of what was written");
  }
  say(`  served at ${apkUrl}`);

  const password = process.env.RM_PLATFORM_PASSWORD;
  const email = process.env.RM_PLATFORM_EMAIL ?? "platform@resortmela.com";
  if (!password) throw new Error("set RM_PLATFORM_PASSWORD to write the settings");

  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const { accessToken } = await login.json();

  const patch = { "app.apkUrl": apkUrl, "app.latestVersion": version };
  if (notes) patch["app.updateNotes"] = notes;
  const saved = await fetch(`${API}/platform/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(patch),
  });
  if (!saved.ok) throw new Error(`settings ${saved.status}: ${await saved.text()}`);

  const now = await (await fetch(`${API}/app/release`)).json();
  say("\npublished:");
  say(`  latest    ${now.latest}`);
  say(`  apk       ${now.apkUrl}`);
  say(`  notes     ${now.notes || "(none)"}`);
  say(
    now.minimum === "0.0.0"
      ? "  floor     off — nobody is locked out"
      : `  floor     ${now.minimum} — phones below this are refused`,
  );
  say("\nThe floor is unchanged. Raise it in Platform → Billing policy once");
  say("people have had a chance to update, and only to a version on the page.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
