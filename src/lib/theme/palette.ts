// ─── Siren's colour tokens, light and dark ──────────────────────────
//
// One source of truth for every semantic colour the app paints. The
// Tailwind config reads it (tailwind.config.ts) to emit CSS variables
// and the `bg-*` / `text-*` / `border-*` utilities, and the contrast
// unit test (src/lib/theme/__tests__/contrast.test.ts) reads it to
// check every pair below in both themes. Change a value here and the
// test tells you whether it still reads.
//
// Three roles per token. In the light theme the three are the same
// value (the palette as it always was), bar a few words that never
// reached AA (see lightText below). The dark theme can split them,
// because one value can't do every job on a dark page:
//   - fill: backgrounds (`bg-warn`, `bg-brand-600`). A strong fill keeps
//     carrying white text, so it stays a mid-dark colour.
//   - text: `text-*`. Text sits on dark surfaces, so it's a light tone
//     of the same hue (`text-warn` is a light amber in dark).
//   - line: `border-*`, `ring-*`, `divide-*`, `outline-*`. Rings and
//     borders have to show on a dark surface (WCAG 1.4.11, 3:1).
//
// `ink` is the one neutral whose roles split the most. In light it is
// near-black: body text, the primary button, and the dark "chrome" of
// the live screen (the clock pill, the sub card, score chips). In dark,
// `text-ink` is near-white, while `bg-ink` stays a dark chrome a step
// above the page, so the clock pill and sub card keep their white
// words and their zone / amber / mint labels (the *-dark tokens) at the
// same contrast they have in light. `text-warm`, the words on that
// chrome, is the page colour in light and near-white in dark.
//
// Values are hex here and channels ("26 30 26") in the CSS, so Tailwind's
// opacity modifiers (`bg-warn/15`) keep working.

export type ThemeName = "light" | "dark";
export type Role = "fill" | "text" | "line";

export interface Token {
  light: string;
  /**
   * Light text / line, where the fill colour is too pale for words
   * (only the four signal colours and one netball ring; see below).
   */
  lightText?: string;
  lightLine?: string;
  /** Dark fill (and text/line unless they're given). */
  dark: string;
  darkText?: string;
  darkLine?: string;
}

/** A token that is the same in both themes and every role. */
const same = (hex: string): Token => ({ light: hex, dark: hex });

export const TOKENS = {
  // ── Surfaces and neutral ink ──────────────────────────────────
  // Dark neutrals keep the light palette's faint green-warm cast.
  warm: { light: "#F7F5F1", dark: "#0F1311", darkText: "#F4F2EC", darkLine: "#3A423D" },
  surface: { light: "#FFFFFF", dark: "#181D1A" },
  "surface-alt": { light: "#EFECE6", dark: "#232925" },
  ink: { light: "#1A1E1A", dark: "#2B322D", darkText: "#EEECE6", darkLine: "#8E978F" },
  "ink-dim": { light: "#5E6860", dark: "#5E6860", darkText: "#B8BFB9", darkLine: "#7D877F" },
  // R6 (UX round 3, e4): was #8A948C, which failed AA everywhere.
  "ink-mute": { light: "#646D66", dark: "#646D66", darkText: "#9CA59E", darkLine: "#7D877F" },
  hairline: { light: "#E3DFD7", dark: "#333B36" },

  // ── Signals ───────────────────────────────────────────────────
  // Signal words. warn, ok, alarm and draw text were 3.5, 4.05, 4.4
  // and 3.9:1 on white or their tints, under AA since they were
  // chosen; their words now take a darker step of the same hue (5.2+
  // on the page). The fills, chips and rings keep the old colour.
  alarm: { light: "#D9442D", lightText: "#BF3820", dark: "#C23A25", darkText: "#FF8E78", darkLine: "#F0705A" },
  "alarm-soft": { light: "#FBE7DF", dark: "#3A1E18" },
  warn: { light: "#C8751F", lightText: "#985610", dark: "#A8590F", darkText: "#F2A65A", darkLine: "#E0913F" },
  "warn-soft": { light: "#F5E5D2", dark: "#36291A" },
  danger: { light: "#B4393A", dark: "#B4393A", darkText: "#F79A97", darkLine: "#E2706E" },
  ok: { light: "#4C8B63", lightText: "#3C7651", dark: "#3F7653", darkText: "#86D09E", darkLine: "#6DBA86" },

  // Game results (ResultChip, the form line, the final hero).
  win: { light: "#2F6B3E", dark: "#2F6B3E", darkText: "#90D4A1" },
  "win-soft": { light: "#E4EEE4", dark: "#183022" },
  loss: { light: "#9A2B2B", dark: "#9A2B2B", darkText: "#F4A0A0" },
  "loss-soft": { light: "#F4DCDC", dark: "#3A1D1D" },
  draw: { light: "#8A6F2A", lightText: "#76601F", dark: "#7A6224", darkText: "#E2C47B" },
  "draw-soft": { light: "#F2E8C9", dark: "#332B17" },

  // ── Zones ─────────────────────────────────────────────────────
  // Colourblind-safe: three well-separated hue families (orange /
  // green / blue) so adjacent zones stay apart on small screens. Steve
  // 2026-05-23 (parent feedback): a fuchsia centre and royal-blue back
  // collapsed into one purple blob at thumbnail size, so the centre is
  // emerald-700, with no blue in it. The blue → green → orange spread
  // keeps luminance contrast where protan / deutan eyes lose red-green.
  // Dark: fills stay saturated (a chip's white words); text takes the
  // light tone the dark sub card already uses (zone-*-dark).
  "zone-f": { light: "#C2410C", dark: "#C2410C", darkText: "#F39A62", darkLine: "#F08A4B" },
  "zone-c": { light: "#047857", dark: "#047857", darkText: "#4CC79D", darkLine: "#3FBF95" },
  "zone-b": { light: "#1D4ED8", dark: "#1D4ED8", darkText: "#9AB2F4", darkLine: "#8FA9F2" },
  // Words on a zone's 15% tint (the bench "→ FWD" strip).
  "zone-f-ink": { light: "#7C2D12", dark: "#7C2D12", darkText: "#F9BC95" },
  "zone-c-ink": { light: "#064E3B", dark: "#064E3B", darkText: "#8BE0C0" },
  "zone-b-ink": { light: "#1E3A8A", dark: "#1E3A8A", darkText: "#BCCDF8" },
  "zone-k": { light: "#7C3AED", dark: "#6D28D9", darkText: "#BBA0F8", darkLine: "#A585F5" },
  "zone-k-text": { light: "#6D28D9", dark: "#6D28D9", darkText: "#BBA0F8" },
  "zone-bench": { light: "#8A857C", dark: "#6F6A62", darkText: "#BAB5AC", darkLine: "#8A857C" },
  "zone-bench-text": { light: "#4A463F", dark: "#4A463F", darkText: "#C7C2B9" },

  // ── In-game re-skin (design session, 17 Oct 2026) ─────────────
  // Zone-time bar fills, stepped by lightness so the zones survive
  // greyscale and sun glare. Dark steps run the other way round
  // (mid / light / lighter) so every bar clears 3:1 on the dark track.
  "zone-f-fill": { light: "#F08A4B", dark: "#F08A4B" },
  "zone-c-fill": { light: "#047857", dark: "#2B9C73" },
  "zone-b-fill": { light: "#1E3A8A", dark: "#AFC2F6" },
  "bar-track": { light: "#ECE8E1", dark: "#2C332E" },
  // Labels on the dark chrome (the sub card, the clock pill). The
  // chrome stays dark in both themes, so these don't change.
  "zone-f-dark": same("#F08A4B"),
  "zone-c-dark": same("#3FBF95"),
  "zone-b-dark": same("#8FA9F2"),
  // Sub-due amber. `due` carries white words (5.1:1); `due-tint` is a
  // due tile's surface; `due-dark` is amber on the chrome.
  due: { light: "#A8590F", dark: "#A8590F", darkText: "#F2A65A", darkLine: "#F2A65A" },
  "due-tint": { light: "#FBF1E6", dark: "#33250F" },
  "due-dark": same("#F2A65A"),
  // Score-button fill.
  well: { light: "#F1EEE8", dark: "#262C28" },
  // Running-clock dot + live countdown ring (on the chrome).
  mint: same("#9ACC9B"),

  // ── Playing surfaces ──────────────────────────────────────────
  // The oval and the court keep their saturated light-theme greens and
  // blues at night: white lines and tiles read on them the same way,
  // and a darkened field turns to mud in sunlight.
  field: same("#3C8050"),
  court: same("#2A74A8"),
  "court-mid": same("#2F7AAF"),

  // Modal / sheet backdrop. `bg-scrim/40`.
  scrim: { light: "#1A1E1A", dark: "#000000" },
} satisfies Record<string, Token>;

export type TokenName = keyof typeof TOKENS;

// ── Brand ladders ──────────────────────────────────────────────────
// `[data-brand]` on <html> picks a ladder (AFL field green by default,
// netball court blue). 500–900 are fills that carry white text, so
// they keep their light values; 50–200 are tints, so in dark they're
// dark tints. Text and line roles take light tones in dark, rising in
// lightness with the step so `text-brand-800` stays the strongest.
export const BRAND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type BrandStep = (typeof BRAND_STEPS)[number];
export type BrandName = "afl" | "netball";

type Ladder = Record<BrandStep, Token>;

export const BRANDS: Record<BrandName, Ladder> = {
  afl: {
    50: { light: "#E4EEE4", dark: "#15231A", darkText: "#E4EEE4", darkLine: "#203628" },
    100: { light: "#CDDFCD", dark: "#1B2E21", darkText: "#CDDFCD", darkLine: "#29432F" },
    200: { light: "#A7C7A7", dark: "#24402D", darkText: "#A7C7A7", darkLine: "#3A6446" },
    300: { light: "#7CAA7D", dark: "#2F5A3B", darkText: "#A3CFA4", darkLine: "#5E9A6C" },
    400: { light: "#568C57", dark: "#3F7A4C", darkText: "#95C9A0", darkLine: "#6AAE7A" },
    500: { light: "#357840", dark: "#357840", darkText: "#94CFA1", darkLine: "#76BB87" },
    600: { light: "#2F6B3E", dark: "#2F6B3E", darkText: "#9DD5A9", darkLine: "#7CC08D" },
    700: { light: "#275834", dark: "#275834", darkText: "#ABDDB5", darkLine: "#8CCB9B" },
    800: { light: "#1F4528", dark: "#1F4528", darkText: "#C0E6C7", darkLine: "#A2D6AE" },
    900: { light: "#183420", dark: "#183420", darkText: "#D4EFD9", darkLine: "#B8E2C1" },
  },
  netball: {
    50: { light: "#EAF4FB", dark: "#12212D", darkText: "#EAF4FB", darkLine: "#1C3346" },
    100: { light: "#CFE6F4", dark: "#172B3A", darkText: "#CFE6F4", darkLine: "#243F55" },
    200: { light: "#A6D0EA", dark: "#1F3B52", darkText: "#A6D0EA", darkLine: "#335A7A" },
    300: { light: "#7BB8DD", dark: "#285072", darkText: "#9DCCEB", darkLine: "#5A9CCB" },
    400: { light: "#5BA5D7", dark: "#2F6A99", darkText: "#90C5E9", darkLine: "#67AEDD" },
    // Court blue's 500 rings a selected tile at 2.9:1 on white; its
    // ring takes a deeper step (3.6:1).
    500: { light: "#4A9FD1", lightLine: "#3A8FC4", dark: "#2E7FB8", darkText: "#8FC6EB", darkLine: "#6AB2E0" },
    600: { light: "#2E7FB8", dark: "#236397", darkText: "#9ACDEE", darkLine: "#78BAE4" },
    700: { light: "#236397", dark: "#236397", darkText: "#ABD5F1", darkLine: "#8AC4E8" },
    800: { light: "#194B76", dark: "#194B76", darkText: "#BFE0F5", darkLine: "#A0D0EE" },
    900: { light: "#0F3357", dark: "#0F3357", darkText: "#D4EBF8", darkLine: "#B7DCF2" },
  },
};

// The keyboard focus ring: at least 3:1 on white, on the page and on
// the chrome (the clock pill, the sub card), so one ring reads on all of
// them (R6). AFL's 600 is 2.8:1 on ink, so AFL rings in 500; court blue's
// 500 is under 3:1 on white, so netball rings in 600.
export const FOCUS: Record<BrandName, Token> = {
  afl: { light: "#357840", dark: "#7CC08D" },
  netball: { light: "#2E7FB8", dark: "#78BAE4" },
};

// ── Resolving ──────────────────────────────────────────────────────

export function resolve(t: Token, theme: ThemeName, role: Role): string {
  if (theme === "light") {
    if (role === "text") return t.lightText ?? t.light;
    if (role === "line") return t.lightLine ?? t.light;
    return t.light;
  }
  if (role === "text") return t.darkText ?? t.dark;
  if (role === "line") return t.darkLine ?? t.dark;
  return t.dark;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#1A1E1A" → "26 30 26", the form the CSS variables hold. */
export function channels(hex: string): string {
  return hexToRgb(hex).join(" ");
}

const VAR_PREFIX: Record<Role, string> = { fill: "c", text: "t", line: "l" };

/** The CSS variable a token's role lives in: `--t-ink`, `--c-brand-600`. */
export function cssVar(name: string, role: Role): string {
  return `--${VAR_PREFIX[role]}-${name}`;
}

/** Every variable for one theme (and one brand's ladder), as { "--c-ink": "26 30 26" }. */
export function themeVars(theme: ThemeName, brand: BrandName | null = "afl"): Record<string, string> {
  const out: Record<string, string> = {};
  const roles: Role[] = ["fill", "text", "line"];
  if (brand === null || brand === "afl") {
    for (const [name, t] of Object.entries(TOKENS)) {
      for (const role of roles) out[cssVar(name, role)] = channels(resolve(t, theme, role));
    }
  }
  if (brand !== null) {
    for (const step of BRAND_STEPS) {
      for (const role of roles) out[cssVar(`brand-${step}`, role)] = channels(resolve(BRANDS[brand][step], theme, role));
    }
    for (const role of roles) out[cssVar("focus", role)] = channels(resolve(FOCUS[brand], theme, role));
  }
  return out;
}

// ── WCAG contrast ──────────────────────────────────────────────────

export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** `top` at `alpha` over `under` (both hex), as hex. */
export function blend(top: string, alpha: number, under: string): string {
  const t = hexToRgb(top);
  const u = hexToRgb(under);
  return (
    "#" +
    t
      .map((v, i) => Math.round(v * alpha + u[i] * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}
