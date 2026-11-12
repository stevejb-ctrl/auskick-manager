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
  it("light fills are the Chalk on grass palette", () => {
    // Live v3 (Nov 2026), from the design's :root. A light fill that
    // moves is a visible change to the light theme; make it on purpose.
    const v3: Record<string, string> = {
      warm: "#F3F6F0", surface: "#FFFFFF", "surface-alt": "#E4EAE2", hairline: "#D3DCD2", ink: "#0B1E15",
      "ink-dim": "#2A3F34", "ink-mute": "#4E6257", field: "#0F4C2B", court: "#1E465F", wood: "#5A3820",
      mark: "#F7FAF5", hivis: "#FF5A1F", "hivis-ink": "#1C0900", "hivis-soft": "#FFE3D6", sun: "#F6C445",
      "sun-ink": "#3A2A00", "sun-soft": "#FCEFC4", sky: "#7CC0F4", "sky-ink": "#06263F", "sky-soft": "#DCEEFC",
      blood: "#C81D36", "blood-soft": "#FBE3E6", danger: "#B91B32", primary: "#0B1E15", "on-primary": "#F7FAF5",
      "zone-f-on-field": "#F6C445", "zone-c-on-field": "#FFFFFF", scrim: "#0B1E15", mint: "#2C7D4E",
      "due-tint": "#FFE3D6",
      // Kept: the colourblind-safe zones for light surfaces, the signals.
      "zone-f": "#C2410C", "zone-c": "#047857", "zone-b": "#1D4ED8", alarm: "#D9442D", warn: "#C8751F", ok: "#4C8B63",
    };
    for (const [name, hex] of Object.entries(v3)) {
      expect(resolve((TOKENS as Record<string, Token>)[name], "light", "fill"), name).toBe(hex);
    }
    // The AFL ladder is the oval ramp; netball keeps court blue.
    expect([BRANDS.afl[500].light, BRANDS.afl[600].light, BRANDS.afl[700].light, BRANDS.afl[800].light]).toEqual([
      "#2C7D4E", "#17653A", "#0F4C2B", "#0A3620",
    ]);
    expect(BRANDS.netball[600].light).toBe("#2E7FB8");
    // The dark page is near-black green, and the field doesn't change.
    expect(TOKENS.warm.dark).toBe("#0A1610");
    expect(TOKENS.field.dark).toBe(TOKENS.field.light);
    // The filled primary inverts at night: chalk fill, ink words.
    expect([TOKENS.primary.dark, TOKENS["on-primary"].dark]).toEqual(["#F3F6F0", "#0B1E15"]);
  });

  it("light text and lines differ from the fill only where a word or ring would be under AA", () => {
    const split = Object.entries(TOKENS)
      .filter(([, t]) => resolve(t as Token, "light", "text") !== (t as Token).light || resolve(t as Token, "light", "line") !== (t as Token).light)
      .map(([n]) => n);
    // The four old signals, due (hi-vis, too pale for words on white),
    // the bright v3 fills, and mint (a dot; its words sit on the chrome).
    expect(split.sort()).toEqual(["alarm", "draw", "due", "hivis", "mint", "ok", "sky", "sun", "warn"]);
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
    expect(vars["--c-ink"]).toBe("27 51 40");
    expect(vars["--t-ink"]).toBe("243 246 240");
    expect(vars["--c-primary"]).toBe("243 246 240");
    expect(vars["--t-on-primary"]).toBe("11 30 21");
    expect(vars["--l-brand-600"]).toBeDefined();
    expect(vars["--c-focus"]).toBeDefined();
    expect(Object.keys(themeVars("light", "netball")).every((k) => /brand|focus/.test(k))).toBe(true);
  });

  it("every pair names a token that exists", () => {
    for (const p of PAIRS) for (const b of BRAND_NAMES) expect(() => [hexOf(p.fg, "dark", b), hexOf(p.bg, "dark", b)]).not.toThrow();
  });
});
