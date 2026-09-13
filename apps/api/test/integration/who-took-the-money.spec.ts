/**
 * Somebody's hand takes the money, and that hand has a name.
 *
 * There is no payment gateway. Every taka on this platform is handed to a
 * person, who then tells the software it arrived — so "who confirmed this"
 * is not bookkeeping decoration, it is the only record that exists.
 *
 * A resort's booking payments have always carried it: `receivedById`, a
 * method, a time, one row per payment. Nowhere else did. This spec is that
 * same standard applied to the two places money actually went unattributed:
 *
 * - **An agency's own invoices.** `recordPayment` moved a single running
 *   total — `amountPaid` — and wrote nothing else. An agency with four staff
 *   taking cash could not say which of them took ৳20,000, or when, or how.
 * - **The platform's collections.** A subscription due went to PAID with the
 *   method written into a free-text note as prose, and no record at all of
 *   which person at the platform said the money had come.
 *
 * The actor was in the audit log in both cases. An audit log is a different
 * thing: it is the platform's trail, not the account holder's receipt, and
 * the person whose money it was cannot read it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makeSalesService, makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agent: JwtClaims;
let superAdmin: JwtClaims;

const sales = () => makeSalesService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [] };
  superAdmin = { userId: fx.managerId, role: ROLE.SUPER_ADMIN, resortIds: [] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** An invoice of 10,000 for the agency's own client. */
async function anInvoice(): Promise<number> {
  const doc = await sales().create(agent, {
    kind: "INVOICE",
    clientName: "Walk-in Client",
    issueDate: "2026-09-13",
    items: [{ label: "Tour package", qty: 1, unitPrice: 10_000 }],
  } as never);
  return (doc as { id: number }).id;
}

describe("an agency taking money for its own invoice", () => {
  it("records the payment as a line, not only as a bigger number", async () => {
    const id = await anInvoice();

    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH" });

    const lines = await prisma.salesPayment.findMany({ where: { salesDocId: id } });
    expect(lines).toHaveLength(1);
    expect(Number(lines[0]!.amount)).toBe(4_000);
  });

  it("names the person who took it", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH" });
    const line = await prisma.salesPayment.findFirstOrThrow({ where: { salesDocId: id } });
    expect(line.receivedById).toBe(fx.agentId);
  });

  it("records how the money arrived, rather than assuming cash", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "BKASH" });
    const line = await prisma.salesPayment.findFirstOrThrow({ where: { salesDocId: id } });
    expect(line.method).toBe("BKASH");
  });

  it("keeps one line per payment, in the order they were taken", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH" });
    await sales().recordPayment(agent, id, { amount: 2_500, method: "BKASH" });

    const lines = await prisma.salesPayment.findMany({
      where: { salesDocId: id },
      orderBy: { receivedAt: "asc" },
    });
    expect(lines.map((l) => [Number(l.amount), l.method])).toEqual([
      [4_000, "CASH"],
      [2_500, "BKASH"],
    ]);
  });

  it("still keeps the running total in step with the lines", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH" });
    await sales().recordPayment(agent, id, { amount: 2_500, method: "BKASH" });

    const doc = await prisma.salesDoc.findUniqueOrThrow({ where: { id } });
    const lines = await prisma.salesPayment.findMany({ where: { salesDocId: id } });
    const summed = lines.reduce((s, l) => s + Number(l.amount), 0);
    expect(Number(doc.amountPaid)).toBe(summed);
  });

  it("shows the ledger to the agency, which is whose receipt it is", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH" });

    const doc = await sales().get(agent, id);

    expect(doc.payments).toHaveLength(1);
    expect(doc.payments[0]).toMatchObject({ amount: 4_000, method: "CASH" });
    expect(doc.payments[0]!.receivedBy).toBeTruthy();
  });

  /**
   * The same guard the booking ledger has. A front desk that loses its
   * connection replays the write, and a replay usually happens because the
   * first attempt arrived and its answer did not.
   */
  it("does not take the same money twice when a write is replayed", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH", clientRef: "device-1" });
    await sales().recordPayment(agent, id, { amount: 4_000, method: "CASH", clientRef: "device-1" });

    const lines = await prisma.salesPayment.findMany({ where: { salesDocId: id } });
    const doc = await prisma.salesDoc.findUniqueOrThrow({ where: { id } });
    expect(lines).toHaveLength(1);
    expect(Number(doc.amountPaid)).toBe(4_000);
  });

  it("settles the invoice when the lines add up to the total", async () => {
    const id = await anInvoice();
    await sales().recordPayment(agent, id, { amount: 10_000, method: "BANK" });
    const doc = await prisma.salesDoc.findUniqueOrThrow({ where: { id } });
    expect(doc.status).toBe("PAID");
  });

  it("still refuses more than is owed", async () => {
    const id = await anInvoice();
    await expect(
      sales().recordPayment(agent, id, { amount: 11_000, method: "CASH" }),
    ).rejects.toThrow(/more than is due/i);
  });
});

/**
 * An invoice part-paid before receipts were itemised has a total and no lines.
 * Inventing lines for it would put a name and a method on money nobody
 * recorded either for, so it keeps the total and says nothing more.
 */
describe("an invoice paid before the ledger existed", () => {
  it("keeps its total and reports no lines rather than inventing them", async () => {
    const id = await anInvoice();
    await prisma.salesDoc.update({ where: { id }, data: { amountPaid: 3_000 as never } });

    const doc = await sales().get(agent, id);

    expect(doc.totals.paid).toBe(3_000);
    expect(doc.payments).toEqual([]);
  });
});

/**
 * The platform's own collections.
 *
 * A subscription due went to PAID with the method written into a free-text
 * note as prose — `paid via bKash` — which also overwrote whatever note was
 * there, and with no record at all of which person at the platform said the
 * money had arrived. "How much came in by bKash last month" was a string
 * search.
 *
 * The tenant is shown who took it, because a receipt names the person who took
 * your money. That the platform also keeps an audit entry is not the same
 * thing: the account holder cannot read the audit log.
 */
describe("the platform collecting what it is owed", () => {
  it("names the person who confirmed a subscription payment", async () => {
    const due = await anOpenDue();
    await platform().payDue(superAdmin, Number(due.id), "BKASH");
    const row = await prisma.subscriptionDue.findUniqueOrThrow({ where: { id: due.id } });
    expect(row.paidById).toBe(fx.managerId);
  });

  it("records how it arrived as a field, not as prose in a note", async () => {
    const due = await anOpenDue();
    await platform().payDue(superAdmin, Number(due.id), "BKASH");
    const row = await prisma.subscriptionDue.findUniqueOrThrow({ where: { id: due.id } });
    expect(row.paidMethod).toBe("BKASH");
  });

  it("leaves the note alone, because it was somebody's note", async () => {
    const due = await anOpenDue();
    await prisma.subscriptionDue.update({ where: { id: due.id }, data: { note: "agreed 10% off" } });
    await platform().payDue(superAdmin, Number(due.id), "BKASH");
    const row = await prisma.subscriptionDue.findUniqueOrThrow({ where: { id: due.id } });
    expect(row.note).toBe("agreed 10% off");
  });

  it("still records the method when none was chosen, rather than inventing cash", async () => {
    const due = await anOpenDue();
    await platform().payDue(superAdmin, Number(due.id));
    const row = await prisma.subscriptionDue.findUniqueOrThrow({ where: { id: due.id } });
    expect(row.paidMethod).toBeNull();
    expect(row.paidById).toBe(fx.managerId);
  });
});

/** A subscription with one unpaid due, which is what the platform collects. */
async function anOpenDue() {
  const sub = await prisma.subscription.create({
    data: { accountId: fx.tenantId, plan: "STARTER", status: "ACTIVE", fee: 2500 },
  });
  return prisma.subscriptionDue.create({
    data: {
      subscriptionId: sub.id,
      accountId: fx.tenantId,
      amount: 2500,
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-10-01"),
      dueDate: new Date("2026-09-01"),
    },
  });
}
