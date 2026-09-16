/**
 * The key a resort's own website holds (2026-09-15 design, §3).
 *
 * Whoever has a key is the resort, as far as `/v1` is concerned, so everything
 * here exists to keep that sentence true: shown once, stored as a hash, scoped
 * to what the integration needs, and revocable the same second.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** What a key may do. A closed list, like every other vocabulary here. */
export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Who is calling, once a secret has been believed.
 *
 * A resort's key or an agency's — exactly one of `resortId` and `accountId` is
 * set (2026-09-17 design, §3). Each API asks for its own kind and refuses the
 * other, so a key never opens a door it was not made for.
 */
export interface ApiCaller {
  keyId: bigint;
  resortId: number | null;
  accountId: number | null;
  scopes: ApiScope[];
}

/**
 * `rm_live_<prefix>_<secret>`.
 *
 * The prefix is inside the secret so a key found in somebody's logs can be
 * identified — and revoked — without anybody having to hold the key itself.
 */
const SECRET = /^rm_live_([a-z0-9]{8,24})_([a-f0-9]{32})$/;

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * How stale `lastUsedAt` is allowed to be.
 *
 * It answers "is this key still in use", which nobody asks to the second. A
 * write on every request would put a row update in front of every read the
 * public API serves.
 */
const LAST_USED_EVERY_MS = 60_000;

@Injectable()
export class ApiKeyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** A new secret, and the row to store beside it. The secret is never stored. */
  static mint(): { secret: string; prefix: string; keyHash: string } {
    const prefix = randomBytes(6).toString("hex");
    const secret = `rm_live_${prefix}_${randomBytes(16).toString("hex")}`;
    return { secret, prefix, keyHash: hash(secret) };
  }

  /**
   * Who this secret belongs to, or `null`.
   *
   * One answer for every way it can fail — malformed, unknown, revoked, wrong
   * — because the caller does the same thing with all of them, and telling a
   * stranger which of them it was is telling them how to get closer.
   */
  async authenticate(secret: string | undefined | null): Promise<ApiCaller | null> {
    const parts = SECRET.exec((secret ?? "").trim());
    if (!parts) return null;

    const row = await this.prisma.apiKey.findUnique({ where: { prefix: parts[1]! } });
    if (!row || !row.active) return null;

    /**
     * Compared in constant time, though the value is a hash of a random
     * 128-bit secret and guessing it one byte at a time is not the threat. It
     * costs nothing and means the next person to reuse this does not have to
     * notice.
     */
    const expected = Buffer.from(row.keyHash, "utf8");
    const actual = Buffer.from(hash(parts[0]!), "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const stale = !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS;
    if (stale) {
      await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    }

    return { keyId: row.id, resortId: row.resortId, accountId: row.accountId, scopes: scopesOf(row.scopes) };
  }

  /** Whether this caller holds a scope. */
  may(caller: ApiCaller, scope: ApiScope): boolean {
    return caller.scopes.includes(scope);
  }
}

/**
 * What a stored `scopes` column means.
 *
 * A key written before scopes existed has none, and reading is what it gets:
 * the alternative is a silent upgrade to write for every key already in the
 * wild. Unknown values are dropped rather than trusted.
 */
export function scopesOf(value: unknown): ApiScope[] {
  const held = Array.isArray(value)
    ? value.filter((s): s is ApiScope => typeof s === "string" && (API_SCOPES as readonly string[]).includes(s))
    : [];
  // every key can read; write is the one that has to be granted
  return held.includes("write") ? ["read", "write"] : ["read"];
}

/** The scopes an owner asked for, or why they cannot have them. */
export function askedScopes(wanted: unknown): ApiScope[] {
  if (wanted === undefined || wanted === null) return ["read"];
  if (!Array.isArray(wanted)) throw Object.assign(new Error("Scopes must be a list."), { status: 400 });
  for (const s of wanted) {
    if (typeof s !== "string" || !(API_SCOPES as readonly string[]).includes(s)) {
      throw Object.assign(new Error(`"${String(s)}" is not something a key can do.`), { status: 400 });
    }
  }
  return scopesOf(wanted);
}
