# Marketing screenshots

The landing page's `ScrollingFeatures` section and the `Hero` phone
mockup pull from the files in this folder. Placeholders live here as
`.svg` so the page renders cleanly even before real captures exist.

As the app improves, re-capture — the script below is the
"rebuild the screenshots" button.

## Dimensions

Capture at **portrait phone dimensions** matching `PhoneFrame`'s
`9 / 19.5` aspect ratio:

- Design: **360 × 780**
- Retina / crisp: **1080 × 2340** (3×)

Anything taller or shorter gets cropped by `object-cover`.

## Two ways to capture

### A. Automated (Playwright — recommended)

One-off setup:

```bash
npm install                    # pulls playwright from devDependencies
npx playwright install chromium
```

Configure the capture target in your shell (or drop these into
`.env.local`):

```bash
export TEST_EMAIL=coach@example.com
export TEST_PASSWORD=...
export SCREENSHOT_TEAM_ID=<uuid of a team with a populated squad>
export SCREENSHOT_GAME_ID=<uuid of a mid-state game on that team>
export SCREENSHOT_RUN_TOKEN=<public run-token for share screen>
```

Run it:

```bash
npm run dev                    # terminal 1
npm run capture:screenshots    # terminal 2
```

Output lands in this folder as `.png`. The filenames match what
`src/app/page.tsx` references, so the landing page picks them up
without edits. (Delete the matching `.svg` placeholder when the real
PNG exists — browsers will happily serve `rotations.png` even if
`rotations.svg` still sits alongside it, but the clutter is
confusing.)

The script is forgiving: any single capture that fails (missing
route, selector not found) logs the error and the rest continue.

### B. Manual (browser DevTools)

For the "money-shot" hero capture and any screen that needs curation
the script can't easily reproduce (confetti mid-celebration, a specific
sub-due moment, a hand-picked stats leaderboard):

1. Open Chrome DevTools → Toggle device toolbar → pick **Custom** and
   set dimensions to `360 × 780`.
2. Zoom to **100%**; set DPR to **3**.
3. Navigate to the screen; wait for animations to settle.
4. Three-dot menu in the device toolbar → **Capture screenshot**.
5. Rename per the table below; drop into this folder.

## What each capture should show

| File              | Feature section    | Capture from |
| ----------------- | ------------------ | ------------ |
| `live-game.png`   | Hero (phone mockup)| Live-game screen mid-quarter: scoreboard, field with zones populated, swap card visible. The hero shot. |
| `rotations.png`   | Rotations          | Rotation view with the Field component showing all three zones + a bench column. Sub timer running in the header. |
| `scoring.png`     | Scoring            | Score-tracking moments after a goal — celebration chip visible, song-playing state, +Goal / +Behind buttons. |
| `availability.png`| Availability       | Pre-game availability screen with at least one **injured** player, one **late** player, one **fill-in** row. |
| `share.png`       | Share              | Share-game screen: public run-link with copy button, invite list with role chips. |
| `fixtures.png`    | PlayHQ integration | Fixtures list after a PlayHQ import — "Imported from PlayHQ" / "Auto-synced" banner visible, rounds with W/L results. |
| `stats.png`       | Stats              | Season-stats dashboard: top goal-kicker leaderboard with bars, fair-time badge, KPI tiles. |

## Placeholders

The `.svg` files are deliberately low-fidelity — they match the app's
visual language enough to let the page render and be reviewed, without
masquerading as finished screenshots. Swap them out before launch.
