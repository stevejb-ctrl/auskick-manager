# UX consistency audit — Siren (third attempt, calibrated to main @ 8cbafee)

Audited against the actual codebase at
`C:/Users/steve/OneDrive/Documents/Auskick manager` (HEAD = `8cbafee`,
post-`Game-detail buttons: harmonise under one design system`). The
earlier two passes ran against a stale worktree with no `SFButton`, no
`netball/` folder, and no `LiveTopBar`; every "missing component"
finding from those reports is invalid and should be discarded.

Surface in scope: `src/app/(app)/**` + `src/app/run/[token]/*`.

---

## Executive summary — top issues, ranked

1. **Sticky-bottom CTA on `/live` finalised state is hand-rolled in BOTH
   sports** (`LiveGame.tsx:2197-2202` AFL, `NetballLiveGame.tsx:1181-1186`
   netball). The "Finish game" button is a raw `<Link>` with
   `bg-brand-600 px-5 py-3 …` classes duplicating
   the SFButton accent variant by hand. SFButton already supports
   `href` polymorphism — this is exactly the shape it was built for.
   Two of the most user-visible CTAs in the app sidestep the design
   system. **HIGH**.
2. **`QuarterBreak.tsx` and `NetballQuarterBreak.tsx` ship the "Ready
   for Q{n}" primary CTA as legacy `<Button>`**
   (`QuarterBreak.tsx:1531-1538`, `NetballQuarterBreak.tsx:1355-1362`).
   Both inside the canonical sticky-bottom shell pattern (correct), but
   the button itself renders as `bg-brand-600` (legacy primary)
   while the AFL `LineupPicker` sticky CTA two screens earlier uses
   `<SFButton variant="accent" size="lg" full>` — same colour, different
   library, different height (Button lg = `py-2.5 text-base` ≈ 42px,
   SFButton lg = `h-[52px]`). Coaches see the "Ready" CTA shift
   visually between pre-game and Q-break. **HIGH**.
3. **`NetballLineupPicker`'s sticky "Confirm lineup" CTA is hand-rolled**
   (`netball/LineupPicker.tsx:534-545`). Inside the correct sticky bar,
   but uses a bespoke `<button className="bg-brand-600 py-3 …">` instead
   of `<SFButton variant="accent" size="lg" full>`. Cross-sport drift:
   AFL pre-game uses SFButton, netball pre-game does not. **HIGH**.
4. **Netball pre-game LineupPicker is missing the "Save plan & exit"
   affordance** that AFL's sticky bar carries
   (`live/LineupPicker.tsx:917-955`). AFL coaches can stash a draft and
   leave; netball coaches can't. Sport parity break on a high-traffic
   surface. **HIGH**.
5. **Token-share runner gets two stacked sticky headers on `/run/[token]`**.
   `src/app/run/[token]/layout.tsx` mounts a sticky SirenWordmark header
   (lines 8-34), then the runner lands inside `<LiveGame>` /
   `<NetballLiveGame>` which mount `LiveTopBar` *also sticky-top* once
   the lineup is set. AppHeaderShell only hides the `(app)` layout
   header — it doesn't apply to `run/[token]/*`. **HIGH**.
6. **Netball components leak raw Tailwind colours instead of design
   tokens** (`netball/LineupPicker.tsx:613-639` BenchStrip uses
   `border-neutral-200 bg-white text-neutral-700 text-neutral-500
   text-neutral-800 hover:bg-neutral-100 border-brand-500 bg-brand-50
   text-brand-800 ring-brand-400`; `netball/PositionToken.tsx:142-151`
   uses `bg-white sky-700 amber-300 amber-50 neutral-100 neutral-300`).
   AFL components never reach for raw `neutral-*` / `bg-white` /
   `amber-*` / `sky-*`. The token system (`text-ink`, `text-ink-mute`,
   `bg-surface`, `border-hairline`, `bg-warn-soft`) covers every state
   these use. **HIGH**.
7. **Late-arrival row buttons don't match heights despite a commit
   claiming they do** (`LateArrivalMenu.tsx:30`, `ResetGameButton.tsx:59`,
   used together in `LiveGame.tsx:1554-1564` and
   `NetballLiveGame.tsx:1562-1573`). Commit `261c281` bumped
   `LateArrivalMenu` to `Button size="md"` (= `px-4 py-2 text-sm`,
   ≈ 36-38px) but `ResetGameButton`'s trigger is `SFButton size="md"`
   (= `h-11` = 44px). The row still mismatches by ~6-8px because the
   two buttons are different libraries with different size scales.
   **HIGH**.
8. **Inline error display has at least four different patterns** —
   canonical `rounded-md bg-danger/10 px-3 py-2 text-sm text-danger`
   (QuarterBreak, NetballLineupPicker, TeamSongSettings), small-inset
   `rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn` for an error
   (LiveGame line 1444 — wrong colour token AND wrong corner radius
   AND wrong severity), short-form `rounded bg-danger/10 px-2 py-1
   text-xs text-danger` (ResetGameButton modal line 86), and bare
   `text-sm text-danger` (AddPlayerForm, FullTimeReview server
   errors). **MEDIUM**.
9. **Settings card padding drifts across the same page**: TeamName
   `p-4`, TrackScoring `px-4 py-3`, QuarterLength `px-4 py-3`,
   CohortChips `p-4 sm:p-5`, TeamMembers `p-5`, TeamSong `p-5`. Four
   distinct paddings for cards that all live on `/settings`. **MEDIUM**.
10. **Five files import BOTH `Button` and `SFButton`** —
    `DeleteGameButton`, `ResetGameButton`, `ShareRunnerLink`,
    `QuarterBreak`, `PlayerRow`. Smell of an in-progress migration; in
    every case the legacy `<Button>` is used inside a confirm panel /
    inline action while the entry-point trigger is `SFButton`. **MEDIUM**.

---

## Findings by section

### 1. Dashboard / team home — `/dashboard`, `/teams/[teamId]`

- **No findings.** Both `dashboard/page.tsx` and `teams/[teamId]/page.tsx`
  are SF-only (SFButton + SFCard everywhere) and the LiveHero / NextUpHero
  / EmptyHero variants all share the same visual treatment. Solid.

### 2. Squad — `/teams/[teamId]/squad`

- `src/components/squad/PlayerRow.tsx:9, 12, 167, 170, 191` — imports
  `Button` (legacy) and `Guernsey` (sf). The inline Edit / Save / Cancel
  buttons should move to `SFButton size="sm" variant="ghost"` so the row
  matches the rest of the SF surfaces. **MEDIUM**.
- `src/components/squad/AddPlayerForm.tsx:5, 147` — legacy
  `<Button type="submit">` for the primary Add-player CTA on a top-of-page
  form. Other primary CTAs on the squad page would use SFButton primary.
  **MEDIUM**.
- `src/components/squad/AddPlayerForm.tsx:142` — bare
  `<p className="text-sm text-danger" role="alert">` for server errors.
  Inconsistent with the rest of the app's `rounded-md bg-danger/10` pattern.
  **LOW**.

### 3. Games list + game detail

- **No findings on `games/page.tsx`** — Eyebrow + GamesFilter + GameList
  + Suspense fallback Spinner (which is a PulseDot shim, brand-correct).
- **Game-detail page is the cleanest surface in the app** — confirmed
  intentional (commit `8cbafee`). All buttons SFButton, all cards SFCard,
  hierarchy primary/ghost/danger holds.
- `src/components/games/ShareRunnerLink.tsx:5, 63` — trigger is
  `SFButton variant="ghost"`, but inside the warning panel (lines 50-67)
  the "Copy" affordance is legacy `<Button size="sm">`. Two libraries on
  one screen. **MEDIUM**.
- `src/components/games/DeleteGameButton.tsx:6-7, 41, 67, 76` — trigger
  is `SFButton variant="danger"`, but the inline confirm panel's
  "Yes, delete this game" + "Cancel" buttons are legacy
  `<Button variant="danger">` and `<Button variant="secondary">`. Same
  smell as ShareRunnerLink. **MEDIUM**.
- `src/components/games/ResetGameButton.tsx:5-7, 59, 95, 105, 117, 126` —
  trigger is `SFButton variant="danger"`, but every button inside the
  confirmation Modal (the "I understand, continue" / "Cancel" / "Yes,
  restart this game") is legacy `<Button>`. The two-stage modal lives in
  the same DOM as the SFButton-styled trigger, so the click-through
  transitions visually shift mid-flow. **MEDIUM**.
- `src/components/games/ResetGameButton.tsx:86` — error chip uses
  `rounded bg-danger/10 px-2 py-1 text-xs` instead of the canonical
  `rounded-md … px-3 py-2 text-sm`. **LOW**.
- `src/components/games/AvailabilityRow.tsx:97-107` — hand-rolled
  `<button>` toggle (`rounded-full border px-3 py-1 text-xs`) is below
  the 44pt iOS touch target on a frequently-tapped surface. Could be
  `SFButton variant="ghost" size="sm"` (h-[34px], still below 44 but at
  least consistent with the rest of the SF system). **MEDIUM**.

### 4. Live game (BOTH sports, five sub-states)

#### 4a. Pre-kickoff

- **AFL** (`live/LineupPicker.tsx:915-968`) — sticky bar uses the
  canonical pattern with a minor padding tweak (`pt-2.5 sm:pt-3` vs the
  reference `pt-3 sm:pt-4`). Inner CTAs are SFButton (ghost + accent).
  Two-row stack (Save plan & exit + Ready for Q1) is the documented
  affordance — good. **LOW** (just the padding tweak).
- **Netball** (`netball/LineupPicker.tsx:534-545`) — sticky bar uses the
  canonical pattern correctly, BUT the inner CTA is a hand-rolled
  `<button className="… bg-brand-600 py-3 …">` (line 540), not
  `<SFButton variant="accent" size="lg" full>`. The hover/disabled
  states diverge from SFButton. **HIGH**.
- **Netball sport parity gap** — no "Save plan & exit" affordance.
  AFL's pre-game offers stashing a draft and leaving; netball jumps
  straight from "Suggested rotation / Set manually" toggle to "Confirm
  lineup". Coaches who want to set up the day before can't on netball.
  **HIGH**.
- **AFL pre-kickoff `page.tsx`** (`live/page.tsx:518-521`) — correctly
  renders `LiveTopBar` since AFL's pre-kickoff path doesn't go through
  `<LiveGame>`. Good.
- Netball pre-kickoff goes through `NetballLiveGame` (which mounts
  `LiveTopBar` internally), so the bar is present.

#### 4b. Live play (mid-quarter)

- **AFL scorebug sticky bar** (`live/LiveGame.tsx:2207-2245`) — uses
  `pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]` which is
  intentionally tighter than the CTA-bar reference pattern (it hosts the
  full GameHeader, not a single button). The undo toast inside uses
  `bg-ink text-warm` and a hand-rolled "Undo" button — bespoke but the
  pattern is duplicated cleanly between AFL and netball.
- **Netball scorebug sticky bar** (`netball/NetballLiveGame.tsx:1683-1726`)
  — mirror of the AFL pattern. **LOW**.
- `LateArrivalMenu` and `ResetGameButton` row mismatch — covered in
  Executive summary #7. The "Match button heights" commit `261c281`
  didn't actually match heights (different libraries, different size
  scales). Both sports affected. **HIGH**.
- `src/components/live/LateArrivalMenu.tsx:5, 30` — uses legacy
  `<Button size="md" variant="secondary">` in a row right next to
  `<SFButton variant="danger" size="md">`. **HIGH**.
- `src/components/netball/NetballLiveGame.tsx:1577-1581` — copy on
  live-play uses raw `text-neutral-500`. **LOW**.

#### 4c. Quarter break

- **AFL `QuarterBreak.tsx`** (`live/QuarterBreak.tsx:5, 7, 1531-1538,
  1592-1606`) — imports both `Button` (line 5) and `Guernsey` (line 7
  from `sf`). The sticky "Ready for Q{n}" CTA at line 1531 is legacy
  `<Button loading={isPending} className="w-full" size="lg">` — same
  brand-600 colour as the SFButton accent variant in LineupPicker, but
  different render path AND different height (Button `lg` =
  `px-5 py-2.5 text-base` ≈ 42px, SFButton `lg` = `h-[52px]`). Coaches
  see the primary "Ready" CTA visually change height as they move
  from pre-game (SFButton lg, 52px) to Q-break (Button lg, ~42px) and
  back. The Q-break delete-score confirm modal at line 1592-1610 also
  uses legacy `<Button variant="danger">` and `<Button variant="secondary">`.
  **HIGH**.
- **Netball `NetballQuarterBreak.tsx`** (`netball/NetballQuarterBreak.tsx:24,
  1355-1362`) — mirror of the AFL Q-break pattern. Same legacy-Button
  CTA inside the canonical sticky bar. **HIGH**.
- Both Q-break components use the canonical sticky-bar shell — that
  part is right.

#### 4d. Full-time review

- **AFL `FullTimeReview.tsx`** (`live/FullTimeReview.tsx:23, 413, 420,
  443, 489, 500`) — legacy `<Button>` everywhere (Finalise game, Add
  score, Cancel, the per-quarter delete confirm). No SFButton. **MEDIUM**.
- **Netball `NetballFullTimeReview.tsx`** (`netball/NetballFullTimeReview.tsx:13,
  132-139`) — only one button (Finalise game), legacy `<Button>`. The
  Add-score / Fix-scores delegation goes through `ScoreReviewPanel`. Same
  library issue as AFL. **MEDIUM**.
- **Sport-parity divergence — Fix-scores implementation** —
  `live/FullTimeReview.tsx:278-433` owns its OWN inline per-quarter
  score list + add-score form (~150 lines) duplicating the
  `ScoreReviewPanel` component. `NetballFullTimeReview.tsx:113-122`
  just renders `<ScoreReviewPanel>`. So the same screen — "review and
  fix scores before finalising" — is implemented two different ways in
  the two sports. **MEDIUM** (functional duplication, not user-facing
  drift per se).
- Both FT review surfaces correctly omit a sticky-bottom CTA — that's
  documented intent at `live/page.tsx:364-366` (FT review is the score
  reconciliation screen and shouldn't compete with itself).

#### 4e. Finalised (post-finalise summary)

- **AFL `LiveGame.tsx:2194-2205`** — sticky "Finish game" CTA. Inside the
  canonical sticky-bar shell, but the button itself is a hand-rolled
  `<Link href="/dashboard" className="inline-flex w-full … bg-brand-600
  px-5 py-3 …">`. Should be `<SFButton href="/dashboard" variant="accent"
  size="lg" full iconAfter={…}>`. **HIGH**.
- **Netball `NetballLiveGame.tsx:1179-1188`** — exact copy of the AFL
  hand-rolled `<Link>`. Same fix. **HIGH**.
- `GameSummaryCard.tsx` (AFL, 304 lines) vs `NetballGameSummaryCard.tsx`
  (242 lines) — divergent component shape. Out of scope to check
  copy-text parity without rendering both, but worth a follow-up walk.
  **LOW**.

### 5. Stats — `/teams/[teamId]/stats`

- No findings on the page itself — it delegates entirely to
  `DashboardShell` (AFL) or `NetballDashboardShell` (netball) and both
  shells render their own visual systems. Component-level audit of the
  dashboard shells is out of scope unless you want it.

### 6. Settings — `/teams/[teamId]/settings`

- Card padding drift (Executive summary #9). All six settings cards use
  the same `rounded-lg border border-hairline bg-surface … shadow-card`
  shell but with FOUR different paddings. **MEDIUM**.
- Every settings form uses legacy `<Button>` exclusively (TeamName,
  TeamMembers, TeamSong, CohortChips, QuarterLength, TrackScoring).
  Settings is a "library-pure legacy zone" — internally consistent but
  globally drifted. If the migration target is SFButton, this is the
  next biggest patch after the live surfaces. **MEDIUM**.

### 7. Token-share runner route — `/run/[token]/*`

- **Two stacked sticky top headers** (Executive summary #5) —
  `run/[token]/layout.tsx:8-34` sticky-top wordmark + `LiveTopBar`
  sticky-top inside the live game. **HIGH**.
- `run/[token]/page.tsx:340-347` — "Continue to starting lineup" is a
  hand-rolled `<Link className="… bg-brand-600 px-4 py-2 text-sm …">`.
  Should be `<SFButton href="…/lineup" variant="accent">`. **HIGH** for
  the AFL runner-token pre-kickoff flow (this is THE primary CTA on
  that screen).

---

## Cross-cutting

### Button libraries

- Legacy `<Button>` is used in 38 files; `SFButton` in 21. Five files
  import both. Three regions are clearly mid-migration: game-detail
  destructive actions (trigger SFButton, confirm legacy), live-game
  sub-states (SFButton on game-detail; legacy mostly inside the live
  flow), and settings (entirely legacy).
- The two libraries have different size scales: legacy `Button md` =
  `px-4 py-2 text-sm` (~36-38px tall); SFButton `md` = `h-11`
  (44px). Mixing them in a single row produces visible step-height
  mismatches — that's exactly the bug commit `261c281` tried to fix
  by bumping LateArrivalMenu's `size` (it didn't, because the
  underlying library is still legacy).

### Sticky-bottom bar pattern

Reference: `fixed inset-x-0 bottom-0 z-30 border-t border-hairline
bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]
shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4`.

Inventory + status:

| Surface | File:line | Matches reference? |
| --- | --- | --- |
| AFL pre-game CTA | `live/LineupPicker.tsx:915` | almost (`pt-2.5/sm:pt-3` instead of `pt-3/sm:pt-4`) |
| Netball pre-game CTA | `netball/LineupPicker.tsx:534` | yes |
| AFL Q-break CTA | `live/QuarterBreak.tsx:1529` | yes |
| Netball Q-break CTA | `netball/NetballQuarterBreak.tsx:1353` | yes |
| AFL finalised "Finish game" | `live/LiveGame.tsx:2195` | yes |
| Netball finalised "Finish game" | `netball/NetballLiveGame.tsx:1179` | yes |
| AFL scorebug | `live/LiveGame.tsx:2208` | intentional tight variant (`pt-1`) — hosts a header, not a CTA |
| Netball scorebug | `netball/NetballLiveGame.tsx:1683` | matches AFL scorebug |

Shell pattern is well-adopted. The problem isn't the bar — it's the
button INSIDE the bar (covered in items 1-4 above).

Page-level `stickyPb` clearance audit (`live/page.tsx`):
- live play uses `pb-[calc(9rem+env(safe-area-inset-bottom))]` — covers
  scorebug ~95-130px + undo strip + bar padding. OK.
- everything else uses `pb-[calc(6rem+env(safe-area-inset-bottom))]` —
  covers the ~80-90px Ready/Finish-game bars. OK.

### `LiveTopBar` adoption

- ✅ AFL live play / Q-break / FT / finalised — via `LiveGame.liveTopBar`
  hoisted const.
- ✅ AFL pre-kickoff — `live/page.tsx:518` renders the bar directly
  (path doesn't go through `<LiveGame>`).
- ✅ Netball every state — via `NetballLiveGame.topUtilityRow` const.
- ✅ `AppHeaderShell` hides the `(app)` outer header on `/live*`
  (`AppHeaderShell.tsx:24`).
- ❌ `/run/[token]/*` — the run-route layout doesn't suppress its own
  wordmark header when LiveTopBar takes over. **HIGH** (Executive
  summary #5).

### Modal / dialog patterns

- Backdrop opacity split: `bg-ink/40` for confirm-style dialogs
  (FullTimeReview delete, QuarterBreak delete, SwapConfirmDialog, the
  Modal primitive); `bg-ink/60` for full-attention sheets
  (SlotFillSheet, LockModal, InjuryReplacementModal, WalkthroughModal,
  NetballPlayerActions, PickReplacementSheet). Defensible split — the
  /60 surfaces are the ones that demand the user resolve them before
  proceeding. **No finding**.
- Backdrop tap-to-close behaviour is inconsistent: `Modal.tsx` has no
  onClick handler on its backdrop; the hand-rolled confirms in
  FullTimeReview / QuarterBreak / LiveGame all wire `onClick={onCancel}`
  to their backdrop. If you tap outside a ResetGameButton confirm you
  stay locked in; if you tap outside a delete-score confirm you cancel.
  **MEDIUM**.
- `Modal` is only used in 1 place (ResetGameButton). Most modal-shaped
  things are hand-rolled. **MEDIUM** (the primitive isn't earning its
  weight — either retire it or push everyone onto it).

### Loading states

- `<Spinner>` (which is a `PulseDot` redirect — `Spinner.tsx:17-19`) is
  used for Suspense fallbacks; `<PulseDot>` directly is used in
  per-action contexts (Button loading, in-row pending). Under the hood
  everything is the brand pulse — visually consistent. **No finding**.
- `(app)/loading.tsx` uses PulseDot at lg size for full-route
  transitions. Good.

### Error displays

Three distinct patterns surfacing in the same audit scope:
1. Canonical inline danger: `rounded-md bg-danger/10 px-3 py-2 text-sm
   text-danger` (QuarterBreak, NetballLineupPicker, TeamSongSettings,
   NetballQuarterBreak — 5+ instances).
2. Warn-soft banner: `rounded-md border border-warn/30 bg-warn-soft
   px-3 py-2 text-xs text-warn` (OfflineBanner, ShareRunnerLink,
   `(app)/teams/[teamId]/games/[gameId]/live/page.tsx:61`, AddPlayerForm
   when squad full).
3. Bare red text: `text-sm text-danger` (FullTimeReview server errors,
   AddPlayerForm server errors, LineupPicker server errors).
4. Plus the small-inset/wrong-tone outlier at `LiveGame.tsx:1444`:
   `rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn` — `rounded-sm`
   instead of `rounded-md` AND `warn` instead of `danger` for what's
   semantically an error.

Two patterns (banner-warn = soft warning; banner-danger = error) are
defensible, but the "bare red text" should be promoted to
banner-danger, and the LiveGame outlier should be banner-danger not
warn-tinted. **MEDIUM**.

### Empty-state patterns

- AFL pre-kickoff no-availability:
  `(app)/teams/[teamId]/games/[gameId]/live/page.tsx:522-525` uses
  `rounded-lg border border-dashed border-hairline bg-surface-alt px-4
  py-6 text-center text-sm text-ink-mute`.
- AddPlayerForm squad-full: dashed warn-soft (line 92).
- The dashboard EmptyHero / no-teams card uses `<SFCard className="text-center">`.

Three empty-state visual treatments. Probably fine — they sit in
different surfaces — but worth knowing about. **LOW**.

### Hand-rolled buttons in places that should use SFButton

- `LiveGame.tsx:2199` (Finish game) and `NetballLiveGame.tsx:1183`
  (Finish game) — `<Link className="… bg-brand-600 px-5 py-3 …">`.
  Should be `<SFButton href variant="accent" size="lg" full>`. **HIGH**.
- `netball/LineupPicker.tsx:536-544` (Confirm lineup) — `<button
  className="… bg-brand-600 py-3 …">`. Should be
  `<SFButton variant="accent" size="lg" full>`. **HIGH**.
- `run/[token]/page.tsx:341-346` (Continue to starting lineup) — same
  pattern. Should be SFButton href accent. **HIGH**.

### Touch targets

- `AvailabilityRow.tsx:97-107` — the "Mark available / unavailable"
  pill is `px-3 py-1 text-xs` ≈ 26-28px tall. Below 44pt iOS minimum
  on a parent-facing surface. **MEDIUM**.
- `LineupPicker.tsx:914-955` "Save plan & exit" SFButton ghost sm —
  `h-[34px]`. Below 44pt but consistent with the SFButton small scale
  used throughout. Less concerning than the hand-rolled pill above.
  **LOW**.

### Hover-without-active

- The `bg-warn/15` and `bg-danger/10` hover-only chips
  (`GameHeader.tsx:223`, `NetballLiveGame.tsx:1910`, `FillInRow.tsx:56`,
  the per-quarter delete `×` buttons) don't have an `active:` state.
  On mobile that means a tap shows no visual confirmation between
  down + commit. **LOW** (acceptable for icon-only "deletes" guarded
  by a confirm dialog).

### Raw-Tailwind-colour leak (netball-only)

- `netball/LineupPicker.tsx` BenchStrip (lines 612-639): `border-neutral-200
  bg-white text-neutral-700 text-neutral-500 text-neutral-800
  border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-400`.
- `netball/PositionToken.tsx` (lines 142-151): `bg-white border-neutral-300
  bg-neutral-100 border-sky-700 ring-amber-300/70 hover:bg-amber-50`.
- `netball/NetballBenchStrip.tsx:126`: `border-hairline bg-white`.

AFL components avoid this entirely — they use `text-ink`, `text-ink-mute`,
`text-ink-dim`, `bg-surface`, `bg-surface-alt`, `border-hairline`,
`bg-warn-soft`, `bg-brand-600`, `text-brand-700`. The netball branch
either predates the token sweep or wasn't refactored. **HIGH** for the
LineupPicker BenchStrip (highly visible pre-game surface);
**MEDIUM** elsewhere.

### Back / exit affordances

- `LiveTopBar` "✕ Exit" — consistent across all `/live*` states.
- AFL game-detail page back: chevron-left "Games" link at
  `games/[gameId]/page.tsx:141-147` (text + SFIcon).
- Netball pre-game LineupPicker breadcrumb at
  `netball/LineupPicker.tsx:398-413` — inline SVG chevron + "Back to
  availability". Different SVG implementation from SFIcon, different
  hover treatment.
- `/run/[token]/layout.tsx:10-32` — chevron + SirenWordmark as the
  global back affordance, AND this is rendered alongside LiveTopBar's
  "✕ Exit" once the live game mounts. Two competing back affordances.
  **MEDIUM** (related to Executive summary #5).

---

## What looked good (don't regress)

- **Game-detail page** — exemplary. SFCard + SFButton triplet (primary
  hero / ghost neutrals / danger destructives) reads cleanly,
  `canManageMatch` gates are clear, sport-aware Goal-kickers vs
  Goal-shooters block uses the same SFCard with consistent typography.
- **Dashboard / team home heroes** — LiveHero (alarm), NextUpHero
  (gradient brand), EmptyHero (SFCard centred). Three states, all
  SFCard, all SFButton. The single-team auto-redirect removes a wasted
  tap.
- **`LiveTopBar` extraction** — six surfaces (AFL pre-kickoff page,
  AFL LiveGame, NetballLiveGame, AFL Q-break, AFL FT, AFL finalised)
  all share one component. The polymorphic onHelp prop (function →
  walkthrough modal, undefined → /help link) is exactly the right
  affordance for a shared bar where some hosts have walkthrough state
  and some don't.
- **Sticky-bottom shell pattern** — 6 of 7 CTA bars match the
  reference; the scorebug bars deliberately diverge. The
  `pb-[calc(9rem|6rem+env(safe-area-inset-bottom))]` clearance is
  encoded once on the page and refreshes per state. Safe-area-aware
  everywhere.
- **`AppHeaderShell` chrome swap** — pathname-based hiding of the
  `(app)` header on `/live*` while keeping the layout server-rendered
  is the lightest possible solution.
- **`Stats requires game_finalised event`** — the belt-and-braces
  filter at `stats/page.tsx:117-127` is exactly the kind of
  defensiveness this codebase rewards.
- **Loading vocabulary** — every "something's happening" surface
  resolves to PulseDot under the hood (Spinner shim, SFButton loading,
  legacy Button loading, app loading.tsx, in-row PulseDot). Brand
  consistency without per-call-site work.
- **Backdrop opacity split** — `bg-ink/40` vs `bg-ink/60` is
  intentional (confirm dialog vs full-attention sheet). Don't collapse
  it.
- **Late-arrival + Restart row** — putting the two related housekeeping
  affordances in one row is the right call. The button-library
  mismatch above is the implementation flaw, not the layout decision.
- **Walkthrough modal "?" affordance** — the right-hand `?` in
  LiveTopBar links to /help when no walkthrough state is available and
  opens the modal when it is. Same visual, same position, smart
  fallback.
