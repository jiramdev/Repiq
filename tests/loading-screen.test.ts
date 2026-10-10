import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingScreen } from "@/components/loading-screen";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";
import { THEME_COLOR } from "@/lib/theme";
import { SPLASH_SCREENS, logoWidthFor, splashFile, splashMedia } from "@/lib/splash";
import manifest from "@/app/manifest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("loading screen", () => {
  it("renders the mark on the sampled lavender as an accessible status", () => {
    const html = renderToStaticMarkup(createElement(LoadingScreen));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
    expect(html).toContain("background-color:#baa3d1");
    expect(html).toContain(`viewBox="${LOGO_VIEWBOX}"`);
    expect(html).toContain(LOGO_PATH);
  });

  it("uses the lavender sampled from the artwork everywhere the app starts", () => {
    expect(THEME_COLOR).toBe("#baa3d1");
    const m = manifest();
    expect(m.background_color).toBe(THEME_COLOR);
    expect(m.theme_color).toBe(THEME_COLOR);
    expect(read("scripts/generate-icons.mjs")).toContain(`SPLASH_BACKGROUND = "${THEME_COLOR}"`);
  });

  it("public/icons/logo.svg is the same mark as the component (the SW precaches it)", () => {
    const svg = read("public/icons/logo.svg");
    expect(svg).toContain(`viewBox="${LOGO_VIEWBOX}"`);
    expect(svg).toContain(`d="${LOGO_PATH}"`);
    expect(read("public/sw.js")).toContain('"/icons/logo.svg"');
  });

  it("has a generated iOS startup image for every listed screen", () => {
    for (const screen of SPLASH_SCREENS) {
      expect(existsSync(join(root, "public", splashFile(screen)))).toBe(true);
      expect(splashMedia(screen)).toContain(`(-webkit-device-pixel-ratio: ${screen.ratio})`);
    }
  });

  it("sizes the mark like the CSS clamp(140px, 42vw, 420px)", () => {
    expect(logoWidthFor(320)).toBe(140);
    expect(logoWidthFor(390)).toBeCloseTo(163.8);
    expect(logoWidthFor(2000)).toBe(420);
    expect(read("app/globals.css")).toContain("width: clamp(140px, 42vw, 420px)");
  });

  it("no route still ships a skeleton or spinner", () => {
    for (const page of [
      "app/page.tsx",
      "app/schedule/page.tsx",
      "app/statistics/page.tsx",
      "app/account/page.tsx",
      "app/plans/[id]/page.tsx",
      "app/workout/[id]/page.tsx",
      "app/auth/page.tsx",
    ]) {
      const src = read(page);
      expect(src).not.toMatch(/animate-(pulse|spin)/);
      expect(src).toContain("fallback={<LoadingScreen />}");
    }
    expect(read("app/loading.tsx")).toContain("<LoadingScreen />");
  });
});
