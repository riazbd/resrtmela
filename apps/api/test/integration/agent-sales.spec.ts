/**
 * Quotations and invoices.
 *
 * An agency quotes a client, the client says yes, and the quotation becomes an
 * invoice. That is one document in two states, so it is one table: converting
 * has to carry every line across unchanged, and two tables would mean copying
 * between two shapes and getting it wrong on the day it matters.
 *
 * Three properties this file pins down:
 *
 * 1. **A sent document never changes underneath the client.** The lines live
 *    on the document, not on the package they came from, so repricing a
 *    package next month does not rewrite a quote sent last month.
 * 2. **The client reads the quotation in the email itself**, not in an
 *    attachment they have to find, open and trust.
 * 3. **Converting twice does not make two invoices.** A double-click, a
 *    retried request and a replayed offline write all mean one invoice.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeAgentService, makeToursService, makeSalesService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { EmailService } from "../../src/notifications/email.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;

const sales = () => makeSalesService(asPrismaService);
const tours = () => makeToursService(asPrismaService);
const agents = () => makeAgentService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hire(name: string, permissions: string[]) {
  const staff = await platform().createAgentStaff(agency, {
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    phone: `8801${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    password: "password123",
  });
  const role = await agents().createRole(agency, { name: `${name} role`, permissions });
  await agents().assignRole(agency, staff.id, role.id);
  return { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] } as JwtClaims;
}

const QUOTE = {
  kind: "QUOTATION" as const,
  clientName: "Farhana Rahman",
  clientEmail: "farhana@example.com",
  issueDate: "2026-09-09",
  validUntil: "2026-09-23",
  items: [
    { label: "AC bus, Dhaka–Sajek return", qty: 4, unitPrice: 1600 },
    { label: "Cottage, 2 nights", qty: 2, unitPrice: 4500 },
  ],
};

describe("a quotation", () => {
  it("numbers itself, and adds up", async () => {
    const doc = await sales().create(agency, QUOTE);

    const view = await sales().get(agency, doc.id);
    expect(view.number).toBe("QUO-000001");
    expect(view.status).toBe("DRAFT");
    // 4 × 1,600 + 2 × 4,500 = 15,400
    expect(view.totals).toEqual({ subtotal: 15400, discount: 0, tax: 0, total: 15400, paid: 0, due: 15400 });
  });

  it("takes a discount off before the tax, not after", async () => {
    const doc = await sales().create(agency, { ...QUOTE, discount: 400, taxRate: 5 });

    const view = await sales().get(agency, doc.id);
    // (15,400 − 400) = 15,000, +5% = 15,750
    expect(view.totals).toMatchObject({ subtotal: 15400, discount: 400, tax: 750, total: 15750 });
  });

  it("counts up per agency, so one agency's numbering says nothing about another's", async () => {
    await sales().create(agency, QUOTE);
    // the id it was actually given, not the id a fresh auto-increment happens
    // to hand out: what this test is about is the per-agency number, and
    // nothing here should care whether the table was emptied or dropped
    const second = await sales().create(agency, QUOTE);

    const other = await prisma.user.create({
      data: { name: "Other Agency", phone: `8813${Date.now() % 100000000}`, email: `8813${Date.now() % 100000000}@example.com`, role: "AGENT" },
    });
    const theirs = await sales().create(
      { userId: other.id, role: ROLE.AGENT, resortIds: [] },
      { ...QUOTE, clientName: "Their client" },
    );

    expect((await sales().get(agency, second.id)).number).toBe("QUO-000002");
    expect(
      (await sales().get({ userId: other.id, role: ROLE.AGENT, resortIds: [] }, theirs.id)).number,
    ).toBe("QUO-000001");
  });

  it("refuses a document with no lines on it", async () => {
    await expect(sales().create(agency, { ...QUOTE, items: [] })).rejects.toThrow(/at least one line/i);
  });
});

describe("quoting from a package", () => {
  it("copies the package's lines onto the document", async () => {
    const pkg = await tours().createPackage(agency, {
      name: "Sajek 2 nights",
      items: [
        { label: "AC bus", qty: 4, unitCost: 1200, unitPrice: 1600 },
        { label: "Cottage", qty: 2, unitCost: 3000, unitPrice: 4500 },
      ],
    });

    const doc = await sales().create(agency, {
      kind: "QUOTATION",
      clientName: "Farhana Rahman",
      issueDate: "2026-09-09",
      packageId: pkg.id,
    });

    const view = await sales().get(agency, doc.id);
    expect(view.items.map((i) => i.label)).toEqual(["AC bus", "Cottage"]);
    expect(view.totals.total).toBe(15400);
    // the cost stays the agency's business; it is never on the client's copy
    expect(JSON.stringify(view)).not.toContain("unitCost");
  });

  it("does not rewrite a quote already sent when the package is repriced", async () => {
    const pkg = await tours().createPackage(agency, {
      name: "Sajek 2 nights",
      items: [{ label: "AC bus", qty: 4, unitCost: 1200, unitPrice: 1600 }],
    });
    const doc = await sales().create(agency, {
      kind: "QUOTATION",
      clientName: "Farhana Rahman",
      issueDate: "2026-09-09",
      packageId: pkg.id,
    });

    await tours().updatePackage(agency, pkg.id, {
      items: [{ label: "AC bus", qty: 4, unitCost: 1500, unitPrice: 2400 }],
    });

    expect((await sales().get(agency, doc.id)).totals.total).toBe(6400);
  });
});

describe("becoming an invoice", () => {
  it("carries every line across and links the two together", async () => {
    const quote = await sales().create(agency, QUOTE);

    const invoice = await sales().convert(agency, quote.id);

    const inv = await sales().get(agency, invoice.id);
    expect(inv.kind).toBe("INVOICE");
    expect(inv.number).toBe("INV-000001");
    expect(inv.items.map((i) => i.label)).toEqual(QUOTE.items.map((i) => i.label));
    expect(inv.totals.total).toBe(15400);
    expect(inv.convertedFrom).toMatchObject({ id: quote.id, number: "QUO-000001" });
    // the quotation is now answered, and says so
    expect((await sales().get(agency, quote.id)).status).toBe("ACCEPTED");
  });

  it("makes one invoice however many times it is asked", async () => {
    const quote = await sales().create(agency, QUOTE);

    const first = await sales().convert(agency, quote.id);
    const second = await sales().convert(agency, quote.id);

    expect(second.id).toBe(first.id);
    expect(await prisma.salesDoc.count({ where: { kind: "INVOICE" } })).toBe(1);
  });

  it("refuses to convert something that is already an invoice", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });

    await expect(sales().convert(agency, invoice.id)).rejects.toThrow(/already an invoice/i);
  });

  it("lets an agency raise an invoice without a quotation first", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });

    const view = await sales().get(agency, invoice.id);
    expect(view.number).toBe("INV-000001");
    expect(view.convertedFrom).toBeNull();
  });
});

describe("sending it to the client", () => {
  it("puts the quotation in the email itself, not behind an attachment", async () => {
    const email = new EmailService();
    const sent = vi.spyOn(email, "send").mockResolvedValue({ sent: true } as never);
    const doc = await makeSalesService(asPrismaService, email).create(agency, QUOTE);

    await makeSalesService(asPrismaService, email).send(agency, doc.id, {});

    expect(sent).toHaveBeenCalledOnce();
    const [to, subject, html] = sent.mock.calls[0]!;
    expect(to).toBe("farhana@example.com");
    expect(subject).toContain("QUO-000001");
    expect(html).toContain("Farhana Rahman");
    expect(html).toContain("AC bus, Dhaka–Sajek return");
    expect(html).toContain("15,400");
  });

  it("marks it sent, so the agency knows what the client has seen", async () => {
    const email = new EmailService();
    vi.spyOn(email, "send").mockResolvedValue({ sent: true } as never);
    const svc = makeSalesService(asPrismaService, email);
    const doc = await svc.create(agency, QUOTE);

    await svc.send(agency, doc.id, {});

    const view = await svc.get(agency, doc.id);
    expect(view.status).toBe("SENT");
    expect(view.sentAt).not.toBeNull();
  });

  it("sends to an address given on the day, when the client has a new one", async () => {
    const email = new EmailService();
    const sent = vi.spyOn(email, "send").mockResolvedValue({ sent: true } as never);
    const svc = makeSalesService(asPrismaService, email);
    const doc = await svc.create(agency, { ...QUOTE, clientEmail: undefined });

    await svc.send(agency, doc.id, { to: "someone.else@example.com" });

    expect(sent.mock.calls[0]![0]).toBe("someone.else@example.com");
  });

  it("says plainly that it has nowhere to send it", async () => {
    const doc = await sales().create(agency, { ...QUOTE, clientEmail: undefined });

    await expect(sales().send(agency, doc.id, {})).rejects.toThrow(/email/i);
  });
});

describe("money against an invoice", () => {
  it("records part of it, and still says what is due", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });

    await sales().recordPayment(agency, invoice.id, { amount: 5000 });

    const view = await sales().get(agency, invoice.id);
    expect(view.totals).toMatchObject({ total: 15400, paid: 5000, due: 10400 });
    expect(view.status).not.toBe("PAID");
  });

  it("marks it paid when nothing is left", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });

    await sales().recordPayment(agency, invoice.id, { amount: 15400 });

    const view = await sales().get(agency, invoice.id);
    expect(view.status).toBe("PAID");
    expect(view.totals.due).toBe(0);
  });

  it("refuses more money than is owed, which is a typo every time", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });

    await expect(sales().recordPayment(agency, invoice.id, { amount: 20000 })).rejects.toThrow(
      /more than.*due/i,
    );
  });

  it("will not let the lines change once money has been taken against them", async () => {
    const invoice = await sales().create(agency, { ...QUOTE, kind: "INVOICE" });
    await sales().recordPayment(agency, invoice.id, { amount: 5000 });

    await expect(
      sales().update(agency, invoice.id, { items: [{ label: "Something else", qty: 1, unitPrice: 10 }] }),
    ).rejects.toThrow(/paid/i);
  });
});

describe("whose documents these are", () => {
  it("never hands one agency another's quotation", async () => {
    const doc = await sales().create(agency, QUOTE);
    const other = await prisma.user.create({
      data: { name: "Other Agency 3", phone: `8814${Date.now() % 100000000}`, email: `8814${Date.now() % 100000000}@example.com`, role: "AGENT" },
    });

    await expect(
      sales().get({ userId: other.id, role: ROLE.AGENT, resortIds: [] }, doc.id),
    ).rejects.toThrow(/not your/i);
  });

  it("refuses a junior who only books", async () => {
    const junior = await hire("Junior", ["agent.book"]);

    await expect(sales().create(junior, QUOTE)).rejects.toThrow(/agent\.sales\.manage/);
  });

  it("lets the whole agency see what the agency has quoted", async () => {
    await sales().create(agency, QUOTE);
    const seller = await hire("Seller", ["agent.sales.manage"]);

    const list = await sales().list(seller, {});

    expect(list.map((d) => d.number)).toEqual(["QUO-000001"]);
  });
});

describe("replaying the same document twice", () => {
  it("raises one invoice when an offline device sends its write twice", async () => {
    const body = { ...QUOTE, kind: "INVOICE" as const, clientRef: "device-b-3" };

    const first = await sales().create(agency, body);
    const second = await sales().create(agency, body);

    expect(second.id).toBe(first.id);
    expect(await prisma.salesDoc.count({ where: { agencyId: fx.agentId } })).toBe(1);
  });
});
