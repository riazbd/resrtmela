/**
 * Where the console is, as a stranger's browser reaches it (2026-09-19).
 *
 * Every mail this API sends carries a link back — a password reset, an agency
 * invitation, an unsubscribe — and every one of them had grown its own
 * environment variable and its own hostname written into the source. In
 * production only one of the three was set; the other two ran on the fallback
 * for months without anybody noticing, because the fallback was the address the
 * platform happened to be at.
 *
 * It stops being that address the day the platform moves to a domain of its
 * own, and the failure is silent: a password-reset mail leading to a host that
 * no longer answers. So there is one function, no hostname in the source, and a
 * fallback that is obviously a developer's machine rather than a plausible
 * production.
 */

/** A developer's machine — deliberately not anything that could be a deployment. */
const ON_THIS_MACHINE = "http://localhost:3000";

/**
 * The names a deployment may use, most specific first.
 *
 * Three, because three already exist in the wild and a rename that breaks a
 * running server to tidy up a variable name is not a trade worth making. New
 * deployments want `PUBLIC_WEB_URL`.
 */
const NAMES = ["PUBLIC_WEB_URL", "WEB_URL", "WEB_ORIGIN"] as const;

const setting = (env: NodeJS.ProcessEnv): string | null => {
  for (const name of NAMES) {
    const raw = env[name]?.trim();
    // trailing slashes, because every caller appends a path to this
    if (raw) return raw.replace(/\/+$/, "");
  }
  return null;
};

/** The console's address, without a trailing slash. */
export function webUrl(env: NodeJS.ProcessEnv = process.env): string {
  return setting(env) ?? ON_THIS_MACHINE;
}

/**
 * Whether the deployment said. False in development and in tests, which is
 * fine; false in production means every mailed link points at localhost, which
 * is why boot says so out loud.
 */
export function isWebUrlConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return setting(env) !== null;
}
