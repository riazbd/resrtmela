# What an agent owes, and what the resort owes them

2026-09-28. Both clients.

## The question

An agent books a ৳10,000 room. The guest hands the agent ৳5,000. The agent
hands the resort ৳5,000. The agent has earned ৳1,000. Who owes what, and where
does anybody read it?

Today: nowhere. And one figure on screen is wrong.

## What is broken now

`agentPricing` (`common/money.ts`) computes *guest pays / commission / you pay
the resort* and **shows** it. Nothing stores it. A booking's `due` is
`total − paid` where `total` is the guest price, so commission is not in the
arithmetic at all:

| event | the screen says | the truth |
| --- | --- | --- |
| agent remits the full ৳9,000 | due ৳1,000 | due ৳0 |

**A fully settled booking reads as owing exactly the commission, forever.** The
Dues screen's per-agency rollup is over by the commission on every agency
booking it counts, and it is the number an owner rings an agency about.

The cause is not the arithmetic. It is that the resort had no way to record
what actually happened — *"I got ৳9,000 and he kept ৳1,000"* — so whoever was
at the desk recorded the ৳9,000 as the guest's payment, which is the only
thing the software offered and the wrong fact.

An agent also holds no permission to record money (`Agent` is
`["agent.book", "agent.wallet.view"]`), so guest money handed to an agent is
outside the system entirely and the desk asks a paid-up guest to pay again.

`Wallet` is not this. That is the platform's credit wallet — what an agency has
deposited with *us* for subscriptions and email credits, hand-credited by
platform staff. It has nothing to say about a resort and an agency settling.

## One account, many doors

The owner's requirement, verbatim: *"formal, informal shob vabei jeno amar
system theke best ease pawa jai"*. So the design's rule is:

**The account is the invariant. How a line gets written is not.** No door is
mandatory, and a resort that only ever uses the quickest one still ends up with
a complete and correct account.

The doors:

| door | who | when it fits |
| --- | --- | --- |
| **Received from an agent** — one form: what came in, what they kept | resort | the phone call. Twenty seconds. |
| Took money from the guest | agent | so the desk does not ask the guest twice |
| Declared a remittance, with a TrxID | agent declares, resort confirms | the two are not on the phone |
| Paid commission out | resort | the guest paid the resort directly |
| Advance deposit | resort | a trusted agent keeping a float |
| Adjustment | resort | a rounding, a discount, an old argument closed |

The commission **rate is a default in a box, never a rule.** It pre-fills what
the terms would give and the person typing overwrites it, because what was
agreed on the phone is the fact and the rate is a guess about it. A ledger that
refuses the figure two businesses agreed on is a ledger they stop using.

## What is stored, and what is not

`payments` is already the resort's record of money arriving. So *"the agent
collected guest money"* is *one nullable column on that row* —
`Payment.collectedByAgentId` — and not a second copy in a new table. One fact,
one place; the alternative is two tables that disagree by the end of the month.

The new table holds only the facts with no existing home:

| kind | sign | means |
| --- | --- | --- |
| `REMIT` | − | the agent handed money over |
| `COMMISSION` | − | commission the agent took or is owed, per booking |
| `COMMISSION_PAID` | + | the resort paid commission out |
| `ADVANCE` | − | deposited ahead of bookings |
| `ADJUSTMENT` | ± | written off, rounded, settled |

**The balance is one SUM.** Signed amounts rather than a kind-plus-positive
pair, because `ADJUSTMENT` runs both ways and because a balance assembled from
two conditional sums can be half-written; the sign is validated against the
kind on the way in. `WalletTxn` stores signed amounts for the same reason.

```
balance = Σ payments collected by this agency
        + Σ entries
```

**Positive: the agent owes the resort. Negative: the resort owes the agent.**
Both clients read that number; neither computes it.

Bookings themselves are not in it. An agent owes the resort the money they
*took* — if the guest paid the resort at the counter, the agent owes nothing
and is owed their commission. That is why every scenario falls out of five
kinds with no mode flag:

| scenario | lines | balance |
| --- | --- | --- |
| guest → agent ৳10,000; agent remits ৳9,000, keeps ৳1,000 | +10,000 −9,000 −1,000 | **0** |
| guest → agent ৳10,000; agent remits all ৳10,000 | +10,000 −10,000 −1,000 | **−1,000** resort owes |
| guest → agent ৳5,000; agent remits ৳5,000 | +5,000 −5,000 −1,000 | **−1,000** resort owes |
| guest pays the resort directly | −1,000 | **−1,000** resort owes |
| agent collected ৳10,000, remitted nothing | +10,000 −1,000 | **+9,000** agent owes |
| agent deposits a ৳20,000 float | −20,000 | **−20,000** resort holds it |

## Commission is a row, not a calculation

Written when it is agreed, carrying the rate *as it read that day* — the rule
already applied to a sales quotation (*"a package repriced next month must not
rewrite a quote sent last month"*) and to a construction heading's `label`. A
resort raising its rate in November must not restate October.

There is deliberately no *"commission becomes due at"* moment. The owner's own
words: *"boro vai, ami amar commission raikha apnare baki ta die ditesi"* — the
agent takes it by remitting less. A crystallisation event would be a ceremony
the trade does not perform.

## Credit limit

`ResortAgency.creditLimit`, nullable, **null meaning no limit** — off unless a
resort sets one, so nothing changes for anybody who does not ask for it. When
set, a positive balance at or above it refuses a new booking with the figure in
the sentence. This is where the money is actually lost in this trade: an agency
collects two lakh, remits nothing, and keeps booking.

## Who may

Resort: `settlement.view` / `settlement.manage`, in "Money", on Manager and
Administrator. Not the front desk — an agency's trade account is not the desk's
business, and the desk already learns what it needs from the booking's own
`due` once the collection is recorded against it.

Agency: `agent.account.view` (read my own statement) and `agent.collect` (take
guest money on my own booking) join the default `Agent` set, because the people
who may sell a room are the people who handle its money. `agent.remit` —
declaring a payment sent — stays for the owner to grant.

An agent can **declare** a remittance but never confirm one: an agent writing
*"I paid you"* straight into the resort's books is not a ledger. A declared
line sits `PENDING`, outside the balance, shown as awaiting confirmation. This
is the idiom the codebase already uses for `cancelState` — the agent asks, the
resort agrees.

## On screen

**Console** — `/agents`, *Agent accounts*: who owes, who is owed, who is over
their limit, the **Received from an agent** form, and a statement per agency
with every line behind the figure. The Dues screen keeps its booking rollup and
gains the account balance beside it, labelled as the different question it is:
*money an agency is holding* is not *money not yet collected on their bookings*.

**App** — an agent's *My account*: the balance per resort, this month's
commission, the declare-a-remittance form with its TrxID box, and a statement
to print or send. On the phone because that is where an agent is.
