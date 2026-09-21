/**
 * The app's transport, and the three rules it carries.
 *
 * `@rh/shared`'s client types every route and injects its transport — "where
 * a token lives is not this file's concern". This is where the token lives
 * for the phone, so it is where those concerns are: which address, whose
 * session, and what a refusal means.
 */
import { APP_PLATFORM_HEADER, APP_VERSION_HEADER, ApiError } from "@rh/shared";
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


/**
 * What the build calls itself, and what happens when the server says no
 * (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store, so nothing updates
 * anybody and no store enforces a floor. The server's floor is applied
 * to a header this transport sets, and the refusal it answers with is
 * the one thing standing between an old build and quietly doing the
 * wrong thing with somebody's money.
 */
describe("what the build says it is", () => {
  it("names its version and platform on every call", async () => {
    const { fetcher, calls } = answering(200, {});
    const api = makeApi({
      baseUrl: BASE,
      storage: memoryStorage(),
      fetch: fetcher,
      appVersion: "0.7.0",
      appPlatform: "android",
    });
    await api("/auth/me");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers[APP_VERSION_HEADER]).toBe("0.7.0");
    expect(headers[APP_PLATFORM_HEADER]).toBe("android");
  });

  /**
   * On every request, not at sign-in. A phone signs in once and runs
   * for weeks; a floor raised on Tuesday can only reach the person who
   * signed in on Monday through the next call they make.
   */
  it("says it again on the second call, not only the first", async () => {
    const { fetcher, calls } = answering(200, {});
    const api = makeApi({
      baseUrl: BASE,
      storage: memoryStorage(),
      fetch: fetcher,
      appVersion: "0.7.0",
    });
    await api("/auth/me");
    await api("/bookings");
    for (const c of calls) {
      expect((c.init.headers as Record<string, string>)[APP_VERSION_HEADER]).toBe("0.7.0");
    }
  });

  /**
   * The console shares this client through its own transport and sends
   * no version; a development bundle has none either. Sending the
   * header empty would make them look like a build claiming to be
   * nothing, and `appStanding` would have to guess.
   */
  it("sends no version header when the build has no version", async () => {
    const { fetcher, calls } = answering(200, {});
    await makeApi({ baseUrl: BASE, storage: memoryStorage(), fetch: fetcher })("/auth/me");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(APP_VERSION_HEADER in headers).toBe(false);
    expect(APP_PLATFORM_HEADER in headers).toBe(false);
  });
});

describe("when the server refuses the build", () => {
  it("tells the shell to show the update screen", async () => {
    const onUpdateRequired = jest.fn();
    const { fetcher } = answering(426, { message: "too old" });
    const api = makeApi({
      baseUrl: BASE,
      storage: memoryStorage(),
      fetch: fetcher,
      appVersion: "0.1.0",
      onUpdateRequired,
    });
    await expect(api("/bookings")).rejects.toBeInstanceOf(ApiError);
    expect(onUpdateRequired).toHaveBeenCalledTimes(1);
  });

  /**
   * The token stays exactly where it is. This is the server refusing
   * the *build*, not the person — clearing it would cost them their
   * password after installing the update, a second problem we caused
   * on top of the first.
   */
  it("leaves the session alone, and does not sign anybody out", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-token");
    const onSignedOut = jest.fn();
    const { fetcher } = answering(426, { message: "too old" });
    const api = makeApi({
      baseUrl: BASE,
      storage,
      fetch: fetcher,
      appVersion: "0.1.0",
      onSignedOut,
      onUpdateRequired: jest.fn(),
    });
    await expect(api("/bookings")).rejects.toBeInstanceOf(ApiError);
    expect(storage.getItem("rh.token")).toBe("a-token");
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  /** A 401 is still a 401: the two refusals must not be confused. */
  it("does not mistake an ordinary refusal for an old build", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-token");
    const onUpdateRequired = jest.fn();
    const { fetcher } = answering(401, { message: "nope" });
    const api = makeApi({
      baseUrl: BASE,
      storage,
      fetch: fetcher,
      appVersion: "0.7.0",
      onUpdateRequired,
      onSignedOut: jest.fn(),
    });
    await expect(api("/bookings")).rejects.toBeInstanceOf(ApiError);
    expect(onUpdateRequired).not.toHaveBeenCalled();
  });
});
