// ─── Siren's colour tokens, light and dark ──────────────────────────
//
// One source of truth for every semantic colour the app paints. The
// Tailwind config reads it (tailwind.config.ts) to emit CSS variables
// and the `bg-*` / `text-*` / `border-*` utilities, and the contrast
// unit test (src/lib/theme/__tests__/contrast.test.ts) reads it to
// check every pair below in both themes. Change a value here and the
// test tells you whether it still reads.
//
// The look is "Chalk on grass" (live v3, Nov 2026): chalk page, ink
// words, an oval-green brand ramp, a shaded field green behind the
// kids, and hi-vis / sun / sky / blood kept for what they mean.
//
// Three roles per token. In the light theme the three are the same
// value, bar the few fills too pale to be words or rings on chalk
// (see lightText below). The dark theme can split them,
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
  // "Chalk on grass" (live v3, Nov 2026): the page is line-marking
  // chalk, cool rather than cream; ink is the oval's shadow, a black
  // green. Dark is a near-black green page with chalk words, so the
  // field green reads as the same grass in both.
  warm: { light: "#F3F6F0", dark: "#0A1610", darkText: "#F3F6F0", darkLine: "#3A5245" },
  surface: { light: "#FFFFFF", dark: "#10211A" },
  "surface-alt": { light: "#E4EAE2", dark: "#182C22" },
  // Dark `bg-ink` is the chrome a step above the dark page (the clock
  // pill, the sub card), so its chalk words and zone labels hold.
  ink: { light: "#0B1E15", dark: "#1B3328", darkText: "#F3F6F0", darkLine: "#8FA397" },
  "ink-dim": { light: "#2A3F34", dark: "#4E6257", darkText: "#BCCBC1", darkLine: "#8A9E92" },
  // About 6:1 on the chalk page.
  "ink-mute": { light: "#4E6257", dark: "#6A7F72", darkText: "#93A79B", darkLine: "#7D9186" },
  hairline: { light: "#D3DCD2", dark: "#2A3F34" },
  // The v3 bottom sheet: chalk in light (white rows sit on it), and in
  // dark a step above the page so it stands off the dimmed screen.
  sheet: { light: "#F3F6F0", dark: "#14271D" },

  // ── Signals ───────────────────────────────────────────────────
  // Signal words. warn, ok, alarm and draw text were 3.5, 4.05, 4.4
  // and 3.9:1 on white or their tints, under AA since they were
  // chosen; their words now take a darker step of the same hue (5.2+
  // on the page). The fills, chips and rings keep the old colour.
  alarm: { light: "#D9442D", lightText: "#BF3820", dark: "#C23A25", darkText: "#FF8E78", darkLine: "#F0705A" },
  "alarm-soft": { light: "#FBE7DF", dark: "#3A1E18" },
  warn: { light: "#C8751F", lightText: "#985610", dark: "#96500D", darkText: "#F2A65A", darkLine: "#E0913F" },
  "warn-soft": { light: "#F5E5D2", dark: "#36291A" },
  // Injuries and errors: the v3 blood red, a step deeper so the
  // "Mark injured" button's line under its label (chalk at 90%) clears
  // AA (4.45:1 on blood itself). The kid's injured mark is `blood`.
  danger: { light: "#B91B32", dark: "#B91B32", darkText: "#FF9AA6", darkLine: "#F0707F" },
  ok: { light: "#4C8B63", lightText: "#3C7651", dark: "#3F7653", darkText: "#86D09E", darkLine: "#6DBA86" },
  // Round 9 (axe): words on the alarm and warn tints, and the alarm
  // button's fill under white words. The fill stays the same deep red
  // in dark (it still carries white); the words take the signal's
  // light tone, as text-alarm / text-warn do.
  "alarm-ink": { light: "#B5321E", dark: "#B5321E", darkText: "#FF8E78" },
  "warn-ink": { light: "#8F5216", dark: "#8F5216", darkText: "#F2A65A" },

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
  "bar-track": { light: "#E4EAE2", dark: "#22382D" },
  // Labels on the dark chrome (the sub card, the clock pill). The
  // chrome stays dark in both themes, so these don't change.
  "zone-f-dark": same("#F08A4B"),
  "zone-c-dark": same("#3FBF95"),
  "zone-b-dark": same("#8FA9F2"),
  // Sub due: hi-vis. `due` still carries white words (old tiles and
  // chips paint `bg-due text-white`), and white on #FF5A1F is 3.1:1,
  // so the fill is a deeper hi-vis (4.6:1). The new live screen uses
  // `hivis` + `hivis-ink` below. `due-tint` is a due tile's surface;
  // `due-dark` is hi-vis on the chrome.
  due: { light: "#D4400C", lightText: "#B8360A", dark: "#D4400C", darkText: "#FF7A45", darkLine: "#FF7A45" },
  "due-tint": { light: "#FFE3D6", dark: "#3A1C10" },
  "due-dark": same("#FF7A45"),
  // Score-button fill.
  well: { light: "#EAEFE8", dark: "#1A2E24" },
  // Running-clock dot + live countdown ring: the oval's highlight
  // green, 3:1 on the chalk header and the ink chrome alike. Its words
  // (the sub card's "Apply") are the old light mint, on the chrome.
  mint: { light: "#2C7D4E", lightText: "#9ACC9B", dark: "#3FA36A", darkText: "#9ACC9B" },

  // ── Playing surfaces ──────────────────────────────────────────
  // Grass in shade, the same in both themes: chalk names clear 7:1 on
  // it, and a field that changed colour at night would read as a
  // different ground. Court and boards follow the same rule.
  field: same("#0F4C2B"),
  court: same("#1E465F"),
  "court-mid": same("#24506B"),
  wood: same("#5A3820"),
  // The edge round an old-style white tile on the field (shadow-lift-
  // field / -court). White in light, where the tile is white; a chalk
  // grey in dark, where the tile is the dark surface and would
  // otherwise sink into the grass (1.7:1).
  "tile-edge": { light: "#FFFFFF", dark: "#8FA397" },
  // The painted lines: names and marks on the grass, court and boards.
  // Plates are `bg-mark/[0.07]` on the field, `bg-ink/[0.045]` on the bench.
  mark: same("#F7FAF5"),
  // Ink words on a chalk mark (a selected kid on the grass). The grass
  // doesn't change at night, so neither does this.
  "mark-ink": same("#0B1E15"),

  // ── Chalk on grass signals (live v3) ──────────────────────────
  // hivis only for "act now"; sun for forwards and "under the
  // minimum"; sky for backs; blood for injuries. Each bright fill
  // carries its own *-ink words in both themes (a hi-vis chip looks
  // the same at night). The *-soft tints go dark in the dark theme,
  // so words on a tint are `text-ink` or the signal's own text tone,
  // never *-ink. Text and line tones split in light because the
  // bright fills are too pale to be words or rings on chalk.
  hivis: { light: "#FF5A1F", lightText: "#B93A0C", lightLine: "#D9440E", dark: "#FF5A1F", darkText: "#FF7A45" },
  "hivis-ink": same("#1C0900"),
  "hivis-soft": { light: "#FFE3D6", dark: "#3A1C10" },
  sun: { light: "#F6C445", lightText: "#7A5900", lightLine: "#A07400", dark: "#F6C445" },
  "sun-ink": same("#3A2A00"),
  "sun-soft": { light: "#FCEFC4", dark: "#33290C" },
  sky: { light: "#7CC0F4", lightText: "#1F5F8F", lightLine: "#3A84BE", dark: "#7CC0F4" },
  "sky-ink": same("#06263F"),
  "sky-soft": { light: "#DCEEFC", dark: "#102A3D" },
  blood: { light: "#C81D36", dark: "#C81D36", darkText: "#FF9AA6", darkLine: "#F0707F" },
  "blood-soft": { light: "#FBE3E6", dark: "#3A1419" },

  // The one filled primary per screen: ink with chalk words on the
  // chalk page; in dark it inverts to a chalk fill with ink words.
  primary: { light: "#0B1E15", dark: "#F3F6F0" },
  "on-primary": { light: "#F7FAF5", dark: "#0B1E15" },

  // Zones on the grass only: sun forwards, white centres, sky backs.
  // Light surfaces (stats, the break, pickers) keep the colourblind-
  // safe zone-f / zone-c / zone-b above.
  "zone-f-on-field": same("#F6C445"),
  "zone-c-on-field": same("#FFFFFF"),
  // Sky is #7CC0F4; on a kid plate that is 4.3:1, so the words take a
  // lighter sky (4.8:1).
  "zone-b-on-field": same("#8FCBF6"),

  // Modal / sheet backdrop. `bg-scrim/40`.
  scrim: { light: "#0B1E15", dark: "#000000" },
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
  // The oval ramp (live v3): 500 the oval's highlight, 600 the oval,
  // 700 the field in shade, 800–900 the deep shadow; 50–400 chalked
  // tints of the same green.
  afl: {
    50: { light: "#E6F0E8", dark: "#0F2219", darkText: "#E6F0E8", darkLine: "#1C3A2A" },
    100: { light: "#CDE2D3", dark: "#132B1F", darkText: "#CDE2D3", darkLine: "#234632" },
    200: { light: "#A3CBAF", dark: "#1A3B2A", darkText: "#A3CBAF", darkLine: "#356249" },
    300: { light: "#74AE86", dark: "#22513A", darkText: "#9FD0AE", darkLine: "#5A9C72" },
    400: { light: "#4A9265", dark: "#2B6A4A", darkText: "#93CBA4", darkLine: "#65AC7D" },
    500: { light: "#2C7D4E", dark: "#2C7D4E", darkText: "#8FD0A5", darkLine: "#6FBC88" },
    600: { light: "#17653A", dark: "#17653A", darkText: "#9CD6AF", darkLine: "#7CC395" },
    700: { light: "#0F4C2B", dark: "#0F4C2B", darkText: "#ABDDBB", darkLine: "#8CCBA2" },
    800: { light: "#0A3620", dark: "#0A3620", darkText: "#C0E6CB", darkLine: "#A2D6B3" },
    900: { light: "#072816", dark: "#072816", darkText: "#D4EFDB", darkLine: "#B8E2C6" },
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
