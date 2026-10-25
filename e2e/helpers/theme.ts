// Measuring a screen in the dark theme: is the page actually dark, and
// does every word on it still read? Used by dark-theme.spec.ts.

import { expect, type Page, type TestInfo } from "@playwright/test";

export interface TextSample {
  text: string;
  ratio: number;
  min: number;
  fg: string;
  bg: string;
}

export interface ThemeReport {
  /** Relative luminance of the body's painted background (0 black … 1 white). */
  bodyLum: number;
  colorScheme: string;
  sampled: number;
  failures: TextSample[];
}

/**
 * Reads the painted page: the body background, the root's color-scheme,
 * and the contrast of every visible run of text against what's painted
 * behind it (the backgrounds of its ancestors, alpha-blended). Text in a
 * disabled control is exempt (WCAG 1.4.3), and large text needs 3:1.
 * `within` limits the text sample to one element (an open sheet).
 */
export async function readTheme(page: Page, within?: string): Promise<ThemeReport> {
  return page.evaluate((sel) => {
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.slice(0, 3).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const hex = (rgb: number[]) => "#" + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const painted = (node: Element): number[] => {
      const layers: number[][] = [];
      for (let n: Element | null = node; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
      }
      let bg = parse(getComputedStyle(document.body).backgroundColor);
      if (bg[3] < 1) bg = over(bg, parse(getComputedStyle(document.documentElement).backgroundColor).map((v, i) => (i === 3 ? 1 : v)));
      for (const layer of layers.reverse()) bg = over(layer, bg);
      return bg;
    };

    const root = sel ? document.querySelector(sel) : document.body;
    const failures: { text: string; ratio: number; min: number; fg: string; bg: string }[] = [];
    let sampled = 0;
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = (t.textContent ?? "").trim();
      const el = t.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || s.visibility !== "visible" || s.display === "none") continue;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      // Disabled controls are exempt (WCAG 1.4.3), and so are decorative
      // glyphs hidden from assistive tech (the → between swap names).
      if (el.closest("[disabled], [aria-disabled=true], .sr-only, [aria-hidden=true], noscript, script, style, title")) continue;
      // Clipped away (sr-only patterns without the class).
      if (s.position === "absolute" && r.width <= 1 && r.height <= 1) continue;
      let opacity = 1;
      for (let o: Element | null = el; o; o = o.parentElement) opacity *= Number(getComputedStyle(o).opacity);
      if (opacity < 0.1) continue;
      const bg = painted(el);
      const fg0 = over(parse(s.color), bg);
      const fg = [0, 1, 2].map((i) => fg0[i] * opacity + bg[i] * (1 - opacity));
      const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      const size = parseFloat(s.fontSize);
      const bold = Number(s.fontWeight) >= 700;
      const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      sampled++;
      if (ratio < min) failures.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100, min, fg: hex(fg), bg: hex(bg) });
    }
    return {
      bodyLum: lum(painted(document.body)),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      sampled,
      failures,
    };
  }, within ?? null);
}

/** The screen is dark and every sampled word passes; saves a screenshot either way. */
export async function expectDarkAndReadable(page: Page, testInfo: TestInfo, name: string, within?: string): Promise<ThemeReport> {
  // Let entrance animations (sheets, cards) land before reading colours.
  await page.waitForTimeout(450);
  await page.screenshot({ path: `playwright/dark-theme/${testInfo.project.name}/${name}.png`, fullPage: false });
  const report = await readTheme(page, within);
  expect(report.bodyLum, `${name}: the page is dark`).toBeLessThan(0.03);
  expect(report.colorScheme, `${name}: form controls and scrollbars follow the theme`).toContain("dark");
  expect(report.sampled, `${name}: some text was sampled`).toBeGreaterThan(0);
  expect(report.failures, `${name}: text under its contrast minimum`).toEqual([]);
  return report;
}
