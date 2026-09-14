/**
 * A resort's public address, decided once.
 *
 * `siteSlug` in @rh/shared turns a name into an address; it is pure, so it
 * cannot know whether that address is already somebody's. This adds the only
 * part that needs the database, and it is the only place a resort slug is
 * minted — three creation paths would otherwise each have their own idea of
 * what to do about "Hill Resort" existing twice.
 */
import { siteSlug, SLUG_MAX } from "@rh/shared";
import type { PrismaService } from "../prisma/prisma.service";

type Db = Pick<PrismaService, "resort">;

/**
 * The address this resort will answer at.
 *
 * The plain slug when it is free, and the plain slug with a number when it is
 * not — the second Hill Resort becomes `hill-resort-2`, and the first keeps the
 * address it has been using. Numbering rather than refusing, because two
 * resorts sharing a name is an ordinary thing and not something to make a
 * customer solve at signup.
 *
 * Takes the transaction where there is one: signup creates the resort inside a
 * transaction, and asking the outer client whether a slug is free would be
 * asking a connection that cannot see the rows this one has just written.
 */
export async function uniqueResortSlug(prisma: Db, name: string): Promise<string> {
  const base = siteSlug(name);
  for (let n = 1; n < 1000; n++) {
    // the suffix has to fit too, or a long name produces the same truncated
    // slug however high the number goes
    const suffix = n === 1 ? "" : `-${n}`;
    const slug = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!(await prisma.resort.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  // a thousand resorts of one name is not a state to paper over
  throw Object.assign(new Error(`Cannot find a free address for "${name}"`), { status: 409 });
}
