/**
 * Quotations and invoices.
 *
 * An agency quotes a client, the client says yes, and the quotation becomes an
 * invoice. That is one document in two states, which is why it is one table:
 * converting has to carry every line across unchanged, and two tables would
 * mean copying between two shapes and getting it wrong on the day it matters.
 *
 * The lines are copied onto the document rather than referenced from the tour
 * package they came from. A package repriced next month must not rewrite a
 * quote sent last month — a client holding a number the system no longer
 * agrees with is how an agency loses an argument it should win.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest, forbid, notFound } from "../common/rbac";
import { dateOnly, round2 } from "../common/dates";
import { AuditService } from "../common/audit.service";
import { EmailService } from "../notifications/email.service";
import { AgencyContextService } from "./agency-context.service";
import { renderSalesDoc, subjectFor, type RenderDoc } from "./sales-render";
import { reachableEmail, reachablePhone } from "../common/contact";
import type { JwtClaims } from "@rh/shared";

const SALES = "agent.sales.manage";

export type DocKind = "QUOTATION" | "INVOICE";

export interface DocLineInput {
  label: string;
  details?: string | null;
  qty?: number;
  unitPrice?: number;
}

export interface DocInput {
  kind: DocKind;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  guestId?: number | null;
  packageId?: number | null;
  issueDate: string;
  validUntil?: string | null;
  currency?: string;
  discount?: number;
  taxRate?: number;
  notes?: string | null;
  terms?: string | null;
  items?: DocLineInput[];
  clientRef?: string;
}

/**
 * What a document adds up to.
 *
 * The discount comes off before the tax, because that is what a discount is —
 * tax is owed on what the client actually pays, not on a price nobody was
 * charged. Derived on every read rather than stored: a stored total and a
 * stored line list are two sources of truth, and one of them goes stale.
 */
export function docTotals(
  items: { qty: unknown; unitPrice: unknown }[],
  discount: number,
  taxRate: number,
  paid: number,
) {
  const subtotal = round2(items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0));
  const taxable = Math.max(0, round2(subtotal - discount));
  const tax = round2((taxable * taxRate) / 100);
  const total = round2(taxable + tax);
  return {
    subtotal,
    discount: round2(discount),
    tax,
    total,
    paid: round2(paid),
    due: round2(total - paid),
  };
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyContextService) private readonly agency: AgencyContextService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  // ─────────────────────────── reading ───────────────────────────

  async list(claims: JwtClaims, query: { kind?: DocKind; status?: string; q?: string; take?: number }) {
    const ctx = await this.agency.require(claims, SALES);
    const search = query.q?.trim();
    const rows = await this.prisma.salesDoc.findMany({
      where: {
        agencyId: ctx.agencyId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(search
          ? { OR: [{ number: { contains: search } }, { clientName: { contains: search } }] }
          : {}),
      },
      include: { items: { select: { qty: true, unitPrice: true } } },
      orderBy: { id: "desc" },
      take: Math.min(query.take ?? 100, 300),
    });
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      number: d.number,
      status: d.status,
      clientName: d.clientName,
      issueDate: d.issueDate.toISOString().slice(0, 10),
      validUntil: d.validUntil ? d.validUntil.toISOString().slice(0, 10) : null,
      sentAt: d.sentAt,
      totals: docTotals(d.items, Number(d.discount), Number(d.taxRate), Number(d.amountPaid)),
    }));
  }

  async get(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    return {
      id: doc.id,
      kind: doc.kind,
      number: doc.number,
      status: doc.status,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientPhone: doc.clientPhone,
      clientAddress: doc.clientAddress,
      guestId: doc.guestId,
      packageId: doc.packageId,
      issueDate: doc.issueDate.toISOString().slice(0, 10),
      validUntil: doc.validUntil ? doc.validUntil.toISOString().slice(0, 10) : null,
      currency: doc.currency,
      taxRate: Number(doc.taxRate),
      notes: doc.notes,
      terms: doc.terms,
      sentAt: doc.sentAt,
      paidAt: doc.paidAt,
      items: doc.items.map((i) => ({
        id: i.id,
        label: i.label,
        details: i.details,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        amount: round2(Number(i.qty) * Number(i.unitPrice)),
      })),
      convertedFrom: doc.convertedFrom
        ? { id: doc.convertedFrom.id, number: doc.convertedFrom.number }
        : null,
      convertedTo: doc.convertedTo ? { id: doc.convertedTo.id, number: doc.convertedTo.number } : null,
      totals: docTotals(doc.items, Number(doc.discount), Number(doc.taxRate), Number(doc.amountPaid)),
    };
  }

  /** The document, or a refusal — never another agency's. */
  private async own(agencyId: number, id: number) {
    const doc = await this.prisma.salesDoc.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ sort: "asc" }, { id: "asc" }] },
        convertedFrom: { select: { id: true, number: true } },
        convertedTo: { select: { id: true, number: true } },
      },
    });
    if (!doc) throw notFound("Document not found");
    if (doc.agencyId !== agencyId) throw forbid("Not your document");
    return doc;
  }

  // ─────────────────────────── writing ───────────────────────────

  async create(claims: JwtClaims, input: DocInput) {
    const ctx = await this.agency.require(claims, SALES);

    if (input.clientRef) {
      const seen = await this.prisma.salesDoc.findUnique({
        where: { agencyId_clientRef: { agencyId: ctx.agencyId, clientRef: input.clientRef } },
        select: { id: true, number: true },
      });
      if (seen) return seen;
    }

    const clientName = input.clientName?.trim();
    if (!clientName) throw badRequest("The document needs a client");
    const items = await this.linesFor(ctx.agencyId, input);
    if (items.length === 0) throw badRequest("A document needs at least one line");

    const number = await this.nextNumber(ctx.agencyId, input.kind);
    const doc = await this.prisma.salesDoc.create({
      data: {
        agencyId: ctx.agencyId,
        kind: input.kind,
        number,
        clientName,
        clientEmail: input.clientEmail ?? null,
        clientPhone: input.clientPhone ?? null,
        clientAddress: input.clientAddress ?? null,
        guestId: input.guestId ?? null,
        packageId: input.packageId ?? null,
        issueDate: dateOnly(input.issueDate),
        validUntil: input.validUntil ? dateOnly(input.validUntil) : null,
        currency: input.currency ?? "BDT",
        discount: (input.discount ?? 0) as never,
        taxRate: (input.taxRate ?? 0) as never,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        createdById: claims.userId,
        clientRef: input.clientRef ?? null,
        items: { create: items },
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: `agent.${input.kind.toLowerCase()}.create`,
      entity: "sales_doc",
      entityId: doc.id,
      diff: { number, client: clientName },
    });
    return { id: doc.id, number: doc.number };
  }

  async update(claims: JwtClaims, id: number, input: Partial<DocInput>) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    if (doc.status === "VOID") throw badRequest("This document has been voided");

    // once a client has paid against these lines, the lines are a record of
    // what was agreed; changing them would rewrite what the money was for
    if (input.items && Number(doc.amountPaid) > 0) {
      throw badRequest("Money has been paid against this document — its lines can no longer change");
    }
    const items = input.items ? await this.linesFor(ctx.agencyId, { ...input, items: input.items }) : null;
    if (items && items.length === 0) throw badRequest("A document needs at least one line");

    await this.prisma.$transaction(async (tx) => {
      await tx.salesDoc.update({
        where: { id },
        data: {
          ...(input.clientName?.trim() ? { clientName: input.clientName.trim() } : {}),
          ...(input.clientEmail !== undefined ? { clientEmail: input.clientEmail ?? null } : {}),
          ...(input.clientPhone !== undefined ? { clientPhone: input.clientPhone ?? null } : {}),
          ...(input.clientAddress !== undefined ? { clientAddress: input.clientAddress ?? null } : {}),
          ...(input.guestId !== undefined ? { guestId: input.guestId ?? null } : {}),
          ...(input.issueDate ? { issueDate: dateOnly(input.issueDate) } : {}),
          ...(input.validUntil !== undefined
            ? { validUntil: input.validUntil ? dateOnly(input.validUntil) : null }
            : {}),
          ...(input.discount != null ? { discount: input.discount as never } : {}),
          ...(input.taxRate != null ? { taxRate: input.taxRate as never } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          ...(input.terms !== undefined ? { terms: input.terms ?? null } : {}),
        },
      });
      if (items) {
        await tx.salesDocItem.deleteMany({ where: { docId: id } });
        await tx.salesDocItem.createMany({ data: items.map((i) => ({ ...i, docId: id })) });
      }
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.salesdoc.update",
      entity: "sales_doc",
      entityId: id,
      diff: { number: doc.number },
    });
    return { id };
  }

  /** Only a draft can be deleted; anything a client has seen is voided instead. */
  async remove(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    if (doc.status !== "DRAFT") {
      await this.prisma.salesDoc.update({ where: { id }, data: { status: "VOID" } });
      await this.audit.log({
        actorId: claims.userId,
        action: "agent.salesdoc.void",
        entity: "sales_doc",
        entityId: id,
        diff: { number: doc.number },
      });
      return { voided: true };
    }
    await this.prisma.salesDoc.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.salesdoc.delete",
      entity: "sales_doc",
      entityId: id,
      diff: { number: doc.number },
    });
    return { deleted: true };
  }

  async setStatus(claims: JwtClaims, id: number, status: string) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    const allowed = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "VOID"];
    if (!allowed.includes(status)) throw badRequest(`Not a status you can set: ${status}`);
    await this.prisma.salesDoc.update({ where: { id }, data: { status: status as never } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.salesdoc.status",
      entity: "sales_doc",
      entityId: id,
      diff: { number: doc.number, status },
    });
    return { id, status };
  }

  // ─────────────────────────── quotation → invoice ───────────────────────────

  /**
   * Converting is idempotent by construction: `convertedFromId` is unique, so
   * a double-click, a retried request and a replayed offline write all end at
   * the same invoice rather than three.
   */
  async convert(claims: JwtClaims, quotationId: number) {
    const ctx = await this.agency.require(claims, SALES);
    const quote = await this.own(ctx.agencyId, quotationId);
    if (quote.kind === "INVOICE") throw badRequest("This is already an invoice");
    if (quote.convertedTo) return { id: quote.convertedTo.id, number: quote.convertedTo.number };

    const number = await this.nextNumber(ctx.agencyId, "INVOICE");
    const invoice = await this.prisma.$transaction(async (tx) => {
      const made = await tx.salesDoc.create({
        data: {
          agencyId: ctx.agencyId,
          kind: "INVOICE",
          number,
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          clientPhone: quote.clientPhone,
          clientAddress: quote.clientAddress,
          guestId: quote.guestId,
          packageId: quote.packageId,
          issueDate: new Date(),
          currency: quote.currency,
          discount: quote.discount,
          taxRate: quote.taxRate,
          notes: quote.notes,
          terms: quote.terms,
          convertedFromId: quote.id,
          createdById: claims.userId,
          items: {
            create: quote.items.map((i) => ({
              label: i.label,
              details: i.details,
              qty: i.qty,
              unitPrice: i.unitPrice,
              sort: i.sort,
            })),
          },
        },
      });
      // the client said yes; the quotation records that rather than staying
      // open forever in the agency's list of things awaiting an answer
      await tx.salesDoc.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
      return made;
    });

    await this.audit.log({
      actorId: claims.userId,
      action: "agent.quotation.convert",
      entity: "sales_doc",
      entityId: invoice.id,
      diff: { from: quote.number, to: number },
    });
    return { id: invoice.id, number: invoice.number };
  }

  // ─────────────────────────── sending it ───────────────────────────

  async send(claims: JwtClaims, id: number, input: { to?: string; message?: string }) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    const to = input.to?.trim() || doc.clientEmail;
    if (!to) throw badRequest("No email address for this client — add one, or type one to send to");

    const agency = await this.prisma.user.findUnique({
      where: { id: ctx.agencyId },
      select: { name: true, email: true, phone: true },
    });
    const totals = docTotals(doc.items, Number(doc.discount), Number(doc.taxRate), Number(doc.amountPaid));
    const render: RenderDoc = {
      kind: doc.kind,
      number: doc.number,
      issueDate: doc.issueDate.toISOString().slice(0, 10),
      validUntil: doc.validUntil ? doc.validUntil.toISOString().slice(0, 10) : null,
      currency: doc.currency,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientPhone: doc.clientPhone,
      clientAddress: doc.clientAddress,
      agencyName: agency?.name ?? "Your travel agency",
      // a placeholder is left off the client's copy: the renderer omits a null line
      agencyEmail: reachableEmail(agency?.email),
      agencyPhone: reachablePhone(agency?.phone),
      items: doc.items.map((i) => ({
        label: i.label,
        details: i.details,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
      })),
      totals,
      taxRate: Number(doc.taxRate),
      notes: input.message?.trim() || doc.notes,
      terms: doc.terms,
    };

    await this.email.send(to, subjectFor(render), renderSalesDoc(render), render.agencyName);

    await this.prisma.salesDoc.update({
      where: { id },
      // a document already answered keeps its answer; only an unsent one moves
      data: { sentAt: new Date(), ...(doc.status === "DRAFT" ? { status: "SENT" as never } : {}) },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.salesdoc.send",
      entity: "sales_doc",
      entityId: id,
      diff: { number: doc.number, to },
    });
    return { sent: true, to };
  }

  /** The same markup the client is emailed, for the agency to print. */
  async preview(claims: JwtClaims, id: number) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    const agency = await this.prisma.user.findUnique({
      where: { id: ctx.agencyId },
      select: { name: true, email: true, phone: true },
    });
    return renderSalesDoc({
      kind: doc.kind,
      number: doc.number,
      issueDate: doc.issueDate.toISOString().slice(0, 10),
      validUntil: doc.validUntil ? doc.validUntil.toISOString().slice(0, 10) : null,
      currency: doc.currency,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientPhone: doc.clientPhone,
      clientAddress: doc.clientAddress,
      agencyName: agency?.name ?? "Your travel agency",
      // a placeholder is left off the client's copy: the renderer omits a null line
      agencyEmail: reachableEmail(agency?.email),
      agencyPhone: reachablePhone(agency?.phone),
      items: doc.items.map((i) => ({
        label: i.label,
        details: i.details,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
      })),
      totals: docTotals(doc.items, Number(doc.discount), Number(doc.taxRate), Number(doc.amountPaid)),
      taxRate: Number(doc.taxRate),
      notes: doc.notes,
      terms: doc.terms,
    });
  }

  // ─────────────────────────── money against it ───────────────────────────

  async recordPayment(
    claims: JwtClaims,
    id: number,
    input: { amount: number; note?: string; clientRef?: string },
  ) {
    const ctx = await this.agency.require(claims, SALES);
    const doc = await this.own(ctx.agencyId, id);
    const amount = Number(input.amount);
    if (!(amount > 0)) throw badRequest("The amount must be more than zero");

    const totals = docTotals(doc.items, Number(doc.discount), Number(doc.taxRate), Number(doc.amountPaid));
    if (amount > totals.due) {
      throw badRequest(
        `That is more than is due on ${doc.number} — ${totals.due} remains`,
      );
    }

    const paid = round2(Number(doc.amountPaid) + amount);
    const settled = paid >= totals.total;
    await this.prisma.salesDoc.update({
      where: { id },
      data: {
        amountPaid: paid as never,
        ...(settled ? { status: "PAID" as never, paidAt: new Date() } : {}),
      },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agent.salesdoc.payment",
      entity: "sales_doc",
      entityId: id,
      diff: { number: doc.number, amount, note: input.note },
    });
    return { id, paid, due: round2(totals.total - paid), status: settled ? "PAID" : doc.status };
  }

  // ─────────────────────────── plumbing ───────────────────────────

  /**
   * QUO-000001, counting up per agency.
   *
   * Numbering off the row count would repeat a number the moment a draft is
   * deleted, and two documents with the same number is the one thing a client
   * will notice. A counter row only ever goes up.
   */
  private async nextNumber(agencyId: number, kind: DocKind): Promise<string> {
    const counter = await this.prisma.counter.upsert({
      where: { agencyId_kind: { agencyId, kind } },
      update: { nextVal: { increment: 1 } },
      create: { agencyId, kind, nextVal: 1 },
    });
    const prefix = kind === "QUOTATION" ? "QUO" : "INV";
    return `${prefix}-${String(counter.nextVal).padStart(6, "0")}`;
  }

  /**
   * The lines, either typed out or taken from a tour package.
   *
   * A package's cost per line never reaches the document: what the agency paid
   * for a bus is its own business, and a client's copy that carries it is a
   * negotiating position handed over for free.
   */
  private async linesFor(agencyId: number, input: Partial<DocInput>) {
    if (input.items && input.items.length > 0) {
      return input.items.map((l, index) => {
        const label = l.label?.trim();
        if (!label) throw badRequest("Every line needs a label");
        const qty = Number(l.qty ?? 1);
        const unitPrice = Number(l.unitPrice ?? 0);
        if (qty <= 0) throw badRequest(`"${label}": quantity must be more than zero`);
        if (unitPrice < 0) throw badRequest(`"${label}": money cannot be negative`);
        return {
          label,
          details: l.details ?? null,
          qty: qty as never,
          unitPrice: unitPrice as never,
          sort: index,
        };
      });
    }
    if (input.packageId) {
      const pkg = await this.prisma.tourPackage.findUnique({
        where: { id: input.packageId },
        include: { items: { orderBy: [{ sort: "asc" }, { id: "asc" }] } },
      });
      if (!pkg) throw notFound("Package not found");
      if (pkg.agencyId !== agencyId) throw forbid("Not your package");
      return pkg.items.map((i, index) => ({
        label: i.label,
        details: null,
        qty: i.qty,
        unitPrice: i.unitPrice,
        sort: index,
      }));
    }
    return [];
  }
}
