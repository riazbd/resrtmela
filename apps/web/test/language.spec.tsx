/**
 * Which language the console opens in.
 *
 * It opened in Bangla for everyone, including the platform team, and the
 * September correction list asked for English. The words are not going
 * anywhere — 108 keys of Bangla stay, and the toggle is one click — but the
 * first screen a new user sees is now English, and whatever they choose is
 * what they get next time.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LangProvider, useLang, useT, DEFAULT_LANG } from "@/lib/i18n";

function Probe() {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="word">{t("nav.bookings")}</span>
      <button onClick={() => setLang("bn")}>switch</button>
    </div>
  );
}

const show = () =>
  render(
    <LangProvider>
      <Probe />
    </LangProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
});

describe("default language", () => {
  it("opens in English", async () => {
    show();
    expect(DEFAULT_LANG).toBe("en");
    expect(await screen.findByTestId("lang")).toHaveTextContent("en");
    expect(screen.getByTestId("word")).toHaveTextContent("Bookings");
  });

  it("keeps the Bangla, one click away", async () => {
    show();
    await act(async () => {
      screen.getByText("switch").click();
    });
    expect(screen.getByTestId("word")).toHaveTextContent("বুকিং");
  });

  it("remembers the choice, so nobody switches twice a day", async () => {
    window.localStorage.setItem("rh.lang", "bn");
    show();
    expect(await screen.findByTestId("lang")).toHaveTextContent("bn");
  });
});
