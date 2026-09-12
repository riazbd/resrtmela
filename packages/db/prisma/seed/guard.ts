/**
 * Which database the seed is allowed to empty.
 *
 * The seed truncates every table. Its only gate used to be `--force`, and on
 * 2026-09-12 a deploy script carrying that flag ran on the production server
 * and destroyed a workspace the owner had built by hand. A flag typed once
 * into a script says nothing about the machine the script later runs on.
 *
 * So the operator names the database, and the name is checked against the one
 * `DATABASE_URL` actually points at. The command a developer writes for their
 * laptop then refuses on the server rather than obeying it — which is the
 * failure that happened, made impossible rather than merely discouraged.
 *
 * Pure on purpose: no Prisma, no process, no I/O, so it can be tested. The
 * test lives in apps/api/test because packages/db has no runner of its own.
 */

/** The database a MySQL connection string points at, or "" if it names none. */
export function databaseNameOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).pathname.replace(/^\//, "").split("?")[0] ?? "";
  } catch {
    // not a URL we understand; better to name nothing than to guess wrong
    return "";
  }
}

/**
 * Throws unless this run was authorised for exactly this database.
 * Returns the database name when it is safe to proceed.
 */
export function assertSafeToSeed(argv: string[], databaseUrl: string): string {
  const actual = databaseNameOf(databaseUrl);
  const flag = argv.find((a) => a === "--force" || a.startsWith("--force="));

  if (!flag) {
    throw new Error(
      "This deletes every row in the database before seeding.\n" +
        (actual
          ? `Name the database you mean to empty:\n\n  pnpm -F @rh/db seed -- --force=${actual}\n`
          : "Set DATABASE_URL first, then name the database with --force=<name>.\n"),
    );
  }

  if (!actual) {
    throw new Error(
      "No DATABASE_URL, so there is no way to check which database this would empty. Refusing.",
    );
  }

  const named = flag.startsWith("--force=") ? flag.slice("--force=".length) : "";
  if (!named) {
    throw new Error(
      "--force on its own does not say which database to empty, and a flag in a\n" +
        "script means nothing about the machine it later runs on. Name it:\n\n" +
        `  pnpm -F @rh/db seed -- --force=${actual}\n`,
    );
  }

  if (named !== actual) {
    /*
     * Deliberately does not print `--force=<actual>`. This is the case where
     * somebody is on a machine they did not expect to be on, and handing them
     * the working command would turn the guard into a hint for getting past
     * it. Saying which two names disagree is enough to work out what happened.
     */
    throw new Error(
      `Refusing to seed: you asked for "${named}", but DATABASE_URL points at "${actual}".\n` +
        "Seeding deletes every row. Check which machine you are on.",
    );
  }

  return actual;
}
