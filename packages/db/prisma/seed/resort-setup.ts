/**
 * Everything a resort is before anybody stays in it: its roles and staff, the
 * lists it keeps, what it charges tax on, its rooms and rates, the offers it
 * runs, what the kitchen sells, what its guests are told, its people and their
 * pay.
 */
import type { PrismaClient } from "../../src";
import { at, between, day, money, pick, type Rand } from "./util";

const ADMIN_PERMS = [
  "bookings.view", "bookings.create", "bookings.edit", "bookings.cancel", "bookings.walkin", "bookings.delete",
  "payments.view", "payments.create", "expenses.view", "expenses.create", "expenses.delete",
  "rooms.view", "rooms.manage", "rooms.delete", "guests.view",
  "restaurant.view", "restaurant.create", "restaurant.menu", "restaurant.delete",
  "agents.view", "agents.manage", "reports.view", "reports.pl",
  "payroll.view", "payroll.manage", "activities.view", "activities.manage",
  "auditlog.view", "auditlog.delete", "discounts.manage", "users.manage", "roles.manage",
  "settings.manage", "apikeys.manage", "billing.view", "billing.manage",
  "import.run", "export.run", "marketing.send",
];
const MANAGER_PERMS = [
  "bookings.view", "bookings.create", "bookings.edit", "bookings.cancel", "bookings.walkin",
  "payments.view", "payments.create", "expenses.view", "expenses.create",
  "rooms.view", "rooms.manage", "guests.view",
  "restaurant.view", "restaurant.create", "restaurant.menu",
  "agents.view", "agents.manage", "reports.view", "reports.pl",
  "payroll.view", "payroll.manage", "activities.view", "activities.manage",
  "auditlog.view", "discounts.manage",
  "bookings.delete", "expenses.delete", "restaurant.delete",
  "import.run", "export.run", "marketing.send", "users.manage", "settings.manage", "billing.view",
];
const DESK_PERMS = [
  "bookings.view", "bookings.create", "bookings.edit", "bookings.walkin",
  "payments.view", "payments.create", "rooms.view", "guests.view",
  "restaurant.view", "restaurant.create", "activities.view",
];

export interface ResortShape {
  /** room types, and how many rooms of each */
  types: { name: string; maxAdults: number; maxChildren: number; rate: number; count: number; extra?: boolean }[];
  staff: { userId: number; role: "Administrator" | "Manager" | "Front Desk" | "Night Auditor" }[];
  activities: { name: string; category: string; price: number; durationMin: number }[];
  employees: { name: string; designation: string; salary: number }[];
}

export async function setUpResort(prisma: PrismaClient, resortId: number, shape: ResortShape, r: Rand) {
  // ── roles, and who holds them ──────────────────────────────────────────
  const roles: Record<string, number> = {};
  for (const [name, permissions, system] of [
    ["Administrator", ADMIN_PERMS, true],
    ["Manager", MANAGER_PERMS, true],
    ["Front Desk", DESK_PERMS, true],
    // a role the resort invented for itself
    ["Night Auditor", ["bookings.view", "payments.view", "payments.create", "reports.view", "auditlog.view"], false],
  ] as const) {
    const row = await prisma.customRole.create({
      data: { resortId, name, permissions: permissions as never, system, createdAt: at(-200, 10) },
    });
    roles[name] = row.id;
  }
  for (const s of shape.staff) {
    await prisma.userResort.create({
      data: {
        userId: s.userId, resortId, roleId: roles[s.role]!,
        // the per-agent columns nothing prices on any more, kept as they were
        commissionKind: "PERCENT", commissionRate: null,
      },
    });
  }

  // ── the lists this resort keeps ────────────────────────────────────────
  const lists: [string, { code: string; label: string; meta?: unknown; active?: boolean }[]][] = [
    ["PAYMENT_METHOD", [
      { code: "CASH", label: "Cash" },
      { code: "BKASH", label: "bKash", meta: { instructions: "Merchant 01711-000111, send the trxID to the desk" } },
      { code: "NAGAD", label: "Nagad" },
      { code: "CARD", label: "Card" },
      { code: "BANK", label: "Bank transfer" },
      { code: "CHEQUE", label: "Cheque", active: false },
    ]],
    ["BOOKING_SOURCE", [
      { code: "DIRECT", label: "Direct" }, { code: "AGENT", label: "Agent" }, { code: "FACEBOOK", label: "Facebook" },
      { code: "WHATSAPP", label: "WhatsApp" }, { code: "PHONE", label: "Phone" }, { code: "APP", label: "App" },
      { code: "WALK_IN", label: "Walk-in at the gate" },
    ]],
    ["ACTIVITY_CATEGORY", [
      { code: "TOUR", label: "Tour" }, { code: "WATER_SPORTS", label: "Water sports" }, { code: "WELLNESS", label: "Wellness" },
      { code: "DINING", label: "Dining" }, { code: "ENTERTAINMENT", label: "Entertainment" }, { code: "OTHER", label: "Other" },
    ]],
    ["EXPENSE_CATEGORY", [
      { code: "SALARY", label: "Salary & wages" }, { code: "FOOD", label: "Food & kitchen" },
      { code: "UTILITY", label: "Electricity, gas & water" }, { code: "MAINTENANCE", label: "Repairs & maintenance" },
      { code: "TRANSPORT", label: "Transport & fuel" }, { code: "SUPPLIES", label: "Housekeeping supplies" },
      { code: "MARKETING", label: "Marketing" }, { code: "RENT", label: "Rent" },
      { code: "GENERATOR", label: "Generator & diesel" }, { code: "OTHER", label: "Other" },
    ]],
  ];
  for (const [list, values] of lists) {
    await prisma.resortOption.createMany({
      data: values.map((v, i) => ({
        resortId, list, code: v.code, label: v.label, sortOrder: i,
        active: v.active ?? true, meta: (v.meta ?? null) as never,
      })),
    });
  }

  // ── what goes on top of a bill ─────────────────────────────────────────
  await prisma.taxRule.createMany({
    data: [
      { resortId, code: "SERVICE", label: "Service charge", ratePct: 10, appliesTo: "ROOM", inclusive: false, compound: false, sortOrder: 0 },
      { resortId, code: "VAT", label: "VAT", ratePct: 15, appliesTo: "ROOM", inclusive: false, compound: true, sortOrder: 1 },
      { resortId, code: "FB_VAT", label: "VAT on food", ratePct: 5, appliesTo: "FB", inclusive: true, compound: false, sortOrder: 2 },
      { resortId, code: "ACT_VAT", label: "VAT on activities", ratePct: 7.5, appliesTo: "ACTIVITY", inclusive: false, compound: false, sortOrder: 3, active: false },
    ],
  });

  // ── rooms ──────────────────────────────────────────────────────────────
  const rooms: { id: number; baseRate: number; typeIndex: number }[] = [];
  const typeIds: number[] = [];
  let roomNo = 101;
  for (const [i, t] of shape.types.entries()) {
    const type = await prisma.roomType.create({
      data: {
        resortId, name: t.name, maxAdults: t.maxAdults, maxChildren: t.maxChildren,
        extraPersonAllowed: t.extra ?? false, extraPersonRate: t.extra ? 800 : 0, extraPersonMax: t.extra ? 2 : 0,
        amenities: ["Air conditioning", "Hot water", "Balcony", "Wi-Fi", "Breakfast included"] as never,
        active: true,
      },
    });
    typeIds.push(type.id);
    for (let n = 0; n < t.count; n++) {
      const room = await prisma.room.create({
        data: {
          resortId, roomTypeId: type.id, name: String(roomNo++),
          baseRate: t.rate + (n % 3) * 200,
          status: n === t.count - 1 && i === 0 ? "OUT_OF_SERVICE" : "ACTIVE",
          extraPersonAllowed: t.extra ?? false, extraPersonRate: t.extra ? 800 : 0, extraPersonMax: t.extra ? 2 : 0,
        },
      });
      if (room.status === "ACTIVE") rooms.push({ id: room.id, baseRate: Number(room.baseRate), typeIndex: i });
    }
    // seasonal pricing: the Eid fortnight, and the quiet weeks after it
    await prisma.ratePlan.createMany({
      data: [
        { resortId, roomTypeId: type.id, dateFrom: day(-20), dateTo: day(-6), price: money(t.rate * 1.35), active: true },
        { resortId, roomTypeId: type.id, dateFrom: day(3), dateTo: day(24), price: money(t.rate * 0.85), active: true },
        { resortId, roomTypeId: type.id, dateFrom: day(120), dateTo: day(150), price: money(t.rate * 1.5), active: false },
      ],
    });
  }
  // a room taken out of the inventory, with its history left intact
  await prisma.room.create({
    data: {
      resortId, roomTypeId: typeIds[0]!, name: "Old annex 1", baseRate: 2200,
      status: "ACTIVE", deletedAt: at(-40, 12),
    },
  });

  // ── offers the resort runs on its own rooms ────────────────────────────
  await prisma.discountOffer.createMany({
    data: [
      { resortId, scope: "RESORT", name: "Monsoon 10% off", kind: "PERCENT", value: 10, validFrom: at(-30, 0), validTo: at(30, 23), active: true },
      { resortId, scope: "ROOM_TYPE", roomTypeId: typeIds[0]!, name: "Deluxe weekday saver", kind: "FLAT", value: 500, validFrom: at(-10, 0), validTo: at(45, 23), active: true },
      { resortId, scope: "ROOM", roomId: rooms[0]!.id, name: "Road-facing room — quiet-season rate", kind: "PERCENT", value: 15, active: true },
      { resortId, scope: "RESORT", name: "Eid campaign (ended)", kind: "PERCENT", value: 20, validFrom: at(-60, 0), validTo: at(-25, 23), active: false },
    ],
  });

  // ── activities, their weekly shape, and the slots that come from it ────
  const activityIds: number[] = [];
  for (const a of shape.activities) {
    const cat = await prisma.activityCatalog.create({
      data: {
        resortId, name: a.name, category: a.category, basePrice: a.price, durationMin: a.durationMin,
        minPerSlot: 2, maxPerSlot: 12, active: true,
        description: `${a.name} — guided, with transport from the resort gate. Children under six go free.`,
        photos: [`https://cdn.example/${a.name.toLowerCase().replace(/\W+/g, "-")}.jpg`] as never,
      },
    });
    activityIds.push(cat.id);
    for (const weekday of [4, 5, 6]) {
      await prisma.activitySchedule.create({
        data: { catalogId: cat.id, weekday, startTime: "09:00", endTime: "12:00", capacity: 12, active: true },
      });
    }
    await prisma.activitySchedule.create({
      data: { catalogId: cat.id, weekday: 1, startTime: "15:00", endTime: "17:00", capacity: 8, active: false },
    });
    for (let d = -14; d <= 21; d += 7) {
      await prisma.activitySlot.create({
        data: { catalogId: cat.id, startsAt: at(d, 9), endsAt: at(d, 12), capacity: 12, bookedCount: between(r, 0, 6) },
      });
    }
  }

  // ── the kitchen's own price list ───────────────────────────────────────
  await prisma.foodPackage.createMany({
    data: [
      { resortId, name: "Breakfast (per head)", price: 250, items: "Paratha, egg, vegetable, tea", active: true },
      { resortId, name: "Lunch set — fish", price: 480, items: "Rice, rui curry, dal, salad, borhani", active: true },
      { resortId, name: "BBQ dinner (per head)", price: 850, items: "Grilled chicken, naan, salad, soft drink", active: true },
      { resortId, name: "Old winter package", price: 600, items: "Withdrawn in 2025", active: false },
    ],
  });

  // ── what guests are told, in this resort's own words ───────────────────
  await prisma.messageTemplate.createMany({
    data: [
      { resortId, name: "booking_confirmed", body: "{resort}: your booking {code} is confirmed for {checkin} to {checkout}. Tk {due} is payable at the desk. Call us on the way — the road turns left after the tea stall." },
      { resortId, name: "payment_receipt", body: "{resort}: Tk {amount} received against {code} ({method}). Remaining Tk {due}. Thank you." },
    ],
  });

  // ── keys for the resort's own website ──────────────────────────────────
  await prisma.apiKey.createMany({
    data: [
      { resortId, name: "Website booking widget", prefix: `rm_live_${resortId}a1`, keyHash: "seeded-hash-not-a-real-key-1", active: true, lastUsedAt: at(-1, 18), createdAt: at(-90, 10) },
      { resortId, name: "Old WordPress plugin", prefix: `rm_live_${resortId}b2`, keyHash: "seeded-hash-not-a-real-key-2", active: false, lastUsedAt: at(-70, 11), createdAt: at(-180, 10) },
    ],
  });

  // ── the people, and what they were paid ────────────────────────────────
  for (const [i, e] of shape.employees.entries()) {
    const emp = await prisma.employee.create({
      data: {
        resortId, name: e.name, designation: e.designation, salary: e.salary,
        phone: `0171${String(3000000 + resortId * 100 + i).slice(-7)}`,
        joinDate: day(-between(r, 200, 900)), active: i !== shape.employees.length - 1,
      },
    });
    for (let m = 3; m >= 1; m--) {
      const when = at(-30 * m + 2, 17);
      await prisma.payrollPayment.create({
        data: {
          resortId, employeeId: emp.id, month: when.toISOString().slice(0, 7), amount: e.salary,
          method: pick(r, ["CASH", "BKASH", "BANK"]), paidAt: when,
          note: m === 1 ? "Paid with the Eid bonus" : null,
        },
      });
    }
  }

  await prisma.counter.createMany({
    data: [
      { resortId, kind: "BOOKING", nextVal: 1 },
      { resortId, kind: "INVOICE", nextVal: 1 },
    ],
  });

  return { rooms, typeIds, activityIds, roles };
}
