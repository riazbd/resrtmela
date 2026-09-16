/**
 * A domain a resort — or, since 2026-09-17, an agency — brought with it
 * (2026-09-15 design).
 *
 * One rule governs everything here, and it is not about correctness:
 * provisioning asks a certificate authority for a certificate in a name. A row
 * nobody proved is a certificate issued to whoever typed fastest — and, the day
 * that domain's DNS moves, one customer's site served at another's address.
 *
 * So a domain is claimed by proving control of its DNS; nothing is provisioned
 * before that; and `byHost` — the question the middleware asks on every request
 * at an unfamiliar host — answers for nothing that has not been proved. The
 * rules are the same for a resort and an agency, and one name has one owner.
 */
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { claimProblem, dnsRecordFor, DNS_PREFIX, normaliseHost, ROLE, type DnsRecord, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { agencyOf } from "../common/selling-access";
import { badRequest, forbid, requireResortAccess } from "../common/rbac";
import { SiteCacheService } from "./site-cache.service";

/** How the world's DNS is asked. A port, so a test can say what a zone holds. */
export type TxtResolver = (name: string) => Promise<string[][]>;

/**
 * The injection token for that port.
 *
 * A constructor parameter with a default is still a parameter as far as Nest is
 * concerned — it reads the emitted types, not the JavaScript — so without a
 * token here the whole application refuses to start, which is exactly what
 * `app-boots` caught.
 */
export const TXT_RESOLVER = Symbol("TXT_RESOLVER");

/** Where a domain has got to, as the owner's screen says it. */
export type DomainState = "WAITING_FOR_DNS" | "WAITING_FOR_US" | "LIVE";

export interface DomainRow {
  id: number;
  host: string;
  state: DomainState;
  canonical: boolean;
  verifiedAt: Date | null;
  provisionedAt: Date | null;
  /** what to put in the DNS — still shown after verification, because a record removed is a domain lost */
  record: DnsRecord;
}

/** Whose domain it is. */
type Owner = { resortId: number } | { accountId: number };

const resortOf = (owner: Owner): number | null => ("resortId" in owner ? owner.resortId : null);

/** The hosts this deployment answers at itself, which nobody may claim. */
const ownHosts = (): string[] =>
  (process.env.OWN_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

@Injectable()
export class ResortDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SiteCacheService) private readonly cache: SiteCacheService,
    /**
     * Node's own resolver by default. A port so the tests can hold a zone
     * rather than reach the internet — a test that depends on somebody else's
     * DNS is a test that fails on a train.
     */
    @Optional() @Inject(TXT_RESOLVER) private readonly txt: TxtResolver = (name) => resolveTxt(name),
    /** asked only for an agency, whose plan sells the page a domain points at */
    @Optional() @Inject(PlanLimitsService) private readonly planLimits?: PlanLimitsService,
  ) {}

  private async mine(claims: JwtClaims, resortId: number): Promise<Owner> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    return { resortId };
  }

  private async agency(claims: JwtClaims): Promise<{ accountId: number }> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agencies only");
    await this.perms.require(claims, undefined, "agent.website.manage");
    const { accountId } = await agencyOf(this.prisma, claims.userId);
    if (accountId == null) throw forbid("This agent has no agency account.");
    return { accountId };
  }

  private static state(row: { verifiedAt: Date | null; provisionedAt: Date | null }): DomainState {
    if (!row.verifiedAt) return "WAITING_FOR_DNS";
    return row.provisionedAt ? "LIVE" : "WAITING_FOR_US";
  }

  private static row(d: {
    id: number;
    host: string;
    token: string;
    canonical: boolean;
    verifiedAt: Date | null;
    provisionedAt: Date | null;
  }): DomainRow {
    return {
      id: d.id,
      host: d.host,
      state: ResortDomainService.state(d),
      canonical: d.canonical,
      verifiedAt: d.verifiedAt,
      provisionedAt: d.provisionedAt,
      record: dnsRecordFor(d.host, d.token),
    };
  }

  // ── a resort's ──────────────────────────────────────────────────────────

  async list(claims: JwtClaims, resortId: number): Promise<DomainRow[]> {
    return this.listFor(await this.mine(claims, resortId));
  }

  async claim(claims: JwtClaims, resortId: number, wanted: string): Promise<DomainRow> {
    return this.claimFor(await this.mine(claims, resortId), claims.userId, wanted);
  }

  async verify(claims: JwtClaims, resortId: number, id: number): Promise<DomainRow> {
    return this.verifyFor(await this.mine(claims, resortId), claims.userId, id);
  }

  async setCanonical(claims: JwtClaims, resortId: number, id: number): Promise<DomainRow[]> {
    return this.canonicalFor(await this.mine(claims, resortId), id);
  }

  async remove(claims: JwtClaims, resortId: number, id: number): Promise<{ removed: true }> {
    return this.removeFor(await this.mine(claims, resortId), claims.userId, id);
  }

  // ── an agency's (2026-09-17) ────────────────────────────────────────────

  async listForAgency(claims: JwtClaims): Promise<DomainRow[]> {
    return this.listFor(await this.agency(claims));
  }

  /** Claiming needs the plan's website: a domain for a page the agency cannot publish is a promise nobody keeps. */
  async claimForAgency(claims: JwtClaims, wanted: string): Promise<DomainRow> {
    const owner = await this.agency(claims);
    if (this.planLimits) await this.planLimits.requireAccountFeature(owner.accountId, "agency_website");
    return this.claimFor(owner, claims.userId, wanted);
  }

  async verifyForAgency(claims: JwtClaims, id: number): Promise<DomainRow> {
    return this.verifyFor(await this.agency(claims), claims.userId, id);
  }

  async setCanonicalForAgency(claims: JwtClaims, id: number): Promise<DomainRow[]> {
    return this.canonicalFor(await this.agency(claims), id);
  }

  async removeForAgency(claims: JwtClaims, id: number): Promise<{ removed: true }> {
    return this.removeFor(await this.agency(claims), claims.userId, id);
  }

  // ── the rules, for either ───────────────────────────────────────────────

  private async listFor(owner: Owner): Promise<DomainRow[]> {
    const rows = await this.prisma.resortDomain.findMany({ where: owner, orderBy: { id: "asc" } });
    return rows.map(ResortDomainService.row);
  }

  /**
   * Claims a domain, and hands back the record that proves it.
   *
   * Refused early for a name no certificate authority will issue for: the
   * alternative is a wait that ends days later in a failure nobody explains, in
   * a log the owner cannot read.
   */
  private async claimFor(owner: Owner, actorId: number, wanted: string): Promise<DomainRow> {
    const problem = claimProblem(wanted, ownHosts());
    if (problem) throw badRequest(problem);
    const host = normaliseHost(wanted)!;

    const existing = await this.prisma.resortDomain.findUnique({ where: { host } });
    if (existing) {
      // the owner that already has it is simply told so again, with the record
      const same =
        "resortId" in owner ? existing.resortId === owner.resortId : existing.accountId === owner.accountId;
      if (same) return ResortDomainService.row(existing);
      throw Object.assign(new Error("Somebody else has already claimed that domain."), { status: 409 });
    }

    const created = await this.prisma.resortDomain.create({
      data: { ...owner, host, token: randomBytes(16).toString("hex") },
    });
    await this.audit.log({
      actorId,
      resortId: resortOf(owner),
      action: "domain.claim",
      entity: "resort_domain",
      entityId: created.id,
      diff: { host, ...owner },
    });
    return ResortDomainService.row(created);
  }

  /**
   * Looks for the proof, and records it when it is there.
   *
   * A resolver that throws is not a failed check — it is a check that has not
   * happened, and the two must not read the same to an owner who is waiting for
   * DNS to propagate. Both end in "not yet"; neither writes anything.
   */
  private async verifyFor(owner: Owner, actorId: number, id: number): Promise<DomainRow> {
    const row = await this.prisma.resortDomain.findFirst({ where: { id, ...owner } });
    if (!row) throw Object.assign(new Error("No such domain"), { status: 404 });
    if (row.verifiedAt) return ResortDomainService.row(row);

    const name = `${DNS_PREFIX}.${row.host}`;
    let records: string[][];
    try {
      records = await this.txt(name);
    } catch {
      throw badRequest(
        `We could not read the DNS for ${row.host} yet. A new record can take a few minutes — try again shortly.`,
      );
    }
    // a zone holds other records; the token has to be among them, whole
    const found = records.some((chunks) => chunks.join("").trim() === row.token);
    if (!found) {
      throw badRequest(
        `No TXT record at ${name} carries the value we gave you. Add it at your registrar, then check again.`,
      );
    }

    /**
     * The first domain an owner proves becomes the address its pages call
     * canonical. Nobody should have to make that choice to get started.
     */
    const first =
      (await this.prisma.resortDomain.count({ where: { ...owner, verifiedAt: { not: null } } })) === 0;

    const saved = await this.prisma.resortDomain.update({
      where: { id: row.id },
      data: { verifiedAt: new Date(), canonical: first },
    });
    await this.audit.log({
      actorId,
      resortId: resortOf(owner),
      action: "domain.verify",
      entity: "resort_domain",
      entityId: row.id,
      diff: { host: row.host },
    });
    await this.touch(owner);
    return ResortDomainService.row(saved);
  }

  /** Which of an owner's domains its pages name as the address. */
  private async canonicalFor(owner: Owner, id: number): Promise<DomainRow[]> {
    const row = await this.prisma.resortDomain.findFirst({ where: { id, ...owner } });
    if (!row) throw Object.assign(new Error("No such domain"), { status: 404 });
    if (!row.verifiedAt) throw badRequest("Prove that domain first — an unverified address serves nothing.");

    await this.prisma.$transaction([
      this.prisma.resortDomain.updateMany({ where: owner, data: { canonical: false } }),
      this.prisma.resortDomain.update({ where: { id }, data: { canonical: true } }),
    ]);
    await this.touch(owner);
    return this.listFor(owner);
  }

  /**
   * Gives a domain up.
   *
   * The row goes and the address stops resolving on the next request. The
   * certificate is deliberately left alone: one for a name nobody serves is
   * harmless, and deleting it is how you find out what else was using it.
   */
  private async removeFor(owner: Owner, actorId: number, id: number): Promise<{ removed: true }> {
    const row = await this.prisma.resortDomain.findFirst({ where: { id, ...owner } });
    if (!row) throw Object.assign(new Error("No such domain"), { status: 404 });

    await this.prisma.resortDomain.delete({ where: { id } });
    await this.audit.log({
      actorId,
      resortId: resortOf(owner),
      action: "domain.remove",
      entity: "resort_domain",
      entityId: id,
      diff: { host: row.host },
    });
    await this.touch(owner);
    return { removed: true };
  }

  /**
   * Whose site answers at this host — the question the middleware asks.
   *
   * Public, unauthenticated, and deliberately narrow: which kind of page, and
   * its slug. `null` for an unknown host, an unverified one, and a header that
   * is not a hostname, because the caller does the same thing with all three.
   */
  async byHost(host: string): Promise<{ kind: "resort" | "agency"; slug: string } | null> {
    const name = normaliseHost(host);
    if (!name) return null;
    const row = await this.prisma.resortDomain.findFirst({
      where: { host: name, verifiedAt: { not: null } },
      select: { resort: { select: { slug: true } }, account: { select: { slug: true } } },
    });
    if (row?.resort) return { kind: "resort", slug: row.resort.slug };
    if (row?.account) return { kind: "agency", slug: row.account.slug };
    return null;
  }

  /** The website caches the owner's page; a change to its domains has to reach it. */
  private async touch(owner: Owner): Promise<void> {
    if ("resortId" in owner) {
      const resort = await this.prisma.resort.findUnique({ where: { id: owner.resortId }, select: { slug: true } });
      if (resort) await this.cache.changed(resort.slug);
      return;
    }
    const account = await this.prisma.tenant.findUnique({ where: { id: owner.accountId }, select: { slug: true } });
    if (account) await this.cache.changedAgency(account.slug);
  }
}
