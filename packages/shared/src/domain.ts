/**
 * A domain a resort brought with it (2026-09-15 design).
 *
 * Pure, and shared, because three places need the same answer and must not
 * disagree: the panel that claims a domain, the API that verifies it, and the
 * middleware that decides whose site a request is asking for. That last one is
 * why this is tested on its own — read it wrong and the console is served at a
 * customer's domain, or a customer's site where the console should be.
 */

/**
 * A hostname, as strictly as the DNS allows one: labels of letters, digits and
 * inner hyphens, at most 63 each and 253 in total.
 *
 * `Host` is whatever the client sent. nginx passes on the name it matched, but
 * nothing downstream should lean on that, because this value becomes a database
 * lookup.
 */
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);

/** The header as a name, or `null` when it is not one. */
export function normaliseHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const name = host
    .trim()
    .toLowerCase()
    // the port belongs to the deployment, never to the name
    .split(":")[0]!
    // a fully-qualified name may be written with a trailing dot, and the two
    // spellings are the same host
    .replace(/\.$/, "");
  if (name.length === 0 || name.length > 253) return null;
  return HOSTNAME.test(name) ? name : null;
}

/**
 * Whether this deployment answers at that host itself.
 *
 * Compared whole. A prefix or suffix test would call
 * `resortmela.com.evil.example` one of ours, which is precisely the host
 * somebody would register in order to be told that.
 */
export function isOwnHost(host: string | undefined | null, ownHosts: readonly string[]): boolean {
  const name = normaliseHost(host);
  if (!name) return false;
  return ownHosts.some((own) => normaliseHost(own) === name);
}

/**
 * Why this domain cannot be claimed, in a sentence, or `null` when it can.
 *
 * Refused here rather than at provisioning time: a name no certificate
 * authority will issue for is a wait that ends in a failure nobody explains,
 * days later, in a log the owner cannot read.
 */
export function claimProblem(host: string, ownHosts: readonly string[]): string | null {
  const name = normaliseHost(host);
  if (!name) return "That is not a domain name. It should look like skyecoresort.com.";
  if (isOwnHost(name, ownHosts)) return "That address is the platform's own.";
  if (!name.includes(".")) return "A domain needs a dot in it, like skyecoresort.com.";
  // an address, not a name: nothing will issue a certificate for one, and DNS
  // has nothing to verify
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return "That is an IP address, not a domain name.";
  if (name.endsWith(".local") || name.endsWith(".internal") || name.endsWith(".test")) {
    return "That domain is not one the public internet can reach.";
  }
  return null;
}

/** Where the proof goes, and what it says. */
export interface DnsRecord {
  type: "TXT";
  /** the whole name, which most registrars accept */
  name: string;
  /** the same thing relative to the zone, which some registrars want instead */
  shortName: string;
  value: string;
}

/** The prefix a claim is proved under. Written once, read by the API and the panel. */
export const DNS_PREFIX = "_resortmela";

/**
 * The record an owner has to add before a domain is theirs here.
 *
 * A `TXT`, rather than a file under `/.well-known/`: the file check only proves
 * the domain already points at us, which a domain that has never pointed
 * anywhere cannot do. This can be added while the resort's old site is still
 * live — which is exactly when they would want to.
 *
 * Both spellings of the name are given because registrars disagree about
 * whether it is written whole or relative to the zone, and an owner who pastes
 * the wrong one waits for a check that never passes.
 */
export function dnsRecordFor(host: string, token: string): DnsRecord {
  const name = normaliseHost(host) ?? host;
  const labels = name.split(".");
  // a zone is the last two labels for almost every registrar an owner will use
  const relative = labels.slice(0, Math.max(0, labels.length - 2)).join(".");
  return {
    type: "TXT",
    name: `${DNS_PREFIX}.${name}`,
    shortName: relative ? `${DNS_PREFIX}.${relative}` : DNS_PREFIX,
    value: token,
  };
}

/** Whose page a verified domain draws, as the lookup answers (2026-09-17). */
export interface DomainSite {
  kind: "resort" | "agency";
  slug: string;
}

/**
 * The page a request at somebody's own domain is rewritten to.
 *
 * A resort's pages live under `/r/<slug>`, an agency's under `/a/<slug>`. An
 * answer without a known kind is read as a resort's, which is what every
 * lookup said before agencies could bring a domain.
 */
export function sitePathFor(site: { kind?: unknown; slug: string }, pathname: string): string {
  const base = site.kind === "agency" ? `/a/${site.slug}` : `/r/${site.slug}`;
  return pathname === "/" || pathname === "" ? base : `${base}${pathname}`;
}
