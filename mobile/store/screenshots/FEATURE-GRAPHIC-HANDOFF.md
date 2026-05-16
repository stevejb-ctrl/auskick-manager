# Design handoff — Play Store feature graphic banner

For a designer (Claude design or human) to produce the Google Play
Store **feature graphic** — the wide banner that sits above the
screenshots on the Play Store listing page. It's roughly Play's
equivalent of Apple's App Store hero, but with a fixed 1024 × 500
aspect ratio and no embedded device mockup required.

Same brand identity as the App Store screenshot set already
produced (see `DESIGN-HANDOFF.md` in this directory) — mint
gradient, two-colour headline, soft decorative elements. Just a
different canvas and a different job to do.

Last reviewed: 16 May 2026

---

## Quick start

1. **What we need:** One PNG at **exactly 1024 × 500 px**, RGB or
   RGBA, sRGB.
2. **Where it goes:** `mobile/store/feature-graphic.png` (one file,
   not in a subfolder — separate deliverable from the screenshots).
3. **Reference style:** The hero shot already produced —
   `mobile/store/screenshots/ios/00-hero-gameplay.png`. Same brand
   palette, same typography, same "soft mint + footy-green
   emphasis" vibe. But this canvas is wide-not-tall, so the
   composition needs to be reworked for landscape.

---

## What's a feature graphic, exactly?

The Play Store equivalent of a header / hero image. It sits **above
the screenshot carousel** on the app's Play Store listing page and
in some Play Store category browse-cards. It's:

- **Required** for any Play Store submission. The Play Console
  won't let you publish without one.
- **Pure marketing** — not a screenshot, not a UI capture. A
  branded visual that conveys what the app does in one glance.
- **Aspect ratio: 1024 × 500** (roughly 2:1). NOT square, NOT a
  phone-mockup aspect. Landscape banner shape.
- **Visible in two contexts**:
    - On the app's listing page: full 1024 × 500, top of the page
      above the screenshots.
    - In Play Store discovery surfaces (search, category browse):
      sometimes cropped or scaled — design for legibility at small
      sizes, similar to the iOS thumbnail consideration.

---

## What it should communicate

Reading order: **logo → headline → visual cue**, in roughly that
sequence. A user glances at this banner for ~1 second and should
walk away knowing three things:

1. **It's Siren Footy** (brand recognition, logo + wordmark)
2. **It's for junior AFL / netball coaches** (audience clarity)
3. **The killer feature is fair rotations** (value prop hook)

Anything beyond those three is a bonus.

---

## Composition guidance

The reference image to draw from is `00-hero-gameplay.png` (in
`mobile/store/screenshots/ios/`). It's vertically composed:
headline up top, phone mockup beneath, decorative dots scattered.
The feature graphic needs the same visual ingredients reorganised
for landscape.

### Suggested layout — left/right split

```
┌────────────────────────────────────────────────────────────┐
│  Siren · (logo + wordmark, top-left)                       │
│                                                            │
│  Run a fair, fun game day.    [glimpse of the field UI,   │
│  Fair rotations,              showing a few player tiles  │
│  automated.                   + the SUGGESTED chip, cut   │
│                               off naturally at the right  │
│  Junior AFL & netball.        edge — implies "more in     │
│                               the app"]                   │
│                                                            │
│  · · ·  (decorative dots in brand-300)                     │
└────────────────────────────────────────────────────────────┘
```

- Left ~55%: brand wordmark up top, two-line headline below, small
  category tagline beneath that, decorative dots in the negative
  space.
- Right ~45%: a stylised glimpse of the live-game UI — a few
  player tiles in their position colours, the SUGGESTED chip
  visible, possibly the score-bug. NOT a full screenshot — a
  curated/cropped tease.

### Alternative layout — full-bleed background + centred copy

If the left/right split feels too busy at thumbnail size, fall
back to a simpler version:

- Soft mint gradient (`brand-50` → `brand-100` left-to-right) as
  the full background.
- Centred Siren wordmark up top.
- Two-line headline in the middle: "**Fair rotations**, automated.
  Junior AFL & netball coaches."
- Scattered decorative dots in `brand-300` around the edges.
- No phone mockup, no UI excerpt. Cleaner, less busy.

Pick whichever serves the legibility-at-small-sizes test better.

---

## Brand reference

Identical to `DESIGN-HANDOFF.md` — repeated here for self-
sufficiency.

### Colours

| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#E4EEE4` | Gradient start (left/top) |
| `--brand-100` | `#CDDFCD` | Gradient mid/end |
| `--brand-300` | `#7CAA7D` | Decorative dots |
| `--brand-500` | `#357840` | Headline emphasis word |
| `--brand-600` | `#2F6B3E` | Primary brand (currently used in CTAs inside screenshots) |
| `--brand-700` | `#275834` | Secondary text emphasis on light backgrounds |
| `ink` | `#1A1E1A` | Primary headline text |
| `ink-dim` | `#5E6860` | Tagline / subhead |
| `alarm` | `#D9442D` | Siren-red — ONLY in the brand-mark dot |

### Typography

- **Headlines:** `Geist Sans`, weight 700, tight tracking
  (`letter-spacing: -0.02em`), line-height 1.1 (feature graphic
  is shorter vertically; tighter line-height helps).
- **Tagline:** `Geist Sans`, weight 500.
- **Fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, sans-serif`.

### Logo / wordmark

- **Master 1024 × 1024 icon:** `mobile/assets/icon.png` (the S+dot
  lockup with the cream background).
- **Vector wordmark + logo:** `public/siren-logo.svg` (preferred
  for crisp scaling).
- **PNG fallbacks:** `public/siren-logo-512.png`,
  `public/favicon-512.png`.

---

## Copy options

Pick whichever reads punchiest at thumbnail size. All four are on-
brand and Play-Store-compliant (no price claims, no superlatives).

**Option A (recommended):**
> Fair rotations, automated.
> Junior AFL & netball coaches.

**Option B:**
> Run a fair, fun game day.
> No spreadsheets.

**Option C:**
> Every player. Every minute. One screen.
*(Matches the hero shot already produced — gives the feature
graphic continuity with screenshot 00.)*

**Option D:**
> Game-day-ready in seconds.
> Built for junior coaches.

In all options the **brand-emphasis word** (in `brand-500`) should
be the value-prop noun, not a verb. So:
- Option A: emphasise "Fair rotations" (green)
- Option B: emphasise "fair, fun game day" or "spreadsheets" (green)
- Option C: emphasise "One screen" (green) — same as the hero shot
- Option D: emphasise "Game-day-ready" (green)

---

## Output spec

| Field | Value |
|---|---|
| Format | PNG (8-bit RGB or RGBA; no animations) |
| Dimensions | **Exactly 1024 × 500 px** (Google rejects anything else) |
| Colour space | sRGB |
| Max file size | 1 MB (Google's hard limit; aim for <600 KB to stay safe) |
| File name | `feature-graphic.png` |
| Output path | `mobile/store/feature-graphic.png` |

---

## Hard constraints (Play Store rules)

- **No "iPhone" or any Apple trademark** — no recognisable iPhone
  silhouettes (notch + Dynamic Island shape), no "iPhone" text, no
  Apple logo. If you reuse a UI excerpt from the iOS screenshots,
  crop out the iPhone bezel.
- **No prices or promo claims** — "Now free", "50% off", "Limited
  time" all get rejected.
- **No superlatives** about the app — "Best", "#1", "Top-rated"
  etc. trigger Play's marketing-claim filters.
- **No external CTAs** — "Visit our website", phone numbers, social
  handles. The banner can't drive traffic outside the listing.
- **No third-party logos / trademarks** — the AFL logo, individual
  club logos (Fitzroy Lions etc.), Auskick logo, netball
  federation logos. Even if you have permission, Play's automated
  filter will flag them.
- **Text legibility at small sizes** — Play discovery surfaces
  scale this image down to ~200px wide on some browse cards. If
  the headline doesn't read at 200px wide, the banner's wasted.

---

## File locations

| Item | Path |
|---|---|
| Output goes here | `mobile/store/feature-graphic.png` |
| Style reference (the hero shot) | `mobile/store/screenshots/ios/00-hero-gameplay.png` |
| Sibling brief (for the iOS screenshots) | `mobile/store/screenshots/DESIGN-HANDOFF.md` |
| Brand colour vars | `src/app/globals.css` (`--brand-*`, `--field`) |
| Brand colour tokens | `tailwind.config.ts` (`surface`, `ink`, `alarm`) |
| Vector logo | `public/siren-logo.svg` |
| Master icon (1024 × 1024) | `mobile/assets/icon.png` |
| App description / tagline copy | `mobile/store/listing.md` (sections "Short description", "Promotional text", "Full description") |

When the banner lands at `mobile/store/feature-graphic.png` it gets
uploaded to Play Console → your app → Main store listing → Graphics
→ Feature graphic. No other downstream file changes.
