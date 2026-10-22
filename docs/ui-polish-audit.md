# In-game UI polish audit — Phase 0

Steve (16 Oct 2026): *"I think our UX is pretty good now but I really
want to sharpen the UI design, the in game UI needs some polish, it's
good but not quite there. I want it to look beautiful."*

**Scope.** The AFL and netball live-game screens — the surfaces a coach
holds for two hours on a Saturday. Walked end-to-end on a local build at
390 px and 1024 px, signed in as a coach, through: pre-start → Start Q1
→ record a goal → apply a suggested sub → End Q1 → quarter break →
Start Q2 (both sports; netball scoring via its GS/GA picker).

**Posture.** Refinement, not reinvention. The brand language — charcoal
ink + warm paper, the FWD/CEN/BCK zone triad, rounded cards, mono
micro-labels — is strong and stays. Every proposal below is a tuning of
what exists.

**Repo-state notes** (differences from the task brief, none blocking):
- Netball lives in `src/components/netball/`, not `src/components/live/netball/`.
- There is no separate `Scoreboard.tsx`/`GameClock.tsx` — both merged
  into `GameHeader.tsx` long ago. `QuarterEndModal.tsx` exists but the
  end-quarter flow walked here runs through the clock menu
  (`LiveGameSettingsButton`'s ActionSheet) + `ManualEndQuarterConfirm`.
- The sub-due *modal* became `SubDueBanner` (under the top bar) on
  16 Oct; the banner is what ships.

**The one-line verdict.** The bones are genuinely good — the dock's
field-dimming focus state, the score count-up, the swap-card dark
anchor are already premium moments. What keeps it from "beautiful" is
noise discipline: the loudest pixels on screen are rarely the most
important ones (saturated per-tile bars, truncated names in the
scorebug, a legend repeating what three other things already say), and
a handful of moments jump when they should glide.

Priorities: **P0** any user notices · **P1** a designer notices ·
**P2** polish.

---

## 1. GameHeader — the scorebug (`live/GameHeader.tsx`)

**Current.** Broadcast-style: 10 px mono uppercase team name, 36 px
points total with small G·B beside it, dark clock pill centre, +G/+B
chips under each side.

**The issue — P0.** The coach's own team name truncates mid-word at
390 px: `BRUNSWICK MAGPI…`. It's the first line of the most-watched
component and it reads as broken, every game, for any club with a
two-word name. (The opponent side truncates too when long.)

**Refinement.** Fit, don't clip. At ≤ 400 px: drop the grid's centre
column reservation from `auto` to a fixed clock width, let names take
the slack, and step the name down one size (10 px → 9 px,
`tracking-micro` → `tracking-normal`) *before* ellipsising; allow two
lines as the last resort (the row is `items-start` already — a second
line costs nothing). Same tokens, no new styles — just a fit strategy.

## 2. PlayerTile (`live/PlayerTile.tsx`)

**Current.** Zone label (9 px mono, zone colour) / name (14 px bold) /
`#4 · 1:20` (10 px mono) / full-width 6 px stacked zone-time bar.

**The issue — P1.** The bar is the loudest element on the field. At
full saturation (`bg-zone-f` etc.), 6 px tall, on all 12+ tiles, the
screen reads as a bar chart first and a team second — and early in a
quarter every bar is a solid single-colour block (100 % of 40 seconds),
which is maximum ink for minimum information.

**Refinement.** Demote the bar to ambient: 3–4 px tall, 60–70 %
opacity (or the existing `/70` tints), on a visible `bg-surface-alt`
track. The zone *label* stays the saturated zone signal. Full
saturation returns in one place only — the quarter-break tiles, where
time-balance is the decision being made. CSS-only.

## 3. SwapCard — the dark suggestion anchor (`live/SwapCard.tsx`)

**Current.** Collapsed: timer ring + "SUGGESTED — 2 SWAPS" + names.
Expanded: hint line, numbered pair rows with dashed-underline editable
chips, per-row "Make swap", full-width "Make all N swaps".

**The issue — P1.** The countdown is the card's whole reason to exist
and it's the least legible thing on it: ~10 px digits inside a 28 px
ring whose progress arc is nearly invisible against the dark surface.
A coach glancing mid-play can read "SUGGESTED" easily but not *when*.

**Refinement.** Double the countdown's presence: 32–36 px ring, 2 px
arc in `warn` (amber) over a `white/15` track, digits at 12–13 px
semibold. Everything else on the card is already right — the expanded
state is the best-polished piece of in-game UI after the July rework.

## 4. Field (`live/Field.tsx`)

**Current.** Deep-green oval, white-on-green vertical FORWARD / CENTRE
/ BACK rails both sides, hairline zone dividers, 2-col tile grid.

**The issue — P1.** The oval's edge: the warm page background shows
around the oval's rounded corners and meets a pinkish boundary tint,
so the field's silhouette reads slightly fuzzy/artifacted rather than
drawn — compare the netball court, whose rectangle sits crisply in a
card. The grass is the hero surface; its outline should feel
inevitable.

**Refinement.** Give the oval a deliberate boundary: a 1.5–2 px
line in `white/25` just inside the edge (real fields have painted
boundaries) and let the outer edge meet the page in plain `warm` with
no tinted rim. One border token.

## 5. ScoreRecordingDock (`live/ScoreRecordingDock.tsx`)

**Current.** Bottom dock: "Record score for **#4 Ava Okafor**" +
CANCEL, big + GOAL (green) / + BEHIND (amber), then "Swap player" and
"Player actions" stacked grey. The field dims behind it — the best
visual-weight moment in the app.

**The issue — P2.** "Player actions" is a label about the system, not
the game: it sits at identical weight to "Swap player" and gives no
scent of what's inside (injury, lend, lock). It's the only vague words
on an otherwise perfectly-voiced surface.

**Refinement.** Name the contents: "Injury / lend / lock…" as the
label, or keep "More" with a trailing glyph and let the long-press
sheet title carry it. Copy-only change.

## 6. Clock menu + end-quarter confirm (`LiveGameSettingsButton` sheet, `ManualEndQuarterConfirm`)

**Current.** Clock pill → ActionSheet: "Pause clock — for a stoppage,
like an injury." / "**End Q1 now**" in danger-red with helper line →
confirm dialog with a *green primary* "End Q1" (changed from red in
July: ending a quarter is routine).

**The issue — P1.** The flow disagrees with itself: the sheet paints
"End Q1 now" as destructive-red, then the confirm paints the same
action as safe-green. One action, two emotional registers, two taps
apart.

**Refinement.** Align on the July decision: the sheet row drops to
default ink (the helper line already carries the caution); red stays
reserved for genuinely destructive rows (Restart game). One class.

## 7. Swap commit toast (`LiveGame` swap toast)

**Current.** "✓ Nora → Hugo" slides in *above* the swap card, in flow,
for 2.5 s, then unmounts.

**The issue — P1.** It displaces the entire field twice: everything
below jumps ~44 px down on mount and snaps back on dismissal — mid-game,
right when the coach's eye is on the two tiles that just changed. The
confirmation costs more attention than it earns.

**Refinement.** Overlay, don't insert: absolutely position the toast
inside the sticky top-bar container (under the bar, over the content)
so layout never moves. Same component, same animation, new position
context — and it matches how SubDueBanner already lives in the sticky
chrome.

## 8. Netball Court (`netball/Court.tsx`)

**Current.** Pale sky palette: `sky-100/40` goal-circle fills,
`sky-700/60` lines, white tokens on a near-white court, third labels
top-right per band.

**The issue — P1.** Side by side with AFL, netball looks like the
B-side: the court is a wash of low-contrast pastels where AFL's field
is a confident saturated surface. Same coach, two sports, two moods —
and the washed one also costs legibility (white tokens on near-white
court, 60 %-alpha lines).

**Refinement.** Give the court the field's conviction without changing
hue: solid mid-sky court surface (≈ `sky-200`/`sky-300` band fills),
lines at full `sky-700`, and the same white-token-on-colour contrast
AFL enjoys. Keep netball blue — just let it commit.

## 9. Netball PositionToken (`netball/PositionToken.tsx`)

**Current.** White card token: bib label (GS/GA…), name, then a
cramped `0:21` + ~40 px mini time-bar cluster bottom-left.

**The issue — P1.** The time bar is too small to read as a bar — at
40 px wide it's a coloured dash whose proportions are illegible, and it
sits in a different position (bottom-left, beside the time) than AFL's
tile bar (full-width, below everything). Same data, two grammars.

**Refinement.** Adopt the AFL tile's bar grammar: full-token-width,
3–4 px, below the time row (and inherit the demotion from §2). The two
sports' player units then read as one component family, which is the
whole cross-sport covenant.

## 10. NetballScoreBug (`netball/NetballScoreBug.tsx`)

**Current.** Mirrors GameHeader's grid but each side carries a single
`+G` chip and the clock pill shows `Q1` with no running/paused glyph.

**The issue — P1.** With one chip per side, the chips sit pinned at
the extreme screen edges with a gulf of empty surface between chip,
score and clock — the composition reads unbalanced (AFL's two-chip
pairs fill the same slots). And the missing ⏸/▶ glyph hides clock
state netball coaches still need.

**Refinement.** Pull each side's chip inboard to align with the score
numeral's edge (justify the whole side column as one block), and add
the same state glyph AFL's pill shows. Grid template tweak + one span.

## 11. Netball goal picker (Record goal sheet)

**Current.** Plain ActionSheet rows: "Daisy Patel (GS)" / "Frankie Lee
(GA)" / Cancel, with helper copy "Only GS and GA can score a netball
goal."

**The issue — P1.** AFL's who-scored picker got rich rows (guernsey
circle, position caption, highlighted no-scorer escape); netball's is
two bare text lines. The *moment* — a goal — is identical, the
celebration grammar isn't.

**Refinement.** Reuse the AFL picker's row anatomy: bib-label circle
(GS/GA in zone colour) + name + position caption. Same sheet, dressed
rows.

## 12. Desktop width (both sports, `md:`+)

**Current.** The phone layout scales up unclamped: at 1024 px AFL
tiles stretch to ~430 px wide (14 px name floating in a white slab),
and the netball court — aspect 3:5 at `max-w-4xl` — becomes ~1500 px
tall with tokens metres apart.

**The issue — P1.** Desktop is a secondary surface (game day is a
phone in the rain) but it's the surface Steve demos from, and right now
it looks like a phone app on a projector.

**Refinement.** Clamp the play surfaces: field/court `md:max-w-md`
centred (they are phone-shaped objects; let them stay phone-sized with
the page breathing around them), or 3-col tiles at `md:` for AFL.
CSS-only, no behavioural change.

## 13. Zone legend row (both live screens)

**Current.** `■ FWD ■ CENTRE ■ BACK` swatch row floating between the
swap card and the field.

**The issue — P2.** Zone identity is already encoded three other ways
on the same screen (tile labels in zone colour, field side rails, bar
segments). The legend is a fourth telling, unanchored to any card, and
it pushes the field down on every live screen.

**Refinement.** Remove it from the *live* screens (keep it on
quarter-break and picker screens where bars are the decision aid). If
removal feels bold, fold it into the Game-settings collapse header.

## 14. Warning strip truncation (pre-start + breaks)

**Current.** Playbook rule warnings render one line with mid-sentence
ellipsis as their resting state: "⚠ Theo Russo is 2 quarters short
at… **+1** ▾".

**The issue — P2** (P1 if rules ship widely). A sentence cut mid-word
is the card's *default* presentation; the tap-to-expand affordance is a
7 px caret. It reads as a rendering accident, not a summary.

**Refinement.** Summarise instead of truncating: "2 rule warnings ▾"
when collapsed (count, not clipped prose), full sentences when
expanded. The copy exists; this is a different collapsed state, not
new data.

## 15. Start-flow vocabulary (`StartQuarterModal`)

**Current.** Button "Start Q1" → modal titled "Start Q1" whose primary
is "Start clock", helper "Tap Start clock when the siren goes."

**The issue — P2.** The action renames itself between tap one and tap
two. Tiny, but vocabulary consistency is how the interface teaches.

**Refinement.** The modal primary becomes "Start Q1" and the helper
keeps the clock nuance: "Tap when the siren goes — the clock starts
then." (The netball variant says "when the umpire calls play" — keep
the per-sport wording, align the verb.)

---

## What I did *not* flag

The dock's dim-the-field focus state, the score count-up + halo, the
OFF-NEXT tile headers, the undo strip's ink flash, the quarter-break
caption system (BENCH → FWD), and the expanded swap card are already
at the quality bar — Phase 2 should not touch them except where §2's
bar demotion passes through.

## Suggested Phase 2 order (on approval)

1. §1 scorebug name fit (P0)
2. §2 + §9 bar demotion, one grammar (P1, biggest visual quieting)
3. §7 toast overlay + §6 red/green alignment (P1 moments)
4. §8 court conviction + §10 scorebug balance + §11 picker rows (netball parity set)
5. §3 countdown, §4 boundary, §12 desktop clamp
6. §13–§15 (P2 sweep)

Each as its own commit on `feat/in-game-ui-polish`, verified at
375/390/768/1024/1440. Phase 1 mockups first for §1, §2/§9, §8 — the
three where "see it" beats "read it".

---

# Round 2 — cross-sport consistency (Phase 0, 23 Oct 2026)

Steve approved restarting the polish audit with the two leftovers from
the basketball session as the starting scope, plus a light sweep for
other places a shared concept renders differently across sports.

Walked on a local production build of `main` at `46ab64a3` (the commit
production runs), 375 px, seeded sub-due and half-time states for AFL,
rugby league, basketball and soccer. Nothing is changed by this
section; it stops for Steve's direction.

**What moved since this was queued.** The break redesign (#163,
22 Oct, another session) replaced every sport's break with one shared
`quarter-break/PeriodBreak.tsx` (`LeagueBreak`, `BasketballBreak`,
`SoccerBreak` and `TouchBreak` adapt onto it). So the first item has
changed shape; see R1.

## R1. Rugby's break: the "Vests" block (`league/LeagueBreak.tsx`)

**Today.** The "Half 1 done" card is gone. Rugby's break is the shared
one: "2nd half lineup" header, score and availability chips, Suggested /
Rotate / Repeat / Manual, the rule check, zone sections, bench, Start
bar. One thing is still rugby's own: under the bench, a large sage
"VESTS" card that lists every player twice (First Receiver, then Dummy
Half), 11 rows each, in an older chip style with jersey glyphs.

**The issue that matters.** It's the only part of any break that isn't
in the shared design language, and it doubles the screen's height
(the vest lists run about 800 px past the bench at 375 px). The names
truncate ("Camille Du…", "Brendan C…") where every other break tile
shows them whole. A coach scrolls past 22 near-identical buttons to
reach nothing; the lineup above is what they came for.

**Why it diverged.** Vests are league-only (U6–U11 FR/DH rotation, 
NRL Junior League Laws), so #163 kept the existing vest picker rather
than fold it into the shared break config. It wasn't redesigned, just
carried across.

**Proposed refinement.** Make the vest a status chip in the break's
top row, beside score and availability, the same pattern #163 used for
game settings: "FR Kira · DH Maya ›". Tapping opens a bottom sheet with
the two pickers, in the shared `BreakPlayerTile` style, full names.
The plan's suggested vest wearers stay pre-filled, so most breaks need
no tap. **Priority: P1.**

## R2. Sub due outside AFL: two voices (`live/NextSubCard.tsx` + `SubDueBanner`)

**Today.** In AFL the swap card *is* the sub-due alert (17 Oct,
`9f7732ef`, "one event, one voice"): it turns amber with "Sub due —
Rotate a player off", carries `role="alert"`, and the top-bar banner
only shows when a sub is due with nothing to suggest. Basketball,
rugby (league and union), soccer and touch use `NextSubCard`, a fork of
AFL's card, and show **both**: the "Sub due — rotate a player off ·
Got it" banner under the top bar *and* the card's own "SUB DUE — N
SWAPS". Two announcements of one event, the banner pushing the court
down by a row.

**The issue that matters.** The doubled alert, plus the two can
disagree: "Got it" on the banner silences the beep but leaves the card
shouting, and the card isn't the screen-reader alert, so assistive
tech hears the banner but not the swaps.

**Why it diverged.** `NextSubCard` was extracted from league's card on
16 Oct for soccer ("reuse before you fork"), *before* the re-skin
rebuilt `SwapCard` as the alert. The re-skin changed AFL's card and
AFL's `LiveGame` only; the fork never got the change, and every sport
added since (touch, basketball, futsal, hockey) inherited the fork.

**Proposed refinement.** Bring `NextSubCard` to `SwapCard`'s due
behaviour: the card is the alert (amber ring, "Sub due — N swaps",
"Rotate a player off", `role="alert"`, the beep), and each sport shows
the banner only when a sub is due with no pairs to suggest, exactly as
AFL. Longer term, extract the due state into one shared piece so the
two cards can't drift again (CLAUDE.md: extract when the seam can be
re-violated; this one has been). Covers basketball, league, union,
soccer, futsal, hockey and touch in one change. **Priority: P0**
(it's the most visible inconsistency on the live screen, in 7 sports).

## R3. Sweep: other cross-sport differences (for the follow-up queue)

Noted, not investigated deeply:

| Concept | Where it differs | Note |
|---|---|---|
| Player tile on the field | Rugby (league, union) | Pill tokens on the pitch ("Alicia B · #1 · 1:44", no zone bar) where AFL, basketball, soccer and touch use the 68 px card tile. Biggest visual gap left on a live screen. |
| Scorebug chrome | Rugby (`LeagueScoreBug`) | Its own clock pill ("HALF 1 · OVER", "OF 2 HALVES" under it), tries/conversions inline beside the total, and the old one-line truncating team name (the 21 Oct wrap fix is in AFL, netball, basketball, soccer, touch, not rugby). |
| Sub card line labels | Basketball | The pair rows label the line "G" / "F" where the other sports show DEF / MID / ATT, FWD, etc.; reads as a missing word on a 375 px card. |
| Sub-due helper text | Basketball | "Send them to the table now, and tap them on when the whistle goes." sits below the card as loose text; no other sport has it. Fold into the card's due sub-line. |
| Score chips | Rugby | +T / +C sit under each total in two columns; AFL, basketball and soccer moved to one row. Check at 375 with union's four chips. |
| Break tile notes | Basketball | Fouls show as a text note ("3F") on the break tile, not the coloured foul chip the live tile uses. |

## R4. Two queued cleanup items: status

Both were reported on 21 Oct. Both fixes shipped in `c3f6392a` and
survived the #163 rewrite of `BasketballLiveGame`. Checked on the
production commit (`46ab64a3`) with their regression specs, 7 of 7
passing; I can't sign in to production itself, so this is the
production build run locally, not a hand test on prod.

- **Basketball scroll gap: fixed.** The cause was a stale `pb-[7rem]`
  under the live view, on top of the score bar's own spacer (128 px of
  dead scroll). Removed in basketball and rugby;
  `e2e/tests/live-scroll-gap.spec.ts` pins both. It wasn't the hint
  overlap (that was the score-chip bug, fixed separately on 22 Oct).
- **Basketball suggester "dying" after one sub: fixed.** It wasn't the
  "Home line drops the second ticked line" item from the roles audit.
  Steve's bench kids played Guards only, and the guards who had just
  come on had played less than them, so no sub evened time and the card
  went blank for about 80 seconds. The card now shows the subs due at
  the next sub time; `e2e/tests/basketball-live-fixes.spec.ts` replays
  his game. (The "Home line" item was resolved by the positive-roles
  storage: ticking both lines now stores no restriction.)

## Round 2: suggested order (on approval)

1. R2: one sub-due voice in every sport (P0, one shared change).
2. R1: rugby's vests as a break chip and sheet (P1).
3. From the sweep: rugby's field tiles and scorebug onto the shared
   pieces (the largest remaining gap), then the small basketball items.

Mockups first for R1 (the sheet) and the rugby tile change; R2 matches
an existing design (AFL's card) and needs none.
