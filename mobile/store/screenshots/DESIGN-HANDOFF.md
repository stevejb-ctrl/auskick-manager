# Design handoff — App Store / Play Store marketing screenshots

For a designer (Claude design or human) to produce polished marketing
screenshots in the style of the Golf GameBook App Store listing.
Everything you need is in this file or linked from it.

Last reviewed: 16 May 2026

---

## Quick start

1. **What we have:** 6 raw iPhone screenshots of the Siren Footy app
   at the exact pixel size Apple wants (1320 × 2868). They live in
   `mobile/store/screenshots/raw/`.
2. **What we want:** Each screenshot composited onto a branded
   marketing canvas with a two-colour headline above it, in the
   visual style of the reference image below.
3. **Where the output goes:** Back into
   `mobile/store/screenshots/ios/`, same filenames as the raws, same
   1320 × 2868 dimensions. 6 PNGs in, 6 PNGs out.

Apple shows the first 3 screenshots in search results, so the order
matters — the order below is the planned upload order; flag any
strong reason to change it.

---

## Reference — what "good" looks like

The reference image is a screen capture of the **Golf GameBook**
listing from the App Store, shared 2026-05-16. **Re-attach the
reference when handing this brief off** — it's not committed in the
repo. Look it up at `apps.apple.com/au/app/golf-gamebook` if needed.

Key ingredients in that style:

1. **Soft branded gradient background** (mint-green for Golf
   GameBook — for us, `brand-50` → `brand-100`, the project's
   footy-green ladder).
2. **Two-colour headline** — primary text in `ink-dark`, an
   emphasised word/phrase in `brand-500` (e.g. Golf GameBook's
   "Simple **Digital** Scorecard" with "Digital" in mint).
3. **Phone mockup frame** — the actual screenshot lives inside a
   subtle iPhone bezel, casting a soft shadow on the background.
   Mockup positioned slightly off-centre and tilted ~5° for visual
   energy.
4. **Optional secondary device** — Golf GameBook adds an Apple Watch
   tilted at the bottom-left. We don't have a Watch app; skip this
   OR use an alternative footy-thematic element (Sherrin ball, oval
   silhouette) if it adds without distracting.
5. **Decorative dots/spheres** in soft brand tones scattered around
   the device. Visual interest without competing with the screen.
6. **Composition rhythm:** headline occupies the top ~20% of the
   canvas, device mockup ~65% in the middle/lower area, decorative
   space ~15% around it.

Tone: clean, modern, slightly playful. NOT corporate-flat. NOT
gradient-overload either.

---

## Brand reference

Pulled from `tailwind.config.ts` + `src/app/globals.css`.

### Colours

| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#E4EEE4` | Lightest mint — gradient start |
| `--brand-100` | `#CDDFCD` | Light mint — gradient mid / accent fills |
| `--brand-300` | `#7CAA7D` | Mid green — decorative dots |
| `--brand-500` | `#357840` | Footy green — headline emphasis word |
| `--brand-600` | `#2F6B3E` | Primary brand — CTA backgrounds (already in screenshots) |
| `--brand-700` | `#275834` | Hover/active green — text emphasis on lighter backgrounds |
| `--field` | `#3C8050` | The AFL oval green (visible inside screenshots 3 + 5 + 6) |
| `surface` | `#FFFFFF` | Phone mockup body / inner card surfaces |
| `surface-alt` | `#EFECE6` | Soft cream — alternative canvas background |
| `ink` | `#1A1E1A` | Primary headline text |
| `ink-dim` | `#5E6860` | Secondary headline / subhead |
| `alarm` | `#D9442D` | Siren-red — used sparingly, only for the brand dot in the wordmark |
| `warn` | `#C8751F` | Ochre — Q-break / NEXT chips (don't use in marketing chrome) |

### Typography

- **Headlines:** `Geist Sans`. Weight 700, tight tracking
  (`letter-spacing: -0.02em`), line-height 1.15.
- **Body / subheads:** Geist Sans, weight 500.
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, sans-serif`.
- The app's own UI uses `Geist Mono` for eyebrow labels (e.g.
  "ROUND 01") — feel free to mirror that for any tiny secondary
  text in the marketing canvas.

### Logo / wordmark

- **Master 1024 × 1024 icon:** `mobile/assets/icon.png` — cream
  background, black "S" with a single red dot (the S+dot lockup).
- **Vector:** `public/siren-logo.svg` (ideal for crisp scaling).
- **PNG fallbacks:** `public/siren-logo-512.png`,
  `public/favicon-512.png`.

---

## The six screens

For each shot: the source file (raw screenshot of the app), the
headline copy that goes above it, which word(s) to emphasise in
`brand-500` green, what's visibly on screen, and the story it tells
in 1 sentence.

### 01 — Games list

- **Source:** `mobile/store/screenshots/raw/01-games-list.png`
- **Headline:** "Your whole season **in one tap**."
- **Emphasis:** *in one tap* (green)
- **What's on screen:** Fitzroy Falcons team page → Games tab.
  "2026 SEASON" eyebrow + "Games" heading + filter chips (All /
  Upcoming / Final). "Add games" card explaining PlayHQ import vs
  manual entry, with green "Import from PlayHQ" + ghost "Create
  manually" buttons. Two sections beneath:
    - UPCOMING: R3 vs Northcote Nighthawks (Fri May 22, 5:11 PM),
      R4 vs Prahran Prawns (Sat May 30, 9:45 AM · Prahran
      sportsground). Both showing 0/15 availability chips.
    - COMPLETED: R2 vs Coburg Cougars (Fri May 15), R1 vs Brunswick
      Bears (Sat May 9).
- **Story:** "Here's my whole season at a glance" — the
  season-management value prop. The PlayHQ import card on top is a
  meaningful detail; Australian junior leagues all use PlayHQ.

### 02 — Game recap *(full-time summary + share to group chat)*

- **Source:** `mobile/store/screenshots/raw/02-game-recap.png`
- **Headline:** "Every game, **recapped** for the group chat."
- **Emphasis:** *recapped* (green)
- **What's on screen:** Full-time game summary for Fitzroy Falcons
  vs Coburg Cougars. Top: score-bug Fitzroy Falcons 14.6 (90) vs
  Coburg Cougars 7.5 (47), FT clock 0:00, "FULL TIME" eyebrow + red
  "Restart game" link. The Game Summary card dominates the screen:
    - Section heading + a prominent **green "Copy for group chat"
      button** — the value-prop CTA.
    - Plain-English summary line: "Full time — Fitzroy Falcons v
      Coburg Cougars / Fitzroy Falcons 14.6 (90) def Coburg
      Cougars 7.5 (47)".
    - Scorers line with every goal kicker + their tally.
    - "14 players · 13 subs" chip.
    - Per-player game time breakdown: `#X Name — MM:SS (BCK % · CEN
      % · FWD %)` so a coach sees at a glance who got how much
      across which zones.
  Sticky "Finish game" green CTA at the bottom.
- **Story:** Saturday morning's over. Coach taps "Copy for group
  chat", pastes into team WhatsApp, parents see the result + fair-
  time confirmation for their kid.

### 03 — Quarter break *(the wholesale rebalance — the killer shot)*

- **Source:** `mobile/store/screenshots/raw/03-quarter-break.png`
- **Headline:** "**Fair rotations**, suggested automatically."
- **Emphasis:** *Fair rotations* (green)
- **What's on screen:** The "Set zones for Q2" Quarter Break screen.
  Header "QUARTER BREAK / Set zones for Q2". Two summary chips:
  GAME SETTINGS "Auto-rebalanced · No lent · No injured", SCORE
  "3.2 (20) – 3.1 (19) · +1". Helper line: "Tap any two players to
  swap them — even across zones or to the bench." Two position
  groups visible:
    - FORWARD 4/4: Theo (CENTRE→FORWARD, 4:40), Levi (BACK→FORWARD,
      12:00), Otis (BACK→FORWARD, 12:00), Maya (CENTRE→FORWARD,
      12:00).
    - CENTRE 4/4: Hugo (BACK→CENTRE, 4:40), Frankie (BENCH→CENTRE,
      7:19), Pip (FORWARD→CENTRE, 12:00), Mateo (STAYS, 12:00).
  Each tile shows a FROM_ZONE → TO_ZONE arrow and the player's
  season-time bar. Sticky "Ready for Q2" green CTA at bottom.
- **Story:** The wholesale-rebalance moment is unique to Siren — at
  every quarter break the suggester reshuffles the whole lineup so
  every kid's time across the four quarters evens out. The FROM→TO
  arrows make the fairness logic legible at a glance. If a coach
  takes 1 second to look at the marketing listing, this is the shot
  that sells the app.

### 04 — Mark availability *(pre-game flow start)*

- **Source:** `mobile/store/screenshots/raw/04-lineup-picker.png`
- **Headline:** "Build your **starting team** in seconds."
- **Emphasis:** *starting team* (green)
- **What's on screen:** Pre-game "Mark availability" screen. Header
  "Mark availability" + helper copy. Summary chips: "14 available ·
  1 unavailable". Player rows with jersey number + name +
  Available/Unavailable status pill + toggle button. Ava (#4) shown
  as Unavailable with a "Mark available" green button — surfaces
  the affordance. Sticky "Continue to lineup" CTA at bottom.
- **Story:** The pre-game flow is fast — coach taps through the
  roster as kids arrive at the oval, marks any no-shows, then rolls
  into the lineup picker. (Filename keeps `04-lineup-picker.png` for
  consistency across the build pipeline; the visible screen is the
  availability step that precedes the picker proper.)

### 05 — Sub due! *(the rotation suggester firing live)*

- **Source:** `mobile/store/screenshots/raw/05-sub-rotations.png`
- **Headline:** "Automate your **sub rotations**."
- **Emphasis:** *sub rotations* (green)
- **What's on screen:** Live game mid-Q1 with the sub-interval alert
  firing. Top of screen: "SUB DUE — 2 SWAPS" banner with the two
  swaps queued ("Frankie→Hugo" back, "Ruby→Theo" centre), each with
  an individual green "Do" button plus a unified "↔ Do all 2 swaps"
  CTA spanning the panel. Centre-screen: a "Sub due!" toast modal
  ("Time to rotate a player off the field. / Got it"). Field
  positions visible around the modal (Zara/Indi FWD, Mateo/Sam CEN,
  Levi/Otis BCK, Frankie's `#1 OFF NEXT` chip on the back tile).
  Score-bug: Fitzroy Falcons 3.2 20 vs Coburg Cougars 19 3.1, Q1
  clock 4:47.
- **Story:** The "set and forget" moment. Coach is watching the
  game; the app silently tracks who's been on too long; at the sub
  interval it tells them exactly who to swap and which slot to fill
  — one tap each, or one tap for the full sub.

### 06 — Player actions *(every coach curveball, sorted)*

- **Source:** `mobile/store/screenshots/raw/06-player-actions.png`
- **Headline:** "Every game-day **curveball**, handled."
- **Emphasis:** *curveball* (green)
- **What's on screen:** Live game R2 mid-Q2 with the Player Actions
  modal open over Otis (#7). Modal header "PLAYER ACTIONS / Otis #7"
  + description "Switch them out, lock them in place, flag an
  injury, or lend them to the opposition." Five action rows:
    - Switch player (green, the default tap-to-swap flow)
    - Always on field (black, lock the player on)
    - Lock to Fwd (orange, position-lock)
    - Mark injured (red, bench + skip rotation)
    - Lend to opposition (white-outlined)
  Cancel link at the bottom. Field UI visible behind the modal
  (Theo/Levi FWD tiles peeking out, SUGGESTED 2 SWAPS banner up
  top). Score-bug: Fitzroy Falcons 6.3 39 vs Coburg Cougars 32 5.2,
  Q2 clock 11:09.
- **Story:** Real coaching days throw curveballs — a kid rolls an
  ankle in Q2, an opposition coach asks to borrow a defender, a
  6-year-old wants to play forward all match. The actions modal
  handles every one of those with a long-press. Shows the app has
  depth beyond the rotation suggester.

---

## Output spec

| Field | Value |
|---|---|
| Format | PNG (8-bit RGB or RGBA; no animations) |
| Dimensions | **1320 × 2868 px** (Apple's 6.9" requirement; auto-derives for 6.5") |
| Colour space | sRGB |
| File names | `01-games-list.png` through `06-player-actions.png` |
| Output dir | `mobile/store/screenshots/ios/` |
| Count | **6 shots** (Apple accepts up to 10 per device size) |

---

## iPad variant *(13-inch, required since mid-2024)*

Apple now requires a separate set of screenshots at **13-inch iPad
Pro** dimensions if the app supports iPad (which Siren Footy does
by default via the Capacitor iOS scaffold). Same six story beats
as the iPhone set; just different dimensions and likely different
composition.

### Source files

| Item | Path |
|---|---|
| Raw iPad screenshots | `mobile/store/screenshots/raw-ipad/*.png` (auto-captured at 2064 × 2752) |
| Final marketed iPad output | `mobile/store/screenshots/ipad/*.png` (currently empty) |

### Output spec

| Field | Value |
|---|---|
| Format | PNG (8-bit RGB or RGBA; no animations) |
| Dimensions | **2064 × 2752 px** (Apple's 13-inch iPad portrait spec) |
| Colour space | sRGB |
| File names | `01-games-list.png` through `06-player-actions.png` (same names as iPhone — Apple identifies by upload slot, not filename) |
| Output dir | `mobile/store/screenshots/ipad/` |
| Count | **6 shots** to match the iPhone story; Apple accepts up to 10 |

### Composition note

The raw iPad captures look sparse — the Next.js app uses
`max-w-3xl` (~768px wide) for most screens, so on a 2064px canvas
the screen content fills only the top-center band with empty
space below. **This is normal**; the designer composites the
screen content onto a wider marketing canvas (iPad-frame mockup +
gradient background + headline), same as the iPhone treatment.
The empty space below the screen content in the raw becomes
canvas chrome in the marketed version.

A few of the raw iPad shots don't capture the exact game states
that make the iPhone versions distinctive:

- `03-quarter-break` — auto-capture lands on the live game UI,
  not the QB-zones panel (which requires the game to be at a
  quarter break in wall-clock time).
- `05-sub-rotations` — auto-capture lands on the live game UI,
  not the Sub-due! modal (which only fires at the sub interval).
- `06-player-actions` — auto-capture lands on the live game UI,
  not the player-actions modal (which opens via long-press).

If the iPad-frame mockup needs the same content as the iPhone
counterpart (Q-break tile arrows, Sub-due modal text, etc.), the
designer may need to either:

1. Recreate the modal/UI excerpt artistically on top of the live-
   game iPad shot, *or*
2. Steve re-captures 03/05/06 at iPad viewport via Chrome
   DevTools' iPad Pro 13" custom device, signed in as the demo
   account, with the same modal-state choreography used for the
   iPhone versions.

Either approach is fine for App Store review — Apple cares about
dimensions and "represents the app", not "matches the iPhone shot
pixel-for-pixel".

### Headlines (same as iPhone)

Reuse the same six headlines + emphasis words from the iPhone
brief above. iPad shots benefit from a slightly larger headline
type given the wider canvas — bump font size proportionally.

### Re-capturing the raw iPad set

```bash
npm run screenshots:ipad
```

Captures all six at 2064 × 2752 to `raw-ipad/`. Uses the same
seeded demo account state as the iPhone set; re-run `npm run
seed:app-review` first if the demo data needs refreshing.

The same source raws + same marketed outputs can be re-used for
Play Store screenshots — Play accepts the same dimensions, just
needs different file naming on the upload side + a separate
1024 × 500 feature graphic banner (not part of this brief, separate
deliverable).

---

## Hard constraints (Apple & Google rules)

- **Don't add UI not present in the app.** Marketing text in the
  band area is fine. Fake CTAs or fake notifications inside the
  phone-frame area aren't.
- **Don't add "iPhone" or any Apple trademark text labels** on the
  Android Play Store version. Apple's own logo/silhouette is also
  off-limits for Android. (Apple's own store is more permissive for
  iOS submissions.)
- **No prices or promo claims** in screenshot copy ("Now $1.99",
  "50% off"). Apple specifically rejects these.
- **Headline text must read at thumbnail size.** App Store
  search-result thumbnails show the first 3 screenshots at ~280px
  wide; if a headline doesn't read at that scale, the shot is
  wasted. Test by exporting each at 280 × 608 and looking at the set
  side-by-side at that size.

---

## Suggested working order

1. **Define the canvas template once** — gradient background, iPhone
   mockup frame placement, headline area, decorative element style.
   Save as a Figma/Canva/whatever master.
2. **Drop in screenshot 01 first** — simplest composition (no
   overlapping modals to crop around), tests the template.
3. **Render screenshots 02–06** by swapping the embedded source PNG
   and changing the headline + emphasis word. Same template,
   different content.
4. **Sanity check at thumbnail size** before declaring done — export
   each at 280 × 608, view side-by-side. The first 3 are what App
   Store visitors see in search results.
5. **Deliver** the six PNGs into `mobile/store/screenshots/ios/`,
   filenames matching the raws.

---

## File locations

| Item | Path |
|---|---|
| Raw source screenshots | `mobile/store/screenshots/raw/*.png` |
| Final marketed output goes here | `mobile/store/screenshots/ios/*.png` |
| Brand colour vars | `src/app/globals.css` (`--brand-*`, `--field`) |
| Brand colour tokens | `tailwind.config.ts` (`surface`, `ink`, `alarm`, `warn`) |
| Master logo / icon (1024 × 1024) | `mobile/assets/icon.png` |
| Vector logo | `public/siren-logo.svg` |
| Listing copy + headlines | `mobile/store/listing.md` |
| This brief | `mobile/store/screenshots/DESIGN-HANDOFF.md` |
| Reference image (Golf GameBook) | Not in repo — re-attach when handing off |

When the marketed set lands back in `ios/`, the listing copy in
`mobile/store/listing.md` already references that directory, so the
App Store Connect submission flow picks them up automatically. No
other file changes needed downstream.
