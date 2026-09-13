/**
 * When, who, how much, from whom, and what for — on every panel.
 *
 * With no payment gateway, the only account of a taka's arrival is a person
 * saying so. Recording that person was the first half; reading it back is the
 * half that makes it useful. Each panel answers the same six questions about
 * its own money:
 *
 *   when · who confirmed it · how much · how it arrived · from whom · what for
 *
 * The resort has had such a report — "collectors" — and it was quietly wrong,
 * which is the first thing tested here.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import {
  makeReportsService,
  makeSalesService,
  makePlatformService,
  makePaymentsService,
  makeBookingsService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let manager: JwtClaims;
let agent: JwtClaims;
let superAdmin: JwtClaims;

const reports = () => makeReportsService(asPrismaService);
const sales = () => makeSalesService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);
const payments = () => makePaymentsService(asPrismaService);
const bookings = () => makeBookingsService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  manager = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function aBooking(): Promise<number> {
  const made = await bookings().create(manager, {
    resortId: fx.resortId,
    roomIds: [fx.rooms[0]!.id],
    checkIn: "2026-08-15",
    checkOut: "2026-08-18",
    adults: 2,
    children: 0,
    guest: { fullName: "Test Guest", phone: "8801711111111" },
  } as never);
  return (made as { id: number }).id;
}

/**
 * The bug this report carried: it counted `paymentType: ADVANCE` and nothing
 * else. Every restaurant bill settled to a room posts FINAL, and so does a
 * settlement taken at check-out. So the one report an owner opens to ask where
 * the cash went omitted, silently, everything but the deposits.
 */
describe("the resort's own collections", () => {
  it("counts money taken at check-out, not only deposits", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 3000, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 2000, method: "BKASH", type: "FINAL" });

    const report = await reports().collectors(manager, fx.resortId);

    const mine = report.rows.find((r) => r.userId === fx.managerId);
    expect(mine?.total).toBe(5000);
  });

  it("nets a refund off the total rather than adding it", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 3000, method: "CASH", type: "ADVANCE" });
    await payments().addPayment(manager, id, { amount: 1000, method: "CASH", type: "REFUND" });

    const report = await reports().collectors(manager, fx.resortId);

    const mine = report.rows.find((r) => r.userId === fx.managerId);
    expect(mine?.total).toBe(2000);
  });

  it("answers all six questions on each line", async () => {
    const id = await aBooking();
    await payments().addPayment(manager, id, { amount: 3000, method: "BKASH", type: "ADVANCE" });

    const report = await reports().collectors(manager, fx.resortId);
    const line = report.recent[0];

    expect(line).toMatchObject({ amount: 3000, method: "BKASH", guest: "Test Guest", type: "ADVANCE" });
    expect(line?.receivedBy).toBeTruthy();
    expect(line?.at).toBeTruthy();
    expect(line?.bookingCode).toMatch(/^BK-/);
  });
});

describe("an agency's own collections", () => {
  async function anInvoice(): Promise<number> {
    const doc = await sales().create(agent, {
      kind: "INVOICE",
      clientName: "Walk-in Client",
      issueDate: "2026-09-13",
      items: [{ label: "Tour package", qty: 1, unitPrice: 10000 }],
    } as never);
    return (doc as { id: number }).id;
  }

  it("lists what its staff took, with the client it came from", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4000, method: "CASH" });

    const report = await sales().moneyReceived(agent, {});
    const line = report.recent[0];

    expect(report.recent).toHaveLength(1);
    expect(line).toMatchObject({ amount: 4000, method: "CASH", from: "Walk-in Client" });
    expect(line?.receivedBy).toBeTruthy();
    expect(line?.document).toMatch(/^INV-/);
  });

  it("totals by the person who took it, which is the question an owner asks", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4000, method: "CASH" });
    await sales().recordPayment(agent, id, { amount: 2500, method: "BKASH" });

    const report = await sales().moneyReceived(agent, {});

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ userId: fx.agentId, count: 2, total: 6500 });
  });
});

describe("what the platform collected", () => {
  it("brings the kinds of collection into one list", async () => {
    const sub = await prisma.subscription.create({
      data: { accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", fee: 2500 },
    });
    const due = await prisma.subscriptionDue.create({
      data: {
        subscriptionId: sub.id,
        accountId: fx.tenantId,
        amount: 2500,
        periodStart: new Date("2026-09-01"),
        periodEnd: new Date("2026-10-01"),
        dueDate: new Date("2026-09-01"),
      },
    });
    await platform().payDue(superAdmin, Number(due.id), "BKASH");
    await platform().walletTxn(superAdmin, fx.agentId, "TOPUP", 5000, "cash at the office", undefined, "CASH");

    const report = await platform().moneyReceived(superAdmin, {});

    expect(report.recent.map((r) => r.kind).sort()).toEqual(["SUBSCRIPTION", "WALLET_TOPUP"]);
    expect(report.total).toBe(7500);
  });

  it("says who confirmed each one and how it arrived", async () => {
    await platform().walletTxn(superAdmin, fx.agentId, "TOPUP", 5000, undefined, undefined, "BKASH");

    const report = await platform().moneyReceived(superAdmin, {});
    const line = report.recent[0];

    expect(line).toMatchObject({ amount: 5000, method: "BKASH", kind: "WALLET_TOPUP" });
    expect(line?.receivedBy).toBeTruthy();
    expect(line?.from).toBeTruthy();
  });

  it("is the platform's alone", async () => {
    await expect(platform().moneyReceived(manager, {})).rejects.toThrow();
  });
});
