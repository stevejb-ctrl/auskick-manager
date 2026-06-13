# Usability tests — five-persona cognitive walkthrough

Run after the 10-commit UX consistency sweep landed on `main`.
Five personas, parallel agents, each walking a real user journey
through the live code. Output consolidated here.

**Important caveat**: Sarah and Pat's agents ran against the stale
`nice-edison-ecfd4d` worktree (older than main). They self-flagged
their stale findings. The findings preserved below are those still
valid on current `main`.

---

## Personas

| # | Persona | Role | Focus |
|---|---|---|---|
| 1 | **Sarah** | Brand-new AFL coach, signed up tonight | Onboarding / first-game flow |
| 2 | **Mike** | Saturday-morning AFL coach, mid-game | Live game flow under cold-finger pressure |
| 3 | **Lisa** | Parent volunteer running scoring via token link | First-touch, panic-mode |
| 4 | **Tom** | Team admin doing Sunday-night housekeeping | Consistency across settings + admin surfaces |
| 5 | **Pat** | Returning coach, week 3 of use | Re-entry + stats deep-dive |

---

## Top blockers across all personas

These are the highest-impact items that surfaced from multiple personas:

### B1 — Lisa: no orientation banner on `/run/<token>`
Token-share runner lands with zero context: just wordmark + game info
+ player list. Burns 15-20s figuring out what app she's in. Coach
texted "tap this link" — she has no idea she's about to run scoring
for a live game.

**Fix**: one orientation card at the top of `/run/<token>` pre-kickoff:
*"You're running scoring for Team X today. 1. Mark who's here. 2. Tap
a starting lineup. 3. Tap goals as they happen."*

**File**: `src/app/run/[token]/page.tsx:319-348`

### B2 — Lisa: AFL Continue button isn't gated by `requiredAvailable`
Netball gates the Continue CTA behind the "X of N available" check
(warn-orange pill + helper text from `AvailabilityList.tsx:113-118`).
AFL doesn't — Lisa can tap Continue with zero kids marked → dead-end
empty state → wasted tap → back-tap loop.

**Fix**: disable the AFL Continue CTA + show the netball-style helper
copy when `availableCount < g.on_field_size`.

**File**: `src/app/run/[token]/page.tsx:340-348`

### B3 — Lisa: "Finish game" → `/dashboard` for token-auth users
Token-auth users don't have a dashboard. Tapping "Finish game" at
the end of their journey sends them to a login page with no
indication that their work saved. Last step of the runner journey
is broken.

**Fix**: branch on `auth.kind === "token"` — destination should be
`/` (with a "Game finished, you can close this tab" panel) or back
to `/run/${token}` showing the summary.

**Files**: `src/components/live/LiveGame.tsx:2197` +
`src/components/netball/NetballLiveGame.tsx:1181`

### B4 — Lisa: AFL token-auth shows "Save plan & exit"
Netball correctly hides this for token-auth (`onSavePlan:
undefined` opt-out). AFL has no such opt-out — Lisa sees an "Exit"
button next to "Ready" and freezes. *"Will it delete the game if I
exit?"*

**Fix**: thread an `onSavePlan: undefined` opt-out through AFL's
LineupPicker the same way netball does it via NetballLiveGame.

**Files**: `src/components/live/LineupPicker.tsx` (need opt-out
prop) + `src/app/run/[token]/lineup/page.tsx` (pass undefined for
token-auth)

### B5 — Mike: QuarterEndModal + SlotFillSheet both share `z-50`
When Mike taps the embedded `+G` for a goal-on-the-siren, the
scorer picker (`SlotFillSheet`) stacks at the same z-index as the
QuarterEndModal. Visually it reads as "two modals deep" with two
overlapping backdrops. A stray tap could lose the score with no
recovery (QuarterEndModal has no Cancel).

**Fix**: rebase one of the two — push the SlotFillSheet to `z-60`
when invoked from inside a Modal context, OR have QuarterEndModal
temporarily lower its z-index when `pickScorerKind !== null`.

**Files**: `src/components/ui/Modal.tsx:19`, `src/components/ui/SlotFillSheet.tsx:90`

---

## High-impact friction (multi-persona)

### F1 — Touch targets under 44pt iOS minimum
Flagged by **Mike, Lisa, Sarah, Pat**.

Surfaces below the minimum:
| Surface | Current | Target | File |
|---|---|---|---|
| Scorebug `+G/+B` chips | ~36-38px | 44pt | `GameHeader.tsx:148-167` |
| QuarterEndModal `+G/+B` chips | ~28-30px | 44pt | `QuarterEndModal.tsx:92, 100, 139, 147` |
| `?` help button | 24×24px | 44pt | `LiveTopBar.tsx:57-65` |
| `✕ Exit` link | text-only | bigger hit | `LiveTopBar.tsx:38-43` |
| AvailabilityRow toggle | ~40px (post fix) | 44pt | `AvailabilityRow.tsx:67-77` |
| "Copy for group chat" | ~28-32px | 44pt | `GameSummaryCard.tsx:232-238` |

Mike's specific quote: *"Lucas just slotted one on the siren —
where's the +G — it's right there but my thumb's covering it."*

### F2 — Half-finished design-system migration leaves visible seams
Flagged by **Tom**, confirmed structurally by all five.

**Where the seam is visible**:
- TeamMembersSettings + TeamSongSettings still use legacy `<Button>`
  + bare `text-xs text-danger` errors. Sit between migrated cards.
- DeleteGameButton uses inline expanding panel; ResetGameButton uses
  Modal overlay. Same row, same severity, different shapes.
- AddGameSection + ImportFixturesButton hand-roll their modal shell;
  ResetGameButton uses the `<Modal>` primitive on the same page.
- Modal backdrop tap-to-close inconsistent (`<Modal>` does NOT close;
  hand-rolled overlays do).

Tom: *"The TeamSong card is the obvious tell. As soon as you scroll
to it, you can see the seam."*

### F3 — `bg-warn-soft text-warn` overloaded for both info AND errors
Flagged by **Sarah, Lisa**.

Same colour family is used for:
- Friendly "Auto-suggested starting lineup" callout (`LineupPicker.tsx:198-206`)
- Actual error banners (`LiveGame.tsx:890-893`)
- "Squad is full" empty state

Sarah's eye goes to the yellow band first thinking it's a problem.
"Auto-suggested" is INFO, not WARN.

**Fix**: separate the tone families. Info → `bg-brand-50
text-brand-700` (or new `bg-info-soft text-info` token). Warn /
error keeps the existing yellow/red.

### F4 — Jargon barrier across non-coach personas
Flagged by **Sarah, Lisa, Pat**.

| Jargon | Where | Persona | Severity |
|---|---|---|---|
| FWD / HBK / HFB | LineupPicker slot card headers | Sarah / Lisa | FRICTION |
| GS / GA / WA / C / WD / GD / GK | Netball PositionToken | Lisa | FRICTION |
| "Lineup" | Continue to starting lineup button | Lisa | FRICTION |
| "Fill-in" | AddFillInForm | Lisa | FRICTION |
| "Fairness score" | QuarterBreak | Lisa | FRICTION |
| "Minutes equity" | Stats section title | Pat | FRICTION |
| "Lent" / "loaned" | Game settings collapse | Lisa | NIT |
| "Q1 / Q2 / Q3 / Q4" | First encounter is Live game | Sarah | NIT |
| "PlayHQ" | AddGameSection without explanation | Sarah | NIT |

**Fix paths**:
- Position abbreviations: tooltips on first encounter, OR escape
  valve to "Accept suggestion" without ever needing to know FWD vs HBK.
- "Minutes equity" → "Field time" or "Equal time".
- "Fill-in" → "Add a player who isn't on the squad".
- "Fairness score" → "Rotation fairness".

---

## Per-persona findings (filtered to main)

### Persona 1 — Sarah, first-time AFL coach

Recovered findings (after stale-worktree filter):

1. **No "warm welcome" between signup and dashboard.** Sarah signs
   up, lands on `/dashboard` which says "My teams · None" with the
   "Create a new team" CTA buried 100+ pixels below an empty-state
   paragraph. No "Hi Sarah, let's get started" framing.
   **Severity**: FRICTION.

2. **`AvailabilityRow` default state reads as "parent said no".**
   `statusLabels.unknown = "Unavailable"` makes a brand-new game
   show 14 grey "Unavailable" pills. Sarah: *"Did the parents
   already vote no??"* Should be "Awaiting response" / "Unknown"
   with a neutral pill, distinct from the red "Unavailable" state.
   **File**: `src/components/games/AvailabilityRow.tsx:32-36`.
   **Severity**: FRICTION.

3. **`AddPlayerForm` doesn't autofocus the Name input after submit.**
   Adding 14 players = 14 extra taps just to refocus. Trivial JS
   fix, big mobile-UX win.
   **File**: `src/components/squad/AddPlayerForm.tsx:65-69`.
   **Severity**: FRICTION.

4. **Bench-empty + sub-interval-card still renders its full UI.**
   With 12 available + 12 default size, no rotation is possible
   but "Suggested 3 min — 0 on bench, 12 total" still surfaces.
   No copy acknowledgement of "you have no bench".
   **File**: `src/components/live/LineupPicker.tsx:280-306`.
   **Severity**: NIT.

5. **`FinishSetupBanner` only shows when squad is empty.** Sarah
   adds 1 player and abandons setup → wizard safety net
   evaporates even though Games + co-manager invite haven't
   happened.
   **File**: `src/components/setup/FinishSetupBanner.tsx`.
   **Severity**: NIT.

6. **No "game created" toast** after manual CreateGameForm submit.
   Sarah has to scroll to confirm it landed.
   **File**: `src/components/games/AddGameSection.tsx:52-86`.
   **Severity**: NIT.

7. **"PlayHQ" appears in AddGameSection** with one line of
   explanation. Brand-new coach doesn't know what it is.
   **File**: `src/components/games/AddGameSection.tsx`.
   **Severity**: NIT.

**Sarah's gold-standard moment**: ScoringStep notes
(`ScoringStep.tsx:23-30`) — *"Most AFL juniors don't keep score up
to U10, then scoring comes in around U11. Flip this on if your
league keeps a scoreboard."* — explains the WHY, gives the escape
hatch, doesn't assume AFL knowledge. Reference copy for the rest
of the app.

### Persona 2 — Mike, Saturday-morning AFL coach

Two BLOCKERs (B5 above), plus:

1. **Scorebug + QuarterEndModal `+G/+B` chips under 44pt.** Most
   tapped controls of the game, smallest targets on the screen.
   QuarterEndModal chips are even smaller than in-play (~28-30px).
   **Severity**: FRICTION.

2. **No-show availability has no direct affordance pre-game.** Mike
   needs to mark "Joey didn't turn up". Options: use "Lend a player"
   (semantically wrong — Joey isn't on the opposition), bench-swap
   (multi-tap), or back out to availability page (off the critical
   path).
   **Severity**: BLOCKER for the no-show scenario.

3. **"Ready for Q2" button → modal heading "Ready for Q2" → CTA
   "Start Q2"** — the duplicate label makes the modal feel like a
   glitch ("did my first tap not register?"). The two-stage flow
   (commit-lineup vs start-clock) is correct intent; copy is wrong.
   **Fix**: Q-break button → "Lock in Q{n+1} lineup", modal heading
   stays "Ready for Q{n+1}".
   **File**: `src/components/live/QuarterBreak.tsx:1531-1538` +
   `src/components/live/StartQuarterModal.tsx`.
   **Severity**: FRICTION.

4. **No glanceable score at Q-break.** Score panel collapsed by
   default; sticky scorebug isn't rendered at QB (only live play).
   Mike has no glance-level "12-7 going into Q2" — has to expand
   the collapse.
   **Severity**: FRICTION.

5. **"Copy for group chat" button at top-right of GameSummaryCard
   is ~28-32px** — wrong size for the most-likely tap on that
   screen. State change (Copy → ✓ Copied!) is also small enough
   that Mike misses the ack.
   **File**: `src/components/live/GameSummaryCard.tsx:232-238`.
   **Severity**: FRICTION.

6. **`StartQuarterModal` primary CTA is legacy `<Button size="lg">`**
   so it renders ~42px tall vs the SFButton lg `52px` he just tapped
   on the picker. Step-down visual mismatch.
   **File**: `src/components/live/StartQuarterModal.tsx:35`.
   **Severity**: NIT.

7. **Error display token drift at `LiveGame.tsx:1444`** —
   `rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn` (wrong
   radius + wrong tone for a semantic error).
   **Severity**: NIT.

**Mike's praised**: LiveTopBar consistency across all 5 /live
states, `pickScorerKind` race guards, AudioContext unlock on first
pointerdown, auto-scroll-to-top on quarter transition,
`hasSwappableBench` gate on sub-due, GameSummaryCard share format.

### Persona 3 — Lisa, parent runner

Four BLOCKERs (B1, B2, B3, B4 above), plus:

1. **`✕ Exit` is terrifying mid-game.** The `✕` symbol universally
   means "close / discard". She won't tap it even though the
   destination is safe. Should be `← Game info` or drop the `✕`.
   **File**: `src/components/live/LiveTopBar.tsx:38-43`.
   **Severity**: FRICTION.

2. **No "your work is saved" reassurance.** Lisa needs to know
   she can step away for 30s without losing scores. Currently the
   trust contract is implicit.
   **Severity**: FRICTION.

3. **Sport-parity break in token-share flow**: AFL has separate
   `/run/<token>/lineup` page; netball stays on `/run/<token>` with
   picker stacked below availability. Netball Lisa has no "Continue
   to lineup" button — she has to figure out by scrolling that the
   next section IS the picker.
   **Severity**: FRICTION.

4. **`← Siren` chevron in run-token layout** links to marketing `/`
   — wrong destination for a parent volunteer who has no Siren
   mental model. If she taps it expecting "go back" she leaves the
   app.
   **File**: `src/app/run/[token]/layout.tsx:17-39`.
   **Severity**: FRICTION.

5. **"Add fill-in player" buried as a low-contrast text link** at
   the bottom of the availability card. The coach told Lisa "add
   the two new kids" — she'll scroll past the link three times
   before noticing it.
   **File**: `src/components/games/AddFillInForm.tsx:65-75`.
   **Severity**: FRICTION.

6. **Lineup-picker has no escape valve for "I don't know what FWD
   means".** She'd want "Accept the suggestion" without ever caring
   about positions.
   **Severity**: BLOCKER for Lisa's persona.

Lisa's quotes are the most quotable of all five reports. Sample:
*"There's a tiny question mark up there. Oh — and there's an X
with EXIT next to it. Do NOT tap that. Don't tap that. Don't tap
that."*

### Persona 4 — Tom, team admin

15 numbered inconsistencies. Top 3 priorities:

1. **Migrate TeamMembersSettings + TeamSongSettings** to SFButton
   + canonical banner. Closes the most visible Settings-page seam.
2. **Pick ONE confirm grammar for destructive actions** (Modal
   primitive everywhere OR inline panel everywhere). Resolve the
   Delete-vs-Reset disparity.
3. **Migrate AddGameSection + ImportFixturesButton to the `<Modal>`
   primitive** (after extending Modal to accept a header slot +
   opt-in backdrop close).

Specific findings catalogued in the per-persona section earlier.
Full list (with file:line) in his agent transcript; key headlines:

- Save-success feedback split 4 ways (banner / auto-save / silent /
  inline chip)
- Error banner placement varies 5 ways (above/below/inline)
- SFButton size mixing: `md` (44px) for TeamName, `sm` (34px) for
  QuarterLength + CohortChips
- `game_manager` (non-admin) treatment varies: disabled+explainer
  / cleanly hidden / silently disabled (three patterns)

Tom: *"There's a cohesive sweep underway, and it's three-quarters
done. The TeamSong card is the obvious tell."*

### Persona 5 — Pat, returning user

Filtered to findings still valid on main:

1. **Team home has no last-completed-game surface.** Pat's mental
   model after Saturday → Friday is "the app should show me what
   just happened." The auditor-comment at
   `teams/[teamId]/page.tsx:26-31` even acknowledges the missing
   `LastResultCard`. Pat has to navigate Games tab → scroll to
   Completed → tap — 3 taps to see a result.
   **Severity**: FRICTION.

2. **Stats section order is dev-order not coach-order, 8 sections
   not 7, "Minutes equity" jargon.** The section Pat actually wants
   (who's underplayed) is 3rd and titled with fairness jargon.
   Player stats is dense 2-column card grid with 11 metrics each,
   not a leaderboard.
   **Fix path**: reorder by coach priority (Minutes equity → Player
   stats → Attendance → Head-to-head → Quarter scoring → rest
   collapsed). Rename "Minutes equity" → "Field time". Convert
   PlayerStatsTable to a single-column leaderboard with the headline
   metric prominent.
   **File**: `src/components/dashboard/DashboardShell.tsx:106-162`.
   **Severity**: FRICTION.

3. **Stats page has no Suspense / loading affordance.** On slow
   network Pat sees a blank `<main>` for 0.5-2s.
   **File**: `src/app/(app)/teams/[teamId]/stats/page.tsx:49-65`.
   **Severity**: FRICTION.

4. **`Start game` and `Set lineup` route to identical URL.** Same
   destination (`/teams/[id]/games/[gameId]/live`), two distinct-
   looking CTAs. Pat thinks they do different things.
   **File**: `src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx:260-282`.
   **Severity**: FRICTION.

5. **PlayerStatsTable is 2-column dense card grid**, not a
   leaderboard. Pat: *"Why is this two columns? I just want a list."*
   **File**: `src/components/dashboard/PlayerStatsTable.tsx:68-131`.
   **Severity**: NIT.

Pat's praised: TeamTabBar paint-through across in-team navigation,
`game_finalised` event filter on stats (the recent fix), the
MinutesEquity viz (right tool, wrong title), the NextUpHero round
numeral, the availability-page two-step flow.

---

## Suggested priority order for follow-up commits

### P0 — Blockers (~8-10 commits)

1. **Orientation banner on `/run/<token>` pre-kickoff** — Lisa B1.
   `src/app/run/[token]/page.tsx`.
2. **Gate AFL Continue button by `requiredAvailable`** — Lisa B2.
3. **Branch "Finish game" destination for token-auth** — Lisa B3.
4. **AFL `onSavePlan: undefined` opt-out for token-auth** — Lisa B4.
5. **Resolve QuarterEndModal + SlotFillSheet z-50 collision** — Mike B5.
6. **Pre-game no-show availability affordance** — Mike's no-show
   scenario. Either bring AvailabilityList into the LineupPicker
   view, or add an explicit "Mark unavailable" tap on the LineupPicker
   tile.

### P1 — Touch targets (single commit, big payoff)

7. **Bump every <44pt tap target to ≥44pt**:
   - Scorebug `+G/+B` chips
   - QuarterEndModal `+G/+B` chips
   - LiveTopBar `?` button
   - AvailabilityRow toggle pill
   - GameSummaryCard Copy button
   - LiveTopBar `✕ Exit` text-link

### P2 — Design-system seams (~3-4 commits, Tom's top 3)

8. **TeamMembersSettings + TeamSongSettings migration** to SFButton
   + canonical banner.
9. **Pick one confirm grammar** for destructive actions (Modal
   primitive vs inline panel) and harmonise Delete + Reset.
10. **Extend `<Modal>` primitive** to support header slot + opt-in
    backdrop close, then migrate AddGameSection + ImportFixturesButton.
11. **Save-success feedback grammar** — pick one (canonical
    `bg-ok/10` banner) and apply to all 4 migrated settings cards.

### P3 — Copy / jargon (~2-3 commits)

12. **Separate info tone from warn tone**: `bg-warn-soft text-warn`
    is currently overloaded. Introduce `bg-info-soft` or use
    `bg-brand-50 text-brand-700` for friendly info; reserve warn
    for actual warnings.
13. **Rename "Minutes equity" → "Field time"** or "Equal time".
    Add subtitle explaining the red/amber/green bars.
14. **Position-label tooltips on lineup pickers**: tap-and-hold a
    position chip to see "Forward / Half Forward / Centre / Half
    Back / Back". Or render full names on first encounter, abbrevs
    after.
15. **Default availability state**: `statusLabels.unknown =
    "Awaiting response"` with a neutral grey pill (not red), so
    a brand-new game doesn't read as 14 parent-no responses.

### P4 — Surface gaps (~4-5 commits)

16. **Last-result card on team home** — Pat's #1 friction.
    Component shell already commented at
    `teams/[teamId]/page.tsx:26-31`; needs the query + viz.
17. **Distinguish or unify `Start game` vs `Set lineup` CTAs** on
    game-detail. Either pick one + drop the other, or make them
    actually do different things (Set lineup → opens picker with
    Save plan & exit, Start game → skips Set lineup if the saved
    plan still valid).
18. **Stats `loading.tsx` / Suspense boundary** on Stats page.
19. **Reorder + collapse Stats sections** to coach priority.
    Pat's recommended order: Minutes equity → Player stats →
    Attendance → Head-to-head → Quarter scoring → (rest collapsed).
20. **Welcome interstitial after signup** — one card with "Hi,
    let's get your team set up" + 3 next steps. Removes Sarah's
    dead-air moment.

### P5 — Small UX wins (~3-4 commits)

21. **`AddPlayerForm` autofocus name input after submit** — 14
    fewer taps when adding a new squad.
22. **"Game created" toast** after CreateGameForm submits.
23. **Bench-empty hint** on LineupPicker — when on-field-size ==
    available count, hide the sub-interval card or change copy to
    "No bench — every player on for the whole game".
24. **PlayerStatsTable single-column leaderboard** mode (toggle or
    default for mobile).

---

## What the personas confirmed is working

- LiveTopBar consistency across all 5 `/live` states (Mike)
- Race guards: `pickScorerKind` blocks SubDueModal + freezes
  auto-hooter (Mike)
- AudioContext unlock on first pointerdown (Mike)
- Auto-scroll-to-top on quarter transition (Mike)
- The non-sticky runner-token layout header (Lisa)
- Netball's `requiredAvailable` gate + helper copy (Lisa)
- Netball's `onSavePlan: undefined` opt-out for token-auth (Lisa)
- ScoringStep notes copy — gold standard for the app (Sarah)
- Setup wizard rhythm + SetupProgress pills (Sarah)
- TeamTabBar paint-through across in-team nav (Pat)
- `game_finalised` event filter on stats (Pat)
- The `MinutesEquity` viz — exactly the right tool (Pat)
- NextUpHero round numeral (Pat)
- Card padding now uniform across all 6 settings cards (Tom)
- Canonical error banner now consistent everywhere it appears (Tom)
- Destructive-action idle treatment uniform (Restart + Delete) (Tom)
- PlayerRow edit-mode is the "reference-quality row" (Tom)
- AddPlayerForm grammar matches TeamName exactly (Tom)

---

## Cross-persona patterns

Three themes emerged across multiple personas independently:

### Theme A — Half-finished design-system migration is visible
Tom catalogued 15 specific inconsistencies. Mike noticed
`StartQuarterModal` legacy Button step-down. The pattern: SFButton
sweep landed in some places, didn't land in others. The seam is
visible to anyone looking carefully.

### Theme B — Non-coach users hit jargon walls hard
Lisa is the worst case (parent volunteer, zero AFL background).
Sarah hits it at FWD/HBK on the lineup picker. Pat hits it at
"Minutes equity". Even a 3-week veteran (Pat) is parsing fairness
jargon to figure out which section answers her actual question.

### Theme C — First-touch / orientation gaps recur
- Sarah: signup → empty dashboard, no welcome
- Lisa: token-share landing with no role context
- Pat: team home with no last-game surface

Each persona's "where do I look first?" moment isn't well-served.

---

## Highest-leverage single fix

If you could only ship ONE more commit before next Saturday:
**Lisa's orientation banner on `/run/<token>` pre-kickoff (B1).**

Reasoning:
- The parent-runner is the most-pressured persona of the five.
- Without orientation, Lisa is 15-20s into the most-stressful
  moment of her Saturday before she knows what app she's in.
- One card of plain English ("You're running scoring for Team X.
  Step 1: mark who's here.") removes the blocker.
- Trivial to ship — single component, single file edit.
- Multiplies the value of every other improvement that follows.

If you could ship THREE: add B3 (Finish-game-for-token-auth) and
B5 (z-50 modal collision). Lisa's complete journey is unblocked,
Mike's most-stressful moment is fixed. Total effort: a single
afternoon.
