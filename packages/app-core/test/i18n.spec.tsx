/**
 * The dictionaries, which are the single most drift-prone thing in this repo.
 *
 * Two copies of a translation table do not stay equal. Somebody fixes a word
 * on the console, nobody fixes it on the phone, and a year later the same
 * screen says two different things to the same person depending on what they
 * are holding. This is the file that made a shared package worth building at
 * all.
 *
 * English is the default and Bangla is the toggle — the owner's ruling, and a
 * native screen does not get to disagree with the product it belongs to.
 */
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DICTS, DEFAULT_LANG, LangProvider, isStateKey, useLang, useT } from "../src/i18n";
import { memoryStorage } from "../src/storage";

let controls: ReturnType<typeof useLang>;

function Probe() {
  controls = useLang();
  const t = useT();
  return <span data-testid="word">{t("nav.dashboard")}</span>;
}

const word = () => screen.getByTestId("word").textContent;

describe("the dictionaries", () => {
  /**
   * A compile-time check for this already exists in the source. It is repeated
   * at runtime because the compile-time one is a single type annotation that a
   * future edit can delete without anybody noticing it was load-bearing.
   */
  it("carry every English key in Bangla", () => {
    const missing = Object.keys(DICTS.en).filter((k) => !(k in DICTS.bn));
    expect(missing).toEqual([]);
  });

  it("carry no Bangla key that English does not have", () => {
    const extra = Object.keys(DICTS.bn).filter((k) => !(k in DICTS.en));
    expect(extra).toEqual([]);
  });

  it("leave no translation blank", () => {
    const blank = Object.entries(DICTS.bn).filter(([, v]) => !String(v).trim());
    expect(blank).toEqual([]);
  });

  it("knows which keys it actually carries", () => {
    expect(isStateKey("nav.dashboard")).toBe(true);
    expect(isStateKey("nav.invented")).toBe(false);
  });
});

describe("LangProvider", () => {
  it("opens in English", () => {
    expect(DEFAULT_LANG).toBe("en");
    render(
      <LangProvider storage={memoryStorage()}>
        <Probe />
      </LangProvider>,
    );
    expect(word()).toBe(DICTS.en["nav.dashboard"]);
  });

  it("opens in whatever the person chose last time", () => {
    const storage = memoryStorage();
    storage.setItem("rh.lang", "bn");
    render(
      <LangProvider storage={storage}>
        <Probe />
      </LangProvider>,
    );
    expect(word()).toBe(DICTS.bn["nav.dashboard"]);
  });

  it("ignores a stored value that is not a language", () => {
    const storage = memoryStorage();
    storage.setItem("rh.lang", "fr");
    render(
      <LangProvider storage={storage}>
        <Probe />
      </LangProvider>,
    );
    expect(word()).toBe(DICTS.en["nav.dashboard"]);
  });

  it("remembers a change, so the next launch opens the same way", () => {
    const storage = memoryStorage();
    render(
      <LangProvider storage={storage}>
        <Probe />
      </LangProvider>,
    );
    act(() => controls.setLang("bn"));
    expect(word()).toBe(DICTS.bn["nav.dashboard"]);
    expect(storage.getItem("rh.lang")).toBe("bn");
  });

  it("works with no storage at all, which is what a server render is", () => {
    render(
      <LangProvider storage={null}>
        <Probe />
      </LangProvider>,
    );
    expect(word()).toBe(DICTS.en["nav.dashboard"]);
    expect(() => act(() => controls.setLang("bn"))).not.toThrow();
    expect(word()).toBe(DICTS.bn["nav.dashboard"]);
  });

  /**
   * Deliberately not a throw. A label rendering in English outside the
   * provider is a cosmetic fault; a screen that will not render at all is not.
   */
  it("answers in English outside a provider rather than bringing the screen down", () => {
    render(<Probe />);
    expect(word()).toBe(DICTS.en["nav.dashboard"]);
  });
});
