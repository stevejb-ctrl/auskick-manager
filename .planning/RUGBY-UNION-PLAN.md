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
- `brands/union.json`, plus union copy in `brand-copy.ts`,
  `marketing-copy.ts` and `manifest.ts`.

**Age table.** Team sizes from U10 up are confirmed: U10–U11 play 12 a
side, U12 and up 15 a side. The rest is a draft from Sydney Junior
Rugby Union's pathway page and needs confirming:

| Age | Players | Format | Halves | Kicking | Conversions |
|-----|---------|--------|--------|---------|-------------|
| U6  | 5 (draft) | TriTag | 2×10 min (skills) | No | No |
| U7  | 6 (draft) | TriTag | 2×15 min | No | Optional, in front |
| U8  | 7 (draft) | Tackle | 2×15 min | Yes | Yes, inside the 15 m line |
| U9  | 10 (draft) | Tackle | 2×20 min | Yes | Yes |
| U10–U11 | **12** | Tackle | 2×20–25 min (TBC) | Yes | Yes |
| U12+ | **15** | Tackle; Australian U19 law variations from U13 | TBC | Yes | Yes |

The column alignment on that page was ambiguous, and Brisbane runs
U6–U7 as 7-a-side non-contact, so U6–U9 and the half lengths still need
confirming before they're coded.

### 3. The field and positions for 15

- `fieldFormation.ts` `getFieldSlots` tops out at 13. A 15-a-side union
  team (U12 and up) would hide two kids. Add union layouts for 15 and
  12 a side (U10–U11) first, then the smaller junior sizes. Forwards
  and backs per size: 8/7 at 15; 12 a side to confirm (6/6 likely).
- `LeagueField` draws league markings. Give it a sport prop, or a small
  `RugbyField` wrapper, for union's 22 m and 10 m lines. Keep one
  component.
- Union position names for How we play's named positions: loosehead and
  tighthead prop, hooker, locks, flankers, number 8, halfback,
  five-eighth, inside and outside centre, wingers, fullback. The
  current set stops at league's 6 forwards and 7 backs with NRL names.

### 4. The live game

Mostly configuration once phase 1 is in:

- **Score bug:** +T / +C / +PG / +DG. Show PG and DG only where union
  kicks for goal, via the `goalsFromPlay` knob.
- **No vest card, prompt or badge** (already gated).
- **Kickoffs and conversions:** league's junior kickoff (§16) and
  conversion (§15) rotations are league laws. Off for union unless the
  state's junior laws have an equivalent (open question).
- **No unbroken-period rule** unless union has one; the How we play
  game-time floor still applies.
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

## Open questions

1. **Whose junior laws?** NSW (SJRU), Queensland (BJRU), or Rugby
   Australia's national pathway? The formats differ by state, mainly at
   U6–U9.
2. **U6–U7 TriTag:** keep score? League U6–U7 doesn't.
3. **Brand:** its own domain like `sirenleague.com.au`, or under the
   main Siren brand?
4. **Kicking fairness:** do junior union laws rotate kick-offs or
   conversion kickers? If not, union has no kick cycles.
5. **Game-time rules:** does the union have a minimum-game-time policy
   (league's is the unbroken-period rule)? Siren's default 50 % floor
   would apply otherwise.
6. **Interchange:** rolling and unlimited at every junior age?

## Size and order

Phase 1 is about half the work. It touches the most files and carries
the regression risk, so it should go alone, with the league suites
green after each commit. Phases 2–4 are mostly data and small
components. Phase 5 is breadth, not depth. A union team could be
playable end to end after phases 1–4, with phase 5 to launch.
