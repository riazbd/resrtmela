import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@rh/db";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE, type Role, type JwtClaims } from "@rh/shared";
import { requireResortAccess, requireRoles, badRequest } from "../common/rbac";
import { normalizePhone, phoneKey, nightsBetween, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import {
  parseCsv, parseSheetDate, parseMoney, mapSheetStatus, mapSheetSource,
} from "./csv";

interface SheetRow {
  code: string;
  bookingDate: Date | null;
  guestName: string;
  mobile: string;
  nid: string;
  roomName: string;
  checkIn: Date | null;
  checkOut: Date | null;
  roomRate: number;
  sheetRent: number;
  discount: number;
  advance: number;
  paymentStatusRaw: string;
  sourceRaw: string;
  advanceReceiver: string;
  adults: number;
  children: number;
  statusRaw: string;
  remarks: string;
  rowNo: number;
}

export interface ImportRowResult {
  rowNo: number;
  code: string;
  outcome: "imported" | "skipped" | "out_of_service" | "conflict_no_hold";
  detail?: string;
  flags?: string[];
}

export interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  outOfService: number;
  conflictNoHold: number;
  roomsCreated: string[];
  guestsCreated: number;
  paymentsCreated: number;
  rows: ImportRowResult[];
}

const LIVE_STATES = new Set(["PENDING", "CONFIRMED", "CHECKED_IN"]);

@Injectable()
export class ImportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}

  private parseRows(csvText: string): SheetRow[] {
    const table = parseCsv(csvText);
    if (table.length < 2) throw badRequest("CSV needs a header row + at least one data row");
    const header = table[0]!.map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => {
      for (const n of names) {
        const idx = header.indexOf(n);
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const c = {
      code: col("booking id", "code"),
      bookingDate: col("booking date"),
      guestName: col("guest name", "guest"),
      mobile: col("mobile", "phone"),
      nid: col("nid/passport no", "nid", "passport"),
      room: col("room", "room name"),
      checkIn: col("check-in", "checkin", "check in"),
      checkOut: col("check-out", "checkout", "check out"),
      roomRate: col("room rate", "rate"),
      rent: col("rent"),
      discount: col("discount"),
      advance: col("advance"),
      paymentStatus: col("payment status"),
      source: col("booking source", "source"),
      advanceReceiver: col("advance received"),
      adults: col("adults"),
      children: col("children"),
      status: col("status"),
      remarks: col("remarks"),
    };
    if (c.code < 0 || c.guestName < 0 || c.room < 0 || c.checkIn < 0) {
      throw badRequest(
        "Missing required columns (Booking ID / Guest Name / Room / Check-In)",
      );
    }
    const get = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
    const rows: SheetRow[] = [];
    for (let i = 1; i < table.length; i++) {
      const r = table[i]!;
      rows.push({
        rowNo: i + 1,
        code: get(r, c.code),
        bookingDate: parseSheetDate(get(r, c.bookingDate)),
        guestName: get(r, c.guestName),
        mobile: get(r, c.mobile),
        nid: get(r, c.nid),
        roomName: get(r, c.room),
        checkIn: parseSheetDate(get(r, c.checkIn)),
        checkOut: parseSheetDate(get(r, c.checkOut)),
        roomRate: parseMoney(get(r, c.roomRate)),
        sheetRent: parseMoney(get(r, c.rent)),
        discount: parseMoney(get(r, c.discount)),
        advance: parseMoney(get(r, c.advance)),
        paymentStatusRaw: get(r, c.paymentStatus),
        sourceRaw: get(r, c.source),
        advanceReceiver: get(r, c.advanceReceiver),
        adults: Math.max(1, parseMoney(get(r, c.adults)) || 2),
        children: parseMoney(get(r, c.children)),
        statusRaw: get(r, c.status),
        remarks: get(r, c.remarks),
      });
    }
    return rows;
  }

  async import(
    claims: JwtClaims,
    resortId: number,
    csvText: string,
    dryRun: boolean,
  ): Promise<ImportReport> {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    if (csvText.length > 2_000_000) throw badRequest("CSV too large (2MB max)");

    const rows = this.parseRows(csvText);
    const report: ImportReport = {
      dryRun, totalRows: rows.length, imported: 0, skipped: 0,
      outOfService: 0, conflictNoHold: 0, roomsCreated: [], guestsCreated: 0,
      paymentsCreated: 0, rows: [],
    };

    if (dryRun) {
      for (const row of rows) {
        const check = this.validateRow(row);
        if (check) {
          report.rows.push(check);
          report.skipped++;
          continue;
        }
        if (this.isOutOfServiceRow(row)) {
          report.outOfService++;
          report.rows.push({ rowNo: row.rowNo, code: row.code, outcome: "out_of_service" });
          continue;
        }
        report.imported++;
        report.rows.push({ rowNo: row.rowNo, code: row.code, outcome: "imported" });
      }
      return report;
    }

    // room + user caches for the batch
    const roomCache = new Map<string, { id: number; baseRate: number; roomTypeId: number }>();
    const existingRooms = await this.prisma.room.findMany({ where: { resortId } });
    for (const r of existingRooms) roomCache.set(r.name.toLowerCase(), { id: r.id, baseRate: Number(r.baseRate), roomTypeId: r.roomTypeId });
    let defaultRoomTypeId = existingRooms[0]?.roomTypeId ?? null;
    if (!defaultRoomTypeId) {
      const rt = await this.prisma.roomType.create({
        data: { resortId, name: "Standard", maxAdults: 2, maxChildren: 0 },
      });
      defaultRoomTypeId = rt.id;
    }

    for (const row of rows) {
      const skip = this.validateRow(row);
      if (skip) {
        report.rows.push(skip);
        report.skipped++;
        continue;
      }

      // out-of-service placeholder rows â†’ room status, no booking
      if (this.isOutOfServiceRow(row)) {
        let room = roomCache.get(row.roomName.toLowerCase());
        if (!room) {
          const created = await this.prisma.room.create({
            data: {
              resortId,
              roomTypeId: defaultRoomTypeId!,
              name: row.roomName,
              baseRate: (row.roomRate || 0) as never,
              status: "OUT_OF_SERVICE",
            },
          });
          room = { id: created.id, baseRate: Number(created.baseRate), roomTypeId: defaultRoomTypeId! };
          roomCache.set(row.roomName.toLowerCase(), room);
          report.roomsCreated.push(row.roomName);
        } else {
          await this.prisma.room.update({ where: { id: room.id }, data: { status: "OUT_OF_SERVICE" } });
        }
        report.outOfService++;
        report.rows.push({ rowNo: row.rowNo, code: row.code, outcome: "out_of_service", detail: row.roomName });
        continue;
      }

      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // room (auto-create from sheet)
          let room = roomCache.get(row.roomName.toLowerCase());
          let roomCreated = false;
          if (!room) {
            const created = await tx.room.create({
              data: {
                resortId,
                roomTypeId: defaultRoomTypeId!,
                name: row.roomName,
                baseRate: (row.roomRate || 0) as never,
                status: "ACTIVE",
              },
            });
            room = { id: created.id, baseRate: Number(created.baseRate), roomTypeId: defaultRoomTypeId! };
            roomCache.set(row.roomName.toLowerCase(), room);
            roomCreated = true;
          }

          // guest dedupe
          const phone = normalizePhone(row.mobile);
          const key = phone ? phoneKey(phone) : phoneKey("n:" + row.guestName.toLowerCase().trim());
          let guest = await tx.guest.findFirst({ where: { phoneKey: key, resortId } });
          if (!guest) {
            guest = await tx.guest.create({
              data: {
                resortId, phoneKey: key,
                fullName: row.guestName,
                phone: phone || "",
                nidPassportNo: row.nid || null,
              },
            });
          } else if (!guest.fullName || guest.fullName === guest.phone) {
            await tx.guest.update({ where: { id: guest.id }, data: { fullName: row.guestName } });
          }

          const nights = nightsBetween(row.checkIn!, row.checkOut!);
          if (nights <= 0) throw Object.assign(new Error("bad date range"), { status: 400 });
          const unitPrice = row.roomRate || room.baseRate;
          const rent = round2(unitPrice * nights);
          const payable = round2(rent - row.discount);
          const paymentState = row.advance >= payable - 0.01 ? "PAID" : row.advance > 0 ? "PARTIAL" : "UNPAID";
          const state = mapSheetStatus(row.statusRaw);
          const source = mapSheetSource(row.sourceRaw);
          const flags: string[] = [];
          if (row.sheetRent > 0 && Math.abs(row.sheetRent - rent) > 1) {
            flags.push(`rent-adjusted (sheet said ${row.sheetRent})`);
          }

          // link agent when the sheet names one (Advance received col);
          // auto-attach the agent to this resort if they aren't yet
          let agentUserId: number | null = null;
          if (source === "AGENT" && row.advanceReceiver) {
            const name = row.advanceReceiver.toLowerCase();
            const candidates = await tx.user.findMany({
              where: { name: { contains: row.advanceReceiver } },
              include: {
                resorts: { select: { resortId: true, commissionRate: true } },
              },
            });
            const match =
              candidates.find((u) => u.role === "AGENT" && u.name.toLowerCase() === name) ??
              candidates.find((u) => u.role === "AGENT" && u.name.toLowerCase().includes(name)) ??
              candidates[0];
            if (match) {
              agentUserId = match.id;
              if (!match.resorts.some((r) => r.resortId === resortId)) {
                await tx.userResort.create({
                  data: {
                    userId: match.id,
                    resortId,
                    commissionRate: match.resorts[0]?.commissionRate ?? 0,
                  },
                });
              }
            }
          }

          const booking = await tx.booking.create({
            data: {
              code: row.code,
              resortId,
              kind: "ROOM",
              guestId: guest.id,
              createdById: claims.userId,
              agentUserId,
              source,
              checkIn: row.checkIn!,
              checkOut: row.checkOut!,
              adults: row.adults,
              children: row.children,
              discount: row.discount as never,
              remarks: [row.remarks, "imported from sheet"].filter(Boolean).join(" | "),
              state,
              paymentState,
              bookedAt: row.bookingDate ?? new Date(),
            },
          });

          const item = await tx.bookingItem.create({
            data: { bookingId: booking.id, itemKind: "ROOM", roomId: room.id, qty: 1, unitPrice: unitPrice as never },
          });

          // live holds only; on historical overlap keep the booking but drop the hold
          let conflict = false;
          if (LIVE_STATES.has(state)) {
            const wanted: Date[] = [];
            for (let i = 0; i < nights; i++) {
              wanted.push(new Date(row.checkIn!.getTime() + i * 86_400_000));
            }
            try {
              await tx.bookingNight.createMany({
                data: wanted.map((night) => ({ itemId: item.id, roomId: room.id, night })),
              });
            } catch (e) {
              if ((e as { code?: string }).code === "P2002") conflict = true;
              else throw e;
            }
          }

          // advance â†’ ledger
          if (row.advance > 0) {
            const receiver = row.advanceReceiver
              ? await tx.user.findFirst({ where: { name: { contains: row.advanceReceiver } } })
              : null;
            await tx.payment.create({
              data: {
                bookingId: booking.id,
                amount: row.advance as never,
                method: "CASH",
                paymentType: "ADVANCE",
                receivedById: receiver?.id ?? null,
                receivedAt: row.bookingDate ?? new Date(),
                note: row.advanceReceiver ? `received by ${row.advanceReceiver} (sheet)` : "imported",
              },
            });
          }

          return { bookingId: booking.id, resortId, code: row.code, conflict, roomCreated, guestCreated: true };
        });

        if (result.roomCreated) report.roomsCreated.push(row.roomName);
        report.imported++;
        report.paymentsCreated += row.advance > 0 ? 1 : 0;
        if (result.conflict) {
          report.conflictNoHold++;
          report.rows.push({ rowNo: row.rowNo, code: row.code, outcome: "conflict_no_hold", detail: "live overlap â€” booking kept, hold dropped" });
        } else {
          report.rows.push({ rowNo: row.rowNo, code: row.code, outcome: "imported" });
        }
      } catch (e) {
        report.skipped++;
        report.rows.push({
          rowNo: row.rowNo, code: row.code, outcome: "skipped",
          detail: (e as Error).message?.slice(0, 160),
        });
      }
    }

    // advance the BK-counter past imported codes
    let maxCode = 0;
    for (const row of rows) {
      const m = row.code.match(/(\d+)\s*$/);
      if (m) maxCode = Math.max(maxCode, Number(m[1]));
    }
    if (maxCode > 0) {
      await this.prisma.counter.upsert({
        where: { resortId_kind: { resortId, kind: "BOOKING" } },
        create: { resortId, kind: "BOOKING", nextVal: maxCode },
        update: { nextVal: maxCode },
      });
    }

    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "import.bookings",
      entity: "resort",
      entityId: resortId,
      diff: { imported: report.imported, skipped: report.skipped, dryRun },
    });

    return report;
  }

  private isOutOfServiceRow(row: SheetRow): boolean {
    return /out\s*of\s*service/i.test(row.guestName) || /out\s*of\s*service/i.test(row.remarks);
  }

  private validateRow(row: SheetRow): ImportRowResult | null {
    if (!row.code) {
      return { rowNo: row.rowNo, code: "(blank)", outcome: "skipped", detail: "missing Booking ID" };
    }
    if (!row.guestName) {
      return { rowNo: row.rowNo, code: row.code, outcome: "skipped", detail: "missing guest name" };
    }
    if (!row.roomName) {
      return { rowNo: row.rowNo, code: row.code, outcome: "skipped", detail: "missing room" };
    }
    if (!row.checkIn || !row.checkOut) {
      return { rowNo: row.rowNo, code: row.code, outcome: "skipped", detail: "missing/unparsable dates" };
    }
    if (nightsBetween(row.checkIn, row.checkOut) <= 0) {
      return { rowNo: row.rowNo, code: row.code, outcome: "skipped", detail: "check-out before check-in" };
    }
    return null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ R4: expenses + F&B history + grid reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Expense cashbook import (sheet tab 4). Verifies the sheet's own Daily Total column. */
  async importExpenses(claims: JwtClaims, resortId: number, csvText: string) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    const table = parseCsv(csvText);
    if (table.length < 2) throw badRequest("CSV needs a header row + data rows");
    const header = table[0]!.map((h) => h.trim().toLowerCase());
    const cDate = header.indexOf("date");
    const cCat = header.indexOf("expense category");
    const cDetails = header.indexOf("details");
    const cAmount = header.indexOf("amount");
    const cDayTotal = header.indexOf("daily total expense");
    if (cDate < 0 || cCat < 0 || cAmount < 0) {
      throw badRequest("Expected columns: Date, Expense Category, Amount");
    }

    let imported = 0;
    let skipped = 0;
    const byDay = new Map<string, number>();
    const sheetDayTotals = new Map<string, number>();
    const rowsOut: { date: string; category: string; amount: number }[] = [];

    for (const r of table.slice(1)) {
      const dateStr = (r[cDate] ?? "").trim();
      const category = (r[cCat] ?? "").trim();
      const amount = parseMoney(r[cAmount] ?? "");
      if (!dateStr && !category && !amount) continue;
      const date = parseSheetDate(dateStr);
      if (!date || !category || amount <= 0) { skipped++; continue; }
      const key = date.toISOString().slice(0, 10);
      if (cDayTotal >= 0) {
        const dt = parseMoney(r[cDayTotal] ?? "");
        if (dt > 0) sheetDayTotals.set(key, dt);
      }
      const created = await this.prisma.expense.create({
        data: {
          resortId,
          date,
          category,
          details: cDetails >= 0 ? (r[cDetails] ?? "").trim() || null : null,
          amount: amount as never,
          createdBy: claims.userId,
        },
      });
      rowsOut.push({ date: key, category, amount: Number(created.amount) });
      byDay.set(key, round2((byDay.get(key) ?? 0) + amount));
      imported++;
    }

    // verify the sheet's Daily Total column against our computed sums
    const dailyMismatch: { date: string; sheet: number; computed: number }[] = [];
    for (const [date, sheetTotal] of sheetDayTotals) {
      const computed = byDay.get(date) ?? 0;
      if (Math.abs(computed - sheetTotal) >= 1) dailyMismatch.push({ date, sheet: sheetTotal, computed });
    }

    await this.audit.log({
      actorId: claims.userId, resortId,
      action: "import.expenses", entity: "resort", entityId: resortId,
      diff: { imported, skipped },
    });
    return {
      imported,
      skipped,
      total: round2(rowsOut.reduce((s, r) => s + r.amount, 0)),
      byDay: [...byDay.entries()].sort().map(([date, amount]) => ({ date, amount })),
      dailyTotalCheck: { compared: sheetDayTotals.size, mismatches: dailyMismatch },
    };
  }

  /** F&B history import (sheet tab 10) â€” keeps RES-##### codes, computes status. */
  async importFb(
    claims: JwtClaims,
    resortId: number,
    csvText: string,
    roomMap?: Record<string, string>,
  ) {
    requireRoles(claims, [ROLE.SUPER_ADMIN, ROLE.RESORT_ADMIN, ROLE.MANAGER]);
    requireResortAccess(claims, resortId);
    const table = parseCsv(csvText);
    if (table.length < 2) throw badRequest("CSV needs a header row + data rows");
    const header = table[0]!.map((h) => h.trim().toLowerCase());
    const cDate = header.indexOf("date");
    const cCode = header.indexOf("bill no");
    const cGuest = header.indexOf("guest name");
    const cRoom = header.indexOf("room");
    const cItem = header.indexOf("item");
    const cQty = header.indexOf("qty");
    const cUnit = header.indexOf("unit price");
    const cTotal = header.indexOf("total");
    const cPaid = header.indexOf("paid");
    const cStatus = header.indexOf("status");
    if (cCode < 0) throw badRequest("Expected a 'Bill No' column");

    // group rows by bill no
    const groups = new Map<string, string[][]>();
    for (const r of table.slice(1)) {
      const code = (r[cCode] ?? "").trim();
      if (!code) continue;
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code)!.push(r);
    }

    // room resolution via optional name map {"3": "Snow Drop"}
    const roomsByName = new Map<string, { id: number }>();
    for (const r of await this.prisma.room.findMany({ where: { resortId }, select: { id: true, name: true } })) {
      roomsByName.set(r.name.toLowerCase(), { id: r.id });
    }
    const resolveRoom = (rawId: string): number | null => {
      const key = (rawId ?? "").trim();
      if (!key) return null;
      const mapped = roomMap?.[key];
      if (mapped) return roomsByName.get(mapped.toLowerCase())?.id ?? null;
      return null;
    };

    let imported = 0;
    let skipped = 0;
    let maxRes = 0;
    const statusMismatches: { code: string; sheet: string; computed: string }[] = [];
    const out: { code: string; total: number; paid: number; due: number; status: string }[] = [];

    for (const [code, rs] of groups) {
      if (!/^RES-/i.test(code)) { skipped++; continue; }
      const first = rs[0] as string[];
      const date = parseSheetDate((first[cDate] ?? "").trim());
      if (!date) { skipped++; continue; }
      const rawGuest = (first[cGuest] ?? "").trim();
      // the sheet's guest column often holds PAX counts â€” keep chaos out of guestName
      const guestName = rawGuest && !/^[\d.,]+$/.test(rawGuest) ? rawGuest : null;
      const paxNote = rawGuest && /^[\d.,]+$/.test(rawGuest) ? `pax: ${rawGuest}` : null;
      const roomId = resolveRoom(cRoom >= 0 ? (first[cRoom] ?? "") : "");

      const items = rs
        .map((r) => ({
          name: ((cItem >= 0 ? ((r[cItem] as string) ?? "") : "")).trim() || "Item",
          qty: Math.max(1, parseMoney(cQty >= 0 ? ((r[cQty] as string) ?? "1") : "1")),
          unitPrice: parseMoney(cUnit >= 0 ? ((r[cUnit] as string) ?? "0") : "0"),
          sheetTotal: parseMoney(cTotal >= 0 ? ((r[cTotal] as string) ?? "0") : "0"),
        }))
        .filter((i) => i.sheetTotal > 0 || i.unitPrice > 0 || i.name !== "Item");
      // the sheet's Total column is authoritative when present (some rows carry
      // a total without a unit price — e.g. composite meals)
      const totalFromItems = round2(
        items.some((i) => i.sheetTotal > 0)
          ? items.reduce((s, i) => s + (i.sheetTotal > 0 ? i.sheetTotal : i.qty * i.unitPrice), 0)
          : items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
      );
      // the sheet has explicit Total/Paid/Due columns â€” trust the item sum for
      // total (it equals the sheet's Total on single-row bills) and Paid for cash
      const paid = round2(rs.reduce((s, r) => s + parseMoney(cPaid >= 0 ? (r[cPaid] ?? "0") : "0"), 0));
      const computedState = paid >= totalFromItems - 0.01 && paid > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
      const sheetStatus = ((cStatus >= 0 ? (first[cStatus] ?? "") : "") as string).trim().toLowerCase();
      const sheetNormalized = sheetStatus.startsWith("part") ? "PARTIAL" : sheetStatus.startsWith("paid") ? "PAID" : sheetStatus === "" ? null : "OTHER";
      if (sheetNormalized && sheetNormalized !== computedState && sheetNormalized !== "OTHER") {
        statusMismatches.push({ code, sheet: sheetNormalized, computed: computedState });
      }

      const num = code.match(/(\d+)\s*$/);
      if (num) maxRes = Math.max(maxRes, Number(num[1]));

      const created = await this.prisma.fbBill.create({
        data: {
          resortId,
          code,
          billDate: date,
          guestName,
          roomId,
          paidAmount: paid as never,
          method: null,
          note: [paxNote, "imported from sheet"].filter(Boolean).join(" | "),
          createdBy: claims.userId,
          items: {
            create: items.map((i) => ({
              name: i.name,
              qty: i.qty,
              unitPrice: (i.sheetTotal > 0 && i.unitPrice === 0 ? i.sheetTotal / i.qty : i.unitPrice) as never,
            })),
          },
        },
        include: { items: true },
      });
      const total = round2(created.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0));
      const paidNow = Number(created.paidAmount);
      imported++;
      out.push({
        code: created.code, total, paid: paidNow,
        due: round2(Math.max(0, total - paidNow)),
        status: paid >= total - 0.01 && paid > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
      });
    }

    if (maxRes > 0) {
      await this.prisma.counter.upsert({
        where: { resortId_kind: { resortId, kind: "FB" } },
        create: { resortId, kind: "FB", nextVal: maxRes },
        update: { nextVal: maxRes },
      });
    }

    await this.audit.log({
      actorId: claims.userId, resortId,
      action: "import.fb", entity: "resort", entityId: resortId,
      diff: { imported, skipped },
    });
    return { imported, skipped, statusMismatches, bills: out };
  }

  /**
   * Grid reconciliation (sheet tabs 7 & 11 vs computed Day Sheet) â€” the
   * manager-facing drift report that decides trust.
   */
  async reconcileGrids(
    claims: JwtClaims,
    resortId: number,
    sheet7Csv: string,
    sheet11Csv: string,
  ) {
    requireResortAccess(claims, resortId);
    const g7 = parseCsv(sheet7Csv);
    const g11 = parseCsv(sheet11Csv);
    if (g7.length < 2 || g11.length < 2) throw badRequest("Both grid CSVs are required");

    const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const sheetDate = (s: string): string | null => {
      const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
      if (!m) return null;
      return `${m[3]!}-${String((MONTHS[m[2]!.toLowerCase()] ?? 0) + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    };
    const roomNames = (g7[0] ?? []).slice(1, 11).map((s) => s.trim());
    const rows7 = new Map<string, string[]>();
    for (const r of g7.slice(1)) { const d = sheetDate((r[0] as string) ?? ""); if (d) rows7.set(d, r as string[]); }
    const rows11 = new Map<string, string[]>();
    for (const r of g11.slice(1)) { const d = sheetDate((r[0] as string) ?? ""); if (d) rows11.set(d, r as string[]); }

    // cancelled/no-show stays for drift classification
    const allBookings = await this.prisma.booking.findMany({
      where: { resortId, deletedAt: null },
      select: {
        code: true, state: true, checkIn: true, checkOut: true,
        items: { where: { itemKind: "ROOM" }, include: { room: { select: { name: true } } } },
      },
    });
    const codeState = new Map(allBookings.map((b) => [b.code, b.state]));
    const cancelledStays = allBookings
      .filter((b) => b.state === "CANCELLED" || b.state === "NO_SHOW")
      .flatMap((b) =>
        b.items.map((i) => ({ room: i.room?.name ?? "", in: b.checkIn, out: b.checkOut, code: b.code })),
      );
    const coveringCancelled = (room: string, date: string) =>
      cancelledStays.some(
        (c) =>
          c.room === room && c.in && c.out &&
          c.in.toISOString().slice(0, 10) <= date && date < c.out.toISOString().slice(0, 10),
      );

    const dates = [...rows7.keys()].filter((d) => rows11.has(d)).sort();
    if (dates.length === 0) throw badRequest("No overlapping dates found in the grids");
    if (dates.length > 400) throw badRequest("Grid range too large (400 days max)");

    let checked = 0;
    let matched = 0;
    let cancelledExplained = 0;
    const unexplained: { date: string; room: string; kind: string; sheet: string | number; ours: unknown; code?: string }[] = [];

    for (const date of dates) {
      const day = await this.bookings.daySheet(claims, resortId, date);
      const s7 = rows7.get(date)!;
      const s11 = rows11.get(date)!;
      for (let i = 0; i < roomNames.length; i++) {
        const roomName = roomNames[i]!;
        const ours = day.rooms.find((r) => r.name === roomName);
        if (!ours) continue;

        const cell7 = (s7[i + 1] ?? "").trim();
        const m7 = cell7.match(/^(.*)\s*-\s*à§³([\d,.]*)$/);
        const isOosText = /out of service/i.test(cell7);
        const ourDue = ours.cell.mode === "booked" && ours.cell.due != null ? (ours.cell.due as number) : null;

        if (isOosText || ours.cell.mode === "oos") {
          checked++;
          const agree = (isOosText && ours.cell.mode === "oos") || (!isOosText && ours.cell.mode === "oos" && !m7);
          if (agree) matched++; else unexplained.push({ date, room: roomName, kind: "due", sheet: cell7, ours: ours.cell.mode });
        } else if (m7) {
          checked++;
          const sheetDue = m7[2] === "" ? null : Number(m7[2]!.replace(/,/g, ""));
          if (ourDue !== null && sheetDue !== null && Math.abs(ourDue - sheetDue) < 1) matched++;
          else if (sheetDue === null && ourDue === 0) matched++; // "guest - ৳" with no amount + nothing due
          else if (coveringCancelled(roomName, date) || codeState.get((cell7.match(/BK-\d+/) || [])[0]!) === "CANCELLED") cancelledExplained++;
          else if (ours.cell.mode === "available") {
            if (coveringCancelled(roomName, date)) cancelledExplained++;
            else unexplained.push({ date, room: roomName, kind: "due", sheet: cell7, ours: "available" });
          } else {
            unexplained.push({ date, room: roomName, kind: "due", sheet: cell7, ours: ourDue ?? ours.cell.mode, code: (ours.cell.code as string | undefined) });
          }
        } else if (cell7 === "") {
          checked++;
          if (ours.cell.mode !== "booked" || ourDue === null) matched++;
          else if (coveringCancelled(roomName, date)) cancelledExplained++;
          else unexplained.push({ date, room: roomName, kind: "due", sheet: "(empty)", ours: ourDue, code: (ours.cell.code as string | undefined) });
        }

        checked++;
        const sheetRev = Number((s11[i + 1] ?? "0").replace(/,/g, "")) || 0;
        const ourRev = (ours.cell.revenue as number) ?? 0;
        if (Math.abs(ourRev - sheetRev) < 1) matched++;
        else if (coveringCancelled(roomName, date)) cancelledExplained++;
        else unexplained.push({ date, room: roomName, kind: "revenue", sheet: sheetRev, ours: ourRev, code: (ours.cell.code as string | undefined) });
      }
    }

    await this.audit.log({
      actorId: claims.userId, resortId,
      action: "import.reconcile", entity: "resort", entityId: resortId,
      diff: { dates: dates.length, checked, matched, cancelledExplained, unexplained: unexplained.length },
    });

    return {
      datesChecked: dates.length,
      range: { from: dates[0]!, to: dates[dates.length - 1]! },
      checked,
      matched,
      cancelledExplained,
      unexplainedCount: unexplained.length,
      unexplained: unexplained.slice(0, 100),
    };
  }
}
