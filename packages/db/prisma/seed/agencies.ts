/**
 * An agency's own business: its people and what they may do, the wallet it
 * keeps with the platform, the costs it files under its own headings, the tour
 * packages it builds, and the quotations and invoices it sends clients.
 */
import type { PrismaClient } from "../../src";
import { at, between, money, pick, type Rand } from "./util";

export interface AgencyCtx {
  accountName: string;
  ownerId: number;
  staffId?: number;
  /** a guest of a resort this agency has served, for a document to point at */
  guestId?: number;
  /** a booking of this agency's, for the wallet movement it earned */
  bookingId?: number;
  r: Rand;
  /** the agency's standing, which decides how full its books are */
  full: boolean;
}

export async function seedAgency(prisma: PrismaClient, ctx: AgencyCtx) {
  const { ownerId, staffId, guestId, bookingId, r, full, accountName } = ctx;

  // ── what the agency's own staff may do ─────────────────────────────────
  const deskRole = await prisma.agentRole.create({
    data: {
      agencyId: ownerId, name: "Booking desk",
      permissions: ["agent.book", "agent.guests.view", "agent.sales.manage"] as never,
      createdAt: at(-80, 11),
    },
  });
  await prisma.agentRole.create({
    data: {
      agencyId: ownerId, name: "Accounts",
      permissions: ["agent.wallet.view", "agent.expenses.manage", "agent.payroll.manage", "agent.sales.manage"] as never,
      createdAt: at(-75, 11),
    },
  });
  if (staffId) {
    await prisma.user.update({ where: { id: staffId }, data: { agentRoleId: deskRole.id } });
  }

  // ── the wallet, with a movement of every kind ──────────────────────────
  const wallet = await prisma.wallet.create({
    data: { userId: ownerId, balance: 0, active: true, createdAt: at(-120, 11) },
  });
  let balance = 0;
  const moves: [string, number, string][] = full
    ? [
        ["TOPUP", 50000, "Opening top-up, bKash"],
        ["BOOKING_HOLD", -12500, "Held against a group booking"],
        ["COMMISSION", 3750, "Commission on BK-00042"],
        ["PAYOUT", -20000, "Paid out to the agency's bank"],
        ["REFUND", 12500, "Hold released — booking cancelled by the guest"],
        ["ADJUST", -500, "Adjustment: duplicate credit on 12 Aug"],
        ["TOPUP", 25000, "Top-up before the Eid rush"],
      ]
    : [
        ["TOPUP", 8000, "Opening top-up"],
        ["COMMISSION", 1200, "First commission"],
      ];
  for (const [i, [kind, amount, note]] of moves.entries()) {
    balance = money(balance + amount);
    await prisma.walletTxn.create({
      data: {
        walletId: wallet.id, kind: kind as never, amount, balanceAfter: balance, note,
        // the movements a stay caused point back at it
        bookingId: kind === "COMMISSION" || kind === "BOOKING_HOLD" ? bookingId ?? null : null,
        createdAt: at(-90 + i * 12, between(r, 10, 19)),
      },
    });
  }
  await prisma.wallet.update({ where: { id: wallet.id }, data: { balance } });

  // ── the agency's own costs, under headings it invented ─────────────────
  const heads: Record<string, number> = {};
  for (const name of ["Office rent", "Fuel & transport", "Commission paid out", "Marketing", "Old: SIM bills"]) {
    const head = await prisma.expenseHead.create({
      data: { agencyId: ownerId, name, active: !name.startsWith("Old:"), createdAt: at(-100, 10) },
    });
    heads[name] = head.id;
  }
  const headNames = Object.keys(heads).filter((n) => !n.startsWith("Old:"));
  for (let i = 0; i < (full ? 26 : 6); i++) {
    const name = pick(r, headNames);
    await prisma.expense.create({
      data: {
        agencyId: ownerId, headId: heads[name]!, category: name,
        date: at(-between(r, 0, 100), 0),
        details: pick(r, ["Monthly", "Paid by bKash", "Against voucher", "Driver's advance", "Facebook boost"]),
        amount: money(between(r, 500, 30000)),
        clientRef: i < 2 ? `agx-${ownerId}-${i}` : null,
        createdBy: ownerId, createdAt: at(-between(r, 0, 100), 12),
      },
    });
  }

  // ── its own payroll ────────────────────────────────────────────────────
  for (const [i, e] of [
    { name: "Jasim Uddin", designation: "Counter executive", salary: 18000 },
    { name: "Rima Akter", designation: "Accounts", salary: 22000 },
    { name: "Bablu Mia", designation: "Driver", salary: 15000 },
  ].entries()) {
    if (!full && i > 0) break;
    const emp = await prisma.employee.create({
      data: {
        agencyId: ownerId, name: e.name, designation: e.designation, salary: e.salary,
        phone: `0171${String(4000000 + ownerId * 10 + i).slice(-7)}`,
        joinDate: at(-between(r, 100, 700), 0), active: true,
      },
    });
    for (let m = 2; m >= 1; m--) {
      const when = at(-30 * m + 3, 16);
      await prisma.payrollPayment.create({
        data: {
          agencyId: ownerId, employeeId: emp.id, month: when.toISOString().slice(0, 7),
          amount: e.salary, method: pick(r, ["CASH", "BKASH", "BANK"]), paidAt: when,
          note: m === 1 ? "Includes the festival bonus" : null, createdById: ownerId,
        },
      });
    }
  }

  await prisma.counter.createMany({
    data: [
      { agencyId: ownerId, kind: "QUOTATION", nextVal: 4 },
      { agencyId: ownerId, kind: "INVOICE", nextVal: 3 },
    ],
  });

  if (!full) return;

  // ── what a tour is built from: the agency's own tree ───────────────────
  const tree: Record<string, number> = {};
  for (const [parent, children] of [
    ["Transport", ["AC bus", "Micro-bus", "Boat"]],
    ["Stay", ["Resort twin", "Resort family"]],
    ["Food", ["Breakfast", "BBQ dinner"]],
    ["Guide", ["Local guide"]],
  ] as const) {
    const top = await prisma.tourCategory.create({
      data: { agencyId: ownerId, name: parent, sort: Object.keys(tree).length, active: true, createdAt: at(-70, 10) },
    });
    tree[parent] = top.id;
    for (const [i, child] of children.entries()) {
      const leaf = await prisma.tourCategory.create({
        data: { agencyId: ownerId, parentId: top.id, name: child, sort: i, active: true, createdAt: at(-70, 10) },
      });
      tree[child] = leaf.id;
    }
  }

  // ── packages, priced with the cost beside the price ────────────────────
  const pkgs: { id: number; name: string; price: number }[] = [];
  for (const p of [
    {
      name: "Sajek 3D/2N — AC bus", summary: "Dhaka → Khagrachari → Sajek, twin sharing, breakfast and one BBQ night.",
      days: 3, nights: 2, pax: 2,
      lines: [
        { label: "AC bus, Dhaka–Khagrachari return", cat: "AC bus", qty: 2, cost: 2200, price: 2800 },
        { label: "Chander Gari, Khagrachari–Sajek", cat: "Micro-bus", qty: 1, cost: 9000, price: 11000 },
        { label: "Resort twin room, 2 nights", cat: "Resort twin", qty: 2, cost: 4500, price: 6000 },
        { label: "Breakfast × 2 days", cat: "Breakfast", qty: 4, cost: 200, price: 300 },
        { label: "BBQ dinner", cat: "BBQ dinner", qty: 2, cost: 700, price: 950 },
        { label: "Local guide", cat: "Local guide", qty: 1, cost: 1500, price: 2500 },
      ],
    },
    {
      name: "Cox's Bazar 2D/1N — family", summary: "Family room at Inani, beach transfer and breakfast.",
      days: 2, nights: 1, pax: 4,
      lines: [
        { label: "AC bus, Dhaka–Cox's Bazar return", cat: "AC bus", qty: 4, cost: 2400, price: 3000 },
        { label: "Family room, 1 night", cat: "Resort family", qty: 1, cost: 7000, price: 9000 },
        { label: "Breakfast × 4", cat: "Breakfast", qty: 4, cost: 200, price: 300 },
      ],
    },
    {
      name: "Srimangal tea-garden day trip", summary: "Day out from the resort: seven-layer tea, Lawachara, and the Khasia punji.",
      days: 1, nights: 0, pax: 6,
      lines: [
        { label: "Micro-bus for the day", cat: "Micro-bus", qty: 1, cost: 5000, price: 6500 },
        { label: "Guide", cat: "Local guide", qty: 1, cost: 1200, price: 2000 },
      ],
    },
  ]) {
    const pkg = await prisma.tourPackage.create({
      data: {
        agencyId: ownerId, name: p.name, summary: p.summary, days: p.days, nights: p.nights, pax: p.pax,
        active: true, clientRef: `pkg-${ownerId}-${p.nights}${p.days}`, createdById: ownerId, createdAt: at(-60, 11),
        items: {
          create: p.lines.map((l, i) => ({
            categoryId: tree[l.cat] ?? null, label: l.label, qty: l.qty,
            unitCost: l.cost, unitPrice: l.price, sort: i,
          })),
        },
      },
    });
    pkgs.push({ id: pkg.id, name: p.name, price: p.lines.reduce((s, l) => s + l.qty * l.price, 0) });
  }

  // ── quotations and invoices ────────────────────────────────────────────
  const quotation = await prisma.salesDoc.create({
    data: {
      agencyId: ownerId, kind: "QUOTATION", number: "QUO-000001", status: "ACCEPTED",
      clientName: "Bashundhara Group — HR", clientEmail: "hr.outing@bashundhara.example",
      clientPhone: "+8801811000222", clientAddress: "Bashundhara R/A, Dhaka 1229",
      guestId: guestId ?? null, packageId: pkgs[0]!.id,
      issueDate: at(-30, 0), validUntil: at(-10, 0), currency: "BDT",
      discount: 5000, taxRate: 5, amountPaid: 0,
      notes: "Rates hold for 20 people. Rooms are twin sharing unless you tell us otherwise.",
      terms: "50% advance to confirm. Cancellation inside 7 days of travel is non-refundable.",
      sentAt: at(-30, 12), createdById: ownerId, clientRef: `quo-${ownerId}-1`, createdAt: at(-30, 11),
      items: {
        create: [
          { label: "Sajek 3D/2N package × 20 pax", details: "AC bus, twin sharing, breakfast, one BBQ night", qty: 20, unitPrice: 11500, sort: 0 },
          { label: "Extra Chander Gari for luggage", qty: 1, unitPrice: 4000, sort: 1 },
        ],
      },
    },
  });
  await prisma.salesDoc.create({
    data: {
      agencyId: ownerId, kind: "INVOICE", number: "INV-000001", status: "PAID",
      clientName: "Bashundhara Group — HR", clientEmail: "hr.outing@bashundhara.example",
      clientPhone: "+8801811000222", clientAddress: "Bashundhara R/A, Dhaka 1229",
      packageId: pkgs[0]!.id, convertedFromId: quotation.id,
      issueDate: at(-24, 0), currency: "BDT", discount: 5000, taxRate: 5, amountPaid: 239_000,
      notes: "Thank you — balance settled on the day of travel.",
      terms: "Paid in full.", sentAt: at(-24, 10), paidAt: at(-18, 16),
      createdById: ownerId, clientRef: `inv-${ownerId}-1`, createdAt: at(-24, 10),
      items: {
        create: [
          { label: "Sajek 3D/2N package × 20 pax", qty: 20, unitPrice: 11500, sort: 0 },
          { label: "Extra Chander Gari for luggage", qty: 1, unitPrice: 4000, sort: 1 },
        ],
      },
    },
  });
  await prisma.salesDoc.create({
    data: {
      agencyId: ownerId, kind: "QUOTATION", number: "QUO-000002", status: "SENT",
      clientName: "Rahman Family", clientPhone: "+8801911000333",
      packageId: pkgs[1]!.id, issueDate: at(-3, 0), validUntil: at(11, 0),
      currency: "BDT", taxRate: 0, notes: "Family room, sea view if available on the day.",
      sentAt: at(-3, 15), createdById: ownerId, createdAt: at(-3, 15),
      items: { create: [{ label: "Cox's Bazar 2D/1N — family of four", qty: 1, unitPrice: 21000, sort: 0 }] },
    },
  });
  await prisma.salesDoc.create({
    data: {
      agencyId: ownerId, kind: "QUOTATION", number: "QUO-000003", status: "DRAFT",
      clientName: "Walk-in enquiry — tea garden day trip", issueDate: at(0, 0),
      currency: "BDT", createdById: ownerId, createdAt: at(0, 11),
      items: { create: [{ label: "Day trip, 6 pax", qty: 6, unitPrice: 1800, sort: 0 }] },
    },
  });
  await prisma.salesDoc.create({
    data: {
      agencyId: ownerId, kind: "QUOTATION", number: "QUO-000000", status: "EXPIRED",
      clientName: "Chittagong Club outing", clientEmail: "club@example.com",
      issueDate: at(-90, 0), validUntil: at(-60, 0), currency: "BDT",
      notes: `Sent before ${accountName} moved to the Pro plan.`,
      sentAt: at(-90, 12), createdById: ownerId, createdAt: at(-90, 12),
      items: { create: [{ label: "Weekend package × 35 pax", qty: 35, unitPrice: 9500, sort: 0 }] },
    },
  });
}
