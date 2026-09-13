/**
 * Who is signed in, which resort they are looking at, and what they may do.
 *
 * The last and largest module to leave the console, and the one every other
 * one stands on. Getting it wrong has two shapes and both are serious: a
 * person locked out of a resort that is theirs, or a person shown one that is
 * not.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, type AuthValue } from "../src/auth";
import { CacheStore } from "../src/offline-cache";
import { memoryStorage, type Storage } from "../src/storage";

const RESORT = { id: 7, name: "Sky Eco", currency: "BDT", locale: "en-BD" };
const OTHER = { id: 9, name: "Hill View", currency: "BDT", locale: "en-BD" };

const meWith = (role: string, resorts = [RESORT]) => ({
  id: 1,
  role,
  resorts: resorts.map((resort) => ({ resort })),
});

let auth: AuthValue;

function Probe() {
  auth = useAuth();
  return <span data-testid="who">{auth.loading ? "…" : `${auth.role}|${auth.activeResort?.name ?? "none"}`}</span>;
}

const who = () => screen.getByTestId("who").textContent;

function mount(opts: {
  storage?: Storage;
  me?: unknown;
  meFails?: boolean;
  permissions?: string[];
  features?: string[];
  cache?: CacheStore | null;
} = {}) {
  const storage = opts.storage ?? memoryStorage();
  const cache = opts.cache === undefined ? new CacheStore(memoryStorage()) : opts.cache;
  const calls: string[] = [];
  const moneyFormats: unknown[] = [];
  const navigated: string[] = [];

  const api = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/auth/me") {
      if (opts.meFails) throw new Error("401");
      return opts.me ?? meWith("RESORT_ADMIN");
    }
    if (path === "/auth/login") return { accessToken: "fresh-token" };
    return {};
  });

  render(
    <AuthProvider
      storage={storage}
      cache={cache}
      api={api as never}
      permissionsFor={async () => ({
        permissions: opts.permissions ?? ["bookings.view"],
        features: opts.features ?? [],
      })}
      onActiveResort={(r) => void moneyFormats.push(r)}
      navigate={(path) => void navigated.push(path)}
    >
      <Probe />
    </AuthProvider>,
  );
  return { storage, cache, calls, moneyFormats, navigated, api };
}

describe("opening the app", () => {
  it("settles with nobody signed in when there is no token", async () => {
    const { api } = mount();
    await waitFor(() => expect(who()).toBe("|none"));
    expect(api).not.toHaveBeenCalled();
  });

  it("loads the person and activates their resort when there is one", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-real-token");
    mount({ storage });
    await waitFor(() => expect(who()).toBe("RESORT_ADMIN|Sky Eco"));
  });

  it("reopens on the resort they were last looking at, not the first in the list", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-real-token");
    storage.setItem("rh.resortId", "9");
    mount({ storage, me: meWith("MANAGER", [RESORT, OTHER]) });
    await waitFor(() => expect(who()).toBe("MANAGER|Hill View"));
  });

  it("falls back to the first resort when the remembered one is no longer theirs", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-real-token");
    storage.setItem("rh.resortId", "404");
    mount({ storage, me: meWith("MANAGER", [RESORT]) });
    await waitFor(() => expect(who()).toBe("MANAGER|Sky Eco"));
  });

  it("throws away a token the server will not accept", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "expired");
    mount({ storage, meFails: true });
    await waitFor(() => expect(who()).toBe("|none"));
    expect(storage.getItem("rh.token")).toBeNull();
  });
});

describe("signing in", () => {
  it("posts the credentials, keeps the token, and lands on a resort", async () => {
    const { storage, calls } = mount();
    await waitFor(() => expect(who()).toBe("|none"));
    await act(async () => void (await auth.login("owner@skyeco.example", "Password123!")));
    expect(calls).toContain("POST /auth/login");
    expect(storage.getItem("rh.token")).toBe("fresh-token");
    expect(who()).toBe("RESORT_ADMIN|Sky Eco");
  });

  /**
   * Signup mints a token of its own, just as validly as a login does, and has
   * to be able to hand it over without a second round trip.
   */
  it("adopts a token it did not request, and hands back who it belongs to", async () => {
    const { storage } = mount();
    await waitFor(() => expect(who()).toBe("|none"));
    let adopted: { role: string } | undefined;
    await act(async () => void (adopted = (await auth.adoptToken("from-signup")) as { role: string }));
    expect(adopted!.role).toBe("RESORT_ADMIN");
    expect(storage.getItem("rh.token")).toBe("from-signup");
  });
});

describe("signing out", () => {
  it("forgets the token, the cache and the impersonation, and nothing else", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "a-real-token");
    storage.setItem("rh.impersonator", "super-token");
    // things that belong to this device rather than to this person
    storage.setItem("rh.lang", "bn");
    const { cache } = mount({ storage });
    cache!.save("rooms", [1]);
    await waitFor(() => expect(who()).toBe("RESORT_ADMIN|Sky Eco"));

    act(() => auth.logout());

    expect(storage.getItem("rh.token")).toBeNull();
    expect(storage.getItem("rh.impersonator")).toBeNull();
    expect(cache!.load("rooms")).toBeNull();
    // the next person at this counter is not the last one — but the device's
    // language is the device's
    expect(storage.getItem("rh.lang")).toBe("bn");
    expect(who()).toBe("|none");
  });
});

describe("what they may do", () => {
  it("asks for the active resort's permissions and answers from them", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    mount({ storage, permissions: ["bookings.view", "payments.view"] });
    await waitFor(() => expect(auth.perms).toContain("payments.view"));
    expect(auth.can("bookings.view")).toBe(true);
    expect(auth.can("settings.manage")).toBe(false);
  });

  it("treats a star as everything, which is what a super admin carries", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    mount({ storage, me: meWith("SUPER_ADMIN"), permissions: ["*"] });
    await waitFor(() => expect(auth.can("anything.at.all")).toBe(true));
  });

  it("sorts the roles the way every screen asks about them", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    mount({ storage, me: meWith("FRONT_DESK") });
    await waitFor(() => expect(auth.isStaff).toBe(true));
    expect(auth.isManagement).toBe(false);
    expect(auth.isAgent).toBe(false);
  });

  it("reports the plan's features separately from the person's permissions", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    mount({ storage, features: ["restaurant"] });
    await waitFor(() => expect(auth.features).toEqual(["restaurant"]));
  });
});

describe("switching resort", () => {
  it("remembers the choice for next time", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    mount({ storage, me: meWith("MANAGER", [RESORT, OTHER]) });
    await waitFor(() => expect(who()).toBe("MANAGER|Sky Eco"));
    act(() => auth.setActiveResort(OTHER as never));
    expect(who()).toBe("MANAGER|Hill View");
    expect(storage.getItem("rh.resortId")).toBe("9");
  });

  it("tells the host, so money can render in that resort's currency", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "t");
    const { moneyFormats } = mount({ storage });
    await waitFor(() => expect(moneyFormats.at(-1)).toMatchObject({ currency: "BDT" }));
  });
});

/**
 * The platform owner stepping into somebody else's resort. It is audited and
 * banner-marked elsewhere; what matters here is that they can get back out,
 * because a super admin stuck inside a tenant has no route to their own
 * screens at all.
 */
describe("impersonation", () => {
  it("keeps the original session so it can be stepped back into", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "super-token");
    storage.setItem("rh.resortId", "7");
    mount({ storage, me: meWith("SUPER_ADMIN", []) });
    await waitFor(() => expect(who()).toBe("SUPER_ADMIN|none"));

    await act(async () => void (await auth.impersonate("tenant-token")));

    expect(storage.getItem("rh.impersonator")).toBe("super-token");
    expect(storage.getItem("rh.token")).toBe("tenant-token");
    /**
     * The remembered resort is dropped, not carried in. It belonged to the
     * owner's own session, and keeping it would have the impersonated session
     * try to open a resort that is not the tenant's — the exact confusion
     * impersonation exists to avoid.
     */
    expect(storage.getItem("rh.resortId")).toBeNull();
  });

  it("steps back out to the platform", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "tenant-token");
    storage.setItem("rh.impersonator", "super-token");
    const { navigated } = mount({ storage });
    await waitFor(() => expect(who()).toBe("RESORT_ADMIN|Sky Eco"));

    act(() => auth.exitImpersonation());

    expect(storage.getItem("rh.token")).toBe("super-token");
    expect(storage.getItem("rh.impersonator")).toBeNull();
    expect(navigated).toEqual(["/platform"]);
  });

  it("sends them to the login screen when there is no session to step back into", async () => {
    const storage = memoryStorage();
    storage.setItem("rh.token", "tenant-token");
    const { navigated } = mount({ storage });
    await waitFor(() => expect(who()).toBe("RESORT_ADMIN|Sky Eco"));

    act(() => auth.exitImpersonation());

    expect(storage.getItem("rh.token")).toBeNull();
    expect(navigated).toEqual(["/login"]);
  });
});
