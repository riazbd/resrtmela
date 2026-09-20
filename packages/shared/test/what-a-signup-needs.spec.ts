/**
 * What a signup needs (2026-09-21, phase 4 task 1).
 *
 * The two signup routes have existed since the console had them, and the
 * typed client has carried both since phase 0. The phone has never had a
 * door to either: install the app with no account and the only thing you
 * can do is ask for a password reset to an account you do not have.
 *
 * The console answers "is this form ready" inside its own 408-line page.
 * A second copy on the phone would be two answers to one question within
 * a month — the same argument that moved `whatTheBookingNeeds` here, and
 * the same shape: a list of what is missing, in the order the form shows
 * it, so the screen marks fields rather than guessing.
 *
 * Trimmed before judged. A name of three spaces is not a name, and a form
 * that accepts it sends the API a tenant called "   ".
 */
import { describe, expect, it } from "vitest";
import {
  SIGNUP_GAP_MESSAGES,
  whatTheAgencySignupNeeds,
  whatTheResortSignupNeeds,
} from "../src/signup";

const resort = {
  companyName: "Sea Breeze Ltd",
  resortName: "Sea Breeze Resort",
  name: "Rahim Uddin",
  email: "rahim@example.com",
  phone: "01811110001",
  password: "longenough1",
};

const agency = {
  agencyName: "Demo Travels",
  name: "Karim",
  email: "karim@example.com",
  phone: "01811110002",
  password: "longenough1",
};

describe("a resort signing itself up", () => {
  it("is ready when every required field is there", () => {
    expect(whatTheResortSignupNeeds(resort)).toEqual([]);
  });

  it("names each missing field, in the order the form asks", () => {
    expect(whatTheResortSignupNeeds({})).toEqual([
      "companyName",
      "resortName",
      "name",
      "email",
      "phone",
      "password",
    ]);
  });

  it("does not accept a name of spaces", () => {
    expect(whatTheResortSignupNeeds({ ...resort, resortName: "   " })).toEqual(["resortName"]);
  });

  /** Location is genuinely optional — the API marks it so. */
  it("does not ask for a location", () => {
    expect(whatTheResortSignupNeeds({ ...resort, location: undefined })).toEqual([]);
  });
});

describe("an agency signing itself up", () => {
  it("is ready when every required field is there", () => {
    expect(whatTheAgencySignupNeeds(agency)).toEqual([]);
  });

  it("asks for the agency's name rather than a resort's", () => {
    expect(whatTheAgencySignupNeeds({ ...agency, agencyName: "" })).toEqual(["agencyName"]);
    expect(whatTheAgencySignupNeeds({ ...agency, agencyName: "x" })).toEqual([]);
  });
});

/**
 * The password rule is the API's, not the form's invention.
 * `@MinLength(8)` is on both DTOs.
 */
describe("the password", () => {
  it("refuses one shorter than the API will take", () => {
    expect(whatTheResortSignupNeeds({ ...resort, password: "short" })).toEqual(["password"]);
    expect(whatTheAgencySignupNeeds({ ...agency, password: "short" })).toEqual(["password"]);
  });

  it("takes one of exactly eight", () => {
    expect(whatTheResortSignupNeeds({ ...resort, password: "12345678" })).toEqual([]);
  });

  /** Not trimmed: spaces inside a password are the person's business. */
  it("counts a password's spaces as characters", () => {
    expect(whatTheResortSignupNeeds({ ...resort, password: "a b c d " })).toEqual([]);
  });
});

/**
 * Both clients say the same sentence for the same gap, for the same
 * reason `BOOKING_GAP_MESSAGES` exists.
 */
describe("what the reader is told", () => {
  it("has a sentence for every gap either form can produce", () => {
    const gaps = new Set([
      ...whatTheResortSignupNeeds({}),
      ...whatTheAgencySignupNeeds({}),
      ...whatTheResortSignupNeeds({ ...resort, password: "x" }),
    ]);
    for (const gap of gaps) expect(SIGNUP_GAP_MESSAGES[gap]).toBeTruthy();
  });

  it("says what to do, not what is wrong", () => {
    expect(SIGNUP_GAP_MESSAGES.password).toMatch(/eight/i);
  });
});
