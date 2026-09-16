/**
 * `/v1/agency` — what an agency's own website may do (2026-09-17 design, §3).
 *
 * Reading is `AgencyPublishedService`, the same answer the agency's page on the
 * platform draws. Writing is `BookingsService.create`, called **as the agency's
 * owner**: a booking from an agency key is an agent booking in every respect —
 * pending until the resort confirms it, on the agency's commission, refused if
 * the agency may not sell or the dates are past the resort's window. There is
 * one booking engine, and this is a caller of it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ROLE, type AgencyPublished, type JwtClaims, type PublishedVacancy } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { BookingsService } from "../bookings/bookings.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AgencyPublishedService, ownerOfAccount } from "../site/agency-published.service";
import { assertWithinAgentWindow } from "../common/agent-window";
import { badRequest, forbid } from "../common/rbac";
import { ApiKeyService, type ApiCaller } from "./api-key.service";
import { V1Service, sameOrder, type V1Booking, type V1BookingOrder } from "./v1.service";
import { freeRoomOfType, roomTypeByKey } from "./room-pick";

/** A booking as `/v1/agency` describes one: the resort's `/v1` answer, and where the request to cancel stands. */
export interface AgencyBooking extends V1Booking {
  resort: string;
  cancelRequested: boolean;
}

/** Longest idempotency key accepted; the stored form carries the account in front of it. */
const MAX_KEY = 100;

@Injectable()
export class AgencyApiService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyPublishedService) private readonly published: AgencyPublishedService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(ApiKeyService) private readonly keys: ApiKeyService,
    @Inject(V1Service) private readonly v1: V1Service,
  ) {}

  /**
   * The account this key belongs to, having checked everything a call needs.
   *
   * The plan is asked on every call, not only when the key was minted: an
   * agency whose plan no longer includes the API must find its site stop
   * booking, not carry on for as long as nobody revokes a key.
   */
  private async must(caller: ApiCaller, scope: "read" | "write"): Promise<number> {
    if (caller.accountId == null) {
      throw forbid("This is a resort's key. A resort's website uses /v1.");
    }
    await this.planLimits.requireAccountFeature(caller.accountId, "agency_api");
    if (!this.keys.may(caller, scope)) {
      throw forbid(`This key may only ${caller.scopes.join(" and ")}.`);
    }
    return caller.accountId;
  }

  /** The agency's owner, as the claims a booking is made under. */
  private async asAgency(accountId: number, keyId: bigint): Promise<JwtClaims> {
    const owner = await ownerOfAccount(this.prisma, accountId);
    if (!owner) throw forbid("This agency has nobody to book as.");
    return { userId: owner.id, role: ROLE.AGENT, resortIds: [], apiKeyId: keyId };
  }

  async agency(caller: ApiCaller): Promise<AgencyPublished> {
    return this.published.draw(await this.must(caller, "read"));
  }

  async vacancy(caller: ApiCaller, slug: string, from: string, to: string): Promise<PublishedVacancy[]> {
    const accountId = await this.must(caller, "read");
    const resort = await this.published.sellableResort(accountId, slug);
    // told before a site offers dates it could never book
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to ?? ""))) {
      await assertWithinAgentWindow(this.prisma, resort.id, new Date(`${to}T00:00:00.000Z`));
    }
    return this.published.vacancy(resort, from, to);
  }

  async book(caller: ApiCaller, slug: string, idempotencyKey: string, order: V1BookingOrder): Promise<AgencyBooking> {
    const accountId = await this.must(caller, "write");
    const key = String(idempotencyKey ?? "").trim();
    if (!key) {
      throw badRequest(
        "Send an Idempotency-Key header. A request that times out is not a request that failed, and without one a retry books the room twice.",
      );
    }
    if (key.length > MAX_KEY) throw badRequest(`That Idempotency-Key is too long — ${MAX_KEY} characters at most.`);
    const resort = await this.published.sellableResort(accountId, slug);
    /**
     * Stored with the account in front of it. The index is per resort, and the
     * resort's own website picks its keys too — two callers naming a booking
     * "order-1" at one resort are two bookings, not one.
     */
    const stored = `agency:${accountId}:${key}`;

    const before = await this.prisma.booking.findFirst({ where: { resortId: resort.id, idempotencyKey: stored } });
    if (before) {
      if (!sameOrder(before, order)) {
        throw Object.assign(new Error("That Idempotency-Key was used for a different booking. Use a new one."), { status: 409 });
      }
      return this.render(before.code, resort);
    }

    const type = await roomTypeByKey(this.prisma, resort.id, order.roomType);
    const roomId = await freeRoomOfType(this.prisma, resort.id, type.id, order.checkIn, order.checkOut);
    if (roomId == null) {
      // the window is the likelier reason, and saying so beats "none free"
      await assertWithinAgentWindow(this.prisma, resort.id, new Date(`${order.checkOut}T00:00:00.000Z`));
      throw Object.assign(new Error(`No ${type.name} is free for those nights.`), { status: 409 });
    }

    try {
      const made = (await this.bookings.create(await this.asAgency(accountId, caller.keyId), {
        resortId: resort.id,
        roomIds: [roomId],
        checkIn: order.checkIn,
        checkOut: order.checkOut,
        adults: order.adults,
        children: order.children ?? 0,
        guest: { fullName: order.guest.fullName, phone: order.guest.phone, email: order.guest.email },
        remarks: order.remarks,
        idempotencyKey: stored,
      })) as { code: string };
      return this.render(made.code, resort);
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        const won = await this.prisma.booking.findFirst({ where: { resortId: resort.id, idempotencyKey: stored } });
        if (won) return this.render(won.code, resort);
      }
      throw e;
    }
  }

  async booking(caller: ApiCaller, slug: string, code: string): Promise<AgencyBooking> {
    const accountId = await this.must(caller, "read");
    const resort = await this.published.sellableResort(accountId, slug);
    await this.own(accountId, resort.id, code);
    return this.render(code, resort);
  }

  /**
   * Asks the resort to call it off.
   *
   * An agency cannot cancel a booking on its own — the resort approves the
   * request, from the same queue an agent's request from the console lands in.
   */
  async cancel(caller: ApiCaller, slug: string, code: string, reason?: string): Promise<AgencyBooking> {
    const accountId = await this.must(caller, "write");
    const resort = await this.published.sellableResort(accountId, slug);
    const row = await this.own(accountId, resort.id, code);
    if (row.cancelState === "NONE") {
      const claims = await this.asAgency(accountId, caller.keyId);
      // made by one of the agency's staff: the request is still the agency's
      await this.bookings.requestCancel({ ...claims, userId: row.agentUserId ?? claims.userId }, row.id, reason);
    }
    return this.render(code, resort);
  }

  /** A booking this agency made, at this resort, or 404 — somebody else's is nobody's business. */
  private async own(accountId: number, resortId: number, code: string) {
    const row = await this.prisma.booking.findFirst({
      where: {
        code: String(code ?? ""),
        resortId,
        deletedAt: null,
        agentUser: { OR: [{ accountId }, { parentAgent: { accountId } }] },
      },
      select: { id: true, cancelState: true, agentUserId: true },
    });
    if (!row) throw Object.assign(new Error("No such booking"), { status: 404 });
    return row;
  }

  private async render(code: string, resort: { id: number; slug: string }): Promise<AgencyBooking> {
    const base = await this.v1.render(code, resort.id);
    const row = await this.prisma.booking.findFirst({
      where: { code, resortId: resort.id },
      select: { cancelState: true },
    });
    return { ...base, resort: resort.slug, cancelRequested: row?.cancelState === "REQUESTED" };
  }
}
