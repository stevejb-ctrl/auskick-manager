import { describe, expect, it } from "vitest";
import {
  BRANDS,
  BRAND_STEPS,
  FOCUS,
  TOKENS,
  blend,
  contrastRatio,
  resolve,
  themeVars,
  type BrandName,
  type Role,
  type ThemeName,
  type Token,
} from "../palette";
import { PAIRS, type Side } from "../pairs";

const THEMES: ThemeName[] = ["light", "dark"];
const BRAND_NAMES: BrandName[] = ["afl", "netball"];

function tokenOf(name: string, brand: BrandName): Token {
  if (name === "focus") return FOCUS[brand];
  const m = name.match(/^brand-(\d+)$/);
  if (m) return BRANDS[brand][Number(m[1]) as (typeof BRAND_STEPS)[number]];
  const t = (TOKENS as Record<string, Token>)[name];
  if (!t) throw new Error(`No token "${name}"`);
  return t;
}

function hexOf(side: Side, theme: ThemeName, brand: BrandName): string {
  if (typeof side === "object") return blend(hexOf(side.over, theme, brand), side.alpha, hexOf(side.under, theme, brand));
  if (side.startsWith("#")) return side;
  const [role, name] = side.split(":") as [Role, string];
  return resolve(tokenOf(name, brand), theme, role);
}

const label = (s: Side): string => (typeof s === "object" ? `${label(s.over)}@${s.alpha * 100}% over ${label(s.under)}` : s);

describe("palette contrast", () => {
  for (const theme of THEMES) {
    for (const brand of BRAND_NAMES) {
      describe(`${theme} / ${brand}`, () => {
        for (const p of PAIRS) {
          // Brand-free pairs are the same for both ladders; check them once.
          const usesBrand = JSON.stringify([p.fg, p.bg]).match(/brand-|focus/);
          if (!usesBrand && brand !== "afl") continue;
          const floor = theme === "light" && p.lightFloor && (!p.lightFloor.brand || p.lightFloor.brand === brand) ? p.lightFloor : null;
          const min = floor ? floor.min : p.kind === "text" ? 4.5 : 3;
          it(`${label(p.fg)} on ${label(p.bg)} ≥ ${min} (${p.where})${floor ? " [known light shortfall]" : ""}`, () => {
            const fg = hexOf(p.fg, theme, brand);
            const bg = hexOf(p.bg, theme, brand);
            const ratio = contrastRatio(fg, bg);
            expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
          });
        }
      });
    }
  }
});

describe("palette shape", () => {
  it("light fills are the palette from before the dark theme", () => {
    // tailwind.config.ts as of R6 (UX round 3). A light fill that moves
    // is a visible change to the light theme; make it on purpose.
    const before: Record<string, string> = {
      warm: "#F7F5F1", surface: "#FFFFFF", "surface-alt": "#EFECE6", ink: "#1A1E1A", "ink-dim": "#5E6860",
      "ink-mute": "#646D66", hairline: "#E3DFD7", alarm: "#D9442D", "alarm-soft": "#FBE7DF", warn: "#C8751F",
      "warn-soft": "#F5E5D2", danger: "#B4393A", ok: "#4C8B63", win: "#2F6B3E", "win-soft": "#E4EEE4", loss: "#9A2B2B",
      "loss-soft": "#F4DCDC", draw: "#8A6F2A", "draw-soft": "#F2E8C9", "zone-f": "#C2410C", "zone-c": "#047857",
      "zone-b": "#1D4ED8", "zone-f-ink": "#7C2D12", "zone-c-ink": "#064E3B", "zone-b-ink": "#1E3A8A", "zone-k": "#7C3AED",
      "zone-k-text": "#6D28D9", "zone-bench": "#8A857C", "zone-bench-text": "#4A463F", "zone-f-fill": "#F08A4B",
      "zone-c-fill": "#047857", "zone-b-fill": "#1E3A8A", "bar-track": "#ECE8E1", "zone-f-dark": "#F08A4B",
      "zone-c-dark": "#3FBF95", "zone-b-dark": "#8FA9F2", due: "#A8590F", "due-tint": "#FBF1E6", "due-dark": "#F2A65A",
      well: "#F1EEE8", mint: "#9ACC9B", field: "#3C8050", court: "#2A74A8", "court-mid": "#2F7AAF",
    };
    for (const [name, hex] of Object.entries(before)) {
      expect(resolve((TOKENS as Record<string, Token>)[name], "light", "fill"), name).toBe(hex);
    }
    expect(BRANDS.afl[600].light).toBe("#2F6B3E");
    expect(BRANDS.netball[600].light).toBe("#2E7FB8");
  });

  it("light text and lines differ from the fill only where a word or ring was under AA", () => {
    const split = Object.entries(TOKENS)
      .filter(([, t]) => resolve(t as Token, "light", "text") !== (t as Token).light || resolve(t as Token, "light", "line") !== (t as Token).light)
      .map(([n]) => n);
    expect(split.sort()).toEqual(["alarm", "draw", "ok", "warn"]);
  });

  it("the dark page and surfaces are dark, and dark text is light", () => {
    for (const name of ["warm", "surface", "surface-alt", "well", "bar-track"] as const) {
      expect(contrastRatio(resolve(TOKENS[name], "dark", "fill"), "#000000"), name).toBeLessThan(1.8);
    }
    for (const name of ["ink", "ink-dim", "ink-mute", "warm"] as const) {
      expect(contrastRatio(resolve(TOKENS[name], "dark", "text"), "#000000"), name).toBeGreaterThan(7);
    }
  });

  it("emits a variable for every role of every token", () => {
    const vars = themeVars("dark", "afl");
    expect(vars["--c-ink"]).toBe("36 42 38");
    expect(vars["--t-ink"]).toBe("238 236 230");
    expect(vars["--l-brand-600"]).toBeDefined();
    expect(vars["--c-focus"]).toBeDefined();
    expect(Object.keys(themeVars("light", "netball")).every((k) => /brand|focus/.test(k))).toBe(true);
  });

  it("every pair names a token that exists", () => {
    for (const p of PAIRS) for (const b of BRAND_NAMES) expect(() => [hexOf(p.fg, "dark", b), hexOf(p.bg, "dark", b)]).not.toThrow();
  });
});
