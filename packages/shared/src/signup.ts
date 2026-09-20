/**
 * What a signup needs before it can be sent.
 *
 * Both routes have existed since the console had them and the typed
 * client has carried both since phase 0; the phone has never had a door
 * to either, so somebody who installs the app without an account can do
 * nothing at all with it. Phase 4 opens that door, and this is the rule
 * the two doors share.
 *
 * It is here rather than in either screen for the reason
 * `whatTheBookingNeeds` is here: the console asks the same question
 * inside its own signup page, and two answers to one question become two
 * different answers within a month.
 *
 * The rules are the API's, read off the DTOs in `auth.controller.ts` —
 * `@MinLength(8)` on the password, everything but `location` required —
 * rather than invented by a form. A client that is stricter than the
 * server refuses work the server would take; one that is looser sends a
 * person a validator's error message instead of a sentence.
 */
import type { AgencySignup, ResortSignup } from "./client";

/** The API's floor, on both DTOs. */
export const PASSWORD_MIN = 8;

const blank = (v: unknown): boolean => typeof v !== "string" || v.trim().length === 0;

/**
 * A password is not trimmed.
 *
 * Spaces inside one are the person's business and count as characters;
 * trimming here would accept a password the server then rejects, or
 * quietly sign somebody up with a secret one character shorter than the
 * one they typed.
 */
const tooShort = (v: unknown): boolean =>
  typeof v !== "string" || v.length < PASSWORD_MIN;

/**
 * The gaps, in the order the form shows the fields — so a screen can
 * mark them top to bottom and scroll to the first without sorting.
 */
export function whatTheResortSignupNeeds(form: Partial<ResortSignup>): string[] {
  const gaps: string[] = [];
  if (blank(form.companyName)) gaps.push("companyName");
  if (blank(form.resortName)) gaps.push("resortName");
  if (blank(form.name)) gaps.push("name");
  if (blank(form.email)) gaps.push("email");
  if (blank(form.phone)) gaps.push("phone");
  if (tooShort(form.password)) gaps.push("password");
  return gaps;
}

export function whatTheAgencySignupNeeds(form: Partial<AgencySignup>): string[] {
  const gaps: string[] = [];
  if (blank(form.agencyName)) gaps.push("agencyName");
  if (blank(form.name)) gaps.push("name");
  if (blank(form.email)) gaps.push("email");
  if (blank(form.phone)) gaps.push("phone");
  if (tooShort(form.password)) gaps.push("password");
  return gaps;
}

/**
 * One sentence per gap, shared so both clients say the same thing.
 *
 * Each says what to do rather than what is wrong: "Choose a password of
 * at least eight characters" is an instruction, "password is too short"
 * is a complaint.
 */
export const SIGNUP_GAP_MESSAGES: Record<string, string> = {
  companyName: "Name the company or owner the resort belongs to",
  resortName: "Name the resort",
  agencyName: "Name the agency",
  name: "Give your own name",
  email: "Give an email — the password reset goes there",
  phone: "Give a phone number",
  password: "Choose a password of at least eight characters",
};
