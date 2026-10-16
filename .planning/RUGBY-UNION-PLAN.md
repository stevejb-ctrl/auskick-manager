# Junior Rugby Union: plan (14 Oct 2026)

Add junior rugby union as a fourth sport. It plays like rugby league in
Siren — two lines (forwards and backs), rolling subs, halves, tries and
conversions — but has no First Receiver or Dummy Half vests, different
point values, a drop goal instead of a field goal, and 15 a side at the
top.

**Approach: one rugby engine with two rule sets, not a copy of league.**
CLAUDE.md asks for shared components wherever the rule is the same, and
almost all of league's ~9k lines of live-game UI and ~2.5k lines of
replay and fairness apply to union unchanged. What stops union being "a
config" today is that the code knows only one rugby by name: about 25
`sport === "rugby_league"` checks, some falling back to AFL and some to
league, and point values written into the replay. Fix that first, with
league's tests as the safety net, and union becomes mostly data.

**Sports are independent (14 Oct 2026).** Shared code, never shared
rules:

- Every rule, default, word and list a team sees comes from that team's
  own sport config.
- Nothing falls back to another sport. A missing or unknown sport is an
  error, not AFL. Today a dozen-plus places fall back to AFL; phase 1
  removes them.
- Union and league share the rugby engine's code, but union's config
  states every rule itself (no vests, no kick rotations, no
  unbroken-period rule, its own positions, its own points). It inherits
  no values from league.
- Data is checked against the team's own sport: position lines, roles,
  rule packs, and the source text of locked rules. Today these read
  "AFL junior rules" and "NRL junior laws"; union's will read Rugby
  Australia's pathway.
- Isolation tests per sport: a union team's How we play, rule packs,
  strategies, positions and copy contain nothing from AFL or league,
  and the same for each other sport.

## What already works for union

- **Vests switch off cleanly.** League U6–U7 and U13+ have no vests, and
  nearly every vest surface is gated on the age group's
  `vestRequirements` (vest card, live game, lineup picker, field
  formation, suggesters, rule check). Union age groups just leave it out.
- **Event types.** `try`, `opponent_try`, `conversion_attempt`,
  `penalty_goal` and their opponent forms already exist. A drop goal can
  reuse `field_goal` (labelled "DG"), so no event-type migration.
- **Sport-agnostic pieces.** Game defaults, sub intervals, How we play
  storage (`player_position_prefs` takes any line key), rollups,
  notifications, RLS (no policy branches on sport).
- **Marketing.** `marketing-sports.ts` already lists union as coming
  soon, with a `RugbyUnionField` drawing on the landing page.

## Phases

Each phase lands as small commits, with the tests CLAUDE.md asks for.

### 1. Make rugby a family (refactor, no behaviour change)

The biggest piece, and the one that makes the rest small.

- **One way to ask "is this rugby?"** Add `family: "rugby"` (or
  `isRugby(sport)`) to the sport config and replace the ~25
  `=== "rugby_league"` checks. Today a union team would fall back to
  AFL on the live page, runner page, stats, results (goals × 6), game
  plan and settings, and to league elsewhere.
- **Thread the team's sport through the league path.** Several places
  hard-code league inside it:
  - `league-actions.ts` `leagueAgeConfig()` (would check union teams
    against league ages);
  - event metadata (`sport: "rugby_league"` in ~18 inserts);
  - `rugby_league/playbook.ts` and `engine.ts`;
  - `game-plan/project.ts`, `playbook/planInputs.ts`;
  - the live and runner pages' `getAgeGroupConfig("rugby_league")`.
- **Points from config.** `replayLeagueGame` and `leagueScoreByPeriod`
  hard-code try 4 / conversion 2 / penalty 2 / field goal 1. Pass a
  points table, built from the sport's `scoreTypes`, which nothing reads
  at runtime today.
- **Split `internationalLaws`.** It currently switches on goals from
  play, and switches off kick rotations, the unbroken-period rule and the
  vest card, and picks the recommended strategy. Give each its own knob:
  `goalsFromPlay`, `kickRotations`, `unbrokenPeriods`,
  `recommendedStrategy`. Union needs goals from play at junior ages
  without the rest.
- **Rename for the family** only where it's cheap and clear (e.g. a
  `rugby/` folder re-exporting today's league modules). Don't churn
  component names for its own sake.

Done when every league unit and e2e test passes unchanged and
`tsc` is clean. That proves the refactor is behaviour-neutral.

### 2. The union sport

- `SportId` / `Sport`: add `rugby_union`. Both copies live in
  `src/lib/sports/types.ts` and `src/lib/types.ts`. The typed
  `Record<Sport, …>` maps (registry, rollup, season balance, brand copy,
  How we play card, manifest) will fail to compile until filled in: a
  ready-made checklist.
- `src/lib/sports/rugby_union/index.ts`: the age table, the score
  types, the lineup validator (forwards/backs counts per size) and the
  config, mostly reusing league's.
- **Scoring:** try 5, conversion 2, penalty goal 3, drop goal 3.
- **Migration:** widen `teams_sport_check`. Also decide what the 0043
  `seed_rugby_league_position_chips` trigger should do for union (extend
  it, or leave chips to How we play, which replaced them).
- **Brand:** union lives under the main Siren brand, with no domain or
  brand file of its own.
  - Every `SportConfig` carries a `brand`, so union's points at the
    main brand rather than reserving a host like league's
    `sirenleague.com.au`.
  - `getBrandForHost` never resolves to union.
  - Union is a sport you pick on the main site and in the setup wizard.
  - Union still needs entries in the typed per-sport maps
    (`brand-copy.ts`, `manifest.ts`), but they reuse the main brand's
    copy and palette. `marketing-copy.ts` gets a union section for the
    sport page.

**Age table: the national pathway by default, the team can override.**
Each age defaults to Rugby Australia's Kids Pathway (NSW and WA play it
as is). The allowed range covers what other states play, so a coach
picks their competition's size when setting up the team:

| Age | Default players | Range (who plays the variant) | Format | Default halves | Scores by default |
|-----|-----------------|-------------------------------|--------|----------------|-------------------|
| U6  | 7 | 5–7 (Sydney TriTag 5) | Tag | 2×10 min | No |
| U7  | 7 | 6–7 (Sydney TriTag 6) | Tag | 2×15 min | No |
| U8  | 7 | 6–7 | Tackle | 2×15 min | No |
| U9  | 10 | 7–10 | Tackle | 2×20 min | No |
| U10 | 12 | 10–15 (Victoria 10, Brisbane 15) | Tackle | 2×20 min | No |
| U11 | 12 | 10–15 (Brisbane 15, Victoria 12 or 15) | Tackle | 2×20 min | No |
| U12 | 15 | 12–15 (Victoria 12 or 15) | Tackle | 2×25 min | Yes |
| U13–U14 | 15 | 12–15 | U19 law variations | 2×25 min | Yes |
| U15–U16 | 15 | 12–15 | U19 law variations | 2×30 min | Yes |
| U17–U18 | 15 | 12–15 | U19 law variations | 2×35 min | Yes |

The minimums follow WA's (10 at U10–U11, 12 from U12), so short squads
can still start. Half lengths are Hunter's (NSW, 2025) from U10 up and
Sydney's below. The national pathway bars ladders up to U12, and WA
keeps none before U12, so scores default off to U11 (the team's Track
scoring switch still turns them on). Sources and the state-by-state
comparison are in the chat of 14 Oct 2026. The 2026 national junior law
pilot (U8–U15) changes how tackles, scrums and lineouts are refereed,
none of which Siren records.

**The team-level override (all sports, not just union).** Half length
already has one: `teams.quarter_length_seconds`, where NULL means the
age default, set in team settings. On-field size doesn't. Every new
game takes the age default from `newGameDefaults`, and only that game
can change it. Add the same pattern:

- Migration: `teams.on_field_size integer null`. NULL means the age
  default. No CHECK, so the range lives in config, as with quarter
  length.
- `newGameDefaults(sport, ageGroup, team)` uses the team's override
  when set. All three game-creation paths (coach form, PlayHQ import,
  nightly sync) go through it.
- **Setup wizard:** the Basics step shows "Players on the field" and
  "Half length", prefilled with the national defaults, with a line
  explaining that competitions differ by state. Team settings gets the
  same two fields (half length is already there).
- Clamp to the age's min–max, and re-clamp if the coach changes the
  age group.
- A game can still go up or down on the day, as now (the per-game
  setting is untouched).
- Tests: the wizard saves the override, a new game picks it up, and
  changing the age re-clamps it.

This lands in phase 2, but it works for every sport. An AFL or netball
coach whose league plays a different size gets it too.

### 3. The field and union positions

- `fieldFormation.ts` `getFieldSlots` tops out at 13. A 15-a-side union
  team (U12 and up) would hide two kids. Add union layouts for every
  size in the ranges above (5 to 15). Forwards and backs per size,
  from Hunter's by-laws: 10 is 5/5, 11 is 5/6, 12 is 6/6, 13 is 6/7,
  14 is 8/6, 15 is 8/7. Smaller sizes: 7 is 3/4 and the others about
  half (decided 16 Oct 2026).
- `LeagueField` draws league markings. Give it a sport prop, or a small
  `RugbyField` wrapper, for union's 22 m and 10 m lines. Keep one
  component.
#### Union positions (their own catalogue, not league's)

League's named positions come from `leagueCatalogue` in
`rugby_league/playbook.ts`: NRL names (PR, HK, 2R, LK, HB, 5/8, CE, WG,
FB), filled in a fixed order, topping out at 6 forwards and 7 backs.
Union needs its own catalogue, and a sport-aware lookup in place of the
direct `leagueCatalogue` calls.

The full side, numbered as on the jersey, in Australian terms:

| No. | Short | Name | Line |
|-----|-------|------|------|
| 1 | LHP | Loosehead prop | Forwards |
| 2 | HK | Hooker | Forwards |
| 3 | THP | Tighthead prop | Forwards |
| 4 | LK | Lock (second row) | Forwards |
| 5 | LK | Lock (second row) | Forwards |
| 6 | BF | Blindside flanker (breakaway) | Forwards |
| 7 | OF | Openside flanker (breakaway) | Forwards |
| 8 | N8 | Number 8 | Forwards |
| 9 | HB | Halfback (scrum-half) | Backs |
| 10 | FE | Five-eighth (fly-half) | Backs |
| 11 | LW | Left wing | Backs |
| 12 | IC | Inside centre | Backs |
| 13 | OC | Outside centre | Backs |
| 14 | RW | Right wing | Backs |
| 15 | FB | Fullback | Backs |

**Same words, different positions.** These clash with league, so labels
carry the jersey number and the keys are union's own (`ru-…`), never
league's:

- **Lock:** league's is the 13 at the back of the scrum; union's are
  4 and 5, the second row. Some Australian junior documents (Hunter's
  by-laws) still call union's 8 "lock".
- **Halves:** league's halfback and five-eighth wear 7 and 6; union's
  wear 9 and 10.
- **Second row:** league's 11 and 12 (back-rowers by role); union's
  second row is the locks, 4 and 5.

**Which positions play at each size.** From Hunter's by-laws (10 to 14)
and the full side (15):

| Players | Forwards | Backs |
|---------|----------|-------|
| 10 | 1, 2, 3, 4, 5 | 9, 10, 12, 13, 15 |
| 11 | 1–5 | 9, 10, 11, 12, 13, 15 |
| 12 | 1–5, 8 | 9, 10, 11, 12, 13, 15 |
| 13 | 1–5, 8 | 9–15 |
| 14 | 1–8 | 9, 10, 11, 12, 13, 15 |
| 15 | 1–8 | 9–15 |

Below 10 (U6–U9: 7 a side, tag up to U7) named positions stay off, as
league's do below U10. Kids play forwards or backs, with tiles showing
F or B. If a 7-a-side split is ever wanted, sevens uses 1, 2, 3 and
9, 10, 12, 15 (to confirm).

**Where it shows up:**
- `unionCatalogue(onFieldSize)` mirrors `leagueCatalogue`, driven by
  the table above instead of league's fill order. It gives each
  position a key, short label, name, line and x/y.
- Named positions are offered from U10 (12 a side) up, as for league.
  "Preferred line" stays the recommended strategy at U10–U11, and named
  positions from U12 (15 a side) (decided 16 Oct 2026).
- The field, tiles, role sheet, How we play roles ("home" and "also
  plays"), the rule check, stats by position and season balance all
  read positions through the catalogue, so they pick union's up once
  the lookup is sport-aware.
- `team_positions`, where coaches rename positions, has
  `CHECK (line in ('back', 'mid', 'fwd'))`: AFL's lines, for every
  sport. Don't widen that list. Check each row against its own team's
  sport instead: a trigger that looks up `teams.sport` and accepts only
  that sport's lines (AFL `back/mid/fwd`; league and union
  `forwards/backs`). Do the same for `player_position_prefs.line`, plus
  the matching server-side check from the sport config. A union coach
  can then rename "Lock" to "Second row", and an AFL line can never be
  saved on a rugby team, or the reverse.
- Tests:
  - unit: the catalogue at each size (10–15) gives the positions in the
    table, with the right lines;
  - e2e: a union U10 lineup at 12 a side shows N8 and no flankers, and
    U12 at 15 shows all fifteen;
  - a role saved as union "LK" never reads as league's lock.

### 4. The live game

Mostly configuration once phase 1 is in:

- **Score bug:** +T / +C / +PG / +DG. Show PG and DG only where union
  kicks for goal, via the `goalsFromPlay` knob.
- **No vest card, prompt or badge** (already gated).
- **No kick rotations.** League's junior kickoff (§16) and conversion
  (§15) cycles are league laws; union has neither. Union age groups set
  the phase-1 `kickRotations` knob off, so there's no kickoff picker
  and no "whose turn to convert". A conversion or goal still records
  who kicked it, as a scorer.
- **No unbroken-period rule.** Union has no minimum-game-time law, so
  union age groups set the phase-1 `unbrokenPeriods` knob off. The How
  we play game-time floor applies at its default of 50 %, which the
  coach can change as for any sport.
- Walkthrough copy and the full-time review read the sport's words and
  points.

### 5. Every other surface

- **Setup wizard:** a fourth sport pill (the grid is `sm:grid-cols-3`)
  and the default age.
- **Copy with points written in:** `ScoringStep`, Help (track scoring,
  rotations), the walkthrough steps.
- **Stats:** `LeagueDashboardShell` shows FR/DH columns whenever
  `!internationalLaws`, already wrong for league U6/U7. Gate them on
  `vestRequirements`.
- **Runner link pages:** pass the sport through, so union doesn't fall
  back to AFL.
- **PlayHQ import:** union competitions mostly use Rugby Xplorer, not
  PlayHQ (and the importer sends `tenant: afl` for every sport). Hide
  import for union at first.
- **Demo:** a union seed, union in the demo allow-list (it maps to AFL
  today), and remove `comingSoon`.

### 6. Tests and checks

- **Unit:** union replay points, the age table, lineup validation at
  each size, the 15-a-side formation.
- **E2E**, copying the league ones:
  - a union full-game playthrough;
  - sideline combos (injure, lend, late arrival);
  - the break;
  - `multi-sport-schema` for union team creation;
  - a 375 px layout check at 15 a side.
- `demo-picker.spec.ts` asserts union is disabled; it changes when the
  demo opens.
- **Stagehand:** union versions of the gameday, sideline-chaos and
  whole-game missions, with seeds.

## Decided

- **Laws:** Rugby Australia's national pathway by default; the coach
  can override players on the field and half length when setting up
  the team (14 Oct 2026).
- **Scores:** off by default to U11, as the pathway has no ladders up
  to U12. The team's Track scoring switch turns them on.
- **Interchange:** unlimited rolling subs at every junior age (Hunter
  2025, WA 2023): Siren's rolling-sub model as is.
- **Brand:** under the main Siren brand, no domain of its own
  (14 Oct 2026).
- **Kicking:** no kick rotations; kickers are recorded only as scorers.
- **Game time:** no minimum-game-time law; the How we play 50 % floor
  applies by default.
- **Conversions** from U8; U6–U7 play tag, with no kicking (16 Oct
  2026).
- **Penalty and drop goals** count from U10 (16 Oct 2026).
- **Forwards below 10 a side:** 7 plays 3/4, the others about half
  (16 Oct 2026).
- **Squads:** 12 at U6–U8, 16 at U9, 22 at U10–U11, 23 from U12 (16 Oct
  2026).
- **Named positions** offered from U10, recommended from U12; preferred
  line is recommended at U10–U11 (16 Oct 2026).

Nothing is left open; phase 1 can start.

## Size and order

Phase 1 is about half the work. It touches the most files and carries
the regression risk, so it should go alone, with the league suites
green after each commit. Phases 2–4 are mostly data and small
components. Phase 5 is breadth, not depth. A union team could be
playable end to end after phases 1–4, with phase 5 to launch.
