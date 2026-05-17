# Design handoff — iPad 13" App Store screenshots

For Claude design (or a human designer) to produce the 13-inch iPad
Pro screenshot set. The iPhone set is already done — see
`mobile/store/screenshots/ios/*.png` for reference. Match that style
exactly, just on a wider canvas.

Last reviewed: 16 May 2026

---

## Quick start

1. **What we have:** 6 raw iPad screenshots of the Siren Footy app
   at Apple's exact "13-inch iPad" size (2064 × 2752 portrait).
   They're in `mobile/store/screenshots/raw-ipad/`.
2. **What we want:** Each one composited onto a branded marketing
   canvas with a two-colour headline above it — same template,
   palette, and copy as the iPhone set already produced.
3. **Where the output goes:** `mobile/store/screenshots/ipad/`,
   filenames matching the raws.

Why we need this set: Apple now requires 13-inch iPad screenshots
for any app with iPad in its targeted device family (mandatory
since mid-2024). Siren Footy supports iPad by default, so this is
a hard submission blocker.

---

## Style reference — the iPhone marketed set

You already produced these. Match the style exactly: mint gradient
background, iPhone-style mockup frame, two-colour headline, soft
decorative dots, brand-green emphasis word.

The 7 marketed iPhone shots live at
`mobile/store/screenshots/ios/`:

- `00-hero-gameplay.png`
- `01-games-list.png`
- `02-game-recap.png`
- `03-quarter-break.png`
- `04-lineup-picker.png`
- `05-sub-rotations.png`
- `06-player-actions.png`

Open `00-hero-gameplay.png` and replicate that visual treatment on
the wider iPad canvas. **Use an iPad-frame mockup, not an iPhone-
frame** — visually distinguishes the iPad shots from the iPhone
shots in the App Store listing.

---

## Brand reference

Same as the iPhone brief. Repeated here so this file stands alone.

### Colours

| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#E4EEE4` | Lightest mint — gradient start |
| `--brand-100` | `#CDDFCD` | Light mint — gradient mid/end |
| `--brand-300` | `#7CAA7D` | Decorative dots |
| `--brand-500` | `#357840` | Headline emphasis word |
| `--brand-600` | `#2F6B3E` | Primary brand — CTA backgrounds (already inside app screens) |
| `--brand-700` | `#275834` | Hover/active green |
| `--field` | `#3C8050` | AFL oval green (inside screenshots 3, 5, 6) |
| `ink` | `#1A1E1A` | Primary headline text |
| `ink-dim` | `#5E6860` | Secondary text |
| `alarm` | `#D9442D` | Siren-red — **ONLY** in the brand-mark dot |

### Typography

- **Headlines:** `Geist Sans`, weight 700, tight tracking
  (`letter-spacing: -0.02em`), line-height 1.15.
- **Tagline/subhead:** Geist Sans, weight 500.
- **Fallback:** `-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, sans-serif`.
- Bump headline size on iPad — the canvas is wider so headlines
  can breathe more. The iPhone set used ~38px; on iPad try ~60px
  to keep proportional weight.

### Logo / wordmark

Follow `mobile/store/screenshots/LOGO-SPEC.md` for exact geometry.
TL;DR: "Siren" wordmark in near-black `#141613`, weight 900, with
a solid red dot (`#D9442D`) floating above the cap height of "n".
No halo, no glow, no outline.

Vector source: `public/siren-logo.svg`.

---

## The six screens

Same six story beats and headlines as the iPhone set. The
emphasis word stays the same.

### 01 — Games list

- **Source:** `mobile/store/screenshots/raw-ipad/01-games-list.png`
- **Headline:** "Your whole season **in one tap**."
- **Emphasis:** *in one tap* (green)
- **What's on screen:** Fitzroy Falcons team page → Games tab.
  Three game cards: Coburg Cougars (Live), Northcote Nighthawks
  (Upcoming), Brunswick Bears (Final). PlayHQ import card up top,
  "2026 SEASON / Games" header. Note: the raw iPad shows R2 as
  Live (different from the curated iPhone version which had 4
  games including a manually-added R4 Prahran Prawns); use the
  3-game state shown.

### 02 — Game recap

- **Source:** `mobile/store/screenshots/raw-ipad/02-game-recap.png`
- **Headline:** "Every game, **recapped** for the group chat."
- **Emphasis:** *recapped* (green)
- **What's on screen:** Game detail card for Brunswick Bears
  (FINAL). The raw iPad capture shows the navigation card rather
  than the full FT summary card (which requires a different game
  state). You can either:
    1. Composite the FT-summary content from the iPhone version
       (`ios/02-game-recap.png`) onto the iPad canvas, OR
    2. Use the navigation card content shown in the raw and just
       crop sensibly.
  Option (1) is preferred — it shows the "Copy for group chat"
  CTA which sells the recap value prop.

### 03 — Quarter break

- **Source:** `mobile/store/screenshots/raw-ipad/03-quarter-break.png`
- **Headline:** "**Fair rotations**, suggested automatically."
- **Emphasis:** *Fair rotations* (green)
- **What's on screen:** Live game UI (the raw didn't catch the
  QB-zones panel because that requires the game to be at a
  quarter break in wall-clock time). Two options:
    1. Composite the QB-zones content from the iPhone version
       (`ios/03-quarter-break.png`) — FROM_ZONE → TO_ZONE arrows
       per player. THIS is the killer fairness-suggester
       visualisation; the headline only earns its claim with this
       content visible.
    2. Use the live game UI shown in the raw and let the headline
       carry the message.
  Option (1) preferred.

### 04 — Lineup picker / availability

- **Source:** `mobile/store/screenshots/raw-ipad/04-lineup-picker.png`
- **Headline:** "Build your **starting team** in seconds."
- **Emphasis:** *starting team* (green)
- **What's on screen:** Pre-game lineup picker. Position groups
  with jersey-numbered player tiles. "Ready for Q1" sticky CTA
  at the bottom. Same content as the iPhone version's
  04-lineup-picker.

### 05 — Sub due!

- **Source:** `mobile/store/screenshots/raw-ipad/05-sub-rotations.png`
- **Headline:** "Automate your **sub rotations**."
- **Emphasis:** *sub rotations* (green)
- **What's on screen:** Live game UI (raw didn't catch the
  Sub-due! modal — fires only at the sub interval). Either
  composite the modal from `ios/05-sub-rotations.png` or use the
  live UI with the SUGGESTED — 2 SWAPS banner visible.

### 06 — Player actions

- **Source:** `mobile/store/screenshots/raw-ipad/06-player-actions.png`
- **Headline:** "Every game-day **curveball**, handled."
- **Emphasis:** *curveball* (green)
- **What's on screen:** Live game UI (raw didn't catch the
  Player Actions modal — opens via long-press). Composite the
  modal content from `ios/06-player-actions.png` onto the iPad
  field UI shown in the raw.

---

## A note on the raw captures

The raw iPad shots look sparse — the Next.js app uses `max-w-3xl`
(~768px wide) for most screens, so on a 2064px canvas the screen
content fills the top-center band with empty space below. **This
is normal and expected**; you composite the screen content onto a
wider marketing canvas (iPad-frame mockup + gradient background +
headline) and the empty space below becomes canvas chrome, exactly
how the iPhone treatment worked.

Three of the raws (03 / 05 / 06) don't capture the same modal
states as the iPhone versions because those modals require
runtime user interaction that the auto-capture script can't
reproduce reliably. The recommended approach for those three is
to **lift the modal/overlay artistically from the iPhone marketed
set** and composite it onto the iPad field UI. Apple's review
process doesn't compare iPad vs iPhone shots — they just need to
"represent the app".

---

## Output spec

| Field | Value |
|---|---|
| Format | PNG (8-bit RGB or RGBA; no animations) |
| Dimensions | **2064 × 2752 px** (Apple's 13-inch iPad portrait spec) |
| Colour space | sRGB |
| File names | `01-games-list.png` through `06-player-actions.png` (same as raws) |
| Output dir | `mobile/store/screenshots/ipad/` |
| Count | **6 shots** to match the iPhone story; Apple accepts up to 10 |

---

## Hard constraints (Apple rules)

- **Don't add UI not present in the app.** Marketing text in the
  band area is fine. Fake CTAs / fake notifications inside the
  device-frame area aren't. (Compositing real UI from another
  shot of the same app, like the QB-zones panel from the iPhone
  03 shot, is fine — it IS real app UI.)
- **No prices or promo claims** in screenshot copy.
- **No third-party logos / trademarks** (AFL, Auskick, individual
  club logos).
- **Headline must read at thumbnail scale.** Apple shows the
  first 3 iPad screenshots in their iPad-search results at smaller
  sizes; export each at ~400px wide and check legibility.

---

## File locations

| Item | Path |
|---|---|
| Raw iPad screenshots (your working set) | `mobile/store/screenshots/raw-ipad/*.png` |
| Final marketed output goes here | `mobile/store/screenshots/ipad/*.png` |
| iPhone marketed set (style reference) | `mobile/store/screenshots/ios/*.png` |
| Brand vars source-of-truth | `src/app/globals.css` |
| Logo spec | `mobile/store/screenshots/LOGO-SPEC.md` |
| Vector logo | `public/siren-logo.svg` |

Once the marketed iPad set lands in `ipad/`, the App Store Connect
submission flow accepts them in the iPad section of "Previews and
Screenshots" and the iPad blocker clears. No other downstream file
changes needed.
