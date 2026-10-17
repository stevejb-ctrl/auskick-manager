# Junior Football (soccer): plan (17 Oct 2026)

A few coaches have asked for soccer. This plan covers how we'd build it,
what junior soccer does that our other sports don't, and the decisions
Steve made on 17 Oct 2026. The decisions are listed at the end.

**Approach: soccer gets its own engine.** That means its own lineup,
fairness, live game and server actions, all built from the shared chrome
and the sport-agnostic helpers. AFL's code isn't touched beyond adding
soccer branches to the dispatchers. That rules out regressions on the
sport most coaches use, and keeps soccer's rules (the keeper, uneven
formations, sub windows) in soccer's own code.

**Effort: about league's build, two to three weeks of sessions.** That
is more than joining the AFL engine would have cost (about 1½ weeks).
But since league was built, much more of the chrome has been shared, and
every dispatcher now fails loudly on an unhandled sport, so the compiler
lists the work.

**Target: a beta in summer comps from early December**, then a launch
for the 2027 winter season (registrations Feb–Mar, MiniRoos starts in
April).

**Why it's worth it:**
- **Players:** about 240k MiniRoos (2023), against 179k in Auskick and
  Superkick, plus about 198k youth players.
- **Competitors:** SubTime is the main competitor worldwide (multi-sport,
  keeper rotation), but no soccer rotation app has a real Australian
  footprint.
- **The gap:** none of them handles these well:
  - the keeper as its own fair slot;
  - time per line over a season;
  - state sub-window rules;
  - MiniRoos' no-scores policy.

## Junior soccer: what's different

### Formats

MiniRoos (U6–U11) is Football Australia's national format. From U12 the
states differ. Siren's defaults (decided) are in bold.

| Age | Players | Bench | Keeper | Halves | Pitch | Scores |
|-----|---------|-------|--------|--------|-------|--------|
| U6–U7 | **4v4** | +3 | No | **2×20** | 30×20 m | **Off** (not recorded) |
| U8–U9 | **7v7** | +4 | Yes | **2×20** | 40–50 × 30–40 m | **Off** (not recorded) |
| U10–U11 | **9v9** | +5 | Yes | **2×25** | 60–70 × 40–50 m | **Off** (not recorded) |
| U12–U13 | **9v9** (VIC, SA, QLD; NSW varies) | +5 | Yes | **2×30** (VIC, SA; QLD U13 2×35) | — | **On** (VIC, SA, NSFA; QLD from U13) |
| U14 | **11v11** | +5 | Yes | **2×35** (QLD) | — | **On** |
| U15–U17 | **11v11** | +5 | Yes | **2×40** (QLD) | — | **On** |

The team overrides players on the field and half length. The override
already exists for every sport (`0067`). MiniRoos has no offside, no
points table and no cards, and a Game Leader runs the match, not a
referee.

### The intricacies, and what Siren does about each

1. **Halves, always, in Australia.** Minutes vary by association:
   - Brisbane plays U5–U6 at 2×15 and moves U7 up to 7v7.
   - Macarthur plays U9 at 2×25 and keeps U12 inside MiniRoos at 9v9,
     2×30.

   → `periodCount: 2`, `periodLabel: "half"`, with the team overrides
   above. Quarters are only for the US and UK, which are out of scope.

2. **Rolling subs at any time, even with the ball in play.** MiniRoos
   needs no referee permission and allows unlimited re-entry. Older ages
   vary by state:
   - **QLD:** unlimited return interchange.
   - **SA:** every change at the halfway line.
   - **TAS:** three windows per half, none in the last 2 minutes.
   - **VIC:** U12–U13 allow at most 5 subs.
   - **WA:** from U13, with the referee's permission at a stoppage.
   - **NPL:** 5 named subs, no re-entry.

   → v1 offers two modes:
   - **Rolling** (the default).
   - **N windows per half, none in the final M minutes.** Sub-due
     batches the bench into each window.

   The cutoff goes into the shared `src/lib/live/subDistribution.ts`,
   so any sport can use it. "Max N subs, no re-entry" is out of scope.

3. **The goalkeeper.**
   - There is none at U6–U7, and one from U8, in a different-coloured
     top.
   - MiniRoos has no rule on changing keepers (unverified). IFAB Law 3
     says a change happens at a stoppage, with the referee told.
   - Clubs want everyone to have a go, but plenty of kids hate it and
     some love it.

   → See the goalkeeper section below.

4. **Equal time is the rule, not a floor.** The national rules make
   equal time a priority. Football Victoria accepts equal time each week
   or across the season, and sets no minimum percentage.

   → The engine aims for equal minutes. How we play warns below a 50 %
   floor, which the coach can change. Season balance carries across
   games.

5. **No scores at MiniRoos.**
   - FV penalises clubs that post scores.
   - FQ records none for MiniRoos or U12.
   - Brisbane records scores privately, only to grade teams.

   → Track scoring is off by default up to U11 and on from U12. The
   coach's switch stays. When scoring is off, parent and runner links
   show no score.

6. **Formations are uneven.**
   - 7v7 plays 2-3-1 or 3-2-1.
   - 9v9 plays 3-3-2 or 3-2-3.
   - 11v11 plays 4-3-3 or 4-4-2.

   FV's U12–U13 rules require at least three lines.

   → Formations come from config. 4v4 has no lines (see below).

7. **No added time.** The clock counts down a fixed half and the hooter
   ends it, as in every Siren sport.

8. **Girls play the boys' format a year older.** For example, Girls U11
   plays 9v9, like mixed U10.

   → The team overrides cover this. There is no separate girls' age
   table in v1.

9. **Team sheets live in Dribl (NSW, VIC) and Squadi (QLD, Northern
   NSW), not PlayHQ.** Neither records live subs, and no public API was
   found.

   → `PLAYHQ_TENANT` is null, as for rugby, and import is hidden. Later,
   a "Copy team sheet" button (starters, bench, keeper, jersey numbers)
   to paste into Dribl.

10. **Restarts, retreat lines, offside and heading are help text, not
    logic.** All of these vary:
    - kick-ins or throw-ins;
    - a retreat of 5 m, 10 m or to halfway;
    - offside from 9v9 in some associations;
    - heading: no national rule yet (an expert group is reviewing it,
      and the players' union, the PFA, wants a ban for under-12s).

    → How we play shows these as law notes, nothing more.

11. **"Football" is ambiguous.** To Football Australia it means soccer;
    to Siren it has meant AFL. The AFL brand is "Siren Footy", and the
    `why-siren` page says "Junior football" for AFL and pitches Siren as
    "not adapted from a soccer subs app"
    (`src/app/(marketing)/why-siren/page.tsx:156`).

    → The sport's name is **Football (soccer)** and its short name is
    **Football** (decided).
    - The code id is `soccer`, so it can't be confused with AFL in the
      code.
    - Wherever both sports appear (the setup wizard, the homepage
      picker, Help, the demo), AFL is labelled "AFL", never "football".
      Rewrite the `why-siren` paragraph.

12. **No cards at MiniRoos.** Macarthur suggests a 5-minute sit-out
    instead.

    → Later, a "sit out 5 min" hold. Not in v1.

## The engine

Soccer is a new family: `SportFamily` gains `"soccer"`, with an
`isSoccer()` check in the registry beside `isRugby()`. Following
`.planning/RUGBY-UNION-PLAN.md`'s rule (shared code, never shared
rules), every rule, word and default comes from soccer's own config.

### What soccer shares

CLAUDE.md lists the shared chrome. Soccer consumes it verbatim:
- the live bars: `LiveTopBar`, `LiveStickyScoreBar`,
  `LiveAdminUtilityRow`;
- live actions and banners: `ScoreRecordingDock`, `SubDueBanner`,
  `ManualEndQuarterConfirm`, `StartQuarterModal`, `ClockMenu`;
- sideline modals: `LockModal`, `LateArrivalMenu`,
  `InjuryReplacementModal`;
- the lineup picker's chrome: `LineupPickerBreadcrumb`,
  `LineupPickerFooter`;
- hints and walkthroughs: `LongPressHint`, `WalkthroughModal`;
- the `sf/*` primitives.

It also uses the sport-agnostic helpers:
- `src/lib/live/`: `periodClock`, `periodPhase`, `subDistribution`,
  `subCadence`, `breakDraft`, `reconcileLineupToAvailability`,
  `presentPlayers`, `scoreUndo`, `locks`;
- `src/lib/playbook/`: `rules`, `ruleCheck`, `seasonBalance`,
  `rollup`.

Where soccer does what AFL does, it matches AFL, the reference:
- the bench is AFL's `grid-cols-4`;
- tiles mirror `PlayerTile`'s row order (or reuse it if its props allow);
- the score bug matches AFL's tokens, columns and badge positions, with
  the chip from `SCORE_CHIP`.

### What soccer owns

- **The lineup:** a keeper slot, a record of lines, the bench, and
  optional named slots. Roughly
  `{ keeper: string | null; lines: Record<SoccerLine, string[]>; bench: string[]; slots? }`.
  - The lines are `def`, `mid` and `att`, labelled Defence, Midfield
    and Attack.
  - 4v4 has one line, `field`, and no keeper.
  - Keeping lines as a record leaves room for hockey or futsal to join
    the family later.
- **The engine** (`src/lib/sports/soccer/`):
  - **replay:** events to per-player minutes in each line and in goal;
  - **suggesters:**
    - the starting lineup;
    - the next rolling sub;
    - a window's batch;
    - the half-time plan, including keeper turns;
  - **the lineup validator.**
- **Events reuse existing types where the meaning matches:**
  - `swap` for a sub;
  - `field_zone_swap` for moving an on-field kid between lines or into
    goal;
  - `player_lock` for the keeper hold;
  - `goal` and `opponent_goal`, plus the core eight every sport has.

  So the migration only adds `sport_event_types` rows, with no new
  event type.
- **The live UI** goes in a new `src/components/soccer/`:
  - `SoccerLiveGame`;
  - `SoccerPitch`, drawn at 4, 7, 9 and 11 a side, with the keeper in
    the goal mouth;
  - `SoccerLineupPicker`;
  - `SoccerScoreBug`;
  - the summary card and full-time review, mirroring AFL's.

  Half-time is handled inline, as rugby does it, with the shared
  `StartQuarterModal` and the keeper handover card (below).
- **Server actions:** `soccer-actions.ts`, registered in
  `registerLiveActions` and `writeQueue`.
- **Route forks:**
  - `live/page.tsx`;
  - `stats`;
  - `run/[token]` and its lineup page;
  - game detail;
  - settings;
  - `dashboard/actions.ts`.

## The goalkeeper

- **A slot, not a line.** From U8 the lineup has one keeper, drawn in
  the goal mouth apart from the lines.
- **Held for the half.** Starting a half puts a "Keep in goal" hold on
  the keeper (a `player_lock` with `position: "gk"`). The sub suggester
  and sub-due banner never take the keeper off; rolling subs fill
  outfield lines only.
- **Changing keeper mid-half** is a deliberate action from `LockModal`
  ("Swap keeper"): pick who goes in, from the field or the bench. An
  injured keeper goes through `InjuryReplacementModal`, with a "who goes
  in goal?" step.
- **Half-time plans the next keeper:** "Keeper top: Sam → Mia". The
  default depends on age:
  - **U8–U11, "Everyone has a turn"** (decided):
    - one keeper per half, changed at half-time;
    - the suggester picks the kid with the fewest keeper minutes this
      season, and skips kids marked "not in goal";
    - last half's keeper goes out into the field.
  - **U12 and up, "Keepers"** (decided): the coach names one or more
    keepers, and the suggester rotates among them.

  The coach can switch strategy at any age in How we play.
- **A shared handover card.** League's `VestAssignmentCard` does the
  same job: one kid per period, handed over at the break. Extract it
  into a shared card in `components/quarter-break/` that both league's
  vests and soccer's keeper use. CLAUDE.md asks for a shared primitive
  when the seam is this wide.
- **Fairness.** Keeper minutes are tracked apart from outfield minutes.
  They show in season balance, stats and the game report, and still
  count as game time. Each kid can be marked "keen keeper" or "not in
  goal" (`player_position_prefs`). An optional cap, "at most N halves
  in goal per game", is off by default.

## Formations and positions

- **Formations come from config.** Soccer's config lists formations for
  each size, and each gives line sizes. The coach picks one in How we
  play; the shape carries from one half to the next.

  | Size | Keeper | Default | Also |
  |------|--------|---------|------|
  | 4 | No | No lines: minutes only (decided) | — |
  | 7 | Yes | 2-3-1 | 3-2-1 |
  | 9 | Yes | 3-3-2 | 3-2-3 |
  | 11 | Yes | 4-3-3 | 4-4-2 |

- **Named positions** use soccer's own catalogue: LB, CB, RB, LM, CM,
  RM, LW, RW, ST.
  - 7v7 uses lines only.
  - Named positions are offered from 9v9 and recommended at 11v11.
  - They're stored in `team_positions`, so coaches can rename them.
- **Lines in the database.** Soccer's `sport_lines` rows are `gk`,
  `def`, `mid`, `att` and `field`. The trigger checks each team's rows
  against its own sport.

## Phases

Work on a branch. Each phase lands as small commits, with the tests
CLAUDE.md asks for. Coaches can't pick soccer until phase 2 is done.

### 1. The sport and its engine (no UI)

- **Ids:**
  - add `soccer` to `SportId` / `Sport` (both copies), and `"soccer"`
    to `SportFamily`;
  - add `isSoccer()` to the registry;
  - the compiler then lists the ~13 `Record<Sport, …>` maps, and
    `noSportBranch` lists the dispatchers.
- **`src/lib/sports/soccer/index.ts`:**
  - the age table above, with `teamSong: false`, `jerseyNumbers: true`;
  - score types: goal 1, opponent goal 1;
  - keeper strategy, formations and sub mode per age.
- **Migration 0068** (`0066` is the template):
  - widen `teams_sport_check`;
  - add `sport_event_types` rows;
  - add `sport_lines` rows.
- **The engine:** the lineup type and validator, replay, minutes per
  line and in goal, and the suggesters, all pure and unit-tested.
- **Sub windows:** "windows per half" and the final-minutes cutoff in
  the shared `subDistribution.ts`.

Done when the engine's unit tests pass, the cross-sport guards
(`sportBranches`, `sportFamily`, `sportInvariants`) include soccer, and
`tsc` is clean.

### 2. The live game

- **Before kick-off:** `SoccerLineupPicker`, `SoccerPitch` at every
  size, tiles and the bench.
- **During the game:**
  - `SoccerLiveGame`;
  - rolling subs and windows;
  - the keeper hold, "Swap keeper" and the injured-keeper path;
  - `SoccerScoreBug` (+G and opponent goal, with the scorer picker);
  - late arrivals, lending and injury, all through the shared modals.
- **Half-time:** the plan and the shared keeper handover card.
- **Full time:** the review and summary card.
- **Plumbing:** `soccer-actions.ts`, the write queue, and the
  live-route and runner-route branches.

Done when a 7v7 game plays end to end on a phone, including a
half-time keeper change, and its e2e playthrough is green.

### 3. Every other surface

- **Setup and settings:** the setup wizard's sport pill, marked "Beta"
  (moved from phase 2; open to every coach), `createTeam` accepting
  soccer, `ScoringStep` copy, team settings (sub mode, windows,
  formation).
- **How we play:** soccer's playbook, with keeper strategies,
  formations and law notes.
- **Stats:** the stats dashboard, season balance and game report.
- **Help:** about 10 hand-written pages, plus a walkthrough steps file.
- **Marketing:**
  - `marketing-sports.ts`, brand JSON, CMS config and the homepage
    section;
  - `sport-fields/SoccerPitchField.tsx`;
  - the `why-siren` rewrite;
  - AFL labelled "AFL" wherever both sports appear.
- **Demo:** a soccer seed, and soccer in the demo picker.
- **CLAUDE.md:** add soccer to the sport list. It's already stale: it
  says three sports and misses union.

### 4. Tests and checks

- **Unit:**
  - the age table;
  - formations at each size;
  - the keeper suggester: fewest keeper minutes, skips "not in goal",
    last keeper plays out, rotates named keepers from U12;
  - the keeper hold surviving rolling subs;
  - windows and the cutoff;
  - soccer points;
  - isolation: soccer reads nothing from AFL (no "behind", no Auskick,
    no zones rule), and no other sport reads soccer.
- **E2E**, copying AFL's and union's:
  - a 7v7 full-game playthrough with a keeper change;
  - a 4v4 game with no lines and no keeper;
  - sideline combos (injure the keeper, lend, late arrival);
  - the half-time break;
  - `multi-sport-schema`;
  - scoring off by default at U9 and on at U12;
  - windows mode;
  - 375 px at 11v11.
- **Stagehand:** soccer game-day, sideline-chaos and whole-game
  missions, with seeds.

## Schedule (decided: start now, beta in summer comps)

| By | Done |
|----|------|
| Fri 30 Oct | Phase 1: config, migration, engine with unit tests |
| Fri 20 Nov | Phase 2: a full game playable end to end |
| Fri 4 Dec | Phases 3–4; beta opens to the coaches who asked |
| Dec–Mar | Beta through summer comps; fixes |
| Feb 2027 | Launch for winter registrations |

If the schedule slips, windows mode moves to after the beta: rolling
subs cover MiniRoos and Queensland.

## Still to confirm

- **Unverified research:**
  - the MiniRoos keeper-change rule;
  - WA metro junior rules;
  - whether VIC and SA play 11v11 from U14;
  - the label of FA's 291,864 junior participation figure.

## Out of scope for v1

- **NPL and representative rules:** limited subs, no re-entry.
- **US and UK presets:** AYSO's quarters and 50 % (some regions 75 %)
  floor, and the FA's 5v5/7v7. The engine handles quarters, so this is
  an age-table and copy job if overseas demand shows up.
- **Futsal:** parked as an option to add later (decided 17 Oct 2026).
  It would be an age table (5 a side, a keeper, rolling subs) on the
  soccer engine.
- **Dribl and Squadi export:** later, as "Copy team sheet".
- **Heading limits, retreat lines and offside:** law notes only.
- **The 5-minute sit-out.**

## Decided (17 Oct 2026)

1. **Engine:** soccer gets its own engine and family, not AFL's or
   rugby's. No AFL refactor.
2. **Name:** "Football (soccer)", short name "Football", code id
   `soccer`.
3. **Brand:** the main Siren brand, no domain of its own, as union.
4. **Age defaults:**
   - MiniRoos national up to U11;
   - U12–U13 9v9 at 2×30;
   - U14 11v11 at 2×35, U15–U17 at 2×40.

   The team overrides players on the field and half length.
5. **Keeper:** "Everyone has a turn" at U8–U11 (one per half, changed
   at half-time); "Keepers" from U12.
6. **Scores:** off by default up to U11, on from U12.
7. **Sub modes in v1:** rolling, plus windows per half.
8. **4v4:** no lines, minutes only.
9. **Game time:** equal time is the target, with a 50 % floor the coach
   can change.
10. **Timing:** start now, beta in summer comps from early December.

Later the same day, during the build:

11. **Beta access:** soccer is open to every coach, its setup pill
    marked "Beta", rather than flagged per account.
12. **Summer format:** the beta coaches play outdoor (7s, 9s or 11s),
    which the team overrides cover. Futsal is parked (see Out of scope).
13. **Phase 1's calls**, which the plan had left open, all accepted:
    - a side can play one or two short (U12–U13 up to 11 a side); a
      squad is the most on the field plus the plan's bench;
    - shapes for short sides (5, 6, 8 and 10 with a keeper);
    - the keeper follows the age group, not the size (a U7 side playing
      7 a side has no keeper unless the coach picks U8);
    - keeper ties: fewest keeper minutes, then a keen keeper, then the
      least time this game, then squad order;
    - last half's keeper plays out only under "Everyone has a turn";
    - with none of the named keepers at the game, everyone has a turn;
    - at kick-off the kids with the most season minutes start on the
      bench;
    - when the cutoff catches the last window, the windows pull in to
      end at the cutoff rather than one being dropped;
    - season balance weights 0.2 / 0.4 / 0.8 (light / balanced /
      strong);
    - every age defaults to rolling subs; windows mode starts from
      Tasmania's 3 a half, none in the last 2 minutes;
    - no `roster_shrink` event (a mid-game field shrink would need a
      migration row);
    - an injured kid leaves the field as in AFL, and their replacement
      takes their spot;
    - Football Victoria's three-lines rule is a warning, at U12–U13;
    - the setup wizard's default age is U10.

Built differently from the plan (phase 2):

- **No "Keep in goal" hold event.** The engine never subs the keeper
  off, so the keeper is held by the lineup's shape; a `player_lock` adds
  nothing. "Replace keeper" is the deliberate change.
- **The half-time plan lives in session storage** while the coach edits
  it, not the shared live store; Start commits it as one `lineup_set`,
  with anyone who arrived since added to its bench.

## Sources

Research done 17 Oct 2026.

- **MiniRoos national format:** FV MiniRoos Guidelines (Apr 2026)
  https://footballvictoria.com.au/sites/ffv/files/2026-04/MiniRoos_Guidelines_updated_290426.pdf
  and the national rules
  https://alburyunited.com.au/wp-content/uploads/2024/02/miniroos-all-ages-formats-rules.pdf
- **Association variants:**
  - Macarthur 2026: https://camdenfalcons.com.au/wp-content/uploads/2026/04/Macarthur-Football-Association-Mini-Roos-Rules-2026.pdf
  - BDSFA: https://bdsfa.com/wp-content/uploads/2024/11/BDSFA-MiniRoo-Rules-Book.pdf
- **U12+ by state:**
  - FQ 2026: https://footballqueensland.com.au/wp-content/uploads/2025/12/2026-Statewide-Rules-of-Competition.pdf
  - FSA 9v9: https://www.footballsa.com.au/sites/ffsa/files/2025-01/U12%20and%20U13%20-%209V9%20Playing%20Format%20%26%20Rules%202025.pdf
  - Football Tasmania subs: https://footballtasmania.com.au/sites/tas/files/2026-04/2026_match_duration_and_substitution_guidelines.pdf
  - NSFA U12: https://nsfa.asn.au/association-updates/changes-to-mixed-under-12-competitions/
- **Keeper changes:** IFAB Law 3 https://www.theifab.com/laws/latest/the-players/
- **Team sheets:**
  - Dribl (NSW): https://kb.footballnsw.com.au/kb/electronic-matchsheet-selections-fnswcupcomps-dribl-app/
  - Squadi (Northern NSW): https://northernnswfootball.com.au/sites/nnswf/files/2024-04/referee-help-guide-live-scoring-referee-accepting-scores.pdf
- **Heading:** ABC, 2 Jul 2026 https://www.abc.net.au/news/2026-07-02/football-heading-the-ball-risks-cte-concussion/106865326
- **Participation:**
  - FA 2025 report: https://footballaustralia.com.au/sites/default/files/2026-02/4371%20Participation%20Report%202025.pdf
  - MiniRoos 2023: https://footballaustralia.com.au/news/football-australia-and-milo-team-leading-grassroots-partnership
  - Auskick: https://www.afl.com.au/news/1459318
- **Competitors:**
  - SubTime: https://apps.apple.com/us/app/-/id1248650528
  - SubNow: https://apps.apple.com/us/app/subnow-player-rotation-timer/id1147153746
  - Rookie Me Play: https://www.rookieme.com/play/features/
