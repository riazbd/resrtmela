/**
 * The app's transport, and the three rules it carries.
 *
 * `@rh/shared`'s client types every route and injects its transport — "where
 * a token lives is not this file's concern". This is where the token lives
 * for the phone, so it is where those concerns are: which address, whose
 * session, and what a refusal means.
 */
import { ApiError } from "@rh/shared";
import { memoryStorage } from "@rh/app-core";
import { makeApi } from "../src/api/transport";

/** A fetch that answers once, and remembers how it was called. */
function answering(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const BASE = "https://api.resortmela.com";

describe("the address it calls", () => {
  it("is the one it was given, joined without a double slash", async () => {
    const { fetcher, calls } = answering(200, {});
    const api = makeApi({ baseUrl: `${BASE}/`, storage: memoryStorage(), fetch: fetcher });
    await api("/auth/me");
    expect(calls[0]!.url).toBe(`${BASE}/auth/me`);
  });
});

describe("whose session it carries", () => {
  it("attaches the token it was left", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-token");
    const { fetcher, calls } = answering(200, {});
    await makeApi({ baseUrl: BASE, storage, fetch: fetcher })("/auth/me");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer a-token",
    );
  });

  it("sends no authorisation at all when nobody is signed in", async () => {
    const { fetcher, calls } = answering(200, {});
    await makeApi({ baseUrl: BASE, storage: memoryStorage(), fetch: fetcher })("/cms/plans");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("what a refusal means", () => {
  it("raises the API's own words, not a generic sentence", async () => {
    const { fetcher } = answering(400, { message: "Wrong current password" });
    const api = makeApi({ baseUrl: BASE, storage: memoryStorage(), fetch: fetcher });
    await expect(api("/auth/me/password", { method: "POST" })).rejects.toThrow(
      "Wrong current password",
    );
  });

  it("raises an ApiError, which the offline queue reads the status off", async () => {
    const { fetcher } = answering(503, {});
    const api = makeApi({ baseUrl: BASE, storage: memoryStorage(), fetch: fetcher });
    await expect(api("/bookings")).rejects.toBeInstanceOf(ApiError);
  });

  /**
   * The rule the console already carries, and the reason it is a rule: a
   * wrong password on the sign-in screen is a 401, and ending the session
   * over it would bounce somebody out of a screen they had not got into yet.
   */
  it("ends the session on a 401 — but only if there was one", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-token");
    const expired = answering(401, {});
    const signedOut = jest.fn();
    await expect(
      makeApi({ baseUrl: BASE, storage, fetch: expired.fetcher, onSignedOut: signedOut })(
        "/auth/me",
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(storage.getItem("rh.token")).toBeNull();
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it("leaves an anonymous 401 alone", async () => {
    const storage = memoryStorage();
    const wrongPassword = answering(401, { message: "Wrong phone or password" });
    const signedOut = jest.fn();
    await expect(
      makeApi({
        baseUrl: BASE,
        storage,
        fetch: wrongPassword.fetcher,
        onSignedOut: signedOut,
      })("/auth/login", { method: "POST", body: { identifier: "x", password: "y" } }),
    ).rejects.toThrow("Wrong phone or password");
    expect(signedOut).not.toHaveBeenCalled();
  });
});

describe("a body", () => {
  it("travels as JSON, and only when there is one", async () => {
    const { fetcher, calls } = answering(200, {});
    const api = makeApi({ baseUrl: BASE, storage: memoryStorage(), fetch: fetcher });
    await api("/bookings", { method: "POST", body: { adults: 2 } });
    await api("/bookings");
    expect(calls[0]!.init.body).toBe('{"adults":2}');
    expect(calls[1]!.init.body).toBeUndefined();
  });
});
