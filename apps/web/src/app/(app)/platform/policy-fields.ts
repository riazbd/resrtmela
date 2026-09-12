/**
 * The Billing policy form's fields.
 *
 * These four numbers decide when a paying customer stops being one, so they
 * belong to whoever owns that decision — not to a constant somebody has to
 * redeploy.
 *
 * The contact fields start empty and stay empty until the owner fills them in.
 * That is deliberate: the platform cannot guess a bKash number, and a *stored*
 * guess is worse than a blank. One was seeded once — "bKash (Merchant)
 * 01711-000111 · Resort Mela Ltd, City Bank, A/C 1402-345678-001" — and it sat
 * in production reading exactly like a real merchant account, which is a
 * customer's money sent nowhere.
 *
 * A `placeholder` is the safe half of that idea: it shows the shape of the
 * answer, is greyed out, is never submitted, and never reaches a buyer. It is
 * written so nobody could mistake it for the platform's own number —
 * `an-example-is-not-a-value.spec.ts` fails on anything that looks dialable.
 *
 * Lifted out of the page so the test can read it without rendering the console.
 */
export interface PolicyField {
  key: string;
  label: string;
  hint: string;
  unit?: string;
  /** the shape of the answer, shown in the empty box; never stored */
  placeholder?: string;
}

export const POLICY_FIELDS: PolicyField[] = [
  {
    key: "billing.graceDays",
    label: "Grace period",
    unit: "days",
    hint: "after the due date before the bill is marked overdue. bKash and bank transfers have a human in the loop — a day is not enough.",
    placeholder: "e.g. 7",
  },
  {
    key: "billing.suspendAfterDays",
    label: "Suspend after",
    unit: "days",
    hint: "days past the due date before the resort stops accepting new entries. Reads and exports always stay open.",
    placeholder: "e.g. 15",
  },
  {
    key: "billing.noticeDays",
    label: "Notice before",
    unit: "days",
    hint: "warning sent before a trial ends and before a suspension lands.",
    placeholder: "e.g. 3",
  },
  {
    key: "platform.name",
    label: "Platform name",
    hint: "how the platform signs the mail it sends tenants about their account.",
    placeholder: "e.g. Resort Mela",
  },
  {
    key: "platform.supportEmail",
    label: "Support email",
    hint: "shown to tenants who need to sort out a bill, and linked in every bill email. Use an address somebody reads.",
    placeholder: "e.g. support@yourdomain.com",
  },
  {
    key: "platform.supportPhone",
    label: "Support phone",
    hint: "same, for the ones who would rather call.",
    placeholder: "e.g. 01XXXXXXXXX, or +8801XXXXXXXXX",
  },
];
