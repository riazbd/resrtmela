/**
 * The design system's first rule, checked rather than trusted.
 *
 * The design says it plainly: "no literal colour or pixel value in a screen
 * file". That rule is what makes a palette a palette rather than a habit —
 * without it the fifth screen invents `#16a34b`, the tenth rounds a corner to
 * 9, and by the twentieth there is no design system, only two hundred
 * decisions nobody can change in one place.
 *
 * A rule like that cannot be kept by intention across sixty-eight screens. So
 * this walks `src` and fails on a colour or a type size written anywhere but
 * the token module — the same shape of guard as the API's
 * `the-console-has-one-address.spec.ts`, which exists for the same reason.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { TOUCH_TARGET, color, elevation, radius, space, text } from "../src/design/tokens";

const SRC = join(__dirname, "..", "src");

/**
 * The WebView of release 0.1.0. It is not a screen written in this design
 * system — it is the thing the design system replaces, and phase 4 deletes
 * it. Exempted by name rather than by silence, and the exemption is checked
 * below so it cannot outlive what it excuses.
 */
/**
 * Nothing, since 2026-09-21.
 *
 * It held `console` — release 0.1.0's WebView, which was a stylesheet for
 * a browser and not a native screen. Phase 4 deleted the WebView and this
 * spec is what said so: "exempts only things that still exist" failed on
 * the next run, which is exactly the job it was given.
 */
const NOT_A_NATIVE_SCREEN: string[] = [];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (NOT_A_NATIVE_SCREEN.includes(entry)) continue;
      out.push(...filesUnder(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Comment lines are prose; a hex code inside one is an explanation. */
const withoutComments = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");

const screenFiles = () =>
  filesUnder(SRC).filter((f) => relative(SRC, f) !== join("design", "tokens.ts"));

describe("where a colour may be written", () => {
  it("is the token module and nowhere else", () => {
    const offenders: string[] = [];
    for (const file of screenFiles()) {
      const found = withoutComments(readFileSync(file, "utf8")).match(
        /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g,
      );
      if (found) offenders.push(`${relative(SRC, file)}: ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("is the only place a type size is written, too", () => {
    const offenders: string[] = [];
    for (const file of screenFiles()) {
      const found = withoutComments(readFileSync(file, "utf8")).match(/fontSize:\s*\d/g);
      if (found) offenders.push(`${relative(SRC, file)}: ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * An exemption that outlives its reason is how a guard rots. Phase 4
   * deleted the WebView, this failed on the next run, and the exemption
   * went with it — which is the whole point of writing it this way. The
   * list is empty now and the case stays, for the next one.
   */
  it("exempts only things that still exist", () => {
    const present = readdirSync(SRC).filter((e: string) =>
      statSync(join(SRC, e)).isDirectory(),
    );
    for (const exempt of NOT_A_NATIVE_SCREEN) {
      expect(present).toContain(exempt);
    }
  });
});

describe("the type scale", () => {
  /**
   * The console's phone stylesheet enforces the same floor. Below twelve
   * points a number on a counter, read at arm's length in daylight, stops
   * being a number and becomes a smudge.
   */
  it("has no step below twelve points", () => {
    for (const size of Object.values(text)) {
      expect(size.size).toBeGreaterThanOrEqual(12);
    }
  });

  it("gives every step a line height with room to read", () => {
    // named in the value so a failure says which step is wrong — jest's
    // `expect` takes no second argument
    const tooTight = Object.entries(text).filter(([, s]) => s.line / s.size < 1.15);
    const tooLoose = Object.entries(text).filter(([, s]) => s.line / s.size > 1.7);
    expect({ tooTight, tooLoose }).toEqual({ tooTight: [], tooLoose: [] });
  });

  it("climbs, so a heading is never smaller than the body under it", () => {
    const sizes = Object.values(text).map((t) => t.size);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
});

describe("spacing", () => {
  it("is on a four-point grid", () => {
    const offenders = Object.entries(space).filter(([, v]) => v % 4 !== 0);
    expect(offenders).toEqual([]);
  });

  it("climbs", () => {
    const steps = Object.values(space);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});

describe("the things a finger has to hit", () => {
  /**
   * 44 is the floor both platforms publish, and the reason it is a constant
   * rather than a number in `Button` is that a row, a tab and a checkbox all
   * owe the same debt to the same finger.
   */
  it("are at least forty-four points", () => {
    expect(TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});

describe("the palette", () => {
  it("is the console's own green, so the two clients are one product", () => {
    expect(color.brand[600]).toBe("#15803d");
  });

  it("says what a colour is for, not what it looks like", () => {
    // a screen asks for `danger`, never for `red`: the day the palette
    // changes, every screen that meant "this is destructive" comes with it
    for (const name of ["ok", "warn", "danger", "info"] as const) {
      expect(typeof color[name].fg).toBe("string");
      expect(typeof color[name].bg).toBe("string");
    }
  });

  it("has a radius scale and an elevation scale to draw with", () => {
    expect(Object.keys(radius).length).toBeGreaterThan(2);
    expect(Object.keys(elevation).length).toBeGreaterThan(1);
  });
});
