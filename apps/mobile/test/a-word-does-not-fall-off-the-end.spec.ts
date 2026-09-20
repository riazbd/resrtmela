/**
 * A word does not fall off the end of a row (2026-09-21).
 *
 * The restaurant screen's card was headed **"The"**. The reports screen
 * offered **"This month · Last 90 days · This"**. Both are real strings
 * with a second word — `"The day"`, `"This year"` — and both lost it on
 * the way to the glass.
 *
 * What makes this worth a rule rather than two edits is that nothing
 * could see it except an eye. The accessibility tree carried the whole
 * string, so `uiautomator` read back "This year" while the screen said
 * "This"; every text sweep this project runs would have passed it, and
 * did. React Native's own `onLayout` also reported the full measured
 * width, 49 points for "This year" in a cell 120 points wide, which is
 * to say the framework believed it had drawn the word.
 *
 * The mechanism, once cornered: a `Text` that is a direct child of a
 * `flexDirection: "row"` container, with nothing between them that
 * bounds its width, is measured by Yoga against infinity. Android then
 * paints it with `StaticLayout` into the box it actually got, wraps at
 * the space when the paint needs a hair more room than the measure
 * promised, and clips the second line — because the height was settled
 * for one. A word with no space in it cannot be broken and so never
 * shows the fault, which is why "Agencies" and "Dashboard" were fine
 * and "The day" was not.
 *
 * `Stat` already carried a comment about meeting this once, when a
 * total rendered as "BDT 39,5 / 00" — a number broken across two lines
 * inside its own digits. It was fixed there, in that one component, and
 * the fix was not carried to the others. This is the rule that carries
 * it: in the design system, a `Text` directly inside a row either gets
 * a line count, or gets a parent that bounds its width.
 *
 * Both ways out are legitimate and both are checked. `Row` and `Toggle`
 * take the second — their words live in a `flex: 1` column, so Yoga
 * measures them against a real width and they may wrap as far as they
 * like. `Card`, `Lenses` and `Button` take the first, because a heading
 * and a control's label are one line by design.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DESIGN = join(__dirname, "..", "src", "design");

/** A style that lays its children out side by side. */
function rowStyles(source: string): Set<string> {
  const names = new Set<string>();
  // `name: { … }` inside the StyleSheet, shallow — no nested objects are
  // used in these files, and one that appeared would simply not match
  for (const m of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    if (/flexDirection:\s*"row"/.test(m[2])) names.add(m[1]);
  }
  return names;
}

/** A style that gives its children a width to be measured against. */
function boundedStyles(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    if (/\bflex:\s*1\b/.test(m[2]) || /\bflexShrink:\s*1\b/.test(m[2])) names.add(m[1]);
  }
  return names;
}

interface Loose {
  file: string;
  line: number;
  text: string;
}

interface Tag {
  name: string;
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
  line: number;
}

/**
 * Every element tag in the file, whole.
 *
 * Read character by character rather than line by line, because these
 * components open a tag on one line and close its bracket four lines
 * later. A line-wise regex misses those openings, keeps their closings,
 * and the stack below then answers for the wrong parent — which is how
 * the first draft of this spec accused `date-nav` of a fault it does
 * not have.
 */
function tags(source: string): Tag[] {
  const out: Tag[] = [];
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") line++;
    if (source[i] !== "<") continue;
    const closing = source[i + 1] === "/";
    const nameAt = i + (closing ? 2 : 1);
    const name = /^[A-Z]\w*/.exec(source.slice(nameAt, nameAt + 40))?.[0];
    if (!name) continue;
    // to the tag's own `>`, stepping over the braces and strings inside it
    let j = nameAt + name.length;
    let depth = 0;
    let quote: string | null = null;
    for (; j < source.length; j++) {
      const c = source[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const attrs = source.slice(nameAt + name.length, j);
    out.push({
      name,
      attrs,
      closing,
      selfClosing: attrs.trimEnd().endsWith("/"),
      line,
    });
    line += (attrs.match(/\n/g) ?? []).length;
    i = j;
  }
  return out;
}

/**
 * Every `Text` that a row measures directly, and that has not been told
 * how many lines it may take.
 *
 * A stack walk rather than a regex: the question is which container an
 * element is *inside*, and that is not a property of the line it is on.
 */
function loose(file: string, source: string): Loose[] {
  const rows = rowStyles(source);
  const bounded = boundedStyles(source);
  const found: Loose[] = [];
  /** What each open element does to the width of the text under it. */
  const stack: ("row" | "bounded" | "other")[] = [];

  for (const tag of tags(source)) {
    if (tag.closing) {
      stack.pop();
      continue;
    }
    if (tag.name === "Text") {
      // the nearest ancestor that has an opinion about width
      const nearest = [...stack].reverse().find((k) => k !== "other");
      const told = /numberOfLines|adjustsFontSizeToFit/.test(tag.attrs);
      if (nearest === "row" && !told) {
        found.push({ file, line: tag.line, text: `<Text${tag.attrs.split("\n")[0]}` });
      }
    }
    if (tag.selfClosing) continue;
    const style = /style=\{(?:\[)?\s*styles\.(\w+)/.exec(tag.attrs)?.[1];
    stack.push(
      style && rows.has(style) ? "row" : style && bounded.has(style) ? "bounded" : "other",
    );
  }
  return found;
}

const files = readdirSync(DESIGN).filter((f) => f.endsWith(".tsx"));

describe("a word does not fall off the end of a row", () => {
  it("has the design system to read", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("tells every text inside a row how many lines it may have", () => {
    const offenders = files.flatMap((f) =>
      loose(f, readFileSync(join(DESIGN, f), "utf8")).map(
        ({ line, text }) => `${f}:${line}  ${text}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The scanner is only worth something if it can see the fault it was
   * written for, so it is shown the shape of the two that got through.
   */
  it("sees a heading that a row measures and nobody bounded", () => {
    const bad = `
      const styles = StyleSheet.create({ head: { flexDirection: "row" } });
      export function Card() {
        return (
          <View style={styles.head}>
            <Text step="strong">{title}</Text>
          </View>
        );
      }`;
    expect(loose("bad.tsx", bad)).toHaveLength(1);
  });

  it("passes the same heading once it has been given a line", () => {
    const good = `
      const styles = StyleSheet.create({ head: { flexDirection: "row" } });
      export function Card() {
        return (
          <View style={styles.head}>
            <Text step="strong" numberOfLines={1}>{title}</Text>
          </View>
        );
      }`;
    expect(loose("good.tsx", good)).toEqual([]);
  });

  /** The other way out: a column with a width, which may wrap freely. */
  it("leaves alone a text whose parent gives it a width", () => {
    const good = `
      const styles = StyleSheet.create({
        row: { flexDirection: "row" },
        words: { flex: 1 },
      });
      export function Toggle() {
        return (
          <View style={styles.row}>
            <View style={styles.words}>
              <Text step="body">{label}</Text>
            </View>
          </View>
        );
      }`;
    expect(loose("good.tsx", good)).toEqual([]);
  });
});
