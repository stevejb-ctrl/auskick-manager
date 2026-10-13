# Stagehand usability run, 13 Oct 2026

Six AI-driven missions against the local dev server (`feat/ux-plan-2026-10`,
local Supabase): three first-time setups (AFL U15 set positions, netball 11U
rotation, league U11 named positions) and three Saturday game days (AFL U12
preferred lines, AFL U15 set positions, netball 11U). Agent: Claude Haiku 5.5
in Stagehand's hybrid mode, phone viewport. Reports are in
`e2e/explore/reports/` (not committed).

No mission finished: the agents lost many steps to input lag on the dev
server. Each finding below was checked against the code or in the browser
before it went on this list. Agent noise is listed separately at the end.

## Status: all fixed (13 Oct 2026)

Steve's calls: pre-select the suggestion, and home kids start.

| # | Fix | Commit |
|---|---|---|
| 1 | Before kickoff, Game plan starts from the lineup on screen in every sport, and "Use for Q1" applies changes. From the game page it's a labelled preview with How we play. League plans follow roles. | 971874b, d94534d |
| 2 | One "Keep on". The lineup long-press is the hold menu (this game), with Player role inside it. Holds carry into the game. The role toggle reads "Keep on, every game". | 54f773b |
| 3 | Kids with a home position start, in all three sports (league after §6). | d4e9c65 |
| 4 | Age-group notes past U10 don't promise zones. | 4327bd8 |
| 5 | A new team starts on its age group's suggested strategy. | 1bf03ab |
| 6 | The rule check says where season balance stands. One check isn't "All rules kept". | 9897dd6 |
| 7 | The netball starting bench says why kids sit. | ad57c2d |
| 8 | Renaming a position replaces the label. | 0aad44a |
| 9 | The role sheet spells out what's picked. | 8945b65 |
| 10 | The Vests control explains each choice (fixed order = jersey order). | d663c5f |
| 11 | With scoring off, the score bar says so, with "Turn it on" for coaches. | 35ddc93 |
| 12 | "Positions saved." after saving. | 0aad44a |
| 13 | League age groups read "Under 10". The colour key is named in the sport's words. The lineup reads "Suggested lineup". | c9eb63a |

Found while fixing these: the netball live court threw its server HTML
away on a slow phone (the clock's text didn't match), so the first tap
was lost. Fixed in f62efb7, with slow-phone hydration tests for all three
sports.

## Confirmed issues

### 1. Game plan disagrees with the lineup, and its edits go nowhere
*Seen in: game day AFL U12, AFL U15, netball.*

Before kickoff, Game plan is a separate "plan for the group chat" projection:
- Its Q1 is worked out separately from the lineup screen's suggestion, so the
  two show different kids.
- Swaps made in it never reach the lineup: there's Reshuffle but no "Use this
  plan" before kickoff. All three agents made changes there and then found the
  lineup unchanged.
- It ignores How we play when opened from the game page
  (`games/[gameId]/page.tsx:359`) and from the netball and league lineups
  (`live/page.tsx:481`, `:790`): no playbook is passed in. The U15 coach's
  home positions were ignored there (the full forward was put in the back
  line).

Fix: pass the playbook everywhere, and start the plan's Q1 from the lineup's
own suggestion or draft. Then either let "Use this plan" set the lineup before
kickoff too, or label pre-kickoff Game plan clearly as a preview to share.

### 2. "Keep on" means two things, and the pre-game one is invisible
*Seen in: game day AFL U12.*

Long-press before kickoff opens the season **role** sheet, whose "Keep on"
means "plays as much as the rules allow" all season. Long-press during the
game opens the hold menu ("Keep on field": this game only). The coach wanted
a kid on the field for this game, set a season-long role instead, and nothing
on the tile showed it had worked.

Fix: make the pre-game long-press the same hold menu as in the game (Keep on
field / Keep in {line}), with "Player role…" as one action inside it. League
already works that way. Show a small marker on tiles for kids with a keep-on
role.

### 3. A kid with a home position can start on the bench
*Seen in: game day AFL U15.*

With 20 kids and 15 spots, the full forward the coach had just set sat out
Q1, and another kid wore FF. It's fair rotation, but a set-positions coach
expects home kids to start in their spot. **Design call:** should kids with
home positions be the last to sit out at kickoff?

### 4. Age-group notes still say "3 zones" from U13 up
*Seen in: setup AFL U15.*

`src/lib/ageGroups.ts` notes for U13–U18 read "15-a-side, 3 zones (5-5-5
split by default)", and the AFL sport card says "rotations (3 zones)". Zones
end at U10 by default now. The copy contradicts How we play.

### 5. The wizard pre-selects one strategy and suggests another
*Seen in: setup AFL U15.*

For a new U15 team, "Free rotation" is selected while "Set positions" is
labelled "Suggested for Under 15". (`effectiveStrategy` falls back to
`fallbackStrategy` when no row exists. That keeps existing teams unchanged,
but a brand-new team gets no benefit from it.) **Design call:** pre-select
the suggestion for new teams.

### 6. "All rules kept" when only the 50 % floor was checked
*Seen in: game day AFL U12.*

A new Preferred lines team with no rules sees "All rules kept", and the
detail lists only "Everyone can play at least 50 %". The coach read this as
the app not checking preferred lines or fairness. Say what's in force, e.g.
"Preferred lines · season balance starts after your first game", or "1 rule
checked".

### 7. Netball: no reason given for who sits out at kickoff
*Seen in: game day netball.*

The break screen has Why, but the starting lineup doesn't say why two girls
are on the bench. Parents ask exactly this.

### 8. Renaming a position adds to the old label instead of replacing it
*Seen in: setup AFL U15.*

Tapping the label field and typing "KEY" over "CHB" gives "CHBK" (4-character
limit). Select the text on focus.

### 9. Role sheet chips are abbreviations with no names
*Seen in: game day AFL U15.*

"No legend visible" for FF, HFF, CHF… It's harder still with the new left and
right labels (LHB, RHF). Show the full name of the chosen option under each
group, or names on the chips where they fit.

### 10. "Fixed order" vests don't say what order
*Seen in: setup league U11.*

The control offers Auto-fair / Fixed order / Coach picks, but not what fixed
order means. It goes by jersey number: say so, or let the coach set the order.

### 11. With scoring off, the score just sits at 0 or "—"
*Seen in: all game days. My seed left scoring off.*

A coach who skipped scoring in setup sees a dead score with no hint. Add
"Scoring is off · turn it on in Team".

### 12. "Save positions" gives no "Saved"
*Seen in: setup AFL U15 (solo re-run).*

After saving, the button just greys out (nothing left to save). The agent
waited, then doubted that the rename had stuck. It had: both runs' "KEY"
labels are in `team_positions`. Show "Saved" next to the button, as the
lineup's Save plan does.

### 13. Small wording points
- League age groups read "U10" while AFL reads "Under 10" in the same select.
- The netball live legend reuses the AFL component; its screen-reader label is
  "Time-in-zone colour key".
- "Auto-suggested" (Game settings summary) and "Lend to opposition" read as
  app terms rather than coach words (netball agent).

## Probably not app bugs (agent or setup noise)

- **Dropped or garbled keystrokes, flickering sport cards, "Name is
  required" sticking, the paste box losing line breaks, Cancel not
  responding.** The agent typed while a slow dev server was still hydrating,
  with three agents at once. At normal speed the team form behaves correctly
  in the browser, and the paste box and Cancel are wired correctly in code.
  The agent's type tool can't put line breaks into a textarea.
  Worth one re-run against a production build to be sure. A solo re-run of
  the U15 setup (one agent, no contention) still lagged badly. So the dev
  server itself is the bottleneck: run the next round against `next build &&
  next start` on the local stack.
- **Native age-group select hard to drive.** Agent tooling. Native selects are
  fine for people on phones.
- **Fast clock, an early "Sub due", Tuesday vs Saturday, no scoring.** These
  came from the seed (8× clock, default sub interval, game today, scoring off).
  The seed now turns scoring on and pushes the sub interval past the quarter.
- **"Start game day" didn't navigate at first.** Dev-mode compile delay.

---

# Round 2, 13 Oct 2026 (after the fixes)

Twelve missions: the six above again, plus six new ones (a parent running
scoring from the share link, Game plan the night before, keep on today vs
every game, league U11 game day, netball carnival day, a returning coach
reading season stats). This time they ran against a **production build**
on the local stack, so dev-server lag was gone: the whole round took about
8 minutes. Reports are in `e2e/explore/reports/` (not committed).

## Fixes that held up

- **Holds** (holds-keep-on, completed): Keep on field from the lineup
  showed a lock through Q1, the break ("STAYS") and Q2, and "Let them rotate
  again" cleared it. "Keep on, every game" stuck on the role.
- **Game plan** (gameplan-night-before): "Use for Q1" made the lineup
  match the plan, and the plan was still saved when the game reopened.
- **Home kids start** (gameday-afl-u15): all five home-position kids
  started in their spots.
- **Rule check** (gameday-afl-u12): it now says "season balance starts after
  your first game" rather than a bare "All rules kept".
- **Suggested strategy** (setup-afl-u15): Set positions was pre-selected.
- **Runner** (runner-parent-scoring, completed): a first-time parent ran
  Q1 from the share link, including scoring, Cancel, Undo and a swap.

## New, confirmed

1. **The netball score review still counts an undone goal.** Netball's undo
   writes `{ target }` (often empty), but the score log reads
   `target_event_id`. The header pairs undos newest-first and shows 2–0;
   the break's per-quarter review shows 2–1. AFL and league look the
   target up on the server; netball should too, and the score log should
   pair old markers newest-first so existing games read right.
2. **League allows a conversion with no try.** The game holds a made
   conversion and no try. A separate "+C" opens the conversion dialog at
   any time, and `recordConversionAttempt` doesn't check for an
   unconverted try (only `force` should allow that).
3. **"How we played" flags kids under 50 % against the nominal quarter
   length.** The floor check uses `periodsPlayed × periodMs`, not the time
   actually played, so short quarters flag kids who played exactly half.
4. **Reopening Game plan mid-game ignores the plan you pinned** (AFL and
   netball). It always projects afresh, so the coach's pinned next quarter
   looks lost.
5. **Game plan from the lineup uses the game's field size, not the
   lineup's**, and its sub cadence can disagree with the game's sub
   interval ("every 4 min" vs "every 10m").
6. **A season keep-on role still isn't shown on the lineup** (the
   every-game half of finding 2 in round 1).

## Worth a look (unconfirmed or design)

- **Taps during the score sheet's slide-in can land on the wrong scorer**
  (runner, carnival, league: "first tap credited Ruby", "first goal
  silently failed"). Not reproduced by hand.
- **Carnival rule visibility**: the "still to play every third today" line
  sits under a collapsed "All rules kept". There's no way to see who has
  played which third today, so a parent's question can't be answered.
- **Jargon on the live screen for first-timers**: OFF NEXT, pairs,
  CEN/BCK/FWD, Q-BY-Q (runner).
- **Undo only takes back the last score**; undoing an earlier one means
  Fix scores at the break (game day AFL U12).
- **Game plan text for set positions** lists names without positions,
  which parents find hard to read.

## Noise

- **Dropped first letters in player names** (all three setup runs):
  typing works by hand on both the wizard's squad step and the Squad tab.
  It's Stagehand's typing tool.
- **Cancel not closing a sheet**: the role sheet's Cancel closes it.
- **The wizard's "Back to Team basics"** is a working link (onboarding
  e2e covers it).
- **Saturday vs Tuesday dates and fast clocks** come from the seeds.
