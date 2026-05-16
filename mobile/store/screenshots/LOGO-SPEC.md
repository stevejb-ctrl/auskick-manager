# Logo / wordmark spec — Siren Footy

For a designer (Claude design or human) reproducing the Siren
Footy logo accurately. Two variants exist: the **wordmark** ("Siren"
text + dot) used in marketing surfaces, and the **icon** (just the
S + dot lockup) used as the app icon. Both are anchored on the
same custom dot-on-the-corner motif but render at different scales
and contexts.

The runtime app sometimes wraps these in an animated halo
(`SirenPulseHalo`) — that's an interactive UX effect that fires
when in-app events happen. It is NOT part of the static logo. If
the logo looks like it has a glowing ring around it in any source
material, ignore the ring — the static logo doesn't have one.

Last reviewed: 16 May 2026

---

## TL;DR — what's in the logo

| Element | Value |
|---|---|
| **Wordmark text** | `Siren` (capital S, lowercase i-r-e-n) |
| **Font** | Geist Sans, weight 900 (black), tight tracking |
| **Wordmark colour** | `#141613` (near-black, slightly green-tinted ink) |
| **Dot** | Solid filled circle, NOT outlined, NOT haloed |
| **Dot colour** | `#D9442D` (siren-red / alarm token) |
| **Dot position** | Top-right of the wordmark, sitting OUTSIDE the cap height of the "n" |
| **No tagline, no underline, no shadow** | The mark is just text + dot |

---

## Wordmark variant *(use this on marketing surfaces)*

The wordmark is the standard mark used in app headers, the
marketing site, and the feature graphic — anywhere we want the
brand name visible alongside the dot signature.

### Geometry (from `public/siren-logo.svg`)

The canonical SVG renders at 540 × 200 px, but it's a vector so
scale it to whatever the canvas needs. Geometry within that
viewbox:

```
viewBox: 0 0 540 200

text "Siren":
  font: Geist Sans, weight 900
  font-size: 180px
  letter-spacing: -9 (tight; nearly touching)
  x: 20, y: 160 (baseline; text sits in the lower 80% of the box)
  fill: #141613

dot:
  centre: (500, 58)
  radius: 18
  fill: #D9442D
```

In plain English: the "Siren" text is huge and tight-tracked, with
the dot floating up and to the right of where the final "n" would
end. The dot sits **above** the cap height of "n" — NOT inline
with it, NOT on the baseline. Think "punctuation that's broken
free from the typography and become its own thing".

### Visual reference

The vector lives at `public/siren-logo.svg`. Open it in a browser
or vector editor for a 1:1 reference. Don't try to recreate the
geometry by eye — the file is the source of truth.

If the designer needs a raster, the screenshots in
`mobile/store/screenshots/ios/` all show the wordmark in context
at various sizes. Shot 02 (game-recap) has the smallest header
wordmark; shot 00 (hero-gameplay) has a larger marketing-scale
version centred at the top.

### Clear space

Minimum 0.5× the dot diameter (so 9px in the 540×200 source, or
roughly half the dot's size, scaled with the mark) of empty space
on all sides. Never crop the mark closer than that.

### Sizes

Don't scale below 80px wide. At smaller sizes the letterforms get
murky and the dot loses its punctuation feel. Use the icon variant
(below) for anything smaller.

---

## Icon variant *(use this for app icon / favicon contexts)*

The icon is the S + dot lockup — just the first letter of the
wordmark, retaining the dot. Used in the app icon, favicon, and
anywhere a square mark is needed (social profile pics, button
backgrounds).

### Geometry (from `public/favicon.svg` / `mobile/assets/icon.png`)

```
viewBox: 0 0 64 64

background:
  rounded rect, full bleed
  fill: #F7F5F1 (cream — the surface-alt token, kinda)
  corner radius: 14 (roughly 22% of side — standard iOS-friendly rounding)

text "S":
  font: Geist Sans, weight 900
  font-size: 44px
  letter-spacing: -2
  centre at x: 32, y: 46 (text-anchor: middle)
  fill: #141613

dot:
  centre: (50, 20)
  radius: 6
  fill: #D9442D
```

Same dot motif, scaled to suit. The cream background is part of
the icon — don't strip it. The icon master at 1024 × 1024 lives
at `mobile/assets/icon.png` if you need a raster.

The dot in the icon variant sits in the upper-right area of the
square, well clear of the "S" letterform — the same "punctuation
that escaped the type" feel as the wordmark.

---

## Colours

Exact-match these. Don't approximate — the colours are tokens in
the design system and look wrong if shifted even a few hex points.

| Use | Hex | Token name |
|---|---|---|
| Wordmark / S | `#141613` | `ink` (very-near-black, slightly green-tinted — NOT pure `#000000`) |
| Dot | `#D9442D` | `alarm` (siren-red, **the** brand-defining accent) |
| Icon background | `#F7F5F1` | Cream — soft off-white, NOT pure white |

Tints / variants:
- On dark backgrounds (anything darker than `surface-alt` /
  `#EFECE6`), use the **dark wordmark variant** —
  `public/siren-logo-dark.svg` — which inverts the wordmark text
  to the warm cream `#F7F5F1`. The dot stays red regardless of
  background.
- The dot is ALWAYS red. Never tinted, never desaturated, never
  outlined. Even on a red background, the dot stays
  `#D9442D` — if there's a contrast issue, change the background
  instead.

---

## What NOT to do

- **No halo / glow / ring around the dot.** The `SirenPulseHalo`
  component in the codebase animates a ring around in-app
  elements when events happen — it's a runtime UX affordance,
  not part of the static logo. The dot is just a flat solid
  circle.
- **No outlined dot.** Solid fill only.
- **No animation in static surfaces.** The marketing brief might
  pulse the dot for video assets later, but the static App Store /
  Play Store screenshots + feature graphic must use a still dot.
- **No alternate dot colours.** Not blue, not green, not on-brand-
  but-different. The dot is `#D9442D` everywhere.
- **No re-arranged geometry.** Dot stays top-right of the
  wordmark / S. Don't try "dot before the word" or "dot under the
  word" — the recognisable signature is dot-top-right.
- **No additional typography.** No "FOOTY" subtitle, no ".com.au"
  TLD, no tagline as part of the lockup. The mark is JUST "Siren"
  + dot, or JUST "S" + dot.
- **Don't recreate the letterforms by hand.** Geist Sans is a real
  font (the `geist` npm package). Use it. If the designer doesn't
  have access, install from https://vercel.com/font or grab the
  TTFs from `node_modules/geist/dist/fonts/` after running
  `npm install`.

---

## Quick visual check

If the rendered logo passes all of these, it's right:

- [ ] "Siren" is tight-tracked, near-black, weight 900
- [ ] The dot is a solid red circle, no ring, no glow, no outline
- [ ] The dot sits above the cap height of "n", not on the baseline
- [ ] The dot is offset to the right — visually punctuating the end
      of "Siren"
- [ ] On a light background, the wordmark is `#141613`; on dark,
      it's `#F7F5F1`
- [ ] The dot is `#D9442D` regardless of background

If any of those are off, it's not on-brand yet.

---

## File locations

| Asset | Path |
|---|---|
| Vector wordmark (light) | `public/siren-logo.svg` |
| Vector wordmark (dark) | `public/siren-logo-dark.svg` |
| Vector icon | `public/favicon.svg` |
| Master raster icon (1024 × 1024) | `mobile/assets/icon.png` |
| Marketing PNG variants | `public/siren-logo-512.png`, `public/favicon-512.png`, `public/favicon-180.png` |
| Brand colour vars (source of truth) | `src/app/globals.css` (`--brand-*`, `--alarm`, `--ink`) |
| This spec | `mobile/store/screenshots/LOGO-SPEC.md` |
