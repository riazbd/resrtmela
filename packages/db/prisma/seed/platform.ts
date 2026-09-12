/**
 * The platform's own layer: what it sells, what it charges, what its homepage
 * says, and the offers it hands out.
 */
import type { PrismaClient } from "../../src";
import { at } from "./util";

export async function seedPlatform(prisma: PrismaClient) {
  await prisma.platformPlan.createMany({
    data: [
      /**
       * The yearly prices are ten months' fee — "two months free", the shape
       * almost every subscription business states the annual discount in. One
       * plan is deliberately left without a yearly price, because a blank
       * yearly box is a state the screens have to handle: that card shows no
       * yearly option and the toggle skips it.
       */
      {
        name: "STARTER", label: "Starter", monthlyFee: 2500, yearlyFee: 25000, maxRooms: 10, maxResorts: 1, maxStaff: 2,
        trialDays: 14, audience: "RESORT", sortOrder: 1, active: true, highlight: false,
        blurb: "For small resorts getting off spreadsheets",
        features: ["discounts"],
      },
      {
        name: "GROWTH", label: "Growth", monthlyFee: 5000, yearlyFee: 50000, maxRooms: 40, maxResorts: 2, maxStaff: 8,
        trialDays: 14, audience: "RESORT", sortOrder: 2, active: true, highlight: true,
        blurb: "For busy resorts with a restaurant and agents",
        features: ["restaurant", "agents", "discounts", "activities"],
      },
      {
        name: "CHAIN", label: "Chain", monthlyFee: 12000, yearlyFee: 120000, maxRooms: 10000, maxResorts: 10, maxStaff: 60,
        trialDays: 14, audience: "RESORT", sortOrder: 3, active: true, highlight: false,
        blurb: "For owners running more than one property",
        features: ["restaurant", "agents", "discounts", "activities", "bulk_email", "payroll", "imports"],
      },
      {
        // what a retired plan looks like: kept for the rows still on it, off the price list
        name: "PRO", label: "Pro (retired)", monthlyFee: 8000, yearlyFee: null, maxRooms: 100, maxResorts: 4, maxStaff: 20,
        trialDays: 0, audience: "RESORT", sortOrder: 91, active: false, highlight: false,
        blurb: "Replaced by Chain in 2026",
        features: ["restaurant", "agents"],
      },
      {
        // the plan sold by the month only — a real state, and one the pricing
        // toggle and the plan picker both have to cope with
        name: "AGENCY_BASIC", label: "Agency Basic", monthlyFee: 1200, yearlyFee: null, maxRooms: 0, maxResorts: 0, maxStaff: 3,
        trialDays: 14, audience: "AGENCY", sortOrder: 1, active: true, highlight: false,
        blurb: "For a travel agency selling resorts on the platform",
        features: [],
      },
      {
        name: "AGENCY_PRO", label: "Agency Pro", monthlyFee: 3500, yearlyFee: 35000, maxRooms: 0, maxResorts: 0, maxStaff: 15,
        trialDays: 30, audience: "AGENCY", sortOrder: 2, active: true, highlight: true,
        blurb: "Sub-agents, the agency's own client list and quotations",
        features: [],
      },
    ] as never,
  });

  const optionDefaults = {
    PAYMENT_METHOD: [
      { code: "CASH", label: "Cash" }, { code: "BKASH", label: "bKash" }, { code: "NAGAD", label: "Nagad" },
      { code: "CARD", label: "Card" }, { code: "BANK", label: "Bank transfer" },
    ],
    BOOKING_SOURCE: [
      { code: "DIRECT", label: "Direct" }, { code: "AGENT", label: "Agent" }, { code: "FACEBOOK", label: "Facebook" },
      { code: "WHATSAPP", label: "WhatsApp" }, { code: "PHONE", label: "Phone" }, { code: "APP", label: "App" },
    ],
    ACTIVITY_CATEGORY: [
      { code: "TOUR", label: "Tour" }, { code: "WATER_SPORTS", label: "Water sports" }, { code: "WELLNESS", label: "Wellness" },
      { code: "DINING", label: "Dining" }, { code: "ENTERTAINMENT", label: "Entertainment" }, { code: "OTHER", label: "Other" },
    ],
    EXPENSE_CATEGORY: [
      { code: "SALARY", label: "Salary & wages" }, { code: "FOOD", label: "Food & kitchen" },
      { code: "UTILITY", label: "Electricity, gas & water" }, { code: "MAINTENANCE", label: "Repairs & maintenance" },
      { code: "TRANSPORT", label: "Transport & fuel" }, { code: "SUPPLIES", label: "Housekeeping supplies" },
      { code: "MARKETING", label: "Marketing" }, { code: "RENT", label: "Rent" }, { code: "OTHER", label: "Other" },
    ],
  };

  await prisma.platformSetting.createMany({
    data: [
      { key: "platform.name", value: "Resort Mela" },
      { key: "platform.supportEmail", value: "support@resortmela.com" },
      { key: "platform.supportPhone", value: "+8809610000111" },
      {
        key: "platform.paymentInstructions",
        value: "bKash (Merchant) 01711-000111 · or bank transfer to Resort Mela Ltd, City Bank, A/C 1402-345678-001. Send the trxID to support and the pack is released the same day.",
      },
      { key: "billing.graceDays", value: "7" },
      { key: "billing.suspendAfterDays", value: "15" },
      { key: "billing.noticeDays", value: "3" },
      {
        key: "email.creditPacks",
        value: JSON.stringify([
          { credits: 500, price: 500 },
          { credits: 2000, price: 1800 },
          { credits: 10000, price: 7500 },
        ]),
      },
      ...Object.entries(optionDefaults).map(([list, defaults]) => ({
        key: `options.${list}.defaults`,
        value: JSON.stringify(defaults),
      })),
    ],
  });

  await prisma.cmsSetting.createMany({
    data: [
      { key: "hero.badge", value: "The all-in-one software for resorts" },
      { key: "hero.title", value: "Every booking in one place. No room ever sold twice." },
      {
        key: "hero.subtitle",
        value: "Take bookings for walk-in and phone guests in one click, run the restaurant, pay your agents, and see today's money from your phone. In Bangla and English.",
      },
      { key: "hero.cta", value: "Create free account" },
      { key: "stats.1.value", value: "0" },
      { key: "stats.1.label", value: "double bookings possible" },
      { key: "stats.2.value", value: "98.9%" },
      { key: "stats.2.label", value: "match to a manager's own register" },
      { key: "stats.3.value", value: "2" },
      { key: "stats.3.label", value: "languages, on every screen" },
      { key: "stats.4.value", value: "14 days" },
      { key: "stats.4.label", value: "free, no card" },
      { key: "cta.title", value: "Start today — free for 14 days" },
      {
        key: "cta.body",
        value: "Every day you wait is another day of register-keeping. Bring your rooms, your team and your agents, and run the whole resort from one screen.",
      },
      // brand.* is deliberately absent: no row means the built-in mark and name,
      // which is what a fresh platform should look like. Platform → Website CMS
      // is where an owner replaces them.
    ],
  });

  const campaign = await prisma.offer.create({
    data: {
      code: "MELA60", audience: "RESORT", plan: "GROWTH", trialDays: 60, maxUses: 100, uses: 7,
      note: "Facebook campaign, September", createdAt: at(-45, 11),
    },
  });
  const agencyOffer = await prisma.offer.create({
    data: {
      code: "AGENCY90", audience: "AGENCY", plan: "AGENCY_PRO", trialDays: 90, maxUses: 10, uses: 1,
      note: "Agency roadshow, Chattogram", createdAt: at(-30, 15),
    },
  });
  const expired = await prisma.offer.create({
    data: {
      code: "EIDSALE25", audience: "RESORT", plan: "CHAIN", discountPct: 25, maxUses: 50, uses: 3,
      note: "Eid offer — 25% off the first year", expiresAt: at(-6, 23), createdAt: at(-60, 9),
    },
  });

  return { campaign, agencyOffer, expired };
}
