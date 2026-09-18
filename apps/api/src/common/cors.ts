/**
 * Which origins the browser may call this API from, with credentials.
 *
 * This lived inline in `main.ts` as two regexes, and one of them was
 * `/resortmela\.app$/` — a *suffix* test. `https://evil-resortmela.app` ends in
 * `resortmela.app`, so it was an allowed origin, and `credentials: true` sat
 * behind it. It is here, as a function, so the rule can be tested rather than
 * read.
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): (string | RegExp)[] {
  const extra = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
  return [
    // development, on this machine only
    /^http:\/\/localhost:\d+$/,
    // the product's own domain and its subdomains, https only. `.app` stood
    // here until 2026-09-19 and is a domain this platform does not own — a
    // credentialed read of every signed-in user's API, waiting on a $12
    // registration.
    /^https:\/\/([a-z0-9-]+\.)*resortmela\.com$/,
    ...extra,
  ];
}

/** Does this Origin header pass the allow-list? Exposed for the test. */
export function originAllowed(origin: string, env?: NodeJS.ProcessEnv): boolean {
  return corsOrigins(env).some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin),
  );
}

/**
 * Paths any origin at all may read, without a session.
 *
 * A resort's published site is served at the resort's own domain and asks this
 * API, from the guest's browser, whether anything is free. That origin is a
 * customer's domain, so it cannot be on a list written in advance — and the
 * failure is silent: a box on a stranger's front door that says "we could not
 * check just now" for ever.
 *
 * Everything under `/site/` is a published page or its vacancy: public,
 * unauthenticated, and already readable by anyone who types the URL. Answering
 * `*` for these gives away nothing that was not already given away, and the
 * caller never gets credentials with it.
 */
export function readableFromAnywhere(path: string): boolean {
  const p = path.split("?")[0]!;
  return p === "/site" || p.startsWith("/site/");
}
