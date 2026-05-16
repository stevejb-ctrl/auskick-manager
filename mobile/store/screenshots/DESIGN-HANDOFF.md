# Design handoff — App Store / Play Store marketing screenshots

For a designer (human or Claude design) to produce polished
marketing screenshots in the style of Golf GameBook / Strava /
Linear's App Store listings. The current set in `ios/` is
mechanically-correct but visually flat; this brief covers what
"good" looks like and ships everything needed to produce it.

Last reviewed: 16 May 2026

---

## TL;DR

We have four clean screenshots of the Siren Footy app captured at
iPhone 16 Pro Max resolution (1320×2868). They tell a story: see
your season → review past games → manage live games → set up next
game. We need each one composited onto a branded marketing canvas
with a headline that sells the value prop in one glance — same
pattern as the reference below.

**Deliverable:** 6 PNG files at 1320×2868, named
`01-games-list.png` through `06-player-actions.png`, dropped into
`mobile/store/screenshots/ios/`. Apple allows up to 10 per device
size and shows the first 3 in search results, so order matters —
put the killer shots first.

---

## Reference — what "good" looks like

The user shared a Golf GameBook listing in the App Store. Key
ingredients in that style:

1. **Soft branded gradient background** (mint-green for Golf
   GameBook — for us, brand-50 → brand-100, the project's footy-
   green ladder).
2. **Two-color headline** — primary text in ink-dark, an
   emphasised word/phrase in brand-green (e.g. "**Simple Digital**
   Scorecard" with "Digital" in mint).
3. **Phone mockup frame** — the actual screenshot lives inside a
   subtle iPhone bezel, casting a soft shadow on the background.
   Mockup is positioned slightly off-centre and tilted ~5° for
   visual energy.
4. **Optional secondary device** — Golf GameBook adds an Apple
   Watch tilted at the bottom-left. We don't have a Watch app, so
   skip this OR use an alternative footy-thematic element (Sherrin
   ball, oval silhouette).
5. **Decorative dots/spheres** in soft brand tones scattered
   around the device. Visual interest without distracting from the
   screen itself.
6. **Composition rhythm**: headline occupies the top ~20% of the
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
| `--field` | `#3C8050` | The AFL oval green (visible inside screenshot 3) |
| `surface` | `#FFFFFF` | Phone mockup body / inner card surfaces |
| `surface-alt` | `#EFECE6` | Soft cream — alternative canvas background |
| `ink` | `#1A1E1A` | Primary headline text |
| `ink-dim` | `#5E6860` | Secondary headline / subhead |
| `alarm` | `#D9442D` | Siren-red — used sparingly, only for the brand dot in the wordmark |
| `warn` | `#C8751F` | Ochre — Q-break / NEXT chips (don't use in marketing chrome) |

### Typography

- **Headlines:** `Geist Sans` (already loaded by the app via the
  `geist` npm package). Weight 700, tight tracking
  (`letter-spacing: -0.02em`), line-height 1.15.
- **Body / subheads:** Geist Sans, weight 500.
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, sans-serif`.
- The app's own UI uses `font-mono` (Geist Mono) for eyebrow
  labels (e.g. "ROUND 01") — feel free to mirror that for any
  tiny secondary text in the marketing canvas.

### Logo / wordmark

- Master 1024×1024 icon: `mobile/assets/icon.png` (cream
  background, black "S" with a single red dot — the S+dot lockup).
- Web variants:
  - `public/siren-logo.svg` (vector, ideal for crisp scaling)
  - `public/siren-logo-512.png`
  - `public/favicon-512.png`

---

## The four screens

Each row: the source file (raw, unbranded), the suggested
headline, what the screen actually shows, and which word to
emphasise in brand-green.

### 01 — Games list

- **Source:** `mobile/store/screenshots/raw/01-games-list.png`
- **Headline:** "Your whole season **in one tap**."
- **Emphasis word:** *in one tap* (green)
- **What's on screen:** Fitzroy Falcons team page → Games tab.
  "2026 SEASON" eyebrow + "Games" heading + filter chips (All /
  Upcoming / Final). "Add games" card explaining PlayHQ import vs
  manual entry, with green "Import from PlayHQ" + ghost "Create
  manually" buttons. Two sections beneath:
    - UPCOMING: R3 vs Northcote Nighthawks (Fri May 22, 5:11 PM),
      R4 vs Prahran Prawns (Sat May 30, 9:45 AM · Prahran
      sportsground). Both showing 0/15 availability chips.
    - COMPLETED: R2 vs Coburg Cougars (Fri May 15), R1 vs
      Brunswick Bears (Sat May 9).
  Help link at the bottom.
- **Story:** Shows the season-management value prop. Coach
  glances and goes "ah, I can see all my fixtures here". The
  PlayHQ import card on top is a meaningful detail — Australian
  junior leagues all use PlayHQ, and a one-tap fixture import is
  the table-stakes the rest of the app builds on top of.
- **Note:** Manual capture only — the seed creates 3 games (R1
  completed, R2 live, R3 upcoming) but this shot includes a R4
  vs Prahran Prawns that Steve added by hand to make the list
  read as a real mid-season state. Future re-seeds will reset
  to the 3-game canonical roster; recapture this shot by hand
  after adding R4 back via the UI, or update the seed to
  include R4.

### 02 — Game recap *(full-time summary + copy-for-group-chat)*

- **Source:** `mobile/store/screenshots/raw/02-game-recap.png`
- **Headline:** "Every game, **recapped** for the group chat."
- **Emphasis word:** *recapped* (green)
- **What's on screen:** Full-time game summary for Fitzroy
  Falcons vs Coburg Cougars, R2 (the live game taken to FT for
  the marketing shot). Top: score-bug Fitzroy Falcons 14.6 (90)
  vs Coburg Cougars 7.5 (47), FT clock at 0:00. Beneath: "FULL
  TIME" eyebrow + red "Restart game" link. The Game Summary card
  fills most of the screen with:
    - Section heading + a prominent green "Copy for group chat"
      button (the value-prop CTA).
    - Plain-English summary line: "Full time — Fitzroy Falcons v
      Coburg Cougars / Fitzroy Falcons 14.6 (90) def Coburg
      Cougars 7.5 (47)".
    - Scorers line with every goal kicker + their tally.
    - "14 players · 13 subs" chip.
    - "Game time" breakdown per player — `#X Name — MM:SS (BCK %
      · CEN % · FWD %)` so a coach can see at a glance who got
      how much across which zones.
  Sticky "Finish game" green CTA at the bottom.
- **Story:** Saturday morning's over. The coach looks at this
  screen, taps "Copy for group chat", paste it into the team
  WhatsApp, and parents see the result + fair-time confirmation
  for their kid. This is THE recap-and-share value prop and it's
  built right into the FT screen.
- **Note:** Manual capture only. The screen requires the live
  R2 game to be finalised, which involves clicking through to
  full time. After capturing, restart R2 back to its mid-game
  state via the "Restart game" button so other shots that need
  R2 mid-quarter still work — or re-run
  `npm run seed:app-review` to reset all three games.

### 03 — Quarter break *(the wholesale rebalance)*

- **Source:** `mobile/store/screenshots/raw/03-quarter-break.png`
- **Headline:** "**Fair rotations**, suggested automatically."
- **Emphasis word:** *Fair rotations* (green)
- **What's on screen:** The "Set zones for Q2" Quarter Break
  screen. Header "QUARTER BREAK / Set zones for Q2". Two
  summary chips: GAME SETTINGS "Auto-rebalanced · No lent · No
  injured", SCORE "3.2 (20) – 3.1 (19) · +1". Helper line: "Tap
  any two players to swap them — even across zones or to the
  bench." Two position groups visible:
    - FORWARD 4/4: Theo (CENTRE→FORWARD, 4:40), Levi
      (BACK→FORWARD, 12:00), Otis (BACK→FORWARD, 12:00), Maya
      (CENTRE→FORWARD, 12:00).
    - CENTRE 4/4: Hugo (BACK→CENTRE, 4:40), Frankie
      (BENCH→CENTRE, 7:19), Pip (FORWARD→CENTRE, 12:00), Mateo
      (STAYS, 12:00).
  Each tile shows a FROM_ZONE → TO_ZONE arrow and the player's
  season-time bar. Sticky "Ready for Q2" green CTA at bottom.
- **Story:** This is THE shot. The wholesale-rebalance moment is
  unique to Siren — at every quarter break the suggester reshuffles
  the whole lineup so every kid's time across the four quarters
  evens out. The FROM→TO arrows make the rebalance explicit;
  every tile is a tiny proof of the fairness logic. A coach sees
  this and instantly gets the value prop.
- **Note:** Manual capture only. The QB screen requires the
  live game to be at a quarter break — too fragile for the
  Playwright auto-capture to land reliably, so this shot is
  flagged `manualOnly` in `scripts/capture-store-screenshots.mjs`
  and the auto-run skips it. Recapture by signing in to the demo
  account, opening the R2 Coburg Cougars game, and triggering a
  quarter end.

### 04 — Mark availability *(pre-game flow start)*

- **Source:** `mobile/store/screenshots/raw/04-lineup-picker.png`
- **Headline:** "Build your **starting team** in seconds."
- **Emphasis word:** *starting team* (green)
- **What's on screen:** Pre-game "Mark availability" screen
  (first of the two pre-game steps; the actual lineup picker is
  the next click). Header "Mark availability" + helper copy.
  Summary chips: "14 available · 1 unavailable". Player rows
  with jersey number + name + Available/Unavailable status pill +
  toggle button. Ava (#4) shown as Unavailable with a "Mark
  available" green button — surfaces the affordance. Sticky
  "Continue to lineup" CTA at bottom.
- **Story:** The pre-game flow is fast — coach taps through the
  roster as kids arrive at the oval, marks any no-shows, then
  rolls into the lineup picker. Filename kept as
  `04-lineup-picker.png` for pipeline continuity even though the
  visible screen is the availability step that precedes the
  picker proper. (Steve preference, 2026-05-16.)

### 05 — Sub due! *(the rotation-suggester firing live)*

- **Source:** `mobile/store/screenshots/raw/05-sub-rotations.png`
- **Headline:** "Automate your **sub rotations**."
- **Emphasis word:** *sub rotations* (green)
- **What's on screen:** Live game mid-Q1 with the sub-interval
  alert firing. Top of screen: "SUB DUE — 2 SWAPS" banner with
  the two specific swaps queued ("Frankie→Hugo" back, "Ruby→
  Theo" centre), each with an individual green "Do" button plus
  a unified "↔ Do all 2 swaps" CTA spanning the panel.
  Centre-screen: a "Sub due!" toast modal ("Time to rotate a
  player off the field. / Got it"). Field positions visible
  around the modal (Zara/Indi FWD, Mateo/Sam CEN, Levi/Otis BCK,
  Frankie #1 OFF NEXT chip on the back tile). Score-bug at
  bottom: Fitzroy Falcons 3.2 20 vs Coburg Cougars 19 3.1, with
  Q1 clock at 4:47.
- **Story:** This is the "set and forget" moment. Coach is
  watching the game, the app silently tracks who's been on too
  long, and at the sub interval it tells them exactly who to
  swap and which slot to fill — one tap each, or one tap for the
  full sub. The "Sub due!" modal is the alert; the suggested
  swap banner is the answer.
- **Note:** This screen can't be reliably auto-captured (it
  needs the sub-interval timer to land at the exact moment of
  screenshot). Captured manually by Steve 2026-05-16. Don't
  expect `npm run screenshots:ios -- --raw` to regenerate this
  one — the Playwright session would have to wait at the live
  page for ~3 minutes for the interval to elapse.

### 06 — Player actions *(every coach curveball, sorted)*

- **Source:** `mobile/store/screenshots/raw/06-player-actions.png`
- **Headline:** "Every game-day **curveball**, handled."
- **Emphasis word:** *curveball* (green)
- **What's on screen:** Live game R2 mid-Q2 with the Player
  Actions modal open over Otis (#7). Modal header "PLAYER ACTIONS
  / Otis #7" + description "Switch them out, lock them in place,
  flag an injury, or lend them to the opposition." Five action
  rows:
    - Switch player (green, the default tap-to-swap flow)
    - Always on field (black, lock the player on)
    - Lock to Fwd (orange, position-lock)
    - Mark injured (red, bench + skip rotation)
    - Lend to opposition (white-outlined)
  Cancel link at the bottom. Field UI visible behind the modal
  (Theo/Levi FWD tiles peeking out, SUGGESTED 2 SWAPS banner up
  top). Score-bug shows Fitzroy Falcons 6.3 39 vs Coburg Cougars
  32 5.2, Q2 clock 11:09.
- **Story:** Real coaching days throw curveballs — a kid rolls
  an ankle in Q2, an opposition coach asks if you can lend them
  a defender for the second half, a 6-year-old wants to play
  forward all match. The actions modal handles every one of
  those with a long-press. Demonstrates the app has depth beyond
  the rotation suggester.
- **Note:** Manual capture only. The actions modal opens via
  long-press on a player tile — fragile to auto-trigger from
  Playwright. Flagged `manualOnly` in the SHOTS array.

---

## Output spec

| Field | Value |
|---|---|
| Format | PNG (8-bit RGB or RGBA; no animations) |
| Dimensions | 1320 × 2868 px (Apple's 6.9" requirement; auto-derives for 6.5") |
| Colour space | sRGB |
| File names | `01-games-list.png` through `06-player-actions.png` |
| Output dir | `mobile/store/screenshots/ios/` (replaces current marketed set) |
| Max screenshots Apple accepts | 10 per device size. We're shipping 6. |
| Bezel/frame overlay rules | Apple permits stylised mockup frames; Google Play forbids fake "iPhone" labels on Play screenshots so use a generic device frame for the Android variant if/when we capture that. |

The same source raws can be re-used for Play Store screenshots
(Play accepts the same dimensions, just needs different file
naming + a separate 1024×500 feature graphic banner).

---

## Hard constraints (Apple & Google rules)

- **Don't add UI not present in the app.** Marketing text in the
  band area is fine. Fake CTAs or fake notifications inside the
  phone-frame area aren't.
- **Don't add "iPhone" or any Apple trademark text labels** on
  Android Play Store screenshots. Apple's own logo/silhouette is
  also off-limits for Android. (Apple is more permissive for iOS
  submissions on their own store.)
- **No prices or promo claims** in screenshot copy ("Now $1.99",
  "50% off"). Apple specifically rejects these.
- **Headline text must be readable at thumbnail size.** App Store
  search-result thumbnails show the first 3 screenshots at ~280px
  wide; if the headline doesn't read at that size, it's wasted.

---

## Suggested working order (for the designer)

1. **Define the canvas template** once — the gradient background,
   the iPhone mockup frame placement, the headline area, the
   decorative element style. Save as a Figma/Canva master.
2. **Drop in screenshot 01 first** — that's the simplest
   composition (no overlapping modals to crop around) and tests
   the template.
3. **Render screenshots 02–04** by swapping the embedded source
   PNG and changing the headline + emphasis word. Same template,
   different content.
4. **Sanity check** at thumbnail size (export each at 280×608 and
   look at them side-by-side at that scale — that's what users see
   in App Store search results).
5. **Deliver** the four PNGs back into `mobile/store/screenshots/ios/`.

---

## File locations summary

| Item | Path |
|---|---|
| Raw source screenshots (designer working set) | `mobile/store/screenshots/raw/*.png` |
| Final marketed output goes here | `mobile/store/screenshots/ios/*.png` |
| Brand colour vars | `src/app/globals.css` (`--brand-*`, `--field`) |
| Brand colour tokens | `tailwind.config.ts` (`surface`, `ink`, `alarm`, `warn`) |
| Master logo / icon | `mobile/assets/icon.png`, `public/siren-logo.svg` |
| Listing copy + headlines | `mobile/store/listing.md` |
| This brief | `mobile/store/screenshots/DESIGN-HANDOFF.md` |
| Reference image (Golf GameBook) | shared in chat 2026-05-16; re-attach when handing this off |

When the marketed set lands back in `ios/`, the listing copy in
`mobile/store/listing.md` already references that directory, so
the App Store Connect submission flow picks them up automatically.
