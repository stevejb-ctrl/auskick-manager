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

## Status: round 2 all fixed (13 Oct 2026)

| # | Fix | Commit |
|---|-----|--------|
| 1 | One undo rule (named score, else the latest standing) for the netball replay, the score log and the netball tallies. The netball undo names its score. Scores and their undos share one queue lane, so an undo can't overtake its score. | 5e0be28, ddbcd6e |
| 2 | A league kick needs a try waiting for its conversion; only Force (the extra kick) skips that. The picker says "No try to convert". Found on the way: league Undo did nothing, because the queue key landed in an optional `kind` argument. That's fixed, and enqueue arguments are now typed so it can't recur. Rule refusals drop their op instead of stalling the score lane. | a5902be, a32db57, 82610f5 |
| 3 | How we played judges the 50 % floor on how long each quarter ran (its hooter). | d30a2d2 |
| 4 | Reopening Game plan mid-game shows the pinned next period (all three sports). | 00a6b60 |
| 5 | Game plan from the lineup uses the lineup's field size and sub interval. Game detail and the live page pass the game's period length and sub interval. | 030cabd |
| 6 | A KEEP badge marks kids with a season keep-on role on lineup tiles, in every sport. | 489043a |

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

# Round 3, 13 Oct 2026 (after round 2's fixes, plus league U13+)

Fourteen missions: round 2's twelve again, plus two for the new league
U13+ grades (gameday-league-u13-goals, setup-league-u14). They ran against
a production build of b58907b, served from a separate worktree on :3100,
so the dev server other sessions were using stayed untouched. Every claim
below was checked against the code or the game's event log.

## Fixes that held up

- **League U13+, new** (gameday-league-u13-goals):
  - A 13-a-side lineup with named positions, and the same halfback
    converted both tries.
  - Penalty and field goals for both sides, with the kicker named.
  - Undo took back the Sharks' field goal, and the break read 15–2
    (right).
- **Netball undo** (gameday-netball-11u): the undo names the Sharks goal
  it takes back.
- **League conversion** (gameday-league-u11): a try, then its conversion.
- **Keep-on badge** (holds-keep-on): Lachlan's "Keep on, every game"
  showed on his lineup tile. Mia's today-only lock showed, carried to
  "STAYS" at the break and cleared with "Let them rotate again".
- **Named positions suggested for U14** (setup-league-u14).

## Status: round 3 all fixed (13 Oct 2026)

| # | Fix | Commit |
|---|-----|--------|
| 1 | Before kickoff the button is "Use this plan". Q1 becomes the lineup; Q2 on ride on the pinned plan, so reopening shows them and each break opens on them. The pin is now consumed a period at a time, not wiped. | c64cf7c, 92d74e3 |
| 2 | U13+ league scoring copy says international laws, with penalty and field goals; the track-scoring help too. | 359b586 |
| 3 | Game-time lists (all sports, live and game page) keep kids who never got on, as "0:00 (didn't get on)". Found on the way: How we played counted a league lineup's position slots as kids. | 22537e5 |
| 4 | Game plan names each kid's position for set- and named-position teams, on screen and in the chat text. | f6e0a8a |

## New, confirmed

1. **Game plan's "Use for Q1" silently drops edits to later quarters**
   (gameday-netball-11u twice, carnival-day-netball). Before kickoff the
   planner lets you edit Q2–Q4, but its button only applies Q1.
   Reopening shows a fresh projection, so the coach's later-quarter
   changes vanish.
2. **The setup wizard tells a U13+ league coach their team "plays
   modified tackle, so tries and conversions are tracked"**
   (setup-league-u14). U13+ plays international laws: tries,
   conversions, penalty goals and field goals.
   (`ScoringStep.tsx`; the track-scoring help copy says the same.)
3. **The game summary's game-time list leaves out a kid who never got
   on** (returning-coach-stats). How we played rightly flags Zara under
   50 % (benched all four quarters), but the list drops anyone under
   a second. She's the kid a parent will ask about.
4. **Game plan shows lines, not positions, for set-position teams**
   (gameplan-night-before, gameday-afl-u15-positions; noted in round 2
   too). Oliver is R on the lineup but sits in "Centre" in the plan,
   and there's no ruck. Parents can't read who plays where.

## Worth a look (unconfirmed or design)

- **The score briefly flickers back after a tap** (three runs: "6 and
  5", "Matilda appeared, disappeared, reappeared"). It looks like a
  refresh returning the pre-write state. The clock "jumps" are mostly
  the seeds' 8× clock (7 game-seconds ≈ 1 real second).
- **Break-screen captions** ("BCK → CEN") read as from → to. Swapping
  two kids headed to the same line changes nothing visible, so two runs
  couldn't tell whether a swap worked.
- **U13+ suggests rolling swaps freely** ("Suggested — 4 swaps"), but
  NSWRL limits U13+ to 10 interchanges a game. The app doesn't count
  them.
- **The keep-on badge shows on lineup screens only**, not on the live
  game's tiles.
- **A league bench kid's new home position doesn't show** on the bench
  tile (gameday-league-u11).
- **"Suggested lineup" stays as the label** after "Use for Q1" applied a
  plan (gameplan-night-before).

## Noise

- **Dropped or garbled typing in the setup forms and paste box** (all
  setup runs). Checked by hand last round: it's Stagehand's typing tool.
- **The native age dropdown "not sticking"**: an agent click problem.
- **"Start Q2 never started" (AFL U12) and "Start clock stuck on
  Loading" (carnival)**: both quarter_starts are in the event log; the
  agents looked too soon.
- **"Plan lineup rendered blank"**: a screenshot taken mid-navigation.
- **Game plan 12 vs lineup 15 on field (AFL U15)**: the seed doesn't set
  the game's on-field size; real games do (game-create e2e).
- **Tuesday vs Saturday, fast clocks** come from the seeds.

---

# Sideline combos: in-game actions across all sports (13 Oct 2026)

Steve: this season's match-day bugs came from combinations, "we lent a
kid, then a kid got injured, and we needed to swap some kids in the
break". So every in-game action was tested in combination, three ways:

- **Random walks** (`src/lib/__tests__/sideline/`): seeded games mixing
  everything a coach can do mid-period and at the breaks, written as
  the app writes them. An independent model of the field, bench, injuries,
  loans and each kid's time is checked against the replay after every
  action:
  - AFL: 600 games, half of them with events landing out of order;
  - league: 400 games;
  - netball: 500 games.

  A failure prints the seed and the actions, so it replays exactly.
- **Break combos, end to end**: lend, mark out (with and without a
  replacement), recover and recall at the break, then Start; for each
  sport.
- **The story, end to end** (`sideline-combos-afl/league.spec.ts`,
  netball in `netball-live-flow.spec.ts`): lend a kid, a kid is hurt
  and replaced, the lent kid comes back at the break. The replayed game
  must agree on who's on, nobody lost or doubled up, and the minutes
  split at each action.

## Found and fixed

| # | Bug | Commit |
|---|-----|--------|
| 1 | AFL replay: injury and its replacement swap landing in the other order lost the replacement and benched the hurt kid twice; a swap after the hooter credited the quarter twice; a recall after a pre-game loan, and an arrival already on the field, went wrong. | 3afa951 |
| 2 | Live writes went down per-action lanes, so a swap could land before the injury it followed. Now one lane per game; AFL undo goes through it too; rule failures are dropped, not retried. | cba41f7 |
| 3 | League time: a hurt kid who recovered on the field never accrued again; a kid lent without a swap was credited the next period; a mid-period fill got no time. | dee95cf |
| 4 | Netball: mid-quarter subs lived only in memory, so a reload put the injured GS back on court; a cancelled replacement left the kid accruing; Q4's subs were never saved (the replacement got no Q4 time). | a5ecb6b |
| 5 | AFL break: a kid lent or marked out at the break started the next quarter on the field; a mark-out replacement was added beside the out kid (5 in a 4-spot zone). | fd6b483 |
| 6 | Netball break: lending at the break left the kid on court; a kid brought back landed nowhere (gone from the game); recovering from the sidelined strip wiped the coach's edits. | 0c81df5 |
| 7 | League §7: a kid replaced while hurt and recovered on the bench kept the unbroken period (stats, live warning). | f7687f5 |
| 8 | League pinned plan at the break: kids who never turned up joined the bench; hurt kids were dropped from the game. | b555ee1 |
| 9 | AFL season zone time (season balance, suggester) used an older second replay: missed zone switches, double-credited injuries. | 18d5f6b |
| 10 | League field: any size without its own layout got the 11-spot one, so 12 a side hid a kid on the field. Found playing the story. | fe8c49e |

## Checked, not bugs

- League break events are stamped with the period just ended; time and
  §7 handle it.
- AFL can't record an injury before kickoff (only a loan), so the
  replay ignoring one isn't reachable.
- Netball credits a quarter ended early at full length on purpose:
  "end early" is used when the clock was paused for stoppages.

## Worth a look

- Netball's sub recency (who came on last, a suggester tiebreak) is
  stamped at the break, not when the kid came on mid-quarter.
