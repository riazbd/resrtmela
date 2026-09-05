import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";

const FB_PREFIX = "RES";

@Injectable()
export class FbService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private computeStatus(paid: number, total: number): "PAID" | "PARTIAL" | "UNPAID" {
    if (paid >= total - 0.01 && paid > 0) return "PAID";
    if (paid > 0) return "PARTIAL";
    return "UNPAID";
  }

  async create(
    claims: JwtClaims,
    resortId: number,
    input: {
      date: string;
      items: { name: string; qty: number; unitPrice: number }[];
      guestName?: string;
      bookingId?: number;
      roomId?: number;
      paidAmount?: number;
      method?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
      note?: string;
    },
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    requireResortAccess(claims, resortId);
    if (!input.items?.length) throw badRequest("At least one item required");

    // charge-to-room: validate the booking belongs to this resort & is live
    let booking: { id: number; state: string } | null = null;
    if (input.bookingId) {
      const b = await this.prisma.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, resortId: true, state: true },
      });
      if (!b || b.resortId !== resortId) throw badRequest("Booking not found at this resort");
      if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(b.state)) {
        throw badRequest("Booking is not live");
      }
      booking = b;
    }

    const bill = await this.prisma.$transaction(async (tx) => {
      await tx.counter.upsert({
        where: { resortId_kind: { resortId, kind: "FB" } },
        create: { resortId, kind: "FB", nextVal: 0 },
        update: {},
      });
      const counter = await tx.counter.update({
        where: { resortId_kind: { resortId, kind: "FB" } },
        data: { nextVal: { increment: 1 } },
      });
      const code = `${FB_PREFIX}-${String(counter.nextVal).padStart(5, "0")}`;
      // room: explicit, else derived from the charged booking's first room item
      const roomId = input.roomId
        ? input.roomId
        : booking
          ? (await tx.bookingItem.findFirst({
              where: { bookingId: booking.id, itemKind: "ROOM" },
              select: { roomId: true },
            }))?.roomId ?? null
          : null;

      const created = await tx.fbBill.create({
        data: {
          resortId,
          code,
          billDate: dateOnly(input.date),
          guestName: input.guestName,
          bookingId: input.bookingId,
          roomId,
          paidAmount: (input.paidAmount ?? 0) as never,
          method: input.method,
          note: input.note,
          createdBy: claims.userId,
          items: {
            create: input.items.map((i) => ({
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice as never,
            })),
          },
        },
        include: { items: true },
      });

      // charge-to-room: bill total posts into the room booking ledger, and any
      // cash collected at the counter posts as a payment on the same booking
      const total = round2(created.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0));
      if (booking) {
        await tx.bookingItem.create({
          data: {
            bookingId: booking.id,
            itemKind: "FB",
            fbBillId: created.id,
            qty: 1,
            unitPrice: total as never,
          },
        });
        if ((input.paidAmount ?? 0) > 0) {
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              amount: input.paidAmount as never,
              method: input.method ?? "CASH",
              paymentType: "FINAL",
              receivedById: claims.userId,
              note: `F&B ${code}`,
            },
          });
        }
      }
      return created;
    });

    const total = round2(bill.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0));
    await this.audit.log({
      actorId: claims.userId, resortId,
      action: "fb.bill.create", entity: "fbBill", entityId: bill.id,
      diff: { code: bill.code, total },
    });
    return this.shape(bill, total);
  }

  async list(claims: JwtClaims, resortId: number, from?: string, to?: string) {
    requireResortAccess(claims, resortId);
    const rows = await this.prisma.fbBill.findMany({
      where: {
        resortId,
        deletedAt: null,
        ...(from ? { billDate: { gte: dateOnly(from) } } : {}),
        ...(to ? { billDate: { ...((from ? { gte: dateOnly(from) } : {}) as object), lt: dateOnly(to) } } : {}),
      },
      include: { items: true, room: { select: { name: true } }, booking: { select: { id: true, code: true } } },
      orderBy: [{ billDate: "desc" }, { id: "desc" }],
      take: 300,
    });
    return rows.map((b) => this.shape(b));
  }

  async addPayment(claims: JwtClaims, billId: number, amount: number, method?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK") {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER, ROLE.FRONT_DESK]);
    const bill = await this.prisma.fbBill.findUnique({ where: { id: billId }, include: { items: true } });
    if (!bill || bill.deletedAt) throw Object.assign(new Error("Bill not found"), { status: 404 });
    requireResortAccess(claims, bill.resortId);
    const total = round2(bill.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0));
    const paid = round2(Number(bill.paidAmount) + amount);
    if (paid > total + 0.001) throw badRequest(`Total is ${total}; already collected ${Number(bill.paidAmount)}`);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.fbBill.update({
        where: { id: billId },
        data: { paidAmount: paid as never, ...(method ? { method } : {}) },
        include: { items: true },
      });
      if (bill.bookingId) {
        await tx.payment.create({
          data: {
            bookingId: bill.bookingId,
            amount: amount as never,
            method: method ?? "CASH",
            paymentType: "FINAL",
            receivedById: claims.userId,
            note: `F&B ${bill.code}`,
          },
        });
      }
      return u;
    });
    await this.audit.log({
      actorId: claims.userId, resortId: bill.resortId,
      action: "fb.bill.payment", entity: "fbBill", entityId: billId,
      diff: { amount, method },
    });
    return this.shape(updated, total);
  }

  async remove(claims: JwtClaims, billId: number) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    const bill = await this.prisma.fbBill.findUnique({ where: { id: billId } });
    if (!bill || bill.deletedAt) throw Object.assign(new Error("Bill not found"), { status: 404 });
    requireResortAccess(claims, bill.resortId);
    if (bill.bookingId) {
      throw badRequest("Bills charged to a room stay on the booking ledger and cannot be deleted");
    }
    await this.prisma.fbBill.update({ where: { id: billId }, data: { deletedAt: new Date() } });
    await this.audit.log({
      actorId: claims.userId, resortId: bill.resortId,
      action: "fb.bill.delete", entity: "fbBill", entityId: billId,
    });
    return { deleted: true };
  }

  private shape(bill: { id: number; code: string; billDate: Date; guestName: string | null; roomId: number | null; bookingId: number | null; paidAmount: unknown; method: string | null; note: string | null; items: { name: string; qty: number; unitPrice: unknown }[] }, totalArg?: number) {
    const total = totalArg ?? round2(bill.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0));
    const paid = Number(bill.paidAmount);
    return {
      id: bill.id,
      code: bill.code,
      billDate: bill.billDate,
      guestName: bill.guestName,
      roomId: bill.roomId,
      bookingId: bill.bookingId,
      method: bill.method,
      note: bill.note,
      items: bill.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), total: round2(Number(i.unitPrice) * i.qty) })),
      total,
      paid,
      due: round2(Math.max(0, total - paid)),
      status: this.computeStatus(paid, total),
    };
  }

  /** In-house rooms right now — the POS room picker. */
  async inHouse(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const stays = await this.prisma.booking.findMany({
      where: {
        resortId,
        deletedAt: null,
        state: { in: ["CONFIRMED", "CHECKED_IN"] },
        checkIn: { lte: date },
        checkOut: { gt: date },
      },
      include: {
        guest: { select: { fullName: true } },
        items: { where: { itemKind: "ROOM" }, include: { room: { select: { name: true } } } },
      },
      orderBy: { checkIn: "asc" },
    });
    return stays.map((b) => ({
      bookingId: b.id,
      code: b.code,
      guestName: b.guest.fullName,
      rooms: b.items.map((i) => i.room?.name).filter(Boolean),
    }));
  }
}