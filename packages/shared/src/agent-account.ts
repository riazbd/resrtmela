/**
 * The running account between a resort and an agent.
 *
 * One arithmetic, in one file, read by the API and both clients — the rule
 * `commission.service.ts` was written to enforce after three copies of the
 * commission sum let an agent see ৳75,000 where the owner's report said
 * ৳1,000. The clients do not add these figures up; they render what this
 * returns.
 *
 * **Positive means the agent owes the resort. Negative means the resort owes
 * the agent.** Every screen on both sides says which way round it is in words,
 * because a signed figure on its own is a question rather than an answer.
 */

/** What kind of line this is. The vocabulary is declared here and nowhere else. */
export const AGENT_ENTRY_KINDS = [
  "COLLECTED",
  "REMIT",
  "COMMISSION",
  "COMMISSION_PAID",
  "ADVANCE",
  "ADJUSTMENT",
] as const;

export type AgentEntryKind = (typeof AGENT_ENTRY_KINDS)[number];

/**
 * `COLLECTED` is in the list and not in the table.
 *
 * Guest money an agent took is `Payment.collectedByAgentId` — one column on the
 * row that already records money arriving, rather than a second copy of the
 * same fact in a second table. It appears here because a statement has to show
 * it as a line like any other, so the rendering vocabulary needs the word even
 * though nothing writes it as a row.
 */
export const AGENT_ENTRY_KINDS_STORED: readonly AgentEntryKind[] = [
  "REMIT",
  "COMMISSION",
  "COMMISSION_PAID",
  "ADVANCE",
  "ADJUSTMENT",
];

/**
 * What an agency may write about its own money: that it handed some over, or
 * that it put some down in advance.
 *
 * Every declaration was a remittance until 2026-10-01, so an agency's float for
 * the season read on both statements as "Handed money to the resort" against
 * stays that did not exist yet. Commission and adjustments stay the resort's to
 * write — an agency able to file its own commission could pay itself by typing.
 */
export const AGENT_DECLARE_KINDS = ["REMIT", "ADVANCE"] as const satisfies readonly AgentEntryKind[];

export type AgentDeclareKind = (typeof AGENT_DECLARE_KINDS)[number];

export function isAgentDeclareKind(v: unknown): v is AgentDeclareKind {
  return typeof v === "string" && (AGENT_DECLARE_KINDS as readonly string[]).includes(v);
}

export function isAgentEntryKind(v: string): v is AgentEntryKind {
  return (AGENT_ENTRY_KINDS as readonly string[]).includes(v);
}

export function isStoredAgentEntryKind(v: string): v is AgentEntryKind {
  return (AGENT_ENTRY_KINDS_STORED as readonly string[]).includes(v);
}

/**
 * Which way each kind may push the balance.
 *
 * `+1` may only be positive, `−1` only negative, `0` either. Checked on the way
 * in, so a remittance cannot be filed as a figure that increases what the agent
 * owes — which is the typo that would make a statement unarguable-with in the
 * wrong direction.
 */
export const AGENT_ENTRY_SIGN: Record<AgentEntryKind, -1 | 0 | 1> = {
  COLLECTED: 1,
  REMIT: -1,
  COMMISSION: -1,
  COMMISSION_PAID: 1,
  ADVANCE: -1,
  ADJUSTMENT: 0,
};

/** How each line reads on a statement, on both clients. */
export const AGENT_ENTRY_LABEL: Record<AgentEntryKind, string> = {
  COLLECTED: "Took money from the guest",
  REMIT: "Handed money to the resort",
  COMMISSION: "Commission",
  COMMISSION_PAID: "Commission paid out",
  ADVANCE: "Advance deposited",
  ADJUSTMENT: "Adjustment",
};

export function agentEntryLabel(kind: string): string {
  return isAgentEntryKind(kind) ? AGENT_ENTRY_LABEL[kind] : kind;
}

/** `PENDING` is a remittance an agent declared and nobody has matched yet. */
export const AGENT_ENTRY_STATUSES = ["PENDING", "CONFIRMED"] as const;
export type AgentEntryStatus = (typeof AGENT_ENTRY_STATUSES)[number];

export interface AgentAccountLine {
  kind: string;
  /** signed, as stored */
  amount: number;
  status: string;
}

export interface AgentAccountBalance {
  /** positive: the agent owes the resort; negative: the resort owes the agent */
  balance: number;
  /** what the agent took from guests and the resort has not been handed */
  collected: number;
  remitted: number;
  commission: number;
  commissionPaid: number;
  advances: number;
  adjustments: number;
  /** declared by the agent and not yet matched — deliberately outside `balance` */
  pending: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The balance, and the pieces it is made of.
 *
 * A `PENDING` line counts towards `pending` and towards nothing else: a
 * remittance nobody has matched yet is a claim, and folding claims into the
 * balance would let an agency reduce what it owes by typing.
 */
export function agentBalance(lines: readonly AgentAccountLine[]): AgentAccountBalance {
  const out: AgentAccountBalance = {
    balance: 0,
    collected: 0,
    remitted: 0,
    commission: 0,
    commissionPaid: 0,
    advances: 0,
    adjustments: 0,
    pending: 0,
  };
  for (const line of lines) {
    const amount = Number(line.amount) || 0;
    if (line.status === "PENDING") {
      out.pending += Math.abs(amount);
      continue;
    }
    out.balance += amount;
    switch (line.kind) {
      case "COLLECTED":
        out.collected += Math.abs(amount);
        break;
      case "REMIT":
        out.remitted += Math.abs(amount);
        break;
      case "COMMISSION":
        out.commission += Math.abs(amount);
        break;
      case "COMMISSION_PAID":
        out.commissionPaid += Math.abs(amount);
        break;
      case "ADVANCE":
        out.advances += Math.abs(amount);
        break;
      case "ADJUSTMENT":
        out.adjustments += amount;
        break;
    }
  }
  for (const key of Object.keys(out) as (keyof AgentAccountBalance)[]) out[key] = r2(out[key]);
  return out;
}

/**
 * The sentence a screen puts under the figure.
 *
 * Written here rather than on each screen because which way a balance points,
 * read two different ways on two clients, is the same class of bug as two
 * arithmetics — and the answer flips on the sign of a number that is often
 * zero.
 *
 * **"Due", never "owed".** The console has one word for money not yet paid: it
 * is on every amount, in the navigation and in the API's own field names, and
 * `one-word-for-money-not-yet-paid.spec.ts` keeps it that way. Two words for
 * one idea read as two ideas, and the reader has to work out whether they are
 * the same thing before acting on either.
 *
 * `who` is whoever the screen is about — the agency on the resort's console,
 * "you" on the agency's own — so one sentence serves both sides.
 */
export function agentBalanceSays(balance: number, who: string): string {
  const n = r2(balance);
  if (Math.abs(n) < 0.005) return "Settled — nothing due either way";
  return n > 0 ? `Due from ${who}` : `Due to ${who}`;
}

/**
 * Whether this booking may go ahead on this account.
 *
 * `limit` null — the default everywhere — means no limit, so this answers yes
 * for every resort that has not asked the question. The figure is in the
 * refusal because "you have reached your limit" without it is a message that
 * sends somebody to the phone rather than to their bank.
 */
export function overCreditLimit(balance: number, limit: number | null | undefined): boolean {
  if (limit == null || !Number.isFinite(Number(limit)) || Number(limit) <= 0) return false;
  return r2(balance) >= r2(Number(limit));
}
