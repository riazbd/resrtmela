/**
 * Tenant data export — the other half of suspension.
 *
 * The suspension notice promises that "existing records stay readable and
 * exportable". Until this existed, the second half of that sentence was not
 * true. A platform that can switch a business off and also holds the only copy
 * of its guest register is not selling software, it is holding a hostage; word
 * of that travels faster in this market than any feature does.
 *
 * So export is deliberately:
 *
 * - **available while suspended.** It is a read, and reads stay open. A tenant
 *   who has decided to leave gets their books on the way out.
 * - **the same numbers as the screens.** Money is recomputed with the one
 *   shared function, never read from a column, so an exported total can be
 *   reconciled against the dashboard rather than argued about.
 * - **strictly one resort.** Every query is scoped by resortId, and access is
 *   checked before any of them run.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { requireResortAccess, badRequest } from "../common/rbac";
import { bookingTotals } from "../common/money";
import { toCsv, type CsvValue } from "./csv-writer";
import type { JwtClaims } from "@rh/shared";

export interface Dataset {
  name: string;
  headers: string[];
  rows: CsvValue[][];
}

export interface Archive {
  resort: { id: number; name: string; timezone: string; currency: string };
  exportedAt: string;
  datasets: Record<string, Dataset>;
  counts: Record<string, number>;
}

/** The datasets a resort can take with them. Order is the order of the archive. */
export const DATASETS = [
  "bookings",
  "guests",
  "payments",
  "expenses",
  "restaurant",
  "rooms",
  "staff",
  "activities",
] as const;
export type DatasetName = (typeof DATASETS)[number];

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

@Injectable()
export class ExportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
  ) {}

  /** One dataset as a CSV file body, BOM and all. */
  async csv(claims: JwtClaims, resortId: number, name: string): Promise<string> {
    const set = await this.dataset(claims, resortId, name);
    return toCsv(set.headers, set.rows);
  }

  async dataset(claims: JwtClaims, resortId: number, name: string): Promise<Dataset> {
    await this.authorise(claims, resortId);
    if (!(DATASETS as readonly string[]).includes(name)) {
      throw badRequest(`Unknown export "${name}". Available: ${DATASETS.join(", ")}`);
    }
    return this.build(resortId, name as DatasetName);
  }

  /** Everything, in one document — what "give me my data" actually means. */
  async archive(claims: JwtClaims, resortId: number): Promise<Archive> {
    await this.authorise(claims, resortId);
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { id: true, name: true, timezone: true, currency: true },
    });
    if (!resort) throw badRequest("resort not found");

    const datasets: Record<string, Dataset> = {};
    const counts: Record<string, number> = {};
    for (const name of DATASETS) {
      const set = await this.build(resortId, name);
      datasets[name] = set;
      counts[name] = set.rows.length;
    }
    return { resort, exportedAt: new Date().toISOString(), datasets, counts };
  }

  /**
   * Access first, permission second. Exporting hands over every guest's name,
   * phone and NID in one file, so it sits with the people who can already see
   * all of that — not with everyone who can open the bookings list.
   */
  private async authorise(claims: JwtClaims, resortId: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "export.run");
  }

  private build(resortId: number, name: DatasetName): Promise<Dataset> {
    switch (name) {
      case "bookings": return this.bookings(resortId);
      case "guests": return this.guests(resortId);
      case "payments": return this.payments(resortId);
      case "expenses": return this.expenses(resortId);
      case "restaurant": return this.restaurant(resortId);
      case "rooms": return this.rooms(resortId);
      case "staff": return this.staff(resortId);
      case "activities": return this.activities(resortId);
    }
  }

  private async bookings(resortId: number): Promise<Dataset> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { taxRatePct: true },
    });
    const rows = await this.prisma.booking.findMany({
      where: { resortId, deletedAt: null },
      include: {
        guest: { select: { fullName: true, phone: true } },
        agentUser: { select: { name: true } },
        items: { include: { room: { select: { name: true } } } },
        payments: true,
      },
      orderBy: { id: "asc" },
    });
    return {
      name: "bookings",
      headers: [
        "code", "invoiceNo", "guest", "phone", "checkIn", "checkOut", "nights",
        "adults", "children", "state", "paymentState", "source", "agent", "rooms",
        "rent", "discount", "tax", "total", "paid", "due", "bookedAt", "remarks",
      ],
      rows: rows.map((b) => {
        const money = bookingTotals({ ...b, taxRatePct: resort?.taxRatePct ?? 0 });
        return [
          b.code, b.invoiceNo ?? "", b.guest.fullName, b.guest.phone,
          iso(b.checkIn), iso(b.checkOut), money.nights,
          b.adults, b.children, b.state, money.paymentState, b.source,
          b.agentUser?.name ?? "",
          b.items.filter((i) => i.itemKind === "ROOM").map((i) => i.room?.name ?? "").filter(Boolean).join(" "),
          money.rent, money.discount, money.tax, money.total, money.paid, money.due,
          iso(b.bookedAt), b.remarks ?? "",
        ];
      }),
    };
  }

  private async guests(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.guest.findMany({
      where: { resortId },
      select: {
        fullName: true, phone: true, email: true, nidPassportNo: true, createdAt: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { id: "asc" },
    });
    return {
      name: "guests",
      headers: ["name", "phone", "email", "nidPassport", "bookings", "firstSeen"],
      rows: rows.map((g) => [g.fullName, g.phone, g.email ?? "", g.nidPassportNo ?? "", g._count.bookings, iso(g.createdAt)]),
    };
  }

  private async payments(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.payment.findMany({
      where: { booking: { resortId, deletedAt: null } },
      include: {
        booking: { select: { code: true, guest: { select: { fullName: true } } } },
        receivedBy: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });
    return {
      name: "payments",
      headers: ["receivedAt", "booking", "guest", "type", "method", "amount", "receivedBy", "note"],
      rows: rows.map((p) => [
        iso(p.receivedAt), p.booking.code, p.booking.guest.fullName,
        p.paymentType, p.method, Number(p.amount), p.receivedBy?.name ?? "", p.note ?? "",
      ]),
    };
  }

  private async expenses(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.expense.findMany({ where: { resortId }, orderBy: { id: "asc" } });
    return {
      name: "expenses",
      headers: ["date", "category", "details", "scope", "amount"],
      rows: rows.map((e) => [iso(e.date), e.category, e.details ?? "", e.scope, Number(e.amount)]),
    };
  }

  private async restaurant(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.fbBill.findMany({
      where: { resortId, deletedAt: null },
      include: {
        items: true,
        room: { select: { name: true } },
        booking: { select: { code: true } },
      },
      orderBy: { id: "asc" },
    });
    return {
      name: "restaurant",
      headers: ["code", "date", "guest", "room", "booking", "items", "total", "paid", "method", "note"],
      rows: rows.map((b) => {
        const total = b.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.qty, 0);
        return [
          b.code, iso(b.billDate), b.guestName ?? "", b.room?.name ?? "", b.booking?.code ?? "",
          b.items.map((i) => `${i.name} x${i.qty}`).join("; "),
          total, Number(b.paidAmount), b.method ?? "", b.note ?? "",
        ];
      }),
    };
  }

  private async rooms(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.room.findMany({
      where: { resortId },
      include: { roomType: { select: { name: true, maxAdults: true, maxChildren: true } } },
      orderBy: { id: "asc" },
    });
    return {
      name: "rooms",
      headers: ["name", "type", "maxAdults", "maxChildren", "baseRate", "status"],
      rows: rows.map((r) => [
        r.name, r.roomType?.name ?? "", r.roomType?.maxAdults ?? "", r.roomType?.maxChildren ?? "",
        Number(r.baseRate), r.status,
      ]),
    };
  }

  private async staff(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.userResort.findMany({
      where: { resortId },
      include: { user: { select: { name: true, phone: true, email: true, role: true, status: true } }, role: true },
      orderBy: { id: "asc" },
    });
    return {
      name: "staff",
      headers: ["name", "phone", "email", "role", "customRole", "status", "commission", "commissionKind"],
      rows: rows.map((l) => [
        l.user.name, l.user.phone ?? "", l.user.email ?? "", l.user.role, l.role?.name ?? "",
        l.user.status, l.commissionRate == null ? "" : Number(l.commissionRate), l.commissionKind,
      ]),
    };
  }

  private async activities(resortId: number): Promise<Dataset> {
    const rows = await this.prisma.activityCatalog.findMany({ where: { resortId }, orderBy: { id: "asc" } });
    return {
      name: "activities",
      headers: ["name", "category", "basePrice", "durationMin", "minPerSlot", "maxPerSlot", "active"],
      rows: rows.map((a) => [
        a.name, a.category, Number(a.basePrice), a.durationMin, a.minPerSlot, a.maxPerSlot, a.active,
      ]),
    };
  }
}
