# UX-REVIEW — Auskick Manager full-app consistency audit

> **Caveat from the auditor:** the audit ran against the
> `nice-edison-ecfd4d` worktree, which is several commits behind
> `main`. That worktree is missing `SFButton`, the `sf/` design-system
> directory, `LiveTopBar.tsx`, and the entire `netball/` component
> tree. Findings that reference "two button libraries" / "SFButton vs
> Button" are calibrated against the older state where only the
> legacy `Button` exists, so they read as "Button vs hand-rolled
> `<button>`" rather than the live cross-library mix. The systemic
> findings (modal patterns, error displays, empty states, sticky-bar
> handling, navigation back-affordances) still translate to main.
> Re-running against main is worthwhile if you want fully-current
> file/line references — see notes at bottom.

---

## Executive summary — worst offenders

1. **The (app) layout `<header>` leaks through on `/live`.**
   `src/app/(app)/layout.tsx:31` renders a sticky `Auskick Manager`
   header with email + Sign out on every authenticated route.
   `TeamNav` hides itself on `/live` (`src/components/team/TeamNav.tsx:19`)
   but the outer header has no equivalent escape — the runner sees
   the top app chrome above the in-game header during a live game.
   Mobile users effectively get *two* sticky bars stacked. This is
   the highest-impact visual finding, since the user spends the
   most time on `/live`.
   _(On main this is already fixed via `AppHeaderShell` — confirm
   it still hides the header in every `/live*` state.)_

2. **Two competing primary-button treatments inside the same screen.**
   Game-detail (`src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx:116-122`)
   renders the "Start game / Open live game" CTA as a hand-rolled
   `<Link>` with `bg-brand-600 px-4 py-2 text-sm`, while the very
   next button on the same row (`<ShareRunnerLink>` → `Button
   variant="secondary"`) goes through the `Button` component. The
   DoneStep (`src/components/setup/DoneStep.tsx:43-55`) and dashboard
   "Create a new team" (`src/app/(app)/dashboard/page.tsx:60-66`)
   do the same thing — bare `<Link>` styled to look like a primary
   button. There are at least **4 hand-rolled primary-button
   `<Link>`s** in the app.
   _(On main these are largely fixed for the game-detail card, but
   the dashboard + setup + run-token routes still need a sweep.)_

3. **No sticky-bottom-bar `pb-` on the page wrapper.** The
   score-record panel (`src/components/live/LiveGame.tsx:990-1031`)
   is `position: fixed` at the bottom but the host wrapper has no
   compensating bottom padding. When the panel opens, bench tiles
   and "Add late arrival" sit underneath it.
   _(On main the live route's page wrapper has `stickyPb` for live
   play + Q-break + finalised states, but the score-record panel is
   a separate sticky surface inside that — worth confirming it's
   not stacking under the +/-G picker.)_

4. **`hover:` only, no `active:` on most tap targets.** App is a
   mobile-first PWA but tap-feedback is missing in most places.
   Dashboard tiles correctly use `active:bg-brand-50/40`
   (`src/app/(app)/teams/[teamId]/page.tsx:338`), but every other
   surface — `Button`, `PlayerTile`, `GameCard`, `FillInRow`,
   `AvailabilityRow`, the live-game "Got it"/"Confirm" CTAs — has
   only `hover:` states. On mobile the user gets no visual ack
   on tap.

5. **Modal/dialog backdrop is inconsistent.** Three different
   opacity values are in use: `bg-ink/40` (`Modal.tsx:19`,
   `SwapConfirmDialog.tsx:27`, `AddGameSection.tsx:54`,
   `ImportFixturesButton.tsx:123`), `bg-ink/60` (`LockModal.tsx:50`,
   `WalkthroughModal.tsx:85`), and the lineup-picker yellow warning
   panel renders without a backdrop at all. Pick one — the eye
   notices the brightness shift when crossing between them.

6. **Error-display patterns are a four-way fork.** `bg-warn-soft
   text-warn` (LiveGame:891, AddPlayerForm full-squad case:74),
   `bg-danger/10 text-danger` (TeamSongSettings:264,
   QuarterBreak:435), plain `text-danger` text (CreateGameForm:127,
   AddPlayerForm:112, TeamNameSettings:67,
   ImportFixturesButton:182), and `rounded bg-danger/20 text-danger`
   (ResetGameButton:57). Half of these set `role="alert"`, half
   don't. The inline-only ones don't visually separate from form
   copy.

7. **Empty-state treatment splits into 3+ patterns.** `EmptyState`
   component exists at `src/components/dashboard/EmptyState.tsx`
   — used by 8 dashboard sub-sections. Everywhere else, empty
   states are inlined: dashboard page, GameList, AvailabilityList,
   PlayerList, LineupPicker, Field/QuarterBreak ("Empty" pill on
   the dashed slot). Same component should be used everywhere.

8. **No live game-detail loading affordance.** Squad/Games/Availability
   wrap themselves in `<Suspense fallback={<Spinner size="lg" />}>`,
   but Settings, Stats, Dashboard, Setup all just block on the
   await with no fallback. On slow 4G users get a blank `<main>`
   while server data loads. Stats in particular fetches 5 things
   in parallel and could be visibly slow.

9. **The undo-toast / swap-toast / sub-due modal toast-style
   language is fragmented.** Three toast-like surfaces in LiveGame
   alone: the green "swap confirmed" toast (line 838-851), the
   dark "Undo last score" chip (line 854-876), and the modal
   `SubDueModal`. Different shapes, colours, shadow tokens, and
   `aria-live` states.

10. **Back affordance is wildly inconsistent.** Five different
    patterns inside the same app: `← My teams` on team layout,
    `← Games` on game detail, `← Back to availability` on
    LineupPicker, `← Availability` on run/[token]/lineup,
    `✕ Exit` font-mono on /live, and no back at all on Stats /
    Settings / Squad pages (which rely on the TeamTabBar).

---

## Findings by section

### 1) Dashboard / team home

**`src/app/(app)/dashboard/page.tsx:60-66`** — *Hand-rolled primary
button.* The "Create a new team" CTA is a raw `<Link>` styled with
`bg-brand-600 px-5 py-3 text-sm font-semibold text-warm shadow-card`.
Should use the `Button` component (or be a `Link` wrapped in one)
so the disabled state, loading prop, and focus ring stay consistent.
**Severity: MEDIUM.** Fix: wrap with `<Button asChild>` (need to add
`asChild` support) or render `<Button variant="primary">` inside
`<Link>`.

**`src/app/(app)/dashboard/page.tsx:34`** — *Eyebrow + heading
pattern absent.* This page uses `h1 "My teams" + p "Select a
team..."`. The team home page (`src/app/(app)/teams/[teamId]/page.tsx`)
uses an `Eyebrow` micro-label style for section headings ("UPCOMING",
"TEAM") but the dashboard's top doesn't have one. Inconsistent
rhythm between these two sibling pages. **Severity: LOW.**

**`src/app/(app)/teams/[teamId]/page.tsx:13-128`** — *9 inline SVG
icon definitions inside the page file.* Heroicons are pasted as
inline components (Users, Calendar, ChartBar, Cog, ChevronRight,
ArrowRight). No central icon library — the same chevron-right would
need to be redefined wherever it's wanted again. **Severity: LOW.**
Fix: extract to `src/components/ui/icons.tsx` or pull from
`lucide-react`.

**`src/app/(app)/teams/[teamId]/page.tsx:42-58` ("no teams" empty
state)** vs **`:281-290` (no upcoming games)** vs
**`src/components/dashboard/EmptyState.tsx`** — *Three different
empty-state visual patterns inside ~50 lines.* The "no teams" empty
is a single `<p>` with rounded-dashed border; "no upcoming games"
is a div with title + secondary CTA link; the dashboard's
`EmptyState` component is title + optional description.
**Severity: MEDIUM.** Fix: extend `EmptyState` to accept an optional
CTA slot, use it everywhere.

**`src/app/(app)/teams/[teamId]/page.tsx:241-264` ("Game in progress"
banner)** — *Brand-coloured pill on brand-coloured wrapper has no
`active:` state.* Uses `transition-opacity hover:opacity-95
active:opacity-90` — but the icon and chevron stay full-opacity, so
the tap feedback is muted. **Severity: LOW.**

### 2) Squad management

**`src/components/squad/SquadHeader.tsx:13-27`** — *Plain `<h2>`
heading where the rest of the app uses an `<Eyebrow>` + big number
rhythm.* The squad header looks correct on its own but the
inactive-list heading directly below it
(`src/components/squad/PlayerList.tsx:80`) uses `text-base
font-semibold` — different size from the page-level "Squad
management" `text-lg font-semibold`. **Severity: LOW.**

**`src/components/squad/PlayerList.tsx:41-50` (admin card) vs
`:52-75` (active squad card)** — *Two cards with identical surface
treatment but different internal padding.* `p-5` vs `px-4 py-3` on
the header. Pick one shadow-card padding convention and stick to it.
**Severity: LOW.**

**`src/components/squad/PlayerRow.tsx:97-127`** — *Mid-row inline
edit form gets a different visual treatment to the standard form
layout.* Edit mode renders Input + Input + Save + Cancel inline at
row-level; `serverError` is a free `<p className="w-full text-xs
text-danger">` — no role="alert", no surface treatment.
**Severity: LOW.**

### 3) Games list + game detail

**`src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx:114-129`**
— *The Start game / Share runner link / Reset / Delete action row
mixes 4 button styles.* "Start game" is a raw styled `<Link>`,
`ShareRunnerLink` renders `Button variant="secondary"`,
`ResetGameButton` and `DeleteGameButton` render `Button
variant="secondary"` with hand-applied danger overrides via
`className="border-danger/30 text-danger hover:bg-danger/10
hover:text-danger"`. The hand-applied danger styling appears at
least 4 times across the codebase. **Severity: HIGH.** Fix: add a
proper `variant="secondary-danger"` to the `Button` component, or
use the existing `danger` variant.
_(On main this card has been rebuilt with SFButton — verify the
rest of the danger-override sites have followed.)_

**`src/components/games/GameCard.tsx`** vs
**`src/app/(app)/teams/[teamId]/page.tsx:294-330` (featured next
game)** — *Two near-identical "upcoming game card" treatments
diverge.* GameCard uses `hover:border-brand-300 hover:bg-brand-50/30`
and shows availability `text-lg font-bold`; the home-page featured
game uses `hover:border-brand-200 hover:bg-brand-50/20
active:bg-brand-50/40` and shows availability `text-2xl font-bold`.
Same card pattern, drift between two surfaces. **Severity: MEDIUM.**

**`src/components/games/AddGameSection.tsx:52-86`
(manual-create modal)** — *Modal is hand-built rather than using
the `Modal` component.* `Modal.tsx` exists but isn't reused here —
`AddGameSection` and `ImportFixturesButton.tsx:121-336` both render
their own modal shell with subtly different sizing (`max-w-xl` vs
`max-w-2xl`), different backdrop opacity, different close-button
placement and styling. **Severity: MEDIUM.** Fix: extend `Modal` to
accept a header (title + close) and a `size` of `"xl"`, then use it.

**`src/components/games/AvailabilityList.tsx:58-65`** — *Pill-style
counters use a colour mix that doesn't appear elsewhere.* `bg-ok/10
text-ok border-ok/30` is used here and nowhere else for non-status
info. **Severity: LOW.**

**`src/components/games/FillInRow.tsx:48-49`** — *The "Remove"
button is its own custom-styled `<button>` with `rounded-full
border border-hairline px-3 py-1`, while removable items elsewhere
use `Button size="sm" variant="ghost"` with red overrides.*
**Severity: LOW.**

**`src/components/games/CreateGameForm.tsx:115-123` (notes
textarea)** — *Raw `<textarea>` styled inline.* No `Textarea`
component to match the `Input` component. The classes duplicate
Input.tsx. **Severity: MEDIUM.** Fix: add `Textarea` component to
`@/components/ui/`.

**`src/components/games/ImportFixturesButton.tsx:330-334`** —
*Inline `<Spinner /> "Fetching from PlayHQ…"` while the same file
uses `<Button loading>` everywhere else.* Two different loading
affordances for the same wait. **Severity: LOW.**

### 4) Live game (all sub-states)

**`src/app/(app)/layout.tsx:31-51`** — *App-layout header doesn't
hide on `/live*`.* `TeamNav` hides itself but the parent `<header>`
containing "Auskick Manager" + email + Admin link + Sign out
renders unconditionally. On mobile this eats ~48px of vertical
real estate above the in-game scorebug. **Severity: HIGH.**
_(Already fixed on main via `AppHeaderShell`. Verify it's hiding
in every `/live*` sub-state.)_

**`src/components/live/LiveGame.tsx:980-1031` (record-score fixed
panel)** — *The single fixed-bottom panel pattern in the codebase.*
Correctly handles `safe-area-inset-bottom`. But:
- The host wrapper has **no `pb-` to clear it**. When the panel is
  visible, the LateArrivalMenu, Bench, and (when game is finished)
  GameSummaryCard sit underneath it. **Severity: HIGH.**
- The panel uses raw `<button>` with hand-built `bg-brand-600` /
  `bg-warn` rather than `Button` component, so its focus ring +
  disabled state don't match the rest of the app.

**`src/components/live/LiveGame.tsx:807-820` ("Exit" + "?")** —
*The "?" help button is a hand-rolled `<button>` 24×24 px circle.*
Both small enough to fail the 44×44 mobile target.
**Severity: MEDIUM.**

**`src/components/live/GameHeader.tsx:127-141` (opponent +G/+B
buttons)** — *`+G` and `+B` for the opponent are `rounded-xs
px-1.5 py-0.5 text-[9px]` — well under 44×44.* The home team's
per-player goal/behind go through the big `bg-brand-600 py-3`
panel — totally different affordance for the same action.
**Severity: MEDIUM.**

**`src/components/live/LineupPicker.tsx:198-206` (auto-suggest
warning panel)** — *Uses `bg-warn-soft border-warn/20 text-warn`
to convey an info message ("Auto-suggested starting lineup").*
Same colour family the app uses for actual warnings/errors. The
QuarterBreak's fairness card uses neutral `bg-surface` + a numeric
badge for the same kind of "here's the auto-suggestion" message.
**Severity: MEDIUM.**

**`src/components/live/LineupPicker.tsx:208-228` (on-field-size
select)** — *Raw `<select>` styled inline with ~10 utility classes.*
Same pattern duplicated in `TeamMembersSettings.tsx:133-145`,
`TeamMembersSettings.tsx:296-309`, and `PlayerStatsTable.tsx:54-65`.
There's no `Select` component. **Severity: MEDIUM.** Fix: add
`Select` component.

**`src/components/live/QuarterBreak.tsx:311-324` (Reshuffle
toggle)** — *Toggle rendered as a `Button` with text including ✓
and `variant` swapping between `primary`/`secondary`.* Same
conceptual "on/off" choice in TeamSongSettings is a proper `Toggle`
switch. **Severity: LOW.**

**`src/components/live/QuarterBreak.tsx:434-438`** vs
**`LiveGame.tsx:890-893` (error display)** — *Same component
family, different error treatment.* QuarterBreak uses `bg-danger/10
text-danger`, LiveGame uses `bg-warn-soft text-warn`.
**Severity: HIGH.** Fix: pick `bg-danger/10 text-danger` — more
semantically correct for an action failure.

**`src/components/live/GameSummaryCard.tsx:184` (full-time summary
card)** — *Uses `animate-slide-up` — the only entrance animation
in the live flow.* Either standardise the slide-up across all
post-action panels or drop it here. **Severity: LOW.**

**`src/components/live/GameSummaryCard.tsx:187-193` ("Copy for
group chat" button)** — *Custom-styled brand button.* Should be
`<Button size="sm">`. **Severity: LOW.**

**`src/components/live/LockModal.tsx:74-83`, `:101-110`, `:153-159`,
`:163-170`, `:174-181`, `:184-194`, `:195-201`** — *7 different
custom-styled action buttons inside one modal, none using the
`Button` component.* Six different background-colour treatments
(brand-600, ink, warn, danger, hairline, danger again, transparent).
**Severity: HIGH.** Fix: rebuild with Button variants + a
danger-secondary variant.

**`src/components/live/LateArrivalMenu.tsx:21-22` (collapsed CTA)**
— *`Button size="sm" variant="secondary"` (consistent — good).*
But the expanded list renders each candidate as a hand-built
`<button>` — the same pattern used in LineupPicker:255-270 and
QuarterBreak:365-376. **Severity: LOW.** Fix: extract a
`<PlayerPickRow>` component.

**`src/components/live/SwapCard.tsx:198-272` (expanded swap list)**
— *"Do" buttons are hand-styled `<button>`s.* Component is
dark-themed (`bg-ink`) — defensible — but the inner CTAs should
still go through a `Button` or a documented dark-variant.
**Severity: MEDIUM.**

**`src/components/live/SwapConfirmDialog.tsx:30-37`** — *Confirm +
Cancel both `<Button>` (✓ good).* This is the cleanest dialog
action row in the app. Reference for fixing LockModal.

**Live route `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx:162-168`**
— *Restart-game button placed in a `<div className="border-t
border-hairline pt-4">` BELOW the LiveGame component.* On
`/run/[token]/page.tsx:100-102` the same Restart button is
rendered the same way, but **without the `space-y-3` parent of
the main game** — it sits on `border-t pt-4` with no left/right
padding harmonisation. **Severity: MEDIUM.**
_(On main this is reorganised — Restart Game now sits in the
LateArrivalMenu row inside LiveGame.)_

### 5) Stats

**`src/app/(app)/teams/[teamId]/stats/page.tsx`** — *No Suspense
/ loading state.* Fetches 5 tables in parallel from Supabase, plus
a follow-on game_events and game_fill_ins query. On a slow
connection the user sees a blank Stats page. **Severity: MEDIUM.**

**`src/components/dashboard/DashboardShell.tsx:52-60` (Section
component)** — *Locally-scoped helper.* Each Section is `<section
className="overflow-hidden rounded-lg border border-hairline
bg-surface shadow-card">` — this pattern (card with bordered
header) is duplicated in `PlayerList.tsx:52-57`,
`setup/SquadStep.tsx:43-49`, `setup/GamesStep.tsx:51-55`.
**Severity: LOW.** Fix: hoist `Section` out of DashboardShell.

**`src/components/dashboard/PlayerStatsTable.tsx:54-65` (Sort
select)** — *Raw `<select>` with hand-rolled focus ring
`focus:border-brand-500 focus:outline-none focus:ring-1
focus:ring-brand-500`.* Most selects use
`focus:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600`.
**Severity: LOW.**

### 6) Settings

**`src/app/(app)/teams/[teamId]/settings/page.tsx:90-115`** — *No
page-level heading.* Other tabbed pages have a section heading.
Settings just dumps four `<section>` cards under the TeamTabBar.
**Severity: LOW.**

**`src/components/team/TeamNameSettings.tsx:40`** vs **`TeamMembersSettings.tsx:48`**
vs **`TrackScoringToggle.tsx:36`** vs **`TeamSongSettings.tsx:233`** —
*Four settings cards, three different padding conventions:* `p-4`
/ `p-5` / `px-4 py-3` / `p-5`. **Severity: MEDIUM.** Fix: pick
`p-5` for all settings cards (matches the existing Squad
add-player card).

**`src/components/team/TeamNameSettings.tsx:67-70` (save
error/success)** — *Plain `<p className="text-xs text-danger">`
and `text-xs text-ok` — no surface, no role.* TeamSongSettings:264
uses a proper `bg-danger/10` banner; TeamMembersSettings:124-128
uses inline `text-xs text-danger` with `role="alert"`. Three
patterns for the same conceptual feedback. **Severity: MEDIUM.**

**`src/components/team/TeamSongSettings.tsx:457-466` (audio file
input)** — *Raw `<input type="file">` with hand-styled
file-button pseudo-element classes.* No corresponding `FileInput`
component. Only file input in the app. **Severity: LOW.**

**`src/components/team/TeamSongSettings.tsx:432-447` (collapsible
"Or upload an audio file")** — *Hand-rolled disclosure pattern
with a ▶ rotation.* The only disclosure in the app.
**Severity: LOW.**

**`src/components/team/TeamMembersSettings.tsx:248-287` (invite
link "ready" panel)** — *Visual treatment uses `border-brand-200
bg-brand-50` — the same brand-tinted surface as
`FinishSetupBanner.tsx:16`.* Conflating "success" feedback with
"action required" CTA. Consider `bg-ok/10` for success-style.
**Severity: LOW.**

**Settings route generally** — *Doesn't expose `playhq_url` or
`age_group`* — but the rest of the team-level config (track
scoring, song, members, name) IS exposed. Age group is a critical
pre-game variable. **Severity: MEDIUM** (functional inconsistency,
not visual, but flagging).

### 7) Run / token-share route (`/run/[token]`)

**`src/app/run/[token]/page.tsx:108-131` (token availability
page)** — *Different page wrapper to the team-route equivalent.*
This page uses `<div className="space-y-6 p-3">`; the equivalent
team-route detail page uses `<div className="space-y-6">` with the
(app) layout adding `px-4 py-4`. So on the runner route, gutters
are `p-3 = 12px` vs the team route's `px-4 = 16px`.
**Severity: MEDIUM.**

**`src/app/run/[token]/page.tsx:123-130` ("Continue to starting
lineup →" button)** — *Another hand-rolled primary `<Link>` with
`bg-brand-600 px-4 py-2`.* Same finding as dashboard, DoneStep,
and game-detail Start button. **Severity: MEDIUM.**

**`src/app/run/[token]/page.tsx:108-131`** vs **`src/app/run/[token]/lineup/page.tsx:65-83`
(page headers)** — *Two different header treatments on adjacent
routes.* The first page uses `GameInfoHeader` (compact off → full
title block). The second renders its own `<h2>{teamName} vs
{opponent}</h2> + subtitle`. **Severity: MEDIUM.** Fix: use
`GameInfoHeader` on both.

**`src/app/run/[token]/lineup/page.tsx:67-74`** — *Back link is
`← Availability` — different copy and arrow style to `← Back to
availability` inside the LineupPicker itself
(LineupPicker:182-196).* Two back affordances for the same
destination on the same page. **Severity: MEDIUM.** Fix: pick one.

**Token route has no `pb-` for the sticky scoring panel.** Same
finding as the team /live route — but worse here, because there's
no (app) layout chrome compensating. **Severity: HIGH.**

---

## Cross-cutting

### Button system

There is effectively ONE button library (`@/components/ui/Button`)
in this worktree state — the brief's "SFButton vs Button" split
doesn't apply here. But there are at least **15 places** where the
Button component is bypassed in favour of a hand-rolled `<button>`
or `<Link>` with brand-600 / shadow-card classes. The biggest
offenders, in priority order:

1. `LockModal.tsx` — 7 hand-rolled action buttons (HIGH).
2. `LiveGame.tsx:1012-1027` — Goal/Behind record buttons (HIGH;
   mobile primary action).
3. `GameSummaryCard.tsx:187-193` — Copy-for-group-chat button.
4. `LineupPicker.tsx:255-270`, `QuarterBreak.tsx:365-376`,
   `LateArrivalMenu.tsx:43-58` — Player-pick rows (3 near-identical
   custom buttons).
5. `dashboard/page.tsx:60`, `setup/DoneStep.tsx:50`,
   `setup/SquadStep.tsx:76`, `setup/GamesStep.tsx:97`,
   `setup/ScoringStep.tsx:48`, `run/[token]/page.tsx:124`,
   `teams/[teamId]/games/[gameId]/page.tsx:116` — Primary CTA
   `<Link>`s (7×).
6. `LiveGame.tsx:813-820` — `?` help button.
7. `LiveGame.tsx:864-874` — Undo link button.
8. `FillInRow.tsx:46-51` — Remove pill.
9. `AvailabilityRow.tsx:69-76` — Status pill.
10. `setup/SetupProgress.tsx:39-100` — Step bubbles.

Fix path: extend `Button` to support `asChild` (Radix-style) so a
`<Link>` can wear button styling; add `variant="secondary-danger"`
(replaces the 4 hand-applied danger override patterns); document
a "row button" sub-component for the player-pick pattern.

### Sticky-bottom-bar pattern

Only one sticky-bottom surface exists in this worktree: the
LiveGame score-record panel. It correctly handles safe-area-inset
but does NOT trigger a `pb-` on the page wrapper.
_(On main there are multiple sticky-bottom bars — Q-break Ready
CTA, live scorebug, Finish-game CTA — verify each one has the
right pb-clearance.)_

### Loading states

`<Spinner />` is used as a Suspense fallback in 4 places (squad,
games, games/[gameId], admin user). Plus `Button loading` is used
inline in ~12 places. The two spinner glyphs differ slightly
(4-stroke vs 2.5-stroke). Stats / Settings / Dashboard / Setup
routes have NO Suspense boundaries.

There are no skeleton placeholders anywhere — that's consistent
(good).

### Error states

Four error treatments in active use:

| Pattern | Usage |
|---|---|
| `bg-warn-soft text-warn` (banner, warn) | `LiveGame.tsx:891`, `LineupPicker.tsx:198`, `AddPlayerForm.tsx:74` |
| `bg-danger/10 text-danger` (banner, danger) | `TeamSongSettings.tsx:264`, `QuarterBreak.tsx:435`, `ResetGameButton.tsx:47-58`, `DeleteGameButton.tsx:47-58` |
| `text-sm text-danger` (inline, no surface) | `CreateGameForm:127`, `AddPlayerForm:112`, `TeamNameSettings:67`, `ImportFixturesButton:182,298`, `TeamMembersSettings:124,404`, `PlayerRow:119`, `Input:27`, `AddFillInForm:110`, `LineupPicker:309`, `QuarterBreak:435` |
| `rounded bg-danger/20 text-xs text-danger` (small inset) | `ResetGameButton:57`, `DeleteGameButton:57` |

`role="alert"` is set on roughly half — fix path is to formalise:
short field-level errors keep the inline `text-danger` style with
role="alert"; whole-form/action errors get the `bg-danger/10`
banner; "info / warning" copy uses the warn family.

### Modal / dialog

The `<Modal>` component is used in 4 places: `SubDueModal`,
`StartQuarterModal`, `QuarterEndModal`, and that's it. Six other
modal-style overlays bypass it:

- `LockModal.tsx:49-55` — full hand-roll
- `SwapConfirmDialog.tsx:25-28` — full hand-roll (but it has an
  onClick dismiss on the backdrop, which `Modal` doesn't)
- `WalkthroughModal.tsx:83-90` — bottom-aligned variant on mobile
  (defensible — true full-screen mobile pattern)
- `AddGameSection.tsx:52-86` — full hand-roll
- `ImportFixturesButton.tsx:121-336` — full hand-roll
- `SlotFillSheet` (added on main) — would be the 7th if not
  consolidated

Fix path: extend `Modal` to accept (a) close-on-backdrop-click,
(b) a header slot with title+close button, (c) a `position` prop
for bottom-vs-center on mobile. Then migrate the hand-rolled ones.

### Mobile breakpoint coverage

Specific gaps:

- `src/components/games/ImportFixturesButton.tsx:216-294` —
  Fixtures preview table is `max-h-96 overflow-y-auto` wrapped in
  `<table>` with 5 columns. On a 360px phone screen this will
  horizontal-scroll inside the modal. No `sm:hidden` fallback to
  a card layout. **Severity: MEDIUM.**
- `src/components/live/LineupPicker.tsx:230 (`grid sm:grid-cols-2`)** —
  Single-column on mobile (correct), 2 columns on sm+. The slot
  cards inside have variable height; on tablet you can get
  visible misalignment when one column has 4 players and another
  has 1. **Severity: LOW.**

### Navigation & exits

Five back/exit patterns (see exec #10). The fix is to choose two:
a "breadcrumb back" for read-only/edit pages (uses `← Section
name`) and an "exit" for full-screen game/runner pages (uses
`✕ Exit`). Then standardise.

Specific issue: `src/app/(app)/teams/[teamId]/squad/page.tsx`,
`stats/page.tsx`, `settings/page.tsx` have NO back affordance —
they rely on the TeamTabBar for nav. Defensible since the tab
bar is sticky-ish. But the dashboard route has its `← My teams`
back link and the game-detail has `← Games`, which suggests pages
should have one. Inconsistent.

---

## What looked good — don't regress these

- **`<Toggle>`** — used consistently in `TeamSongSettings`,
  `TrackScoringToggle`, `PlayerRow` (active/inactive). All three
  render the same switch with the same brand-600 active state.
- **`<Badge>`** — covers role badges (admin / game_manager /
  parent) and active/inactive. Used in `TeamMembersSettings` and
  `dashboard/page.tsx` with consistent shape and variants.
- **`<FormattedDateTime>`** — every date display in the app goes
  through this component. Truly consistent date treatment.
- **`<InfoTooltip>`** — currently single-instance, but it's a
  proper accessible popover with outside-click + Escape handling.
  Worth extending.
- **`<SetupProgress>`** — consistent across all 5 setup steps.
- **`<GameInfoHeader>` (compact vs default)** — clean variant
  pattern.
- **`useTransition` + `startTransition` discipline** — every
  action mutation in the codebase uses this pattern, errors get
  caught and surfaced. Pattern is consistent, just the *visual
  treatment* of the surfaced error isn't.
- **`<GameHeader>` / scorebug** — single point of truth for the
  live game's scoreboard + clock pill. Genuinely well-factored.
- **The LiveGame swap-toast → undo-chip transition (lines
  836-876)** — the only place toast-language exists, but it
  correctly de-emphasises after 8s by swapping background colour.
  Just needs siblings.

---

## Suggested order of operations

If you want to fix the worst stuff first in a single sweep:

1. **Verify the (app) layout `<header>` hide on `/live*` covers
   all sub-states** (HIGH — visual blocker).
2. **Add `pb-` to LiveGame wrapper when the score panel is
   fixed-visible** (HIGH — usability).
3. **Migrate the 7+ hand-rolled primary `<Link>` CTAs** to
   `Button asChild` or wrapper pattern (HIGH — visual consistency).
4. **Rebuild `LockModal` action stack** with `Button` + a new
   `secondary-danger` variant (HIGH — single-screen ugliness).
5. **Standardise error display**: pick "banner-style for action
   errors, inline-style for field-level" and migrate
   ResetGameButton / DeleteGameButton / TeamSongSettings /
   QuarterBreak / LiveGame to one banner style (HIGH).
6. **Extract `Modal`** to support header/close + `xl` size, migrate
   AddGameSection + ImportFixturesButton + LockModal (MEDIUM).
7. **Add `Textarea` and `Select`** components to `@/components/ui/`,
   migrate CreateGameForm + LineupPicker + TeamMembersSettings +
   PlayerStatsTable (MEDIUM).
8. **Extract `Section`** from DashboardShell into a shared
   component, use in PlayerList / SquadStep / GamesStep (LOW).
9. **Choose ONE empty-state pattern** (the existing `EmptyState`
   + optional CTA), migrate everywhere (LOW).
10. **Audit `/run/[token]`** to match team-route gutters and
    chrome (MEDIUM).

Items 1–4 are the ones the user is most likely to notice next,
given they spend the most time on `/live` and tap on the action
buttons there.

---

## Notes for a re-audit against current `main`

The auditor was running in a stale worktree. To re-run against the
fresh state, spin up `gsd-ui-auditor` against `main` (or a fresh
worktree branched from `HEAD`). Findings that the current `main`
already addresses (and so should be DROPPED from the next pass):

- `AppHeaderShell` hides the (app) header on `/live*` — done.
- Game-detail card buttons rebuilt with SFButton — done.
- LiveTopBar extracted as shared component — done.
- Stats requires `game_finalised` event — done.
- Q-break content butting against notch — done.
- Single-team auto-redirect from dashboard — done.

Findings that should be RE-VERIFIED on main:

- Sticky-bottom `pb-` math for each /live state (now includes
  finalised Finish-game CTA).
- Hand-rolled primary `<Link>` CTAs (game-detail done, others
  pending).
- Hand-applied danger overrides — game-detail done, settings
  components still likely affected.
- Empty-state pattern — likely unchanged.
- Modal pattern — likely unchanged.

Findings that should APPLY freshly on main (look for them):

- Cross-library button mix (`SFButton` vs legacy `Button`) — the
  brief's biggest concern. Worth a targeted grep:
  `grep -rln "@/components/ui/Button" src/` to find legacy
  callers in screens where `SFButton` is already used.
- Netball-AFL feature parity drift.
- Whether the new `SFCard` (if it exists on main) is used
  consistently, or surfaces still inline the rounded-md-border-
  bg-surface-shadow-card stack.
