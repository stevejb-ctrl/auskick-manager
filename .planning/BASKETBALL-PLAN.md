# Junior Basketball: plan (18 Oct 2026)

On 18 Oct 2026 the sport research ranked basketball first among the
junior sports Siren doesn't cover. This plan covers how we'd build it,
what junior basketball does that our other sports don't, and the
decisions Steve needs to make. **Nothing here is decided yet.** Siren's
suggested defaults are in bold and marked (recommended); the decisions
are listed at the end.

**Approach: basketball gets its own family and engine. It lifts
soccer's sport-agnostic sub logic into `src/lib/live/` instead of
forking it.**
- **What the lineup is:** five on court and a bench, with no keeper.
  **Positions are optional**, as in netball. How we play picks the
  rotation:
  - **no positions** (minutes only, like soccer's 4v4);
  - **a guard/forward rotation** (two lines, like rugby's forwards and
    backs);
  - **a rotation through the five positions**, 1 to 5 (like netball's
    bibs).

  So the lineup is soccer's shape without the keeper: lines plus
  optional named slots. See "Positions and rotations" below.
- **Why not join the soccer family:** `isSoccer()` would answer yes for
  basketball. Soccer's keeper, formations and pitch would all have to be
  switched off by config, and soccer's line words and strategies aren't
  basketball's.
- **What moves:** the rolling-sub pick, the window batch and the
  per-line minutes in replay move out of soccer's engine as plain
  functions. Both sports call them with their own rules.
- That follows the union plan's rule ("shared code, never shared rules")
  and CLAUDE.md's "reuse before you fork".

**Effort: about soccer's size, roughly 2 weeks of sessions on the
soccer plan's yardstick.**
- **Less than soccer:** no keeper, no keeper handover, no formation
  catalogue (basketball has two shapes).
- **More than soccer:**
  - fouls and a timed sit-out;
  - saved clock pauses and a "Set time left" clock action;
  - a team halves/quarters setting;
  - a three-chip score bug;
  - a PlayHQ tenant list.
- **The same as soccer:** lines, optional named positions, and How we
  play strategies.
- **On that yardstick:** soccer's plan said two to three weeks, yet its
  phases 1–4 were built on `soccer-phase-2` by the evening of 17 Oct,
  the day the plan was written. So the estimate is probably high.

**Target (proposed): build once soccer is merged, beta in Term 1 2027
(the back half of the summer season), launch for the 2027 winter
season.**

**Why it's worth it:**
- **Players:**
  - AusPlay 2025 puts basketball at 7.1 % of children, third of all
    activities and second among team sports after soccer (14.3 %),
    ahead of AFL (5.9 %).
  - Basketball Australia counts 323k–350k juniors and about 1.3M
    players in all.
  - Girls' and women's numbers are up 25 % since 2022.
  - Basketball NSW estimates up to 150k players miss out each year for
    lack of court space.
- **Seasons:** associations run a summer and a winter season. All five
  Siren sports are winter codes, so basketball is the first sport a
  coach opens from October to March.
- **The bench:**
  - With five on court from a squad of 8–10, up to half the team sits
    at any moment.
  - AFL U10 plays 12 on the field, so a squad of 16 rests a quarter of
    the team.
  - No other sport has a sharper fair-time problem.
- **PlayHQ:**
  - Basketball runs on PlayHQ: Basketball Australia and the states since
    2019, with Victoria, WA, Tasmania and the ACT confirmed.
  - Siren's fixture import already works for AFL and netball, so
    basketball can have it too. No sport since netball could.
- **Competitors:** more than soccer had, but none is Australian:
  - SubTime (multi-sport);
  - The Hoops Geek (a web rotation maker and live sub manager, with a
    free plan);
  - B-Ball Subs (iPad, 10 players at most);
  - PlayBall;
  - Who's On – Basketball.

  None that we saw mentions Australian domestic by-laws: halves on a
  running clock, the no-subs last minute, or 5-minute sin bins.
- **The gap:** none of them handles these well:
  - optional position rotations (guard/forward or 1 to 5), balanced
    over a season;
  - foul trouble in the sub suggestions;
  - foul-outs and sin bins taking a kid out mid-game;
  - season balance across games;
  - the fixtures coming in from PlayHQ.

## Junior basketball: what's different

### Formats

There is no national junior format. Each association sets its own
by-laws on top of the FIBA rules. These are the domestic (club) rules we
found, by state:

| State | Association | Periods | Clock | Clock stops |
|-------|-------------|---------|-------|-------------|
| VIC | MCBA (Melbourne, Nov 2025) | 2×20 halves | Running | Every whistle in the last 2 min of the 2nd half |
| VIC | Nunawading (2025) | 2×18 halves | Running | Every whistle in the last 2 min of the 2nd half |
| VIC | Keilor | 2×20 halves | Running | Last 2 min of the 2nd half, if close (unverified) |
| VIC | Bendigo | 2×20; U10 2×16 | Running | Last 2 min of the 2nd half |
| WA | Willetton (2022), Perth Redbacks (summer 25/26), Warwick | 2×20 halves | Running | Finals only: last 3 min fully timed |
| QLD | Gold Coast (2024) | 4×10 quarters | Running | Last minute, if within 10 points |
| ACT | Basketball ACT (Aug 2025) | 4×10 quarters | Running (U10: never stops) | Last 2 min, if within 10 points |
| NSW | Basketball NSW (2021) | FIBA's 4×10 as the base; associations vary | — | — |
| NSW | PCYC Northern Beaches (older) | U10 2×14, U12–U14 2×18 | Running | Last minute, if within 5 (unverified) |
| SA, TAS, NT | Not found | — | — | — |

**Representative and premier grades use a stop clock.** Basketball
Victoria's junior classics (Rev 6, Mar 2025) play U12 at 4×7 and
U14–U18 at 4×8, with the clock stopping on every whistle. The ACT's U12
and U14 Junior Premier League play 4×8, fully timed.

**Common to all of them:**
- **Five on court.**
- **Squads:** most comps allow 10 on the scoresheet (BNSW), some allow
  12 (ACT, Gold Coast).
- **Starting:** a team needs 4 or 5 players to start.
- **Ages:** U8, U10, U12, U14, U16, U18 and up, in boys/mixed and girls'
  grades.

**The younger grades change the game:**
- **U8** is often a skills session followed by a short game. At
  Willetton the first half is coached skills, then a modified game of
  about 2×12 under U10 rules.
- **U10** (ACT):
  - a lower ring (2.61 m);
  - no zone defence;
  - no 3-pointers;
  - free throws 90 cm closer;
  - coaches allowed on the court;
  - no 3-, 5- or 8-second violations;
  - scores and fouls recorded in Division 1 only.

  Gold Coast's U10s add wristband match-ups and no free throws.
- **U12** (ACT): no half-court zone, no 3-pointers and no shot clock.
  MCBA does allow 3-pointers up to U14, from an inside line.
- **U14:** no half-court zone almost everywhere. Basketball Australia
  recommends the no-zone rule for U14 and younger.

**Siren's age table (recommended):**

| Age | On court | Squad | Periods | Scores | 3-pointers | Fouls tracked | Rotation ★ |
|-----|----------|-------|---------|--------|------------|---------------|------------|
| U8 | 5 | **10** (max 12) | **2×12** | **Off** | No | **Off** | **Equal minutes** |
| U10 | 5 | **10** (max 12) | **2×20** | **On** | **No** | **Off** | **Equal minutes** |
| U12 | 5 | **10** (max 12) | **2×20** | **On** | **Yes** (team can turn off) | **On** | **Guards and forwards** |
| U14 | 5 | **10** (max 12) | **2×20** | **On** | Yes | **On** | **Guards and forwards** |
| U16–U18 | 5 | **10** (max 12) | **2×20** | **On** | Yes | **On** | **Home line** |

★ is How we play's suggested strategy. The coach can pick any of the
five at any age (see "Positions and rotations").

The team can override the number of periods (2 or 4), the period length
and the players on court. Period length and on-court size can already be
overridden (`quarter_length_seconds`, `0067`). **The period count can't
yet; it needs `teams.period_count`** (see the engine).

### The intricacies, and what Siren does about each

1. **Halves or quarters, by association.** VIC and WA play 2×20 halves,
   QLD (Gold Coast) and the ACT play 4×10 quarters, and NSW varies.

   → The age groups default to 2×20 halves. Team settings offer
   "Halves / Quarters" and the period length. The label follows the
   count (2 means "half", 4 means "quarter"), from basketball's own
   config. League already runs quarters and halves under one sport, so
   the shared break and clock code handles both.

2. **The clock is the table's, not the coach's.** Domestic juniors play
   on a running clock almost everywhere. Rep and premier grades stop it
   on every whistle.

   → See the stop-clock section below.

3. **Subs happen only at a dead ball, through the table.**
   - The sub reports to the scorer's table and goes on at the next
     whistle, or after a last free throw.
   - Dead balls come often, so in practice it's rolling, with a wait of
     up to a minute.
   - Some by-laws add a cutoff. Nunawading allows no subs in the last
     minute of the first half, except for an injury or a foul-out.
   - FIBA allows only the scored-against team to sub after a basket in
     the last 2 minutes of the game. That's the table's job, not
     Siren's.

   → **Rolling, with a no-subs cutoff (recommended).** Soccer's branch
   already adds the cutoff to the shared `subDistribution.ts`
   (`cutoffMs`, `inSubCutoff`).
   - The sub-due banner says "Send Mia and Sam to the table" and stays
     up until the coach taps "On" at the whistle.
   - A basketball sub can wait 30 seconds, and the copy says so.
   - The "On" tap stamps the sub, so the minutes are right.

4. **Equal time is club policy, not a by-law, in Australia.**
   - **Australia:** we found no state or association by-law that sets
     minimum minutes. Clubs commit to equal time in their own policies.
   - **Elsewhere, the rules are written down:**
     - FIBA's suggested mini-basketball changes: every player plays in
       each half.
     - A FIBA Oceania coaching manual (unverified): every player plays
       at least one quarter, and nobody plays all of the first three.
     - Basketball England's U12 "All Must Play": quarters 1 and 3 are
       split into four 5-minute periods, and everyone plays one of each.
     - US rec leagues: often "two complete quarters".

   → As in soccer, the engine aims for equal minutes, and How we play
   warns below a 50 % floor, which the coach can change. Season balance
   carries across games. The FIBA Oceania and US rules are presets for
   later (out of scope).

5. **Foul-outs.** Five personal fouls, and the player is out for the
   game. A fouled-out player must be replaced within 30 seconds (BNSW).

   → See the fouls section below.

6. **Sin bins.**
   - A behavioural technical or unsportsmanlike foul sits the player out
     for 5 minutes of playing time. Timeouts don't count (Nunawading).
   - Gold Coast sits any junior with a technical for 5 minutes of
     playing time.

   → A shared timed sit-out (see fouls). Soccer's plan defers the same
   thing (MiniRoos' 5-minute sit-out), and rugby has sin bins, so it's
   built once in `src/lib/live/`.

7. **Scoring is 1, 2 or 3 points, and the youngest grades drop some of
   it.**
   - There are no 3-pointers at U10–U12 in the ACT, and no free throws
     in Gold Coast's U10s.
   - The ACT records U10 scores in Division 1 only.
   - The official score is the table's (PlayHQ live scoring), and
     parents already follow it in the MyHoops app.

   → Own-team chips: +1, +2 and +3 (the +3 is hidden when the age or
   team has no 3-pointers). Opponent chips: +1, +2 and +3. The scorer
   picker credits points to a kid.
   - Track scoring is **off at U8 and on from U10 (recommended)**, and
     the coach's switch stays.
   - Parent and runner links lead with minutes and the rotation. The
     score shows only when it's tracked, because MyHoops already has
     the official one.

8. **Positions are loose, and coaches use them differently.**
   - Basketball numbers its five positions:
     - 1: point guard;
     - 2: shooting guard;
     - 3: small forward;
     - 4: power forward;
     - 5: centre.

     They group into guards (1–2) and forwards (3–5).
   - Juniors play man-to-man (no zone to U14) and are taught to be
     positionless, so plenty of coaches ignore positions.
   - Others rotate kids between guard and forward. Older teams have
     their guards and their bigs.
   - Every coach cares that each five is balanced, for example not all
     the beginners on court at once.

   → **Positions are optional, as in netball.** How we play offers five
   rotations:
   - Equal minutes (no positions);
   - Guards and forwards;
   - Home line;
   - All five positions;
   - Set positions.

   See "Positions and rotations" below. The no-zone rule is a How we
   play law note.

9. **Mercy rules and other local modifications.**
   - MCBA's U10–U14 mercy rule: the losing coach can invoke it at 20 or
     more down, and the leader must stop pressing full court.
   - Gold Coast's U10 wristband match-ups.
   - ACT U10 coaches allowed on the court.
   - The defence retreating to halfway after a basket.

   → How we play shows these as law notes, nothing more.

10. **Duty teams run the table.** The home team runs the clock and the
    away team the scoring (Gold Coast). Parents do it, usually the ones
    Siren's coach also needs on the bench.

    → Out of scope for v1. A "table duty" slot on the game-day roster
    is a later idea.

11. **Fixtures and teams live in PlayHQ.**
    - `PLAYHQ_TENANT` maps each sport to one tenant (`"afl"`,
      `"netball-australia"`).
    - Basketball has one per state. Victoria's is `basketball-victoria`
      (from a PlayHQ fixture URL); the others aren't confirmed.

    → `PLAYHQ_TENANT` becomes a list for basketball, and
    `parsePlayhqUrl` accepts any of them. The import is fixtures only,
    as it is today. To confirm: the other states' slugs, and that the
    anonymous `teamFixture` query answers under them.

12. **The name is unambiguous.** "Basketball", short name "Basketball",
    code id `basketball`.

    → Brand: **the main Siren brand, as union and soccer
    (recommended)**, not a site of its own.

## The stop-clock question

**What we found:** domestic junior basketball runs a running clock in
every state we found rules for: VIC, WA, QLD, the ACT, and the one NSW
association. It stops only in the last 1–3 minutes, often only when the
margin is close, and in finals. Stop clocks are for rep tournaments,
premier grades and seniors. So the question that looked like the main
design problem mostly applies to a smaller group of coaches, and the
rep grades rarely aim for equal time anyway.

**Running clock (domestic):** Siren's clock is the coach's phone, and
minutes are counted on it.
- **For most of the game,** the phone and the stadium clock agree.
- **In the last stretch,** the stadium clock stops and the phone runs
  on. The phone already shows overtime (`GameHeader`), and the coach
  ends the half at the hooter. Ending caps each kid's credit at the
  half's length. So the error is at most the final few minutes, and it
  falls evenly on the five on court.
- **Timeouts:** the coach can pause, and pause/resume already exists in
  every sport.

→ Three changes, all shared, all sports:
- **Save pauses.**
  - Today a pause lives only in memory (`liveGameStore.ts:16-19`), so
    reloading during a timeout counts the paused seconds as play.
  - Basketball has 2–4 timeouts a game, so it meets this more than
    other sports.
  - Fix: save the clock's pause state on the phone with the rest of the
    live state.
  - It's a bug fix, so the regression test comes first (CLAUDE.md).
- **"Set time left" in `ClockMenu`.** It matches the phone to the
  scoreboard, for a late start or after the last-minute stops. It moves
  the clock's anchor; later events carry the corrected `elapsed_ms`.
  Every sport gets it.
- **Copy:** in basketball, the sub-due banner names the scoreboard
  time: "Change at the first whistle after 10:00".

**Stop clock (rep, premier):** the stadium clock may run for half the
real time or less, and the stoppages bunch up: free throws, timeouts,
injuries. Phone time and game time come apart, and not evenly. A coach
can't tap pause on every whistle and coach as well.

**The options:**
- **A. Count phone time anyway.** This is wrong in exactly the games
  where it matters.
- **B. The coach pauses on every whistle.** Not realistic.
- **C. Segments (recommended for stop clocks).**
  - Each period is split into N segments, for example 4×8 quarters into
    8 segments of 4 minutes.
  - Siren prompts by the scoreboard: "Segment 3 of 8. Change at the
    first whistle after 4:00."
  - The coach taps "Changed" when it happens, and Siren stamps the sub
    at the segment's boundary, not the phone's time.
  - Credit is exact in game time, however long the stoppages run.
  - It's how the published rules are already phrased: England's
    5-minute periods, FIBA Oceania's quarters, the US two quarters.
  - Siren already has the model: netball credits each finished quarter
    at its nominal length and splits it at a sub's `atMs` (see
    `netball/fairness.ts`).
- **D. Follow PlayHQ's live clock.** There's no public API for it, so
  it's out of scope.

→ **Two clock modes per team (recommended): Running, the default, in
v1; and Stop clock (segments) in v1.1**, unless the beta coaches play
rep. Segments mode turns off the running clock's minute counting and
credits segments.

## Fouls, foul-outs and sin bins

- **A foul tally per player**, **off at U8–U10 and on from U12
  (recommended)**. The team can switch it on or off.
  - A **Foul** button in the `ScoreRecordingDock` opens the same picker
    as the scorer, limited to the five on court ("Who fouled?").
  - Fouls happen several times a game, so long-press would be too slow.
  - Undo works as it does for scores (`scoreUndo`).
  - It's the coach's copy of the table's count, not the official
    record.
- **Foul trouble.** Tiles show a foul badge (●●●).
  - At 4 fouls, the sub suggester prefers to rest the kid ("Leo has 4
    fouls. Rest him?").
  - Whether to rest a kid on 3 fouls in the first half is a How we play
    setting.
- **Fouled out at 5** (`foulOutAt: 5` in basketball's config).
  - The 5th foul asks "Leo has fouled out. Who goes on?" through
    `InjuryReplacementModal`.
  - The kid leaves the rotation for the game.
  - It reuses the existing "out for the game" mechanic: an `injury`
    event with a new reason, `fouled_out`. Replay benches the kid and
    `suggestSwaps` skips them.
  - Unlike an injury, there's no "Back on", and it's offered mid-period,
    not only at a break.
- **Fairness after a foul-out.** The minutes the kid played count. The
  rest of the game isn't owed back next week (recommended). The game
  report notes "fouled out".
- **The timed sit-out** (sin bin), shared, in `src/lib/live/`:
  - It starts from `LockModal` ("Sit out 5 min").
  - The kid is unavailable for N minutes of **clock time**. Clock time
    already excludes pauses, so timeouts don't count, which matches
    Nunawading's rule.
  - Sub-due and the bench tile count it down. The kid comes back
    through the normal suggester.
  - Soccer's 5-minute sit-out and rugby's sin bin can use it later.
- **Team fouls and the bonus** (7 a half in WA, 4 a quarter under FIBA)
  are the table's job. Out of scope.

## Positions and rotations

Positions are optional. How we play's strategy decides how kids rotate,
as netball's picks between thirds, bibs and set positions, and rugby's
between both lines and a preferred line. No national rule forces any of
them.

| Strategy | What Siren does | Season balance | Fit (★ = suggested) |
|----------|-----------------|----------------|---------------------|
| **Equal minutes** (`minutes`) | Five on court, no positions. Kids just play, and Siren evens out their minutes. | Minutes only | ★ U8–U10 |
| **Guards and forwards** (`both-lines`) | Every kid plays guard and forward across the game and the season. Which spot within a line is left to the kids. | Line | ★ U12–U14 |
| **Home line** (`preferred-line`) | Each kid is a guard or a forward, with time on the other line too. Subs go guard for guard. | Line | ★ U16–U18 |
| **All five positions** (`position-by-position`) | Every spot, 1 to 5, filled on its own, aiming for the most different positions per kid. | Position | Coaches who want every kid to play 1 to 5 |
| **Set positions** (`set-positions`) | A home position plus backups. The bench rotates like-for-like. | Position (off by default) | Older teams that specialise |

- **Lines:**
  - `guard` and `forward`, labelled Guards and Forwards. The centre (5)
    counts as a forward.
  - **Shapes:** **2 guards and 3 forwards (recommended default)**, or 3
    guards and 2 forwards. The coach picks in How we play, and the shape
    carries from one period to the next.
  - Equal minutes uses one line, `court`.
- **Positions:**
  - Seeded as 1 PG, 2 SG, 3 SF, 4 PF and 5 C (`kind: "custom"`,
    `canRename: true`, `canAddRemove: false`). A coach can call them
    "1–5", "PG–C" or "Point, Wing, Post", but there are always five,
    each in its line.
  - Stored in `team_positions`, as AFL's and rugby's are.
  - With fewer than five on court (the team override), the position
    strategies fall back to lines.
- **Rolling subs under each strategy:**
  - **Equal minutes:** the kid coming on takes the place of the kid
    going off.
  - **Guards and forwards, and All five positions:** the suggester picks
    who comes on by minutes first. Then it puts them on the line (or
    spot) that most evens out their season balance. "Mia on for Leo, at
    guard."
  - **Home line, and Set positions:** like-for-like: guard for guard, or
    1 for 1. The `like-for-like` rule already exists.
  - **Moving a kid on court:** at a dead ball, through `LockModal`
    ("Move to {moveToLabel}" already flips rugby's forwards and backs;
    "Switch player" swaps two kids' spots). It's saved as
    `field_zone_swap`, as soccer moves kids between lines.
- **Breaks re-plan the lines**, as soccer's half-time plan does. Under
  Guards and forwards, a kid who played guard in the first half leans
  to forward in the second.
- **No position cycle.** Netball's cycle (each bib along, then the
  bench) works because netball changes at the breaks. Basketball subs
  roll, so a cycle can't hold.
- **The ball-handler tag applies only to Equal minutes.** The suggester
  keeps at least one kid tagged "ball handler" on court. Under the line
  and position strategies the guards are the ball handlers. The tag is
  stored in `player_position_prefs`, as soccer's "keen keeper" is.
- **Rules** (`engineRuleKinds`):
  - `every-line-per-game`: guard and forward in every game;
  - `every-line-per-day`;
  - `distinct-lines`: the most different positions;
  - `stays-home`: Home line and Set positions;
  - `like-for-like`;
  - `keep-apart` and `keep-together`;
  - `max-bench-in-row`, counted in stints, since basketball subs on the
    run (`benchPeriodWord`).

  `subs-at-breaks` isn't offered.
- **Fairness:**
  - Minutes per line and per position are tracked apart from total
    minutes. They show in season balance (`balanceUnit: "line"` or
    `"position"`), the season grid, stats and the game report.
  - Total minutes stay the first goal under every strategy: a kid is
    never kept off to even out a position.
- **The role sheet:** Home line and Set positions use the shared role
  sheet (`playbook/roles.ts`): a home line, or a home position plus
  backups, as rugby and netball do.
- **Fallback strategy** (a team with no saved choice): Equal minutes.

## The engine

Basketball is a new family: `SportFamily` gains `"basketball"`, with an
`isBasketball()` check in the registry beside `isRugby()` and
`isSoccer()`. Every rule, word and default comes from basketball's own
config (`.planning/RUGBY-UNION-PLAN.md`: "shared code, never shared
rules").

### Before basketball starts

- **Soccer merges to `main` first.** Basketball builds on soccer's
  migration (`0068`), its sub-window cutoff in `subDistribution.ts`, and
  `SportFamily`'s soccer entry. Basketball's migration is then `0069`.
- **The lift.** These move into `src/lib/live/` as functions over a
  plain "lines / bench / minutes / holds" input, with soccer's wrappers
  keeping their names:
  - `suggestSoccerRollingSub`;
  - `suggestSoccerWindowBatch`;
  - the per-line minutes in soccer's `replay.ts`.

  Soccer's 7 unit-test files guard it. If the lift turns out bigger
  than a fork, fork instead and say why in a comment.

### What basketball shares

CLAUDE.md lists the shared chrome. Basketball consumes it verbatim:
- the live bars: `LiveTopBar`, `LiveStickyScoreBar`,
  `LiveAdminUtilityRow`;
- live actions and banners: `ScoreRecordingDock` (with the Foul
  action), `SubDueBanner`, `ManualEndQuarterConfirm`,
  `StartQuarterModal`, `ClockMenu` (with "Set time left");
- sideline modals: `LockModal` (with "Sit out 5 min", and its existing
  "Move to {moveToLabel}" and "Switch player"), `LateArrivalMenu`,
  `InjuryReplacementModal` (with the fouled-out copy);
- the lineup picker's chrome: `LineupPickerBreadcrumb`,
  `LineupPickerFooter`;
- hints and walkthroughs: `LongPressHint`, `WalkthroughModal`;
- the `sf/*` primitives.

It also uses the sport-agnostic helpers:
- `src/lib/live/`: `periodClock`, `periodPhase`, `subDistribution`,
  `subCadence`, `breakDraft`, `reconcileLineupToAvailability`,
  `presentPlayers`, `scoreUndo`, `locks`, and the lifted rolling-sub
  functions;
- `src/lib/playbook/`: `rules`, `ruleCheck`, `seasonBalance`, `rollup`,
  `roles`, `seasonGrid`.

Where basketball does what AFL does, it matches AFL, the reference:
- the bench is AFL's `grid-cols-4`;
- tiles mirror `PlayerTile`'s row order, with the foul badge where AFL
  puts its status badge;
- the score bug matches AFL's tokens, columns and badge positions, with
  the chip from `SCORE_CHIP`. Three chips a side fit: union already
  shows four (`scoreChip.ts:4-7`).

### What basketball owns

- **The lineup:** soccer's shape without the keeper. Roughly
  `{ lines: Record<BasketballLine, string[]>; bench: string[]; slots?: Record<string, string> }`.
  - The lines are `guard` and `forward`. Equal minutes uses one line,
    `court`.
  - `slots` maps positions 1–5 to kids under the position strategies.
  - Five on court by default (the team override allows fewer).
  - **Validator:**
    - the line sizes match the shape;
    - every slot is filled once;
    - no kid appears twice;
    - nobody fouled out or sitting out is on court.
- **The config** (`src/lib/sports/basketball/index.ts`):
  - the age table above, with `periodLabel` following the period
    count;
  - the lines, the two shapes, the five seeded positions, and the
    strategy per age (★);
  - score types: free throw 1, two 2, three 3, each with an opponent
    twin;
  - `threePointers` per age;
  - `foulOutAt: 5`;
  - `tracksFoulsDefault` per age;
  - the sub mode (rolling plus cutoff) and the clock mode.
- **The engine** (`src/lib/sports/basketball/`):
  - **replay:** events to per-player minutes (in total, per line and per
    position), points, fouls, foul-outs and sit-outs;
  - **suggesters**, each following the team's strategy:
    - the starting five, with lines and spots;
    - the next rolling sub, through the lifted shared function, with
      basketball's rules:
      - foul trouble;
      - the line or spot that evens out season balance;
      - like-for-like under Home line and Set positions;
      - a ball handler on court under Equal minutes;
      - the cutoff;
    - the half-time or quarter-break plan, which re-plans the lines;
  - **the lineup validator.**
- **Events:** existing types are reused where the meaning matches:
  - `swap` for a sub;
  - `field_zone_swap` for moving an on-court kid between lines or
    spots;
  - `injury` with reason `fouled_out`;
  - the scorer-credited score pattern of `recordGoal`, for the three
    score types;
  - the core eight every sport has.

  Two event types are new:
  - **`foul`:** `player_id`, metadata `{ kind: "personal" |
    "technical" | "unsportsmanlike", quarter, elapsed_ms }`, counted by
    replay as league counts kicks (`rugby_league/kicks.ts`);
  - **the shared sit-out:** `sit_out`, metadata `{ durationMs, reason
    }`, which replay treats as unavailable from `elapsed_ms` to
    `elapsed_ms + durationMs`.

  Both need `sport_event_types` rows (`0061`).
- **The live UI** goes in a new `src/components/basketball/`:
  - `BasketballLiveGame`;
  - `BasketballCourt`: a half court in AFL's look, as soccer's
    `SoccerField` is, drawn three ways:
    - five unlabelled tiles (Equal minutes);
    - a Guards band at the top of the key and a Forwards band at the
      basket (the line strategies);
    - five spots: 1 at the top of the key, 2 and 3 on the wings, 4 and
      5 on the blocks (the position strategies);
  - `BasketballLineupPicker`;
  - `BasketballScoreBug`;
  - the summary card and full-time review, mirroring AFL's.

  Breaks are handled inline, as soccer and rugby do, with the shared
  `StartQuarterModal`.
- **Server actions:** `basketball-actions.ts`, registered in
  `registerLiveActions` and `writeQueue`.
- **Route forks** (as soccer):
  - `live/page.tsx`;
  - `stats`;
  - `run/[token]` and its lineup page;
  - game detail;
  - settings;
  - `dashboard/actions.ts`.
- **The compiler lists the rest:**
  - `Sport` in `src/lib/types.ts` and `SportId` in
    `src/lib/sports/types.ts`, both copies. Nothing checks they match;
  - 10 `Record<Sport, …>` and 3 `Record<SportId, …>` maps;
  - 8 `noSportBranch` calls;
  - the 5 `aflBranch` call sites, plus whatever soccer adds.

### Shared changes that ride along

- **`teams.period_count`** (nullable: 2 or 4). It's resolved game →
  team → age group, as `getEffectiveQuarterSeconds` resolves period
  length. Soccer's US quarters can use it later.
- **Saved clock pauses** and **"Set time left"** (the stop-clock
  section).
- **The timed sit-out** (the fouls section).
- **No shared live court primitive exists:** AFL's `Field`, league's
  `LeagueField`, soccer's `SoccerField` and netball's `Court` are each
  standalone. Basketball makes five. If `BasketballCourt` copies the
  same frame a third time, extract a `LiveFieldShell`, as marketing
  already has `FieldShell`.

## Phases

Work on a branch, after soccer merges. Each phase lands as small
commits, with the tests CLAUDE.md asks for. Coaches can't pick
basketball until phase 2 is done.

### 1. The sport and its engine (no UI)

- **The lift:** soccer's rolling-sub pick, window batch and per-line
  minutes move to `src/lib/live/`, with soccer's tests green.
- **Ids:**
  - `basketball` in `SportId` / `Sport` (both copies) and
    `"basketball"` in `SportFamily`;
  - `isBasketball()` in the registry.
- **`src/lib/sports/basketball/index.ts`:**
  - the age table;
  - lines, shapes, positions and the strategy per age;
  - score types;
  - foul and clock settings;
  - `teamSong: false`, `jerseyNumbers: true`.
- **Migration 0069** (`0068_soccer.sql` is the template):
  - widen `teams_sport_check`;
  - `sport_event_types` rows, including `foul` and `sit_out`;
  - `sport_lines` rows: `guard`, `forward` and `court`;
  - `teams.period_count`.
- **The engine:** all pure and unit-tested:
  - the lineup type and validator;
  - replay: minutes in total, per line and per position, plus points,
    fouls, foul-outs and sit-outs;
  - the suggesters under each of the five strategies.
- **Saved clock pauses:** the regression test first, then the fix.

Done when the engine's unit tests pass, the cross-sport guards
(`sportBranches`, `sportFamily`, `sportInvariants`) include basketball,
and `tsc` is clean.

### 2. The live game

- **Setup:** the setup wizard's sport pill (behind Beta, as soccer) and
  the default age.
- **Before tip-off:**
  - `BasketballLineupPicker`;
  - `BasketballCourt` in all three layouts (no positions, guards and
    forwards, 1 to 5);
  - the tiles and the bench.
- **During the game:**
  - `BasketballLiveGame`;
  - rolling subs with "send to the table" and "On", the line or spot
    they go to, and the cutoff;
  - moving kids between lines or spots (`LockModal`);
  - the Foul button, foul badges and foul trouble;
  - the fouled-out flow through `InjuryReplacementModal`;
  - the 5-minute sit-out from `LockModal`;
  - `BasketballScoreBug` (+1, +2, +3 and the opponent's, with the
    scorer picker);
  - late arrivals, lending and injury, all through the shared modals;
  - "Set time left" in `ClockMenu`.
- **Breaks:** halves or quarters, and the plan for the next period.
- **Full time:** the review and summary card.
- **Plumbing:** `basketball-actions.ts`, the write queue, and the
  live-route and runner-route branches.

Done when these play end to end on a phone, and their e2e playthroughs
are green:
- a U12 game at 2×20 under Guards and forwards, with a foul-out and a
  sit-out;
- a 4×10 quarters game under All five positions.

### 3. Every other surface

- **Setup and settings:**
  - `ScoringStep` copy;
  - team settings: halves or quarters, period length, foul tracking,
    3-pointers, sub cutoff.
- **How we play:** basketball's playbook:
  - the five strategies with ★ per age, the shape (2–3 or 3–2), the
    positions step (rename 1–5), and the role sheet for Home line and
    Set positions;
  - the rules list (`engineRuleKinds` above);
  - the equal-time floor;
  - the ball-handler tag (Equal minutes);
  - foul trouble;
  - law notes: no zone to U14, the mercy rule, the U10 modifications,
    coaches on court, wristbands.
- **Stats:** minutes (in total, per line and per position), points and
  fouls in the stats dashboard, season balance, the season grid and the
  game report.
- **PlayHQ:** the tenant list, `parsePlayhqUrl`, and the import and
  nightly sync for basketball.
- **Help:** about 10 hand-written pages, plus a walkthrough steps file.
- **Marketing:**
  - `marketing-sports.ts`, brand JSON, CMS config and the homepage
    section;
  - `sport-fields/BasketballCourtField.tsx` on `FieldShell`.
- **Demo:** a basketball seed, and basketball in the demo picker.
- **CLAUDE.md:** add basketball to the sport list.

### 4. Tests and checks

- **Unit:**
  - the age table, and the period-count override (halves and quarters,
    with labels);
  - the rolling sub: fewest minutes on, rest a kid at 4 fouls, keep a
    ball handler on (Equal minutes), no subs inside the cutoff;
  - each strategy:
    - Guards and forwards sends the kid coming on to the line they're
      short of this season;
    - Home line and Set positions sub like-for-like;
    - All five positions spreads kids across 1 to 5;
    - total minutes win over position balance;
  - both shapes (2–3 and 3–2), and the fallback to lines with fewer
    than five on court;
  - a foul-out removes the kid for the rest of the game, with no "Back
    on";
  - a sit-out lasts 5 minutes of clock time, and a timeout inside it
    doesn't count;
  - points 1, 2 and 3, with +3 hidden at U10;
  - foul tracking off at U10 and on at U12;
  - a reload during a pause doesn't count the paused seconds (the
    regression test);
  - "Set time left" moves later `elapsed_ms`;
  - isolation: basketball reads nothing from soccer's or AFL's rules
    (no keeper, no soccer lines or formations, no "behind"), and no
    other sport reads basketball.
- **E2E**, copying soccer's and AFL's:
  - a 2×20 full-game playthrough with a foul-out and a sit-out;
  - each strategy picked in How we play and seen on the live court
    (positions off, guards and forwards, 1 to 5), including a mid-game
    "Move to forwards";
  - a 4×10 quarters game, set from team settings: the schema rule,
    `period_count` end to end through the UI;
  - sideline combos (injure, lend, late arrival, foul out the last kid
    on the bench);
  - the break;
  - `multi-sport-schema`;
  - scoring off at U8 and on at U10;
  - PlayHQ import from a `basketball-victoria` team URL;
  - 375 px with ten in the squad.
- **Stagehand:** basketball game-day, sideline-chaos and whole-game
  missions, with seeds.

## Schedule (proposed)

| By | Done |
|----|------|
| After 4 Dec | Soccer's beta opens and its branch merges to `main` |
| Fri 11 Dec | Phase 1: the lift, config, migration 0069, engine with unit tests |
| Fri 18 Dec | Phase 2: a full game playable end to end |
| Fri 29 Jan 2027 | Phases 3–4; the beta opens for Term 1 |
| Feb–Mar 2027 | Beta through the rest of the summer season; fixes |
| Apr 2027 | Launch for the winter season |

If the schedule slips:
- PlayHQ import moves to after the beta;
- the two position strategies (All five positions, Set positions) move
  to v1.1;
- the ball-handler tag moves to v1.1.

Rolling subs, fouls, the running clock, Equal minutes and the two line
strategies are the core.

## To confirm before or during phase 1

- **What the beta coaches play:**
  - the association;
  - halves or quarters;
  - running or stop clock;
  - whether the table records fouls at their age.

  If any coach plays rep, segments mode moves into v1.
- **Season dates:** when the summer season resumes after the holidays,
  and when winter registrations open. The Term 1 beta and April launch
  assume late January and February–March.
- **Unverified research:**
  - SA, Tasmanian and NT domestic rules, and a current Sydney
    association's;
  - whether 5 fouls means out at U10–U12 everywhere. The ACT's 2020
    by-laws let a U12 player with 5 fouls come back; its 2025 by-laws
    don't say;
  - that no association sets minimum minutes as a by-law (none found).
- **PlayHQ:** each state's tenant slug, and whether the anonymous
  `teamFixture` query answers under them.
- **Merge order:** migration `0069` assumes soccer merges first.

## Out of scope for v1

- **Stop clock (segments) mode:** v1.1, unless the beta coaches play rep
  (see above).
- **Team fouls, the bonus, timeouts and the shot clock:** the table's
  job.
- **Rebounds, assists and steals:** stats belong to PlayHQ and MyHoops.
- **PlayHQ live score sync.**
- **Aussie Hoops sessions, 3x3 and wheelchair basketball.**
- **US and FIBA Oceania presets** (two-quarter minimum, one full
  quarter): the engine handles quarters, so this is an age-table and
  rules job if overseas demand shows up.
- **Table duty on the game-day roster.**
- **A position cycle** (netball's): basketball subs roll, so it can't
  hold.
- **Plays and sets** (who runs which play): coaching content, not
  rotation.
- **Mercy rules, wristbands, retreat rules and zone checks:** law notes
  only.

## To decide

Siren's suggestion is first, in bold.

1. **Engine:** **its own family and engine, lifting soccer's rolling-sub
   logic and per-line minutes into `src/lib/live/`**, or join the
   soccer family (and rename it), or fork soccer's engine.
2. **Name and brand:** **"Basketball", code id `basketball`, on the main
   Siren brand**, or a site of its own.
3. **Age defaults:** **2×20 halves from U10, U8 at 2×12, quarters
   (4×10) as a team setting.**
4. **Clock:** **Running in v1, Stop clock (segments) in v1.1**, or both
   in v1.
5. **Fouls:**
   - **a tally from U12;**
   - **rest at 4;**
   - **fouled out at 5 through the injury mechanic;**
   - **foul-out time isn't owed back.**
6. **Sit-out:** **one shared timed sit-out, built now**, for soccer and
   rugby to use later.
7. **Scores:** **off at U8, on from U10; the +3 chip from U12.**
8. **Positions: optional, as in netball.** How we play offers five
   strategies:
   - **Equal minutes** (★ U8–U10, and the fallback);
   - **Guards and forwards** (★ U12–U14);
   - **Home line** (★ U16–U18);
   - **All five positions**;
   - **Set positions.**

   Also to settle:
   - **the shape:** 2 guards and 3 forwards by default, 3–2 as the
     option;
   - **the positions:** seeded 1–5 (PG, SG, SF, PF, C), renamable, not
     removable;
   - **the ball-handler tag**, under Equal minutes only.

   The alternatives: lines only (no 1–5 strategies), or different ★
   ages.
9. **Game time:** **equal time as the target, with a 50 % floor the
   coach can change.**
10. **Timing:** **build after soccer merges, beta in Term 1 2027, launch
    for winter 2027.**

## Sources

Research done 18 Oct 2026.

- **Participation:**
  - AusPlay 2025 kids' top 10 (via aroundschools): https://www.aroundschools.com.au/blog/what-kids-do-australia
  - Basketball Australia, "Australia's fastest-growing team sport": https://www.australia.basketball/news/4283935/australias-fastest-growing-team-sport
  - 1.3M players: https://www.basketball.com.au/news/basketball-participation-in-australia-in-2025-boast-one-million-three-hundred-thousands-players
- **Domestic by-laws:**
  - MCBA Saturday Juniors (Nov 2025): https://mcba.basketball/wp-content/uploads/2025/11/MCBA-Saturday-Juniors-By-Laws-25.11.25.pdf
  - Nunawading JDC (2025): https://www.nunawadingbasketball.com.au/wp-content/uploads/2025/04/JDC-Rules-By-Laws-2025.pdf
  - Keilor timing: https://www.keilorbasketball.com/_files/ugd/fe1bd9_1b78c9ebff1b405095ab8d40825acc18.pdf
  - Bendigo: https://bendigobasketball.com.au/wp-content/uploads/2019/12/Beginners-BBA-By-Laws.pdf
  - Willetton (WA, Dec 2022): https://www.willettonbasketball.com.au/wp-content/uploads/2022/12/WBA-Junior-By-laws-5.7.pdf
  - Perth Redbacks (summer 25/26): https://perthredbacks.asn.au/wp-content/uploads/2025/12/Domestic_Handbook_Summer_25_26.pdf
  - Warwick Senators: https://warwicksenators.com.au/wp-content/uploads/2023/11/SENATORS-HANDBOOK-24-.pdf
  - Gold Coast (2024): https://goldcoastbasketball.com.au/images/2024/02/Game-Rules-2024.pdf
  - Basketball ACT (Aug 2025): https://www.basketballact.com.au/wp-content/uploads/2025/09/Junior-Competition-Rules-and-By-Laws-2025.pdf
  - Basketball ACT (2020): https://www.basketballact.com.au/wp-content/uploads/2021/04/2020-Junior-Competition-Rules-and-By-Laws-Final.pdf
  - Basketball NSW community rulebook: https://www.bnsw.com.au/wp-content/uploads/2021/08/BNSW-Basketball-Rules-for-Beginners.pdf
- **Rep timing:** Basketball Victoria junior classics, Rev 6 (Mar 2025): https://api.basketballvictoria.com.au/api/assets/dhqql4dfers4g0kc
- **No zone:** SA schools Year 5–6 rules: https://www.education.sa.gov.au/schools-and-educators/programs-students/school-sport-sa/choose-sport/basketball/basketball-statewide-schools-competitions/year-5-and-6-basketball-rules-of-the-competition.pdf
- **Playing-time rules elsewhere:**
  - FIBA modified rules: https://wabc.fiba.com/?p=187
  - Basketball England All Must Play: https://basketballengland.co.uk/media/matkcgot/appendix-7-all-must-play-2024-25.pdf
  - City of Dover (US rec): https://www.cityofdover.com/media/Community/Parks%20and%20Rec/Basketball/Youth%20Basketball%20League%20Rules.pdf
- **PlayHQ:**
  - Basketball on PlayHQ: https://get.playhq.com/for-your-sport/basketball
  - MyHoops (BV): https://basketballvictoria.com.au/news/new-app-for-community-basketball
  - Basketball WA partnership: https://basketballwa.asn.au/media-release-basketball-wa-and-playhq-join-forces/
  - The `basketball-victoria` tenant, seen in Nunawading's tournament fixtures: https://www.nunawadingbasketball.com.au/tournament-fixtures-live-ahead-of-record-breaking-weekend/
- **Competitors:**
  - SubTime: https://apps.apple.com/us/app/-/id1248650528
  - The Hoops Geek rotation maker: https://app.thehoopsgeek.com/features/rotation-maker
  - B-Ball Subs: https://apps.apple.com/app/id6759851869
  - PlayBall: https://apps.apple.com/ph/app/id6744836650
  - Who's On – Basketball: https://apps.apple.com/app/id842425065
