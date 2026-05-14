# Netball ↔ Footy UI parity — verified state

_Last updated: 2026-05-15. Captures the state of the
[parity refactor plan](../../.claude/plans/we-used-siren-footy-staged-dijkstra.md)
after the first execution pass._

## Headline

Most of what the original audit flagged as "netball missing parity"
turned out to be **already shipped** — the audit agent grepped
patterns that had been refactored into delegation (parent-supplies-
callback) rather than inline gating. The real gaps were five
micro-interactions from the May 14–15 polish sweep that the original
PRs explicitly noted as "AFL-only, netball follow-up". Those are
now shipped.

Three new shared chrome components have been extracted as the first
step toward full shell extraction (Phases 3d / 4 / 5 deferred).

## Parity matrix

Each row is an AFL UX rule. `Status` is one of:

- ✅ **SHIPPED-PARITY** — verified working on both sports in this
  pass (either I shipped the netball mirror, or both sports were
  already in parity before this session).
- 🚫 **N/A-SPORT** — sport-specific to AFL, no netball mirror
  needed (e.g. behinds scoring).
- 🔧 **DEFERRED** — known divergence consciously left for a later
  pass.

| # | Rule | AFL location | Netball location | Status |
|---|------|--------------|------------------|--------|
| A | 44pt Exit button on LiveTopBar | `LiveTopBar.tsx` | shared (same import) | ✅ |
| B | Imperative router.push on Exit | `LiveTopBar.tsx` | shared (same import) | ✅ |
| C | Two-step kickoff with clean cancel | `LineupPicker.tsx` hosts StartQuarterModal | `netball/LineupPicker.tsx` hosts NetballStartQuarterModal | ✅ |
| D | "Save plan & exit" opt-out for token-auth | `auth.kind === "team"` gate at caller | `onSavePlan` callback presence at caller | ✅ |
| E | Continue-to-lineup gate (`requiredAvailable`) on runner-token | `AvailabilityList.requiredAvailable` | shared (same param) | ✅ |
| F | Sticky-bottom pre-game footer | `LineupPicker.tsx` line ~941 → `LineupPickerFooter` | netball/LineupPicker → `LineupPickerFooter` | ✅ (new shared) |
| G | Pulse loader on Continue-to-lineup CTA | `ContinueToLineupButton.tsx` | shared (same import) | ✅ |
| H | SlotFillSheet at z-[60] | shared `ui/SlotFillSheet.tsx` | shared | ✅ |
| I | AppHeaderShell hides app header on /live | `AppHeaderShell.tsx` pathname check | shared (route ends in /live for both) | ✅ |
| J | Manual end-quarter confirm modal | `LiveGame.tsx` line ~1634 | `NetballLiveGame.tsx` line ~1548 | ✅ |
| K | Add-late-arrival + Reset row | `LiveGame.tsx` | `NetballLiveGame.tsx` lines 1098–1099 | ✅ |
| L | WalkthroughModal + skipWelcome + suppressAutoWalkthrough | shared `live/WalkthroughModal.tsx` | shared | ✅ |
| M | Availability breadcrumb + late-arrival hint | `LineupPicker.tsx` → `LineupPickerBreadcrumb` | netball/LineupPicker → `LineupPickerBreadcrumb` | ✅ (new shared) |
| N | End-game ScoreReviewPanel consolidation | `FullTimeReview.tsx` | `NetballFullTimeReview.tsx` (delegates to same panel) | ✅ |
| O | Runner-token orientation banner (`RunnerWelcomeBanner`) | `run/[token]/page.tsx` (AFL branch) | `run/[token]/page.tsx` (netball branch line 172) | ✅ |
| P | AddLateArrival component | shared `LateArrivalMenu.tsx` | shared | ✅ |
| Q | SubDueModal (mid-quarter rotation) | `SubDueModal.tsx` (AFL only) | n/a — netball has no rolling subs | 🚫 |
| R | SFButton sweep on primary CTAs | done across AFL surfaces | done across netball surfaces | ✅ |
| S | Token-auth finish-game success card | `LiveGame.tsx` token branch | `NetballLiveGame.tsx` lines 1231–1242 | ✅ |
| T | Card padding standardisation | error banner via `InlineAlert` | error banner via `InlineAlert` | ✅ (new shared) |
| U | Safe-area-inset-bottom handling | `pb-[calc(...+env(safe-area-inset-bottom))]` | same pattern everywhere | ✅ |

## Micro-interaction parity (May 14–15 polish sweep)

Each row is a P-numbered micro-interaction from
[MICRO-INTERACTIONS-PLAN.md](./MICRO-INTERACTIONS-PLAN.md).

| ID | Description | AFL commit | Netball commit | Status |
|----|-------------|------------|----------------|--------|
| P0-4 | Modal slide-up entrance | `cd1022b` | shared primitive | ✅ |
| P0-5 | SlotFillSheet slide-up | `c56d3ea` | shared primitive | ✅ |
| P0-6 | Score halo + count-up | `cf055e8` | same commit (touched netball) | ✅ |
| P1-1 | active:scale-[0.97] on tiles | (PlayerTile, AFL-only) | `5ef7e01` | ✅ |
| P1-2 | AvailabilityRow row-flash | `a0ad1b4` | shared primitive | ✅ |
| P1-3/4 | FillInRow list animations | `7aa4a10` | shared primitive | ✅ |
| P1-5/15 | Input + auth-form polish | `784ec3c` | shared primitive | ✅ |
| P1-7 | Quarter-end pre-swap pulse | `7d28f21` (PlayerTile) | 🚫 no analogous netball Q-end swap-plan moment | 🚫 |
| P1-9 | Long-press pre-cue ring | `7d28f21` | `5ef7e01` | ✅ |
| P1-10 | Haptics across game moments | `15b0a7c` | `c4c90ac` + `951932f` | ✅ |
| P1-12 | Sub-due modal staggered open | `7d28f21` | 🚫 no SubDueModal in netball | 🚫 |
| P1-14 | Sticky-bottom-bar slide-in | `c29c87e` | `ea6a4fb` | ✅ |
| P1.5-3 | First-tap long-press hint | `2ca8e90` | `c4c90ac` | ✅ |
| P1.5-5 | Field/Court wake-up halo on Q1 | `753c2a4` | `da3d822` | ✅ |
| P2-4 | Guernsey digit-flip | `276cd3f` | shared primitive | ✅ |
| P2-7 | Walkthrough directional slide | `a0c2178` | shared (WalkthroughModal) | ✅ |
| P2-10 | Reduced-motion preference toggle | `70078ac` | global CSS | ✅ |

## Audit false-positives (audit said "missing", actually shipped)

The original gap analysis surfaced several "AFL has X, netball
doesn't" findings that turned out to be untrue. Logging them here so
the next audit run can pre-filter:

- **"NetballLineupPicker missing token-auth save-plan gate"** — the
  gate had been moved to the parent (`NetballLiveGame.tsx` line
  1162: `auth.kind === "team" ? handleSavePlan : undefined`). Same
  behaviour, different layer. The audit grepped for `auth.kind ===`
  inside the picker and didn't find it.
- **"Netball missing LiveTopBar router.push fix"** — netball uses
  the shared `LiveTopBar` component, so the AFL-side fix propagated
  automatically.
- **"Netball missing runner-token orientation banner"** —
  `run/[token]/page.tsx` netball branch line 172 already renders
  `RunnerWelcomeBanner` exactly like the AFL branch.
- **"Netball missing Q-by-Q drilldown chip"** — netball imports
  `QuarterScoreModal` (line 31) and wires `quarterScoresOpen` state
  through `NetballScoreBug.onShowQuarterScores`.
- **"AFL QuarterBreak missing Keep mode"** — `QuarterBreak.tsx`
  already has the three-mode toggle (Suggested / Keep / Manual) at
  line 208 with full state machine and button.

## Shipped this pass

11 commits over one session:

1. `3a5a139` — AddFillInForm visibility lift to SFButton (Phase 1.7)
2. `da3d822` — Court wake-up halo on Q1 kickoff (Phase 1.5.1)
3. `c4c90ac` — LongPressHint + haptic on netball long-press (Phase 1.5.2)
4. `5ef7e01` — PositionToken P1-9 pre-cue + P1-1 active:scale (Phase 1.5.3)
5. `ea6a4fb` — NetballLiveGame sticky-bottom slide-in (Phase 1.5.4)
6. `951932f` — Five netball haptic call-sites (Phase 1.5.5)
7. `457bb6e` — LineupPickerFooter extraction (Phase 3a)
8. `b12e9c8` — LineupPickerBreadcrumb extraction (Phase 3b)
9. `0ad6442` — InlineAlert extraction (Phase 3c)

(Plus this audit doc.)

## Genuinely sport-specific (do NOT mirror)

These are netball-only or AFL-only by design:

- **AFL behinds scoring** — netball is goals-only.
- **AFL rolling subs + SubDueModal** — netball substitutes only at
  period breaks (mid-quarter sub picker is reserved for injury /
  loan fill-ins).
- **AFL zone-lock vs netball position-lock** — same UX concept,
  different shape (zones vs positions).
- **Netball "Keep last Q's lineup" mode** — now parity-shipped on
  AFL too (verified: line 208 of QuarterBreak.tsx).
- **Netball quarter-length override card** — netball has no rolling
  subs, so the slot AFL uses for sub-interval is repurposed for
  per-game quarter length.

## What's left (deferred)

The big-ticket items from the original plan that this session
didn't ship:

- **Phase 3d — Full LineupPickerShell state extraction**: would own
  selection state, mode toggle, useTransition wiring across both
  sports. Substantial refactor (~700 lines).
- **Phase 4 — QuarterBreakShell**: even bigger (~1800 lines per
  sport).
- **Phase 5 — LiveGameShell**: biggest (~2000 lines per sport),
  contains the most divergence (clock state machine, mid-quarter
  substitution, scoring flow). Recommended to split into 3–4
  sub-PRs in the original plan.

These are deferred to a fresh session so they get focused attention
— each is a long-running refactor with regression risk on live-
game UI. The chrome extractions in Phase 3a–3c (this session) lay
the groundwork: future shell extractions only need to extract
state, not chrome.

## Open friction items (from USABILITY-TESTS.md)

Not strictly netball-parity but tracked in the original plan:

- **"Accept suggestion" shortcut** — closed: the picker auto-loads
  the suggested lineup on first render, so the primary CTA already
  IS accept-suggestion. Wording could be clarified ("Accept &
  start" vs "Confirm lineup"), filed for a later pass.
- **"Lock in Q{n+1} lineup" CTA rename** — deferred. Current
  "Start Q{n}" reads more accurately given the modal already
  commits the lineup atomically.
- **Runner-token "← Siren" chevron destination** — deferred. `/`
  is the most universally useful escape; redirecting to a "Game
  finished" card requires layout-level game-state which would
  bloat the runner layout.
