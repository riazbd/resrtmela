/**
 * The phone's side of the `Storage` port.
 *
 * `@rh/app-core` was written against `window.localStorage`'s contract —
 * synchronous, string in and string out — because eight modules were moved
 * out of the console against it and an asynchronous port would have turned
 * that move into a rewrite. So the phone owes it a synchronous store.
 *
 * The plan named `react-native-mmkv`, and called it "the one unproven
 * dependency in the phase". It is not used, for a reason that only showed up
 * with a device in front of us: MMKV is not in Expo Go, so every look at
 * every screen would have needed a cloud build and the signing key that goes
 * with it. `expo-sqlite/kv-store` has the same synchronous four methods, is
 * in Expo Go, and is maintained alongside the SDK — so a screen can be opened
 * and read the minute it is written.
 */
import { deviceStorage, type SyncKeyValue } from "../src/device/storage";

/** A stand-in with the shape `expo-sqlite/kv-store` presents. */
function fakeKv(): SyncKeyValue & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItemSync: (k) => (held.has(k) ? held.get(k)! : null),
    setItemSync: (k, v) => void held.set(k, v),
    removeItemSync: (k) => held.delete(k),
    clearSync: () => {
      held.clear();
      return true;
    },
  };
}

describe("what the phone remembers", () => {
  it("gives back what it was given", () => {
    const s = deviceStorage(fakeKv());
    s.setItem("rh.token", "a-token");
    expect(s.getItem("rh.token")).toBe("a-token");
  });

  /**
   * `?? null`, never `|| null`. A stored empty string is a value — "they
   * chose no filter" — and an absent key is "they have never opened this
   * screen". The console's own store carries the same note.
   */
  it("tells an empty value apart from a key that was never set", () => {
    const s = deviceStorage(fakeKv());
    s.setItem("rh.filter", "");
    expect(s.getItem("rh.filter")).toBe("");
    expect(s.getItem("rh.never-set")).toBeNull();
  });

  it("forgets one key without touching the rest", () => {
    const s = deviceStorage(fakeKv());
    s.setItem("rh.token", "t");
    s.setItem("rh.lang", "bn");
    s.removeItem("rh.token");
    expect(s.getItem("rh.token")).toBeNull();
    expect(s.getItem("rh.lang")).toBe("bn");
  });

  it("empties itself when told to", () => {
    const s = deviceStorage(fakeKv());
    s.setItem("rh.token", "t");
    s.setItem("rh.lang", "bn");
    s.clear();
    expect(s.getItem("rh.token")).toBeNull();
    expect(s.getItem("rh.lang")).toBeNull();
  });

  /**
   * The port returns nothing from a removal and a clear; the store beneath
   * returns a boolean. Passing that through would have made the app's store a
   * different shape from the console's, which is the one thing the port
   * exists to prevent.
   */
  it("returns nothing, whatever the store beneath it returns", () => {
    const s = deviceStorage(fakeKv());
    expect(s.removeItem("rh.token")).toBeUndefined();
    expect(s.clear()).toBeUndefined();
  });
});

/**
 * The part a fake cannot check: that the real module still has these four
 * methods. If Expo renames one, every screen loses its session on the next
 * launch and nothing else in this suite would notice.
 */
describe("the store the app actually ships with", () => {
  it("still presents the four synchronous methods the port needs", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const kv = require("expo-sqlite/kv-store").default;
    const names = ["getItemSync", "setItemSync", "removeItemSync", "clearSync"] as const;
    // named in the value rather than in a message, so a rename shows up as
    // the method that went missing — jest's `expect` takes no second argument
    expect(names.filter((n) => typeof kv[n] !== "function")).toEqual([]);
  });
});
