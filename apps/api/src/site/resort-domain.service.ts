/**
 * A domain a resort brought with it (2026-09-15 design).
 *
 * One rule governs everything here, and it is not about correctness:
 * provisioning asks a certificate authority for a certificate in a name. A row
 * nobody proved is a certificate issued to whoever typed fastest — and, the day
 * that domain's DNS moves, one customer's site served at another's address.
 *
 * So a domain is claimed by proving control of its DNS; nothing is provisioned
 * before that; and `byHost` — the question the middleware asks on every request
 * at an unfamiliar host — answers for nothing that has not been proved.
 */
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { claimProblem, dnsRecordFor, DNS_PREFIX, normaliseHost, type DnsRecord, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { badRequest, requireResortAccess } from "../common/rbac";
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
  ) {}

  private async mine(claims: JwtClaims, resortId: number): Promise<void> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
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

  async list(claims: JwtClaims, resortId: number): Promise<DomainRow[]> {
    await this.mine(claims, resortId);
    const rows = await this.prisma.resortDomain.findMany({
      where: { resortId },
      orderBy: { id: "asc" },
    });
    return rows.map(ResortDomainService.row);
  }

  /**
   * Claims a domain, and hands back the record that proves it.
   *
   * Refused early for a name no certificate authority will issue for: the
   * alternative is a wait that ends days later in a failure nobody explains, in
   * a log the owner cannot read.
   */
  async claim(claims: JwtClaims, resortId: number, wanted: string): Promise<DomainRow> {
    await this.mine(claims, resortId);
    const problem = claimProblem(wanted, ownHosts());
    if (problem) throw badRequest(problem);
    const host = normaliseHost(wanted)!;

    const existing = await this.prisma.resortDomain.findUnique({ where: { host } });
    if (existing) {
      // the resort that already has it is simply told so again, with the record
      if (existing.resortId === resortId) return ResortDomainService.row(existing);
      throw Object.assign(new Error("Another resort has already claimed that domain."), { status: 409 });
    }

    const created = await this.prisma.resortDomain.create({
      data: { resortId, host, token: randomBytes(16).toString("hex") },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "domain.claim",
      entity: "resort_domain",
      entityId: created.id,
      diff: { host },
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
  async verify(claims: JwtClaims, resortId: number, id: number): Promise<DomainRow> {
    await this.mine(claims, resortId);
    const row = await this.prisma.resortDomain.findFirst({ where: { id, resortId } });
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
     * The first domain a resort proves becomes the address its pages call
     * canonical. Nobody should have to make that choice to get started, and a
     * resort with one domain has no choice to make.
     */
    const first = (await this.prisma.resortDomain.count({
      where: { resortId, verifiedAt: { not: null } },
    })) === 0;

    const saved = await this.prisma.resortDomain.update({
      where: { id: row.id },
      data: { verifiedAt: new Date(), canonical: first },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "domain.verify",
      entity: "resort_domain",
      entityId: row.id,
      diff: { host: row.host },
    });
    await this.touch(resortId);
    return ResortDomainService.row(saved);
  }

  /** Which of a resort's domains its pages name as the address. */
  async setCanonical(claims: JwtClaims, resortId: number, id: number): Promise<DomainRow[]> {
    await this.mine(claims, resortId);
    const row = await this.prisma.resortDomain.findFirst({ where: { id, resortId } });
    if (!row) throw Object.assign(new Error("No such domain"), { status: 404 });
    if (!row.verifiedAt) throw badRequest("Prove that domain first — an unverified address serves nothing.");

    await this.prisma.$transaction([
      this.prisma.resortDomain.updateMany({ where: { resortId }, data: { canonical: false } }),
      this.prisma.resortDomain.update({ where: { id }, data: { canonical: true } }),
    ]);
    await this.touch(resortId);
    return this.list(claims, resortId);
  }

  /**
   * Gives a domain up.
   *
   * The row goes and the address stops resolving on the next request. The
   * certificate is deliberately left alone: one for a name nobody serves is
   * harmless, and deleting it is how you find out what else was using it.
   */
  async remove(claims: JwtClaims, resortId: number, id: number): Promise<{ removed: true }> {
    await this.mine(claims, resortId);
    const row = await this.prisma.resortDomain.findFirst({ where: { id, resortId } });
    if (!row) throw Object.assign(new Error("No such domain"), { status: 404 });

    await this.prisma.resortDomain.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "domain.remove",
      entity: "resort_domain",
      entityId: id,
      diff: { host: row.host },
    });
    await this.touch(resortId);
    return { removed: true };
  }

  /**
   * Whose site answers at this host — the question the middleware asks.
   *
   * Public, unauthenticated, and deliberately narrow: a slug and nothing else.
   * `null` for an unknown host, an unverified one, and a header that is not a
   * hostname, because the caller does the same thing with all three.
   */
  async byHost(host: string): Promise<{ slug: string } | null> {
    const name = normaliseHost(host);
    if (!name) return null;
    const row = await this.prisma.resortDomain.findFirst({
      where: { host: name, verifiedAt: { not: null } },
      select: { resort: { select: { slug: true } } },
    });
    return row ? { slug: row.resort.slug } : null;
  }

  /** The website caches a host's answer; a change to the domains has to reach it. */
  private async touch(resortId: number): Promise<void> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { slug: true },
    });
    if (resort) await this.cache.changed(resort.slug);
  }
}
