import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { signToken } from "../common/auth.guard";
import { slugify } from "../common/plans";
import { ensureResortRoles } from "../common/permissions";
import { contactEmail, contactPhone, contactTaken, findUserByIdentifier } from "../common/contact";
import { openingSubscription, redeemOffer } from "../common/offers";
import { ROLE, type Role } from "@rh/shared";

/**
 * Sign-in for the platform's two customers — a resort's staff and a travel
 * agency — and nobody else.
 *
 * There used to be a second way in: a code sent by email or SMS
 * (`requestOtp` / `verifyOtp`) that minted a GUEST account for any address it
 * had not seen before. Guests are not accounts any more (2026-09-11), and a
 * locked-out member of staff now has the password reset, so the code, the
 * table that held it and the mail and SMS senders it needed are all gone from
 * here.
 */
@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Identifier may be a phone number or an email address — see findUserByIdentifier. */
  async loginWithPassword(identifierRaw: string, password: string) {
    if (!identifierRaw) throw new UnauthorizedException("Invalid identifier or password");
    const user = await findUserByIdentifier(this.prisma, identifierRaw);
    if (!user || !user.passwordHash || user.status !== "active") {
      throw new UnauthorizedException("Invalid identifier or password");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid identifier or password");
    return this.issueToken(user.id, user.role);
  }

  me(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        // an agency's standing with the platform: pending until verified,
        // suspended when behind on its bill — the console says so
        account: { select: { id: true, name: true, kind: true, status: true, suspendedReason: true } },
        resorts: {
          select: {
            resort: { select: { id: true, name: true, tenantId: true, status: true, currency: true, locale: true, timezone: true } },
            // `commissionRate` used to ride along here. It was the agent's own
            // legacy rate, which nothing sets and nothing prices on any more —
            // shipping it would be handing the console a number that disagrees
            // with every screen that shows commission.
          },
        },
      },
    });
  }

  /**
   * Self-serve onboarding: creates tenant + first resort + resort_admin in one
   * transaction, then issues a token. Public.
   */
  async signup(input: {
    companyName: string;
    resortName: string;
    location?: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    slug?: string;
    /** an offer code — the plan and trial the workspace starts on */
    offer?: string;
  }) {
    // both, stored the way login reads them. Signup used to keep only the
    // phone, so the owner who signed up alone was the one person a password
    // reset — which is a link sent by email — could never reach.
    const phone = contactPhone(input.phone);
    const email = contactEmail(input.email);
    if (input.password.length < 8) {
      throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
    }
    const slug = slugify(input.slug?.trim() || input.companyName || input.resortName);
    if (!slug) throw Object.assign(new Error("Company name is required"), { status: 400 });

    const [slugTaken, taken] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug } }),
      contactTaken(this.prisma, { email, phone }),
    ]);
    if (slugTaken) throw Object.assign(new Error(`Workspace "${slug}" is already taken`), { status: 409 });
    if (taken === "email") throw Object.assign(new Error("This email already has an account — sign in instead"), { status: 409 });
    if (taken === "phone") throw Object.assign(new Error("This phone already has an account — sign in instead"), { status: 409 });

    const passwordHash = await bcrypt.hash(input.password, 12);

    const offerCode = input.offer?.trim();
    const result = await this.prisma.$transaction(async (tx) => {
      // spent first, so a refused offer leaves nothing behind
      const redeemed = offerCode ? await redeemOffer(tx, offerCode, { audience: "RESORT", email }) : null;
      const tenant = await tx.tenant.create({
        data: {
          name: input.companyName || input.resortName,
          slug,
          offerId: redeemed?.offer.id ?? null,
        },
      });
      // an offer names the plan; without one no subscription is written, and
      // PlanLimits holds the account to the cheapest plan on sale
      if (redeemed) await tx.subscription.create({ data: openingSubscription(tenant.id, redeemed.plan, redeemed.offer) });
      const resort = await tx.resort.create({
        data: {
          tenantId: tenant.id,
          name: input.resortName,
          location: input.location,
          // timezone, currency and locale come from the schema's defaults;
          // repeating them here was a second place to change when a resort
          // outside Bangladesh signs up, and the one nobody would remember
        },
      });
      const user = await tx.user.create({
        data: {
          name: input.name.trim() || phone,
          phone,
          email,
          role: "RESORT_ADMIN",
          passwordHash,
        },
      });
      await tx.userResort.create({ data: { userId: user.id, resortId: resort.id } });
      await tx.counter.create({ data: { resortId: resort.id, kind: "BOOKING", nextVal: 0 } });
      // inside the transaction, on `tx`. This was `this.prisma` — a second
      // connection, inserting roles for a resort this transaction had not
      // committed. It waited on the resort row until the transaction timed out
      // and rolled back, then failed on the foreign key: no signup has
      // completed since the call was added, and no test called signup to say so.
      await ensureResortRoles(tx, resort.id);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          resortId: resort.id,
          action: "tenant.signup",
          entity: "tenant",
          entityId: BigInt(tenant.id),
          diff: { slug, resort: input.resortName },
        },
      });
      return { tenant, resort, user };
    });
    return this.issueToken(result.user.id, result.user.role);
  }

  /**
   * An agency's front door (2026-09-11 design, §6.2) — the mirror of resort
   * signup, because the owner asked for exactly that. It lands pending: the
   * platform verifies each agency once, and that is the only gate between it
   * and every open resort. Its subscription starts in trial on the plan it
   * chose, from the agency shelf and nowhere else.
   */
  async signupAgency(input: {
    agencyName: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    /** the plan picked from the agency shelf; an offer's plan wins over it */
    plan?: string;
    offer?: string;
  }) {
    const phone = contactPhone(input.phone);
    const email = contactEmail(input.email);
    if (input.password.length < 8) {
      throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
    }
    const agencyName = input.agencyName.trim();
    if (!agencyName) throw Object.assign(new Error("Agency name is required"), { status: 400 });

    const offerCode = input.offer?.trim();
    const chosen = offerCode ? null : await this.prisma.platformPlan.findUnique({ where: { name: (input.plan ?? "").trim().toUpperCase() } });
    if (!offerCode && (!chosen || !chosen.active || chosen.audience !== "AGENCY")) {
      const shelf = await this.prisma.platformPlan.findMany({
        where: { active: true, audience: "AGENCY" },
        orderBy: { sortOrder: "asc" },
        select: { name: true },
      });
      throw Object.assign(
        new Error(`${input.plan ? `"${input.plan}" is not an agency plan` : "Pick a plan"}. On the agency shelf: ${shelf.map((p) => p.name).join(", ") || "none yet"}`),
        { status: 400 },
      );
    }

    const taken = await contactTaken(this.prisma, { email, phone });
    if (taken === "email") throw Object.assign(new Error("This email already has an account — sign in instead"), { status: 409 });
    if (taken === "phone") throw Object.assign(new Error("This phone already has an account — sign in instead"), { status: 409 });

    // the slug is not the agency's to see; it only has to be unique
    const base = slugify(agencyName) || "agency";
    const slug = (await this.prisma.tenant.findUnique({ where: { slug: base } })) ? `${base}-${Date.now().toString(36)}` : base;
    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const redeemed = offerCode ? await redeemOffer(tx, offerCode, { audience: "AGENCY", email }) : null;
      const plan = redeemed?.plan ?? chosen!;
      // pending even when a resort sent the invitation: verification is the
      // platform's, once, and a resort's word must not open every other resort
      const account = await tx.tenant.create({
        data: { name: agencyName, slug, kind: "AGENCY", status: "pending", offerId: redeemed?.offer.id ?? null },
      });
      const u = await tx.user.create({
        data: { name: input.name.trim() || agencyName, phone, email, role: "AGENT", passwordHash, accountId: account.id },
      });
      await tx.subscription.create({ data: openingSubscription(account.id, plan, redeemed?.offer) });
      // the resort that invited it gets it as an agent, to sell for once verified
      const invitedBy = redeemed?.offer.resortId;
      if (invitedBy) {
        const role = await tx.customRole.findFirst({ where: { resortId: invitedBy, name: "Agent" }, select: { id: true } });
        await tx.userResort.create({ data: { userId: u.id, resortId: invitedBy, roleId: role?.id ?? null } });
      }
      await tx.auditLog.create({
        data: { actorId: u.id, action: "agency.signup", entity: "tenant", entityId: BigInt(account.id), diff: { slug, plan: plan.name, offer: offerCode ?? null } },
      });
      return u;
    });
    return this.issueToken(user.id, user.role);
  }

  private async issueToken(userId: number, role: Role) {
    let resortIds: number[] = [];
    if (role !== ROLE.SUPER_ADMIN) {
      const rows = await this.prisma.userResort.findMany({
        where: { userId },
        select: { resortId: true },
      });
      resortIds = rows.map((r) => r.resortId);
    }
    return {
      accessToken: signToken({ userId, role, resortIds }),
      tokenType: "Bearer",
      user: { id: userId, role, resortIds },
    };
  }
}
