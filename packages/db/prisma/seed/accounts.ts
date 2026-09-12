/**
 * The customers: three resort owners and three travel agencies, in the states
 * the platform actually has to handle — paying, on trial, and stopped for an
 * unpaid bill — plus the people who sign in for each.
 *
 * Everyone's password is `Password123!`.
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../src";
import { at, phone } from "./util";

export type World = Awaited<ReturnType<typeof seedAccounts>>;

export async function seedAccounts(
  prisma: PrismaClient,
  offers: { campaign: { id: number }; agencyOffer: { id: number }; expired: { id: number } },
) {
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const user = (data: Record<string, unknown>) =>
    prisma.user.create({ data: { passwordHash, status: "active", ...data } as never });

  // ── the platform's own team ──────────────────────────────────────────────
  const platformOwner = await user({
    name: "Platform Ops", email: "platform@resortmela.com", phone: phone(1, "88096"), role: "SUPER_ADMIN",
    createdAt: at(-400, 9),
  });

  // ── 1. Sky Eco Group — two resorts, paying, on Chain ─────────────────────
  const skyEco = await prisma.tenant.create({
    data: { name: "Sky Eco Group", slug: "sky-eco", kind: "RESORT_OWNER", status: "active", createdAt: at(-210, 10) },
  });
  const skyEcoResort = await prisma.resort.create({
    data: {
      tenantId: skyEco.id, name: "Sky Eco Resort", location: "Srimangal, Sylhet",
      address: "Bhanugach Road, Srimangal 3210, Moulvibazar", website: "https://skyecoresort.example",
      contactPhone: "+8801711000101", binNumber: "004392817-0201",
      showRatesToAgents: true, showGuestNamesToAgents: true, agentsOpen: true,
      taxRatePct: 15, agentCommissionKind: "PERCENT", agentCommissionRate: 10,
      invoicePrefix: "SER", bookingPrefix: "BK", fbPrefix: "RES", fyStartMonthDay: "07-01",
      checkInTime: "12:00 PM", checkOutTime: "10:00 AM", agentPaymentHours: 48,
      currency: "BDT", locale: "en-IN", timezone: "Asia/Dhaka", status: "active", createdAt: at(-210, 10),
    },
  });
  const skyEcoHill = await prisma.resort.create({
    data: {
      tenantId: skyEco.id, name: "Sky Eco Hilltop", location: "Sajek Valley, Rangamati",
      address: "Ruilui Para, Sajek, Rangamati", contactPhone: "+8801711000102",
      website: "https://skyecohilltop.example", binNumber: "004392817-0202",
      showRatesToAgents: false, showGuestNamesToAgents: false, agentsOpen: true,
      taxRatePct: 15, agentCommissionKind: "FLAT", agentCommissionRate: 700,
      invoicePrefix: "HIL", bookingPrefix: "HB", fbPrefix: "HRS", fyStartMonthDay: "07-01",
      checkInTime: "01:00 PM", checkOutTime: "11:00 AM", agentPaymentHours: 72,
      status: "active", createdAt: at(-150, 10),
    },
  });

  const skyOwner = await user({
    name: "Nurul Amin", email: "owner@skyeco.example", phone: phone(101), role: "RESORT_ADMIN", createdAt: at(-210, 10),
  });
  const skyManager = await user({
    name: "Shahriar Kabir", email: "manager@skyeco.example", phone: phone(102), role: "MANAGER", createdAt: at(-200, 10),
  });
  const skyDesk = await user({
    name: "Nusrat Jahan", email: "desk@skyeco.example", phone: phone(103), role: "FRONT_DESK", createdAt: at(-190, 10),
  });
  // one account left with the placeholders a row gets when it has no real
  // address or number, so the console can be seen saying "not set"
  const skyHousekeeper = await user({
    name: "Rokeya Begum", email: "temp-housekeeping@example.com", phone: phone(104), role: "HOUSEKEEPING", createdAt: at(-180, 10),
  });
  await prisma.user.update({
    where: { id: skyHousekeeper.id },
    data: { email: `user-${skyHousekeeper.id}@placeholder.invalid`, phone: `placeholder-${skyHousekeeper.id}` },
  });
  const hillManager = await user({
    name: "Mizanur Rahman", email: "hilltop@skyeco.example", phone: phone(105), role: "MANAGER", createdAt: at(-150, 10),
  });

  // ── 2. Cox Bay Hospitality — one resort, still inside its free trial ──────
  const coxBay = await prisma.tenant.create({
    data: { name: "Cox Bay Hospitality", slug: "cox-bay", kind: "RESORT_OWNER", status: "active", createdAt: at(-9, 12), offerId: offers.campaign.id },
  });
  const coxResort = await prisma.resort.create({
    data: {
      tenantId: coxBay.id, name: "Cox Bay Beach Resort", location: "Inani Beach, Cox's Bazar",
      address: "Marine Drive, Inani, Ukhiya, Cox's Bazar", contactPhone: "+8801711000201",
      website: "https://coxbay.example", binNumber: "005511234-0101",
      showRatesToAgents: true, showGuestNamesToAgents: false, agentsOpen: true,
      taxRatePct: 15, agentCommissionKind: "PERCENT", agentCommissionRate: 8,
      invoicePrefix: "CBR", bookingPrefix: "CB", fbPrefix: "CFB", fyStartMonthDay: "07-01",
      status: "active", createdAt: at(-9, 12),
    },
  });
  const coxOwner = await user({
    name: "Farhana Akter", email: "owner@coxbay.example", phone: phone(201), role: "RESORT_ADMIN", createdAt: at(-9, 12),
  });
  const coxDesk = await user({
    name: "Imran Hossain", email: "desk@coxbay.example", phone: phone(202), role: "FRONT_DESK", createdAt: at(-8, 12),
  });

  // ── 3. Green Leaf Retreats — stopped for an unpaid bill ──────────────────
  const greenLeaf = await prisma.tenant.create({
    data: {
      name: "Green Leaf Retreats", slug: "green-leaf", kind: "RESORT_OWNER", status: "suspended",
      suspendedReason: "billing", suspendedAt: at(-4, 3), createdAt: at(-300, 10),
    },
  });
  const greenResort = await prisma.resort.create({
    data: {
      tenantId: greenLeaf.id, name: "Green Leaf Eco Cottages", location: "Bandarban Sadar, Bandarban",
      address: "Meghla Tourist Spot Road, Bandarban", contactPhone: "+8801711000301",
      taxRatePct: 15, agentCommissionKind: "PERCENT", agentCommissionRate: 6,
      invoicePrefix: "GLE", bookingPrefix: "GL", fbPrefix: "GFB",
      agentsOpen: false, showRatesToAgents: false,
      status: "suspended", suspendedReason: "billing", suspendedAt: at(-4, 3), createdAt: at(-300, 10),
    },
  });
  const greenOwner = await user({
    name: "Delwar Hossain", email: "owner@greenleaf.example", phone: phone(301), role: "RESORT_ADMIN", createdAt: at(-300, 10),
  });

  // ── the agencies ─────────────────────────────────────────────────────────
  const seaBreeze = await prisma.tenant.create({
    data: { name: "Sea Breeze Travels", slug: "sea-breeze-travels", kind: "AGENCY", status: "active", createdAt: at(-120, 11) },
  });
  const seaOwner = await user({
    name: "Rafiqul Islam", email: "rafiq@seabreeze.example", phone: phone(401), role: "AGENT",
    accountId: seaBreeze.id, createdAt: at(-120, 11),
  });
  const seaStaff = await user({
    name: "Nabila Rahman", email: "nabila@seabreeze.example", phone: phone(402), role: "AGENT",
    accountId: seaBreeze.id, parentAgentId: seaOwner.id, createdAt: at(-80, 11),
  });

  const hillTrack = await prisma.tenant.create({
    data: {
      name: "Hill Track Tours", slug: "hill-track-tours", kind: "AGENCY", status: "pending",
      offerId: offers.agencyOffer.id, createdAt: at(-6, 16),
    },
  });
  const hillOwner = await user({
    name: "Tanvir Hasan", email: "tanvir@hilltrack.example", phone: phone(501), role: "AGENT",
    accountId: hillTrack.id, createdAt: at(-6, 16),
  });

  const padma = await prisma.tenant.create({
    data: {
      name: "Padma Voyages", slug: "padma-voyages", kind: "AGENCY", status: "suspended",
      suspendedReason: "billing", suspendedAt: at(-2, 3), createdAt: at(-160, 14),
    },
  });
  const padmaOwner = await user({
    name: "Saiful Alam", email: "saiful@padmavoyages.example", phone: phone(601), role: "AGENT",
    accountId: padma.id, createdAt: at(-160, 14),
  });

  // ── subscriptions, and the bills behind them ─────────────────────────────
  const sub = (data: Record<string, unknown>) => prisma.subscription.create({ data: data as never });

  // the closed one first, so the live subscription is the newest row — which is
  // the one every screen reads when it asks what plan this account is on
  await sub({
    accountId: skyEco.id, plan: "GROWTH", status: "CANCELLED", fee: 5000,
    startedAt: at(-380, 10), cancelledAt: at(-200, 10), note: "Replaced by the Chain plan",
  });
  /**
   * The chain pays by the year — a customer on the annual rhythm, so every
   * screen that shows a fee has one of each to draw: ৳120,000 a year beside
   * ৳5,000 a month, an MRR that has to divide one of them by twelve, and a
   * renewal date a year out rather than a month.
   */
  const skySub = await sub({
    accountId: skyEco.id, plan: "CHAIN", status: "ACTIVE", billingCycle: "YEARLY", fee: 120000,
    startedAt: at(-200, 10), renewsAt: at(165, 10), note: "Moved up from Growth when Hilltop opened, and took the year",
  });
  const coxSub = await sub({
    accountId: coxBay.id, plan: "GROWTH", status: "TRIAL", fee: 5000,
    startedAt: at(-9, 12), trialEndsAt: at(51, 12), renewsAt: at(51, 12),
    pendingPlan: "STARTER", note: "Asked to move to Starter at renewal",
  });
  const greenSub = await sub({
    accountId: greenLeaf.id, plan: "STARTER", status: "PAST_DUE", fee: 2500,
    startedAt: at(-300, 10), renewsAt: at(-20, 10),
  });
  /** An agency that has asked to come off the year and back onto months. */
  const seaSub = await sub({
    accountId: seaBreeze.id, plan: "AGENCY_PRO", status: "ACTIVE", billingCycle: "YEARLY", fee: 35000,
    startedAt: at(-120, 11), renewsAt: at(245, 11),
    pendingCycle: "MONTHLY", note: "Going back to monthly at renewal",
  });
  const hillSub = await sub({
    accountId: hillTrack.id, plan: "AGENCY_PRO", status: "TRIAL", fee: 3500,
    startedAt: at(-6, 16), trialEndsAt: at(84, 16), renewsAt: at(84, 16), note: "90 days, from the Chattogram roadshow",
  });
  const padmaSub = await sub({
    accountId: padma.id, plan: "AGENCY_BASIC", status: "PAST_DUE", fee: 1200,
    startedAt: at(-160, 14), renewsAt: at(-25, 14),
  });

  const due = (data: Record<string, unknown>) => prisma.subscriptionDue.create({ data: data as never });
  /**
   * Sky Eco pays by the year, so its bills are a year apart and a year's size.
   * Monthly-sized rows against a yearly subscription would put ৳12,000 next to
   * a ৳120,000 fee on the owner's own screen and quietly teach every reader
   * that the two numbers have nothing to do with each other.
   */
  for (let i = 2; i >= 1; i--) {
    await due({
      subscriptionId: skySub.id, accountId: skyEco.id, amount: 120000,
      periodStart: at(-365 * i, 10), periodEnd: at(-365 * (i - 1), 10), dueDate: at(-365 * i + 7, 10),
      status: "PAID", paidAt: at(-365 * i + 3, 15),
    });
  }
  await due({
    subscriptionId: skySub.id, accountId: skyEco.id, amount: 120000,
    periodStart: at(0, 10), periodEnd: at(365, 10), dueDate: at(7, 10), status: "DUE",
  });
  // the year before it moved onto the yearly rhythm, still billed by the month
  await due({
    subscriptionId: skySub.id, accountId: skyEco.id, amount: 12000,
    periodStart: at(-800, 10), periodEnd: at(-770, 10), dueDate: at(-793, 10),
    status: "WAIVED", note: "Waived: the calendar was down for three days that month",
  });
  for (let i = 3; i >= 2; i--) {
    await due({
      subscriptionId: greenSub.id, accountId: greenLeaf.id, amount: 2500,
      periodStart: at(-30 * i, 10), periodEnd: at(-30 * (i - 1), 10), dueDate: at(-30 * i + 7, 10),
      status: "PAID", paidAt: at(-30 * i + 5, 12),
    });
  }
  await due({
    subscriptionId: greenSub.id, accountId: greenLeaf.id, amount: 2500,
    periodStart: at(-20, 10), periodEnd: at(10, 10), dueDate: at(-13, 10), status: "OVERDUE",
    note: "Two reminders sent; account suspended on the 15th day",
  });
  // Sea Breeze also pays by the year — and has asked to come back to months
  await due({
    subscriptionId: seaSub.id, accountId: seaBreeze.id, amount: 35000,
    periodStart: at(-485, 11), periodEnd: at(-120, 11), dueDate: at(-478, 11),
    status: "PAID", paidAt: at(-476, 18),
  });
  await due({
    subscriptionId: seaSub.id, accountId: seaBreeze.id, amount: 35000,
    periodStart: at(-120, 11), periodEnd: at(245, 11), dueDate: at(-113, 11),
    status: "PAID", paidAt: at(-111, 18),
  });
  await due({
    subscriptionId: padmaSub.id, accountId: padma.id, amount: 1200,
    periodStart: at(-25, 14), periodEnd: at(5, 14), dueDate: at(-18, 14), status: "OVERDUE",
  });

  // ── a resort's terms with one agency: a deal, and a door closed ──────────
  await prisma.resortAgency.create({
    data: { resortId: skyEcoResort.id, accountId: seaBreeze.id, blocked: false, commissionKind: "PERCENT", commissionRate: 12 },
  });
  await prisma.resortAgency.create({
    data: { resortId: coxResort.id, accountId: padma.id, blocked: true },
  });

  // ── two password resets: one waiting to be used, one already spent ───────
  await prisma.passwordReset.create({
    data: {
      userId: coxOwner.id, tokenHash: createHash("sha256").update(randomBytes(16).toString("hex")).digest("hex"),
      expiresAt: at(0, 23), createdAt: at(0, 9),
    },
  });
  await prisma.passwordReset.create({
    data: {
      userId: skyManager.id, tokenHash: createHash("sha256").update(randomBytes(16).toString("hex")).digest("hex"),
      expiresAt: at(-11, 9), usedAt: at(-12, 10), createdAt: at(-12, 9),
    },
  });

  return {
    platformOwner,
    owners: { skyEco, coxBay, greenLeaf },
    agencies: {
      seaBreeze: { account: seaBreeze, owner: seaOwner, staff: seaStaff },
      hillTrack: { account: hillTrack, owner: hillOwner },
      padma: { account: padma, owner: padmaOwner },
    },
    resorts: {
      skyEco: { resort: skyEcoResort, admin: skyOwner, manager: skyManager, desk: skyDesk, housekeeping: skyHousekeeper },
      hilltop: { resort: skyEcoHill, admin: skyOwner, manager: hillManager },
      cox: { resort: coxResort, admin: coxOwner, desk: coxDesk },
      green: { resort: greenResort, admin: greenOwner },
    },
    subs: { skySub, coxSub, greenSub, seaSub, hillSub, padmaSub },
  };
}
