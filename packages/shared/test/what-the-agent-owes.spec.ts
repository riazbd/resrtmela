/**
 * The arithmetic of an agent's account, which both clients and the API read.
 *
 * Every scenario here is one the owner described or one the trade does anyway,
 * written in taka rather than in abstractions, because the bug this replaced
 * was an arithmetic that looked right and answered the wrong question: a
 * booking's `due` counted the guest's price against whatever was recorded as
 * paid, so an agent who remitted in full left the stay owing exactly the
 * commission, for ever.
 */
import { describe, expect, it } from "vitest";
import {
  AGENT_ENTRY_SIGN,
  agentBalance,
  agentBalanceSays,
  agentEntryLabel,
  isAgentEntryKind,
  isStoredAgentEntryKind,
  overCreditLimit,
} from "../src/agent-account";
import { soldBy, soldByParts } from "../src/sold-by";

const collected = (amount: number) => ({ kind: "COLLECTED", amount, status: "CONFIRMED" });
const remit = (amount: number) => ({ kind: "REMIT", amount: -amount, status: "CONFIRMED" });
const commission = (amount: number) => ({ kind: "COMMISSION", amount: -amount, status: "CONFIRMED" });
const paidOut = (amount: number) => ({ kind: "COMMISSION_PAID", amount, status: "CONFIRMED" });
const advance = (amount: number) => ({ kind: "ADVANCE", amount: -amount, status: "CONFIRMED" });

describe("the scenarios the owner asked about", () => {
  /**
   * The one he described in his own words: *"boro vai, ami amar commission
   * raikha apnare baki ta die ditesi."* A 10,000 booking at 10%: the guest
   * hands the agent the lot, the agent sends 9,000 and keeps 1,000.
   */
  it("settles to zero when the agent keeps the commission out of the remittance", () => {
    const b = agentBalance([collected(10_000), remit(9_000), commission(1_000)]);
    expect(b.balance).toBe(0);
    expect(b.collected).toBe(10_000);
    expect(b.remitted).toBe(9_000);
    expect(b.commission).toBe(1_000);
  });

  /** The same money the other way: the agent sends all of it and is owed back. */
  it("leaves the resort owing the commission when the agent remits in full", () => {
    const b = agentBalance([collected(10_000), remit(10_000), commission(1_000)]);
    expect(b.balance).toBe(-1_000);
    expect(agentBalanceSays(b.balance, "Elite Tourism")).toBe("Due to Elite Tourism");
  });

  /**
   * His first scenario: a partial. The guest paid half to the agent, who passed
   * it straight on. The commission is on the *sale*, not on what has been
   * collected — the agent sold the room; collecting is not their job — so the
   * resort owes them 1,000 and the guest still owes 5,000 at the desk.
   */
  it("pays commission on the sale even when the guest has only part-paid", () => {
    const b = agentBalance([collected(5_000), remit(5_000), commission(1_000)]);
    expect(b.balance).toBe(-1_000);
  });

  /** The guest paid the resort directly. The agent took nothing and is owed. */
  it("leaves the resort owing commission when the guest pays the counter", () => {
    const b = agentBalance([commission(1_000)]);
    expect(b.balance).toBe(-1_000);
    expect(b.collected).toBe(0);
  });

  /**
   * The exposure worth having a credit limit for: money taken and not passed
   * on. What they owe is net of the commission they have earned, because that
   * is what they would actually hand over.
   */
  it("shows what an agent is holding, net of what they have earned", () => {
    const b = agentBalance([collected(10_000), commission(1_000)]);
    expect(b.balance).toBe(9_000);
    expect(agentBalanceSays(b.balance, "Elite Tourism")).toBe("Due from Elite Tourism");
  });

  /** A float kept with the resort — very common with a trusted agent here. */
  it("carries an advance as the resort holding the agent's money", () => {
    const b = agentBalance([advance(20_000), collected(15_000), remit(0)]);
    expect(b.balance).toBe(-5_000);
    expect(b.advances).toBe(20_000);
  });

  it("closes out when the resort pays the commission it owed", () => {
    const b = agentBalance([commission(1_000), paidOut(1_000)]);
    expect(b.balance).toBe(0);
    expect(b.commissionPaid).toBe(1_000);
  });

  /**
   * A refund the agent handed back to the guest is money they are no longer
   * holding. The booking's own `paid` skips refunds; this must not, or an agent
   * who refunded a guest would go on owing the resort money they gave away.
   */
  it("takes a refunded collection back off what the agent owes", () => {
    const b = agentBalance([collected(10_000), collected(-4_000), commission(1_000)]);
    expect(b.balance).toBe(5_000);
  });
});

describe("a declaration is a claim, not a payment", () => {
  /**
   * An agency that could reduce its balance by typing is an agency with no
   * statement. A declared remittance is shown and counted separately until
   * somebody at the resort has matched it against the money.
   */
  it("keeps a pending line out of the balance", () => {
    const b = agentBalance([
      collected(10_000),
      commission(1_000),
      { kind: "REMIT", amount: -9_000, status: "PENDING" },
    ]);
    expect(b.balance).toBe(9_000);
    expect(b.pending).toBe(9_000);
    expect(b.remitted).toBe(0);
  });

  it("counts it once the resort confirms it", () => {
    const b = agentBalance([collected(10_000), commission(1_000), remit(9_000)]);
    expect(b.balance).toBe(0);
    expect(b.pending).toBe(0);
  });
});

describe("which way the figure points", () => {
  /**
   * The sentence rather than the sign, in one place, because reading it two
   * different ways on two clients is the same class of bug as two arithmetics
   * — and it flips on a number that is often zero.
   *
   * "Due" and never "owed": the console has one word for money not yet paid,
   * and `one-word-for-money-not-yet-paid.spec.ts` in the web app keeps it that
   * way. One sentence serves both sides because `who` is whoever the screen is
   * about — the agency on the resort's console, "you" on the agency's own.
   */
  it("says settled when nothing is due either way", () => {
    expect(agentBalanceSays(0, "Elite")).toBe("Settled — nothing due either way");
  });

  it("treats a rounding as settled", () => {
    expect(agentBalanceSays(0.004, "Elite")).toBe("Settled — nothing due either way");
    expect(agentBalanceSays(-0.004, "Elite")).toBe("Settled — nothing due either way");
  });

  it("reads naturally from either side", () => {
    expect(agentBalanceSays(9_000, "you")).toBe("Due from you");
    expect(agentBalanceSays(-1_000, "you")).toBe("Due to you");
  });
});

describe("the credit limit", () => {
  /**
   * Off is the default everywhere, so nothing changes for a resort that never
   * asks the question.
   */
  it("allows everything when no limit is set", () => {
    expect(overCreditLimit(500_000, null)).toBe(false);
    expect(overCreditLimit(500_000, undefined)).toBe(false);
    expect(overCreditLimit(500_000, 0)).toBe(false);
  });

  it("stops at the limit, not past it", () => {
    expect(overCreditLimit(49_999, 50_000)).toBe(false);
    expect(overCreditLimit(50_000, 50_000)).toBe(true);
    expect(overCreditLimit(50_001, 50_000)).toBe(true);
  });

  /** An agency the resort owes money to is not over its limit. */
  it("never stops an agency that is owed money", () => {
    expect(overCreditLimit(-80_000, 50_000)).toBe(false);
  });
});

describe("the vocabulary", () => {
  /**
   * `COLLECTED` is a kind a statement renders and nothing writes as a row:
   * guest money an agent took lives on `Payment.collectedByAgentId`, because a
   * second copy of that fact would be two tables disagreeing by month end.
   */
  it("knows COLLECTED as a kind but not as one to store", () => {
    expect(isAgentEntryKind("COLLECTED")).toBe(true);
    expect(isStoredAgentEntryKind("COLLECTED")).toBe(false);
    expect(isStoredAgentEntryKind("REMIT")).toBe(true);
  });

  it("refuses a kind nobody declared", () => {
    expect(isAgentEntryKind("WITHDRAWAL")).toBe(false);
    expect(isStoredAgentEntryKind("")).toBe(false);
  });

  /**
   * Only `ADJUSTMENT` runs both ways. Everything else is forced to its
   * direction, so a remittance cannot be filed as a figure that increases what
   * the agent owes — the typo that would make a statement unarguable-with in
   * the wrong direction.
   */
  it("pins every kind but an adjustment to one direction", () => {
    expect(AGENT_ENTRY_SIGN.REMIT).toBe(-1);
    expect(AGENT_ENTRY_SIGN.COMMISSION).toBe(-1);
    expect(AGENT_ENTRY_SIGN.ADVANCE).toBe(-1);
    expect(AGENT_ENTRY_SIGN.COMMISSION_PAID).toBe(1);
    expect(AGENT_ENTRY_SIGN.COLLECTED).toBe(1);
    expect(AGENT_ENTRY_SIGN.ADJUSTMENT).toBe(0);
  });

  it("has a readable name for every kind", () => {
    for (const kind of Object.keys(AGENT_ENTRY_SIGN)) {
      expect(agentEntryLabel(kind)).not.toBe(kind);
    }
    // and passes an unknown one through rather than drawing a blank cell
    expect(agentEntryLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});

describe("an adjustment", () => {
  it("runs both ways and lands in the balance either way", () => {
    expect(agentBalance([{ kind: "ADJUSTMENT", amount: -500, status: "CONFIRMED" }]).balance).toBe(-500);
    expect(agentBalance([{ kind: "ADJUSTMENT", amount: 500, status: "CONFIRMED" }]).balance).toBe(500);
    expect(agentBalance([{ kind: "ADJUSTMENT", amount: -500, status: "CONFIRMED" }]).adjustments).toBe(-500);
  });

  /** Writing off what an agency owes leaves the account square. */
  it("can close an old argument", () => {
    const b = agentBalance([
      collected(10_000),
      commission(1_000),
      remit(8_500),
      { kind: "ADJUSTMENT", amount: -500, status: "CONFIRMED" },
    ]);
    expect(b.balance).toBe(0);
  });
});

describe("the money adds up", () => {
  /**
   * Paisa, because a percentage commission makes them: 10% of 3,333 is 333.30,
   * and a ledger that drifts by a paisa a booking is one nobody can reconcile.
   */
  it("holds to two places across many lines", () => {
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(collected(3_333), commission(333.3), remit(2_999.7));
    }
    expect(agentBalance(lines).balance).toBe(0);
  });

  it("ignores a line with no number in it", () => {
    const b = agentBalance([{ kind: "REMIT", amount: Number.NaN, status: "CONFIRMED" }]);
    expect(b.balance).toBe(0);
  });
});

describe("naming who a booking came from", () => {
  /**
   * The resort's booking list named the person and nothing else. A resort has
   * no relationship with Rafiqul Islam; it has one with Sea Breeze Travels,
   * and the rate, the account and the settlement all hang off the agency.
   */
  it("puts the firm first and the person after it", () => {
    expect(soldBy("Sea Breeze Travels", "Rafiqul Islam")).toBe("Sea Breeze Travels · Rafiqul Islam");
  });

  /** A lone agent is their own firm, and saying it twice is saying it wrong. */
  it("says a lone agent's name once", () => {
    expect(soldBy("Rafiqul Islam", "Rafiqul Islam")).toBe("Rafiqul Islam");
    expect(soldBy(null, "Rafiqul Islam")).toBe("Rafiqul Islam");
    expect(soldBy("Rafiqul Islam", null)).toBe("Rafiqul Islam");
  });

  it("says nothing about a stay the resort sold itself", () => {
    expect(soldBy(null, null)).toBeNull();
    expect(soldBy("", "  ")).toBeNull();
  });

  /**
   * Apart, for a screen with room to stack them — the Dues screen draws the
   * firm in the row's weight and the person under it, and a joined string
   * would have to be split again to do that.
   */
  it("hands the two halves over separately when asked", () => {
    expect(soldByParts("Sea Breeze Travels", "Rafiqul Islam")).toEqual({
      firm: "Sea Breeze Travels",
      who: "Rafiqul Islam",
    });
    expect(soldByParts("Rafiqul Islam", "Rafiqul Islam")).toEqual({
      firm: "Rafiqul Islam",
      who: null,
    });
    expect(soldByParts(null, null)).toEqual({ firm: null, who: null });
  });
});
