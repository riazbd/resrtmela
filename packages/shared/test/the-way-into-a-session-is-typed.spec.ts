/**
 * Every door into a session, typed once (2026-09-20).
 *
 * `client.ts` opens with the reason it exists: there were 164 routes and three
 * separate descriptions of what they return, and every caller built its own
 * URL by hand, "so a renamed query parameter was found by a user, not by a
 * compiler". The file then types 144 of the API's 294 routes, and none of the
 * auth controller's except `me` and `permissions` — so the one flow every
 * client must have, signing in, was the one flow nobody could reach typed.
 *
 * It did not show, because the console never leaned on the file: ten of its
 * forty page files use the typed client and the rest write their paths out.
 * The app cannot be built that way. A second set of hand-written paths is a
 * second place for a renamed parameter to be found by a user, and two clients
 * that each know the API by heart disagree within a month.
 *
 * So this spec is the gate on the auth slice: it asks what the API's own
 * controller declares — the routes, their methods, their bodies — and it is
 * written against `apps/api/src/auth/auth.controller.ts`, which is worth
 * re-reading if one of these ever goes red.
 */
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index";

/** A call, as it left the client. */
interface Sent {
  path: string;
  method: string;
  body: unknown;
}

/** A client whose transport records instead of sending. */
function recording() {
  const sent: Sent[] = [];
  const client = createApiClient(async <T,>(
    path: string,
    opts?: { method?: string; body?: unknown },
  ): Promise<T> => {
    sent.push({ path, method: opts?.method ?? "GET", body: opts?.body });
    return {} as T;
  });
  return { client, sent, last: () => sent[sent.length - 1]! };
}

describe("signing in", () => {
  it("posts one identifier and a password to the login route", async () => {
    const { client, last } = recording();
    await client.auth.login("01711111111", "hunter22");
    expect(last()).toEqual({
      path: "/auth/login",
      method: "POST",
      body: { identifier: "01711111111", password: "hunter22" },
    });
  });

  /**
   * The controller reads `identifier ?? phone ?? email`, and the console's
   * login box takes either without asking which it was given. The client must
   * not decide: an address with an `@` and a phone number travel the same way.
   */
  it("sends an email the same way it sends a phone", async () => {
    const { client, last } = recording();
    await client.auth.login("desk@skyeco.example", "hunter22");
    expect(last()!.body).toEqual({
      identifier: "desk@skyeco.example",
      password: "hunter22",
    });
  });
});

describe("a password somebody cannot remember", () => {
  it("asks for a reset by whichever identifier was typed", async () => {
    const { client, last } = recording();
    await client.auth.forgotPassword("desk@skyeco.example");
    expect(last()).toEqual({
      path: "/auth/password/forgot",
      method: "POST",
      body: { identifier: "desk@skyeco.example" },
    });
  });

  it("sets the new one against the token from the email", async () => {
    const { client, last } = recording();
    await client.auth.resetPassword("tok-abc", "a-new-password");
    expect(last()).toEqual({
      path: "/auth/password/reset",
      method: "POST",
      body: { token: "tok-abc", password: "a-new-password" },
    });
  });
});

describe("a password somebody is changing on purpose", () => {
  it("sends the current one with the new one", async () => {
    const { client, last } = recording();
    await client.auth.changePassword("a-new-password", "the-old-one");
    expect(last()).toEqual({
      path: "/auth/me/password",
      method: "POST",
      body: { newPassword: "a-new-password", currentPassword: "the-old-one" },
    });
  });

  /**
   * An account created by an invitation has no password yet, and the
   * controller only demands the current one when a hash exists. Sending
   * `currentPassword: undefined` is not the same as omitting it — `qs` learned
   * that lesson for query strings and a body deserves it too.
   */
  it("omits the current one for an account that has none", async () => {
    const { client, last } = recording();
    await client.auth.changePassword("a-first-password");
    expect(last()!.body).toEqual({ newPassword: "a-first-password" });
    expect(Object.keys(last()!.body as object)).not.toContain("currentPassword");
  });
});

describe("opening an account", () => {
  it("posts a resort signup", async () => {
    const { client, last } = recording();
    await client.auth.signup({
      companyName: "Sky Eco",
      resortName: "Sky Eco Resort",
      name: "Abir",
      email: "abir@skyeco.example",
      phone: "01711111111",
      password: "hunter22",
      plan: "growth",
    });
    expect(last()!.path).toBe("/auth/signup");
    expect(last()!.method).toBe("POST");
    expect((last()!.body as { plan: string }).plan).toBe("growth");
  });

  it("posts an agency signup to its own route", async () => {
    const { client, last } = recording();
    await client.auth.signupAgency({
      agencyName: "Padma Tours",
      name: "Riaz",
      email: "riaz@padma.example",
      phone: "01722222222",
      password: "hunter22",
    });
    expect(last()!.path).toBe("/auth/signup/agency");
    expect(last()!.method).toBe("POST");
  });
});

/**
 * Not a new route — a type that was wrong.
 *
 * `GET /auth/permissions` has answered `{ permissions, features }` since
 * 2026-09-17, when a plan became a second reason a screen might not be yours.
 * The client's signature still promised only `permissions`, so the one caller
 * who reads `features` had to widen the result by hand, and a caller who
 * trusted the signature would have hidden nothing the plan excludes.
 */
describe("what this person may do", () => {
  it("answers with the plan's features as well as the permissions", async () => {
    const client = createApiClient(async <T,>(): Promise<T> =>
      ({ permissions: ["bookings.view"], features: ["restaurant"] }) as T);
    const answer = await client.permissions(7);
    expect(answer.permissions).toEqual(["bookings.view"]);
    expect(answer.features).toEqual(["restaurant"]);
  });

  it("asks about a resort when there is one, and about nobody's when there is not", async () => {
    const { client, sent } = recording();
    await client.permissions(7);
    await client.permissions();
    expect(sent.map((s) => s.path)).toEqual([
      "/auth/permissions?resortId=7",
      "/auth/permissions",
    ]);
  });
});

/**
 * The rule the app is built on, checked rather than trusted.
 *
 * Every route the auth controller declares has a method here. When somebody
 * adds a route to that controller they will add it here too, because this
 * fails until they do — which is the whole point of writing the list down in
 * a place a compiler reads.
 */
describe("the auth controller's whole surface", () => {
  it("is reachable without a screen writing a path", () => {
    const { client } = recording();
    for (const name of [
      "login",
      "signup",
      "signupAgency",
      "forgotPassword",
      "resetPassword",
      "changePassword",
    ] as const) {
      expect(typeof client.auth[name], `client.auth.${name}`).toBe("function");
    }
    // `me` and `permissions` are on the client already, at its top level
    expect(typeof client.me).toBe("function");
    expect(typeof client.permissions).toBe("function");
  });
});
