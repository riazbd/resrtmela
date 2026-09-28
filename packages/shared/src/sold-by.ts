/**
 * Who a booking came from, in words.
 *
 * A resort's booking list named the person — "Rafiqul Islam" — and nothing
 * else, which answers the smaller half of the question. A resort does not have
 * a relationship with Rafiqul Islam; it has one with Sea Breeze Travels, and
 * the rate, the account and the settlement all hang off the agency. Reading a
 * list of stays and not being able to tell which agency sent them is the
 * reason this exists.
 *
 * The person is still worth keeping. "Which agency" is what the money is
 * about; "who rang" is what the telephone call is about, and the desk wants
 * both. So: the agency first, the person after it, and neither repeated when
 * a lone agent is their own firm.
 *
 * One function so the two clients cannot draw the same booking two ways — the
 * rule `agentBalanceSays` follows, for the same reason.
 */

/** The separator every screen uses between the two, so none invents its own. */
const BETWEEN = " · ";

export function soldBy(
  agency: string | null | undefined,
  person: string | null | undefined,
): string | null {
  const firm = agency?.trim() || null;
  const who = person?.trim() || null;
  if (!firm && !who) return null;
  // a lone agent has no agency behind them, and their own name is the answer
  if (!firm) return who;
  if (!who || who === firm) return firm;
  return `${firm}${BETWEEN}${who}`;
}

/**
 * The two halves apart, for a screen with room to stack them — the Dues screen
 * draws the agency in the row's own weight and the person under it, and a
 * joined string would have to be split again to do that.
 */
export function soldByParts(
  agency: string | null | undefined,
  person: string | null | undefined,
): { firm: string | null; who: string | null } {
  const firm = agency?.trim() || null;
  const who = person?.trim() || null;
  if (!firm) return { firm: who, who: null };
  return { firm, who: who && who !== firm ? who : null };
}
