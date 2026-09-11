/**
 * The trading a resort actually does: guests, stays, the money against them,
 * the restaurant, the day's costs, and the trail all of it leaves.
 *
 * Stays are laid down room by room along the calendar, so no room is ever sold
 * twice — the same rule the database enforces — and the past, tonight and the
 * weeks ahead all have something in them, which is what makes the day sheet,
 * the calendar and every report worth opening.
 */
import type { PrismaClient } from "../../src";
import {
  at, between, BD_NAMES, chance, day, FOOD_ITEMS, money, nightsBetween, phoneKeyOf, pick, ymd, type Rand,
} from "./util";

let guestPhoneSeq = 1_000_000;

export interface TradeCtx {
  resortId: number;
  rooms: { id: number; baseRate: number; typeIndex: number }[];
  activityIds: number[];
  staff: { adminId: number; deskId: number };
  agents: { userId: number; name: string }[];
  prefixes: { booking: string; invoice: string; fb: string };
  /** how far back to trade, in days */
  fromDay: number;
  r: Rand;
}

export async function seedTrade(prisma: PrismaClient, ctx: TradeCtx) {
  const { resortId, rooms, activityIds, staff, agents, prefixes, fromDay, r } = ctx;

  // a slot to hang activity lines on, so a booking can carry a trip as well as a room
  const slots = await prisma.activitySlot.findMany({
    where: { catalogId: { in: activityIds } }, orderBy: { startsAt: "asc" }, select: { id: true },
  });

  // ── the register ───────────────────────────────────────────────────────
  const guests: { id: number; name: string }[] = [];
  for (let i = 0; i < 34; i++) {
    const name = BD_NAMES[(i * 7 + resortId * 3) % BD_NAMES.length]!;
    const phone = "880" + String(++guestPhoneSeq).padStart(10, "1");
    const g = await prisma.guest.create({
      data: {
        resortId, fullName: name, phone, phoneKey: phoneKeyOf(phone),
        email: chance(r, 60) ? `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com` : null,
        nidPassportNo: chance(r, 45) ? String(19800000000000 + between(r, 1, 9_999_999)) : null,
        isGuestUser: false, createdAt: at(-between(r, 30, 400), 12),
      },
    });
    guests.push({ id: g.id, name });
  }
  // a walk-in taken without a number: the register still has to hold them
  const walkIn = await prisma.guest.create({
    data: {
      resortId, fullName: "Walk-in guest (gate)", phone: "", phoneKey: phoneKeyOf(`anon-${resortId}`),
      createdAt: at(-3, 20),
    },
  });
  guests.push({ id: walkIn.id, name: walkIn.fullName });

  const methods = ["CASH", "BKASH", "NAGAD", "CARD", "BANK"];
  const sources = ["DIRECT", "FACEBOOK", "WHATSAPP", "PHONE", "APP", "WALK_IN"];
  let bookingNo = 0;
  let invoiceNo = 0;
  const madeBookings: { id: number; roomId: number; guestId: number; checkIn: Date; checkOut: Date; state: string; total: number }[] = [];

  for (const room of rooms) {
    let cursor = fromDay;
    while (cursor < 45) {
      cursor += between(r, 1, 7);
      const nights = between(r, 1, 4);
      const checkIn = day(cursor);
      const checkOut = day(cursor + nights);
      cursor += nights;
      if (cursor >= 50) break;

      const past = cursor <= 0;
      const inHouse = checkIn.getTime() <= day(0).getTime() && checkOut.getTime() > day(0).getTime();
      const byAgent = agents.length > 0 && chance(r, 22);
      const agent = byAgent ? pick(r, agents) : null;

      let state: string;
      if (inHouse) state = "CHECKED_IN";
      else if (past) state = chance(r, 88) ? "CHECKED_OUT" : chance(r, 50) ? "CANCELLED" : "NO_SHOW";
      else state = byAgent ? (chance(r, 55) ? "PENDING" : "CONFIRMED") : chance(r, 78) ? "CONFIRMED" : "PENDING";

      const guest = pick(r, guests);
      const adults = between(r, 1, 3);
      const children = chance(r, 30) ? between(r, 1, 2) : 0;
      const extraPersons = chance(r, 18) ? 1 : 0;
      const rate = money(room.baseRate * (past && cursor > -20 ? 1.15 : 1));
      const discount = chance(r, 22) ? money(rate * nights * 0.1) : 0;

      const rent = money(rate * nights + extraPersons * 800);
      // service charge then VAT on top of it, the way the rules are set up
      const total = money((rent - discount) * 1.1 * 1.15);

      const booking = await prisma.booking.create({
        data: {
          resortId, code: `${prefixes.booking}-${String(++bookingNo).padStart(5, "0")}`,
          kind: "ROOM", guestId: guest.id,
          createdById: byAgent ? agent!.userId : chance(r, 50) ? staff.deskId : staff.adminId,
          agentUserId: agent?.userId ?? null,
          source: byAgent ? "AGENT" : pick(r, sources),
          checkIn, checkOut, adults, children, extraPersons, discount,
          remarks: chance(r, 25) ? pick(r, ["Late arrival, after 10pm", "Honeymoon — flowers in the room", "Needs a cot for the baby", "Company booking, bill to office", "Wants the corner room if free"]) : null,
          state: state as never,
          cancelState: byAgent && state === "PENDING" && chance(r, 20) ? "REQUESTED" : "NONE",
          paymentState: "UNPAID",
          groupTag: chance(r, 8) ? `GRP-${String(between(r, 1, 6)).padStart(3, "0")}` : null,
          bookedAt: at(cursor - nights - between(r, 1, 20), between(r, 8, 21)),
          invoiceNo: state === "CHECKED_OUT" ? `${prefixes.invoice}-${String(++invoiceNo).padStart(5, "0")}` : null,
          invoiceAt: state === "CHECKED_OUT" ? at(cursor, 10) : null,
          createdAt: at(cursor - nights - between(r, 1, 20), between(r, 8, 21)),
          items: {
            create: [
              {
                itemKind: "ROOM", roomId: room.id, qty: 1, unitPrice: rate,
                ...(state === "CANCELLED" || state === "NO_SHOW"
                  ? {}
                  : {
                      nights: {
                        create: Array.from({ length: nights }, (_, n) => ({
                          roomId: room.id, night: day(cursor - nights + n),
                        })),
                      },
                    }),
              },
              ...(extraPersons
                ? [{ itemKind: "EXTRA_PERSON" as const, qty: extraPersons, unitPrice: 800 }]
                : []),
              ...(slots.length && chance(r, 20)
                ? [{
                    itemKind: "ACTIVITY" as const, qty: adults,
                    activitySlotId: pick(r, slots).id,
                    unitPrice: money(between(r, 6, 18) * 100),
                  }]
                : []),
            ],
          },
        },
      });

      // ── what was paid, and when ──
      const payments: { amount: number; type: string; when: Date; note?: string }[] = [];
      if (state === "CHECKED_OUT") {
        payments.push({ amount: money(total * 0.4), type: "ADVANCE", when: at(cursor - nights - 2, 12) });
        payments.push({ amount: money(total * 0.6), type: "FINAL", when: at(cursor, 10), note: "Settled at check-out" });
      } else if (state === "CHECKED_IN") {
        payments.push({ amount: money(total * 0.5), type: "ADVANCE", when: at(cursor - nights, 13) });
      } else if (state === "CONFIRMED" && chance(r, 70)) {
        payments.push({ amount: money(total * 0.3), type: "ADVANCE", when: at(cursor - nights - between(r, 1, 10), 11) });
      } else if (state === "CANCELLED" && chance(r, 50)) {
        payments.push({ amount: money(total * 0.3), type: "ADVANCE", when: at(cursor - nights - 5, 11) });
        payments.push({ amount: money(total * 0.3), type: "REFUND", when: at(cursor - nights - 1, 16), note: "Cancelled inside the free window" });
      }
      for (const [i, p] of payments.entries()) {
        await prisma.payment.create({
          data: {
            bookingId: booking.id, amount: p.amount, method: pick(r, methods),
            paymentType: p.type as never, receivedById: chance(r, 60) ? staff.deskId : staff.adminId,
            receivedAt: p.when, note: p.note ?? null,
            clientRef: i === 0 && chance(r, 30) ? `pay-${booking.id}-${i}` : null,
          },
        });
      }
      const net = payments.reduce((s, p) => s + (p.type === "REFUND" ? -p.amount : p.amount), 0);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentState: net <= 0 ? "UNPAID" : net >= total - 1 ? "PAID" : "PARTIAL" },
      });

      madeBookings.push({ id: booking.id, roomId: room.id, guestId: guest.id, checkIn, checkOut, state, total });
    }
  }

  /**
   * Somebody arriving today, and somebody arriving tomorrow.
   *
   * The calendar fills itself at random, so a demo could open on a day with no
   * arrivals at all — and then the day sheet's Check in button, which is the
   * one the front desk presses most, has nothing to press on.
   */
  const busyToday = new Set(
    (await prisma.bookingNight.findMany({
      where: { night: { in: [day(0), day(1), day(2)] }, room: { resortId } },
      select: { roomId: true },
    })).map((n) => n.roomId),
  );
  const free = rooms.filter((room) => !busyToday.has(room.id)).slice(0, 3);
  for (const [i, room] of free.entries()) {
    const arrivesToday = i < 2;
    const start = arrivesToday ? 0 : 1;
    const nights = 2;
    const guest = pick(r, guests);
    const rate = money(room.baseRate);
    const total = money(rate * nights * 1.1 * 1.15);
    const byAgent = i === 2 && agents.length > 0;
    const booking = await prisma.booking.create({
      data: {
        resortId, code: `${prefixes.booking}-${String(++bookingNo).padStart(5, "0")}`,
        kind: "ROOM", guestId: guest.id, createdById: staff.deskId,
        agentUserId: byAgent ? pick(r, agents).userId : null,
        source: byAgent ? "AGENT" : "PHONE",
        checkIn: day(start), checkOut: day(start + nights), adults: 2, children: i === 0 ? 1 : 0,
        state: byAgent ? "PENDING" : "CONFIRMED", paymentState: "PARTIAL",
        remarks: arrivesToday ? "Arriving this afternoon — keep the key at the desk" : "Arrives tomorrow, early check-in requested",
        bookedAt: at(-between(r, 1, 6), 15), createdAt: at(-between(r, 1, 6), 15),
        items: {
          create: [{
            itemKind: "ROOM", roomId: room.id, qty: 1, unitPrice: rate,
            nights: { create: Array.from({ length: nights }, (_, n) => ({ roomId: room.id, night: day(start + n) })) },
          }],
        },
      },
    });
    await prisma.payment.create({
      data: {
        bookingId: booking.id, amount: money(total * 0.5), method: "BKASH", paymentType: "ADVANCE",
        receivedById: staff.deskId, receivedAt: at(-1, 12), note: "Advance over bKash to hold the room",
      },
    });
    madeBookings.push({ id: booking.id, roomId: room.id, guestId: guest.id, checkIn: day(start), checkOut: day(start + nights), state: "CONFIRMED", total });
  }

  // one booking struck off the books — soft-deleted, never removed, so the
  // money it touched still reconciles
  const struck = madeBookings.find((b) => b.state === "CANCELLED");
  if (struck) {
    await prisma.booking.update({
      where: { id: struck.id },
      data: { deletedAt: at(-1, 11), remarks: "Deleted from the books: entered twice by mistake" },
    });
  }

  await prisma.counter.updateMany({ where: { resortId, kind: "BOOKING" }, data: { nextVal: bookingNo + 1 } });
  await prisma.counter.updateMany({ where: { resortId, kind: "INVOICE" }, data: { nextVal: invoiceNo + 1 } });

  // ── the restaurant ─────────────────────────────────────────────────────
  let fbNo = 0;
  const staying = madeBookings.filter((b) => b.state === "CHECKED_OUT" || b.state === "CHECKED_IN");
  for (let i = 0; i < 30; i++) {
    const onRoom = chance(r, 55) && staying.length > 0;
    const stay = onRoom ? pick(r, staying) : null;
    const lines = Array.from({ length: between(r, 2, 5) }, () => {
      const [name, price] = pick(r, FOOD_ITEMS);
      return { name, qty: between(r, 1, 4), unitPrice: price as number };
    });
    const gross = money(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
    const billDate = stay ? stay.checkIn : day(-between(r, 0, 60));
    const bill = await prisma.fbBill.create({
      data: {
        resortId, code: `${prefixes.fb}-${String(++fbNo).padStart(5, "0")}`, billDate,
        guestName: stay ? null : pick(r, BD_NAMES),
        bookingId: stay?.id ?? null, roomId: stay?.roomId ?? null,
        paidAmount: stay ? 0 : gross, taxAmount: money(gross - gross / 1.05),
        method: stay ? null : pick(r, methods),
        note: stay ? "Charged to the room" : chance(r, 25) ? "Walk-in, paid at the counter" : null,
        createdBy: staff.deskId, createdAt: at(-between(r, 0, 60), between(r, 12, 22)),
        deletedAt: i === 29 ? at(-2, 15) : null,
        items: { create: lines },
      },
    });
    if (stay) {
      await prisma.bookingItem.create({
        data: { bookingId: stay.id, itemKind: "FB", fbBillId: bill.id, qty: 1, unitPrice: gross },
      });
    }
  }

  // ── what the resort spent ──────────────────────────────────────────────
  const expenseKinds: [string, string, number, number][] = [
    ["SALARY", "Salary & wages", 8000, 45000],
    ["FOOD", "Food & kitchen", 1500, 18000],
    ["UTILITY", "Electricity, gas & water", 3000, 26000],
    ["MAINTENANCE", "Repairs & maintenance", 800, 12000],
    ["TRANSPORT", "Transport & fuel", 500, 6000],
    ["SUPPLIES", "Housekeeping supplies", 700, 5000],
    ["MARKETING", "Marketing", 2000, 15000],
    ["GENERATOR", "Generator & diesel", 1200, 9000],
  ];
  for (let i = 0; i < 70; i++) {
    const [, category, lo, hi] = pick(r, expenseKinds);
    await prisma.expense.create({
      data: {
        resortId, date: day(-between(r, 0, 120)), category,
        details: pick(r, ["Paid in cash to the supplier", "Monthly bill", "Advance against next month", "Emergency purchase", "Against invoice #" + between(r, 100, 999)]),
        amount: money(between(r, lo, hi)),
        scope: chance(r, 25) ? "RESTAURANT" : "RESORT",
        createdBy: chance(r, 50) ? staff.adminId : staff.deskId,
        clientRef: i < 3 ? `exp-${resortId}-${i}` : null,
        createdAt: at(-between(r, 0, 120), between(r, 9, 20)),
      },
    });
  }

  /**
   * Today's costs, deliberately.
   *
   * The expenses screen opens on today — a register, not an archive — so a
   * demo whose costs are all in the past opens on an empty page and looks
   * like a feature that does not work.
   */
  for (const [category, amount, scope, details] of [
    ["Food & kitchen", 7400, "RESTAURANT", "Fish and vegetables from the morning market"],
    ["Electricity, gas & water", 12800, "RESORT", "August electricity bill, paid at the bank"],
    ["Housekeeping supplies", 2650, "RESORT", "Soap, detergent, room slippers"],
    ["Transport & fuel", 1900, "RESORT", "Diesel for the pick-up"],
    ["Salary & wages", 14000, "RESORT", "Advance to the night guard"],
  ] as const) {
    await prisma.expense.create({
      data: {
        resortId, date: day(0), category, details, amount, scope,
        createdBy: staff.adminId, createdAt: at(0, between(r, 8, 16)),
      },
    });
  }
  for (const [category, amount, scope] of [
    ["Food & kitchen", 6100, "RESTAURANT"],
    ["Repairs & maintenance", 3300, "RESORT"],
  ] as const) {
    await prisma.expense.create({
      data: { resortId, date: day(-1), category, amount, scope, details: "Yesterday's entry", createdBy: staff.deskId, createdAt: at(-1, 17) },
    });
  }

  // ── the paperwork trail ────────────────────────────────────────────────
  const recent = madeBookings.slice(-6);
  for (const [i, b] of recent.entries()) {
    await prisma.notification.create({
      data: {
        userId: i % 2 ? staff.adminId : staff.deskId, resortId,
        title: `New booking ${b.state === "PENDING" ? "request" : "confirmed"}`,
        body: `${b.checkIn.toISOString().slice(0, 10)} → ${b.checkOut.toISOString().slice(0, 10)}, ${nightsBetween(b.checkIn, b.checkOut)} night(s)`,
        kind: b.state === "PENDING" ? "request" : "booking",
        link: "/bookings", readAt: i < 3 ? at(-1, 9) : null, createdAt: at(-i, between(r, 9, 20)),
      },
    });
  }
  await prisma.notification.create({
    data: {
      userId: staff.adminId, resortId, title: "Subscription invoice raised",
      body: "The month's invoice is on the Billing screen.", kind: "payment", link: "/settings?tab=Subscription",
      createdAt: at(-7, 6),
    },
  });

  for (const [i, b] of recent.entries()) {
    await prisma.notificationJob.create({
      data: {
        channel: i % 3 === 0 ? "EMAIL" : "SMS", toRef: "8801711" + String(200000 + i).slice(-6),
        template: "booking_confirmed", dedupeKey: `seed-${resortId}-${b.id}-confirmed`,
        payload: { code: b.id, checkin: ymd(b.checkIn) } as never, resortId,
        renderedText: `Booking confirmed for ${ymd(b.checkIn)} to ${ymd(b.checkOut)}.`,
        sendAfter: at(-i, 9), sentAt: i < 4 ? at(-i, 9) : null,
        attempts: i < 4 ? 1 : 3,
        lastError: i >= 4 ? "SMS gateway returned 502 (balance exhausted)" : null,
      },
    });
  }

  const actions: [string, string, unknown][] = [
    ["booking.create", "booking", { code: `${prefixes.booking}-00001` }],
    ["booking.checkin", "booking", { from: "CONFIRMED", to: "CHECKED_IN" }],
    ["payment.create", "payment", { amount: 4500, method: "BKASH" }],
    ["room.update", "room", { baseRate: { from: 4200, to: 4500 } }],
    ["settings.update", "resort", { checkInTime: { from: "12:00 PM", to: "01:00 PM" } }],
    ["user.create", "user", { role: "FRONT_DESK" }],
    ["discount.create", "discount_offer", { name: "Monsoon 10% off" }],
    ["expense.create", "expense", { category: "Food & kitchen", amount: 6400 }],
    ["fb.bill.create", "fb_bill", { code: `${prefixes.fb}-00004` }],
    ["agents.open", "resort", { agentsOpen: true }],
  ];
  for (const [i, [action, entity, diff]] of actions.entries()) {
    await prisma.auditLog.create({
      data: {
        actorId: i % 2 ? staff.adminId : staff.deskId, resortId, action, entity,
        entityId: BigInt(between(r, 1, 400)), diff: diff as never,
        ip: Buffer.from([103, 108, 231, 12]), createdAt: at(-i, between(r, 8, 22)),
      },
    });
  }

  // ── an online payment attempt, of each ending ──────────────────────────
  if (madeBookings.length) {
    const paid = madeBookings[0]!;
    const pending = madeBookings[1] ?? paid;
    await prisma.paymentIntent.create({
      data: {
        resortId, bookingId: paid.id, provider: "bkash", providerRef: `bkash-${resortId}-0001`,
        amount: money(paid.total * 0.3), method: "BKASH", status: "paid", trxId: `TRX${between(r, 100000, 999999)}`,
        createdAt: at(-20, 14), paidAt: at(-20, 14),
      },
    });
    await prisma.paymentIntent.create({
      data: {
        resortId, bookingId: pending.id, provider: "nagad", providerRef: `nagad-${resortId}-0002`,
        amount: money(pending.total * 0.25), method: "NAGAD", status: "pending", createdAt: at(-1, 19),
      },
    });
  }

  return { guests, bookings: madeBookings };
}
