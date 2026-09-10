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
    // the product's own domain and its subdomains, https only
    /^https:\/\/([a-z0-9-]+\.)*resortmela\.app$/,
    ...extra,
  ];
}

/** Does this Origin header pass the allow-list? Exposed for the test. */
export function originAllowed(origin: string, env?: NodeJS.ProcessEnv): boolean {
  return corsOrigins(env).some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin),
  );
}
